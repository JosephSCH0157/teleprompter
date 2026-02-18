import { computeLineSimilarityFromTokens, normTokens, type MatchResult } from '../../speech/matcher';
import { speechStore } from '../../state/speech-store';
import { getAsrSettings } from '../speech/speech-store';
import { ensureAsrTuningProfile, getActiveAsrTuningProfile, onAsrTuning, type AsrTuningProfile } from '../../asr/tuning-store';
import {
  applyCanonicalScrollTop,
  describeElement,
  getRuntimeScroller,
  getPrimaryScroller,
  resolveViewerRole,
  getScriptRoot,
  resolveActiveScroller,
} from '../../scroll/scroller';
import { getAsrBlockElements } from '../../scroll/asr-block-store';
import { isSeekAnimationActive, seekToBlockAnimated } from '../../scroll/scroll-writer';
import { shouldLogScrollWrite } from '../../scroll/scroll-helpers';
import {
  areAsrThresholdsDirty,
  getAsrDriverThresholds,
  setAsrDriverThresholds,
} from '../../asr/asr-threshold-store';
import { bootTrace } from '../../boot/boot-trace';
import { shouldLogLevel, shouldLogTag } from '../../env/dev-log';

// ASR Training rule: matching should be permissive; committing should be conservative.

type DriverOptions = {
  /** Minimum forward line delta before issuing a seek. */
  minLineAdvance?: number;
  /** Minimum milliseconds between seeks (throttle) */
  seekThrottleMs?: number;
  /** Scale applied to the confidence threshold when processing interim results (values >1 tighten). */
  interimConfidenceScale?: number;
  /** Stable ASR run key passed by lifecycle owner to dedupe duplicate driver summaries. */
  runKey?: string;
};

type TranscriptDetail = {
  matchId?: string | null;
  match?: MatchResult;
  source?: string;
  meta?: boolean;
  noMatch?: boolean;
  currentIdx?: number | null;
};

type PendingMatch = {
  line: number;
  conf: number;
  isFinal: boolean;
  hasEvidence: boolean;
  snippet: string;
  minThreshold?: number;
  forced?: boolean;
  forceReason?: string;
  consistency?: { count: number; needed: number };
  relockOverride?: boolean;
  relockReason?: string;
  relockSpan?: number;
  relockOverlapRatio?: number;
  relockRepeat?: number;
  matchId?: string;
  requiredThreshold?: number;
  topScores?: Array<{ idx: number; score: number }>;
  recoveryDetails?: {
    delta: number;
    sim: number;
    streak: number;
    debt: number;
  };
  tieGap?: number;
  stickinessApplied?: boolean;
  cursorLine?: number;
  searchWindowFrom?: number;
  searchWindowTo?: number;
  lostMode?: boolean;
  cueBridgeNudgeDelta?: number;
};

type AsrEventSnapshot = {
  ts: string;
  currentIndex: number;
  lastLineIndex: number;
  bestIdx: number;
  sim: number;
  isFinal: boolean;
  snippet: string;
  matchId?: string;
};

type EvidenceEntry = {
  ts: number;
  text: string;
  isFinal: boolean;
};

type LagSample = {
  ts: number;
  delta: number;
  sim: number;
  nearMarker: boolean;
  inBand: boolean;
};

type ConsistencyEntry = {
  ts: number;
  idx: number;
  delta: number;
  sim: number;
  nearMarker: boolean;
  isFinal: boolean;
};

type ConsistencyResult = {
  ok: boolean;
  count: number;
  needed: number;
  minDelta: number;
  maxDelta: number;
  minSim: number;
  spread: number;
  nearOk: boolean;
};

type AsrBlockCorpusEntry = {
  blockId: number;
  startLine: number;
  endLine: number;
  textNorm: string;
  tokens: string[];
};

type AsrBlockMatch = {
  blockId: number;
  conf: number;
  startLine: number;
  endLine: number;
  textNormSample: string;
};

type AsrCommit = {
  forced: boolean;
  lineIdx: number;
  blockId: number;
  fromTop: number;
  targetTop: number;
  nextTargetTop: number;
};

type ViewerRole = 'main' | 'display';

type AsrCommitMoveDeps = {
  scroller: HTMLElement;
  writerAvailable: boolean;
  role: ViewerRole;
  path: string;
};

type AsrMoveResult = {
  method: 'writer' | 'pixel';
  writerCommitted: boolean;
  beforeTop: number;
  afterTop: number;
  movedPx: number;
};

type CueBridgeSkipReason = 'blank' | 'cue' | 'note' | 'speaker';

export type AsrScrollDriverStats = {
  lastIngestAt: number;
  lastCommitAt: number;
  commitCount: number;
  eventsSinceCommit: number;
  finalsSinceCommit: number;
};

export interface AsrScrollDriver {
  ingest(text: string, isFinal: boolean, detail?: TranscriptDetail): void;
  dispose(): void;
  setLastLineIndex(index: number): void;
  getLastLineIndex(): number;
  getStats(): AsrScrollDriverStats;
}

const DEFAULT_MIN_LINE_ADVANCE = 1;
const DEFAULT_SEEK_THROTTLE_MS = 120;
const DEFAULT_INTERIM_SCALE = 1.15;
const DEFAULT_MATCH_BACKTRACK_LINES = 2;
const DEFAULT_MATCH_LOOKAHEAD_LINES = 50;
const DEFAULT_MATCH_LOOKAHEAD_STEPS = [DEFAULT_MATCH_LOOKAHEAD_LINES, 120, 200, 400];
const DEFAULT_LOOKAHEAD_BUMP_COOLDOWN_MS = 2000;
const DEFAULT_LOOKAHEAD_BEHIND_HITS = 2;
const DEFAULT_LOOKAHEAD_BEHIND_WINDOW_MS = 1800;
const DEFAULT_LOOKAHEAD_STALL_MS = 2500;
const DEFAULT_BAND_BACK_TOLERANCE_LINES = 1;
const DEFAULT_SAME_LINE_THROTTLE_MS = 90;
const DEFAULT_CREEP_PX = 10;
const DEFAULT_CREEP_NEAR_PX = 8;
const DEFAULT_CREEP_BUDGET_PX = 56;
const DEFAULT_DEADBAND_PX = 32;
const DEFAULT_MAX_VEL_PX_PER_SEC = 470;
const DEFAULT_MAX_VEL_MED_PX_PER_SEC = 170;
const DEFAULT_MAX_VEL_CATCHUP_PX_PER_SEC = 240;
const DEFAULT_MAX_ACCEL_PX_PER_SEC2 = 800;
const DEFAULT_MIN_STEP_PX = 6;
const DEFAULT_MAX_STEP_PX = 10;
const DEFAULT_CATCHUP_MED_MIN_PX = 80;
const DEFAULT_CATCHUP_FAST_MIN_PX = 250;
const DEFAULT_MAX_TARGET_JUMP_PX = 180;
const DEFAULT_MAX_TARGET_JUMP_HYBRID_PX = 80;
const DEFAULT_PURSUE_KP = 3.2;
const DEFAULT_PURSUE_MANUAL_CANCEL_PX = 48;
const DEFAULT_NO_TARGET_RETRY_SIM = 0.9;
const DEFAULT_NO_TARGET_RETRY_MAX_DELTA = 6;
const DEFAULT_NO_TARGET_RETRY_FRAMES = 2;
const DEFAULT_LINE_MISSING_LOOKUP_FRAMES = 2;
const DEFAULT_NO_TARGET_RETRY_WINDOW_MS = 350;
const DEFAULT_STRONG_WINDOW_MS = 700;
const DEFAULT_FINAL_EVIDENCE_LEAD_LINES = 2;
const MARKER_BIAS_PX = 0;
const DEFAULT_REALIGN_LEAD_LINES = 6;
const DEFAULT_REALIGN_LOOKBACK_LINES = 3;
const DEFAULT_REALIGN_SIM = 0.7;
const DEFAULT_LAG_RELOCK_BEHIND_HITS = 3;
const DEFAULT_LAG_RELOCK_WINDOW_MS = 2200;
const DEFAULT_LAG_RELOCK_MIN_DELTA = 20;
const DEFAULT_LAG_RELOCK_MIN_TOKENS = 4;
const DEFAULT_LAG_RELOCK_MIN_CHARS = 18;
const DEFAULT_LAG_RELOCK_LOOKAHEAD_BONUS = 260;
const DEFAULT_LAG_RELOCK_DURATION_MS = 2600;
const DEFAULT_LAG_RELOCK_LOW_SIM_FLOOR = 0.3;
const DEFAULT_RELOCK_SIM_FLOOR = 0.45;
const DEFAULT_RELOCK_OVERLAP_RATIO = 0.22;
const DEFAULT_RELOCK_SPAN_MIN_LINES = 2;
const DEFAULT_RELOCK_REPEAT_WINDOW_MS = 2200;
const DEFAULT_RELOCK_REPEAT_MIN = 2;
const DEFAULT_RESYNC_WINDOW_MS = 1600;
const DEFAULT_RESYNC_LOOKAHEAD_BONUS = 20;
const DEFAULT_RESYNC_COOLDOWN_MS = 2500;
const DEFAULT_STRONG_BACK_SIM = 0.72;
const DEFAULT_BACK_CONFIRM_HITS = 2;
const DEFAULT_BACK_CONFIRM_WINDOW_MS = 1300;
const DEFAULT_BEHIND_RECOVERY_MS = 2600;
const DEFAULT_BEHIND_RECOVERY_MAX_LINES = 6;
const DEFAULT_BEHIND_RECOVERY_MIN_SIM = 0.78;
const DEFAULT_BEHIND_RECOVERY_COOLDOWN_MS = 5000;
const DEFAULT_AMBIGUITY_SIM_DELTA = 0.06;
const DEFAULT_AMBIGUITY_NEAR_LINES = 6;
const DEFAULT_AMBIGUITY_FAR_LINES = 20;
const DEFAULT_MIN_TOKEN_COUNT = 3;
const DEFAULT_MIN_EVIDENCE_CHARS = 20;
const DEFAULT_INTERIM_HYSTERESIS_BONUS = 0.15;
const DEFAULT_INTERIM_STABLE_REPEATS = 1;
const DEFAULT_FORWARD_TIE_EPS = 0.03;
const DEFAULT_FORWARD_PROGRESS_WINDOW_MS = 4000;
const DEFAULT_FORWARD_BIAS_RECENT_LINES = 6;
const DEFAULT_FORWARD_BIAS_WINDOW_MS = DEFAULT_FORWARD_PROGRESS_WINDOW_MS;
const DEFAULT_FORWARD_BIAS_LOOKAHEAD_LINES = 12;
const DEFAULT_FORWARD_BIAS_SIM_SLACK = 0.1;
const DEFAULT_SHORT_FINAL_MIN_TOKENS = 2;
const DEFAULT_SHORT_FINAL_MAX_TOKENS = 6;
const DEFAULT_SHORT_FINAL_WINDOW_MS = DEFAULT_FORWARD_PROGRESS_WINDOW_MS;
const DEFAULT_SHORT_FINAL_LOOKAHEAD_LINES = 10;
const DEFAULT_SHORT_FINAL_SIM_SLACK = 0.12;
const DEFAULT_FORWARD_WINDOW_MAX_LINES = 4;
const DEFAULT_FORWARD_WINDOW_MIN_TOKENS = 2;
const DEFAULT_OUTRUN_RELAXED_SIM = 0.35;
const DEFAULT_OUTRUN_WINDOW_MS = DEFAULT_FORWARD_PROGRESS_WINDOW_MS;
const DEFAULT_OUTRUN_LOOKAHEAD_LINES = 14;
const DEFAULT_OUTRUN_BEHIND_SIM_SLACK = 0.05;
const DEFAULT_OUTRUN_BEHIND_MAX_DELTA = 2;
const DEFAULT_OUTRUN_BEHIND_WIN_MARGIN = 0.01;
const DEFAULT_OUTRUN_BEHIND_MIN_SIM = 0.55;
const DEFAULT_OUTRUN_BEHIND_CONTINUATION_SIM_SLACK = 0.12;
const DEFAULT_OUTRUN_BEHIND_CONTINUATION_MIN_SIM = 0.34;
const DEFAULT_OUTRUN_BEHIND_CONTINUATION_MIN_TOKENS = 4;
const DEFAULT_OUTRUN_BEHIND_CONTINUATION_MIN_OVERLAP_TOKENS = 2;
const DEFAULT_OUTRUN_BEHIND_APPEND_MIN_EXTRA_CHARS = 3;
const DEFAULT_OUTRUN_BEHIND_APPEND_MIN_SIM = 0.2;
const DEFAULT_FORCED_RATE_WINDOW_MS = 10000;
const DEFAULT_FORCED_RATE_MAX = 2;
const DEFAULT_FORCED_COOLDOWN_MS = 5000;
const DEFAULT_FORCED_MIN_TOKENS = 2;
const DEFAULT_FORCED_MIN_CHARS = 10;
const DEFAULT_SLAM_DUNK_SIM = 0.95;
const DEFAULT_SLAM_DUNK_MAX_DELTA = 2;
const DEFAULT_CONFIRMATION_RELAXED_SIM = 0.9;
const DEFAULT_CONFIRMATION_RELAXED_MAX_DELTA = 2;
const DEFAULT_NO_MATCH_WINDOW_MS = 1200;
const DEFAULT_NO_MATCH_BUMP_HITS = 3;
const DEFAULT_NO_MATCH_RELOCK_HITS = 6;
const GUARD_THROTTLE_MS = 750;
const DEFAULT_SHORT_TOKEN_MAX = 4;
const DEFAULT_SHORT_TOKEN_BOOST = 0.12;
const DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM = 0.2;
const DEFAULT_STABLE_INTERIM_NUDGE_MS = 450;
const DEFAULT_STABLE_INTERIM_NUDGE_COOLDOWN_MS = 900;
const DEFAULT_STABLE_INTERIM_PREFIX_MIN_TOKENS = 3;
const DEFAULT_STABLE_INTERIM_PREFIX_MIN_RATIO = 0.7;
const DEFAULT_STABLE_INTERIM_PREFIX_MAX_TAIL_DRIFT_TOKENS = 3;
const DEFAULT_NOISE_INTERIM_MIN_TOKENS = 3;
const DEFAULT_NOISE_INTERIM_MIN_CHARS = 12;
const DEFAULT_STARVATION_COMMIT_GAP_MS = 3000;
const DEFAULT_STARVATION_WARN_COOLDOWN_MS = 1500;
const DEFAULT_STARVATION_RELOCK_LOOKAHEAD_LINES = 5;
const DEFAULT_STARVATION_RELOCK_SIM_SLACK = 0.08;
const DEFAULT_STARVATION_RELOCK_COOLDOWN_MS = 1200;
const DEFAULT_LOST_FORWARD_WALL_RELOCK_STREAK = 3;
const DEFAULT_FINAL_CONTINUATION_SIM_EPS = 0.02;
const BAD_CURSOR_ON_CUE_LOG_THROTTLE_MS = 1500;
const DEFAULT_STALL_COMMIT_MS = 15000;
const DEFAULT_STALL_LOG_COOLDOWN_MS = 4000;
const DEFAULT_LOW_SIM_FLOOR = 0.25;
const DEFAULT_STUCK_RESYNC_WINDOW_MS = 2600;
const DEFAULT_STUCK_RESYNC_LOOKAHEAD_BONUS = 80;
const DEFAULT_STUCK_RESYNC_BACKTRACK_LINES = 1;
const DEFAULT_STUCK_RELOCK_SIM = 0.55;
const DEFAULT_GENERIC_SIM_DELTA = 0.03;
const DEFAULT_GENERIC_MIN_CANDIDATES = 3;
const DEFAULT_GENERIC_MAX_TOKENS = 8;
const DEFAULT_META_OVERLAP_RATIO = 0.25;
const DEFAULT_LAG_DELTA_LINES = 12;
const DEFAULT_LAG_WINDOW_MATCHES = 5;
const DEFAULT_LAG_MIN_FORWARD_HITS = 3;
const DEFAULT_LAG_FORCE_DELTA_LINES = 25;
const DEFAULT_LAG_FORCE_HITS = 2;
const DEFAULT_CATCHUP_MODE_MAX_JUMP = 25;
const DEFAULT_CATCHUP_MODE_MIN_SIM = 0.45;
const DEFAULT_CATCHUP_MODE_DURATION_MS = 2500;
const DEFAULT_CATCHUP_LOOKAHEAD_BONUS = 120;
const POST_CATCHUP_MS = 2200;
const POST_CATCHUP_DROP = 0.05;
const POST_CATCHUP_MAX_DELTA = 24;
const POST_CATCHUP_REQUIRE_IN_BAND = true;
const DELTA_SMALL_MAX_LINES = 6;
const DELTA_MED_MAX_LINES = 30;
const DELTA_LARGE_MIN_LINES = 31;
const DELTA_MIN_SIM_SMALL = 0.26;
const DELTA_MIN_SIM_MED = 0.33;
const DELTA_MIN_SIM_LARGE = 0.45;
const LARGE_DELTA_CONFIRM_HITS = 2;
const LARGE_DELTA_CONFIRM_WINDOW_MS = 1500;
const LARGE_DELTA_CONFIRM_SPREAD = 6;
const OVERSHOOT_RISK_DELTA_LINES = 30;
const OVERSHOOT_RISK_WINDOW_MS = 3500;
const OVERSHOOT_RISK_MIN_SIM = 0.4;
const BEHIND_RECOVERY_WINDOW_MS = 2500;
const BEHIND_RECOVERY_HITS = 3;
const BEHIND_RECOVERY_CLUSTER_SPREAD = 6;
const BEHIND_RECOVERY_MIN_DELTA = 6;
const BEHIND_RECOVERY_MAX_REWIND = 20;
const BEHIND_RECOVERY_MIN_SIM = 0.3;
const BEHIND_RECOVERY_COOLDOWN_MS = 2500;
const POST_CATCHUP_SAMPLES = 6;
const DEFAULT_BACKJUMP_BLOCK_LINES = 5;
const DEFAULT_FREEZE_LOW_SIM_HITS = 20;
const DEFAULT_FREEZE_LOW_SIM_WINDOW_MS = 5000;
const EVENT_RING_MAX = 50;
const EVENT_DUMP_COUNT = 12;
const BEHIND_DEBT_WINDOW_LINES = 4;
const BEHIND_DEBT_DECAY = 2;
const BEHIND_DEBT_CAP = 200;
const RECOVERY_BIG_JUMP_LINES = 15;
const RECOVERY_SIM_MIN = 0.75;
const RECOVERY_STREAK_REQUIRED = 3;
const RECOVERY_SIM_SLACK = 0.05;
const MANUAL_ANCHOR_MIN_SCROLL_PX = 400;
const MANUAL_ANCHOR_MAX_SCROLL_WINDOW_MS = 1000;
const MANUAL_ANCHOR_PENDING_TIMEOUT_MS = 5000;
const MANUAL_ANCHOR_WINDOW_LINES = 10;
const MANUAL_ANCHOR_SIM_SLACK = 0.03;
const MAX_LINES_PER_COMMIT = 2.0;
const DELTA_SMOOTHING_FACTOR = 0.3;
const TAPER_EXPONENT = 2.2;
const TAPER_MIN = 0.15;
const GLIDE_MIN_MS = 120;
const GLIDE_MAX_MS = 250;
const GLIDE_DEFAULT_MS = 180;
const MICRO_DELTA_LINE_RATIO = 0.8;
const MICRO_PURSUE_MS = 320;
const MICRO_PURSUE_MAX_PXPS = 60;
const MIN_PX_PER_SEC = 18;
const WITHIN_BLOCK_CONTINUITY_SIM_SLACK = 0.04;
const POST_COMMIT_ACTIVE_MAX_RATIO = 0.58;
const POST_COMMIT_ACTIVE_TARGET_RATIO = 0.42;
const POST_COMMIT_ACTIVE_MIN_RATIO = 0.14;
const POST_COMMIT_ACTIVE_BAND_RADIUS = 0.05;
const POST_COMMIT_MIN_READABLE_LINES_BELOW = 4;
const POST_COMMIT_READABILITY_LOOKAHEAD_LINES = 96;
const POST_COMMIT_READABLE_BOTTOM_PAD_PX = 12;
const POST_COMMIT_NEXT_LINE_VIS_GUARD_PX = 18;
const POST_COMMIT_MIN_NUDGE_PX = 1;
const POST_COMMIT_WRITER_SETTLE_MS = 140;
const POST_COMMIT_WRITER_SETTLE_RETRY_MS = 70;
const POST_COMMIT_WRITER_SETTLE_MAX_RETRIES = 12;
const COMMIT_BAND_RESEED_BACK_LINES = 2;
const COMMIT_BAND_RESEED_AHEAD_LINES = 60;
const COMMIT_BAND_RESEED_TTL_MS = 2200;
const DEFAULT_STUCK_WATCHDOG_FINAL_EVENTS = 3;
const DEFAULT_STUCK_WATCHDOG_NO_COMMIT_MS = 2800;
const DEFAULT_STUCK_WATCHDOG_COOLDOWN_MS = 2500;
const DEFAULT_STUCK_WATCHDOG_MAX_DELTA_LINES = 14;
const DEFAULT_STUCK_WATCHDOG_FORWARD_FLOOR = 0.2;
const DEFAULT_STUCK_WATCHDOG_COMMIT_CAP_LINES = 2;
const DEFAULT_ALLOW_BEHIND_REANCHOR = false;
const DEFAULT_STUCK_WATCHDOG_INTERIM_EVENTS = 8;
const DEFAULT_STUCK_WATCHDOG_INTERIM_RECENT_MS = 1500;
const DEFAULT_COMMIT_CLAMP_MAX_DELTA_LINES = 1;
const DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES = 3;
const DEFAULT_CUE_BRIDGE_BYPASS_MAX_SKIPPED_LINES = 2;
const DEFAULT_CUE_BRIDGE_STRONG_SIM = 0.6;
const DEFAULT_CUE_BRIDGE_LARGE_GAP = 0.12;
const DEFAULT_CUE_BRIDGE_STABILITY_MIN_EVENTS = 2;
const DEFAULT_CUE_STALL_RESCUE_DELAY_MS = 900;
const DEFAULT_CUE_STALL_RESCUE_COOLDOWN_MS = 1800;
const DEFAULT_MULTI_JUMP_MIN_SIM = 0.45;
const DEFAULT_MULTI_JUMP_BRIDGE_SIM_EPS = 0.08;
const DEFAULT_MULTI_JUMP_HARD_DENY_SIM = 0.3;
const DEFAULT_AMBIGUITY_HOLD_MIN_SIM = 0.35;
const DEFAULT_AMBIGUITY_HOLD_NEAR_WINDOW_LINES = 2;
const DEFAULT_AMBIG_SHORT_LINE_MAX_CONTENT_TOKENS = 7;
const DEFAULT_AMBIG_SHORT_LINE_MAX_OVERLAP_TOKENS = 2;
const DEFAULT_AMBIG_SHORT_LINE_MAX_SIM = 0.72;
const DEFAULT_AMBIG_SHORT_LINE_RUNNERUP_MARGIN = 0.08;
const DEFAULT_AMBIG_SHORT_LINE_SHAPE_PREFIX_RATIO = 0.6;
const DEFAULT_AMBIG_SHORT_LINE_SHAPE_PREFIX_TOKENS = 2;
const DEFAULT_HOLD_ANCHOR_LOOKAHEAD_LINES = 8;
const DEFAULT_HOLD_ANCHOR_MIN_SIM = 0.62;
const DEFAULT_HOLD_ANCHOR_MARGIN = 0.05;
const DEFAULT_HOLD_ANCHOR_MIN_CONTENT_TOKENS = 12;
const DEFAULT_HOLD_ANCHOR_MIN_SHARED_CONTENT_HITS = 3;
const DEFAULT_HOLD_ANCHOR_NEAR_DELTA_LINES = 1;
const DEFAULT_HOLD_ANCHOR_NEAR_MIN_SIM = 0.72;
const DEFAULT_HOLD_ANCHOR_COMMIT_CAP_LINES = 6;
const HOLD_TICK_LOG_THROTTLE_MS = 500;
const DEFAULT_NO_PROGRESS_STREAK_TRIGGER = 4;
const DEFAULT_LOST_FORWARD_LOOKAHEAD_LINES = 25;
const DEFAULT_LOST_FORWARD_MIN_SIM = 0.45;
const DEFAULT_LOST_HEALTHY_LOCK_SIM = 0.58;
const DEFAULT_LOST_FORWARD_RESEEK_MIN_SIM = 0.33;
const DEFAULT_LOST_FORWARD_RESEEK_MIN_CONTENT_HITS = 2;
const DEFAULT_LOST_FORWARD_CONTENT_FALLBACK_MAX_DELTA_LINES = 3;
const DEFAULT_LOST_FORWARD_CONTENT_FALLBACK_MIN_HITS = 2;
const DEFAULT_LOST_FORWARD_MARKER_CATCHUP_MAX_DELTA_LINES = 6;
const DEFAULT_LOST_FORWARD_MARKER_CATCHUP_COMMIT_CAP_LINES = 2;
const LOST_FORWARD_WINDOW_STEPS = [10, DEFAULT_LOST_FORWARD_LOOKAHEAD_LINES, 60] as const;
const LOST_FORWARD_STAGE_STREAKS = [
  DEFAULT_NO_PROGRESS_STREAK_TRIGGER,
  DEFAULT_NO_PROGRESS_STREAK_TRIGGER * 2,
  DEFAULT_NO_PROGRESS_STREAK_TRIGGER * 3,
] as const;
const DEFAULT_TELEPORT_MIN_TOKENS = 8;
const DEFAULT_TELEPORT_COMPETITIVE_MARGIN = 0.05;
const DEFAULT_TELEPORT_STANDARD_CAP_LINES = 25;
const DEFAULT_TELEPORT_DEEP_CAP_LINES = 60;
const ANCHOR_RARE_TOKEN_MIN_LEN = 7;
const DEFAULT_MICRO_RELOCK_MARGIN = 0.12;
const DEFAULT_MICRO_RELOCK_COOLDOWN_MS = 3000;
const DEFAULT_MICRO_RELOCK_PREFERRED_TTL_MS = 1500;
const DEFAULT_GRACE_ROLLBACK_WINDOW_MS = 2000;
const DEFAULT_GRACE_ROLLBACK_MIN_PREV_SIM = 0.7;
const DEFAULT_GRACE_ROLLBACK_MAX_CURRENT_SIM = 0.25;
const DEFAULT_GRACE_ROLLBACK_MIN_MARGIN = 0.35;
const DEFAULT_GRACE_ROLLBACK_COOLDOWN_MS = 5000;
const DEFAULT_STRONG_FORWARD_COMMIT_SIM = 0.82;
const DEFAULT_PERMISSIVE_FINAL_MIN_CONTENT_HITS = 1;
const DEFAULT_PERMISSIVE_FINAL_MIN_OVERLAP_RATIO = 0.25;
const DEFAULT_PERMISSIVE_FINAL_MARKER_BACK_TOLERANCE_LINES = 1;
const DEFAULT_WEAK_CURRENT_OVERLAP_MAX_TOKENS = 1;
const DEFAULT_WEAK_CURRENT_FORWARD_MIN_TOKENS = 3;
const DEFAULT_WEAK_CURRENT_FORWARD_SIM_SLACK = 0.1;
const DEFAULT_WEAK_CURRENT_FORWARD_SPARSE_SLACK = 0.14;
const DEFAULT_WEAK_CURRENT_FORWARD_CONF_CAP = 0.6;
const DEFAULT_WEAK_CURRENT_OVERLAP_MAX_RATIO = 0.25;
const DEFAULT_WEAK_CURRENT_FORWARD_MAX_DELTA = 2;
const DEFAULT_WEAK_CURRENT_FORWARD_MAX_SPAN = 2;
const DEFAULT_WEAK_CURRENT_FORWARD_INTERIM_MIN_SIM = 0.58;
const DEFAULT_WEAK_CURRENT_FORWARD_FINAL_MIN_SIM = 0.45;
const DEFAULT_STRONG_FINAL_NUDGE_MIN_OVERLAP_TOKENS = 4;
const DEFAULT_STRONG_FINAL_NUDGE_MIN_OVERLAP_RATIO = 0.55;
const DEFAULT_FIRST_COMMIT_NEAR_START_MAX_DELTA = 1;
const DEFAULT_WRITER_ADDRESSABLE_MIN_INDEXED_LINES = 8;
const DEFAULT_WRITER_ADDRESSABLE_MIN_RATIO = 0.15;
const DEFAULT_WRITER_ADDRESSABLE_MIN_FLOOR = 3;
const DEFAULT_BEHIND_CANDIDATE_MIN_SIM = 0.9;
const DEFAULT_BEHIND_CANDIDATE_MIN_TOKENS = 3;
const DEFAULT_BEHIND_CANDIDATE_MIN_CHARS = 24;
const DEFAULT_CURRENT_OVERRIDE_MIN_SIM = 0.22;
const CUE_LINE_BRACKET_RE = /^\s*[\[(][^\])]{0,120}[\])]\s*$/;
const CUE_LINE_WORD_RE = /\b(pause|beat|silence|breath|breathe|hold|wait|reflective)\b/i;
const SPEAKER_TAG_ONLY_RE = /^\s*\[\s*\/?\s*(s1|s2|guest1|guest2|g1|g2)\s*\]\s*$/i;
const NOTE_TAG_ONLY_RE = /^\s*\[\s*\/?\s*note(?:[^\]]*)\]\s*$/i;
const NOTE_INLINE_BLOCK_RE = /^\s*\[\s*note(?:[^\]]*)\][\s\S]*\[\s*\/\s*note\s*\]\s*$/i;
const MAX_CUE_SKIP_LOOKAHEAD_LINES = 12;
const ANCHOR_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'so', 'to', 'of', 'in', 'on',
  'at', 'for', 'from', 'with', 'by', 'as', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'this', 'that', 'these', 'those', 'it', 'its', 'i', 'you',
  'he', 'she', 'we', 'they', 'my', 'your', 'our', 'their', 'me', 'him', 'her',
  'them', 'do', 'does', 'did', 'have', 'has', 'had', 'not', 'no', 'yes',
]);
const INDEXED_LINE_SELECTOR = [
  '.line[data-i]',
  '.line[data-index]',
  '.line[data-line]',
  '.line[data-line-idx]',
  '.tp-line[data-i]',
  '.tp-line[data-index]',
  '.tp-line[data-line]',
  '.tp-line[data-line-idx]',
].join(', ');
const MOTION_PRESET_NORMAL = {
  maxLinesPerCommit: MAX_LINES_PER_COMMIT,
  deltaSmoothingFactor: DELTA_SMOOTHING_FACTOR,
  taperExponent: TAPER_EXPONENT,
  taperMin: TAPER_MIN,
  glideMinMs: GLIDE_MIN_MS,
  glideMaxMs: GLIDE_MAX_MS,
  glideDefaultMs: GLIDE_DEFAULT_MS,
  microDeltaLineRatio: MICRO_DELTA_LINE_RATIO,
  microPursuitMs: MICRO_PURSUE_MS,
  microPursuitMaxPxPerSec: MICRO_PURSUE_MAX_PXPS,
  minPursuitPxPerSec: MIN_PX_PER_SEC,
};
const MOTION_PRESET_CALM = {
  maxLinesPerCommit: 0.9,
  deltaSmoothingFactor: 0.2,
  taperExponent: 2.6,
  taperMin: 0.1,
  glideMinMs: 180,
  glideMaxMs: 360,
  glideDefaultMs: 270,
  microDeltaLineRatio: 0.95,
  microPursuitMs: 420,
  microPursuitMaxPxPerSec: 40,
  minPursuitPxPerSec: 12,
};
const MOTION_OVERRIDE_EPS = 0.0001;
const MOTION_KEYS: Array<keyof typeof MOTION_PRESET_NORMAL> = [
  'maxLinesPerCommit',
  'deltaSmoothingFactor',
  'taperExponent',
  'taperMin',
  'glideMinMs',
  'glideMaxMs',
  'glideDefaultMs',
  'microDeltaLineRatio',
  'microPursuitMs',
  'microPursuitMaxPxPerSec',
  'minPursuitPxPerSec',
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatLogSnippet(value: string, maxLen: number) {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen)}...`;
}

function formatLogScore(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : '?';
}

function normalizeComparableText(value: string): string {
  return normTokens(String(value || '')).join(' ');
}

function splitFinalTranscriptChunks(value: string): string[] {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const dedupe = new Set<string>();
  const chunks: string[] = [];
  const pushChunk = (chunk: string) => {
    const normalized = normalizeComparableText(chunk);
    if (!normalized) return;
    const tokenLen = normTokens(normalized).length;
    if (tokenLen < DEFAULT_FORWARD_WINDOW_MIN_TOKENS) return;
    if (dedupe.has(normalized)) return;
    dedupe.add(normalized);
    chunks.push(normalized);
  };
  pushChunk(raw);
  const parts = raw
    .split(/[.!?;:]+(?:\s+|$)|,\s+|--+/g)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of parts) {
    pushChunk(part);
  }
  return chunks;
}

function getOverlapTokens(leftNormalized: string, rightNormalized: string): string[] {
  const leftTokens = String(leftNormalized || '').split(' ').filter(Boolean);
  const rightTokens = new Set(String(rightNormalized || '').split(' ').filter(Boolean));
  const seen = new Set<string>();
  const overlap: string[] = [];
  for (const token of leftTokens) {
    if (!rightTokens.has(token) || seen.has(token)) continue;
    seen.add(token);
    overlap.push(token);
  }
  return overlap;
}

function isAnchorToken(token: string): boolean {
  const t = String(token || '').trim().toLowerCase();
  if (!t) return false;
  if (/^\d+$/.test(t)) return true;
  if (t.length >= ANCHOR_RARE_TOKEN_MIN_LEN && !ANCHOR_STOPWORDS.has(t)) return true;
  return false;
}

function getAnchorTokenSet(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (const token of tokens) {
    if (!isAnchorToken(token)) continue;
    out.add(token);
  }
  return out;
}

function isContentToken(token: string): boolean {
  const t = String(token || '').trim().toLowerCase();
  if (!t) return false;
  if (/^\d+$/.test(t)) return true;
  if (ANCHOR_STOPWORDS.has(t)) return false;
  return t.length >= 2;
}

function getContentTokenSet(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (const token of tokens) {
    if (!isContentToken(token)) continue;
    out.add(token);
  }
  return out;
}

function countSharedContentTokenHits(contentSet: Set<string>, candidateTokens: string[]): number {
  if (!contentSet.size || !candidateTokens.length) return 0;
  let hits = 0;
  const seen = new Set<string>();
  for (const raw of candidateTokens) {
    const token = String(raw || '').trim().toLowerCase();
    if (!token || seen.has(token)) continue;
    if (!contentSet.has(token)) continue;
    seen.add(token);
    hits += 1;
  }
  return hits;
}

function countSharedPrefixTokens(leftTokens: string[], rightTokens: string[]): number {
  if (!leftTokens.length || !rightTokens.length) return 0;
  const limit = Math.min(leftTokens.length, rightTokens.length);
  let count = 0;
  while (count < limit && leftTokens[count] === rightTokens[count]) {
    count += 1;
  }
  return count;
}

function isNearDuplicateShortLineStructure(bestTokens: string[], secondTokens: string[]): boolean {
  if (!bestTokens.length || !secondTokens.length) return false;
  const firstTokenShared = bestTokens[0] === secondTokens[0];
  const prefixShared = countSharedPrefixTokens(bestTokens, secondTokens);
  const firstTwoShared =
    bestTokens.length >= 2 &&
    secondTokens.length >= 2 &&
    prefixShared >= 2;
  const lastTokenShared =
    bestTokens[bestTokens.length - 1] === secondTokens[secondTokens.length - 1];
  const minLen = Math.min(bestTokens.length, secondTokens.length);
  const sameTokenCount = bestTokens.length === secondTokens.length;
  const prefixRatio = minLen > 0 ? prefixShared / minLen : 0;
  const sameShape =
    sameTokenCount &&
    prefixShared >= Math.min(DEFAULT_AMBIG_SHORT_LINE_SHAPE_PREFIX_TOKENS, minLen) &&
    prefixRatio >= DEFAULT_AMBIG_SHORT_LINE_SHAPE_PREFIX_RATIO;
  return firstTokenShared || firstTwoShared || lastTokenShared || sameShape;
}

type StrongLongAnchorScanCandidate = {
  idx: number;
  score: number;
  span?: number;
  contentTokenCount: number;
  sharedContentHits: number;
};

export function pickStrongLongAnchorCandidate<T extends StrongLongAnchorScanCandidate>(
  cursorLine: number,
  candidates: T[],
  opts?: {
    lookaheadLines?: number;
    minSim?: number;
    minContentTokens?: number;
    minSharedContentHits?: number;
    nearDeltaLines?: number;
    nearMinSim?: number;
    minMargin?: number;
  },
): (T & { margin: number; delta: number; span: number }) | null {
  if (!Number.isFinite(cursorLine) || !Array.isArray(candidates) || !candidates.length) return null;
  const safeCursor = Math.max(0, Math.floor(cursorLine));
  const lookaheadLines = Math.max(
    1,
    Math.floor(Number(opts?.lookaheadLines ?? DEFAULT_HOLD_ANCHOR_LOOKAHEAD_LINES)),
  );
  const minSim = Number.isFinite(Number(opts?.minSim))
    ? Number(opts?.minSim)
    : DEFAULT_HOLD_ANCHOR_MIN_SIM;
  const minContentTokens = Math.max(
    1,
    Math.floor(Number(opts?.minContentTokens ?? DEFAULT_HOLD_ANCHOR_MIN_CONTENT_TOKENS)),
  );
  const minSharedContentHits = Math.max(
    1,
    Math.floor(Number(opts?.minSharedContentHits ?? DEFAULT_HOLD_ANCHOR_MIN_SHARED_CONTENT_HITS)),
  );
  const nearDeltaLines = Math.max(
    0,
    Math.floor(Number(opts?.nearDeltaLines ?? DEFAULT_HOLD_ANCHOR_NEAR_DELTA_LINES)),
  );
  const nearMinSim = Number.isFinite(Number(opts?.nearMinSim))
    ? Number(opts?.nearMinSim)
    : DEFAULT_HOLD_ANCHOR_NEAR_MIN_SIM;
  const minMargin = Number.isFinite(Number(opts?.minMargin))
    ? Number(opts?.minMargin)
    : DEFAULT_HOLD_ANCHOR_MARGIN;

  const filtered = candidates
    .filter((entry) => {
      if (!entry) return false;
      if (!Number.isFinite(entry.idx) || !Number.isFinite(entry.score)) return false;
      const idx = Math.max(0, Math.floor(Number(entry.idx)));
      if (idx <= safeCursor || idx > safeCursor + lookaheadLines) return false;
      if (Number(entry.score) < minSim) return false;
      if (Math.max(0, Math.floor(Number(entry.contentTokenCount) || 0)) < minContentTokens) return false;
      if (Math.max(0, Math.floor(Number(entry.sharedContentHits) || 0)) < minSharedContentHits) return false;
      return true;
    })
    .map((entry) => ({
      ...entry,
      idx: Math.max(0, Math.floor(Number(entry.idx))),
      score: Number(entry.score),
      span: Math.max(1, Math.floor(Number(entry.span) || 1)),
      contentTokenCount: Math.max(0, Math.floor(Number(entry.contentTokenCount) || 0)),
      sharedContentHits: Math.max(0, Math.floor(Number(entry.sharedContentHits) || 0)),
    }))
    .sort((a, b) =>
      b.score - a.score ||
      b.sharedContentHits - a.sharedContentHits ||
      b.contentTokenCount - a.contentTokenCount ||
      b.span - a.span ||
      a.idx - b.idx,
    );
  const best = filtered[0] || null;
  if (!best) return null;
  const second = filtered[1] || null;
  const margin = second ? best.score - second.score : Number.POSITIVE_INFINITY;
  const delta = best.idx - safeCursor;
  const nearNeedsExtraStrength = delta <= nearDeltaLines;
  if (nearNeedsExtraStrength && best.score < nearMinSim) return null;
  if (Number.isFinite(margin) && margin < minMargin) return null;
  return {
    ...best,
    margin,
    delta,
  } as T & { margin: number; delta: number; span: number };
}

function isAdjacentShortTiePocket(
  cursorLine: number,
  best:
    | { idx: number; score: number; contentTokenCount: number }
    | null
    | undefined,
  second:
    | { idx: number; score: number; contentTokenCount: number }
    | null
    | undefined,
): boolean {
  if (!best || !second) return false;
  if (!Number.isFinite(cursorLine)) return false;
  if (!Number.isFinite(best.idx) || !Number.isFinite(second.idx)) return false;
  if (!Number.isFinite(best.score) || !Number.isFinite(second.score)) return false;
  const safeCursor = Math.max(0, Math.floor(cursorLine));
  const bestIdx = Math.max(0, Math.floor(best.idx));
  const secondIdx = Math.max(0, Math.floor(second.idx));
  const bestDelta = bestIdx - safeCursor;
  const secondDelta = secondIdx - safeCursor;
  if (bestDelta <= 0 || secondDelta <= 0) return false;
  if (bestDelta > DEFAULT_AMBIGUITY_HOLD_NEAR_WINDOW_LINES || secondDelta > DEFAULT_AMBIGUITY_HOLD_NEAR_WINDOW_LINES) {
    return false;
  }
  if (Math.abs(bestIdx - secondIdx) > DEFAULT_AMBIGUITY_HOLD_NEAR_WINDOW_LINES) return false;
  const bestShortish = best.contentTokenCount > 0 && best.contentTokenCount <= DEFAULT_AMBIG_SHORT_LINE_MAX_CONTENT_TOKENS;
  const secondShortish = second.contentTokenCount > 0 && second.contentTokenCount <= DEFAULT_AMBIG_SHORT_LINE_MAX_CONTENT_TOKENS;
  if (!bestShortish || !secondShortish) return false;
  const simGap = best.score - second.score;
  if (!Number.isFinite(simGap)) return false;
  return simGap <= DEFAULT_AMBIG_SHORT_LINE_RUNNERUP_MARGIN;
}

function evaluateShortLineAmbiguityHold(
  cursorLine: number,
  bestIdx: number,
  bestSim: number,
  bestContentCount: number,
  bestOverlapHits: number,
  bestTokens: string[],
  secondCandidate: { idx: number; score: number } | null,
  secondTokens: string[],
): { hold: boolean; reason: string } {
  if (!secondCandidate) return { hold: false, reason: '' };
  if (bestIdx < cursorLine) return { hold: false, reason: '' };
  if (!Number.isFinite(bestSim) || !Number.isFinite(secondCandidate.score)) {
    return { hold: false, reason: '' };
  }
  if (
    Math.abs(secondCandidate.idx - bestIdx) > DEFAULT_AMBIGUITY_HOLD_NEAR_WINDOW_LINES
  ) {
    return { hold: false, reason: '' };
  }
  const simGap = bestSim - secondCandidate.score;
  if (!Number.isFinite(simGap) || simGap > DEFAULT_AMBIG_SHORT_LINE_RUNNERUP_MARGIN) {
    return { hold: false, reason: '' };
  }
  if (!(bestContentCount > 0 && bestContentCount <= DEFAULT_AMBIG_SHORT_LINE_MAX_CONTENT_TOKENS)) {
    return { hold: false, reason: '' };
  }
  if (bestSim < DEFAULT_AMBIGUITY_HOLD_MIN_SIM || bestSim > DEFAULT_AMBIG_SHORT_LINE_MAX_SIM) {
    return { hold: false, reason: '' };
  }
  const sparseOverlap = bestOverlapHits <= DEFAULT_AMBIG_SHORT_LINE_MAX_OVERLAP_TOKENS;
  const nearDuplicateShape = isNearDuplicateShortLineStructure(bestTokens, secondTokens);
  if (!sparseOverlap && !nearDuplicateShape) return { hold: false, reason: '' };
  return {
    hold: true,
    reason: nearDuplicateShape ? 'short_line_near_duplicate' : 'short_line_ambiguous',
  };
}

function hasMeaningfulTranscriptChange(previousNormalized: string, nextNormalized: string): boolean {
  const prev = String(previousNormalized || '').trim();
  const next = String(nextNormalized || '').trim();
  if (!prev && !next) return false;
  if (!prev || !next) return true;
  if (prev === next) return false;
  const prevTokens = prev.split(' ').filter(Boolean);
  const nextTokens = next.split(' ').filter(Boolean);
  if (!prevTokens.length || !nextTokens.length) return true;

  let sharedPrefix = 0;
  const sharedLimit = Math.min(prevTokens.length, nextTokens.length);
  while (sharedPrefix < sharedLimit && prevTokens[sharedPrefix] === nextTokens[sharedPrefix]) {
    sharedPrefix += 1;
  }
  if (sharedPrefix === 0) return true;

  // Growing interim text with a stable leading phrase should not reset stability.
  const appendOnly =
    sharedPrefix === prevTokens.length &&
    nextTokens.length >= prevTokens.length;
  if (appendOnly) return false;

  // Minor tail corrections are treated as stable if most of the leading phrase is unchanged.
  const minTokenLen = Math.min(prevTokens.length, nextTokens.length);
  const prefixRatio = minTokenLen > 0 ? sharedPrefix / minTokenLen : 0;
  const tailDrift = Math.abs(nextTokens.length - prevTokens.length);
  const prefixStable =
    sharedPrefix >= DEFAULT_STABLE_INTERIM_PREFIX_MIN_TOKENS &&
    prefixRatio >= DEFAULT_STABLE_INTERIM_PREFIX_MIN_RATIO &&
    tailDrift <= DEFAULT_STABLE_INTERIM_PREFIX_MAX_TAIL_DRIFT_TOKENS;
  if (prefixStable) return false;

  return true;
}

function parseLineIndexFromElement(el: HTMLElement | null): number | null {
  if (!el) return null;
  const raw =
    el.dataset.i ||
    el.dataset.index ||
    el.dataset.line ||
    el.dataset.lineIdx ||
    el.getAttribute('data-line') ||
    el.getAttribute('data-line-idx');
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  const id = String(el.id || '');
  const idMatch = /^tp-line-(\d+)$/.exec(id);
  if (idMatch) {
    const idParsed = Number(idMatch[1]);
    if (Number.isFinite(idParsed)) return Math.max(0, Math.floor(idParsed));
  }
  return null;
}

function parseBlockIndexFromElement(el: HTMLElement | null, fallback: number): number {
  const raw = Number(el?.dataset.tpBlock ?? fallback);
  return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : Math.max(0, Math.floor(fallback));
}

function classifySkippableLineForCueBridge(value: string): CueBridgeSkipReason | null {
  const raw = String(value || '').trim();
  if (!raw) return 'blank';
  if (SPEAKER_TAG_ONLY_RE.test(raw)) return 'speaker';
  if (NOTE_TAG_ONLY_RE.test(raw) || NOTE_INLINE_BLOCK_RE.test(raw) || /\[\s*\/?\s*note\b/i.test(raw)) return 'note';
  const normalized = normalizeComparableText(raw);
  if (!normalized) return 'blank';
  if (CUE_LINE_BRACKET_RE.test(raw)) return 'cue';
  const tokenCount = normalized.split(' ').filter(Boolean).length;
  return tokenCount <= 4 && CUE_LINE_WORD_RE.test(normalized) ? 'cue' : null;
}

function isSkippableLineForCueBridge(value: string): boolean {
  return classifySkippableLineForCueBridge(value) != null;
}

function isIgnorableCueLineText(value: string): boolean {
  return isSkippableLineForCueBridge(value);
}

function isBehindCandidateEligible(
  score: number,
  tokenCount: number,
  evidenceChars: number,
): boolean {
  return (
    Number.isFinite(score) &&
    score >= DEFAULT_BEHIND_CANDIDATE_MIN_SIM &&
    tokenCount >= DEFAULT_BEHIND_CANDIDATE_MIN_TOKENS &&
    evidenceChars >= DEFAULT_BEHIND_CANDIDATE_MIN_CHARS
  );
}

function buildAsrBlockCorpusFromElements(blockEls: HTMLElement[]): AsrBlockCorpusEntry[] {
  if (!Array.isArray(blockEls) || !blockEls.length) return [];
  const corpus: AsrBlockCorpusEntry[] = [];
  for (let i = 0; i < blockEls.length; i += 1) {
    const blockEl = blockEls[i];
    if (!blockEl) continue;
    const blockId = parseBlockIndexFromElement(blockEl, i);
    const lineEls = Array.from(blockEl.querySelectorAll<HTMLElement>('.line, .tp-line'));
    if (!lineEls.length) continue;
    const lineIndices: number[] = [];
    const spokenTextParts: string[] = [];
    for (const lineEl of lineEls) {
      const lineIdx = parseLineIndexFromElement(lineEl);
      if (lineIdx != null) lineIndices.push(lineIdx);
      const raw = String(lineEl.textContent || '').replace(/\s+/g, ' ').trim();
      if (!raw || isIgnorableCueLineText(raw)) continue;
      spokenTextParts.push(raw);
    }
    if (!lineIndices.length) continue;
    lineIndices.sort((a, b) => a - b);
    const textNorm = normalizeComparableText(spokenTextParts.join(' '));
    corpus.push({
      blockId,
      startLine: lineIndices[0],
      endLine: lineIndices[lineIndices.length - 1],
      textNorm,
      tokens: normTokens(textNorm),
    });
  }
  corpus.sort((a, b) => a.blockId - b.blockId || a.startLine - b.startLine);
  return corpus;
}

function mergeEvidenceText(base: string, next: string): string {
  const a = String(base || '').trim();
  const b = String(next || '').trim();
  if (!a) return b;
  if (!b) return a;
  if (a.includes(b)) return a;
  if (b.includes(a)) return b;
  const aTokens = a.split(' ');
  const bTokens = b.split(' ');
  const max = Math.min(aTokens.length, bTokens.length);
  let overlap = 0;
  for (let n = max; n >= 1; n -= 1) {
    const tail = aTokens.slice(-n).join(' ').toLowerCase();
    const head = bTokens.slice(0, n).join(' ').toLowerCase();
    if (tail === head) {
      overlap = n;
      break;
    }
  }
  if (overlap > 0) {
    return [...aTokens, ...bTokens.slice(overlap)].join(' ');
  }
  return `${a} ${b}`;
}

function buildEvidenceText(entries: EvidenceEntry[]): string {
  let merged = '';
  for (const entry of entries) {
    merged = mergeEvidenceText(merged, entry.text);
  }
  return merged.replace(/\s+/g, ' ').trim();
}

const guardLastAt = new Map<string, number>();
const logLastAt = new Map<string, number>();
const guardStatusLastAt = new Map<string, number>();
let activeGuardCounts: Map<string, number> | null = null;
const guardEvents: Array<{ ts: number; reason: string }> = [];
const GUARD_DEBUG_REASONS = new Set<string>([
  'same_line_noop',
  'same_line_throttle',
  'match_out_of_band_defer',
  'match_out_of_band',
  'low_sim_wait',
  'low_sim',
  'interim_unstable',
]);
const LOG_THROTTLE_MS = 500;
const HUD_STATUS_THROTTLE_MS = 500;
const HUD_PURSUE_THROTTLE_MS = 200;
let lastPursueHudAt = 0;
const SUMMARY_TOAST_DEDUPE_MS = 1000;
const SUMMARY_MIN_DURATION_MS = 250;
const DRIVER_ACTIVE_DISPOSE_MIN_MS = 2000;
const NAN_GUARD_THROTTLE_MS = 1000;
const MAX_REPORTED_RUN_KEYS = 128;
const reportedSummaryRunKeys = new Set<string>();
let lastSummaryToastKey = '';
let lastSummaryToastAt = 0;
const nanGuardLastAt = new Map<string, number>();

function markRunSummaryReported(runKey: string | null | undefined): boolean {
  const key = String(runKey || '').trim();
  if (!key) return false;
  if (reportedSummaryRunKeys.has(key)) return true;
  if (reportedSummaryRunKeys.size >= MAX_REPORTED_RUN_KEYS) {
    reportedSummaryRunKeys.clear();
  }
  reportedSummaryRunKeys.add(key);
  return false;
}

function emitSummaryToastOnce(toastKey: string, message: string, type: 'warning' | 'info'): void {
  const now = Date.now();
  if (toastKey && toastKey === lastSummaryToastKey && (now - lastSummaryToastAt) <= SUMMARY_TOAST_DEDUPE_MS) {
    return;
  }
  lastSummaryToastKey = toastKey;
  lastSummaryToastAt = now;
  try { (window as any).toast?.(message, { type }); } catch {}
}

function logThrottled(key: string, level: 'log' | 'warn' | 'debug', message: string, payload?: any) {
  const now = Date.now();
  const last = logLastAt.get(key) ?? 0;
  if (now - last < LOG_THROTTLE_MS) return;
  logLastAt.set(key, now);
  try {
    const fn = (console as any)[level] || console.log;
    if (payload === undefined) fn(message);
    else fn(message, payload);
  } catch {}
}

function warnGuard(reason: string, parts: Array<string | number | null | undefined>) {
  const now = Date.now();
  try {
    guardEvents.push({ ts: now, reason });
    const cutoff = now - DEFAULT_STALL_COMMIT_MS;
    while (guardEvents.length && guardEvents[0].ts < cutoff) guardEvents.shift();
  } catch {
    // ignore
  }
  try {
    if (activeGuardCounts) {
      activeGuardCounts.set(reason, (activeGuardCounts.get(reason) || 0) + 1);
    }
  } catch {
    // ignore
  }
  const last = guardLastAt.get(reason) ?? 0;
  if (now - last < GUARD_THROTTLE_MS) return;
  guardLastAt.set(reason, now);
  const level: 'warn' | 'debug' = GUARD_DEBUG_REASONS.has(reason) ? 'debug' : 'warn';
  try {
    const line = ['🧱 ASR_GUARD', `reason=${reason}`, ...parts.filter(Boolean)];
    if (level === 'debug') console.debug(line.join(' '));
    else console.warn(line.join(' '));
  } catch {}
  logThrottled(`ASR_GUARD:${reason}`, level, 'ASR_GUARD', { reason, parts: parts.filter(Boolean) });
}

function warnAsrNanGuard(
  key: string,
  value: unknown,
  detail?: Record<string, unknown>,
) {
  const now = Date.now();
  const last = nanGuardLastAt.get(key) ?? 0;
  if (now - last < NAN_GUARD_THROTTLE_MS) return;
  nanGuardLastAt.set(key, now);
  if (!isDevMode()) return;
  try {
    console.warn('[ASR NAN GUARD]', {
      key,
      value,
      ...(detail || {}),
    });
  } catch {
    // ignore
  }
}

function finiteNumberOrNull(
  key: string,
  value: unknown,
  detail?: Record<string, unknown>,
): number | null {
  const next = Number(value);
  if (Number.isFinite(next)) return next;
  warnAsrNanGuard(key, value, detail);
  return null;
}

function readAsrLastEndedRunKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return String((window as any).__tpAsrLastEndedRunKey || '').trim();
  } catch {
    return '';
  }
}

function emitHudStatus(key: string, text: string, detail?: Record<string, unknown>) {
  const now = Date.now();
  const last = guardStatusLastAt.get(key) ?? 0;
  if (now - last < HUD_STATUS_THROTTLE_MS) return;
  guardStatusLastAt.set(key, now);
  const payload = { text, ts: now, ...detail };
  try { window.dispatchEvent(new CustomEvent('tp:asr:guard', { detail: payload })); } catch {}
  try { (window as any).__tpHud?.bus?.emit?.('asr:guard', payload); } catch {}
}

function emitPursuitHud(err: number, vel: number, target: number | null, top: number) {
  if (!isDevMode()) return;
  const now = Date.now();
  if (now - lastPursueHudAt < HUD_PURSUE_THROTTLE_MS) return;
  lastPursueHudAt = now;
  const payload = {
    err: Number.isFinite(err) ? Math.round(err) : err,
    vel: Number.isFinite(vel) ? Number(vel.toFixed(1)) : vel,
    target: Number.isFinite(target as number) ? Math.round(target as number) : target,
    top: Math.round(top),
  };
  try { (window as any).__tpHud?.log?.('ASR_PURSUE', payload); } catch {}
  try { (window as any).HUD?.log?.('ASR_PURSUE', payload); } catch {}
  try {
    console.debug(`ASR_PURSUE err=${payload.err} vel=${payload.vel} target=${payload.target} top=${payload.top}`);
  } catch {}
}

function resolveThreshold(): number {
  try {
    const stored = getAsrSettings();
    if (typeof stored.threshold === 'number') {
      return clamp(stored.threshold, 0, 1);
    }
  } catch {
    // ignore
  }
  return 0.55;
}

function isDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__tpAsrScrollDebug) return true;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    if (w.localStorage?.getItem('tp_dev_mode') === '1') return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.has('dev') || params.has('debug')) return true;
    const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    if (hash === 'dev' || hash === 'dev=1' || hash.includes('dev=1')) return true;
  } catch {
    // ignore
  }
  return false;
}

function isPermissiveAsrMatcherEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__tpAsrPermissiveMatcher === false || w.__tpAsrLooseMatcher === false) return false;
    if (w.__tpAsrPermissiveMatcher === true || w.__tpAsrLooseMatcher === true) return true;
    const params = new URLSearchParams(window.location.search || '');
    const mode = String(
      params.get('asr_matcher') ||
      params.get('asr_permissive') ||
      params.get('asr_loose') ||
      '',
    ).toLowerCase();
    if (
      mode === '1' ||
      mode === 'true' ||
      mode === 'loose' ||
      mode === 'permissive' ||
      mode === 'aggressive'
    ) {
      return true;
    }
    if (mode === '0' || mode === 'false' || mode === 'strict') {
      return false;
    }
    const ls = w.localStorage;
    if (ls?.getItem('tp_asr_permissive_matcher') === '1') return true;
    if (ls?.getItem('tp_asr_loose_matcher') === '1') return true;
  } catch {
    // ignore
  }
  // Default permissive behavior in dev to prioritize progress during tuning.
  return isDevMode();
}

function shouldForcePixelAsrCommitPath(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__tpAsrForceWriterCommit === true) return false;
    if (w.__tpAsrForcePixelCommit === true) return true;
    const params = new URLSearchParams(window.location.search || '');
    const writerParam = String(params.get('asr_writer') || '').toLowerCase();
    if (writerParam === '1' || writerParam === 'true') return false;
    const pixelParam = String(params.get('asr_pixel') || '').toLowerCase();
    if (pixelParam === '1' || pixelParam === 'true') return true;
    const ls = w.localStorage;
    if (ls?.getItem('tp_asr_force_writer_commit') === '1') return false;
    if (ls?.getItem('tp_asr_force_pixel_commit') === '1') return true;
  } catch {
    // ignore
  }
  // Writer-first is the canonical path in all environments.
  // Pixel commits are an explicit debug override only.
  return false;
}

function normalizeSpeechMatchResult(input: unknown): MatchResult | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const bestIdxRaw = raw.bestIdx ?? raw.idx;
  const bestSimRaw = raw.bestSim ?? raw.sim;
  const bestIdx = Number.isFinite(Number(bestIdxRaw)) ? Math.floor(Number(bestIdxRaw)) : -1;
  const bestSim = Number.isFinite(Number(bestSimRaw)) ? Number(bestSimRaw) : 0;
  const topScores = Array.isArray(raw.topScores)
    ? raw.topScores
    : (Array.isArray(raw.candidates) ? raw.candidates : []);
  return {
    ...(raw as MatchResult),
    bestIdx,
    bestSim,
    topScores: topScores as Array<{ idx: number; score: number }>,
  };
}

function resolveSpeechMatchResult(text: string, isFinal: boolean): MatchResult | null {
  if (typeof window === 'undefined') return null;
  const ns = (window as any).__tpSpeech;
  if (!ns || typeof ns !== 'object') return null;
  const transcript = String(text || '');

  const tryCall = (fn: any): MatchResult | null => {
    if (typeof fn !== 'function') return null;
    try {
      return normalizeSpeechMatchResult(fn(transcript, isFinal));
    } catch {}
    try {
      return normalizeSpeechMatchResult(fn(transcript, { isFinal }));
    } catch {}
    return null;
  };

  const fromMatchOne = tryCall(ns.matchOne);
  if (fromMatchOne) return fromMatchOne;

  const fromMatchBatch = tryCall(ns.matchBatch);
  if (fromMatchBatch) return fromMatchBatch;

  try {
    if (typeof ns.matchBatch === 'function') {
      return normalizeSpeechMatchResult(ns.matchBatch([transcript], { isFinal }));
    }
  } catch {}

  return null;
}

function logDev(...args: any[]) {
  if (!isDevMode() || !shouldLogLevel(2)) return;
  try {
    console.debug('[ASR→SCROLL]', ...args);
  } catch {
    // ignore
  }
}


function getScrollMode(): string {
  try {
    const store = (window as any).__tpStore;
    const raw = store?.get?.('scrollMode') ?? (window as any).__tpUiScrollMode;
    return String(raw || '').toLowerCase();
  } catch {
    return '';
  }
}

function getSessionPhase(): string {
  try {
    const store = (window as any).__tpStore;
    const raw = store?.get?.('session.phase');
    return String(raw || '').toLowerCase();
  } catch {
    return '';
  }
}

function getStateCurrentIndex(): number | null {
  try {
    const raw = Number((window as any)?.currentIndex ?? NaN);
    if (!Number.isFinite(raw)) return null;
    return Math.max(0, Math.floor(raw));
  } catch {
    return null;
  }
}

function isSessionAsrArmed(): boolean {
  try {
    const store = (window as any).__tpStore;
    const armed = store?.get?.('session.asrArmed');
    if (typeof armed === 'boolean') return armed;
  } catch {
    // ignore
  }
  return false;
}

function isSessionLivePhase(): boolean {
  return getSessionPhase() === 'live';
}

function isHybridMode(): boolean {
  return getScrollMode() === 'hybrid';
}

const HYBRID_BRAKE_TTL_MS = 320;
const HYBRID_ASSIST_TTL_MS = 320;
const HYBRID_TARGET_HINT_TTL_MS = 600;
const HYBRID_ASSIST_MAX_BOOST_PXPS = 400;
const HYBRID_TARGET_HINT_MIN_DELTA_PX = 8;
const HYBRID_TARGET_HINT_MIN_INTERVAL_MS = 250;
let lastHybridTargetHintTop: number | null = null;
let lastHybridTargetHintTs = 0;

const getNowMs = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

function dispatchHybridEvent(name: string, detail: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    // ignore
  }
}

function emitHybridBrake(factor: number, reason: string, ttlMs?: number) {
  if (!isHybridMode()) return;
  const safeFactor = Number.isFinite(factor) ? Math.max(0, Math.min(1, factor)) : 1;
  const requestedTtl = typeof ttlMs === 'number' ? ttlMs : HYBRID_BRAKE_TTL_MS;
  const safeTtl = Math.max(20, Math.min(2000, requestedTtl));
  dispatchHybridEvent('tp:hybrid:brake', {
    factor: safeFactor,
    reason,
    ttlMs: safeTtl,
  });
}

function emitHybridAssist(boostPxps: number, reason: string, targetTop?: number, ttlMs?: number) {
  if (!isHybridMode()) return;
  const boostValue = typeof boostPxps === 'number' ? boostPxps : NaN;
  const boost = Number.isFinite(boostValue)
    ? Math.max(0, Math.min(HYBRID_ASSIST_MAX_BOOST_PXPS, boostValue))
    : 0;
  if (boost <= 0) return;
  const requestedTtl = typeof ttlMs === 'number' ? ttlMs : HYBRID_ASSIST_TTL_MS;
  const safeTtl = Math.max(20, Math.min(2000, requestedTtl));
  dispatchHybridEvent('tp:hybrid:assist', {
    boostPxps: boost,
    reason,
    ttlMs: safeTtl,
    targetTop,
  });
}

let warnedMissingTargetTop = false;

function emitHybridTargetHint(
  top: number,
  confidence: number,
  reason?: string,
  ttlMs?: number,
  lineIndex?: number,
) {
  if (!isHybridMode()) return;
  const scroller = getScroller();
  const anchorLineIndex =
    typeof lineIndex === 'number' && Number.isFinite(lineIndex)
      ? Math.max(0, Math.floor(lineIndex))
      : null;
  let anchorTop: number | null = null;
  if (scroller && anchorLineIndex !== null) {
    const lineEl = getLineElementByIndex(scroller, anchorLineIndex);
    if (lineEl) {
      anchorTop = lineEl.offsetTop || 0;
    }
  }
  const fallbackTop =
    anchorTop != null
      ? anchorTop
      : scroller && typeof scroller.scrollTop === 'number'
      ? scroller.scrollTop
      : 0;
  const normalizedTop = Number.isFinite(top) ? top : fallbackTop;
  const missingTop = !Number.isFinite(top);
  if (missingTop && isDevMode() && !warnedMissingTargetTop) {
    warnedMissingTargetTop = true;
    try {
      console.warn('[HYBRID_CTRL] targetHint missing top – using fallback', {
        reason,
        fallbackTop,
      });
    } catch {}
  }
  const now = getNowMs();
  if (
    lastHybridTargetHintTop != null &&
    Math.abs(normalizedTop - lastHybridTargetHintTop) < HYBRID_TARGET_HINT_MIN_DELTA_PX &&
    now - lastHybridTargetHintTs < HYBRID_TARGET_HINT_MIN_INTERVAL_MS
  ) {
    return;
  }
  lastHybridTargetHintTop = normalizedTop;
  lastHybridTargetHintTs = now;
  const requestedTtl = typeof ttlMs === 'number' ? ttlMs : HYBRID_TARGET_HINT_TTL_MS;
  const safeTtl = Math.max(20, Math.min(2000, requestedTtl));
  const safeConfidence = Math.max(0, Math.min(1, confidence));
  const markerPct =
    typeof (window as any).__TP_MARKER_PCT === 'number' ? (window as any).__TP_MARKER_PCT : 0.4;
  dispatchHybridEvent('tp:hybrid:targetHint', {
    targetTop: normalizedTop,
    top: normalizedTop,
    confidence: safeConfidence,
    reason,
    ttlMs: safeTtl,
    anchorTop,
    markerPct,
    anchorLine: anchorLineIndex,
    lineIndex: anchorLineIndex,
  });
}

function hasActiveScrollWriter(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const maybeWriter = (window as any).__tpScrollWrite;
    return (
      typeof maybeWriter === 'function' ||
      (typeof maybeWriter === 'object' &&
        !!maybeWriter &&
        typeof maybeWriter.scrollTo === 'function' &&
        typeof maybeWriter.scrollBy === 'function')
    );
  } catch {
    return false;
  }
}

function logCommitScrollStamp(
  method: 'writer' | 'pixel',
  scroller: HTMLElement | null,
  beforeTop: number,
  afterTop: number,
  lineIdx: number,
  blockId: number,
  writerAvailable: boolean,
): void {
  const path = typeof window !== 'undefined' ? window.location?.pathname || '' : '';
  const id = scroller?.id || '(none)';
  const clsRaw = typeof scroller?.className === 'string' ? scroller.className : '';
  const cls = clsRaw.trim() || '(none)';
  const role = resolveViewerRole();
  const moved = Math.round((Number(afterTop) || 0) - (Number(beforeTop) || 0));
  try {
    console.info(
      `[ASR_COMMIT] path=${path} role=${role} writer=${writerAvailable ? 1 : 0} block=${blockId} line=${lineIdx} scroller.id=${id} scroller.class=${cls} before=${Math.round(beforeTop)} after=${Math.round(afterTop)} moved=${moved} method=${method}`,
    );
  } catch {
    // ignore
  }
}

function getScroller(): HTMLElement | null {
  return getRuntimeScroller(resolveViewerRole());
}

function getLineElementByIndex(scroller: HTMLElement | null, lineIndex: number): HTMLElement | null {
  const idx = Math.max(0, Math.floor(lineIndex));
  const selectors = [
    `.line[data-i="${idx}"]`,
    `.tp-line[data-i="${idx}"]`,
    `.line[data-index="${idx}"]`,
    `.tp-line[data-index="${idx}"]`,
    `.line[data-line="${idx}"]`,
    `.tp-line[data-line="${idx}"]`,
    `.line[data-line-idx="${idx}"]`,
    `.tp-line[data-line-idx="${idx}"]`,
  ];
  const roots: Array<ParentNode | null> = [
    scroller,
    getScriptRoot(),
    getPrimaryScroller(),
    document,
  ];
  for (const root of roots) {
    if (!root) continue;
    for (const selector of selectors) {
      const candidate = (root as ParentNode).querySelector?.(selector) as HTMLElement | null;
      if (candidate) return candidate;
    }
  }
  try {
    const idHit = document.getElementById(`tp-line-${idx}`) as HTMLElement | null;
    if (idHit) return idHit;
  } catch {
    // ignore
  }
  return null;
}

function getIndexedLineElementByIndex(scroller: HTMLElement | null, lineIndex: number): HTMLElement | null {
  const idx = Math.max(0, Math.floor(lineIndex));
  const selectors = [
    `.line[data-i="${idx}"]`,
    `.tp-line[data-i="${idx}"]`,
    `.line[data-index="${idx}"]`,
    `.tp-line[data-index="${idx}"]`,
    `.line[data-line="${idx}"]`,
    `.tp-line[data-line="${idx}"]`,
    `.line[data-line-idx="${idx}"]`,
    `.tp-line[data-line-idx="${idx}"]`,
  ];
  const roots: Array<ParentNode | null> = [
    scroller,
    getScriptRoot(),
    getPrimaryScroller(),
    document,
  ];
  for (const root of roots) {
    if (!root) continue;
    for (const selector of selectors) {
      const candidate = (root as ParentNode).querySelector?.(selector) as HTMLElement | null;
      if (candidate) return candidate;
    }
  }
  try {
    const idHit = document.getElementById(`tp-line-${idx}`) as HTMLElement | null;
    if (idHit) return idHit;
  } catch {
    // ignore
  }
  return null;
}

type WriterAddressabilityProbe = {
  allowed: boolean;
  indexedLineCount: number;
  minIndexedLineCount: number;
  hasTargetIndexedLine: boolean;
  totalLinesHint: number;
};

function assessWriterLineAddressability(
  scroller: HTMLElement | null,
  targetLineIndex: number,
  totalLinesHintInput: number,
): WriterAddressabilityProbe {
  const roots: Array<ParentNode | null> = [scroller, getScriptRoot(), getPrimaryScroller(), document];
  const indexedLineSet = new Set<HTMLElement>();
  for (const root of roots) {
    if (!root) continue;
    let nodes: NodeListOf<HTMLElement> | null = null;
    try {
      nodes = (root as ParentNode).querySelectorAll?.(INDEXED_LINE_SELECTOR) as NodeListOf<HTMLElement> | null;
    } catch {
      nodes = null;
    }
    if (!nodes) continue;
    nodes.forEach((el) => {
      if (el) indexedLineSet.add(el);
    });
  }
  const indexedLineCount = indexedLineSet.size;
  const totalLinesHint = Number.isFinite(totalLinesHintInput) && totalLinesHintInput > 0
    ? Math.max(0, Math.floor(totalLinesHintInput))
    : 0;
  const ratioNeed = totalLinesHint > 0
    ? Math.ceil(totalLinesHint * DEFAULT_WRITER_ADDRESSABLE_MIN_RATIO)
    : DEFAULT_WRITER_ADDRESSABLE_MIN_INDEXED_LINES;
  const minIndexedLineCount = Math.max(
    DEFAULT_WRITER_ADDRESSABLE_MIN_FLOOR,
    Math.min(DEFAULT_WRITER_ADDRESSABLE_MIN_INDEXED_LINES, ratioNeed),
  );
  const hasTargetIndexedLine = !!getIndexedLineElementByIndex(scroller, targetLineIndex);
  return {
    allowed: hasTargetIndexedLine && indexedLineCount >= minIndexedLineCount,
    indexedLineCount,
    minIndexedLineCount,
    hasTargetIndexedLine,
    totalLinesHint,
  };
}

function computeLineTargetTop(scroller: HTMLElement | null, lineEl: HTMLElement | null): number | null {
  if (!scroller || !lineEl) return null;
  const lineHeight = lineEl.offsetHeight || lineEl.clientHeight || 0;
  const markerRatioRaw =
    typeof (window as any).__TP_MARKER_PCT === 'number'
      ? Number((window as any).__TP_MARKER_PCT)
      : POST_COMMIT_ACTIVE_TARGET_RATIO;
  const markerRatio = clamp(markerRatioRaw, POST_COMMIT_ACTIVE_MIN_RATIO, POST_COMMIT_ACTIVE_MAX_RATIO);
  const markerOffsetPx = scroller.clientHeight * markerRatio - lineHeight * 0.5;
  const raw = (lineEl.offsetTop || 0) - markerOffsetPx;
  const biased = raw - MARKER_BIAS_PX;
  const max = Math.max(0, (scroller.scrollHeight || 0) - scroller.clientHeight);
  return clamp(biased, 0, max);
}

function resolveTargetTop(scroller: HTMLElement, lineIndex: number): number | null {
  return computeLineTargetTop(scroller, getLineElementByIndex(scroller, lineIndex));
}

async function findLineElWithRetry(
  scroller: HTMLElement,
  targetIndex: number,
  retries = DEFAULT_LINE_MISSING_LOOKUP_FRAMES,
): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const el = getLineElementByIndex(scroller, targetIndex);
    if (el) return el;
    if (attempt === retries) break;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  return null;
}

function diagnoseNoTarget(scroller: HTMLElement | null, lineIndex: number) {
  const reasons: string[] = [];
  if (!Number.isFinite(lineIndex)) reasons.push('invalid_index');
  if (!scroller) {
    reasons.push('no_scroller');
    return {
      reasons,
      lineEl: null as HTMLElement | null,
      domLines: 0,
      markerIdx: -1,
      scrollerId: 'none',
    };
  }

  const lineEl = getLineElementByIndex(scroller, lineIndex);
  if (!lineEl) reasons.push('line_missing');
  if (lineEl && !lineEl.isConnected) reasons.push('line_detached');
  if (lineEl) {
    try {
      const style = getComputedStyle(lineEl);
      if (style.display === 'none' || style.visibility === 'hidden') {
        reasons.push('line_hidden');
      }
    } catch {}
    try {
      const rect = lineEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) reasons.push('line_zero_rect');
    } catch {}
  }

  if (!scroller.isConnected) reasons.push('scroller_detached');
  try {
    const scrollerStyle = getComputedStyle(scroller);
    if (scrollerStyle.display === 'none' || scrollerStyle.visibility === 'hidden') {
      reasons.push('scroller_hidden');
    }
  } catch {}

  let domLines = 0;
  try { domLines = scroller.querySelectorAll('.line').length; } catch {}
  if (domLines === 0) reasons.push('no_dom_lines');

  const markerIdx = computeMarkerLineIndex(scroller);
  if (!Number.isFinite(markerIdx) || markerIdx < 0) reasons.push('marker_idx_invalid');

  return {
    reasons,
    lineEl,
    domLines,
    markerIdx,
    scrollerId: describeElement(scroller),
  };
}


function estimateTargetTopFromLines(
  scroller: HTMLElement | null,
  baseLineIndex: number,
  targetLineIndex: number,
): number | null {
  if (!scroller) return null;
  const baseIdx = Number.isFinite(baseLineIndex) ? Math.max(0, Math.floor(baseLineIndex)) : 0;
  const targetIdx = Number.isFinite(targetLineIndex) ? Math.max(0, Math.floor(targetLineIndex)) : 0;
  const baseEl =
    getLineElementByIndex(scroller, baseIdx) ||
    scroller.querySelector<HTMLElement>('.line');
  if (!baseEl) return null;
  const lineHeight = baseEl.offsetHeight || baseEl.clientHeight || 0;
  if (!lineHeight) return null;
  const deltaLines = targetIdx - baseIdx;
  const offset = Math.max(0, (scroller.clientHeight - lineHeight) / 2);
  const raw = (baseEl.offsetTop || 0) + deltaLines * lineHeight - offset;
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  return clamp(raw, 0, max);
}

function computeMarkerLineIndex(scroller: HTMLElement | null): number {
  try {
    const viewer = scroller || getPrimaryScroller();
    const root = getScriptRoot() || viewer;
    const container = viewer || root;
    const lineEls = Array.from((container || document).querySelectorAll<HTMLElement>(INDEXED_LINE_SELECTOR));
    if (!lineEls.length) return 0;
    const activeScroller = resolveActiveScroller(viewer as HTMLElement | null, root as HTMLElement | null);
    const scrollTop = activeScroller?.scrollTop ?? 0;
    const firstLineHeight = lineEls[0].offsetHeight || lineEls[0].clientHeight || 0;
    const topEpsilon = Math.max(24, firstLineHeight * 0.5);
    if (scrollTop <= topEpsilon) return 0;
    const markerPct = typeof (window as any).__TP_MARKER_PCT === 'number'
      ? (window as any).__TP_MARKER_PCT
      : 0.4;
    const host = (activeScroller || container) as HTMLElement | null;
    const rect = host ? host.getBoundingClientRect() : document.documentElement.getBoundingClientRect();
    const markerX = rect.left + (host ? host.clientWidth : window.innerWidth) * 0.5;
    const markerY = rect.top + (host ? host.clientHeight : window.innerHeight) * markerPct;
    const markerHit = document.elementFromPoint(markerX, markerY) as HTMLElement | null;
    const markerLine = markerHit?.closest?.('.line, .tp-line') as HTMLElement | null;
    const markerLineIdx = parseLineIndexFromElement(markerLine);
    if (markerLineIdx != null) return markerLineIdx;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < lineEls.length; i++) {
      const el = lineEls[i];
      const idx = parseLineIndexFromElement(el);
      if (idx == null) continue;
      const r = el.getBoundingClientRect();
      const y = r.top + r.height * 0.5;
      const d = Math.abs(y - markerY);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    }
    return Math.max(0, Math.floor(bestIdx));
  } catch {
    return 0;
  }
}

function scheduleCommitTruthProbe(
  scroller: HTMLElement | null,
  payload: {
    beforeScrollTop: number;
    afterScrollTop: number;
    writerSeekLineIdx: number | null;
    commitLineIdx: number;
  },
) {
  if (!isDevMode()) return;
  const before = Number.isFinite(payload.beforeScrollTop) ? Math.round(payload.beforeScrollTop) : 'na';
  const after = Number.isFinite(payload.afterScrollTop) ? Math.round(payload.afterScrollTop) : 'na';
  const writerSeekLineIdx = Number.isFinite(payload.writerSeekLineIdx as number)
    ? Math.max(0, Math.floor(payload.writerSeekLineIdx as number))
    : 'na';
  const commitLineIdx = Number.isFinite(payload.commitLineIdx)
    ? Math.max(0, Math.floor(payload.commitLineIdx))
    : 'na';
  const logFn = () => {
    const postRafTopRaw = scroller?.scrollTop;
    const postRafTop = Number.isFinite(postRafTopRaw as number)
      ? Math.round(postRafTopRaw as number)
      : 'na';
    try {
      console.info(
        `ASR_COMMIT_TRUTH beforeScrollTop=${before} afterScrollTop=${after} writerSeekLineIdx=${writerSeekLineIdx} commitLineIdx=${commitLineIdx} actualViewerScrollTop=${postRafTop}`,
      );
    } catch {
      // ignore
    }
  };
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => window.requestAnimationFrame(logFn));
  } else {
    setTimeout(logFn, 0);
  }
}

export function createAsrScrollDriver(options: DriverOptions = {}): AsrScrollDriver {
  bootTrace('ASRScrollDriver:create', {
    minLineAdvance: options.minLineAdvance,
    seekThrottleMs: options.seekThrottleMs,
    interimConfidenceScale: options.interimConfidenceScale,
    runKey: options.runKey || null,
  });
  const minLineAdvance = Number.isFinite(options.minLineAdvance ?? DEFAULT_MIN_LINE_ADVANCE)
    ? Math.max(0, options.minLineAdvance ?? DEFAULT_MIN_LINE_ADVANCE)
    : DEFAULT_MIN_LINE_ADVANCE;
  const seekThrottleMs = Number.isFinite(options.seekThrottleMs ?? DEFAULT_SEEK_THROTTLE_MS)
    ? Math.max(0, options.seekThrottleMs ?? DEFAULT_SEEK_THROTTLE_MS)
    : DEFAULT_SEEK_THROTTLE_MS;
  const interimScale = Number.isFinite(options.interimConfidenceScale ?? DEFAULT_INTERIM_SCALE)
    ? Math.max(0, options.interimConfidenceScale ?? DEFAULT_INTERIM_SCALE)
    : DEFAULT_INTERIM_SCALE;

  const sessionStartAt = Date.now();
  const driverInstanceId = Math.random().toString(36).slice(2);
  const summaryRunKey = String(options.runKey || '').trim();
  try { console.log('[ASR DRIVER CREATED]', driverInstanceId); } catch {}
  let threshold = resolveThreshold();
  // Respect dev/manual threshold ownership (dev panel/profile overrides) and avoid
  // resetting candidate gate on every speech start.
  if (!isDevMode() && !areAsrThresholdsDirty()) {
    setAsrDriverThresholds({ candidateMinSim: threshold });
  }
  let lastLineIndex = -1;
  let postCatchupUntil = 0;
  let postCatchupSamplesLeft = 0;
  let lastSeekTs = 0;
  let lastSameLineNudgeTs = 0;
  let lastMoveAt = 0;
  let lastIngestAt = 0;
  let lastCommitAt = sessionStartAt;
  let lastCommitTime = sessionStartAt;
  let commitCount = 0;
  let firstCommitIndex: number | null = null;
  let lastCommitIndex: number | null = null;
  let lastKnownScrollTop = 0;
  let summaryEmitted = false;
  let scriptEndEventEmitted = false;
  let lastStallLogAt = 0;
  let lastStarvationWarnAt = 0;
  let lastStarvationRelockAt = 0;
  let lastForwardCommitAt = Date.now();
  let finalsSinceCommit = 0;
  let eventsSinceCommit = 0;
  let lastStuckWatchdogAt = 0;
  let stallRescueRequested = false;
  let stallHudEmitted = false;
  let disposed = false;
  let desyncWarned = false;
  let lowSimStreak = 0;
  let lowSimFirstAt = 0;
  let lowSimFreezeLogged = false;
  let resyncUntil = 0;
  let resyncAnchorIdx: number | null = null;
  let resyncReason: string | null = null;
  let resyncLookaheadBonus = DEFAULT_RESYNC_LOOKAHEAD_BONUS;
  let resyncBacktrackOverride = DEFAULT_MATCH_BACKTRACK_LINES;
  let commitBandReseed: {
    start: number;
    end: number;
    anchor: number;
    until: number;
    reason: string;
  } | null = null;
  let matchAnchorIdx = -1;
  let lastCommittedBlockId = -1;
  let blockCorpusCacheRef: HTMLElement[] | null = null;
  let blockCorpusCache: AsrBlockCorpusEntry[] = [];
    let pursuitTargetTop: number | null = null;
    let appliedTopPx = 0;
    let pursuitVel = 0;
    let pursuitLastTs = 0;
    let pursuitActive = false;
  const logDriverActive = (reason: string) => {
    if (!shouldLogLevel(1)) return;
    const durationMs = Math.max(0, Date.now() - sessionStartAt);
    if (reason === 'dispose' && commitCount <= 0 && durationMs < DRIVER_ACTIVE_DISPOSE_MIN_MS) {
      return;
    }
    if (reason === 'commit' && commitCount > 1) {
      return;
    }
    if (reason.startsWith('summary:') && durationMs < SUMMARY_MIN_DURATION_MS) {
      return;
    }
    try {
      console.log('[ASR DRIVER ACTIVE]', driverInstanceId, {
        reason,
        commitCount,
        durationMs,
        runKey: summaryRunKey || null,
      });
    } catch {}
  };
  logDriverActive('create');

  const getAsrBlockCorpus = (): AsrBlockCorpusEntry[] => {
    const blockEls = getAsrBlockElements();
    if (!Array.isArray(blockEls) || !blockEls.length) {
      blockCorpusCacheRef = null;
      blockCorpusCache = [];
      return [];
    }
    if (blockCorpusCacheRef === blockEls && blockCorpusCache.length) return blockCorpusCache;
    blockCorpusCacheRef = blockEls;
    blockCorpusCache = buildAsrBlockCorpusFromElements(blockEls);
    return blockCorpusCache;
  };

  const findBlockByLine = (
    lineIndex: number,
    corpus: AsrBlockCorpusEntry[] = getAsrBlockCorpus(),
  ): AsrBlockCorpusEntry | null => {
    if (!Number.isFinite(lineIndex) || lineIndex < 0 || !corpus.length) return null;
    const needle = Math.floor(lineIndex);
    for (const entry of corpus) {
      if (needle < entry.startLine || needle > entry.endLine) continue;
      return entry;
    }
    return null;
  };

  const resolveAsrAnchorBlockId = (corpus: AsrBlockCorpusEntry[]): number => {
    if (!corpus.length) return -1;
    const markerIdx = computeCueSafeMarkerIndex(
      getScroller(),
      DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES,
    );
    if (markerIdx >= 0) {
      const markerBlock = findBlockByLine(markerIdx, corpus);
      if (markerBlock) return markerBlock.blockId;
    }
    if (lastCommittedBlockId >= 0 && corpus.some((entry) => entry.blockId === lastCommittedBlockId)) {
      return lastCommittedBlockId;
    }
    return corpus[0].blockId;
  };

  const resolveBlockWindowRange = (
    corpus: AsrBlockCorpusEntry[],
    blockId: number,
    padBlocks = 1,
  ): { startLine: number; endLine: number } | null => {
    if (!corpus.length) return null;
    const center = corpus.findIndex((entry) => entry.blockId === blockId);
    if (center < 0) return null;
    const from = Math.max(0, center - Math.max(0, Math.floor(padBlocks)));
    const to = Math.min(corpus.length - 1, center + Math.max(0, Math.floor(padBlocks)));
    let startLine = Number.POSITIVE_INFINITY;
    let endLine = -1;
    for (let i = from; i <= to; i += 1) {
      startLine = Math.min(startLine, corpus[i].startLine);
      endLine = Math.max(endLine, corpus[i].endLine);
    }
    if (!Number.isFinite(startLine) || !Number.isFinite(endLine) || endLine < startLine) return null;
    return { startLine: Math.max(0, Math.floor(startLine)), endLine: Math.max(0, Math.floor(endLine)) };
  };

  const matchAgainstBlocks = (
    asrNormalized: string,
    anchorBlockId: number,
    corpus: AsrBlockCorpusEntry[],
    opts?: {
      bufferGrowing?: boolean;
      cursorLine?: number;
      forwardLookaheadBlocks?: number;
    },
  ): AsrBlockMatch | null => {
    if (!corpus.length) return null;
    const asrTokens = normTokens(asrNormalized);
    if (!asrTokens.length) return null;
    const anchorPos = corpus.findIndex((entry) => entry.blockId === anchorBlockId);
    const cursorLine = Number(opts?.cursorLine);
    const cursorBlock = Number.isFinite(cursorLine) && cursorLine >= 0
      ? findBlockByLine(Math.floor(cursorLine), corpus)
      : null;
    const cursorBlockPos = cursorBlock
      ? corpus.findIndex((entry) => entry.blockId === cursorBlock.blockId)
      : -1;
    const forwardBasePos = cursorBlockPos >= 0 ? cursorBlockPos : anchorPos;
    const forwardLookaheadBlocks = Number.isFinite(opts?.forwardLookaheadBlocks)
      ? Math.max(1, Math.floor(Number(opts?.forwardLookaheadBlocks)))
      : 2;
    const allowForwardMergedBlocks = opts?.bufferGrowing === true && forwardBasePos >= 0;
    let best: AsrBlockMatch | null = null;
    for (let i = 0; i < corpus.length; i += 1) {
      const entry = corpus[i];
      if (!entry.tokens.length) continue;
      let score = computeLineSimilarityFromTokens(asrTokens, entry.tokens);
      let endLine = entry.endLine;
      let sampleText = entry.textNorm;
      if (
        allowForwardMergedBlocks &&
        i > forwardBasePos &&
        i <= forwardBasePos + forwardLookaheadBlocks &&
        i + 1 < corpus.length
      ) {
        const next = corpus[i + 1];
        if (next?.tokens?.length) {
          const mergedScore = computeLineSimilarityFromTokens(asrTokens, entry.tokens.concat(next.tokens));
          if (mergedScore > score) {
            score = mergedScore;
            endLine = next.endLine;
            sampleText = `${entry.textNorm} ${next.textNorm}`.trim();
          }
        }
      }
      if (anchorPos >= 0) {
        const distance = Math.abs(i - anchorPos);
        score = Math.max(0, score - Math.min(0.05, distance * 0.005));
      }
      if (!best || score > best.conf) {
        best = {
          blockId: entry.blockId,
          conf: score,
          startLine: entry.startLine,
          endLine,
          textNormSample: sampleText.slice(0, 60),
        };
      }
    }
    return best;
  };

  const pickBestLineWithinRange = (
    topScores: Array<{ idx: number; score: number }>,
    range: { startLine: number; endLine: number } | null,
  ): { idx: number; score: number } | null => {
    if (!range || !Array.isArray(topScores) || !topScores.length) return null;
    let best: { idx: number; score: number } | null = null;
    for (const entry of topScores) {
      const idx = Number(entry.idx);
      const score = Number(entry.score);
      if (!Number.isFinite(idx) || !Number.isFinite(score)) continue;
      if (idx < range.startLine || idx > range.endLine) continue;
      const lineEl = getLineElementByIndex(getScroller(), idx);
      const lineText = String(lineEl?.textContent || '').replace(/\s+/g, ' ').trim();
      if (isIgnorableCueLineText(lineText)) continue;
      if (!best || score > best.score) {
        best = { idx: Math.max(0, Math.floor(idx)), score };
      }
    }
    return best;
  };

  const rememberCommittedBlockFromLine = (lineIndex: number): void => {
    const block = findBlockByLine(lineIndex);
    if (block) lastCommittedBlockId = block.blockId;
  };

  function logAsrScrollAttempt(
    stage: 'attempt' | 'denied' | 'applied',
    payload: {
      targetTop: number;
      currentTop: number;
      reason: string;
      scroller?: HTMLElement | null;
      source?: string;
      applied?: boolean;
    },
  ) {
    if (!shouldLogScrollWrite()) return;
    try {
      const topValue =
        typeof payload.targetTop === 'number' && Number.isFinite(payload.targetTop)
          ? Number(payload.targetTop.toFixed(1))
          : payload.targetTop;
      console.info('[ASR_SCROLL_WRITE]', {
        stage,
        reason: payload.reason,
        source: payload.source || 'asr',
        targetTop: topValue,
        currentTop: Math.round(payload.currentTop || 0),
        applied: payload.applied,
        scroller: describeElement(payload.scroller ?? null),
      });
    } catch {}
  }

  function scheduleAsrWriteCheck(
    scroller: HTMLElement,
    before: number,
    reason: string,
    targetTop: number,
    source: string,
  ) {
    if (!shouldLogScrollWrite()) return;
    const logFn = () => {
      try {
        const after = scroller.scrollTop || before;
        logAsrScrollAttempt('applied', {
          targetTop,
          currentTop: before,
          reason,
          source,
          scroller,
          applied: after !== before,
        });
      } catch {}
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(logFn);
    } else {
      setTimeout(logFn, 0);
    }
  }

  function applyScrollWithHybridGuard(
    targetTop: number,
    opts: { scroller?: HTMLElement | null; reason?: string; source?: string },
  ): number {
    const scroller = opts.scroller ?? getScroller();
    const reason = opts.reason ?? 'asr';
    const source = opts.source ?? 'asr';
    const currentTop = scroller?.scrollTop ?? lastKnownScrollTop;
    const mode = getScrollMode();
    logAsrScrollAttempt('attempt', { targetTop, currentTop, reason, scroller, source });
    if (!scroller) {
      logAsrScrollAttempt('denied', {
        targetTop,
        currentTop,
        reason: `${reason}:no-scroller`,
        scroller,
        source,
        applied: false,
      });
      return currentTop;
    }
    if (mode === 'hybrid') {
      logAsrScrollAttempt('denied', {
        targetTop,
        currentTop,
        reason: `${reason}:${mode || 'blocked'}`,
        scroller,
        source,
        applied: false,
      });
      return currentTop;
    }
    const payload = { ...opts, scroller };
    const appliedTop = applyCanonicalScrollTop(targetTop, { ...payload, source });
    scheduleAsrWriteCheck(scroller, currentTop, reason, targetTop, source);
    return appliedTop;
  }
  let calmModeEnabled = false;
  try {
    calmModeEnabled = !!speechStore.get().calmModeEnabled;
  } catch {}
  let activeMotionPreset: 'normal' | 'calm' = calmModeEnabled ? 'calm' : 'normal';
  let motionTuning = { ...(calmModeEnabled ? MOTION_PRESET_CALM : MOTION_PRESET_NORMAL) };
  let lastTuningSnapshot = '';
  let lastTuningHudAt = 0;
  const emitTuningHud = (now: number) => {
    if (now - lastTuningHudAt < 2000) return;
    lastTuningHudAt = now;
    const payload = {
      preset: activeMotionPreset,
      maxLinesPerCommit: Number(motionTuning.maxLinesPerCommit.toFixed(2)),
      deltaSmoothingFactor: Number(motionTuning.deltaSmoothingFactor.toFixed(2)),
      taperExponent: Number(motionTuning.taperExponent.toFixed(2)),
      taperMin: Number(motionTuning.taperMin.toFixed(2)),
      glideMs: Math.round(motionTuning.glideDefaultMs),
      microDeltaLineRatio: Number(motionTuning.microDeltaLineRatio.toFixed(2)),
      microPursuitMs: Math.round(motionTuning.microPursuitMs),
      microMaxPxPerSec: Math.round(motionTuning.microPursuitMaxPxPerSec),
      minPxPerSec: Math.round(motionTuning.minPursuitPxPerSec),
    };
    try { (window as any).__tpHud?.log?.('ASR_TUNING', payload); } catch {}
    try { (window as any).HUD?.log?.('ASR_TUNING', payload); } catch {}
  };
  const syncMotionTuning = (thresholds: ReturnType<typeof getAsrDriverThresholds>, now: number) => {
    const presetName: 'normal' | 'calm' = calmModeEnabled ? 'calm' : 'normal';
    const preset = presetName === 'calm' ? MOTION_PRESET_CALM : MOTION_PRESET_NORMAL;
    const next: typeof motionTuning = { ...preset };
    MOTION_KEYS.forEach((key) => {
      const overrideVal = (thresholds as any)[key];
      const baselineVal = (MOTION_PRESET_NORMAL as any)[key];
      if (Number.isFinite(overrideVal) && Math.abs(overrideVal - baselineVal) > MOTION_OVERRIDE_EPS) {
        (next as any)[key] = overrideVal;
      }
    });
    motionTuning = next;
    if (presetName !== activeMotionPreset) {
      activeMotionPreset = presetName;
      stopGlide('preset-change');
      microPursuitUntil = 0;
      lastCommitDeltaPx = 0;
      pursuitVel = 0;
      pursuitActive = false;
      pursuitTargetTop = null;
    }
    const snapshot = JSON.stringify({ preset: activeMotionPreset, ...motionTuning });
    if (snapshot !== lastTuningSnapshot) {
      lastTuningSnapshot = snapshot;
      emitTuningHud(now);
    }
  };
  const stopGlide = (reason?: string) => {
    if (!glideAnim) return;
    try { glideAnim.cancel(); } catch {}
    glideAnim = null;
    if (reason) {
      logDev('glide canceled', { reason });
    }
  };
  const armMicroPursuit = (now: number, reason?: string, capOverride?: number) => {
    microPursuitUntil = now + Math.max(100, motionTuning.microPursuitMs);
    microPursuitCapPxPerSec = Number.isFinite(capOverride as number)
      ? (capOverride as number)
      : motionTuning.microPursuitMaxPxPerSec;
    if (reason) {
      logDev('micro pursuit', { reason, until: microPursuitUntil });
    }
  };
  const startGlideTo = (
    targetTop: number,
    opts: { scroller?: HTMLElement | null; reason?: string; source?: string; durationMs?: number },
  ): boolean => {
    if (isHybridMode()) return false;
    const scroller = opts.scroller ?? getScroller();
    if (!scroller) return false;
    if (!Number.isFinite(targetTop)) return false;
    stopGlide('retarget');
    const fromTop = Number(scroller.scrollTop || 0);
    const toTop = Number(targetTop);
    if (!Number.isFinite(fromTop) || !Number.isFinite(toTop)) return false;
    const duration = clamp(
      Number.isFinite(opts.durationMs as number) ? (opts.durationMs as number) : motionTuning.glideDefaultMs,
      motionTuning.glideMinMs,
      motionTuning.glideMaxMs,
    );
    let cancelled = false;
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    glideAnim = {
      cancel: () => {
        cancelled = true;
      },
    };
    const step = (ts: number) => {
      if (cancelled) return;
      const now = Number.isFinite(ts) ? ts : (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const t = clamp((now - startedAt) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const nextTop = fromTop + (toTop - fromTop) * eased;
      const applied = applyScrollWithHybridGuard(nextTop, {
        scroller,
        reason: opts.reason ?? 'asr-glide',
        source: opts.source ?? 'asr',
      });
      appliedTopPx = applied;
      lastKnownScrollTop = applied;
      lastMoveAt = Date.now();
      markProgrammaticScroll();
      if (t < 1) {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(step);
        } else {
          setTimeout(() => step((typeof performance !== 'undefined' ? performance.now() : Date.now())), 16);
        }
      } else {
        glideAnim = null;
      }
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(step);
    } else {
      setTimeout(() => step((typeof performance !== 'undefined' ? performance.now() : Date.now())), 0);
    }
    return true;
  };
  const computeDeltaMinSim = (deltaLines: number): number => {
    if (!Number.isFinite(deltaLines) || deltaLines <= 0) return 0;
    if (deltaLines >= DELTA_LARGE_MIN_LINES) return DELTA_MIN_SIM_LARGE;
    if (deltaLines >= DELTA_SMALL_MAX_LINES + 1 && deltaLines <= DELTA_MED_MAX_LINES) {
      return DELTA_MIN_SIM_MED;
    }
    return DELTA_MIN_SIM_SMALL;
  };
  const confirmLargeDelta = (targetLine: number, now: number): boolean => {
    if (!Number.isFinite(targetLine)) return false;
    if (!largeDeltaConfirm) {
      largeDeltaConfirm = { idx: targetLine, ts: now, hits: 1 };
      return false;
    }
    const withinWindow = now - largeDeltaConfirm.ts <= LARGE_DELTA_CONFIRM_WINDOW_MS;
    const withinBand = Math.abs(targetLine - largeDeltaConfirm.idx) <= LARGE_DELTA_CONFIRM_SPREAD;
    if (!withinWindow || !withinBand) {
      largeDeltaConfirm = { idx: targetLine, ts: now, hits: 1 };
      return false;
    }
    largeDeltaConfirm.hits += 1;
    largeDeltaConfirm.ts = now;
    if (largeDeltaConfirm.hits >= LARGE_DELTA_CONFIRM_HITS) {
      largeDeltaConfirm = null;
      return true;
    }
    return false;
  };
  const recordBehindRecoveryHit = (idx: number, sim: number, isFinal: boolean, now: number) => {
    if (!Number.isFinite(idx) || !Number.isFinite(sim)) return;
    if (sim < BEHIND_RECOVERY_MIN_SIM) return;
    behindRecoveryHits.push({ ts: now, idx: Math.max(0, Math.floor(idx)), sim, isFinal });
    // prune old hits
    for (let i = behindRecoveryHits.length - 1; i >= 0; i--) {
      if (now - behindRecoveryHits[i].ts > BEHIND_RECOVERY_WINDOW_MS) {
        behindRecoveryHits.splice(i, 1);
      }
    }
  };
  const tryBehindRecovery = (
    cursorLine: number,
    now: number,
    conf: number,
    rawIdx: number,
    isFinal: boolean,
  ): boolean => {
    if (now - lastBehindRecoveryAt < BEHIND_RECOVERY_COOLDOWN_MS) return false;
    if (cursorLine - rawIdx < BEHIND_RECOVERY_MIN_DELTA) return false;
    const activeHits = behindRecoveryHits.filter((h) => now - h.ts <= BEHIND_RECOVERY_WINDOW_MS);
    if (activeHits.length < BEHIND_RECOVERY_HITS) return false;
    let minIdx = Infinity;
    let maxIdx = -Infinity;
    let finalCount = 0;
    for (const hit of activeHits) {
      if (hit.idx < minIdx) minIdx = hit.idx;
      if (hit.idx > maxIdx) maxIdx = hit.idx;
      if (hit.isFinal) finalCount += 1;
    }
    if (!Number.isFinite(minIdx) || !Number.isFinite(maxIdx)) return false;
    if (maxIdx - minIdx > BEHIND_RECOVERY_CLUSTER_SPREAD) return false;
    if (!isFinal && finalCount === 0 && conf < DELTA_MIN_SIM_MED) return false;
    const targetIdxRaw = Math.min(cursorLine - 1, Math.max(0, Math.floor(maxIdx)));
    const rewind = Math.max(0, cursorLine - targetIdxRaw);
    if (rewind <= 0) return false;
    const targetIdx = rewind > BEHIND_RECOVERY_MAX_REWIND
      ? Math.max(0, cursorLine - BEHIND_RECOVERY_MAX_REWIND)
      : targetIdxRaw;
    const scroller = getScroller();
    const targetTop = scroller ? resolveTargetTop(scroller, targetIdx) : null;
    if (scroller && targetTop != null) {
      stopGlide('behind-recovery');
      const applied = applyScrollWithHybridGuard(targetTop, {
        scroller,
        reason: 'asr-behind-recovery',
      });
      lastKnownScrollTop = applied;
      lastMoveAt = Date.now();
      markProgrammaticScroll();
    }
    lastLineIndex = Math.max(0, Math.floor(targetIdx));
    matchAnchorIdx = lastLineIndex;
    lastForwardCommitAt = now;
    lastSeekTs = now;
    lastEvidenceAt = now;
    noteCommit(cursorLine, lastLineIndex, now);
    closeAmbiguityHold(now, 'behind-recovery', cursorLine, lastLineIndex, conf);
    resetLowSimStreak();
    behindStrongCount = 0;
    lastBehindStrongIdx = -1;
    lastBehindStrongAt = 0;
    behindStrongSince = 0;
    lastCommitDeltaPx = 0;
    microPursuitUntil = 0;
    setCurrentIndex(lastLineIndex, 'behind-recovery');
    resetLookahead('behind-recovery');
    behindRecoveryHits.length = 0;
    largeDeltaConfirm = null;
    overshootRiskUntil = Math.max(overshootRiskUntil, now + OVERSHOOT_RISK_WINDOW_MS);
    lastBehindRecoveryAt = now;
    logThrottled('ASR_COMMIT', 'log', 'ASR_COMMIT', {
      prevIndex: cursorLine,
      nextIndex: lastLineIndex,
      delta: lastLineIndex - cursorLine,
      sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : conf,
      forced: false,
      mode: getScrollMode() || 'unknown',
      reason: 'behind-recovery',
    });
    updateDebugState('behind-recovery');
    return true;
  };
  const tryGraceRollback = (
    cursorLine: number,
    prevLine: number,
    now: number,
    prevSim: number,
    currentSim: number,
    needSim: number,
    matchId?: string,
    clue?: string,
  ): boolean => {
    if (!Number.isFinite(cursorLine) || !Number.isFinite(prevLine)) return false;
    if (getScrollMode() !== 'asr') return false;
    if (!isSessionLivePhase() || !isSessionAsrArmed()) return false;
    const safeCursor = Math.max(0, Math.floor(cursorLine));
    const safePrev = Math.max(0, Math.floor(prevLine));
    if (safePrev !== safeCursor - 1) return false;
    if (now - lastCommitAt > DEFAULT_GRACE_ROLLBACK_WINDOW_MS) return false;
    if (now < graceRollbackCooldownUntil) return false;
    if (!Number.isFinite(prevSim) || prevSim < DEFAULT_GRACE_ROLLBACK_MIN_PREV_SIM) return false;
    if (!Number.isFinite(currentSim)) return false;
    const currentSimLow =
      currentSim <= needSim || currentSim <= DEFAULT_GRACE_ROLLBACK_MAX_CURRENT_SIM;
    if (!currentSimLow) return false;
    const margin = prevSim - currentSim;
    if (!Number.isFinite(margin) || margin < DEFAULT_GRACE_ROLLBACK_MIN_MARGIN) return false;
    const sinceCommitMs = Math.max(0, now - lastCommitAt);
    const scroller = getScroller();
    const targetTop = scroller ? resolveTargetTop(scroller, safePrev) : null;
    if (scroller && targetTop != null) {
      stopGlide('grace-rollback');
      const applied = applyScrollWithHybridGuard(targetTop, {
        scroller,
        reason: 'asr-grace-rollback',
      });
      lastKnownScrollTop = applied;
      lastMoveAt = Date.now();
      markProgrammaticScroll();
    }
    lastLineIndex = safePrev;
    matchAnchorIdx = lastLineIndex;
    lastForwardCommitAt = now;
    lastSeekTs = now;
    lastEvidenceAt = now;
    noteCommit(safeCursor, lastLineIndex, now);
    closeAmbiguityHold(now, 'grace-rollback', safeCursor, lastLineIndex, prevSim);
    resetLowSimStreak();
    behindStrongCount = 0;
    lastBehindStrongIdx = -1;
    lastBehindStrongAt = 0;
    behindStrongSince = 0;
    lastCommitDeltaPx = 0;
    microPursuitUntil = 0;
    setCurrentIndex(lastLineIndex, 'grace-rollback');
    resetLookahead('grace-rollback');
    behindRecoveryHits.length = 0;
    largeDeltaConfirm = null;
    overshootRiskUntil = Math.max(overshootRiskUntil, now + OVERSHOOT_RISK_WINDOW_MS);
    lastBehindRecoveryAt = now;
    graceRollbackCooldownUntil = now + DEFAULT_GRACE_ROLLBACK_COOLDOWN_MS;
    warnGuard('grace_rollback', [
      matchId ? `matchId=${matchId}` : '',
      `current=${safeCursor}`,
      `rollback=${safePrev}`,
      `simPrev=${formatLogScore(prevSim)}`,
      `simCur=${formatLogScore(currentSim)}`,
      `need=${formatLogScore(needSim)}`,
      `margin=${formatLogScore(margin)}`,
      `sinceCommitMs=${sinceCommitMs}`,
      `cooldownMs=${DEFAULT_GRACE_ROLLBACK_COOLDOWN_MS}`,
      clue ? `clue="${clue}"` : '',
    ]);
    emitHudStatus(
      'grace_rollback',
      `Rollback: corrected to line ${safePrev}`,
    );
    logThrottled('ASR_COMMIT', 'log', 'ASR_COMMIT', {
      prevIndex: safeCursor,
      nextIndex: lastLineIndex,
      delta: lastLineIndex - safeCursor,
      sim: Number.isFinite(prevSim) ? Number(prevSim.toFixed(3)) : prevSim,
      forced: false,
      mode: getScrollMode() || 'unknown',
      reason: 'grace-rollback',
    });
    if (isDevMode()) {
      try {
        console.info(
          `ASR_GRACE_ROLLBACK current=${safeCursor} rollback=${safePrev} simPrev=${formatLogScore(prevSim)} simCur=${formatLogScore(currentSim)} need=${formatLogScore(needSim)} margin=${formatLogScore(margin)}`,
        );
      } catch {}
    }
    updateDebugState('grace-rollback');
    return true;
  };
  let lastEvidenceAt = 0;
  let lastCommitDeltaPx = 0;
  let glideAnim: { cancel: () => void } | null = null;
  let microPursuitUntil = 0;
  let microPursuitCapPxPerSec = MICRO_PURSUE_MAX_PXPS;
  let creepBudgetLine = -1;
  let creepBudgetUsed = 0;
  let lastInterimBestIdx = -1;
  let interimRepeatCount = 0;
  let relockRepeatIdx = -1;
  let relockRepeatCount = 0;
  let relockRepeatWindowStart = 0;
  let lastResyncAt = 0;
  let lastBehindStrongIdx = -1;
  let lastBehindStrongAt = 0;
  let behindStrongSince = 0;
  let behindStrongCount = 0;
  let behindDebt = 0;
  let behindDebtStreak = 0;
  let lastBehindRecoveryAt = 0;
  let overshootRiskUntil = 0;
  let largeDeltaConfirm: { idx: number; ts: number; hits: number } | null = null;
  const behindRecoveryHits: Array<{ ts: number; idx: number; sim: number; isFinal: boolean }> = [];
  let stableInterimTranscriptNorm = '';
  let stableInterimLastMeaningfulChangeAt = 0;
  let lastStableInterimNudgeAt = 0;
  let lastBadCursorOnCueLogAt = 0;
  let noProgressStreak = 0;
  let lostForwardWallStreak = 0;
  let lastProgressCursorLine = -1;
  let lastCueStallRescueAt = 0;
  let lostForwardActive = false;
  let lostForwardStage = 0;
  let lostForwardEnteredAt = 0;
  let lastMicroRelockAt = 0;
  let microRelockPreferredCursor: number | null = null;
  let microRelockPreferredUntil = 0;
  let graceRollbackCooldownUntil = 0;
  let lookaheadStepIndex = 0;
  let lastLookaheadBumpAt = 0;
  let behindHitCount = 0;
  let behindHitWindowStart = 0;
  let lagRelockHits = 0;
  let lagRelockWindowStart = 0;
  let ambiguityHoldActive = false;
  let ambiguityHoldSince = 0;
  let ambiguityHoldReason = '';
  let ambiguityHoldBestIdx = -1;
  let ambiguityHoldBestSim = 0;
  let ambiguityHoldSecondIdx = -1;
  let ambiguityHoldSecondSim = 0;
  let lastAmbiguityHoldTickAt = 0;
    let pendingMatch: PendingMatch | null = null;
    let pendingSeq = 0;

    const adoptPendingMatch = (next: PendingMatch) => {
      pendingMatch = next;
      pendingSeq += 1;
      return pendingMatch;
    };
    let pendingRaf = 0;
    let postCommitReadabilitySeq = 0;
    const postCommitReadabilityTimers = new Set<number>();
    let bootLogged = false;
    let forcedCooldownUntil = 0;
    const forcedCommitTimes: number[] = [];
    let jumpHistory: number[] = [];
    const LINE_MISSING_RETRY_LIMIT = 2;
    let lineMissingRetryLine: number | null = null;
    let lineMissingRetryCount = 0;
    let anchorStreakLine: number | null = null;
    let anchorStreakCount = 0;
    let noTargetRetryLine = -1;
    let noTargetRetryCount = 0;
    let noTargetRetryAt = 0;
    let noTargetRetryMatchId: string | null = null;
    let noMatchWindowStart = 0;
    let noMatchHits = 0;
    let lastNoMatchAt = 0;
    let lastStuckDumpAt = 0;
    let lastMatchId: string | undefined;
    let syntheticMatchIdSeq = 0;
    let lastScriptHash = '';
    let missingMatchIdKeysLogged = false;
    const nextSyntheticMatchId = () => {
      syntheticMatchIdSeq += 1;
      return `drv-${Date.now().toString(36)}-${syntheticMatchIdSeq}`;
    };
  const resetAmbiguityHoldState = () => {
    ambiguityHoldActive = false;
    ambiguityHoldSince = 0;
    ambiguityHoldReason = '';
    ambiguityHoldBestIdx = -1;
    ambiguityHoldBestSim = 0;
    ambiguityHoldSecondIdx = -1;
    ambiguityHoldSecondSim = 0;
    lastAmbiguityHoldTickAt = 0;
  };
  const emitAmbiguityHoldEvent = (
    phase: 'enter' | 'tick' | 'exit',
    now: number,
    reason: string,
    cursorLine: number,
    bestIdx: number,
    bestSim: number,
    secondIdx: number | null,
    secondSim: number | null,
    overlapCount?: number | null,
    anchorIdx?: number | null,
    anchorSim?: number | null,
  ) => {
    const safeCursor = Number.isFinite(cursorLine)
      ? Math.max(0, Math.floor(cursorLine))
      : 0;
    const safeBest = Number.isFinite(bestIdx)
      ? Math.max(0, Math.floor(bestIdx))
      : safeCursor;
    const safeBestSim = Number.isFinite(bestSim) ? bestSim : 0;
    const safeSecondIdx = Number.isFinite(secondIdx as number)
      ? Math.max(0, Math.floor(Number(secondIdx)))
      : null;
    const safeSecondSim = Number.isFinite(secondSim as number) ? Number(secondSim) : null;
    const safeOverlapCount = Number.isFinite(overlapCount as number)
      ? Math.max(0, Math.floor(Number(overlapCount)))
      : null;
    const safeAnchorIdx = Number.isFinite(anchorIdx as number)
      ? Math.max(0, Math.floor(Number(anchorIdx)))
      : null;
    const safeAnchorSim = Number.isFinite(anchorSim as number) ? Number(anchorSim) : null;
    const holdAgeMs = ambiguityHoldSince > 0 ? Math.max(0, now - ambiguityHoldSince) : 0;
    const payload = {
      phase,
      ts: now,
      reason,
      cursorLine: safeCursor,
      bestIdx: safeBest,
      bestSim: Number(safeBestSim.toFixed(3)),
      secondIdx: safeSecondIdx,
      secondSim: safeSecondSim != null ? Number(safeSecondSim.toFixed(3)) : null,
      overlapCount: safeOverlapCount,
      delta: safeBest - safeCursor,
      holdAgeMs,
      anchorIdx: safeAnchorIdx,
      anchorSim: safeAnchorSim != null ? Number(safeAnchorSim.toFixed(3)) : null,
    };
    if (typeof window !== 'undefined') {
      try { (window as any).__tpAsrHoldLast = payload; } catch {}
      try { window.dispatchEvent(new CustomEvent('tp:asr:hold', { detail: payload })); } catch {}
    }
    if (!isDevMode()) return;
    try {
      if (phase === 'enter') {
        const gap = safeSecondSim != null
          ? Number((safeBestSim - safeSecondSim).toFixed(3))
          : null;
        console.info('ASR_HOLD_ENTER', {
          reason,
          bestSim: Number(safeBestSim.toFixed(3)),
          gap,
          overlapCount: safeOverlapCount,
          bestIdx: safeBest,
          secondIdx: safeSecondIdx,
        });
      }
      if (
        phase === 'exit' &&
        safeAnchorIdx != null &&
        safeAnchorSim != null &&
        /anchor/i.test(String(reason || ''))
      ) {
        console.info('ASR_HOLD_EXIT', {
          reason: 'anchor',
          anchorIdx: safeAnchorIdx,
          anchorSim: Number(safeAnchorSim.toFixed(3)),
        });
      }
      const tag = phase === 'enter' ? 'ASR_HOLD_ENTER' : phase === 'exit' ? 'ASR_HOLD_EXIT' : 'ASR_HOLD_TICK';
      const secondPart = safeSecondIdx != null
        ? `${safeSecondIdx}:${formatLogScore(safeSecondSim ?? Number.NaN)}`
        : '-';
      const anchorPart = safeAnchorIdx != null
        ? ` anchor=${safeAnchorIdx}:${formatLogScore(safeAnchorSim ?? Number.NaN)}`
        : '';
      console.info(
        `${tag} reason=${reason} current=${safeCursor} best=${safeBest} sim=${formatLogScore(safeBestSim)} second=${secondPart} holdMs=${holdAgeMs}${anchorPart}`,
      );
    } catch {}
  };
  const beginOrRefreshAmbiguityHold = (
    now: number,
    reason: string,
    cursorLine: number,
    bestIdx: number,
    bestSim: number,
    secondIdx: number | null,
    secondSim: number | null,
    overlapCount?: number | null,
  ) => {
    const safeReason = String(reason || '').trim() || 'await_anchor';
    ambiguityHoldReason = safeReason;
    ambiguityHoldBestIdx = Number.isFinite(bestIdx)
      ? Math.max(0, Math.floor(bestIdx))
      : Math.max(0, Math.floor(cursorLine));
    ambiguityHoldBestSim = Number.isFinite(bestSim) ? bestSim : 0;
    ambiguityHoldSecondIdx = Number.isFinite(secondIdx as number)
      ? Math.max(0, Math.floor(Number(secondIdx)))
      : -1;
    ambiguityHoldSecondSim = Number.isFinite(secondSim as number) ? Number(secondSim) : 0;
    if (!ambiguityHoldActive) {
      ambiguityHoldActive = true;
      ambiguityHoldSince = now;
      lastAmbiguityHoldTickAt = now;
      warnGuard('hold_wait', [
        `reason=${safeReason}`,
        `current=${Math.max(0, Math.floor(cursorLine))}`,
        `best=${ambiguityHoldBestIdx}`,
        `sim=${formatLogScore(ambiguityHoldBestSim)}`,
        ambiguityHoldSecondIdx >= 0
          ? `second=${ambiguityHoldSecondIdx}:${formatLogScore(ambiguityHoldSecondSim)}`
          : '',
      ]);
      emitHudStatus(
        'hold_wait',
        `Hold: waiting for anchor (${safeReason}, sim=${formatLogScore(ambiguityHoldBestSim)})`,
      );
      emitAmbiguityHoldEvent(
        'enter',
        now,
        safeReason,
        cursorLine,
        ambiguityHoldBestIdx,
        ambiguityHoldBestSim,
        ambiguityHoldSecondIdx >= 0 ? ambiguityHoldSecondIdx : null,
        ambiguityHoldSecondIdx >= 0 ? ambiguityHoldSecondSim : null,
        overlapCount,
      );
      return;
    }
    emitHudStatus(
      'hold_wait',
      `Hold: waiting for anchor (${safeReason}, sim=${formatLogScore(ambiguityHoldBestSim)})`,
    );
    if (now - lastAmbiguityHoldTickAt < HOLD_TICK_LOG_THROTTLE_MS) return;
    lastAmbiguityHoldTickAt = now;
    emitAmbiguityHoldEvent(
      'tick',
      now,
      safeReason,
      cursorLine,
      ambiguityHoldBestIdx,
      ambiguityHoldBestSim,
      ambiguityHoldSecondIdx >= 0 ? ambiguityHoldSecondIdx : null,
      ambiguityHoldSecondIdx >= 0 ? ambiguityHoldSecondSim : null,
      overlapCount,
    );
  };
  const closeAmbiguityHold = (
    now: number,
    reason: string,
    cursorLine?: number,
    bestIdx?: number,
    bestSim?: number,
    secondIdx?: number | null,
    secondSim?: number | null,
    anchorIdx?: number | null,
    anchorSim?: number | null,
  ) => {
    if (!ambiguityHoldActive) return;
    const safeCursor = Number.isFinite(cursorLine as number)
      ? Math.max(0, Math.floor(Number(cursorLine)))
      : Math.max(0, Math.floor(lastLineIndex));
    const safeBestIdx = Number.isFinite(bestIdx as number)
      ? Math.max(0, Math.floor(Number(bestIdx)))
      : (ambiguityHoldBestIdx >= 0 ? ambiguityHoldBestIdx : safeCursor);
    const safeBestSim = Number.isFinite(bestSim as number)
      ? Number(bestSim)
      : ambiguityHoldBestSim;
    const safeSecondIdx = Number.isFinite(secondIdx as number)
      ? Math.max(0, Math.floor(Number(secondIdx)))
      : (ambiguityHoldSecondIdx >= 0 ? ambiguityHoldSecondIdx : null);
    const safeSecondSim = Number.isFinite(secondSim as number)
      ? Number(secondSim)
      : (ambiguityHoldSecondIdx >= 0 ? ambiguityHoldSecondSim : null);
    emitAmbiguityHoldEvent(
      'exit',
      now,
      String(reason || '').trim() || 'resolved',
      safeCursor,
      safeBestIdx,
      safeBestSim,
      safeSecondIdx,
      safeSecondSim,
      null,
      anchorIdx,
      anchorSim,
    );
    resetAmbiguityHoldState();
  };
  const armPostCatchupGrace = (reason: string) => {
    const now = Date.now();
    postCatchupUntil = now + POST_CATCHUP_MS;
    postCatchupSamplesLeft = POST_CATCHUP_SAMPLES;
    logDev('[ASR] post catchup armed', { reason, until: postCatchupUntil });
  };
  const isPostCatchupActive = (now: number) =>
    now < postCatchupUntil && postCatchupSamplesLeft > 0;
  const getLostForwardLookaheadLines = () =>
    LOST_FORWARD_WINDOW_STEPS[
      Math.min(
        Math.max(0, Math.floor(lostForwardStage)),
        LOST_FORWARD_WINDOW_STEPS.length - 1,
      )
    ];
  const isDeepLostForwardMode = () =>
    Math.max(0, Math.floor(lostForwardStage)) >= LOST_FORWARD_WINDOW_STEPS.length - 1;
  const getLostForwardCommitCapLines = () =>
    isDeepLostForwardMode()
      ? DEFAULT_TELEPORT_DEEP_CAP_LINES
      : DEFAULT_TELEPORT_STANDARD_CAP_LINES;
  const exitLostForwardMode = (reason: string) => {
    if (!lostForwardActive) return;
    const stage = lostForwardStage;
    const windowAhead = getLostForwardLookaheadLines();
    lostForwardActive = false;
    lostForwardStage = 0;
    lostForwardEnteredAt = 0;
    emitHudStatus('lost_forward', `LOST_FORWARD off (${reason})`);
    if (isDevMode()) {
      try {
        console.info(
          `ASR_LOST_FORWARD_EXIT reason=${reason} stage=${stage} window=+${windowAhead} streak=${noProgressStreak} cursor=${lastLineIndex}`,
        );
      } catch {}
    }
  };
  const resetNoProgressStreak = (reason: string, cursorLine?: number) => {
    noProgressStreak = 0;
    lostForwardWallStreak = 0;
    if (Number.isFinite(cursorLine as number)) {
      lastProgressCursorLine = Math.max(lastProgressCursorLine, Math.max(0, Math.floor(cursorLine as number)));
    }
    exitLostForwardMode(reason);
    if (!lostForwardActive) {
      lostForwardStage = 0;
    }
  };
  const noteNoProgressIngest = (
    now: number,
    cursorLine: number,
    bestMatchLine: number,
    similarity: number,
    commitThreshold: number,
  ) => {
    if (!Number.isFinite(cursorLine) || cursorLine < 0) return;
    const cursor = Math.max(0, Math.floor(cursorLine));
    if (cursor > lastProgressCursorLine) {
      resetNoProgressStreak('cursor-advance', cursor);
      return;
    }
    const bestLine = Number.isFinite(bestMatchLine) ? Math.max(0, Math.floor(bestMatchLine)) : cursor;
    const sim = Number.isFinite(similarity) ? similarity : 0;
    const need = Number.isFinite(commitThreshold) ? clamp(commitThreshold, 0, 1) : 1;
    const healthyLock = bestLine === cursor && sim >= DEFAULT_LOST_HEALTHY_LOCK_SIM;
    if (healthyLock) {
      resetNoProgressStreak('healthy-lock', cursor);
      if (isDevMode()) {
        try {
          console.info(
            `ASR_LOST_FORWARD_HEALTHY_LOCK cursor=${cursor} sim=${formatLogScore(sim)} lockNeed=${formatLogScore(DEFAULT_LOST_HEALTHY_LOCK_SIM)}`,
          );
        } catch {}
      }
      return;
    }
    const commitWouldAdvance = bestLine > cursor && sim >= need;
    const commitDidNotFire = !commitWouldAdvance;
    const shouldIncrement =
      bestLine <= cursor ||
      sim < need ||
      commitDidNotFire;
    if (!shouldIncrement) return;
    noProgressStreak += 1;
    if (!lostForwardActive && noProgressStreak >= LOST_FORWARD_STAGE_STREAKS[0]) {
      lostForwardActive = true;
      lostForwardStage = 0;
      lostForwardEnteredAt = now;
      const windowAhead = getLostForwardLookaheadLines();
      emitHudStatus('lost_forward', `LOST_FORWARD on (+${windowAhead})`);
      if (isDevMode()) {
        try {
          console.info(
            `ASR_LOST_FORWARD_ENTER stage=${lostForwardStage} window=+${windowAhead} streak=${noProgressStreak} cursor=${cursor} best=${bestLine} sim=${formatLogScore(sim)} need=${formatLogScore(need)}`,
          );
        } catch {}
      }
      return;
    }
    if (!lostForwardActive) return;
    const nextStage = Math.min(
      lostForwardStage + 1,
      LOST_FORWARD_WINDOW_STEPS.length - 1,
    );
    const stageStreakNeed = LOST_FORWARD_STAGE_STREAKS[nextStage];
    if (
      nextStage > lostForwardStage &&
      Number.isFinite(stageStreakNeed as number) &&
      noProgressStreak >= Math.max(0, Math.floor(stageStreakNeed as number))
    ) {
      lostForwardStage = nextStage;
      const windowAhead = getLostForwardLookaheadLines();
      emitHudStatus('lost_forward', `LOST_FORWARD ramp (+${windowAhead})`);
      if (isDevMode()) {
        try {
          console.info(
            `ASR_LOST_FORWARD_RAMP stage=${lostForwardStage} window=+${windowAhead} streak=${noProgressStreak} cursor=${cursor} best=${bestLine} sim=${formatLogScore(sim)} need=${formatLogScore(need)}`,
          );
        } catch {}
      }
    }
  };
  const attemptForwardRelock = (
    now: number,
    cursorLine: number,
    transcriptText: string,
    isFinal: boolean,
  ) => {
    if (now - lastStarvationRelockAt < DEFAULT_STARVATION_RELOCK_COOLDOWN_MS) {
      return {
        attempted: false,
        applied: false,
        reason: 'cooldown',
        candidateIdx: null as number | null,
        candidateScore: null as number | null,
        threshold: null as number | null,
        candidatesChecked: 0,
      };
    }
    lastStarvationRelockAt = now;
    if (!Number.isFinite(cursorLine) || cursorLine < 0) {
      return {
        attempted: true,
        applied: false,
        reason: 'cursor_invalid',
        candidateIdx: null,
        candidateScore: null,
        threshold: null,
        candidatesChecked: 0,
      };
    }
    const matcherInputs = buildForwardMatcherInputs(transcriptText, transcriptText, isFinal);
    if (!matcherInputs.length) {
      return {
        attempted: true,
        applied: false,
        reason: 'no_matcher_inputs',
        candidateIdx: null,
        candidateScore: null,
        threshold: null,
        candidatesChecked: 0,
      };
    }
    const cursor = Math.max(0, Math.floor(cursorLine));
    const rangeStart = cursor + 1;
    const totalLines = getTotalLines();
    const rangeEnd = totalLines > 0
      ? Math.min(totalLines - 1, cursor + DEFAULT_STARVATION_RELOCK_LOOKAHEAD_LINES)
      : (cursor + DEFAULT_STARVATION_RELOCK_LOOKAHEAD_LINES);
    const candidateLineIdx: number[] = [];
    for (let idx = rangeStart; idx <= rangeEnd; idx += 1) {
      const lineText = getLineTextAt(idx);
      if (!lineText || isIgnorableCueLineText(lineText)) continue;
      candidateLineIdx.push(idx);
    }
    if (!candidateLineIdx.length) {
      return {
        attempted: true,
        applied: false,
        reason: 'no_forward_candidates',
        candidateIdx: null,
        candidateScore: null,
        threshold: null,
        candidatesChecked: 0,
      };
    }
    const matcherTokenSets = matcherInputs
      .map((value) => normTokens(value))
      .filter((tokens) => tokens.length > 0);
    if (!matcherTokenSets.length) {
      return {
        attempted: true,
        applied: false,
        reason: 'no_matcher_tokens',
        candidateIdx: null,
        candidateScore: null,
        threshold: null,
        candidatesChecked: candidateLineIdx.length,
      };
    }
    const scoreByIdx = new Map<number, number>();
    candidateLineIdx.forEach((idx) => {
      const lineNorm = normalizeComparableText(getLineTextAt(idx));
      const lineTokens = lineNorm ? normTokens(lineNorm) : [];
      if (!lineTokens.length) return;
      let bestLineScore = 0;
      for (const tokenSet of matcherTokenSets) {
        const score = computeLineSimilarityFromTokens(tokenSet, lineTokens);
        if (score > bestLineScore) bestLineScore = score;
      }
      scoreByIdx.set(idx, bestLineScore);
    });
    const windowScores = buildForwardWindowScores(
      candidateLineIdx,
      matcherInputs,
      Math.min(DEFAULT_FORWARD_WINDOW_MAX_LINES, DEFAULT_STARVATION_RELOCK_LOOKAHEAD_LINES),
    );
    windowScores.forEach((entry) => {
      const existing = scoreByIdx.get(entry.idx);
      if (!Number.isFinite(existing as number) || entry.score > (existing as number)) {
        scoreByIdx.set(entry.idx, entry.score);
      }
    });
    const scoredCandidates: Array<{ idx: number; score: number }> = [];
    scoreByIdx.forEach((score, idx) => {
      if (!Number.isFinite(score)) return;
      scoredCandidates.push({ idx, score });
    });
    scoredCandidates.sort((a, b) => b.score - a.score || a.idx - b.idx);
    const bestCandidate: { idx: number; score: number } | null = scoredCandidates[0] || null;
    const thresholds = getAsrDriverThresholds();
    const baseCommitThreshold = isFinal
      ? thresholds.commitFinalMinSim
      : clamp(thresholds.commitInterimMinSim * interimScale, 0, 1);
    const relockThresholdFloor = Math.max(DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM, thresholds.candidateMinSim);
    const relockThreshold = clamp(baseCommitThreshold - DEFAULT_STARVATION_RELOCK_SIM_SLACK, relockThresholdFloor, 1);
    if (!bestCandidate || bestCandidate.score < relockThreshold) {
      return {
        attempted: true,
        applied: false,
        reason: 'below_threshold',
        candidateIdx: bestCandidate?.idx ?? null,
        candidateScore: bestCandidate != null ? Number(bestCandidate.score.toFixed(3)) : null,
        threshold: Number(relockThreshold.toFixed(3)),
        candidatesChecked: candidateLineIdx.length,
      };
    }
    matchAnchorIdx = bestCandidate.idx;
    reseedCommitBandFromIndex(bestCandidate.idx, now, 'starvation-relock');
    resetNoProgressStreak('starvation-relock', cursor);
    emitHudStatus(
      'relock',
      `Relock: starvation +${Math.max(1, bestCandidate.idx - cursor)}`,
    );
    logDev('starvation relock', {
      cursor,
      candidate: bestCandidate.idx,
      sim: Number(bestCandidate.score.toFixed(3)),
      need: Number(relockThreshold.toFixed(3)),
      lostForwardStage,
    });
    return {
      attempted: true,
      applied: true,
      reason: 'applied',
      candidateIdx: bestCandidate.idx,
      candidateScore: Number(bestCandidate.score.toFixed(3)),
      threshold: Number(relockThreshold.toFixed(3)),
      candidatesChecked: candidateLineIdx.length,
    };
  };
  const clearMicroRelockPreference = () => {
    microRelockPreferredCursor = null;
    microRelockPreferredUntil = 0;
  };

  const matchBacktrackLines = DEFAULT_MATCH_BACKTRACK_LINES;
  const matchLookaheadLines = DEFAULT_MATCH_LOOKAHEAD_LINES;
  const matchLookaheadSteps =
    DEFAULT_MATCH_LOOKAHEAD_STEPS.length > 0 ? DEFAULT_MATCH_LOOKAHEAD_STEPS : [matchLookaheadLines];
  const lookaheadBumpCooldownMs = DEFAULT_LOOKAHEAD_BUMP_COOLDOWN_MS;
  const lookaheadBehindHits = DEFAULT_LOOKAHEAD_BEHIND_HITS;
  const lookaheadBehindWindowMs = DEFAULT_LOOKAHEAD_BEHIND_WINDOW_MS;
  const lookaheadStallMs = DEFAULT_LOOKAHEAD_STALL_MS;
  const matchLookaheadMax = matchLookaheadSteps[matchLookaheadSteps.length - 1] || matchLookaheadLines;
  const sameLineThrottleMs = DEFAULT_SAME_LINE_THROTTLE_MS;
  const creepPx = DEFAULT_CREEP_PX;
  const creepNearPx = DEFAULT_CREEP_NEAR_PX;
  const creepBudgetPx = DEFAULT_CREEP_BUDGET_PX;
  const deadbandPx = DEFAULT_DEADBAND_PX;
  const maxVelPxPerSec = DEFAULT_MAX_VEL_PX_PER_SEC;
  const maxVelMedPxPerSec = DEFAULT_MAX_VEL_MED_PX_PER_SEC;
  const maxVelCatchupPxPerSec = DEFAULT_MAX_VEL_CATCHUP_PX_PER_SEC;
  const maxAccelPxPerSec2 = DEFAULT_MAX_ACCEL_PX_PER_SEC2;
  const minStepPx = DEFAULT_MIN_STEP_PX;
  const maxStepPx = Math.max(DEFAULT_MAX_STEP_PX, minStepPx);
  const catchupMedMinPx = DEFAULT_CATCHUP_MED_MIN_PX;
  const catchupFastMinPx = DEFAULT_CATCHUP_FAST_MIN_PX;
  const maxTargetJumpPx = DEFAULT_MAX_TARGET_JUMP_PX;
  const strongWindowMs = DEFAULT_STRONG_WINDOW_MS;
  const finalEvidenceLeadLines = DEFAULT_FINAL_EVIDENCE_LEAD_LINES;
  const realignLeadLines = DEFAULT_REALIGN_LEAD_LINES;
  const realignLookbackLines = DEFAULT_REALIGN_LOOKBACK_LINES;
  const realignSim = DEFAULT_REALIGN_SIM;
  const resyncWindowMs = DEFAULT_RESYNC_WINDOW_MS;
  const resyncCooldownMs = DEFAULT_RESYNC_COOLDOWN_MS;
  const strongBackSim = DEFAULT_STRONG_BACK_SIM;
  const backConfirmHits = DEFAULT_BACK_CONFIRM_HITS;
  const backConfirmWindowMs = DEFAULT_BACK_CONFIRM_WINDOW_MS;
  const behindRecoveryMs = DEFAULT_BEHIND_RECOVERY_MS;
  const behindRecoveryMaxLines = DEFAULT_BEHIND_RECOVERY_MAX_LINES;
  const behindRecoveryMinSim = DEFAULT_BEHIND_RECOVERY_MIN_SIM;
  const behindRecoveryCooldownMs = DEFAULT_BEHIND_RECOVERY_COOLDOWN_MS;
  const forwardTieEps = DEFAULT_FORWARD_TIE_EPS;
  const slamDunkCompetitorDelta = DEFAULT_FORWARD_TIE_EPS;
  const forwardBiasRecentLines = DEFAULT_FORWARD_BIAS_RECENT_LINES;
  const forwardBiasWindowMs = DEFAULT_FORWARD_BIAS_WINDOW_MS;
  const forwardBiasLookaheadLines = DEFAULT_FORWARD_BIAS_LOOKAHEAD_LINES;
  const forwardBiasSimSlack = DEFAULT_FORWARD_BIAS_SIM_SLACK;
  const shortFinalMinTokens = DEFAULT_SHORT_FINAL_MIN_TOKENS;
  const shortFinalMaxTokens = DEFAULT_SHORT_FINAL_MAX_TOKENS;
  const shortFinalWindowMs = DEFAULT_SHORT_FINAL_WINDOW_MS;
  const shortFinalLookaheadLines = DEFAULT_SHORT_FINAL_LOOKAHEAD_LINES;
  const shortFinalSimSlack = DEFAULT_SHORT_FINAL_SIM_SLACK;
  const outrunRelaxedSim = DEFAULT_OUTRUN_RELAXED_SIM;
  const outrunWindowMs = DEFAULT_OUTRUN_WINDOW_MS;
  const outrunLookaheadLines = DEFAULT_OUTRUN_LOOKAHEAD_LINES;
  const forcedRateWindowMs = DEFAULT_FORCED_RATE_WINDOW_MS;
  const forcedRateMax = DEFAULT_FORCED_RATE_MAX;
  const forcedCooldownMs = DEFAULT_FORCED_COOLDOWN_MS;
  const forcedMinTokens = DEFAULT_FORCED_MIN_TOKENS;
  const forcedMinChars = DEFAULT_FORCED_MIN_CHARS;
  const stuckWatchdogFinalEvents = DEFAULT_STUCK_WATCHDOG_FINAL_EVENTS;
  const stuckWatchdogNoCommitMs = DEFAULT_STUCK_WATCHDOG_NO_COMMIT_MS;
  const stuckWatchdogCooldownMs = DEFAULT_STUCK_WATCHDOG_COOLDOWN_MS;
  const stuckWatchdogMaxDeltaLines = DEFAULT_STUCK_WATCHDOG_MAX_DELTA_LINES;
  const stuckWatchdogForwardFloor = DEFAULT_STUCK_WATCHDOG_FORWARD_FLOOR;
  const stuckWatchdogInterimEvents = DEFAULT_STUCK_WATCHDOG_INTERIM_EVENTS;
  const stuckWatchdogInterimRecentMs = DEFAULT_STUCK_WATCHDOG_INTERIM_RECENT_MS;
  const slamDunkSim = DEFAULT_SLAM_DUNK_SIM;
  const slamDunkMaxDelta = DEFAULT_SLAM_DUNK_MAX_DELTA;
  const confirmationRelaxedSim = DEFAULT_CONFIRMATION_RELAXED_SIM;
  const confirmationRelaxedMaxDelta = DEFAULT_CONFIRMATION_RELAXED_MAX_DELTA;
  const noMatchWindowMs = DEFAULT_NO_MATCH_WINDOW_MS;
  const noMatchBumpHits = DEFAULT_NO_MATCH_BUMP_HITS;
  const noMatchRelockHits = DEFAULT_NO_MATCH_RELOCK_HITS;
  let minTokenCount = DEFAULT_MIN_TOKEN_COUNT;
  let minEvidenceChars = DEFAULT_MIN_EVIDENCE_CHARS;
  let interimHysteresisBonus = DEFAULT_INTERIM_HYSTERESIS_BONUS;
  let interimStableRepeats = DEFAULT_INTERIM_STABLE_REPEATS;
  let bufferMs = 0;
  let allowShortEvidence = true;
  let allowCatchup = false;
  let allowInterimCommit = true;
  let consistencyCount = 0;
  let consistencyWindowMs = 0;
  let consistencyMaxDeltaLines = 0;
  let consistencyMaxSpreadLines = 0;
  let consistencySimSlack = 0;
  let consistencyRequireNearMarker = true;
  let consistencyMarkerBandLines = 0;
  let catchupMaxDeltaLines = 0;
  let catchupSimSlack = 0;
  const shortTokenMax = DEFAULT_SHORT_TOKEN_MAX;
  const shortTokenBoost = DEFAULT_SHORT_TOKEN_BOOST;
  const ambiguitySimDelta = DEFAULT_AMBIGUITY_SIM_DELTA;
  const ambiguityNearLines = DEFAULT_AMBIGUITY_NEAR_LINES;
  const ambiguityFarLines = DEFAULT_AMBIGUITY_FAR_LINES;
  const strongHits: Array<{ ts: number; idx: number; conf: number; isFinal: boolean }> = [];
  const pushStrongHit = (idx: number, conf: number, isFinal: boolean, ts: number) => {
    if (!Number.isFinite(idx)) return;
    strongHits.push({ ts, idx, conf, isFinal });
    while (strongHits.length && strongHits[0].ts < ts - strongWindowMs) {
      strongHits.shift();
    }
  };
  const evidenceEntries: EvidenceEntry[] = [];
  let evidenceText = '';
  let lastBufferChars = 0;
  const consistencyEntries: ConsistencyEntry[] = [];
  const lagSamples: LagSample[] = [];
  let catchUpModeUntil = 0;
  const eventRing: AsrEventSnapshot[] = [];
  const guardCounts = new Map<string, number>();
  let manualAnchorPending: { targetIndex: number; ts: number } | null = null;
  let manualScrollLastTop = 0;
  let manualScrollLastAt = 0;
  let manualScrollListenerAttached = false;
  let manualScrollHandler: ((event: Event) => void) | null = null;
  let manualScrollToastAt = 0;
  let lastProgrammaticScrollAt = 0;

  activeGuardCounts = guardCounts;

  let activeTuningProfileId = '';
  const applyTuningProfile = (profile: AsrTuningProfile) => {
    if (!profile) return;
    const prevProfileId = activeTuningProfileId;
    const prevBufferMs = bufferMs;
    activeTuningProfileId = String(profile.id || '');
    minTokenCount = Number.isFinite(profile.minTokenCount) ? Math.max(0, profile.minTokenCount) : DEFAULT_MIN_TOKEN_COUNT;
    minEvidenceChars = Number.isFinite(profile.minEvidenceChars) ? Math.max(0, profile.minEvidenceChars) : DEFAULT_MIN_EVIDENCE_CHARS;
    interimHysteresisBonus = Number.isFinite(profile.interimHysteresisBonus)
      ? Math.max(0, profile.interimHysteresisBonus)
      : DEFAULT_INTERIM_HYSTERESIS_BONUS;
    interimStableRepeats = Number.isFinite(profile.interimStableRepeats)
      ? Math.max(1, profile.interimStableRepeats)
      : DEFAULT_INTERIM_STABLE_REPEATS;
    bufferMs = Number.isFinite(profile.bufferMs) ? Math.max(0, profile.bufferMs) : 0;
    allowShortEvidence = !!profile.allowShortEvidence;
    allowCatchup = !!profile.allowCatchup;
    allowInterimCommit = profile.allowInterimCommit !== false;
    consistencyCount = Number.isFinite(profile.consistencyCount) ? Math.max(0, profile.consistencyCount) : 0;
    consistencyWindowMs = Number.isFinite(profile.consistencyWindowMs) ? Math.max(0, profile.consistencyWindowMs) : 0;
    consistencyMaxDeltaLines = Number.isFinite(profile.consistencyMaxDeltaLines) ? Math.max(0, profile.consistencyMaxDeltaLines) : 0;
    consistencyMaxSpreadLines = Number.isFinite(profile.consistencyMaxSpreadLines) ? Math.max(0, profile.consistencyMaxSpreadLines) : 0;
    consistencySimSlack = Number.isFinite(profile.consistencySimSlack) ? Math.max(0, profile.consistencySimSlack) : 0;
    consistencyRequireNearMarker = profile.consistencyRequireNearMarker !== false;
    consistencyMarkerBandLines = Number.isFinite(profile.consistencyMarkerBandLines)
      ? Math.max(0, profile.consistencyMarkerBandLines)
      : 0;
    catchupMaxDeltaLines = Number.isFinite(profile.catchupMaxDeltaLines) ? Math.max(0, profile.catchupMaxDeltaLines) : 0;
    catchupSimSlack = Number.isFinite(profile.catchupSimSlack) ? Math.max(0, profile.catchupSimSlack) : 0;
    if (prevProfileId !== activeTuningProfileId || prevBufferMs !== bufferMs) {
      evidenceEntries.length = 0;
      evidenceText = '';
      lastBufferChars = 0;
      consistencyEntries.length = 0;
    }
  };

  const readScriptHash = () => {
    try {
      return String((window as any).__TP_LAST_APPLIED_HASH || '');
    } catch {
      return '';
    }
  };

  if (!lastScriptHash) {
    lastScriptHash = readScriptHash();
  }

  const publishSharedCursor = (index: number, reason: string) => {
    try {
      window.dispatchEvent(new CustomEvent('tp:asr:cursor', {
        detail: {
          index,
          reason,
          source: 'asr-driver',
        },
      }));
    } catch {
      // ignore
    }
  };

  const setCurrentIndex = (nextIndex: number, reason: string) => {
    if (!Number.isFinite(nextIndex)) return;
    const next = Math.max(0, Math.floor(nextIndex));
    const prevRaw = Number((window as any)?.currentIndex ?? lastLineIndex ?? -1);
    const prev = Number.isFinite(prevRaw) ? Math.floor(prevRaw) : 0;
    const scriptHash = readScriptHash();
    const scriptHashChanged = !!scriptHash && scriptHash !== lastScriptHash;
    const isBackJump = next < prev - DEFAULT_BACKJUMP_BLOCK_LINES;
    const allowBackJump = reason === 'manualReset' || reason === 'scriptChanged';
    if (isBackJump) {
      try {
        console.warn('[ASR_BACKJUMP]', {
          oldIndex: prev,
          newIndex: next,
          lastMatchId,
          reason,
          scriptHashChanged,
          blocked: !allowBackJump,
        });
      } catch {}
      if (!allowBackJump) {
        if (scriptHashChanged) lastScriptHash = scriptHash;
        return;
      }
      lineMissingRetryLine = null;
      lineMissingRetryCount = 0;
    }
    try { (window as any).currentIndex = next; } catch {}
    publishSharedCursor(next, reason);
    rememberCommittedBlockFromLine(next);
    if (scriptHashChanged) lastScriptHash = scriptHash;
  };

  const manualScrollListenerOptions = { passive: true, capture: true };

  const isManualAnchorAdoptEnabled = () => {
    try {
      const settings = getAsrSettings();
      return settings.manualAnchorAdoptEnabled !== false;
    } catch {
      return true;
    }
  };

  const updateManualAnchorGlobalState = () => {
    try {
      (window as any).__tpAsrManualAnchorPending = manualAnchorPending;
    } catch {
      // ignore
    }
  };

  const rejectManualAnchorPending = (reason: string) => {
    if (!manualAnchorPending) return;
    logDev(`[ASR_ADOPT] rejected (${reason})`);
    manualAnchorPending = null;
    updateManualAnchorGlobalState();
  };

  const primeRecoveryForManualAnchor = () => {
    behindDebtStreak = Math.max(behindDebtStreak, RECOVERY_STREAK_REQUIRED);
    behindDebt = Math.max(behindDebt, RECOVERY_BIG_JUMP_LINES);
  };

  const markProgrammaticScroll = () => {
    lastProgrammaticScrollAt = Date.now();
    const scroller = getScroller();
    manualScrollLastTop = scroller?.scrollTop ?? manualScrollLastTop;
    manualScrollLastAt = lastProgrammaticScrollAt;
  };

  const setManualAnchorPendingState = (targetIndex: number, now: number) => {
    manualAnchorPending = { targetIndex, ts: now };
    updateManualAnchorGlobalState();
    logDev('[ASR_ADOPT] pending targetIndex=' + manualAnchorPending.targetIndex);
    primeRecoveryForManualAnchor();
    if (isDevMode() && now - manualScrollToastAt > 3000) {
      manualScrollToastAt = now;
      try {
        window.toast?.('Manual reposition pending (waiting for local match)', { type: 'info', timeoutMs: 2000 });
      } catch {
        // ignore
      }
    }
  };

  const handleManualScrollEvent = () => {
    if (disposed) return;
    if (!isManualAnchorAdoptEnabled()) return;
    const mode = getScrollMode();
    if (mode !== 'hybrid' && mode !== 'asr') return;
    const now = Date.now();
    if (now - lastProgrammaticScrollAt < 250) return;
    const scroller = getScroller();
    if (!scroller) return;
    const currentTop = scroller.scrollTop || 0;
    const delta = Math.abs(currentTop - manualScrollLastTop);
    const windowMs = manualScrollLastAt ? now - manualScrollLastAt : Infinity;
    manualScrollLastTop = currentTop;
    manualScrollLastAt = now;
    if (delta < MANUAL_ANCHOR_MIN_SCROLL_PX || windowMs > MANUAL_ANCHOR_MAX_SCROLL_WINDOW_MS) return;
    const markerIdx = computeMarkerLineIndex(scroller);
    if (!Number.isFinite(markerIdx) || markerIdx < 0) return;
    const targetIndex = Math.max(0, Math.floor(markerIdx));
    if (manualAnchorPending && Math.abs(manualAnchorPending.targetIndex - targetIndex) <= MANUAL_ANCHOR_WINDOW_LINES) {
      manualAnchorPending.ts = now;
      updateManualAnchorGlobalState();
      return;
    }
    setManualAnchorPendingState(targetIndex, now);
  };

  const attachManualScrollWatcher = () => {
    if (manualScrollListenerAttached) return;
    manualScrollListenerAttached = true;
    manualScrollHandler = handleManualScrollEvent;
    try { document.addEventListener('scroll', manualScrollHandler, manualScrollListenerOptions); } catch {}
    try { window.addEventListener('scroll', manualScrollHandler, manualScrollListenerOptions); } catch {}
    manualScrollLastTop = getScroller()?.scrollTop ?? manualScrollLastTop;
    manualScrollLastAt = Date.now();
    lastProgrammaticScrollAt = manualScrollLastAt;
  };

  const detachManualScrollWatcher = () => {
    if (!manualScrollListenerAttached || !manualScrollHandler) return;
    manualScrollListenerAttached = false;
    try { document.removeEventListener('scroll', manualScrollHandler, manualScrollListenerOptions); } catch {}
    try { window.removeEventListener('scroll', manualScrollHandler, manualScrollListenerOptions); } catch {}
    manualScrollHandler = null;
  };

  const adoptManualAnchorTruth = (lineIndex: number, sim: number, scroller: HTMLElement | null) => {
    const normalized = Number.isFinite(lineIndex) ? Math.max(0, Math.floor(lineIndex)) : 0;
    const now = Date.now();
    manualAnchorPending = null;
    updateManualAnchorGlobalState();
    clearEvidenceBuffer('manual adopt');
    resetLowSimStreak();
    resetNoProgressStreak('manual-adopt', normalized);
    lowSimFreezeLogged = false;
    strongHits.length = 0;
    pendingMatch = null;
    pendingSeq += 1;
    lastLineIndex = normalized;
    matchAnchorIdx = normalized;
    lastEvidenceAt = now;
    lastForwardCommitAt = now;
    lastCommitAt = now;
    lastCommitTime = now;
    lastSeekTs = now;
    lastMoveAt = now;
    lastIngestAt = now;
    graceRollbackCooldownUntil = 0;
    resyncUntil = 0;
    resyncAnchorIdx = null;
    resyncReason = null;
    clearCommitBandReseed('manual-adopt');
    catchUpModeUntil = 0;
    postCatchupUntil = 0;
    postCatchupSamplesLeft = 0;
    const scrollTop = scroller?.scrollTop ?? lastKnownScrollTop;
    lastKnownScrollTop = scrollTop;
    appliedTopPx = scrollTop;
    pursuitActive = false;
    pursuitTargetTop = null;
    pursuitVel = 0;
    logDev('[ASR_ADOPT] accepted bestIndex=' + normalized + ' sim=' + formatLogScore(sim));
    setCurrentIndex(normalized, 'manualAdopt');
    updateDebugState('manual-adopt');
    return true;
  };

  try {
    const hasScript = !!(getScriptRoot() || document.querySelector('.line'));
    if (hasScript) ensureAsrTuningProfile('reading');
  } catch {}
  applyTuningProfile(getActiveAsrTuningProfile());
  attachManualScrollWatcher();

  const unsubscribe = speechStore.subscribe((state) => {
    if (disposed) return;
    if (typeof state.threshold === 'number' && !isDevMode() && !areAsrThresholdsDirty()) {
      threshold = clamp(state.threshold, 0, 1);
      setAsrDriverThresholds({ candidateMinSim: threshold });
    }
    const nextCalm = !!state.calmModeEnabled;
    if (nextCalm !== calmModeEnabled) {
      calmModeEnabled = nextCalm;
      syncMotionTuning(getAsrDriverThresholds(), Date.now());
    }
  });

  const unsubscribeTuning = onAsrTuning(() => {
    applyTuningProfile(getActiveAsrTuningProfile());
  });

  const syncMatchAnchor = (idx: number) => {
    if (!Number.isFinite(idx)) return;
    const next = Math.max(0, Math.floor(idx));
    matchAnchorIdx = matchAnchorIdx >= 0 ? Math.max(matchAnchorIdx, next) : next;
    // Keep pre-commit anchor progression internal. Writing global currentIndex here
    // can poison cursor state when a later commit gate rejects the candidate.
  };

  const updateDebugState = (tag: string) => {
    if (!isDevMode()) return;
    try {
      (window as any).__tpAsrScrollState = {
        tag,
        lastIngestAt,
        lastEvidenceAt,
        pendingEvidenceCount: strongHits.length,
        cursorLineIndex: lastLineIndex,
        matchAnchorIdx,
        pursuitTargetTop,
        appliedTopPx,
        lastMoveAt,
        tuningProfileId: activeTuningProfileId,
        bufferChars: evidenceText.length,
        bufferEntries: evidenceEntries.length,
        holdActive: ambiguityHoldActive,
        holdAgeMs:
          ambiguityHoldActive && ambiguityHoldSince > 0
            ? Math.max(0, Date.now() - ambiguityHoldSince)
            : 0,
        holdReason: ambiguityHoldActive ? ambiguityHoldReason : null,
        holdBestSim: ambiguityHoldActive ? Number(ambiguityHoldBestSim.toFixed(3)) : null,
        holdSecondSim:
          ambiguityHoldActive && ambiguityHoldSecondIdx >= 0
            ? Number(ambiguityHoldSecondSim.toFixed(3))
            : null,
      };
    } catch {}
  };

  const trimEvidenceEntries = (now: number) => {
    if (!bufferMs || bufferMs <= 0) {
      evidenceEntries.length = 0;
      evidenceText = '';
      return;
    }
    while (evidenceEntries.length && evidenceEntries[0].ts < now - bufferMs) {
      evidenceEntries.shift();
    }
  };

  const clearEvidenceBuffer = (reason: string) => {
    if (!evidenceEntries.length && !evidenceText) return;
    evidenceEntries.length = 0;
    evidenceText = '';
    lastBufferChars = 0;
    consistencyEntries.length = 0;
    logDev('evidence buffer cleared', { reason });
    updateDebugState('buffer-clear');
  };

  const updateEvidenceBuffer = (text: string, isFinal: boolean, now: number) => {
    if (!bufferMs || bufferMs <= 0) return text;
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return evidenceText;
    evidenceEntries.push({ ts: now, text: clean, isFinal });
    trimEvidenceEntries(now);
    evidenceText = buildEvidenceText(evidenceEntries);
    lastBufferChars = evidenceText.length;
    return evidenceText;
  };

  const trimConsistencyEntries = (now: number) => {
    if (!consistencyWindowMs || consistencyWindowMs <= 0) {
      consistencyEntries.length = 0;
      return;
    }
    while (consistencyEntries.length && consistencyEntries[0].ts < now - consistencyWindowMs) {
      consistencyEntries.shift();
    }
  };

  const recordConsistencyEntry = (entry: ConsistencyEntry) => {
    consistencyEntries.push(entry);
    trimConsistencyEntries(entry.ts);
    if (consistencyEntries.length > 24) {
      consistencyEntries.splice(0, consistencyEntries.length - 24);
    }
  };

  const evaluateConsistency = (
    now: number,
    opts: {
      requiredCount: number;
      minSim: number;
      maxDeltaLines: number;
      maxSpreadLines: number;
      requireNearMarker: boolean;
      minDeltaLines?: number;
      requireForward?: boolean;
    },
  ): ConsistencyResult => {
    trimConsistencyEntries(now);
    const needed = Math.max(0, opts.requiredCount);
    const emptyResult: ConsistencyResult = {
      ok: false,
      count: consistencyEntries.length,
      needed,
      minDelta: 0,
      maxDelta: 0,
      minSim: 0,
      spread: 0,
      nearOk: false,
    };
    if (!needed || consistencyEntries.length < needed) {
      return {
        ...emptyResult,
        count: consistencyEntries.length,
        needed,
      };
    }
    const tail = consistencyEntries.slice(-needed);
    const deltas = tail.map((e) => e.delta);
    const idxs = tail.map((e) => e.idx);
    const sims = tail.map((e) => e.sim);
    const minDelta = Math.min(...deltas);
    const maxDelta = Math.max(...deltas);
    const spread = Math.max(...idxs) - Math.min(...idxs);
    const minSim = Math.min(...sims);
    const nearOk = !opts.requireNearMarker || tail.every((e) => e.nearMarker);
    const minDeltaRequired = Number.isFinite(opts.minDeltaLines) ? (opts.minDeltaLines as number) : minLineAdvance;
    const requireForward = opts.requireForward === true;
    const hasForward = maxDelta >= minLineAdvance;
    const ok =
      nearOk &&
      minDelta >= minDeltaRequired &&
      maxDelta <= opts.maxDeltaLines &&
      spread <= opts.maxSpreadLines &&
      minSim >= opts.minSim &&
      (!requireForward || hasForward);
    return {
      ok,
      count: tail.length,
      needed,
      minDelta,
      maxDelta,
      minSim,
      spread,
      nearOk,
    };
  };

  const recordEvent = (entry: AsrEventSnapshot) => {
    eventRing.push(entry);
    if (eventRing.length > EVENT_RING_MAX) eventRing.shift();
  };

  const recordLagSample = (sample: LagSample) => {
    lagSamples.push(sample);
    if (lagSamples.length > DEFAULT_LAG_WINDOW_MATCHES) {
      lagSamples.splice(0, lagSamples.length - DEFAULT_LAG_WINDOW_MATCHES);
    }
  };

  const shouldTriggerCatchUp = () => {
    if (!allowCatchup) return false;
    const window = lagSamples.slice(-DEFAULT_LAG_WINDOW_MATCHES);
    if (!window.length) return false;
    const forwardHits = window.filter(
      (entry) => entry.delta >= DEFAULT_LAG_DELTA_LINES && entry.nearMarker && entry.inBand,
    );
    const forceWindow = window.slice(-DEFAULT_LAG_FORCE_HITS);
    const forceHits =
      forceWindow.length >= DEFAULT_LAG_FORCE_HITS &&
      forceWindow.every((entry) =>
        entry.delta >= DEFAULT_LAG_FORCE_DELTA_LINES &&
        entry.nearMarker &&
        entry.inBand &&
        entry.sim < DEFAULT_CATCHUP_MODE_MIN_SIM);
    if (forceHits) return true;
    if (forwardHits.length < DEFAULT_LAG_MIN_FORWARD_HITS) return false;
    const hasConfident = forwardHits.some((entry) => entry.sim >= DEFAULT_CATCHUP_MODE_MIN_SIM);
    return hasConfident;
  };

  const activateCatchUpMode = (now: number, sample: LagSample) => {
    if (pursuitActive) {
      pursuitActive = false;
      pursuitTargetTop = null;
      pursuitVel = 0;
      logDev('pursuit canceled (catchup mode)');
    }
    const nextUntil = now + DEFAULT_CATCHUP_MODE_DURATION_MS;
    if (nextUntil <= catchUpModeUntil) return;
    catchUpModeUntil = nextUntil;
    emitHudStatus(
      'catchup',
      `Catch-up: ON (Δ+${sample.delta}, sim ${formatLogScore(sample.sim)})`,
    );
  };

  const silenceHandler = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    if (detail && detail.silent) {
      clearEvidenceBuffer('silence');
    }
  };

  const resetHandler = () => {
    clearEvidenceBuffer('script-reset');
  };
  const rescueHandler = (event?: Event) => {
    const source =
      String((event as CustomEvent | undefined)?.detail?.reason || '').trim() ||
      'signal';
    let scheduled = false;
    try {
      scheduled = maybeScheduleStallCueRescue(source);
    } catch {
      scheduled = false;
    }
    stallRescueRequested = scheduled;
  };

  try { window.addEventListener('tp:asr:silence', silenceHandler as EventListener); } catch {}
  try { window.addEventListener('tp:script:reset', resetHandler as EventListener); } catch {}
  try { window.addEventListener('tp:asr:rescue', rescueHandler as EventListener); } catch {}
  try { (window as any).__tpAsrRequestRescue = rescueHandler; } catch {}

  const summarizeGuardCounts = (limit = Number.POSITIVE_INFINITY) => {
    const entries = Array.from(guardCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
    return entries.slice(0, limit);
  };
  const summarizeRecentGuardCounts = (limit = Number.POSITIVE_INFINITY) => {
    const now = Date.now();
    const cutoff = now - DEFAULT_STALL_COMMIT_MS;
    const counts = new Map<string, number>();
    for (let i = guardEvents.length - 1; i >= 0; i -= 1) {
      const entry = guardEvents[i];
      if (entry.ts < cutoff) break;
      counts.set(entry.reason, (counts.get(entry.reason) || 0) + 1);
    }
    const entries = Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
    return entries.slice(0, limit);
  };

  const getTotalLines = () => {
    try {
      const root = getScriptRoot() || getPrimaryScroller();
      const container = root || document;
      const indexedLines = container?.querySelectorAll?.(INDEXED_LINE_SELECTOR) as NodeListOf<HTMLElement> | undefined;
      if (indexedLines && indexedLines.length) {
        const seen = new Set<number>();
        indexedLines.forEach((lineEl) => {
          const idx = parseLineIndexFromElement(lineEl);
          if (idx != null) seen.add(idx);
        });
        if (seen.size) return seen.size;
        return indexedLines.length;
      }
      const fallback = container?.querySelectorAll?.('.line, .tp-line');
      return fallback ? fallback.length : 0;
    } catch {
      return 0;
    }
  };

  const getLineTextAt = (lineIndex: number): string => {
    if (!Number.isFinite(lineIndex) || lineIndex < 0) return '';
    try {
      const scroller = getScroller();
      const lineEl = getLineElementByIndex(scroller, lineIndex);
      return String(lineEl?.textContent || '').replace(/\s+/g, ' ').trim();
    } catch {
      return '';
    }
  };

  const findLastSpeakableLineIndex = (): number => {
    const total = getTotalLines();
    if (total <= 0) return -1;
    for (let idx = total - 1; idx >= 0; idx -= 1) {
      const lineText = getLineTextAt(idx);
      if (!isIgnorableCueLineText(lineText)) {
        return idx;
      }
    }
    return -1;
  };

  const maybeEmitScriptEndEvent = (lineIndex: number, reason: string): void => {
    if (disposed || scriptEndEventEmitted) return;
    if (getScrollMode() !== 'asr') return;
    if (!isSessionLivePhase() || !isSessionAsrArmed()) return;
    if (!Number.isFinite(lineIndex)) return;
    const normalizedLine = Math.max(0, Math.floor(lineIndex));
    const lastSpeakableLineIndex = findLastSpeakableLineIndex();
    if (lastSpeakableLineIndex < 0 || normalizedLine < lastSpeakableLineIndex) return;
    scriptEndEventEmitted = true;
    const payload = {
      ts: Date.now(),
      mode: getScrollMode() || 'unknown',
      lineIndex: normalizedLine,
      lastSpeakableLineIndex,
      totalLines: getTotalLines(),
      reason: String(reason || 'commit'),
      runKey: summaryRunKey || null,
      driverInstanceId,
    };
    try {
      window.dispatchEvent(new CustomEvent('tp:asr:script-end', { detail: payload }));
    } catch {}
    if (isDevMode() && shouldLogTag('ASR_SCRIPT_END', 2, 1000)) {
      try { console.info('[ASR_SCRIPT_END]', payload); } catch {}
    }
  };

  const findNextSpeakableWithinBridge = (
    cursorLine: number,
    maxLookahead = DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES,
  ): { nextLine: number | null; skippedReasons: CueBridgeSkipReason[] } => {
    const total = getTotalLines();
    if (!Number.isFinite(cursorLine) || total <= 0) {
      return { nextLine: null, skippedReasons: [] };
    }
    const base = Math.max(0, Math.floor(cursorLine));
    const begin = base + 1;
    if (begin >= total) {
      return { nextLine: null, skippedReasons: [] };
    }
    const end = Math.min(total - 1, begin + Math.max(1, Math.floor(maxLookahead)) - 1);
    const skippedReasons: CueBridgeSkipReason[] = [];
    for (let idx = begin; idx <= end; idx += 1) {
      const reason = classifySkippableLineForCueBridge(getLineTextAt(idx));
      if (reason) {
        skippedReasons.push(reason);
        continue;
      }
      return { nextLine: idx, skippedReasons };
    }
    return { nextLine: null, skippedReasons };
  };

  const logCueBridgeUse = (
    cursorLine: number,
    landedLine: number,
    skippedReasons: CueBridgeSkipReason[],
    source: string,
  ) => {
    if (!isDevMode() || !skippedReasons.length) return;
    try {
      console.info(
        `ASR_CUE_BRIDGE used=+${skippedReasons.length} skipped=[${skippedReasons.join(',')}] landedLine=${landedLine} cursorLine=${cursorLine} source=${source}`,
      );
    } catch {}
  };

  const findNextSpokenLineIndex = (
    startIndex: number,
    maxLookahead = MAX_CUE_SKIP_LOOKAHEAD_LINES,
  ): number | null => {
    const total = getTotalLines();
    if (!Number.isFinite(startIndex) || total <= 0) return null;
    const begin = Math.max(0, Math.floor(startIndex));
    if (begin >= total) return null;
    const end = Math.min(total - 1, begin + Math.max(1, Math.floor(maxLookahead)));
    for (let idx = begin; idx <= end; idx += 1) {
      const lineText = getLineTextAt(idx);
      if (!isIgnorableCueLineText(lineText)) {
        return idx;
      }
    }
    return null;
  };

  const findNextSpokenLineIndexWithin = (
    startIndex: number,
    endIndexInclusive: number,
  ): number | null => {
    const total = getTotalLines();
    if (!Number.isFinite(startIndex) || !Number.isFinite(endIndexInclusive) || total <= 0) return null;
    const begin = Math.max(0, Math.floor(startIndex));
    const end = Math.min(total - 1, Math.max(begin, Math.floor(endIndexInclusive)));
    if (begin > end) return null;
    for (let idx = begin; idx <= end; idx += 1) {
      const lineText = getLineTextAt(idx);
      if (!isIgnorableCueLineText(lineText)) {
        return idx;
      }
    }
    return null;
  };

  const computeCueSafeMarkerIndex = (
    scroller: HTMLElement | null,
    maxForward = DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES,
  ): number => {
    const markerRaw = computeMarkerLineIndex(scroller);
    const markerIdx = Number.isFinite(markerRaw) ? Math.max(0, Math.floor(markerRaw)) : -1;
    if (markerIdx < 0) return -1;
    const markerLineText = String(getLineElementByIndex(scroller, markerIdx)?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!isIgnorableCueLineText(markerLineText)) return markerIdx;
    const lookahead = Math.max(1, Math.floor(maxForward));
    for (let idx = markerIdx + 1; idx <= markerIdx + lookahead; idx += 1) {
      const lineText = String(getLineElementByIndex(scroller, idx)?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!isIgnorableCueLineText(lineText)) {
        return idx;
      }
    }
    return -1;
  };

  const resolveCueSafeCommitLine = (
    requestedLine: number,
    cursorLine: number,
    clampDeltaLimit: number,
  ): { nextLine: number | null; skippedFrom: number | null; skippedText: string } => {
    if (!Number.isFinite(requestedLine)) {
      return { nextLine: null, skippedFrom: null, skippedText: '' };
    }
    const baseLine = Math.max(0, Math.floor(requestedLine));
    const lineText = getLineTextAt(baseLine);
    if (!isIgnorableCueLineText(lineText)) {
      return { nextLine: baseLine, skippedFrom: null, skippedText: '' };
    }
    const safeClamp = Math.max(0, Math.floor(clampDeltaLimit));
    const maxForwardLine = Math.max(baseLine, cursorLine + safeClamp);
    const nextSpoken = findNextSpokenLineIndexWithin(baseLine + 1, maxForwardLine);
    if (Number.isFinite(nextSpoken as number) && (nextSpoken as number) > baseLine) {
      return {
        nextLine: Math.max(0, Math.floor(nextSpoken as number)),
        skippedFrom: baseLine,
        skippedText: lineText,
      };
    }
    return {
      nextLine: null,
      skippedFrom: baseLine,
      skippedText: lineText,
    };
  };

  const prevSpeakableLineFrom = (
    startIndex: number,
    maxLookback = MAX_CUE_SKIP_LOOKAHEAD_LINES,
  ): number | null => {
    const total = getTotalLines();
    if (!Number.isFinite(startIndex) || total <= 0) return null;
    const begin = Math.min(total - 1, Math.max(0, Math.floor(startIndex)));
    const end = Math.max(0, begin - Math.max(1, Math.floor(maxLookback)));
    for (let idx = begin; idx >= end; idx -= 1) {
      const lineText = getLineTextAt(idx);
      if (!isIgnorableCueLineText(lineText)) {
        return idx;
      }
    }
    return null;
  };

  const buildForwardMatcherInputs = (
    bufferedTextValue: string,
    compactedTextValue: string,
    final: boolean,
  ): string[] => {
    const dedupe = new Set<string>();
    const inputs: string[] = [];
    const pushInput = (value: string) => {
      const normalized = normalizeComparableText(value);
      if (!normalized) return;
      if (dedupe.has(normalized)) return;
      dedupe.add(normalized);
      inputs.push(normalized);
    };
    pushInput(bufferedTextValue);
    pushInput(compactedTextValue);
    if (final) {
      const chunks = splitFinalTranscriptChunks(compactedTextValue);
      for (const chunk of chunks) {
        pushInput(chunk);
      }
    }
    return inputs;
  };

  const buildForwardWindowScores = (
    candidateLineIdx: number[],
    matcherInputs: string[],
    maxWindowLines = DEFAULT_FORWARD_WINDOW_MAX_LINES,
  ): Array<{ idx: number; score: number; span: number; startIdx: number; source: 'window' }> => {
    if (!candidateLineIdx.length || !matcherInputs.length) return [];
    const maxSpan = Math.max(1, Math.floor(maxWindowLines));
    const matcherTokenSets = matcherInputs
      .map((value) => normTokens(value))
      .filter((tokens) => tokens.length > 0);
    if (!matcherTokenSets.length) return [];
    const lineTokenCache = new Map<number, string[]>();
    const getSpeakableLineTokens = (lineIndex: number): string[] => {
      const idx = Math.max(0, Math.floor(lineIndex));
      const cached = lineTokenCache.get(idx);
      if (cached) return cached;
      const raw = getLineTextAt(idx);
      if (!raw || isIgnorableCueLineText(raw)) {
        lineTokenCache.set(idx, []);
        return [];
      }
      const normalized = normalizeComparableText(raw);
      const tokens = normalized ? normTokens(normalized) : [];
      lineTokenCache.set(idx, tokens);
      return tokens;
    };
    const windowScores: Array<{ idx: number; score: number; span: number; startIdx: number; source: 'window' }> = [];
    for (let startPos = 0; startPos < candidateLineIdx.length; startPos += 1) {
      const startIdx = candidateLineIdx[startPos];
      const windowTokens: string[] = [];
      for (
        let span = 1;
        span <= maxSpan && startPos + span - 1 < candidateLineIdx.length;
        span += 1
      ) {
        const lineIdx = candidateLineIdx[startPos + span - 1];
        const lineTokens = getSpeakableLineTokens(lineIdx);
        if (!lineTokens.length) continue;
        windowTokens.push(...lineTokens);
        if (windowTokens.length < DEFAULT_FORWARD_WINDOW_MIN_TOKENS) continue;
        let bestScore = 0;
        for (const tokenSet of matcherTokenSets) {
          const score = computeLineSimilarityFromTokens(tokenSet, windowTokens);
          if (score > bestScore) bestScore = score;
        }
        windowScores.push({
          idx: lineIdx,
          score: bestScore,
          span,
          startIdx,
          source: 'window',
        });
      }
    }
    return windowScores;
  };

  const measurePostCommitReadability = (scroller: HTMLElement, activeLineIndex: number) => {
    const activeLine = getLineElementByIndex(scroller, activeLineIndex);
    if (!activeLine) {
      return {
        activeLineViewportRatio: null as number | null,
        activeCenterY: null as number | null,
        viewportTop: 0,
        viewportHeight: Math.max(1, scroller.clientHeight || 0),
        readableLinesBelowCount: 0,
        requiredNextLineOverflowPx: 0,
        requiredLookaheadOverflowPx: 0,
      };
    }
    const scrollerRect = scroller.getBoundingClientRect();
    const viewportTop = scrollerRect.top;
    const viewportBottom = scrollerRect.bottom;
    const viewportHeight = Math.max(1, scroller.clientHeight || scrollerRect.height || 0);
    const activeRect = activeLine.getBoundingClientRect();
    const activeCenterY = activeRect.top + activeRect.height * 0.5;
    const activeLineViewportRatio = clamp((activeCenterY - viewportTop) / viewportHeight, 0, 1);
    const visibleBottom = viewportBottom - POST_COMMIT_READABLE_BOTTOM_PAD_PX;
    const nextLineVisibleBottom = Math.max(viewportTop, visibleBottom - POST_COMMIT_NEXT_LINE_VIS_GUARD_PX);
    const total = getTotalLines();
    const maxLookahead = Math.min(
      Math.max(0, total - 1),
      Math.max(0, activeLineIndex + POST_COMMIT_READABILITY_LOOKAHEAD_LINES),
    );
    let readableLinesBelowCount = 0;
    let speakableSeen = 0;
    let requiredNextLineOverflowPx = 0;
    let nextLineSeen = false;
    let requiredLookaheadOverflowPx = 0;
    for (let idx = activeLineIndex + 1; idx <= maxLookahead; idx += 1) {
      const lineText = getLineTextAt(idx);
      if (isIgnorableCueLineText(lineText)) continue;
      const lineEl = getLineElementByIndex(scroller, idx);
      if (!lineEl) continue;
      const lineRect = lineEl.getBoundingClientRect();
      if (!nextLineSeen) {
        requiredNextLineOverflowPx = Math.max(0, lineRect.bottom - nextLineVisibleBottom);
        nextLineSeen = true;
      }
      if (lineRect.top >= viewportTop && lineRect.bottom <= visibleBottom) {
        readableLinesBelowCount += 1;
      }
      speakableSeen += 1;
      if (speakableSeen === POST_COMMIT_MIN_READABLE_LINES_BELOW) {
        requiredLookaheadOverflowPx = Math.max(0, lineRect.bottom - visibleBottom);
        break;
      }
    }
    return {
      activeLineViewportRatio,
      activeCenterY,
      viewportTop,
      viewportHeight,
      readableLinesBelowCount,
      requiredNextLineOverflowPx,
      requiredLookaheadOverflowPx,
    };
  };

  const applyPostCommitReadabilityGuarantee = (
    scroller: HTMLElement,
    activeLineIndex: number,
    opts?: { allowNudge?: boolean },
  ) => {
    const beforeTop = Number(scroller.scrollTop || 0);
    const beforeMetrics = measurePostCommitReadability(scroller, activeLineIndex);
    let targetTop = beforeTop;
    const markerRatioRaw =
      typeof (window as any).__TP_MARKER_PCT === 'number'
        ? Number((window as any).__TP_MARKER_PCT)
        : POST_COMMIT_ACTIVE_TARGET_RATIO;
    const markerTargetRatio = clamp(markerRatioRaw, POST_COMMIT_ACTIVE_MIN_RATIO, POST_COMMIT_ACTIVE_MAX_RATIO);
    const markerBandMinRatio = clamp(
      markerTargetRatio - POST_COMMIT_ACTIVE_BAND_RADIUS,
      POST_COMMIT_ACTIVE_MIN_RATIO,
      markerTargetRatio,
    );
    const markerBandMaxRatio = clamp(
      markerTargetRatio + POST_COMMIT_ACTIVE_BAND_RADIUS,
      markerTargetRatio,
      POST_COMMIT_ACTIVE_MAX_RATIO,
    );
    const ratio = beforeMetrics.activeLineViewportRatio;
    if (
      ratio != null &&
      beforeMetrics.activeCenterY != null &&
      ratio > markerBandMaxRatio
    ) {
      const desiredCenter =
      beforeMetrics.viewportTop + beforeMetrics.viewportHeight * markerTargetRatio;
      const ratioNudgePx = Math.max(0, beforeMetrics.activeCenterY - desiredCenter);
      if (ratioNudgePx > 0) {
        targetTop = Math.max(targetTop, beforeTop + ratioNudgePx);
      }
    }
    if (beforeMetrics.requiredNextLineOverflowPx > 0) {
      targetTop = Math.max(targetTop, beforeTop + beforeMetrics.requiredNextLineOverflowPx);
    }
    if (beforeMetrics.requiredLookaheadOverflowPx > 0) {
      targetTop = Math.max(targetTop, beforeTop + beforeMetrics.requiredLookaheadOverflowPx);
    }
    if (beforeMetrics.activeCenterY != null) {
      const minCenter =
        beforeMetrics.viewportTop + beforeMetrics.viewportHeight * markerBandMinRatio;
      const maxCenter =
        beforeMetrics.viewportTop + beforeMetrics.viewportHeight * markerBandMaxRatio;
      const minDeltaPx = beforeMetrics.activeCenterY - maxCenter;
      const maxDeltaPx = beforeMetrics.activeCenterY - minCenter;
      const clampedDeltaPx = clamp(targetTop - beforeTop, minDeltaPx, maxDeltaPx);
      targetTop = beforeTop + clampedDeltaPx;
    }
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    targetTop = clamp(Math.max(beforeTop, targetTop), 0, maxTop);
    let nudgeApplied = false;
    let afterTop = beforeTop;
    if ((opts?.allowNudge ?? true) && Math.abs(targetTop - beforeTop) > POST_COMMIT_MIN_NUDGE_PX) {
      const applied = applyCanonicalScrollTop(targetTop, {
        scroller,
        reason: 'asr-post-commit-readability',
        source: 'asr-commit',
      });
      afterTop = Number.isFinite(applied) ? Number(applied) : Number(scroller.scrollTop || targetTop);
      if (Math.abs(afterTop - beforeTop) > POST_COMMIT_MIN_NUDGE_PX) {
        nudgeApplied = true;
        pursuitTargetTop = afterTop;
        lastKnownScrollTop = afterTop;
        lastMoveAt = Date.now();
        markProgrammaticScroll();
        bootTrace('SCROLL:apply', {
          y: Math.round(afterTop),
          from: Math.round(beforeTop),
          via: 'post-commit-readability',
          reason: 'asr-post-commit-readability',
          lineIdx: activeLineIndex,
        });
      }
    }
    const afterMetrics = measurePostCommitReadability(scroller, activeLineIndex);
    return {
      beforeTop,
      afterTop,
      targetTop,
      nudgeApplied,
      beforeRatio: beforeMetrics.activeLineViewportRatio,
      afterRatio: afterMetrics.activeLineViewportRatio,
      beforeReadableLinesBelow: beforeMetrics.readableLinesBelowCount,
      afterReadableLinesBelow: afterMetrics.readableLinesBelowCount,
    };
  };

  const logPostCommitReadabilityProbe = (
    phase: string,
    lineIdx: number,
    writerCommitted: boolean,
    metrics: {
      beforeTop: number;
      afterTop: number;
      targetTop: number;
      nudgeApplied: boolean;
      beforeRatio: number | null;
      afterRatio: number | null;
      beforeReadableLinesBelow: number;
      afterReadableLinesBelow: number;
    },
  ) => {
    if (!isDevMode() || !shouldLogLevel(2)) return;
    try {
      console.log('[ASR_POST_COMMIT_READABILITY]', {
        phase,
        lineIdx,
        writerCommitted,
        activeLineViewportRatio:
          metrics.afterRatio != null ? Number(metrics.afterRatio.toFixed(3)) : null,
        readableLinesBelowCount: metrics.afterReadableLinesBelow,
        postCommitNudgeApplied: metrics.nudgeApplied,
        beforeRatio: metrics.beforeRatio != null ? Number(metrics.beforeRatio.toFixed(3)) : null,
        beforeReadableLinesBelowCount: metrics.beforeReadableLinesBelow,
        fromTop: Math.round(metrics.beforeTop),
        toTop: Math.round(metrics.afterTop),
        targetTop: Math.round(metrics.targetTop),
        markerPct:
          typeof (window as any).__TP_MARKER_PCT === 'number'
            ? Number((window as any).__TP_MARKER_PCT.toFixed(3))
            : null,
      });
    } catch {
      // ignore
    }
  };

  const chooseWithinBlockContinuityLine = (
    proposedLine: number,
    candidateScores: Array<{ idx: number; score: number }>,
    cursorLine: number,
    bestScore: number,
  ): number => {
    const nextLine = Math.max(0, Math.floor(proposedLine));
    const current = Math.max(0, Math.floor(cursorLine));
    if (nextLine - current <= 1) return nextLine;
    const minForwardLine = current + Math.max(1, minLineAdvance);
    const cursorBlock = findBlockByLine(current);
    const targetBlock = findBlockByLine(nextLine);
    if (!cursorBlock || !targetBlock || cursorBlock.blockId !== targetBlock.blockId) {
      return nextLine;
    }
    const scoreFloor = Number.isFinite(bestScore)
      ? Math.max(0, bestScore - WITHIN_BLOCK_CONTINUITY_SIM_SLACK)
      : 0;
    let picked = nextLine;
    let pickedDelta = nextLine - current;
    for (const entry of candidateScores) {
      const candidateLine = Math.max(0, Math.floor(Number(entry.idx)));
      const candidateScore = Number(entry.score);
      if (!Number.isFinite(candidateLine) || !Number.isFinite(candidateScore)) continue;
      if (candidateLine < minForwardLine || candidateLine > nextLine) continue;
      if (candidateScore < scoreFloor) continue;
      const candidateBlock = findBlockByLine(candidateLine);
      if (!candidateBlock || candidateBlock.blockId !== targetBlock.blockId) continue;
      const candidateDelta = candidateLine - current;
      if (candidateDelta < pickedDelta) {
        picked = candidateLine;
        pickedDelta = candidateDelta;
      }
    }
    return picked;
  };

  const maybeSkipCueLine = (cursorLine: number, now: number, reason: string, clue: string): boolean => {
    if (!Number.isFinite(cursorLine) || cursorLine < 0) return false;
    const currentLineText = getLineTextAt(cursorLine);
    if (!isIgnorableCueLineText(currentLineText)) return false;
    const nextSpoken = findNextSpokenLineIndex(cursorLine + 1);
    if (!Number.isFinite(nextSpoken as number) || (nextSpoken as number) <= cursorLine) return false;
    const targetLine = Math.max(0, Math.floor(nextSpoken as number));
    const scroller = getScroller();
    const targetTop = scroller ? resolveTargetTop(scroller, targetLine) : null;
    if (scroller && targetTop != null) {
      stopGlide('cue-skip');
      const applied = applyScrollWithHybridGuard(targetTop, {
        scroller,
        reason: 'asr-cue-skip',
        source: 'asr',
      });
      lastKnownScrollTop = applied;
      lastMoveAt = now;
      markProgrammaticScroll();
    }
    lastLineIndex = targetLine;
    matchAnchorIdx = targetLine;
    setCurrentIndex(targetLine, 'cue-skip');
    lastForwardCommitAt = now;
    resetLowSimStreak();
    resetNoProgressStreak('cue-skip', targetLine);
    lowSimFreezeLogged = false;
    emitHudStatus('cue_skip', 'Skipped cue line');
    warnGuard('cue_skip', [
      `from=${cursorLine}`,
      `to=${targetLine}`,
      reason ? `reason=${reason}` : '',
      currentLineText ? `line="${formatLogSnippet(currentLineText, 48)}"` : '',
      clue ? `clue="${clue}"` : '',
    ]);
    logDev('cue skip', {
      from: cursorLine,
      to: targetLine,
      reason,
      line: currentLineText,
      clue,
    });
    return true;
  };

  function maybeScheduleStallCueRescue(reason: string): boolean {
    if (disposed) return false;
    if (getScrollMode() !== 'asr') return false;
    if (!isSessionLivePhase() || !isSessionAsrArmed()) return false;
    const now = Date.now();
    if (now - lastCueStallRescueAt < DEFAULT_CUE_STALL_RESCUE_COOLDOWN_MS) return false;
    const cursorRaw = lastLineIndex >= 0 ? lastLineIndex : Number((window as any)?.currentIndex ?? -1);
    if (!Number.isFinite(cursorRaw) || cursorRaw < 0) return false;
    const cursorLine = Math.max(0, Math.floor(cursorRaw));
    const reasonTag = String(reason || '').trim().toLowerCase();
    const isAutoStallRescue = reasonTag === 'auto-stall';
    const cursorLineText = getLineTextAt(cursorLine);
    const cursorIsCueLine = isIgnorableCueLineText(cursorLineText);
    if (isAutoStallRescue && !cursorIsCueLine) {
      stallRescueRequested = false;
      if (isDevMode()) {
        warnGuard('cue_stall_rescue_blocked', [
          `at=${cursorLine}`,
          'reason=content-line',
          reason ? `source=${reason}` : '',
          cursorLineText ? `line="${formatLogSnippet(cursorLineText, 56)}"` : '',
        ]);
      }
      return false;
    }
    const cueBridge = findNextSpeakableWithinBridge(
      cursorLine,
      DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES,
    );
    const targetLine = cueBridge.nextLine;
    if (targetLine == null || targetLine <= cursorLine) return false;
    if (!cueBridge.skippedReasons.length) return false;
    const deltaLines = targetLine - cursorLine;
    if (deltaLines <= 0 || deltaLines > DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES) return false;
    const targetText = getLineTextAt(targetLine);
    if (!targetText || isIgnorableCueLineText(targetText)) return false;
    const rescueSim = Math.max(DEFAULT_STRONG_FORWARD_COMMIT_SIM, DEFAULT_MULTI_JUMP_MIN_SIM);
    const matchId = `stall-rescue-${Date.now().toString(36)}-${targetLine}`;
    adoptPendingMatch({
      line: targetLine,
      conf: rescueSim,
      isFinal: true,
      hasEvidence: true,
      snippet: formatLogSnippet(targetText, 80),
      minThreshold: DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM,
      forced: true,
      forceReason: 'stall-rescue',
      matchId,
      requiredThreshold: DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM,
      topScores: [{ idx: targetLine, score: rescueSim }],
      cursorLine,
      searchWindowFrom: cursorLine,
      searchWindowTo: targetLine,
      lostMode: false,
      cueBridgeNudgeDelta: deltaLines,
    });
    logCueBridgeUse(cursorLine, targetLine, cueBridge.skippedReasons, 'stall-rescue');
    warnGuard('cue_stall_rescue', [
      `from=${cursorLine}`,
      `to=${targetLine}`,
      `delta=${deltaLines}`,
      reason ? `reason=${reason}` : '',
      `sim=${formatLogScore(rescueSim)}`,
      `skipped=[${cueBridge.skippedReasons.join(',')}]`,
      targetText ? `line="${formatLogSnippet(targetText, 56)}"` : '',
    ]);
    emitHudStatus('cue_rescue', `Rescue: cue bridge +${deltaLines}`);
    lastCueStallRescueAt = now;
    schedulePending();
    return true;
  }

  const noteCommit = (prevIndex: number, nextIndex: number, now: number) => {
    commitCount += 1;
    finalsSinceCommit = 0;
    eventsSinceCommit = 0;
    logDriverActive('commit');
    stallHudEmitted = false;
    if (firstCommitIndex == null && Number.isFinite(prevIndex)) {
      firstCommitIndex = Math.max(0, Math.floor(prevIndex));
    }
    if (Number.isFinite(nextIndex)) {
      lastCommitIndex = Math.max(0, Math.floor(nextIndex));
    }
    lastCommitAt = now;
    lastCommitTime = now;
    const prev = Number.isFinite(prevIndex) ? Math.max(0, Math.floor(prevIndex)) : -1;
    const next = Number.isFinite(nextIndex) ? Math.max(0, Math.floor(nextIndex)) : -1;
    if (next > prev) {
      resetNoProgressStreak('forward-commit', next);
    }
    if (next >= 0) {
      maybeEmitScriptEndEvent(next, 'commit');
    }
  };

  const emitSummary = (source: string) => {
    if (summaryEmitted) return;
    const runKey = String(summaryRunKey || '').trim();
    const duplicateRunSummary = runKey ? markRunSummaryReported(runKey) : false;
    if (duplicateRunSummary) {
      summaryEmitted = true;
      if (isDevMode()) {
        try {
          console.info('[ASR] summary deduped', { source, summaryRunKey: runKey || null, driverInstanceId });
        } catch {}
      }
      return;
    }
    summaryEmitted = true;
    const now = Date.now();
    const durationMs = Math.max(0, now - sessionStartAt);
    const endedRunKey = readAsrLastEndedRunKey();
    const shortLivedSummary = durationMs < SUMMARY_MIN_DURATION_MS;
    const liveRunSummary = !!runKey && !!endedRunKey && runKey === endedRunKey;
    const suppressAsCleanup = !liveRunSummary || shortLivedSummary;
    const scroller = getScroller();
    const scrollerId = describeElement(scroller);
    const scrollTop = scroller?.scrollTop ?? lastKnownScrollTop;
    const totalLines = getTotalLines();
    const firstIndex =
      firstCommitIndex != null
        ? firstCommitIndex
        : (lastLineIndex >= 0 ? lastLineIndex : 0);
    const lastIndex =
      lastCommitIndex != null
        ? lastCommitIndex
        : (lastLineIndex >= 0 ? lastLineIndex : 0);
    const linesAdvanced = Number.isFinite(firstIndex) && Number.isFinite(lastIndex)
      ? lastIndex - firstIndex
      : 0;
    const denom = Math.max(1, totalLines - 1);
    const traversedPct =
      totalLines > 0 && Number.isFinite(lastIndex)
        ? clamp(lastIndex / denom, 0, 1) * 100
        : 0;
    const guardSummary = summarizeGuardCounts();
    const guardMap = guardSummary.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.reason] = entry.count;
      return acc;
    }, {});
    const summary = {
      mode: getScrollMode() || 'unknown',
      durationMs,
      commitCount,
      driverInstanceId,
      summaryRunKey: runKey || undefined,
      firstIndex,
      lastIndex,
      linesAdvanced,
      traversedPct: Number(traversedPct.toFixed(1)),
      guardCounts: guardMap,
      lastKnownScrollTop: Math.round(scrollTop || 0),
      scrollerId,
      source,
      liveRunSummary,
      shortLivedSummary,
      endedRunKey: endedRunKey || undefined,
    };
    if (isDevMode() && durationMs >= SUMMARY_MIN_DURATION_MS) {
      logDriverActive(`summary:${source}`);
      try { console.warn('ASR_SESSION_SUMMARY', summary); } catch {}
    }
    if (!suppressAsCleanup) {
      try {
        window.dispatchEvent(new CustomEvent('tp:asr:summary', { detail: summary }));
      } catch {}
    } else if (isDevMode()) {
      try {
        console.info('[ASR] summary suppressed', {
          source,
          runKey: runKey || null,
          endedRunKey: endedRunKey || null,
          durationMs,
          commitCount,
          shortLivedSummary,
          liveRunSummary,
        });
      } catch {
        // ignore
      }
    }
    if (suppressAsCleanup || source !== 'dispose') {
      return;
    }
    const toastKey = `${runKey}:${commitCount === 0 ? 'warn' : 'info'}`;
    if (commitCount === 0) {
      emitSummaryToastOnce(
        toastKey,
        'ASR did not advance the script (0 commits). This run is not production-safe.',
        'warning',
      );
    } else {
      emitSummaryToastOnce(
        toastKey,
        `ASR session: ${commitCount} commits, ${linesAdvanced >= 0 ? '+' : ''}${linesAdvanced} lines (${summary.traversedPct}%)`,
        'info',
      );
    }
  };

  const summarizeGuardText = () => {
    const top = summarizeRecentGuardCounts(3);
    if (!top.length) return 'none';
    return top.map((entry) => `${entry.reason}:${entry.count}`).join(', ');
  };

  const formatCompletionTelemetry = () => {
    try {
      const telemetry = (window as any).__tpAsrTelemetry;
      if (!telemetry || typeof telemetry !== 'object') return '';
      const accept = Number(telemetry.commitAccepted) || 0;
      const reject = Number(telemetry.commitRejected) || 0;
      const top = Array.isArray(telemetry.last15sRejectTop3)
        ? telemetry.last15sRejectTop3
        : [];
      const topText = top
        .slice(0, 3)
        .map((entry: any) => `${entry.reason}(${entry.count})`)
        .join(', ');
      const evidenceSummary =
        typeof telemetry.completionEvidenceSummary === 'string'
          ? telemetry.completionEvidenceSummary
          : '';
      const last = telemetry.last || {};
      const mode =
        typeof last.mode === 'string' && last.mode ? String(last.mode).toLowerCase() : '';
      const rejectReason = typeof last.rejectReason === 'string' ? last.rejectReason : '';
      const completionOk = typeof last.completionOk === 'boolean' ? last.completionOk : null;
      const completionReason =
        typeof last.completionReason === 'string' ? last.completionReason : '';
      let lastResult = '';
      if (last.decision === 'reject') {
        if (rejectReason.startsWith('reject_completion_')) {
          lastResult = `rejected=${rejectReason.replace('reject_completion_', '')}`;
        } else if (rejectReason.startsWith('reject_')) {
          lastResult = `blocked=${rejectReason.replace('reject_', '')}`;
        } else if (rejectReason) {
          lastResult = `blocked=${rejectReason}`;
        }
      } else if (last.decision === 'accept') {
        if (completionOk === false) {
          lastResult = `comp=${completionReason || 'unknown'}`;
        } else if (completionOk === true) {
          lastResult = `comp=${completionReason || 'complete'}`;
        }
      }
      if (!topText && accept === 0 && reject === 0 && !evidenceSummary) return '';
      const base = `accept ${accept} / rej ${reject}`;
      const parts = [base];
      if (mode) parts.push(`mode=${mode}`);
      if (topText) parts.push(`top: ${topText}`);
      if (evidenceSummary) parts.push(evidenceSummary);
      if (lastResult) parts.push(lastResult);
      return parts.join(' • ');
    } catch {
      return '';
    }
  };

  const maybeLogStall = (now: number) => {
    if (now - lastCommitAt < DEFAULT_STALL_COMMIT_MS) return;
    if (now - lastStallLogAt < DEFAULT_STALL_LOG_COOLDOWN_MS) return;
    lastStallLogAt = now;
    const reasonSummary = summarizeGuardText();
    const telemetrySummary = formatCompletionTelemetry();
    try {
      console.warn('[ASR_STALLED] no commits in 15s', {
        sinceMs: Math.round(now - lastCommitAt),
        commitCount,
        lastLineIndex,
        reasonSummary,
      });
    } catch {}
    if (!stallHudEmitted) {
      const stallText = telemetrySummary
        ? `ASR stalled • ${reasonSummary} • ${telemetrySummary}`
        : `ASR stalled • ${reasonSummary}`;
      emitHudStatus('stall', stallText, {
        key: 'stall',
        sinceMs: Math.round(now - lastCommitAt),
        reasonSummary,
      });
      stallHudEmitted = true;
    }
  };

  const resetLowSimStreak = () => {
    lowSimStreak = 0;
    lowSimFirstAt = 0;
  };

    const noteLowSimFreeze = (now: number, snapshot: {
      cursorLine: number;
      bestIdx: number;
      delta: number;
      sim: number;
      inBand: boolean;
      requiredSim: number;
      need: number;
      repeatCount: number;
      bestSpan?: number;
      overlapRatio?: number;
      snippet: string;
      matchId?: string;
      relockModeActive: boolean;
      catchUpModeActive: boolean;
      stuckResyncActive: boolean;
      tieGap?: number;
    }) => {
    if (!lowSimFirstAt) lowSimFirstAt = now;
    lowSimStreak += 1;
    if (lowSimFreezeLogged) return;
    const elapsed = now - lowSimFirstAt;
    if (lowSimStreak < DEFAULT_FREEZE_LOW_SIM_HITS && elapsed < DEFAULT_FREEZE_LOW_SIM_WINDOW_MS) return;
    lowSimFreezeLogged = true;
    try {
      console.warn('[ASR_FREEZE_SNAPSHOT]', {
        cursorLine: snapshot.cursorLine,
        bestIdx: snapshot.bestIdx,
        delta: snapshot.delta,
        sim: Number.isFinite(snapshot.sim) ? Number(snapshot.sim.toFixed(3)) : snapshot.sim,
        inBand: snapshot.inBand ? 1 : 0,
        requiredSim: Number.isFinite(snapshot.requiredSim) ? Number(snapshot.requiredSim.toFixed(3)) : snapshot.requiredSim,
        need: Number.isFinite(snapshot.need) ? Number(snapshot.need.toFixed(3)) : snapshot.need,
        repeatCount: snapshot.repeatCount,
        bestSpan: snapshot.bestSpan,
        overlapRatio: snapshot.overlapRatio,
        matchId: snapshot.matchId,
        relock: snapshot.relockModeActive,
        catchUp: snapshot.catchUpModeActive,
        stuck: snapshot.stuckResyncActive,
        tieGap: typeof snapshot.tieGap === 'number' && Number.isFinite(snapshot.tieGap)
          ? Number(snapshot.tieGap.toFixed(3))
          : undefined,
        snippet: snapshot.snippet,
      });
    } catch {}
  };

  const pruneForcedCommits = (now: number) => {
    while (forcedCommitTimes.length && forcedCommitTimes[0] < now - forcedRateWindowMs) {
      forcedCommitTimes.shift();
    }
  };

  const getForcedCount = (now: number) => {
    pruneForcedCommits(now);
    return forcedCommitTimes.length;
  };

  const getForcedCooldownRemaining = (now: number) => Math.max(0, forcedCooldownUntil - now);

  const logForcedDeny = (reason: string, parts: Array<string | number | null | undefined>) => {
    try {
      const line = ['ASR_FORCED_DENY', reason, ...parts.filter(Boolean)];
      console.warn(line.join(' '));
    } catch {}
  };

  let lastForwardScanProbeAt = 0;
  let lastForwardScanProbeFingerprint = '';
  let lastForwardScanZeroAt = 0;
  let lastForwardScanZeroFingerprint = '';
  const FORWARD_SCAN_PROBE_THROTTLE_MS = 500;
  const FORWARD_SCAN_ZERO_THROTTLE_MS = 750;
  const logForwardScanProbe = (payload: {
    reason: string;
    cursorLine: number;
    rangeStart: number;
    rangeEnd: number;
    candidatesChecked: number;
    windowCandidatesChecked?: number;
    matcherInputCount?: number;
    bestForwardIdx: number | null;
    bestForwardSim: number;
    bestForwardSpan?: number;
    bestForwardSource?: 'line' | 'window' | null;
    floor: number;
  }) => {
    if (!isDevMode() || !shouldLogLevel(2)) return;
    const fingerprint = [
      payload.reason,
      payload.cursorLine,
      payload.rangeStart,
      payload.rangeEnd,
      payload.candidatesChecked,
      payload.windowCandidatesChecked ?? -1,
      payload.matcherInputCount ?? -1,
      payload.bestForwardIdx ?? -1,
      Number.isFinite(payload.bestForwardSim) ? payload.bestForwardSim.toFixed(3) : 'NaN',
      payload.bestForwardSpan ?? -1,
      payload.bestForwardSource || '',
      Number.isFinite(payload.floor) ? payload.floor.toFixed(3) : 'NaN',
    ].join('|');
    const now = Date.now();
    if (
      fingerprint === lastForwardScanProbeFingerprint &&
      now - lastForwardScanProbeAt < FORWARD_SCAN_PROBE_THROTTLE_MS
    ) {
      return;
    }
    lastForwardScanProbeFingerprint = fingerprint;
    lastForwardScanProbeAt = now;
    try {
      console.debug('[ASR_FORWARD_SCAN]', {
        reason: payload.reason,
        cursorLine: payload.cursorLine,
        forwardRange: `${payload.rangeStart}-${payload.rangeEnd}`,
        forwardCandidatesChecked: payload.candidatesChecked,
        forwardWindowCandidatesChecked: payload.windowCandidatesChecked,
        matcherInputCount: payload.matcherInputCount,
        bestForwardIdx: payload.bestForwardIdx,
        bestForwardSim: Number.isFinite(payload.bestForwardSim)
          ? Number(payload.bestForwardSim.toFixed(3))
          : payload.bestForwardSim,
        bestForwardSpan: payload.bestForwardSpan,
        bestForwardSource: payload.bestForwardSource || null,
        floor: Number.isFinite(payload.floor) ? Number(payload.floor.toFixed(3)) : payload.floor,
      });
    } catch {}
  };

  const logForwardScanZero = (payload: {
    rangeStart: number;
    rangeEnd: number;
    sampleLines: string[];
    totalLines: number;
    sampleTruncated: boolean;
    skippedBlank: number;
    skippedCueOrMeta: number;
    expandedByLines: number;
  }) => {
    if (!isDevMode() || !shouldLogLevel(2)) return;
    const fingerprint = [
      payload.rangeStart,
      payload.rangeEnd,
      payload.totalLines,
      payload.sampleLines.length,
      payload.skippedBlank,
      payload.skippedCueOrMeta,
      payload.expandedByLines,
      payload.sampleLines[0] || '',
      payload.sampleLines[payload.sampleLines.length - 1] || '',
    ].join('|');
    const now = Date.now();
    if (
      fingerprint === lastForwardScanZeroFingerprint &&
      now - lastForwardScanZeroAt < FORWARD_SCAN_ZERO_THROTTLE_MS
    ) {
      return;
    }
    lastForwardScanZeroFingerprint = fingerprint;
    lastForwardScanZeroAt = now;
    try {
      console.warn('[ASR_FORWARD_SCAN_ZERO]', payload);
    } catch {}
  };

  const logForcedThrottle = (count: number) => {
    try {
      console.warn('ASR_FORCED_THROTTLE', `count=${count}`, `windowMs=${forcedRateWindowMs}`, `cooldownMs=${forcedCooldownMs}`);
    } catch {}
  };

  const dumpRecentEvents = (label: string) => {
    const recent = eventRing.slice(-EVENT_DUMP_COUNT);
    warnGuard(`dump_${label}`, [`dumping=${recent.length}`]);
    try {
      console.table(recent);
    } catch {
      try { console.warn(JSON.stringify(recent)); } catch {}
    }
  };

  const resolveLookahead = (resyncActive: boolean) => {
    const base = matchLookaheadSteps[Math.min(lookaheadStepIndex, matchLookaheadSteps.length - 1)] || matchLookaheadLines;
    const bonus = resyncActive ? resyncLookaheadBonus : 0;
    const boosted = resyncActive ? base + bonus : base;
    return clamp(boosted, matchLookaheadLines, matchLookaheadMax + bonus);
  };

  const bumpLookahead = (reason: string, now: number) => {
    if (lookaheadStepIndex >= matchLookaheadSteps.length - 1) return;
    if (now - lastLookaheadBumpAt < lookaheadBumpCooldownMs) return;
    lookaheadStepIndex += 1;
    lastLookaheadBumpAt = now;
    behindHitCount = 0;
    behindHitWindowStart = 0;
    logDev('lookahead bump', { reason, windowAhead: resolveLookahead(false) });
  };

  const resetLookahead = (reason: string) => {
    if (lookaheadStepIndex === 0) return;
    lookaheadStepIndex = 0;
    behindHitCount = 0;
    behindHitWindowStart = 0;
    logDev('lookahead reset', { reason, windowAhead: resolveLookahead(false) });
  };

  const resetResyncOverrides = () => {
    resyncLookaheadBonus = DEFAULT_RESYNC_LOOKAHEAD_BONUS;
    resyncBacktrackOverride = matchBacktrackLines;
  };

  const resetLagRelock = (reason?: string) => {
    if (!lagRelockHits && !lagRelockWindowStart) return;
    lagRelockHits = 0;
    lagRelockWindowStart = 0;
    logDev('lag relock reset', { reason });
  };

  function clearCommitBandReseed(reason?: string) {
    if (!commitBandReseed) return;
    commitBandReseed = null;
    if (reason) {
      logDev('commit band reseed cleared', { reason });
    }
  }

  function reseedCommitBandFromIndex(index: number, now: number, reason: string) {
    const anchorRaw = finiteNumberOrNull('band-reseed.anchor', index, { reason });
    if (anchorRaw == null) return;
    const anchor = Math.max(0, Math.floor(anchorRaw));
    const start = Math.max(0, anchor - COMMIT_BAND_RESEED_BACK_LINES);
    const end = Math.max(start, anchor + COMMIT_BAND_RESEED_AHEAD_LINES);
    commitBandReseed = {
      start,
      end,
      anchor,
      until: now + COMMIT_BAND_RESEED_TTL_MS,
      reason,
    };
    resetLagRelock('band-reseed');
    if (isDevMode()) {
      try {
        console.info('[ASR_BAND_RESEEDED]', { anchor, start, end, reason });
      } catch {
        // ignore
      }
    }
  }

  function getCommitBandReseedWindow(now: number) {
    if (!commitBandReseed) return null;
    if (now > commitBandReseed.until) {
      clearCommitBandReseed('expired');
      return null;
    }
    return commitBandReseed;
  }

  const activateStuckResync = (anchorIdx: number, now: number) => {
    resyncUntil = now + DEFAULT_STUCK_RESYNC_WINDOW_MS;
    resyncAnchorIdx = Math.max(0, Math.floor(anchorIdx));
    resyncReason = 'stuck';
    resyncLookaheadBonus = DEFAULT_STUCK_RESYNC_LOOKAHEAD_BONUS;
    resyncBacktrackOverride = Math.min(matchBacktrackLines, DEFAULT_STUCK_RESYNC_BACKTRACK_LINES);
    logDev('stuck resync', {
      anchor: resyncAnchorIdx,
      windowAhead: resolveLookahead(true),
      windowBack: resyncBacktrackOverride,
    });
  };

  const activateLagRelock = (anchorIdx: number, now: number) => {
    resyncUntil = now + DEFAULT_LAG_RELOCK_DURATION_MS;
    resyncAnchorIdx = Math.max(0, Math.floor(anchorIdx));
    resyncReason = 'lag';
    resyncLookaheadBonus = DEFAULT_LAG_RELOCK_LOOKAHEAD_BONUS;
    resyncBacktrackOverride = 0;
    lastResyncAt = now;
    emitHudStatus('relock', 'Relock: forward scan');
    logDev('lag relock', {
      anchor: resyncAnchorIdx,
      windowAhead: resolveLookahead(true),
      windowBack: resyncBacktrackOverride,
    });
  };

  const resetNoMatchTracking = (reason?: string) => {
    if (!noMatchHits && !noMatchWindowStart) return;
    noMatchWindowStart = 0;
    noMatchHits = 0;
    lastNoMatchAt = 0;
    if (reason) {
      logDev('no_match_reset', { reason });
    }
  };

  const noteNoMatchGap = (now: number, reason: string, snippet: string) => {
    const gapMs = lastNoMatchAt ? now - lastNoMatchAt : 0;
    if (!noMatchWindowStart || now - noMatchWindowStart > noMatchWindowMs) {
      noMatchWindowStart = now;
      noMatchHits = 1;
    } else {
      noMatchHits += 1;
    }
    lastNoMatchAt = now;
    if (noMatchHits >= noMatchBumpHits) {
      bumpLookahead(`no_match_${reason}`, now);
    }
    if (noMatchHits >= noMatchRelockHits && now - lastResyncAt >= resyncCooldownMs) {
      const anchorForNoMatch =
        lastLineIndex >= 0 ? lastLineIndex : Number((window as any)?.currentIndex ?? 0);
      activateStuckResync(anchorForNoMatch, now);
      emitHudStatus('resync', 'Resyncing...');
      noMatchHits = 0;
      noMatchWindowStart = now;
    }
    logDev('no_match_gap', { reason, hits: noMatchHits, gapMs, snippet });
  };

  const noteBehindBlocked = (now: number) => {
    if (!behindHitWindowStart || now - behindHitWindowStart > lookaheadBehindWindowMs) {
      behindHitWindowStart = now;
      behindHitCount = 1;
    } else {
      behindHitCount += 1;
    }
    if (behindHitCount >= lookaheadBehindHits) {
      bumpLookahead('behind_blocked', now);
    }
  };

  const maybeBumpForStall = (now: number) => {
    const lastProgressAt = Math.max(lastForwardCommitAt || 0, lastEvidenceAt || 0);
    if (now - lastProgressAt < lookaheadStallMs) return;
    bumpLookahead('stall', now);
  };


  const resolveMaxVel = (errPx: number) => {
    if (errPx >= catchupFastMinPx) return maxVelCatchupPxPerSec;
    if (errPx >= catchupMedMinPx) return maxVelMedPxPerSec;
    return maxVelPxPerSec;
  };

  const getMaxTargetJumpPx = () => {
    if (isHybridMode()) return Math.min(maxTargetJumpPx, DEFAULT_MAX_TARGET_JUMP_HYBRID_PX);
    return maxTargetJumpPx;
  };

  const tickController = () => {
    if (!pursuitActive || disposed) return;
    if (getScrollMode() === 'asr') {
      pursuitActive = false;
      pursuitTargetTop = null;
      pursuitVel = 0;
      microPursuitUntil = 0;
      return;
    }
    const scroller = getScroller();
    if (!scroller) {
      pursuitActive = false;
      return;
    }

    const now = performance.now();
    const dt = Math.max(0.001, (now - (pursuitLastTs || now)) / 1000);
    pursuitLastTs = now;

    const current = scroller.scrollTop || 0;
    appliedTopPx = current;

    const manualDelta = Math.abs(current - lastKnownScrollTop);
    if (pursuitActive && lastMoveAt && manualDelta > DEFAULT_PURSUE_MANUAL_CANCEL_PX) {
      pursuitActive = false;
      pursuitTargetTop = null;
      pursuitVel = 0;
      lastKnownScrollTop = current;
      logDev('pursuit canceled (manual scroll)', { delta: Math.round(manualDelta) });
      return;
    }

    if (pursuitTargetTop == null) {
      pursuitVel = 0;
      pursuitActive = false;
      return;
    }

    if (pursuitTargetTop < current) {
      pursuitTargetTop = current;
    }

    const err = pursuitTargetTop - current;
    const microActive = microPursuitUntil > now;
    const allowCreep = microActive || motionTuning.minPursuitPxPerSec > 0;
    if (err <= 0.5) {
      const target = pursuitTargetTop;
      pursuitVel = 0;
      pursuitActive = false;
      pursuitTargetTop = null;
      emitPursuitHud(err, pursuitVel, target, current);
      return;
    }
    if (err <= deadbandPx && !allowCreep) {
      const target = pursuitTargetTop;
      pursuitVel = 0;
      pursuitActive = false;
      pursuitTargetTop = null;
      emitPursuitHud(err, pursuitVel, target, current);
      return;
    }

    let maxVelForErr = resolveMaxVel(err);
    if (microActive) {
      maxVelForErr = Math.min(maxVelForErr, microPursuitCapPxPerSec);
    }
    const desiredVel = Math.min(maxVelForErr, Math.max(0, err * DEFAULT_PURSUE_KP));
    const accelCap = maxAccelPxPerSec2 * dt;
    const velDelta = clamp(desiredVel - pursuitVel, -accelCap, accelCap);
    pursuitVel = clamp(pursuitVel + velDelta, 0, maxVelForErr);
    if (err > 0 && pursuitVel < motionTuning.minPursuitPxPerSec) {
      pursuitVel = Math.min(maxVelForErr, Math.max(pursuitVel, motionTuning.minPursuitPxPerSec));
    }

    let move = pursuitVel * dt;
    move = Math.min(move, maxStepPx);
    if (move < minStepPx) move = Math.min(err, minStepPx);
    move = Math.min(err, move);

    if (move > 0) {
      const applied = applyScrollWithHybridGuard(current + move, { scroller, reason: 'asr-tick' });
      appliedTopPx = applied;
      lastKnownScrollTop = applied;
      lastMoveAt = Date.now();
      markProgrammaticScroll();
      if (isHybridMode()) {
        if (commitCount > 0) {
          const normalizedErr = Math.min(1, err / 200);
          const brakeFactor = Math.max(0.15, 1 - normalizedErr);
          emitHybridBrake(brakeFactor, 'asr-pursuit', HYBRID_BRAKE_TTL_MS);
        }
        const assistBoost = Math.min(Math.max(0, pursuitVel), HYBRID_ASSIST_MAX_BOOST_PXPS);
        emitHybridAssist(assistBoost, 'asr-pursuit', pursuitTargetTop ?? undefined, HYBRID_ASSIST_TTL_MS);
      }
    }
    emitPursuitHud(err, pursuitVel, pursuitTargetTop, current);
    window.requestAnimationFrame(tickController);
  };

  const ensurePursuitActive = () => {
    if (getScrollMode() === 'asr') {
      pursuitActive = false;
      pursuitTargetTop = null;
      pursuitVel = 0;
      microPursuitUntil = 0;
      return;
    }
    if (pursuitActive) return;
    pursuitActive = true;
    pursuitLastTs = performance.now();
    window.requestAnimationFrame(tickController);
  };

  const applyAsrCommitMovement = (
    commit: AsrCommit,
    deps: AsrCommitMoveDeps,
  ): AsrMoveResult => {
    const beforeTopRaw = Number.isFinite(commit.fromTop)
      ? commit.fromTop
      : deps.scroller.scrollTop;
    const beforeTop = finiteNumberOrNull('commit.beforeTop', beforeTopRaw, {
      lineIdx: commit.lineIdx,
      blockId: commit.blockId,
    }) ?? 0;
    const max = Math.max(0, deps.scroller.scrollHeight - deps.scroller.clientHeight);
    const targetTopRawCandidate = Number.isFinite(commit.nextTargetTop)
      ? commit.nextTargetTop
      : (Number.isFinite(commit.targetTop) ? commit.targetTop : beforeTop);
    const targetTopRaw =
      finiteNumberOrNull('commit.targetTop.raw', targetTopRawCandidate, {
        lineIdx: commit.lineIdx,
        blockId: commit.blockId,
      }) ?? beforeTop;
    const targetTop = clamp(targetTopRaw, 0, max);
    const reason = commit.forced ? 'asr-forced-commit' : 'asr-commit';
    if (isDevMode() && shouldLogLevel(2)) {
      try {
        console.debug('[ASR_COMMIT_MOVE]', {
          line: commit.lineIdx,
          block: commit.blockId,
          method: deps.writerAvailable && commit.blockId >= 0 ? 'writer-preferred' : 'pixel-fallback',
          role: deps.role,
          path: deps.path,
        });
      } catch {}
    }
    const stopCommitPursuit = (why: string) => {
      stopGlide(why);
      microPursuitUntil = 0;
      pursuitActive = false;
      pursuitVel = 0;
    };
    const readAfterTop = () => {
      const next = deps.scroller.scrollTop;
      return finiteNumberOrNull('commit.afterTop.readback', next, {
        reason,
        lineIdx: commit.lineIdx,
      }) ?? beforeTop;
    };
    if (deps.writerAvailable && commit.blockId >= 0) {
      stopCommitPursuit('writer-commit');
      lastCommitDeltaPx = 0;
      let writerSeekOk = false;
      try {
        seekToBlockAnimated(commit.blockId, reason, {
          targetTop,
          forceAnimated: true,
        });
        writerSeekOk = true;
      } catch {
        writerSeekOk = false;
      }
      if (writerSeekOk) {
        const writerScroller = getScroller() || deps.scroller;
        const afterTop =
          finiteNumberOrNull('commit.afterTop.writer', writerScroller?.scrollTop, {
            reason,
            lineIdx: commit.lineIdx,
            blockId: commit.blockId,
          }) ?? beforeTop;
        bootTrace('SCROLL:apply', {
          y: Math.round(afterTop),
          from: Math.round(beforeTop),
          via: 'writer',
          reason,
          lineIdx: commit.lineIdx,
          blockId: commit.blockId,
        });
        pursuitTargetTop = afterTop;
        lastKnownScrollTop = afterTop;
        lastMoveAt = Date.now();
        markProgrammaticScroll();
        return {
          method: 'writer',
          writerCommitted: true,
          beforeTop,
          afterTop,
          movedPx: Math.round(afterTop - beforeTop),
        };
      }
    }
    stopCommitPursuit('pixel-commit');
    const appliedTop = applyCanonicalScrollTop(targetTop, {
      scroller: deps.scroller,
      reason,
      source: 'asr-commit',
    });
    const afterTop =
      finiteNumberOrNull(
        'commit.afterTop.pixel',
        Number.isFinite(appliedTop) ? appliedTop : readAfterTop(),
        { reason, lineIdx: commit.lineIdx, blockId: commit.blockId },
      ) ?? beforeTop;
    bootTrace('SCROLL:apply', {
      y: Math.round(afterTop),
      from: Math.round(beforeTop),
      via: 'pixel',
      reason,
      lineIdx: commit.lineIdx,
      blockId: commit.blockId,
    });
    pursuitTargetTop = afterTop;
    lastKnownScrollTop = afterTop;
    lastMoveAt = Date.now();
    markProgrammaticScroll();
    return {
      method: 'pixel',
      writerCommitted: false,
      beforeTop,
      afterTop,
      movedPx: Math.round(afterTop - beforeTop),
    };
  };

  const schedulePending = () => {
    if (pendingRaf) return;
    pendingRaf = window.requestAnimationFrame(() => {
      pendingRaf = 0;
      if (disposed) return;
      void (async () => {
        const seq = pendingSeq;
        const pending = pendingMatch;
        if (!pending) return;
        pendingMatch = null;

      const scroller = getScroller();
      if (!scroller) {
        warnGuard('no_scroller', []);
        return;
      }

      const now = Date.now();
      const jumpCap = getMaxTargetJumpPx();
      const {
        line,
        conf,
        isFinal,
        hasEvidence,
        snippet,
        minThreshold,
        forced,
        forceReason,
        consistency,
        relockOverride,
        relockReason,
        relockSpan,
        relockOverlapRatio,
        relockRepeat,
        matchId,
        requiredThreshold: pendingRequiredThreshold,
        topScores = [],
        tieGap,
        cursorLine: pendingCursorLine,
        searchWindowFrom,
        searchWindowTo,
        lostMode: pendingLostMode,
        cueBridgeNudgeDelta: pendingCueBridgeNudgeDelta,
      } = pending;
      const thresholds = getAsrDriverThresholds();
      syncMotionTuning(thresholds, now);
      const requiredThresholdValue =
        typeof pendingRequiredThreshold === 'number' ? pendingRequiredThreshold : NaN;
      const baselineRequired = Number.isFinite(requiredThresholdValue)
        ? clamp(requiredThresholdValue, 0, 1)
        : 0;
      const minThresholdValue = typeof minThreshold === 'number' ? minThreshold : NaN;
      const matchThreshold = Number.isFinite(minThresholdValue)
        ? clamp(minThresholdValue, 0, 1)
        : baselineRequired;
      const commitCursorLine = Number.isFinite(pendingCursorLine ?? NaN)
        ? Math.max(0, Math.floor(Number(pendingCursorLine)))
        : Math.max(0, Math.floor(lastLineIndex));
      const debugSearchFrom = Number.isFinite(searchWindowFrom ?? NaN)
        ? Math.max(0, Math.floor(Number(searchWindowFrom)))
        : null;
      const debugSearchTo = Number.isFinite(searchWindowTo ?? NaN)
        ? Math.max(0, Math.floor(Number(searchWindowTo)))
        : null;
      const debugLostMode = pendingLostMode === true;
      const deltaLines = Math.max(0, Math.floor(line) - lastLineIndex);
      const deltaMinSim = computeDeltaMinSim(deltaLines);
      const overshootActive = now < overshootRiskUntil;
      let effectiveMatchThreshold = Math.max(matchThreshold, deltaMinSim);
      if (overshootActive) {
        effectiveMatchThreshold = Math.max(effectiveMatchThreshold, OVERSHOOT_RISK_MIN_SIM);
      }
      const rankedTopScores = topScores
        .map((entry) => ({
          idx: Number((entry as any)?.idx),
          score: Number((entry as any)?.score),
        }))
        .filter((entry) => Number.isFinite(entry.idx) && Number.isFinite(entry.score))
        .map((entry) => ({
          idx: Math.max(0, Math.floor(entry.idx)),
          score: entry.score,
        }))
        .sort((a, b) =>
          b.score - a.score ||
          Math.abs(a.idx - commitCursorLine) - Math.abs(b.idx - commitCursorLine) ||
          a.idx - b.idx,
        );
      const rankedPrimaryIdx = Math.max(0, Math.floor(line));
      const secondCandidate =
        rankedTopScores.find((entry) => entry.idx !== rankedPrimaryIdx) || null;
      const secondIdx = secondCandidate ? secondCandidate.idx : null;
      const secondSim = secondCandidate ? secondCandidate.score : undefined;
      const simGap = typeof secondSim === 'number' && Number.isFinite(secondSim)
        ? conf - secondSim
        : undefined;
      const secondTextForLogs = secondIdx != null
        ? formatLogSnippet(getLineTextAt(secondIdx), 60)
        : '';
      const tieMargin = typeof secondSim === 'number' && Number.isFinite(secondSim)
        ? conf - secondSim
        : typeof tieGap === 'number'
          ? tieGap
          : undefined;
      const tieOk = tieMargin === undefined || tieMargin >= thresholds.tieDelta;
      const watchdogThreshold = clamp(Math.max(stuckWatchdogForwardFloor, thresholds.candidateMinSim), 0, 1);
      const watchdogBypass =
        forceReason === 'watchdog' &&
        line > lastLineIndex &&
        conf >= watchdogThreshold;
      const cueBridgeDelta = Number.isFinite(pendingCueBridgeNudgeDelta ?? NaN)
        ? Math.max(0, Math.floor(Number(pendingCueBridgeNudgeDelta)))
        : 0;
      const cueBridgePathEligible =
        cueBridgeDelta > 0 &&
        cueBridgeDelta <= DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES &&
        line > lastLineIndex &&
        line - lastLineIndex <= cueBridgeDelta;
      const cueBridgeCurrent = Math.max(0, Math.floor(lastLineIndex));
      const cueBridgeTarget = Math.max(0, Math.floor(line));
      const cueBridgeTargetSkipReason = classifySkippableLineForCueBridge(getLineTextAt(cueBridgeTarget));
      const cueBridgeIntermediateReasons: CueBridgeSkipReason[] = [];
      let cueBridgePathValid = cueBridgePathEligible;
      if (cueBridgePathValid) {
        for (let idx = cueBridgeCurrent + 1; idx < cueBridgeTarget; idx += 1) {
          const skipReason = classifySkippableLineForCueBridge(getLineTextAt(idx));
          if (!skipReason) {
            cueBridgePathValid = false;
            break;
          }
          cueBridgeIntermediateReasons.push(skipReason);
        }
        if (cueBridgePathValid && cueBridgeTargetSkipReason) {
          cueBridgePathValid = false;
        }
      }
      const cueBridgeSkippedCount = cueBridgeIntermediateReasons.length;
      const cueBridgeSkipCountOk =
        cueBridgeSkippedCount > 0 &&
        cueBridgeSkippedCount <= DEFAULT_CUE_BRIDGE_BYPASS_MAX_SKIPPED_LINES;
      const cueBridgeFloor =
        cueBridgeDelta >= 2 ? DEFAULT_MULTI_JUMP_MIN_SIM : DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM;
      const cueBridgeStrongSim =
        conf >= Math.max(DEFAULT_CUE_BRIDGE_STRONG_SIM, cueBridgeFloor);
      const cueBridgeLargeSimGap =
        typeof tieMargin === 'number' &&
        Number.isFinite(tieMargin) &&
        tieMargin >= Math.max(thresholds.tieDelta, DEFAULT_CUE_BRIDGE_LARGE_GAP);
      const cueBridgeFinalLargeGap = isFinal && cueBridgeLargeSimGap;
      const cueBridgeEvidenceOk =
        cueBridgeStrongSim || cueBridgeFinalLargeGap;
      const cueBridgeBypass =
        cueBridgePathValid &&
        cueBridgeSkipCountOk &&
        cueBridgeEvidenceOk &&
        conf >= cueBridgeFloor &&
        isSessionAsrArmed() &&
        isSessionLivePhase();
      const progressiveFloorBypass =
        forceReason === 'progressive-floor' &&
        line >= lastLineIndex &&
        conf >= DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM &&
        isSessionAsrArmed() &&
        isSessionLivePhase();
      const lostForwardBypass =
        forceReason === 'lost-forward' &&
        line > lastLineIndex &&
        conf >= DEFAULT_LOST_FORWARD_MIN_SIM;
      const permissiveForwardBypass =
        forceReason === 'permissive-final-advance' &&
        isPermissiveAsrMatcherEnabled() &&
        line > lastLineIndex &&
        conf >= DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM &&
        isSessionAsrArmed() &&
        isSessionLivePhase();
      const finalForwardBypass =
        (forceReason === 'final-forward-nudge' || forceReason === 'final-forward-fallback') &&
        line > lastLineIndex &&
        conf >= DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM &&
        isSessionAsrArmed() &&
        isSessionLivePhase();
      const stallRescueBypass =
        forceReason === 'stall-rescue' &&
        line > lastLineIndex &&
        line - lastLineIndex <= DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES &&
        conf >= DEFAULT_MULTI_JUMP_MIN_SIM &&
        isSessionAsrArmed() &&
        isSessionLivePhase();
      const strongMatch =
        watchdogBypass ||
        progressiveFloorBypass ||
        cueBridgeBypass ||
        lostForwardBypass ||
        permissiveForwardBypass ||
        finalForwardBypass ||
        stallRescueBypass ||
        (conf >= effectiveMatchThreshold && tieOk);
      if (!strongMatch) {
        const tieParts = !tieOk && typeof tieMargin === 'number'
          ? [`tie=${formatLogScore(tieMargin)}`, `tieNeed=${formatLogScore(thresholds.tieDelta)}`]
          : [];
        const deltaParts = deltaMinSim > matchThreshold
          ? [`deltaNeed=${formatLogScore(deltaMinSim)}`]
          : [];
        const riskParts = overshootActive ? ['overshoot=1'] : [];
        warnGuard('low_sim', [
          matchId ? `matchId=${matchId}` : '',
          `current=${lastLineIndex}`,
          `best=${line}`,
          `delta=${line - lastLineIndex}`,
          `sim=${formatLogScore(conf)}`,
          `need=${formatLogScore(effectiveMatchThreshold)}`,
          ...tieParts,
          ...deltaParts,
          ...riskParts,
          cueBridgePathEligible ? `cueBridgeDelta=${cueBridgeDelta}` : '',
          relockOverride ? `relock=1` : '',
          relockReason ? `relockReason=${relockReason}` : '',
          Number.isFinite(relockSpan) ? `span=${relockSpan}` : '',
          typeof relockOverlapRatio === 'number' && Number.isFinite(relockOverlapRatio)
            ? `overlap=${formatLogScore(relockOverlapRatio)}`
            : '',
          Number.isFinite(relockRepeat) ? `repeat=${relockRepeat}` : '',
          snippet ? `clue="${snippet}"` : '',
        ]);
        emitHudStatus(
          'low_sim',
          `Low confidence - waiting (sim=${formatLogScore(conf)} < ${formatLogScore(effectiveMatchThreshold)})`,
        );
        noteLowSimFreeze(Date.now(), {
          cursorLine: lastLineIndex,
          bestIdx: line,
          delta: line - lastLineIndex,
          sim: conf,
          inBand: true,
          requiredSim: effectiveMatchThreshold,
          need: effectiveMatchThreshold,
          repeatCount: relockRepeat || 0,
          bestSpan: relockSpan,
          overlapRatio: relockOverlapRatio,
          snippet: formatLogSnippet(snippet, 80),
          matchId,
          relockModeActive: !!relockOverride,
          catchUpModeActive: false,
          stuckResyncActive: false,
          tieGap: typeof tieMargin === 'number' ? Number(tieMargin.toFixed(3)) : undefined,
        });
        return;
      }
      if (watchdogBypass && (conf < effectiveMatchThreshold || !tieOk)) {
        logDev('watchdog bypass', {
          line,
          prev: lastLineIndex,
          sim: conf,
          watchdogNeed: watchdogThreshold,
          normalNeed: effectiveMatchThreshold,
          tieOk,
          tieGap: tieMargin,
        });
      }
      if (cueBridgeBypass && isDevMode()) {
        try {
          console.info(
            `ASR_CUE_BRIDGE_LOW_SIM_BYPASS current=${lastLineIndex} target=${line} delta=${line - lastLineIndex} sim=${formatLogScore(conf)} floor=${formatLogScore(cueBridgeFloor)} skipped=[${cueBridgeIntermediateReasons.join(',')}]`,
          );
        } catch {}
      }
      if (lostForwardBypass && isDevMode()) {
        try {
          console.info(
            `ASR_LOST_FORWARD_BYPASS current=${lastLineIndex} target=${line} delta=${line - lastLineIndex} sim=${formatLogScore(conf)} floor=${formatLogScore(DEFAULT_LOST_FORWARD_MIN_SIM)}`,
          );
        } catch {}
      }
      if (permissiveForwardBypass && isDevMode()) {
        try {
          console.info(
            `ASR_PERMISSIVE_FINAL_BYPASS current=${lastLineIndex} target=${line} delta=${line - lastLineIndex} sim=${formatLogScore(conf)} floor=${formatLogScore(DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM)}`,
          );
        } catch {}
      }
      if (finalForwardBypass && isDevMode()) {
        try {
          console.info(
            `ASR_FINAL_FORWARD_BYPASS current=${lastLineIndex} target=${line} delta=${line - lastLineIndex} sim=${formatLogScore(conf)} floor=${formatLogScore(DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM)} reason=${forceReason}`,
          );
        } catch {}
      }
      if (stallRescueBypass && isDevMode()) {
        try {
          console.info(
            `ASR_STALL_RESCUE_BYPASS current=${lastLineIndex} target=${line} delta=${line - lastLineIndex} sim=${formatLogScore(conf)} floor=${formatLogScore(DEFAULT_MULTI_JUMP_MIN_SIM)}`,
          );
        } catch {}
      }

      let targetLine = Math.max(0, Math.floor(line));
      const continuityLine = chooseWithinBlockContinuityLine(
        targetLine,
        topScores,
        lastLineIndex,
        conf,
      );
      if (continuityLine !== targetLine) {
        if (isDevMode()) {
          logDev('within-block continuity', {
            from: targetLine,
            to: continuityLine,
            cursor: lastLineIndex,
            sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : conf,
          });
        }
        targetLine = continuityLine;
      }
      if (
        commitCount === 0 &&
        lastLineIndex <= 3 &&
        !forced &&
        targetLine - lastLineIndex > DEFAULT_FIRST_COMMIT_NEAR_START_MAX_DELTA
      ) {
        const cappedLine = lastLineIndex + DEFAULT_FIRST_COMMIT_NEAR_START_MAX_DELTA;
        if (isDevMode()) {
          logDev('first-commit continuity cap', {
            current: lastLineIndex,
            from: targetLine,
            to: cappedLine,
            maxDelta: DEFAULT_FIRST_COMMIT_NEAR_START_MAX_DELTA,
          });
        }
        targetLine = cappedLine;
      }
      const forceTag = String(forceReason || '').toLowerCase();
      const strongForwardCommit = conf >= DEFAULT_STRONG_FORWARD_COMMIT_SIM;
      const clampDeltaLimit = DEFAULT_COMMIT_CLAMP_MAX_DELTA_LINES;
      const cueBridgeClampEligible =
        cueBridgeBypass &&
        cueBridgeDelta > clampDeltaLimit &&
        cueBridgeDelta <= DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES &&
        targetLine > lastLineIndex &&
        targetLine - lastLineIndex <= cueBridgeDelta;
      const lostForwardClampEligible =
        forceTag === 'lost-forward' &&
        targetLine > lastLineIndex &&
        targetLine - lastLineIndex <= Math.min(getLostForwardLookaheadLines(), getLostForwardCommitCapLines()) &&
        conf >= DEFAULT_LOST_FORWARD_MIN_SIM;
      const holdAnchorClampEligible =
        forceTag === 'hold-anchor' &&
        targetLine > lastLineIndex &&
        targetLine - lastLineIndex <= DEFAULT_HOLD_ANCHOR_COMMIT_CAP_LINES &&
        conf >= DEFAULT_HOLD_ANCHOR_MIN_SIM;
      const finalNudgeClampEligible =
        (
          forceTag === 'final-forward-nudge' ||
          forceTag === 'final-forward-fallback' ||
          forceTag === 'permissive-final-advance'
        ) &&
        cueBridgePathValid &&
        cueBridgeSkipCountOk &&
        cueBridgeDelta > clampDeltaLimit &&
        cueBridgeDelta <= DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES &&
        targetLine > lastLineIndex &&
        targetLine - lastLineIndex <= cueBridgeDelta &&
        conf >= DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM;
      const watchdogClampEligible =
        forceTag === 'watchdog' &&
        targetLine > lastLineIndex &&
        targetLine - lastLineIndex <= stuckWatchdogMaxDeltaLines &&
        conf >= Math.max(stuckWatchdogForwardFloor, DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM);
      const effectiveClampDeltaLimit = holdAnchorClampEligible
        ? Math.max(clampDeltaLimit, DEFAULT_HOLD_ANCHOR_COMMIT_CAP_LINES)
        : (lostForwardClampEligible
          ? Math.max(
              clampDeltaLimit,
              Math.min(getLostForwardLookaheadLines(), getLostForwardCommitCapLines()),
            )
          : (finalNudgeClampEligible
            ? Math.max(clampDeltaLimit, cueBridgeDelta)
          : (watchdogClampEligible
            ? Math.max(clampDeltaLimit, DEFAULT_STUCK_WATCHDOG_COMMIT_CAP_LINES)
            : (cueBridgeClampEligible
              ? cueBridgeDelta
              : clampDeltaLimit))));
      if (cueBridgeClampEligible && isDevMode()) {
        try {
          console.info(
            `ASR_CUE_BRIDGE_COMMIT carry=+${cueBridgeDelta} clamp=${clampDeltaLimit}->${effectiveClampDeltaLimit} current=${lastLineIndex} target=${targetLine}`,
          );
        } catch {}
      }
      if (holdAnchorClampEligible && isDevMode()) {
        try {
          console.info(
            `ASR_HOLD_ANCHOR_CLAMP carry=+${DEFAULT_HOLD_ANCHOR_COMMIT_CAP_LINES} clamp=${clampDeltaLimit}->${effectiveClampDeltaLimit} current=${lastLineIndex} target=${targetLine}`,
          );
        } catch {}
      }
      if (lostForwardClampEligible && isDevMode()) {
        try {
          console.info(
            `ASR_LOST_FORWARD_CLAMP carry=+${Math.min(getLostForwardLookaheadLines(), getLostForwardCommitCapLines())} clamp=${clampDeltaLimit}->${effectiveClampDeltaLimit} current=${lastLineIndex} target=${targetLine}`,
          );
        } catch {}
      }
      if (finalNudgeClampEligible && isDevMode()) {
        try {
          console.info(
            `ASR_FINAL_NUDGE_CLAMP carry=+${cueBridgeDelta} clamp=${clampDeltaLimit}->${effectiveClampDeltaLimit} current=${lastLineIndex} target=${targetLine} force=${forceTag}`,
          );
        } catch {}
      }
      if (watchdogClampEligible && isDevMode()) {
        try {
          console.info(
            `ASR_WATCHDOG_CLAMP carry=+${DEFAULT_STUCK_WATCHDOG_COMMIT_CAP_LINES} clamp=${clampDeltaLimit}->${effectiveClampDeltaLimit} current=${lastLineIndex} target=${targetLine}`,
          );
        } catch {}
      }
      if (
        targetLine > lastLineIndex + effectiveClampDeltaLimit &&
        !strongForwardCommit
      ) {
        const requestedLine = targetLine;
        targetLine = lastLineIndex + effectiveClampDeltaLimit;
        if (isDevMode()) {
          try {
            const clampClass = forceTag === 'watchdog' ? 'watchdog' : forced ? 'forced' : 'normal';
            const clampReason = forceTag === 'watchdog' ? 'watchdog' : forced ? 'forced' : 'weak_forward';
            console.info(
              `ASR_CLAMP ${clampClass} prev=${lastLineIndex} req=${requestedLine} clamped=${targetLine} sim=${formatLogScore(conf)} reason=${clampReason}`,
            );
          } catch {}
        }
      }
      const cueSafeInitialTarget = resolveCueSafeCommitLine(
        targetLine,
        lastLineIndex,
        effectiveClampDeltaLimit,
      );
      let cueSafeTargetLine = cueSafeInitialTarget.nextLine;
      let cueFallbackBridgeReasons: CueBridgeSkipReason[] = [];
      if (cueSafeTargetLine == null) {
        const cueBridgeFallback = findNextSpeakableWithinBridge(
          lastLineIndex,
          DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES,
        );
        cueFallbackBridgeReasons = cueBridgeFallback.skippedReasons;
        if (cueBridgeFallback.nextLine != null && cueBridgeFallback.nextLine > lastLineIndex) {
          cueSafeTargetLine = cueBridgeFallback.nextLine;
          warnGuard('cue_commit_fallback', [
            `current=${lastLineIndex}`,
            `from=${targetLine}`,
            `to=${cueSafeTargetLine}`,
            cueSafeInitialTarget.skippedFrom != null ? `cueLine=${cueSafeInitialTarget.skippedFrom}` : '',
            cueSafeInitialTarget.skippedText
              ? `cue="${formatLogSnippet(cueSafeInitialTarget.skippedText, 48)}"`
              : '',
            cueFallbackBridgeReasons.length
              ? `bridge=[${cueFallbackBridgeReasons.join(',')}]`
              : '',
            snippet ? `clue="${snippet}"` : '',
          ]);
          logCueBridgeUse(lastLineIndex, cueSafeTargetLine, cueFallbackBridgeReasons, 'commit-fallback');
          emitHudStatus(
            'cue_commit_fallback',
            `Bridge fallback: +${Math.max(1, cueSafeTargetLine - lastLineIndex)} lines`,
          );
        }
      }
      if (cueSafeTargetLine == null) {
        warnGuard('cue_commit_blocked', [
          `current=${lastLineIndex}`,
          `best=${targetLine}`,
          `windowEnd=${lastLineIndex + effectiveClampDeltaLimit}`,
          cueSafeInitialTarget.skippedFrom != null ? `cueLine=${cueSafeInitialTarget.skippedFrom}` : '',
          cueSafeInitialTarget.skippedText
            ? `cue="${formatLogSnippet(cueSafeInitialTarget.skippedText, 48)}"`
            : '',
          cueFallbackBridgeReasons.length
            ? `bridge=[${cueFallbackBridgeReasons.join(',')}]`
            : '',
          snippet ? `clue="${snippet}"` : '',
        ]);
        emitHudStatus('cue_commit_blocked', 'Blocked: cue-only commit target');
        return;
      }
      if (cueSafeInitialTarget.nextLine != null && cueSafeTargetLine !== targetLine) {
        warnGuard('cue_commit_skip', [
          `current=${lastLineIndex}`,
          `from=${targetLine}`,
          `to=${cueSafeTargetLine}`,
          cueSafeInitialTarget.skippedText
            ? `cue="${formatLogSnippet(cueSafeInitialTarget.skippedText, 48)}"`
            : '',
          snippet ? `clue="${snippet}"` : '',
        ]);
      }
      targetLine = cueSafeTargetLine;
      const multiJumpDelta = targetLine - lastLineIndex;
      if (multiJumpDelta > 1) {
        const multiJumpBridgeEpsEligible =
          isFinal &&
          (
            forceTag === 'final-forward-nudge' ||
            forceTag === 'final-forward-fallback' ||
            forceTag === 'permissive-final-advance'
          ) &&
          cueBridgePathValid &&
          cueBridgeSkipCountOk &&
          cueBridgeDelta >= multiJumpDelta &&
          multiJumpDelta <= DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES;
        const multiJumpNeed = Math.max(
          DEFAULT_MULTI_JUMP_HARD_DENY_SIM,
          DEFAULT_MULTI_JUMP_MIN_SIM - (multiJumpBridgeEpsEligible ? DEFAULT_MULTI_JUMP_BRIDGE_SIM_EPS : 0),
        );
        const hardDeny = conf < DEFAULT_MULTI_JUMP_HARD_DENY_SIM;
        if (hardDeny || conf < multiJumpNeed) {
          warnGuard('multi_jump_low_sim', [
            `current=${lastLineIndex}`,
            `best=${targetLine}`,
            `delta=${multiJumpDelta}`,
            `sim=${formatLogScore(conf)}`,
            `need=${formatLogScore(multiJumpNeed)}`,
            multiJumpBridgeEpsEligible ? `eps=${formatLogScore(DEFAULT_MULTI_JUMP_BRIDGE_SIM_EPS)}` : '',
            hardDeny ? `hardFloor=${formatLogScore(DEFAULT_MULTI_JUMP_HARD_DENY_SIM)}` : '',
            forceReason ? `force=${forceReason}` : '',
            snippet ? `clue="${snippet}"` : '',
          ]);
          emitHudStatus(
            'multi_jump_low_sim',
            `Hold: ambiguous jump blocked (sim=${formatLogScore(conf)}, need=${formatLogScore(multiJumpNeed)})`,
          );
          return;
        }
      }
      const confirmDelta = targetLine - lastLineIndex;
      if (confirmDelta < DELTA_LARGE_MIN_LINES && largeDeltaConfirm) {
        largeDeltaConfirm = null;
      }
      if (confirmDelta >= DELTA_LARGE_MIN_LINES) {
        const confirmed = confirmLargeDelta(targetLine, now);
        if (!confirmed) {
          warnGuard('large_delta_confirm', [
            `current=${lastLineIndex}`,
            `best=${targetLine}`,
            `delta=${confirmDelta}`,
            `need=${LARGE_DELTA_CONFIRM_HITS}`,
            `window=${LARGE_DELTA_CONFIRM_WINDOW_MS}`,
          ]);
          emitHudStatus(
            'confirmations',
            `Waiting: large jump confirm (${confirmDelta} lines)`,
          );
          return;
        }
      }
      let lineEl = getLineElementByIndex(scroller, targetLine);
      if (!lineEl) {
        lineEl = await findLineElWithRetry(scroller, targetLine);
        if (seq !== pendingSeq) {
          return;
        }
      }
      let targetTop = computeLineTargetTop(scroller, lineEl);
      const currentTop =
        finiteNumberOrNull('pending.currentTop', scroller.scrollTop, {
          line: targetLine,
          cursor: lastLineIndex,
        }) ?? 0;
      if (targetTop != null) {
        const safeTargetTop = finiteNumberOrNull('pending.targetTop', targetTop, {
          line: targetLine,
          cursor: lastLineIndex,
        });
        if (safeTargetTop == null) {
          warnGuard('invalid_target_top', [
            `current=${lastLineIndex}`,
            `best=${targetLine}`,
          ]);
          emitHudStatus('invalid_target_top', 'Blocked: invalid target top');
          return;
        }
        targetTop = safeTargetTop;
      }
      let deltaPx = targetTop != null ? targetTop - currentTop : 0;

        if (targetTop == null) {
          const deltaLines = targetLine - lastLineIndex;
        const diag = diagnoseNoTarget(scroller, targetLine);
        if (maybeScheduleLineRetry(targetLine, pending)) {
          return;
        }
        const reasonChain = diag.reasons.length ? diag.reasons.join('|') : 'unknown';
        const retryEligible =
          strongMatch &&
          conf >= DEFAULT_NO_TARGET_RETRY_SIM &&
          deltaLines >= 0 &&
          deltaLines <= DEFAULT_NO_TARGET_RETRY_MAX_DELTA;
        let retryCount = 0;

        if (retryEligible) {
            const sameKey =
              noTargetRetryLine === targetLine &&
              (matchId ? matchId === noTargetRetryMatchId : noTargetRetryMatchId == null);
            if (!sameKey || now - noTargetRetryAt > DEFAULT_NO_TARGET_RETRY_WINDOW_MS) {
              noTargetRetryCount = 0;
            }
            noTargetRetryLine = targetLine;
            noTargetRetryMatchId = matchId || null;
            noTargetRetryAt = now;
            retryCount = noTargetRetryCount + 1;
            noTargetRetryCount = retryCount;
          }

          warnGuard('no_target', [
            `current=${lastLineIndex}`,
            `best=${targetLine}`,
            `delta=${deltaLines}`,
            `why=${reasonChain}`,
            `domLines=${diag.domLines}`,
            `marker=${diag.markerIdx}`,
            snippet ? `clue="${snippet}"` : '',
          ]);
          emitHudStatus('no_target', 'No target line in DOM', {
            line: targetLine,
            delta: deltaLines,
            sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : conf,
            reasons: reasonChain,
            domLines: diag.domLines,
            marker: diag.markerIdx,
            retry: retryCount,
            matchId,
          });
          logDev('no_target', {
            line: targetLine,
            delta: deltaLines,
            sim: conf,
            reasons: reasonChain,
            scroller: diag.scrollerId,
            domLines: diag.domLines,
            markerIdx: diag.markerIdx,
            retry: retryCount,
            matchId,
          });

          if (retryEligible && retryCount > 0 && retryCount <= DEFAULT_NO_TARGET_RETRY_FRAMES) {
            const approxTop = estimateTargetTopFromLines(scroller, lastLineIndex, targetLine);
            if (approxTop != null) {
              const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
              const base = pursuitTargetTop == null ? currentTop : pursuitTargetTop;
              const desired = clamp(approxTop, 0, max);
              const limitedTarget = Math.min(desired, base + jumpCap);
              if (limitedTarget > base) {
                pursuitTargetTop = limitedTarget;
                lastEvidenceAt = now;
                ensurePursuitActive();
                logDev('no_target_nudge', { line: targetLine, px: Math.round(limitedTarget - base), conf });
                emitHybridTargetHint(limitedTarget, isFinal ? 0.75 : 0.55, 'asr-no-target', undefined, targetLine);
              }
            }
            adoptPendingMatch({ ...pending });
            schedulePending();
            return;
          }
          return;
        }

      if (targetLine <= lastLineIndex) {
        if (targetLine === lastLineIndex) {
          const sameLineFinalAdvanceEligible =
            isFinal &&
            hasEvidence &&
            strongMatch &&
            deltaPx > 0 &&
            conf >= DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM;
          if (sameLineFinalAdvanceEligible) {
            const cueBridge = findNextSpeakableWithinBridge(
              lastLineIndex,
              DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES,
            );
            const bridgeUsed = cueBridge.skippedReasons.length > 0;
            const nextLine = cueBridge.nextLine;
            if (nextLine == null) {
              warnGuard('cue_commit_blocked', [
                `current=${lastLineIndex}`,
                `best=${targetLine + 1}`,
                `windowEnd=${lastLineIndex + DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES}`,
                cueBridge.skippedReasons.length
                  ? `skipped=[${cueBridge.skippedReasons.join(',')}]`
                  : '',
                snippet ? `clue="${snippet}"` : '',
              ]);
              emitHudStatus('cue_commit_blocked', 'Blocked: cue-only commit target');
              return;
            }
            const plainStrongFinalAdvance =
              !bridgeUsed &&
              nextLine === lastLineIndex + 1 &&
              conf >= DEFAULT_STRONG_FORWARD_COMMIT_SIM;
            const bridgedFinalAdvance =
              bridgeUsed &&
              conf >= DEFAULT_MULTI_JUMP_MIN_SIM;
            if (bridgedFinalAdvance || plainStrongFinalAdvance) {
              if (bridgeUsed) {
                logCueBridgeUse(lastLineIndex, nextLine, cueBridge.skippedReasons, 'same-line-confirm');
              }
              const nextTop = resolveTargetTop(scroller, nextLine);
              if (nextTop != null) {
                const nextDeltaPx = nextTop - currentTop;
                if (nextDeltaPx > 0 && nextDeltaPx <= jumpCap) {
                  targetLine = nextLine;
                  targetTop = nextTop;
                  deltaPx = nextDeltaPx;
                  logDev(
                    bridgeUsed ? 'same-line advance' : 'same-line advance (strong final)',
                    { line: targetLine, px: Math.round(nextDeltaPx), conf },
                  );
                }
              }
            }
          }
        }
      }
      if (targetLine <= lastLineIndex) {
        if (targetLine === lastLineIndex) {
          if (Math.abs(deltaPx) <= creepNearPx) {
            return;
          }
          if (now - lastSameLineNudgeTs < sameLineThrottleMs) {
            warnGuard('same_line_throttle', [
              `line=${targetLine}`,
              `since=${now - lastSameLineNudgeTs}`,
              `throttle=${sameLineThrottleMs}`,
            ]);
            pushStrongHit(targetLine, conf, isFinal, now);
            recordConsistencyEntry({
              ts: now,
              idx: targetLine,
              delta: targetLine - lastLineIndex,
              sim: conf,
              nearMarker: true,
              isFinal,
            });
            return;
          }
          const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
          const base = currentTop;
          const desired = clamp(targetTop, 0, max);
          const limitedTarget = clamp(desired, base - jumpCap, base + jumpCap);
          const recenterDelta = limitedTarget - base;
          if (Math.abs(recenterDelta) > 0.5) {
            stopGlide('same-line-recenter');
            pursuitTargetTop = limitedTarget;
            lastSameLineNudgeTs = now;
            lastEvidenceAt = now;
            const lineHeightPx = lineEl?.offsetHeight || lineEl?.clientHeight || 0;
            const microThresholdPx = lineHeightPx > 0
              ? lineHeightPx * motionTuning.microDeltaLineRatio
              : 0;
            if (microThresholdPx > 0 && Math.abs(recenterDelta) <= microThresholdPx) {
              armMicroPursuit(now, 'same-line-recenter');
            }
            ensurePursuitActive();
            logDev('same-line recenter', { line: targetLine, px: Math.round(recenterDelta), conf });
            emitHybridTargetHint(
              limitedTarget,
              isFinal ? 0.8 : 0.6,
              'asr-same-line-center',
              undefined,
              targetLine,
            );
            updateDebugState('same-line-recenter');
            return;
          }
          if (creepBudgetLine !== targetLine) {
            creepBudgetLine = targetLine;
            creepBudgetUsed = 0;
          }
          if (creepBudgetUsed >= creepBudgetPx) {
            warnGuard('creep_budget', [
              `line=${targetLine}`,
              `used=${Math.round(creepBudgetUsed)}`,
              `budget=${creepBudgetPx}`,
            ]);
            return;
          }
          const creepDirection = desired >= base ? 1 : -1;
          const creepStep = Math.min(creepPx, creepBudgetPx - creepBudgetUsed) * creepDirection;
          const creepTarget = clamp(base + creepStep, 0, max);
          const limitedCreepTarget = clamp(creepTarget, base - jumpCap, base + jumpCap);
          const appliedCreepDelta = limitedCreepTarget - base;
          if (Math.abs(appliedCreepDelta) > 0.5) {
            stopGlide('same-line-creep');
            pursuitTargetTop = limitedCreepTarget;
            lastSameLineNudgeTs = now;
            lastEvidenceAt = now;
            creepBudgetUsed += Math.abs(appliedCreepDelta);
            const lineHeightPx = lineEl?.offsetHeight || lineEl?.clientHeight || 0;
            const microThresholdPx = lineHeightPx > 0
              ? lineHeightPx * motionTuning.microDeltaLineRatio
              : 0;
            if (microThresholdPx > 0 && Math.abs(appliedCreepDelta) <= microThresholdPx) {
              armMicroPursuit(now, 'same-line-creep');
            }
            ensurePursuitActive();
            logDev('same-line creep', { line: targetLine, px: Math.round(appliedCreepDelta), conf });
            emitHybridTargetHint(
              limitedCreepTarget,
              isFinal ? 0.8 : 0.6,
              'asr-same-line-creep',
              undefined,
              targetLine,
            );
            updateDebugState('same-line-creep');
          }
          return;
        }

        // Never move backward in ASR mode; preserve monotonic forward motion.
        warnGuard('behind_blocked', [
          `current=${lastLineIndex}`,
          `best=${targetLine}`,
          `delta=${targetLine - lastLineIndex}`,
          `sim=${formatLogScore(conf)}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
        emitHudStatus('behind_blocked', 'Behind match ignored');
        return;
      }

      if (!hasEvidence) {
        warnGuard('no_evidence', [
          `current=${lastLineIndex}`,
          `best=${line}`,
          `delta=${line - lastLineIndex}`,
          `sim=${formatLogScore(conf)}`,
          `final=${isFinal ? 1 : 0}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
        if (consistency && consistency.needed > 0 && consistency.count < consistency.needed) {
          emitHudStatus(
            'confirmations',
            `Waiting: confirmations ${consistency.count}/${consistency.needed}`,
          );
        } else {
          emitHudStatus('no_evidence', 'Blocked: min evidence');
        }
        return;
      }

      const forwardDelta = targetLine - lastLineIndex;
      if (forwardDelta < minLineAdvance) {
        warnGuard('forward_progress', [
          `lastLineIndex=${lastLineIndex}`,
          `bestIdx=${line}`,
          `targetLine=${targetLine}`,
          `delta=${forwardDelta}`,
          `sim=${formatLogScore(conf)}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
        dumpRecentEvents('forwardProgress');
        return;
      }
      if (now - lastSeekTs < seekThrottleMs) {
        warnGuard('seek_throttle', [
          `current=${lastLineIndex}`,
          `best=${targetLine}`,
          `delta=${targetLine - lastLineIndex}`,
          `since=${now - lastSeekTs}`,
          `throttle=${seekThrottleMs}`,
        ]);
        return;
      }

      const rateWindowMs = 1000;
      jumpHistory = jumpHistory.filter((ts) => now - ts < rateWindowMs);
      if (!forced && jumpHistory.length >= thresholds.maxJumpsPerSecond) {
        warnGuard('rate_limited', [
          `limit=${thresholds.maxJumpsPerSecond}`,
          `windowMs=${rateWindowMs}`,
          `since=${now - (jumpHistory[0] || 0)}`,
        ]);
        emitHudStatus('rate_limited', 'Rate-limited - waiting');
        return;
      }

      const prevLineIndex = lastLineIndex;
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const lineHeightPx = (() => {
        try {
          if (!lineEl) return 0;
          const h = lineEl.offsetHeight || lineEl.clientHeight;
          if (h && Number.isFinite(h)) return h;
          const computed = Number.parseFloat(getComputedStyle(lineEl).lineHeight);
          return Number.isFinite(computed) ? computed : 0;
        } catch {
          return 0;
        }
      })();
      const rawDeltaPx = Math.max(0, targetTop - currentTop);
      const maxJumpPx = lineHeightPx > 0 ? lineHeightPx * motionTuning.maxLinesPerCommit : rawDeltaPx;
      const clampedDeltaPx = Math.min(rawDeltaPx, maxJumpPx);
      const prevCommitDeltaPx = lastCommitDeltaPx > 0 ? lastCommitDeltaPx : clampedDeltaPx;
      let smoothedDeltaPx =
        prevCommitDeltaPx +
        (clampedDeltaPx - prevCommitDeltaPx) * motionTuning.deltaSmoothingFactor;
      smoothedDeltaPx = Math.min(smoothedDeltaPx, clampedDeltaPx);
      smoothedDeltaPx = Math.max(0, smoothedDeltaPx);
      let taper = 1;
      if (max > 0) {
        const progress = clamp(currentTop / max, 0, 1);
        taper = clamp(1 - Math.pow(progress, motionTuning.taperExponent), motionTuning.taperMin, 1);
      }
      const taperedDeltaPx = Math.min(clampedDeltaPx, smoothedDeltaPx * taper);
      lastCommitDeltaPx = taperedDeltaPx;
      const maxAllowedTarget = clamp(currentTop + taperedDeltaPx, 0, max);
      const base = pursuitTargetTop == null ? currentTop : pursuitTargetTop;
      const baseClamped = Math.min(base, maxAllowedTarget);
      const candidate = maxAllowedTarget;
      const limitedTarget = forced ? candidate : Math.min(candidate, baseClamped + jumpCap);
      const nextTargetTop = Math.max(baseClamped, limitedTarget);
      pursuitTargetTop = nextTargetTop;
      const modeNow = getScrollMode();
      if (modeNow === 'asr' && !isSessionAsrArmed()) {
        if (isDevMode() && shouldLogTag('ASR:movement-blocked:not-armed', 1, 1000)) {
          try {
            console.info('[ASR] movement blocked: not armed', {
              current: lastLineIndex,
              best: targetLine,
              delta: targetLine - lastLineIndex,
              sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : conf,
              mode: modeNow,
            });
          } catch {}
        }
        bootTrace('ASR:movement:blocked', {
          reason: 'not-armed',
          current: lastLineIndex,
          best: targetLine,
          delta: targetLine - lastLineIndex,
          sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : null,
        });
        return;
      }
      const hasWriterBridge = hasActiveScrollWriter();
      const totalLinesHint = getTotalLines();
      const writerAddressability = assessWriterLineAddressability(scroller, targetLine, totalLinesHint);
      const forcePixelCommit = modeNow === 'asr' && shouldForcePixelAsrCommitPath();
      let targetBlockId = -1;
      let writerSeekLineIdx: number | null = null;
      try {
        const targetBlock = findBlockByLine(targetLine);
        targetBlockId = targetBlock?.blockId ?? -1;
        writerSeekLineIdx = targetBlock ? targetBlock.startLine : null;
      } catch {
        targetBlockId = -1;
        writerSeekLineIdx = null;
      }
      const writerPathReady = targetBlockId >= 0 && writerAddressability.allowed;
      const writerAllowed = writerPathReady && !forcePixelCommit;
      if (isDevMode() && shouldLogLevel(2)) {
        console.log('[ASR] commit->seek', {
          commitCount: commitCount + 1,
          blockId: targetBlockId,
          lineIdx: targetLine,
          hasWriter: hasWriterBridge,
          writerPathReady,
          writerAllowed,
          writerIndexedLines: writerAddressability.indexedLineCount,
          writerIndexedMin: writerAddressability.minIndexedLineCount,
          writerHasTargetLine: writerAddressability.hasTargetIndexedLine,
          writerTotalLinesHint: writerAddressability.totalLinesHint,
          forcePixelCommit,
          writerSeekLineIdx,
          mode: modeNow,
          role: resolveViewerRole(),
        });
      }

      let writerCommitted = false;
      let didGlide = false;
      const scrollerForStamp: HTMLElement | null = scroller;
      const commitBeforeTop = currentTop;
      let commitAfterTop = currentTop;
      let writerNoMove = false;
      if (modeNow === 'asr') {
        const role = resolveViewerRole();
        const path = typeof window !== 'undefined' ? window.location?.pathname || '' : '';
        const commitMove = applyAsrCommitMovement(
          {
            forced: !!forced,
            lineIdx: targetLine,
            blockId: targetBlockId,
            fromTop: commitBeforeTop,
            targetTop,
            nextTargetTop,
          },
          {
            scroller,
            writerAvailable: writerAllowed,
            role,
            path,
          },
        );
        writerCommitted = commitMove.writerCommitted;
        commitAfterTop = commitMove.afterTop;
        writerNoMove =
          writerCommitted &&
          Number.isFinite(commitAfterTop) &&
          Number.isFinite(commitBeforeTop) &&
          Math.abs(commitAfterTop - commitBeforeTop) < 1;
        didGlide = false;
        const readabilitySeq = ++postCommitReadabilitySeq;
        const immediateReadability = applyPostCommitReadabilityGuarantee(scroller, targetLine, {
          allowNudge: writerCommitted ? writerNoMove : false,
        });
        logPostCommitReadabilityProbe(
          writerCommitted ? 'commit:writer-pending' : 'commit:immediate',
          targetLine,
          writerCommitted,
          immediateReadability,
        );
        if ((!writerCommitted || writerNoMove) && immediateReadability.nudgeApplied) {
          commitAfterTop = immediateReadability.afterTop;
        }
        if (writerCommitted && !writerNoMove) {
          const scheduleSettleReadability = (attempt: number, delayMs: number) => {
            const settleTimer = window.setTimeout(() => {
              postCommitReadabilityTimers.delete(settleTimer);
              if (disposed) return;
              if (readabilitySeq !== postCommitReadabilitySeq) return;
              if (getScrollMode() !== 'asr') return;
              if (isSeekAnimationActive() && attempt < POST_COMMIT_WRITER_SETTLE_MAX_RETRIES) {
                scheduleSettleReadability(attempt + 1, POST_COMMIT_WRITER_SETTLE_RETRY_MS);
                return;
              }
              const settledReadability = applyPostCommitReadabilityGuarantee(scroller, targetLine, {
                allowNudge: true,
              });
              logPostCommitReadabilityProbe(
                'commit:writer-settle',
                targetLine,
                writerCommitted,
                settledReadability,
              );
            }, delayMs);
            postCommitReadabilityTimers.add(settleTimer);
          };
          scheduleSettleReadability(0, POST_COMMIT_WRITER_SETTLE_MS);
        }
      } else if (!writerCommitted) {
        if (nextTargetTop > base) {
          emitHybridTargetHint(
            nextTargetTop,
            isFinal ? 0.9 : 0.7,
            forced ? 'asr-forced-commit' : 'asr-commit',
            undefined,
            targetLine,
          );
        }
        const microThresholdPx = lineHeightPx > 0
          ? lineHeightPx * motionTuning.microDeltaLineRatio
          : 0;
        const useMicro = microThresholdPx > 0 && taperedDeltaPx > 0 && taperedDeltaPx <= microThresholdPx;
        if (!isHybridMode()) {
          if (useMicro) {
            stopGlide('micro-commit');
            pursuitTargetTop = nextTargetTop;
            pursuitVel = 0;
            armMicroPursuit(now, 'micro-commit');
          } else {
            microPursuitUntil = 0;
            pursuitActive = false;
            pursuitVel = 0;
            didGlide = startGlideTo(nextTargetTop, {
              scroller,
              reason: forced ? 'asr-forced-commit' : 'asr-commit',
              source: 'asr',
            });
          }
        }
        commitAfterTop = scroller.scrollTop || (pursuitTargetTop ?? currentTop);
      }
      lastLineIndex = Math.max(lastLineIndex, targetLine);
      const cursorIndex = lastLineIndex;
      lastCommitTime = Date.now();
      lastCommitIndex = cursorIndex;
      creepBudgetLine = -1;
      creepBudgetUsed = 0;
      lastForwardCommitAt = now;
      relockRepeatIdx = -1;
      relockRepeatCount = 0;
      relockRepeatWindowStart = 0;
      resetLookahead('forward_commit');
      lastSeekTs = now;
      lastEvidenceAt = now;
      if (forced) {
        forcedCommitTimes.push(now);
        pruneForcedCommits(now);
      }
      else {
        jumpHistory.push(now);
      }
      noteCommit(prevLineIndex, targetLine, now);
      closeAmbiguityHold(now, 'commit', prevLineIndex, targetLine, conf);
      if (forwardDelta >= OVERSHOOT_RISK_DELTA_LINES) {
        overshootRiskUntil = now + OVERSHOOT_RISK_WINDOW_MS;
        logDev('overshoot risk', { delta: forwardDelta, until: overshootRiskUntil });
      }
      behindRecoveryHits.length = 0;
      largeDeltaConfirm = null;
      if (pending.recoveryDetails && isDevMode()) {
        const { delta: recDelta, sim: recSim, streak, debt } = pending.recoveryDetails;
        const msg = `[ASR_RECOVERY] commit delta=${recDelta} sim=${formatLogScore(recSim)} streak=${streak} debt=${debt}`;
        logDev(msg);
        try {
          window.toast?.(msg, { type: 'info', timeoutMs: 2200 });
        } catch {
          // ignore
        }
      }
      resetLowSimStreak();
      setCurrentIndex(lastLineIndex, forceReason === 'catchup' ? 'catchup-commit' : 'commit');
      if (forced || targetLine > prevLineIndex) {
        reseedCommitBandFromIndex(targetLine, now, forced ? 'forced-commit' : 'forward-commit');
      }
      const commitTopAfterForLogs = modeNow === 'asr'
        ? commitAfterTop
        : (writerCommitted ? commitAfterTop : (pursuitTargetTop ?? currentTop));
      if (shouldLogLevel(2)) {
        try {
          const simStr = Number.isFinite(conf) ? Number(conf.toFixed(3)) : conf;
          const fromTop = Number.isFinite(commitBeforeTop) ? Math.round(commitBeforeTop) : commitBeforeTop;
          const toTopRaw = commitTopAfterForLogs;
          const toTop = Number.isFinite(toTopRaw) ? Math.round(toTopRaw as number) : toTopRaw;
          const movedPx =
            typeof fromTop === 'number' && typeof toTop === 'number' ? Math.round(toTop - fromTop) : 0;
          const targetElFound = !!lineEl;
          const action = writerCommitted ? 'writerCommit' : (modeNow === 'asr' ? 'pixelFallback' : 'driveToLine');
          const actionReason = writerCommitted ? 'writer' : (modeNow === 'asr' ? 'pixel-fallback' : 'transcript');
          console.log(
            `[ASR_DRIVER] ${action} best=${targetLine} cur=${prevLineIndex} delta=${targetLine - prevLineIndex} sim=${simStr} reason=${actionReason} fromTop=${fromTop} toTop=${toTop} movedPx=${movedPx} targetElFound=${targetElFound ? 1 : 0}`,
          );
        } catch {}
      }
      const intendedTargetTop = commitTopAfterForLogs;
      if (shouldLogLevel(2)) {
        try { console.info('[ASR_COMMIT_TARGET]', { line: targetLine, targetTop: Math.round(intendedTargetTop) }); } catch {}
      }
      bootTrace('ASR:commit', {
        matchId,
        prev: prevLineIndex,
        index: targetLine,
        delta: targetLine - prevLineIndex,
        sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : null,
        final: !!isFinal,
        via: writerCommitted ? 'writer' : 'pixel',
        forced: !!forced,
        reason: forceReason || 'commit',
      });
      logThrottled('ASR_COMMIT', 'log', 'ASR_COMMIT', {
        matchId,
        prevIndex: prevLineIndex,
        nextIndex: targetLine,
        delta: targetLine - prevLineIndex,
        sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : conf,
        scrollTopBefore: Math.round(commitBeforeTop),
        scrollTopAfter: Math.round(commitTopAfterForLogs),
        targetTop: Math.round(intendedTargetTop),
        forced: !!forced,
        via: writerCommitted ? 'writer' : 'pixel',
        mode: getScrollMode() || 'unknown',
        relock: !!relockOverride,
        relockReason: relockReason || undefined,
      });
      logCommitScrollStamp(
        writerCommitted ? 'writer' : 'pixel',
        (writerCommitted ? getScroller() : null) || scrollerForStamp,
        commitBeforeTop,
        commitTopAfterForLogs,
        targetLine,
        targetBlockId,
        writerAllowed,
      );
      scheduleCommitTruthProbe(scrollerForStamp || scroller, {
        beforeScrollTop: commitBeforeTop,
        afterScrollTop: commitTopAfterForLogs,
        writerSeekLineIdx,
        commitLineIdx: targetLine,
      });
      if (isDevMode()) {
        const writerSeekLineOut = Number.isFinite(writerSeekLineIdx as number)
          ? Math.max(0, Math.floor(writerSeekLineIdx as number))
          : 'na';
        const searchFromOut = debugSearchFrom ?? 'na';
        const searchToOut = debugSearchTo ?? 'na';
        const commitPathOut = writerAllowed ? 'writer' : 'pixel';
        const secondIdxOut = secondIdx != null ? secondIdx : 'na';
        const secondSimOut = typeof secondSim === 'number' && Number.isFinite(secondSim)
          ? formatLogScore(secondSim)
          : 'na';
        const simGapOut = typeof simGap === 'number' && Number.isFinite(simGap)
          ? formatLogScore(simGap)
          : 'na';
        try {
          console.info(
            `ASR_COMMIT_DEBUG cursorLine=${commitCursorLine} bestMatchLine=${Math.max(0, Math.floor(line))} secondIdx=${secondIdxOut} secondSim=${secondSimOut} simGap=${simGapOut} searchWindow={from:${searchFromOut},to:${searchToOut}} lostMode=${debugLostMode ? 1 : 0} writerSeekLine=${writerSeekLineOut} commitPath=${commitPathOut}${secondTextForLogs ? ` secondText="${secondTextForLogs}"` : ''}`,
          );
        } catch {
          // ignore
        }
      }
      if (modeNow !== 'asr' && !writerCommitted && !didGlide) {
        ensurePursuitActive();
      }
      if (shouldLogLevel(2)) {
        try {
          const forcedCount = getForcedCount(now);
          const forcedCooldown = getForcedCooldownRemaining(now);
          const logScroller = scrollerForStamp || scroller;
          const markerIdx = computeMarkerLineIndex(logScroller);
          const currentEl = getLineElementByIndex(logScroller, prevLineIndex);
          const bestEl = getLineElementByIndex(logScroller, targetLine);
          const markerEl = getLineElementByIndex(logScroller, markerIdx);
          const currentText = currentEl ? formatLogSnippet(currentEl.textContent || '', 60) : '';
          const bestText = bestEl ? formatLogSnippet(bestEl.textContent || '', 60) : '';
          const markerText = markerEl ? formatLogSnippet(markerEl.textContent || '', 60) : '';
          const lineHeight = bestEl?.offsetHeight || currentEl?.offsetHeight || 0;
          const commitLine = [
            'ASR_COMMIT',
            `line=${targetLine}`,
            `prev=${prevLineIndex}`,
            `delta=${targetLine - prevLineIndex}`,
            `sim=${formatLogScore(conf)}`,
            `final=${isFinal ? 1 : 0}`,
            `via=${writerCommitted ? 'writer' : 'pixel'}`,
            `marker=${markerIdx}`,
            `scrollTop=${Math.round(logScroller?.scrollTop || 0)}`,
            `lineH=${lineHeight}`,
            matchId ? `matchId=${matchId}` : '',
            secondIdx != null ? `secondIdx=${secondIdx}` : '',
            typeof secondSim === 'number' && Number.isFinite(secondSim)
              ? `secondSim=${formatLogScore(secondSim)}`
              : '',
            typeof simGap === 'number' && Number.isFinite(simGap)
              ? `simGap=${formatLogScore(simGap)}`
              : '',
            `forced=${forced ? 1 : 0}`,
            forced ? `forceReason=${forceReason || 1}` : '',
            relockOverride ? `relock=1` : '',
            relockReason ? `relockReason=${relockReason}` : '',
            Number.isFinite(relockSpan) ? `span=${relockSpan}` : '',
            typeof relockOverlapRatio === 'number' && Number.isFinite(relockOverlapRatio)
              ? `overlap=${formatLogScore(relockOverlapRatio)}`
              : '',
            Number.isFinite(relockRepeat) ? `repeat=${relockRepeat}` : '',
            `forcedCount10s=${forcedCount}`,
            forcedCooldown ? `cooldown=${forcedCooldown}` : 'cooldown=0',
            currentText ? `currentText="${currentText}"` : '',
            bestText ? `bestText="${bestText}"` : '',
            secondTextForLogs ? `secondText="${secondTextForLogs}"` : '',
            markerText ? `markerText="${markerText}"` : '',
            snippet ? `clue="${snippet}"` : '',
          ].filter(Boolean).join(' ');
          console.log(commitLine);
        } catch {}
      }
      if (forced && forceReason === 'catchup') {
        emitHudStatus('catchup_commit', `Catch-up commit +${targetLine - prevLineIndex}`);
      }
      clearEvidenceBuffer('commit');
      logDev('target update', {
        line: targetLine,
        conf,
        pxDelta: Math.round(commitTopAfterForLogs - commitBeforeTop),
        targetTop: intendedTargetTop,
        via: writerCommitted ? 'writer' : 'pixel',
      });
      updateDebugState('target-update');
      })();
    });
  };

  const ingest = (text: string, isFinal: boolean, detail?: TranscriptDetail) => {
    if (disposed) return;
    const normalized = String(text || '').trim();
    if (!normalized) return;
    const compacted = normalized.replace(/\s+/g, ' ').trim();
    const now = Date.now();
    const permissiveMatcher = isPermissiveAsrMatcherEnabled();
    const compactedComparable = normalizeComparableText(compacted);
    const compactedTokenCount = normTokens(compactedComparable).length;
    if (
      !isFinal &&
      compactedTokenCount < DEFAULT_NOISE_INTERIM_MIN_TOKENS &&
      compactedComparable.length < DEFAULT_NOISE_INTERIM_MIN_CHARS
    ) {
      if (isDevMode() && shouldLogTag('ASR_NOISE_INTERIM_DROP', 2, 250)) {
        try {
          console.debug('[ASR_NOISE_INTERIM_DROP]', {
            tokens: compactedTokenCount,
            chars: compactedComparable.length,
            text: formatLogSnippet(compacted, 48),
          });
        } catch {
          // ignore
        }
      }
      return;
    }
    eventsSinceCommit += 1;
    if (isFinal) {
      finalsSinceCommit += 1;
    }
    const stateCurrentIdx = getStateCurrentIndex();
    const incomingIdxRaw = Number((detail as any)?.currentIdx ?? NaN);
    const incomingIdx = Number.isFinite(incomingIdxRaw)
      ? Math.max(0, Math.floor(incomingIdxRaw))
      : null;
    const currentCursorIndex =
      stateCurrentIdx ??
      (lastLineIndex >= 0 ? lastLineIndex : (incomingIdx ?? -1));
    const sinceCommitMs = Math.max(0, now - lastCommitTime);
    const lostForwardAtDetection = lostForwardActive;
    const starvationDetected =
      lastCommitIndex != null &&
      sinceCommitMs > DEFAULT_STARVATION_COMMIT_GAP_MS &&
      currentCursorIndex === lastCommitIndex;
    const starvationRelock =
      starvationDetected && lostForwardAtDetection
        ? attemptForwardRelock(now, currentCursorIndex, compacted, isFinal)
        : null;
    if (starvationDetected && now - lastStarvationWarnAt >= DEFAULT_STARVATION_WARN_COOLDOWN_MS) {
      lastStarvationWarnAt = now;
      const pendingForward =
        pendingMatch != null &&
        Number.isFinite(pendingMatch.line) &&
        pendingMatch.line > currentCursorIndex;
      const lastGuardReason = guardEvents.length
        ? (guardEvents[guardEvents.length - 1]?.reason ?? null)
        : null;
      try {
        console.warn('[ASR_STARVATION_DETECTED]', {
          sinceMs: sinceCommitMs,
          isFinal: !!isFinal,
          tokenCount: compactedTokenCount,
          cursorNow: currentCursorIndex,
          lastCommitIndex,
          pendingForward: pendingForward ? 1 : 0,
          pendingLine: pendingMatch?.line ?? null,
          pendingConf: pendingMatch != null ? Number(pendingMatch.conf.toFixed(3)) : null,
          lostForwardActive: lostForwardAtDetection ? 1 : 0,
          lostForwardActiveNow: lostForwardActive ? 1 : 0,
          lostForwardStage,
          noProgressStreak,
          lastForwardCommitAgoMs: Math.max(0, now - lastForwardCommitAt),
          lastGuardReason,
          eventsSinceCommit,
          finalsSinceCommit,
          relockAttempted: starvationRelock?.attempted ? 1 : 0,
          relockApplied: starvationRelock?.applied ? 1 : 0,
          relockReason: starvationRelock?.reason ?? null,
          relockCandidate: starvationRelock?.candidateIdx ?? null,
          relockScore: starvationRelock?.candidateScore ?? null,
          relockNeed: starvationRelock?.threshold ?? null,
          relockCandidatesChecked: starvationRelock?.candidatesChecked ?? 0,
        });
      } catch {}
    }
    const preferredBackstepActive =
      microRelockPreferredCursor != null &&
      now <= microRelockPreferredUntil;
    const preferredBackstepIdx = preferredBackstepActive
      ? Math.max(0, Math.floor(Number(microRelockPreferredCursor)))
      : null;
    if (!preferredBackstepActive && microRelockPreferredCursor != null) {
      clearMicroRelockPreference();
    }
    const preferredIdx = preferredBackstepIdx ?? stateCurrentIdx ?? incomingIdx;
    if (preferredBackstepIdx != null) {
      clearMicroRelockPreference();
    }
    const liveAsrSession = getScrollMode() === 'asr' && isSessionLivePhase();
    const committedFloor = lastCommitIndex != null ? Math.max(0, Math.floor(lastCommitIndex)) : null;
    if (preferredIdx != null && preferredIdx !== lastLineIndex) {
      if (
        liveAsrSession &&
        commitCount > 0 &&
        committedFloor != null &&
        preferredIdx < committedFloor &&
        preferredBackstepIdx == null
      ) {
        warnGuard('cursor_regression_ignored', [
          `current=${lastLineIndex}`,
          `incoming=${preferredIdx}`,
          `floor=${committedFloor}`,
          `state=${stateCurrentIdx ?? 'na'}`,
          `detail=${incomingIdx ?? 'na'}`,
        ]);
      } else {
        lastLineIndex = preferredIdx;
        matchAnchorIdx = preferredIdx;
        rememberCommittedBlockFromLine(preferredIdx);
      }
    }
    if (postCatchupSamplesLeft > 0) postCatchupSamplesLeft -= 1;
    let rawMatchId = (detail as any)?.matchId;
    const noMatch = detail?.noMatch === true;
    let incomingMatch: MatchResult | undefined = detail?.match;
    if (!incomingMatch) {
      const fallbackMatch = resolveSpeechMatchResult(compacted, isFinal);
      if (fallbackMatch) {
        incomingMatch = fallbackMatch;
      }
    }
    let hasMatchId = typeof rawMatchId === 'string' && rawMatchId.length > 0;
    const explicitNoMatch = (rawMatchId === null || rawMatchId === undefined) && noMatch && !incomingMatch;
    if (!hasMatchId && !explicitNoMatch && incomingMatch) {
      rawMatchId = nextSyntheticMatchId();
      hasMatchId = true;
      if (isDevMode()) {
        try {
          console.debug('[ASR_PIPELINE] synthesized matchId', { matchId: rawMatchId });
        } catch {}
      }
    }
    if (!hasMatchId && !explicitNoMatch) {
      if (isDevMode() && !missingMatchIdKeysLogged) {
        missingMatchIdKeysLogged = true;
        try {
          const keys = detail && typeof detail === 'object' ? Object.keys(detail as Record<string, unknown>) : [];
          console.debug('[ASR_PIPELINE] missing matchId keys=[' + keys.join(',') + ']');
        } catch {}
      }
      const snippet = formatLogSnippet(compacted, 60);
      try { console.warn('[ASR_PIPELINE] NO_MATCH (pipeline): missing matchId'); } catch {}
      warnGuard('no_match_pipeline', [
        `final=${isFinal ? 1 : 0}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
      emitHudStatus('no_match', 'No match (pipeline)');
      noteNoMatchGap(now, 'missing_matchId', snippet);
      return;
    }
    if (explicitNoMatch) {
      const snippet = formatLogSnippet(compacted, 60);
      emitHudStatus('no_match', 'No match');
      noteNoMatchGap(now, 'explicit_no_match', snippet);
      return;
    }
    const matchId = rawMatchId as string;
    lastMatchId = matchId;
    const metaTranscript = detail?.source === 'meta' || detail?.meta === true;
    if (!incomingMatch) {
      const snippet = formatLogSnippet(compacted, 60);
      try { console.warn('[ASR_PIPELINE] NO_MATCH (pipeline): missing match payload'); } catch {}
      warnGuard('no_match_pipeline', [
        `matchId=${matchId}`,
        `final=${isFinal ? 1 : 0}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
      emitHudStatus('no_match', 'No match (pipeline)');
      noteNoMatchGap(now, 'missing_payload', snippet);
      return;
    }
    resetNoMatchTracking('match');
    const prevBufferChars = lastBufferChars;
    const bufferedText = metaTranscript ? compacted : updateEvidenceBuffer(compacted, isFinal, now);
    const bufferGrowing = !metaTranscript && bufferMs > 0 && bufferedText.length > prevBufferChars;
    const snippet = formatLogSnippet(bufferedText, 60);
    const freezeSnippet = formatLogSnippet(bufferedText, 80);
    const fragmentTokenCount = normTokens(compacted).length;
    const tokenCount = normTokens(bufferedText).length;
    const evidenceChars = bufferedText.length;
    if (!bootLogged) {
      bootLogged = true;
      try {
        const viewer = getScroller();
        const root = getScriptRoot() || viewer;
        const scroller = resolveActiveScroller(viewer, root);
        const scrollTop = scroller?.scrollTop ?? 0;
        const markerPct = typeof (window as any).__TP_MARKER_PCT === 'number'
          ? (window as any).__TP_MARKER_PCT
          : 0.4;
        const host = scroller || root;
        const rect = host
          ? host.getBoundingClientRect()
          : document.documentElement.getBoundingClientRect();
        const markerY = rect.top + (host ? host.clientHeight : window.innerHeight) * markerPct;
        const lineEl = (root || scroller || document).querySelector<HTMLElement>('.line');
        const pxPerLine = lineEl?.offsetHeight ?? 0;
        const topEpsilon = Math.max(24, (pxPerLine || 0) * 0.5);
        const computedLineHeight = (() => {
          if (!scroller) return 0;
          const parsed = Number.parseFloat(getComputedStyle(scroller).lineHeight);
          return Number.isFinite(parsed) ? parsed : 0;
        })();
        const currentIndexRaw = lastLineIndex >= 0 ? lastLineIndex : Number((window as any)?.currentIndex ?? -1);
        const currentIndex = Number.isFinite(currentIndexRaw) ? Math.floor(currentIndexRaw) : currentIndexRaw;
        console.info([
          'ASR_BOOT',
          `scroller=${describeElement(scroller)}`,
          `scrollTop=${Math.round(scrollTop)}`,
          `topEps=${Math.round(topEpsilon)}`,
          `markerY=${Math.round(markerY)}`,
          `pxPerLine=${Math.round(pxPerLine)}`,
          `lineHeight=${Number.isFinite(computedLineHeight) ? computedLineHeight.toFixed(2) : '?'}`,
          `currentIndex=${currentIndex}`,
        ].join(' '));
      } catch {}
    }
    lastIngestAt = now;
    updateDebugState('ingest');
    maybeLogStall(now);
    if (resyncReason && resyncUntil && now >= resyncUntil) {
      resyncReason = null;
      resyncAnchorIdx = null;
      resetResyncOverrides();
    }
    if (catchUpModeUntil && now >= catchUpModeUntil) {
      catchUpModeUntil = 0;
    }
    const evidenceShort = !isFinal && tokenCount < minTokenCount && evidenceChars < minEvidenceChars;
    if (evidenceShort && !allowShortEvidence) {
      const cursor = lastLineIndex >= 0 ? lastLineIndex : Number((window as any)?.currentIndex ?? -1);
      warnGuard('min_evidence', [
        `cursor=${cursor}`,
        `tokens=${tokenCount}`,
        `chars=${evidenceChars}`,
        `final=${isFinal ? 1 : 0}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
      emitHudStatus('min_evidence', `Blocked: min evidence (tokens=${tokenCount})`);
      logDev('short utterance ignored', { tokenCount, evidenceChars, isFinal });
      return;
    }

    maybeBumpForStall(now);
    if (
      commitCount > 0 &&
      eventsSinceCommit >= 2 &&
      now - lastForwardCommitAt >= DEFAULT_CUE_STALL_RESCUE_DELAY_MS
    ) {
      if (maybeScheduleStallCueRescue('auto-stall')) {
        return;
      }
    }
    if (now - lastForwardCommitAt >= DEFAULT_FORWARD_PROGRESS_WINDOW_MS && now - lastStuckDumpAt >= DEFAULT_FORWARD_PROGRESS_WINDOW_MS) {
      lastStuckDumpAt = now;
      if (stallRescueRequested) {
        stallRescueRequested = false;
        clearEvidenceBuffer('stuck');
        const anchorForStuck =
          lastLineIndex >= 0 ? lastLineIndex : Number((window as any)?.currentIndex ?? 0);
        activateStuckResync(anchorForStuck, now);
        emitHudStatus('resync', 'Resyncing...');
        dumpRecentEvents('stuck');
        logThrottled('ASR_GUARD:stuck', 'warn', 'ASR_GUARD', {
          reason: 'stuck',
          lastLineIndex,
          lastForwardCommitAt,
        });
      }
    }

    const mode = getScrollMode();
    const asrMode = mode === 'asr';
    const legacyWindowIdx = stateCurrentIdx ?? (asrMode ? -1 : 0);
    const anchorIdx = stateCurrentIdx != null
      ? stateCurrentIdx
      : (matchAnchorIdx >= 0
        ? matchAnchorIdx
        : (lastLineIndex >= 0 ? lastLineIndex : legacyWindowIdx));
    const resyncActive = now < resyncUntil && Number.isFinite(resyncAnchorIdx ?? NaN);
    const lagRelockActive = resyncActive && resyncReason === 'lag';
    const effectiveAnchor = resyncActive
      ? Math.max(0, Math.floor(resyncAnchorIdx as number))
      : (anchorIdx >= 0 ? Math.max(0, Math.floor(anchorIdx)) : -1);
    const anchorTarget = effectiveAnchor;

    const driverWindowBack = resyncActive ? resyncBacktrackOverride : matchBacktrackLines;
    const catchUpModeActivePre = catchUpModeUntil > now;
    const lookaheadBase = resolveLookahead(resyncActive);
    const driverWindowAheadBase = catchUpModeActivePre
      ? clamp(lookaheadBase + DEFAULT_CATCHUP_LOOKAHEAD_BONUS, matchLookaheadLines, matchLookaheadMax + DEFAULT_CATCHUP_LOOKAHEAD_BONUS)
      : lookaheadBase;
    const driverWindowAhead = lostForwardActive
      ? Math.max(driverWindowAheadBase, getLostForwardLookaheadLines())
      : driverWindowAheadBase;
    const match = incomingMatch;
    if (!match) {
      warnGuard('no_match', [
        `current=${effectiveAnchor}`,
        `final=${isFinal ? 1 : 0}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
      return;
    }
    const thresholds = getAsrDriverThresholds();
    const topScores = (Array.isArray(match.topScores) ? match.topScores : [])
      .map((entry) => ({ idx: Number((entry as any)?.idx), score: Number((entry as any)?.score) }))
      .filter((entry) => Number.isFinite(entry.idx) && Number.isFinite(entry.score))
      .map((entry) => ({ idx: Math.floor(entry.idx), score: entry.score }));
    const topScoreSpeakableCache = new Map<number, boolean>();
    const isSpeakableTopScoreIdx = (idx: number): boolean => {
      const key = Math.max(0, Math.floor(Number(idx) || 0));
      if (topScoreSpeakableCache.has(key)) return !!topScoreSpeakableCache.get(key);
      const speakable = !isIgnorableCueLineText(getLineTextAt(key));
      topScoreSpeakableCache.set(key, speakable);
      return speakable;
    };
    const topScoresSpeakable = topScores.filter((entry) => isSpeakableTopScoreIdx(entry.idx));
    const blockCorpus = asrMode ? getAsrBlockCorpus() : [];
    const anchorBlockId = asrMode ? resolveAsrAnchorBlockId(blockCorpus) : -1;
    const blockAsrText = asrMode ? normalizeComparableText(bufferedText || compacted) : '';
    const blockMatch = asrMode
      ? matchAgainstBlocks(blockAsrText, anchorBlockId, blockCorpus, {
        bufferGrowing,
        cursorLine: effectiveAnchor,
        forwardLookaheadBlocks: 2,
      })
      : null;
    const blockWindowRange = asrMode && blockMatch
      ? resolveBlockWindowRange(blockCorpus, blockMatch.blockId, bufferGrowing ? 2 : 1)
      : null;
    const blockAnchorFloor = Math.max(0, thresholds.candidateMinSim - 0.05);
    let usedBlockMatch = asrMode && !!blockMatch;
    let usedLineFallback = false;
    if (asrMode && effectiveAnchor < 0) {
      if (blockMatch && blockMatch.conf >= blockAnchorFloor) {
        let resyncedLine = Math.max(0, Math.floor(blockMatch.startLine));
        const forwardLookahead = Math.max(1, Math.floor(blockMatch.endLine - resyncedLine));
        const backwardLookback = Math.max(1, Math.floor(resyncedLine - blockMatch.startLine));
        const nextSpoken = findNextSpokenLineIndex(resyncedLine, forwardLookahead);
        const prevSpoken = prevSpeakableLineFrom(resyncedLine, backwardLookback);
        if (Number.isFinite(nextSpoken as number)) {
          resyncedLine = Math.max(0, Math.floor(nextSpoken as number));
        } else if (Number.isFinite(prevSpoken as number)) {
          resyncedLine = Math.max(0, Math.floor(prevSpoken as number));
        }
        lastLineIndex = resyncedLine;
        matchAnchorIdx = resyncedLine;
        lastCommittedBlockId = blockMatch.blockId;
        setCurrentIndex(resyncedLine, 'block-anchor-sync');
        if (isDevMode()) {
          try {
            console.info('[ASR] block anchor synced', {
              anchorBlockId,
              matchedBlockId: blockMatch.blockId,
              conf: Number(blockMatch.conf.toFixed(3)),
              line: resyncedLine,
            });
          } catch {}
        }
      } else {
        warnGuard('anchor_missing_block', [
          `anchorIdx=${anchorIdx}`,
          `anchorBlockId=${anchorBlockId}`,
          `blockConf=${formatLogScore(blockMatch?.conf ?? 0)}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
        emitHudStatus('anchor_missing', 'Waiting: block anchor');
      }
      return;
    }
    const matchWindowBackRaw = Number((match as any)?.windowBack);
    const matchWindowAheadRaw = Number((match as any)?.windowAhead);
    const matchWindowBack = Number.isFinite(matchWindowBackRaw)
      ? Math.max(0, Math.floor(matchWindowBackRaw))
      : driverWindowBack;
    const matchWindowAhead = Number.isFinite(matchWindowAheadRaw)
      ? Math.max(0, Math.floor(matchWindowAheadRaw))
      : driverWindowAhead;
    let rawIdx = Number(match.bestIdx);
    let conf = Number.isFinite(match.bestSim) ? match.bestSim : 0;
    if (asrMode && blockWindowRange) {
      const inBlockWindow =
        Number.isFinite(rawIdx) &&
        rawIdx >= blockWindowRange.startLine &&
        rawIdx <= blockWindowRange.endLine &&
        !isIgnorableCueLineText(getLineTextAt(rawIdx));
      if (!inBlockWindow) {
        const fallback = pickBestLineWithinRange(topScoresSpeakable, blockWindowRange);
        if (fallback) {
          rawIdx = fallback.idx;
          conf = fallback.score;
          usedLineFallback = true;
        } else if (blockMatch && blockMatch.conf >= blockAnchorFloor) {
          rawIdx = Math.max(0, Math.floor(blockMatch.startLine));
          const forwardLookahead = Math.max(1, Math.floor(blockMatch.endLine - rawIdx));
          const backwardLookback = Math.max(1, Math.floor(rawIdx - blockMatch.startLine));
          const nextSpoken = findNextSpokenLineIndex(rawIdx, forwardLookahead);
          const prevSpoken = prevSpeakableLineFrom(rawIdx, backwardLookback);
          if (Number.isFinite(nextSpoken as number)) {
            rawIdx = Math.max(0, Math.floor(nextSpoken as number));
          } else if (Number.isFinite(prevSpoken as number)) {
            rawIdx = Math.max(0, Math.floor(prevSpoken as number));
          }
          conf = Math.max(conf, blockMatch.conf);
          usedLineFallback = true;
        }
      }
    }
    if (Number.isFinite(rawIdx) && rawIdx >= 0 && !isSpeakableTopScoreIdx(rawIdx)) {
      const anchorForPick = effectiveAnchor >= 0 ? effectiveAnchor : 0;
      const replacement = topScoresSpeakable
        .slice()
        .sort((a, b) => b.score - a.score || Math.abs(a.idx - anchorForPick) - Math.abs(b.idx - anchorForPick))[0];
      if (replacement) {
        rawIdx = replacement.idx;
        conf = replacement.score;
        usedLineFallback = true;
      } else {
        const nextSpoken = findNextSpokenLineIndex(rawIdx, MAX_CUE_SKIP_LOOKAHEAD_LINES);
        const prevSpoken = prevSpeakableLineFrom(rawIdx, MAX_CUE_SKIP_LOOKAHEAD_LINES);
        if (Number.isFinite(nextSpoken as number)) {
          rawIdx = Math.max(0, Math.floor(nextSpoken as number));
          usedLineFallback = true;
        } else if (Number.isFinite(prevSpoken as number)) {
          rawIdx = Math.max(0, Math.floor(prevSpoken as number));
          usedLineFallback = true;
        }
      }
    }
    const currentIdxRaw = stateCurrentIdx != null ? stateCurrentIdx : Number((window as any)?.currentIndex ?? -1);
    const currentIdx = Number.isFinite(currentIdxRaw) ? Math.max(0, Math.floor(currentIdxRaw)) : -1;
    const cursorLine = currentIdx >= 0 ? currentIdx : (lastLineIndex >= 0 ? lastLineIndex : effectiveAnchor);
    const transcriptComparableForCurrent = normalizeComparableText(bufferedText || compacted || text);
    const currentLineComparableForCurrent = normalizeComparableText(getLineTextAt(cursorLine));
    let currentLineDirectSim = Number.NaN;
    if (transcriptComparableForCurrent && currentLineComparableForCurrent) {
      const transcriptTokens = normTokens(transcriptComparableForCurrent);
      const currentLineTokens = normTokens(currentLineComparableForCurrent);
      if (transcriptTokens.length && currentLineTokens.length) {
        currentLineDirectSim = computeLineSimilarityFromTokens(transcriptTokens, currentLineTokens);
      }
    }
    if (
      isDevMode() &&
      asrMode &&
      isSessionLivePhase() &&
      Number.isFinite(cursorLine) &&
      cursorLine >= 0
    ) {
      const cursorLineText = getLineTextAt(cursorLine);
      if (isIgnorableCueLineText(cursorLineText)) {
        if (now - lastBadCursorOnCueLogAt >= BAD_CURSOR_ON_CUE_LOG_THROTTLE_MS) {
          lastBadCursorOnCueLogAt = now;
          try {
            console.warn(
              `ASR_BAD_CURSOR_ON_CUE line=${cursorLine} text="${formatLogSnippet(cursorLineText || '', 64)}"`,
            );
          } catch {
            // ignore
          }
        }
      }
    }
    if (
      rawIdx < cursorLine &&
      !isBehindCandidateEligible(conf, tokenCount, evidenceChars)
    ) {
      const droppedIdx = rawIdx;
      const droppedSim = conf;
      const replacement = topScoresSpeakable
        .filter((entry) => entry.idx >= cursorLine)
        .sort((a, b) => b.score - a.score || Math.abs(a.idx - cursorLine) - Math.abs(b.idx - cursorLine) || a.idx - b.idx)[0];
      if (replacement) {
        rawIdx = replacement.idx;
        conf =
          rawIdx === cursorLine && Number.isFinite(currentLineDirectSim)
            ? Math.max(replacement.score, currentLineDirectSim)
            : replacement.score;
        usedLineFallback = true;
      } else {
        rawIdx = cursorLine;
        conf = Number.isFinite(currentLineDirectSim)
          ? currentLineDirectSim
          : Math.min(Number.isFinite(conf) ? conf : 0, DEFAULT_CURRENT_OVERRIDE_MIN_SIM - 0.01);
        usedLineFallback = true;
      }
      if (isDevMode()) {
        logThrottled('ASR_BEHIND_DROP', 'debug', 'ASR_BEHIND_DROP', {
          idx: Number.isFinite(droppedIdx) ? Math.floor(droppedIdx) : null,
          sim: Number.isFinite(droppedSim) ? Number(droppedSim.toFixed(3)) : null,
          cursorLine,
          replacement: Number.isFinite(rawIdx) ? Math.floor(rawIdx) : null,
          replacementSim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : null,
          why: 'behind_not_strong',
        });
      }
    }
    if (isDevMode() && shouldLogTag('ASR_INGEST_CURSOR', 2, 500)) {
      const markerRaw = computeMarkerLineIndex(getScroller());
      const markerIdx = Number.isFinite(markerRaw) ? Math.max(0, Math.floor(markerRaw)) : -1;
      const cursorSource =
        currentIdx >= 0
          ? 'state.currentIndex'
          : (lastLineIndex >= 0 ? 'lastLineIndex' : 'effectiveAnchor');
      try {
        console.debug('[ASR_INGEST_CURSOR]', {
          cursorLine,
          cursorSource,
          stateCurrentIndex: currentIdx,
          incomingCurrentIdx: incomingIdx,
          markerIdx,
          lastCommittedIndex: lastCommitIndex ?? -1,
        });
      } catch {
        // ignore
      }
    }
    const baseCommitThreshold = isFinal
      ? thresholds.commitFinalMinSim
      : clamp(thresholds.commitInterimMinSim * interimScale, 0, 1);
    const shortBoost = tokenCount <= shortTokenMax ? shortTokenBoost : 0;
    const requiredThreshold = clamp(baseCommitThreshold + shortBoost, 0, 1);
    const interimHighThreshold = clamp(requiredThreshold + interimHysteresisBonus, 0, 1);
    const consistencyMinSim = clamp(requiredThreshold - consistencySimSlack, 0, 1);
    const catchupMinSim = clamp(requiredThreshold - catchupSimSlack, 0, 1);
    const prevIndex = cursorLine >= 0 ? cursorLine : 0;
    const bestMatchLineForProgress = Number.isFinite(rawIdx) ? Math.max(0, Math.floor(rawIdx)) : prevIndex;
    noteNoProgressIngest(now, prevIndex, bestMatchLineForProgress, conf, requiredThreshold);
    const candidateAnchorLine = Number.isFinite(rawIdx) ? Math.max(0, Math.floor(rawIdx)) : null;
    if (candidateAnchorLine !== null && conf >= thresholds.anchorMinSim) {
      if (anchorStreakLine === candidateAnchorLine) {
        anchorStreakCount += 1;
      } else {
        anchorStreakLine = candidateAnchorLine;
        anchorStreakCount = 1;
      }
    } else {
      anchorStreakLine = null;
      anchorStreakCount = 0;
    }
    const anchorDelta = Math.abs(anchorTarget - prevIndex);
    const commitFinalOk = isFinal && conf >= thresholds.commitFinalMinSim;
    const anchorStreakOk = anchorStreakLine !== null && anchorStreakCount >= thresholds.anchorStreakNeeded;
    const anchorAllowedByDelta = anchorDelta <= thresholds.maxAnchorJumpLines;
    const anchorAllowedByConfidence = commitFinalOk || anchorStreakOk;
    if (anchorAllowedByDelta || anchorAllowedByConfidence) {
      setCurrentIndex(anchorTarget, 'anchor-sync');
    } else {
      warnGuard('anchor_blocked', [
        `current=${prevIndex}`,
        `target=${anchorTarget}`,
        `delta=${anchorDelta}`,
        `sim=${formatLogScore(conf)}`,
        `need=${formatLogScore(thresholds.anchorMinSim)}`,
      ]);
    }
    const noMatchFlag = !Number.isFinite(rawIdx) || rawIdx < 0;
    bootTrace('ASR:match', {
      matchId,
      idx: Number.isFinite(rawIdx) ? Math.floor(rawIdx) : null,
      sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : null,
      final: !!isFinal,
      anchor: cursorLine,
      meta: !!metaTranscript,
      clue: snippet || undefined,
    });
    if (isDevMode() && rawIdx !== cursorLine && shouldLogTag('ASR_EVENT_IDX', 2, 250)) {
      const bestOut = Number.isFinite(rawIdx) ? Math.floor(rawIdx) : rawIdx;
      const deltaOut = Number.isFinite(rawIdx) ? Math.floor(rawIdx) - cursorLine : NaN;
      try {
        console.debug(
          '[ASR_EVENT_IDX]',
          `matchId=${matchId}`,
          `current=${cursorLine}`,
          `best=${bestOut}`,
          `delta=${Number.isFinite(deltaOut) ? deltaOut : 'NaN'}`,
          `sim=${formatLogScore(conf)}`,
          `noMatch=${noMatchFlag ? 1 : 0}`,
        );
      } catch {}
    }
    if (!Number.isFinite(rawIdx)) {
      warnGuard('invalid_match', [
        `current=${currentIdx}`,
        `final=${isFinal ? 1 : 0}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
      return;
    }
    if (rawIdx < 0) {
      if (maybeSkipCueLine(cursorLine, now, 'no_match', snippet)) {
        return;
      }
      warnGuard('no_match', [
        `current=${currentIdx}`,
        `final=${isFinal ? 1 : 0}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
      emitHudStatus('no_match', 'No match');
      return;
    }
    const totalLines = getTotalLines();
    const baseBandStart = Number.isFinite((match as any)?.bandStart)
      ? Math.max(0, Math.floor((match as any).bandStart))
      : Math.max(0, cursorLine - matchWindowBack);
    const baseBandEnd = Number.isFinite((match as any)?.bandEnd)
      ? Math.max(baseBandStart, Math.floor((match as any).bandEnd))
      : (totalLines > 0
        ? Math.min(totalLines - 1, cursorLine + matchWindowAhead)
        : cursorLine + matchWindowAhead);
    let bandStart = baseBandStart;
    let bandEnd = baseBandEnd;
    let lostForwardGateRejected = false;
    if (lostForwardActive) {
      const lostForwardWindow = getLostForwardLookaheadLines();
      const lostForwardBandEnd = totalLines > 0
        ? Math.min(totalLines - 1, cursorLine + lostForwardWindow)
        : cursorLine + lostForwardWindow;
      bandEnd = Math.max(bandEnd, lostForwardBandEnd);
    }
    const bandBackToleranceStart = Math.max(0, cursorLine - DEFAULT_BAND_BACK_TOLERANCE_LINES);
    const reseededBand = getCommitBandReseedWindow(now);
    if (reseededBand) {
      bandStart = Math.max(0, Math.min(bandStart, reseededBand.start));
      bandEnd = Math.max(bandStart, Math.max(bandEnd, reseededBand.end));
      if (
        isDevMode() &&
        rawIdx >= bandStart &&
        rawIdx <= bandEnd &&
        (rawIdx < baseBandStart || rawIdx > baseBandEnd) &&
        shouldLogTag('ASR_BAND_RESEED_HIT', 2, 500)
      ) {
        try {
          console.info('[ASR_BAND_RESEED_HIT]', {
            current: cursorLine,
            best: rawIdx,
            baseBandStart,
            baseBandEnd,
            bandStart,
            bandEnd,
            reseedAnchor: reseededBand.anchor,
            reseedReason: reseededBand.reason,
          });
        } catch {
          // ignore
        }
      }
    }
    bandStart = Math.max(bandStart, bandBackToleranceStart);
    bandEnd = Math.max(bandStart, bandEnd);
    const bandFloor = clamp(thresholds.candidateMinSim, 0, 1);
    const rawScoreByIdx = new Map<number, number>();
    topScoresSpeakable.forEach((entry) => {
      const idx = Number(entry.idx);
      const score = Number(entry.score);
      if (Number.isFinite(idx) && Number.isFinite(score)) {
        rawScoreByIdx.set(idx, score);
      }
    });
    let overrideReason: string | undefined;
    const transcriptComparableForOverride = transcriptComparableForCurrent;
    const currentLineComparableForOverride = currentLineComparableForCurrent;
    let currentLineSim = Number(rawScoreByIdx.get(cursorLine));
    if (Number.isFinite(currentLineDirectSim)) {
      currentLineSim = Number.isFinite(currentLineSim)
        ? Math.max(currentLineSim, currentLineDirectSim)
        : currentLineDirectSim;
    }
    if (
      (!Number.isFinite(currentLineSim) || currentLineSim < 0) &&
      transcriptComparableForOverride &&
      currentLineComparableForOverride
    ) {
      const transcriptTokens = normTokens(transcriptComparableForOverride);
      const currentLineTokens = normTokens(currentLineComparableForOverride);
      if (transcriptTokens.length && currentLineTokens.length) {
        currentLineSim = computeLineSimilarityFromTokens(transcriptTokens, currentLineTokens);
      }
    }
    const overrideNeed = clamp(Math.max(bandFloor, DEFAULT_CURRENT_OVERRIDE_MIN_SIM), 0, 1);
    if (
      rawIdx < cursorLine &&
      Number.isFinite(currentLineSim) &&
      currentLineSim >= overrideNeed
    ) {
      const before = rawIdx;
      const beforeSim = conf;
      rawIdx = cursorLine;
      conf = currentLineSim;
      usedLineFallback = true;
      overrideReason = 'override_current_over_behind';
      if (isDevMode()) {
        try {
          console.info(
            `[ASR_OVERRIDE] reason=override_current_over_behind current=${cursorLine} best=${before} sim=${formatLogScore(beforeSim)} curSim=${formatLogScore(currentLineSim)} need=${formatLogScore(overrideNeed)}`,
          );
        } catch {}
      }
    }

    const inBandCandidateMap = new Map<number, number>();
    topScoresSpeakable.forEach((entry) => {
      const idx = Math.max(0, Math.floor(Number(entry.idx)));
      const score = Number(entry.score);
      if (!Number.isFinite(idx) || !Number.isFinite(score)) return;
      if (idx < cursorLine && !isBehindCandidateEligible(score, tokenCount, evidenceChars)) {
        if (isDevMode()) {
          logThrottled('ASR_BEHIND_DROP', 'debug', 'ASR_BEHIND_DROP', {
            idx,
            sim: Number(score.toFixed(3)),
            cursorLine,
            why: 'behind_not_strong',
          });
        }
        return;
      }
      if (idx < bandStart || idx > bandEnd) return;
      const existing = inBandCandidateMap.get(idx);
      if (existing == null || score > existing) {
        inBandCandidateMap.set(idx, score);
      }
    });
    const shouldDropRawBehind =
      rawIdx < cursorLine && !isBehindCandidateEligible(conf, tokenCount, evidenceChars);
    if (shouldDropRawBehind) {
      if (isDevMode()) {
        logThrottled('ASR_BEHIND_DROP', 'debug', 'ASR_BEHIND_DROP', {
          idx: Number.isFinite(rawIdx) ? Math.floor(rawIdx) : null,
          sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : null,
          cursorLine,
          why: 'behind_not_strong',
        });
      }
    } else if (
      Number.isFinite(rawIdx) &&
      rawIdx >= bandStart &&
      rawIdx <= bandEnd &&
      !isIgnorableCueLineText(getLineTextAt(rawIdx))
    ) {
      const idx = Math.max(0, Math.floor(rawIdx));
      const existing = inBandCandidateMap.get(idx);
      if (existing == null || conf > existing) {
        inBandCandidateMap.set(idx, conf);
      }
    }
    const inBandCandidates = Array.from(inBandCandidateMap.entries())
      .map(([idx, score]) => ({ idx, score }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aDelta = a.idx - cursorLine;
        const bDelta = b.idx - cursorLine;
        const aForward = aDelta >= 0 ? 1 : 0;
        const bForward = bDelta >= 0 ? 1 : 0;
        if (bForward !== aForward) return bForward - aForward;
        const aAbs = Math.abs(aDelta);
        const bAbs = Math.abs(bDelta);
        if (aAbs !== bAbs) return aAbs - bAbs;
        return a.idx - b.idx;
      });
    const selectedInBand = inBandCandidates[0] || null;
    if (selectedInBand && selectedInBand.score >= bandFloor && (selectedInBand.idx !== rawIdx || selectedInBand.score !== conf)) {
      if (isDevMode() && shouldLogTag('ASR_BAND_PICK', 2, 250)) {
        try {
          console.info('[ASR_BAND_PICK]', {
            current: cursorLine,
            globalBest: Number.isFinite(rawIdx) ? Math.floor(rawIdx) : null,
            globalSim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : null,
            picked: selectedInBand.idx,
            pickedSim: Number(selectedInBand.score.toFixed(3)),
            bandStart,
            bandEnd,
            candidates: inBandCandidates.length,
          });
        } catch {
          // ignore
        }
      }
      rawIdx = selectedInBand.idx;
      conf = selectedInBand.score;
      usedLineFallback = true;
    }
    let inBand = rawIdx >= bandStart && rawIdx <= bandEnd;
    const manualAnchorEnabled = isManualAnchorAdoptEnabled();
    if (manualAnchorPending && manualAnchorEnabled && now - manualAnchorPending.ts >= MANUAL_ANCHOR_PENDING_TIMEOUT_MS) {
      rejectManualAnchorPending('no local evidence');
    }
    if (!inBand) {
      if (rawIdx < cursorLine) {
        const forwardBandPick = inBandCandidates.find((entry) => entry.idx >= cursorLine && entry.score >= bandFloor) || null;
        if (isDevMode()) {
          logThrottled('ASR_BEHIND_DROP', 'debug', 'ASR_BEHIND_DROP', {
            idx: Number.isFinite(rawIdx) ? Math.floor(rawIdx) : null,
            sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : null,
            cursorLine,
            bandStart,
            bandEnd,
            replacement: forwardBandPick ? forwardBandPick.idx : Math.max(cursorLine, bandStart),
            replacementSim: forwardBandPick ? Number(forwardBandPick.score.toFixed(3)) : Number((bandFloor - 0.01).toFixed(3)),
            why: 'behind_out_of_band',
          });
        }
        if (forwardBandPick) {
          rawIdx = forwardBandPick.idx;
          conf = forwardBandPick.score;
        } else {
          rawIdx = Math.max(cursorLine, bandStart);
          conf = Math.min(Number.isFinite(conf) ? conf : 0, bandFloor - 0.01);
        }
        usedLineFallback = true;
        inBand = rawIdx >= bandStart && rawIdx <= bandEnd;
      } else {
        warnGuard('match_out_of_band_defer', [
          `current=${cursorLine}`,
          `best=${rawIdx}`,
          `delta=${rawIdx - cursorLine}`,
          `baseBandStart=${baseBandStart}`,
          `baseBandEnd=${baseBandEnd}`,
          `bandStart=${bandStart}`,
          `bandEnd=${bandEnd}`,
          `inBand=${inBand ? 1 : 0}`,
          selectedInBand ? `bestBand=${selectedInBand.idx}` : 'bestBand=-1',
          selectedInBand ? `bestBandSim=${formatLogScore(selectedInBand.score)}` : '',
          `bandFloor=${formatLogScore(bandFloor)}`,
        ]);
        emitHudStatus('match_out_of_band', 'Out-of-band candidate deferred');
      }
    }
    const rawBestSim = conf;
    const candidateIdx = Number.isFinite(rawIdx) ? Math.max(0, Math.floor(rawIdx)) : -1;
    const confirmingCurrentLine = candidateIdx >= 0 && candidateIdx === cursorLine;
    const stickAdjust = confirmingCurrentLine ? thresholds.stickinessDelta : 0;
    const effectiveThresholdForPending = clamp(requiredThreshold - stickAdjust, 0, 1);
    const bestSpan = Number((match as any)?.bestSpan);
    const bestOverlap = Number((match as any)?.bestOverlap);
    const bestOverlapRatio = Number((match as any)?.bestOverlapRatio);
    const isSlamDunkFinal = (idx: number, sim: number) => {
      if (!isFinal) return false;
      const delta = idx - cursorLine;
      if (delta < 0 || delta > slamDunkMaxDelta) return false;
      if (sim < slamDunkSim) return false;
      const hasCompetitor = topScoresSpeakable.some((entry) => {
        const entryIdx = Number(entry.idx);
        const entryScore = Number(entry.score);
        if (!Number.isFinite(entryIdx) || !Number.isFinite(entryScore)) return false;
        if (entryIdx === idx) return false;
        return entryScore >= sim - slamDunkCompetitorDelta;
      });
      return !hasCompetitor;
    };
    if (metaTranscript) {
      const overlapOk = Number.isFinite(bestOverlapRatio) && bestOverlapRatio >= DEFAULT_META_OVERLAP_RATIO;
      if (!overlapOk) {
        warnGuard('meta_skip', [
          matchId ? `matchId=${matchId}` : '',
          `current=${cursorLine}`,
          `best=${rawIdx}`,
          `delta=${rawIdx - cursorLine}`,
          Number.isFinite(bestOverlapRatio) ? `overlap=${formatLogScore(bestOverlapRatio)}` : '',
          snippet ? `clue="${snippet}"` : '',
        ]);
        emitHudStatus('meta_skip', 'Ignored: meta transcript');
        return;
      }
    }
    const delta = rawIdx - cursorLine;
    const deltaAbs = Math.abs(delta);
    if (delta >= BEHIND_DEBT_WINDOW_LINES) {
      behindDebt = Math.min(BEHIND_DEBT_CAP, behindDebt + delta);
      behindDebtStreak += 1;
    } else {
      behindDebt = Math.max(0, behindDebt - BEHIND_DEBT_DECAY);
      if (deltaAbs <= BEHIND_DEBT_WINDOW_LINES) {
        behindDebtStreak = Math.max(0, behindDebtStreak - 1);
      }
    }
    if (lagRelockActive && Number.isFinite(bestSpan) && bestSpan > 1) {
      const parts = [
        `Relock best=${rawIdx}`,
        `(${bestSpan}-line)`,
        `sim=${formatLogScore(conf)}`,
        Number.isFinite(bestOverlap) ? `overlap=${bestOverlap}` : null,
        Number.isFinite(bestOverlapRatio) ? `overlapPct=${formatLogScore(bestOverlapRatio)}` : null,
        snippet ? `clue="${snippet}"` : null,
      ].filter(Boolean).join(' ');
      emitHudStatus('relock_match', parts);
      logDev('relock match', {
        best: rawIdx,
        span: bestSpan,
        sim: conf,
        overlap: bestOverlap,
        overlapPct: bestOverlapRatio,
        clue: snippet,
      });
    }
    const effectiveRawSim = rawScoreByIdx.get(rawIdx) ?? rawBestSim;
    let effectiveThreshold = requiredThreshold;
    const trustFloor = Math.max(thresholds.candidateMinSim, thresholds.commitInterimMinSim - RECOVERY_SIM_SLACK);
    const recoveryCandidate =
      !noMatchFlag &&
      delta >= RECOVERY_BIG_JUMP_LINES &&
      conf >= RECOVERY_SIM_MIN &&
      behindDebtStreak >= RECOVERY_STREAK_REQUIRED;
    if (recoveryCandidate) {
      const recoveryNeed = Math.max(trustFloor, requiredThreshold - RECOVERY_SIM_SLACK);
      effectiveThreshold = Math.min(effectiveThreshold, recoveryNeed);
      logDev('recovery relax', {
        delta,
        sim: conf,
        need: recoveryNeed,
        debt: behindDebt,
        streak: behindDebtStreak,
      });
    }
    const recoveryDetails = recoveryCandidate
      ? {
          delta,
          sim: conf,
          streak: behindDebtStreak,
          debt: behindDebt,
        }
      : undefined;
    const scrollerForMatch = getScroller();
    const scrollTopForMatch = scrollerForMatch?.scrollTop ?? 0;
    if (manualAnchorPending && manualAnchorEnabled) {
      const candidateLine = Number.isFinite(rawIdx) ? Math.max(0, Math.floor(rawIdx)) : -1;
      const candidateNeed = clamp(thresholds.candidateMinSim + MANUAL_ANCHOR_SIM_SLACK, 0, 1);
      if (
        candidateLine >= 0 &&
        Math.abs(candidateLine - manualAnchorPending.targetIndex) <= MANUAL_ANCHOR_WINDOW_LINES &&
        conf >= candidateNeed
      ) {
        if (adoptManualAnchorTruth(candidateLine, conf, scrollerForMatch)) {
          return;
        }
      }
    }
    const catchUpModeWasActive = catchUpModeUntil > now;
    const lowSimFloor = lagRelockActive ? DEFAULT_LAG_RELOCK_LOW_SIM_FLOOR : DEFAULT_LOW_SIM_FLOOR;
    const postCatchupActive = isPostCatchupActive(now);
    if (postCatchupActive) {
      effectiveThreshold = Math.max(0.5, effectiveThreshold - POST_CATCHUP_DROP);
    }
    const alignedPostCatchup =
      postCatchupActive &&
      (!POST_CATCHUP_REQUIRE_IN_BAND || inBand) &&
      deltaAbs <= POST_CATCHUP_MAX_DELTA;
    if (catchUpModeWasActive && rawIdx < cursorLine) {
      warnGuard('catchup_ignore_behind', [
        `current=${cursorLine}`,
        `best=${rawIdx}`,
        `delta=${rawIdx - cursorLine}`,
        `sim=${formatLogScore(effectiveRawSim)}`,
      ]);
      emitHudStatus('catchup', 'Catch-up: ON');
      return;
    }
    const behindByLowSim =
      rawIdx < cursorLine - matchWindowBack ||
      (rawIdx < cursorLine && effectiveRawSim < lowSimFloor);
    if (behindByLowSim) {
      warnGuard('behind_noise', [
        `current=${cursorLine}`,
        `best=${rawIdx}`,
        `delta=${rawIdx - cursorLine}`,
        `sim=${formatLogScore(effectiveRawSim)}`,
        `floor=${formatLogScore(lowSimFloor)}`,
      ]);
      emitHudStatus('behind_noise', 'Ignored: low-sim behind match');
      const lagDelta = rawIdx - cursorLine;
      const lagSubstance =
        tokenCount >= DEFAULT_LAG_RELOCK_MIN_TOKENS ||
        evidenceChars >= DEFAULT_LAG_RELOCK_MIN_CHARS;
      const lagEligible =
        lagDelta <= -DEFAULT_LAG_RELOCK_MIN_DELTA &&
        lagSubstance;
      if (lagEligible) {
        if (!lagRelockWindowStart || now - lagRelockWindowStart > DEFAULT_LAG_RELOCK_WINDOW_MS) {
          lagRelockWindowStart = now;
          lagRelockHits = 1;
        } else {
          lagRelockHits += 1;
        }
        if (!lagRelockActive && lagRelockHits >= DEFAULT_LAG_RELOCK_BEHIND_HITS && now - lastResyncAt >= resyncCooldownMs) {
          activateLagRelock(cursorLine, now);
          resetLagRelock('triggered');
        }
      } else {
        resetLagRelock('behind_noise');
      }
      return;
    }
    resetLagRelock('in-band');
    if (isDevMode() && shouldLogTag('ASR_DEBUG_COMPARISON', 2, 750)) {
      const currentIndex = cursorLine;
      const scriptLinesLength = getTotalLines();
      const scriptRaw = getLineTextAt(currentIndex);
      const scriptNormalized = normalizeComparableText(scriptRaw);
      const asrRaw = String(text || '');
      const asrNormalized = normalizeComparableText(asrRaw);
      try {
        console.log('=== ASR DEBUG COMPARISON ===');
        console.log('ScriptLines length:', Number.isFinite(scriptLinesLength) ? scriptLinesLength : 'null');
        console.log('CurrentIndex:', currentIndex);
        console.log('AnchorBlockId:', anchorBlockId);
        console.log('BlockTextNormalized:', blockMatch?.textNormSample || '');
        console.log('Script Raw:', scriptRaw);
        console.log('Script Normalized:', scriptNormalized);
        console.log('ASR Raw:', asrRaw);
        console.log('ASR Normalized:', asrNormalized);
        console.log('Overlap Tokens:', getOverlapTokens(scriptNormalized, asrNormalized));
        console.log('Similarity:', conf);
        console.log('============================');
      } catch {}
    }
    logThrottled('ASR_MATCH', 'log', 'ASR_MATCH', {
      matchId,
      currentIndex: cursorLine,
      bestIndex: rawIdx,
      delta: rawIdx - cursorLine,
      sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : conf,
      reason: overrideReason,
      scrollTop: Math.round(scrollTopForMatch),
      winBack: matchWindowBack,
      winAhead: matchWindowAhead,
      final: isFinal ? 1 : 0,
      anchorBlockId,
      bestBlockId: blockMatch?.blockId ?? null,
      usedBlockMatch: usedBlockMatch ? 1 : 0,
      usedLineFallback: usedLineFallback ? 1 : 0,
    });
    if (
      (resyncReason === 'stuck' || resyncReason === 'lag') &&
      resyncActive &&
      rawIdx >= cursorLine + minLineAdvance &&
      conf >= DEFAULT_STUCK_RELOCK_SIM
    ) {
      resyncUntil = 0;
      resyncAnchorIdx = null;
      resyncReason = null;
      resetResyncOverrides();
      emitHudStatus('resync_lock', 'Resync locked');
      resetLagRelock('lock');
    }
    const shortFinal =
      isFinal && fragmentTokenCount >= shortFinalMinTokens && fragmentTokenCount <= shortFinalMaxTokens;
    const shortFinalRecent =
      shortFinal && lastLineIndex >= 0 && now - lastForwardCommitAt <= shortFinalWindowMs;
    const shortFinalNeed = shortFinalRecent
      ? clamp(requiredThreshold - shortFinalSimSlack, 0, 1)
      : requiredThreshold;
    const outrunRecent =
      isFinal && lastLineIndex >= 0 && now - lastForwardCommitAt <= outrunWindowMs;
    const forwardMatcherInputs = buildForwardMatcherInputs(bufferedText, compacted, isFinal);
    const forwardRangeStart = Math.max(0, cursorLine + 1);
    const lostForwardWindow = lostForwardActive ? getLostForwardLookaheadLines() : 0;
    const forwardInitialEnd = cursorLine + Math.max(
      1,
      lostForwardActive
        ? lostForwardWindow
        : outrunLookaheadLines,
    );
    const totalForwardLines = getTotalLines();
    const forwardHardEnd = lostForwardActive
      ? (totalForwardLines > 0
          ? Math.min(totalForwardLines - 1, Math.max(forwardRangeStart, cursorLine + lostForwardWindow))
          : Math.max(forwardRangeStart, cursorLine + lostForwardWindow))
      : (totalForwardLines > 0
          ? Math.max(forwardRangeStart, totalForwardLines - 1)
          : Math.max(forwardRangeStart, cursorLine + Math.max(outrunLookaheadLines * 4, 120)));
    const forwardMinCandidates = 6;
    const forwardExpandStep = lostForwardActive ? 0 : Math.max(12, Math.floor(outrunLookaheadLines));
    const forwardMaxExpandLines = lostForwardActive
      ? 0
      : Math.max(forwardExpandStep, Math.floor(outrunLookaheadLines * 3));
    let forwardRangeEnd = Math.min(
      forwardHardEnd,
      Math.max(forwardRangeStart, forwardInitialEnd),
    );
    let skippedBlank = 0;
    let skippedCueOrMeta = 0;
    let scanIdx = forwardRangeStart;
    const forwardCandidateLineIdx: number[] = [];
    while (scanIdx <= forwardRangeEnd) {
      const lineText = getLineTextAt(scanIdx);
      if (!lineText) {
        skippedBlank += 1;
        scanIdx += 1;
        continue;
      }
      if (isIgnorableCueLineText(lineText)) {
        skippedCueOrMeta += 1;
        scanIdx += 1;
        continue;
      }
      forwardCandidateLineIdx.push(scanIdx);
      scanIdx += 1;
    }
    while (
      forwardCandidateLineIdx.length < forwardMinCandidates &&
      forwardRangeEnd < forwardHardEnd &&
      (forwardRangeEnd - Math.max(forwardRangeStart, forwardInitialEnd)) < forwardMaxExpandLines
    ) {
      const nextEnd = Math.min(forwardHardEnd, forwardRangeEnd + forwardExpandStep);
      for (let idx = forwardRangeEnd + 1; idx <= nextEnd; idx += 1) {
        const lineText = getLineTextAt(idx);
        if (!lineText) {
          skippedBlank += 1;
          continue;
        }
        if (isIgnorableCueLineText(lineText)) {
          skippedCueOrMeta += 1;
          continue;
        }
        forwardCandidateLineIdx.push(idx);
      }
      forwardRangeEnd = nextEnd;
    }
    const expandedByLines = Math.max(
      0,
      forwardRangeEnd - Math.max(forwardRangeStart, Math.min(forwardHardEnd, forwardInitialEnd)),
    );
    const forwardLineScores = forwardCandidateLineIdx
      .map((idx) => {
        const score = Number(rawScoreByIdx.get(idx));
        if (!Number.isFinite(score)) return null;
        return { idx, score, span: 1, startIdx: idx, source: 'line' as const };
      })
      .filter((entry): entry is { idx: number; score: number; span: number; startIdx: number; source: 'line' } => !!entry);
    const forwardWindowScores = buildForwardWindowScores(
      forwardCandidateLineIdx,
      forwardMatcherInputs,
      DEFAULT_FORWARD_WINDOW_MAX_LINES,
    );
    const forwardScoreByIdx = new Map<
      number,
      { idx: number; score: number; span: number; startIdx: number; source: 'line' | 'window' }
    >();
    const adoptForwardScore = (entry: { idx: number; score: number; span: number; startIdx: number; source: 'line' | 'window' }) => {
      const existing = forwardScoreByIdx.get(entry.idx);
      if (!existing) {
        forwardScoreByIdx.set(entry.idx, entry);
        return;
      }
      if (entry.score > existing.score) {
        forwardScoreByIdx.set(entry.idx, entry);
        return;
      }
      if (entry.score === existing.score && entry.span < existing.span) {
        forwardScoreByIdx.set(entry.idx, entry);
      }
    };
    forwardLineScores.forEach(adoptForwardScore);
    forwardWindowScores.forEach(adoptForwardScore);
    const forwardBandScores = Array.from(forwardScoreByIdx.values());
    const transcriptForAnchorScan =
      normalizeComparableText(bufferedText || compacted || text);
    const transcriptContentSetForAnchorScan = getContentTokenSet(normTokens(transcriptForAnchorScan));
    const lineEvidenceCache = new Map<number, { contentTokenCount: number; sharedContentHits: number }>();
    const getForwardLineEvidence = (lineIdx: number) => {
      const safeLine = Math.max(0, Math.floor(Number(lineIdx) || 0));
      const cached = lineEvidenceCache.get(safeLine);
      if (cached) return cached;
      const lineTokens = normTokens(normalizeComparableText(getLineTextAt(safeLine)));
      const contentTokenCount = getContentTokenSet(lineTokens).size;
      const sharedContentHits = countSharedContentTokenHits(transcriptContentSetForAnchorScan, lineTokens);
      const next = { contentTokenCount, sharedContentHits };
      lineEvidenceCache.set(safeLine, next);
      return next;
    };
    const scoredForwardCandidatesForAnchor = forwardBandScores.map((entry) => {
      const evidence = getForwardLineEvidence(entry.idx);
      return {
        ...entry,
        contentTokenCount: evidence.contentTokenCount,
        sharedContentHits: evidence.sharedContentHits,
      };
    });
    const strongLongAnchorCandidate = pickStrongLongAnchorCandidate(
      cursorLine,
      scoredForwardCandidatesForAnchor,
    );
    const forwardCandidatesChecked = forwardCandidateLineIdx.length;
    const forwardWindowCandidatesChecked = forwardWindowScores.length;
    if (outrunRecent && forwardCandidatesChecked === 0 && isDevMode()) {
      const rangeStart = Math.max(0, Math.floor(forwardRangeStart));
      const rangeEnd = Math.max(rangeStart, Math.floor(forwardRangeEnd));
      const maxSampleLines = 48;
      const sampleEnd = Math.min(rangeEnd + 1, rangeStart + maxSampleLines);
      const sampleLines = Array.from(
        { length: Math.max(0, sampleEnd - rangeStart) },
        (_unused, offset) => getLineTextAt(rangeStart + offset),
      );
      logForwardScanZero({
        rangeStart,
        rangeEnd,
        sampleLines,
        totalLines: totalForwardLines,
        sampleTruncated: rangeEnd + 1 > sampleEnd,
        skippedBlank,
        skippedCueOrMeta,
        expandedByLines,
      });
    }
    const outrunCandidate = forwardBandScores
      .sort((a, b) => b.score - a.score || a.idx - b.idx || a.span - b.span)[0] || null;
    const bestForwardIdx = outrunCandidate ? outrunCandidate.idx : null;
    const bestForwardSim = outrunCandidate ? outrunCandidate.score : 0;
    const bestForwardSpan = outrunCandidate ? outrunCandidate.span : null;
    const bestForwardSource = outrunCandidate ? outrunCandidate.source : null;
    const outrunPick = outrunCandidate;
    const outrunFloor = shortFinalRecent ? shortFinalNeed : outrunRelaxedSim;
    const forwardCandidateOk = !!outrunCandidate && bestForwardSim >= outrunFloor;
    const slamDunkFinalEarly = isSlamDunkFinal(rawIdx, conf);
    const shortFinalForwardEvidenceOk =
      shortFinalRecent &&
      forwardCandidateOk &&
      bestForwardIdx !== null &&
      bestForwardIdx > cursorLine;
    const forcedEvidenceOk =
      slamDunkFinalEarly ||
      shortFinalForwardEvidenceOk ||
      ((tokenCount >= forcedMinTokens || evidenceChars >= forcedMinChars) && forwardCandidateOk);
    const sameLineFinalConfirmHold =
      isFinal &&
      rawIdx === cursorLine &&
      conf >= Math.max(shortFinalNeed, DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM);
    if (sameLineFinalConfirmHold && isDevMode() && shouldLogTag('ASR_FINAL_HOLD', 2, 250)) {
      try {
        console.debug('[ASR_FINAL_HOLD]', {
          current: cursorLine,
          best: rawIdx,
          sim: Number(conf.toFixed(3)),
          holdNeed: Number(Math.max(shortFinalNeed, DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM).toFixed(3)),
        });
      } catch {
        // ignore
      }
    }
    const outrunEligible = !!outrunPick && outrunRecent && forcedEvidenceOk;
    const behindByForBias = cursorLine - rawIdx;
    const forwardBiasEligible =
      isFinal &&
      behindByForBias > 0 &&
      behindByForBias <= forwardBiasRecentLines &&
      lastLineIndex >= 0 &&
      now - lastForwardCommitAt <= forwardBiasWindowMs;
    if (topScoresSpeakable.length) {
      const bestScore = conf;
      const tieCandidates = topScoresSpeakable
        .filter((entry) => entry.score >= bestScore - forwardTieEps);
      const hasTie = tieCandidates.length >= 2;
      const forwardMinIdx = cursorLine + Math.max(1, minLineAdvance);
      const forwardCandidates = tieCandidates
        .filter((entry) => entry.idx >= forwardMinIdx)
        .sort((a, b) => a.idx - b.idx || b.score - a.score);
      const forwardPick = forwardCandidates[0];
      const tieNeed = shortFinalRecent ? shortFinalNeed : requiredThreshold;
      if (hasTie && forwardPick && forwardPick.score < tieNeed && !forwardBiasEligible && !outrunEligible) {
        warnGuard('tie_forward', [
          `current=${cursorLine}`,
          `best=${rawIdx}`,
          `forward=${forwardPick.idx}`,
          `sim=${formatLogScore(forwardPick.score)}`,
          `need=${formatLogScore(tieNeed)}`,
          `eps=${forwardTieEps}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
        if (!permissiveMatcher) return;
      }
      if (hasTie && !forwardPick && !forwardBiasEligible && !shortFinalRecent && !outrunEligible) {
        const guardReason = rawIdx <= cursorLine ? 'same_line_noop' : 'no_match_wait';
        if (guardReason === 'same_line_noop' && maybeSkipCueLine(cursorLine, now, guardReason, snippet)) {
          return;
        }
        warnGuard(guardReason, [
          `current=${cursorLine}`,
          `best=${rawIdx}`,
          `minForward=${forwardMinIdx}`,
          `sim=${formatLogScore(bestScore)}`,
          `need=${formatLogScore(requiredThreshold)}`,
          `eps=${forwardTieEps}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
        if (!permissiveMatcher) return;
      }
      if (forwardPick && (forwardPick.idx !== rawIdx || forwardPick.score !== conf)) {
        const before = rawIdx;
        rawIdx = forwardPick.idx;
        conf = forwardPick.score;
        if (hasTie) {
          warnGuard('tie_forward', [
            `current=${cursorLine}`,
            `best=${before}`,
            `forward=${rawIdx}`,
            `sim=${formatLogScore(conf)}`,
            `eps=${forwardTieEps}`,
            snippet ? `clue="${snippet}"` : '',
          ]);
        }
      }
    }
    const transcriptComparable = forwardMatcherInputs[0] || '';
    const stableComparable = transcriptComparable || normalizeComparableText(bufferedText || compacted || text);
    if (!isSessionAsrArmed() || commitCount <= 0) {
      stableInterimTranscriptNorm = stableComparable;
      stableInterimLastMeaningfulChangeAt = now;
    } else if (!stableInterimTranscriptNorm) {
      stableInterimTranscriptNorm = stableComparable;
      stableInterimLastMeaningfulChangeAt = now;
    } else if (hasMeaningfulTranscriptChange(stableInterimTranscriptNorm, stableComparable)) {
      stableInterimTranscriptNorm = stableComparable;
      stableInterimLastMeaningfulChangeAt = now;
    } else if (stableComparable.length > stableInterimTranscriptNorm.length) {
      stableInterimTranscriptNorm = stableComparable;
    }
    const stableInterimMs = stableInterimLastMeaningfulChangeAt > 0
      ? now - stableInterimLastMeaningfulChangeAt
      : 0;
    const currentLineComparable = normalizeComparableText(getLineTextAt(cursorLine));
    const transcriptLongerThanCurrent =
      transcriptComparable.length > currentLineComparable.length;
    const currentLineScoreFromTop = Number(rawScoreByIdx.get(cursorLine));
    let currentLineScore = Number.isFinite(currentLineScoreFromTop)
      ? currentLineScoreFromTop
      : Number.NaN;
    if (Number.isFinite(currentLineDirectSim)) {
      currentLineScore = Number.isFinite(currentLineScore)
        ? Math.max(currentLineScore, currentLineDirectSim)
        : currentLineDirectSim;
    }
    if (!Number.isFinite(currentLineScore) && currentLineComparable && forwardMatcherInputs.length) {
      const currentLineTokens = normTokens(currentLineComparable);
      if (currentLineTokens.length) {
        let bestCurrentLineScore = 0;
        for (const matcherInput of forwardMatcherInputs) {
          const matcherTokens = normTokens(matcherInput);
          if (!matcherTokens.length) continue;
          const score = computeLineSimilarityFromTokens(matcherTokens, currentLineTokens);
          if (score > bestCurrentLineScore) bestCurrentLineScore = score;
        }
        currentLineScore = bestCurrentLineScore;
      }
    }
    const continuationForwardCandidate =
      rawIdx <= cursorLine
        ? (forwardBandScores
            .filter((entry) => entry.idx > cursorLine && entry.span >= 2)
            .sort((a, b) => b.score - a.score || a.idx - b.idx || a.span - b.span)[0] || null)
        : null;
    const arbitrationCurrentScore = Number.isFinite(currentLineScore)
      ? currentLineScore
      : (rawIdx === cursorLine ? conf : requiredThreshold);
    if (
      lostForwardActive &&
      continuationForwardCandidate &&
      transcriptLongerThanCurrent &&
      continuationForwardCandidate.score >= outrunFloor &&
      continuationForwardCandidate.score >= arbitrationCurrentScore - 0.05
    ) {
      const before = rawIdx;
      rawIdx = continuationForwardCandidate.idx;
      conf = continuationForwardCandidate.score;
      effectiveThreshold = Math.min(effectiveThreshold, outrunFloor);
      if (
        rawIdx > cursorLine + DEFAULT_COMMIT_CLAMP_MAX_DELTA_LINES &&
        conf < DEFAULT_STRONG_FORWARD_COMMIT_SIM
      ) {
        const requestedIdx = rawIdx;
        rawIdx = cursorLine + DEFAULT_COMMIT_CLAMP_MAX_DELTA_LINES;
        if (isDevMode()) {
          try {
            console.info(
              `ASR_CLAMP normal prev=${cursorLine} req=${requestedIdx} clamped=${rawIdx} sim=${formatLogScore(conf)} reason=weak_forward_window`,
            );
          } catch {}
        }
      }
      if (isDevMode()) {
        try {
          console.info('[ASR_FORWARD_WINDOW_CONTINUE]', {
            current: cursorLine,
            best: before,
            forward: rawIdx,
            forwardSpan: continuationForwardCandidate.span,
            forwardScore: Number(conf.toFixed(3)),
            floor: Number(outrunFloor.toFixed(3)),
            currentLineScore: Number(arbitrationCurrentScore.toFixed(3)),
            transcriptLen: transcriptComparable.length,
            currentLineLen: currentLineComparable.length,
          });
        } catch {
          // ignore
        }
      }
    }
    const overlapTokensCurrent = getOverlapTokens(currentLineComparable, transcriptComparable);
    const overlapRatioCurrent = tokenCount > 0
      ? overlapTokensCurrent.length / tokenCount
      : 0;
    const weakCurrentAnchor =
      rawIdx === cursorLine &&
      tokenCount >= DEFAULT_WEAK_CURRENT_FORWARD_MIN_TOKENS &&
      overlapTokensCurrent.length <= DEFAULT_WEAK_CURRENT_OVERLAP_MAX_TOKENS &&
      overlapRatioCurrent <= DEFAULT_WEAK_CURRENT_OVERLAP_MAX_RATIO;
    const weakCurrentAdvanceEligible = permissiveMatcher
      ? (
        isFinal ||
        lostForwardActive ||
        conf >= DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM ||
        (bufferGrowing && transcriptLongerThanCurrent)
      )
      : (
        isFinal ||
        conf >= DEFAULT_STRONG_FORWARD_COMMIT_SIM ||
        (
          bufferGrowing &&
          transcriptLongerThanCurrent &&
          stableInterimMs >= DEFAULT_STABLE_INTERIM_NUDGE_MS
        )
      );
    if (weakCurrentAnchor && weakCurrentAdvanceEligible) {
      const weakForwardFloor = clamp(
        Math.max(thresholds.candidateMinSim, DEFAULT_STUCK_WATCHDOG_FORWARD_FLOOR),
        0,
        1,
      );
      const weakForwardMaxDelta =
        commitCount === 0 && cursorLine <= 3
          ? Math.min(DEFAULT_WEAK_CURRENT_FORWARD_MAX_DELTA, DEFAULT_FIRST_COMMIT_NEAR_START_MAX_DELTA)
          : DEFAULT_WEAK_CURRENT_FORWARD_MAX_DELTA;
      const weakForwardCandidate = forwardBandScores
        .filter((entry) =>
          entry.idx > cursorLine &&
          entry.idx - cursorLine <= weakForwardMaxDelta &&
          entry.span <= DEFAULT_WEAK_CURRENT_FORWARD_MAX_SPAN)
        .sort((a, b) => b.score - a.score || a.idx - b.idx || a.span - b.span)[0] || null;
      const weakAnchorComparableSim = Math.min(conf, DEFAULT_WEAK_CURRENT_FORWARD_CONF_CAP);
      const weakCurrentSlack = overlapRatioCurrent <= DEFAULT_WEAK_CURRENT_OVERLAP_MAX_RATIO
        ? DEFAULT_WEAK_CURRENT_FORWARD_SPARSE_SLACK
        : DEFAULT_WEAK_CURRENT_FORWARD_SIM_SLACK;
      const weakForwardNeed = Math.max(
        weakForwardFloor,
        weakAnchorComparableSim - weakCurrentSlack,
      );
      const weakForwardMinSim = permissiveMatcher
        ? weakForwardFloor
        : isFinal
        ? DEFAULT_WEAK_CURRENT_FORWARD_FINAL_MIN_SIM
        : DEFAULT_WEAK_CURRENT_FORWARD_INTERIM_MIN_SIM;
      if (
        weakForwardCandidate &&
        weakForwardCandidate.score >= weakForwardFloor &&
        weakForwardCandidate.score >= weakForwardMinSim &&
        weakForwardCandidate.score >= weakForwardNeed
      ) {
        const before = rawIdx;
        rawIdx = weakForwardCandidate.idx;
        conf = weakForwardCandidate.score;
        effectiveThreshold = Math.min(effectiveThreshold, weakForwardFloor);
        warnGuard('weak_current_forward', [
          `current=${cursorLine}`,
          `best=${before}`,
          `forward=${rawIdx}`,
          `delta=${rawIdx - cursorLine}`,
          `span=${weakForwardCandidate.span}`,
          `maxDelta=${weakForwardMaxDelta}`,
          `sim=${formatLogScore(conf)}`,
          `need=${formatLogScore(effectiveThreshold)}`,
          `minSim=${formatLogScore(weakForwardMinSim)}`,
          `overlapTokens=${overlapTokensCurrent.length}`,
          `overlapRatio=${formatLogScore(overlapRatioCurrent)}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
      }
    }
    if (shortFinalRecent && rawIdx >= cursorLine) {
      const forwardBand = rawIdx - cursorLine <= shortFinalLookaheadLines;
      if (forwardBand && shortFinalNeed < effectiveThreshold) {
        effectiveThreshold = shortFinalNeed;
        logDev('short-final threshold', { cursorLine, best: rawIdx, need: effectiveThreshold, sim: conf });
      }
    }
    const interimAmbiguityCandidates = topScoresSpeakable
      .filter((entry) =>
        Number.isFinite(entry.idx) &&
        Number.isFinite(entry.score) &&
        Math.abs(entry.idx - cursorLine) <= DEFAULT_AMBIGUITY_HOLD_NEAR_WINDOW_LINES)
      .map((entry) => ({
        idx: Math.max(0, Math.floor(Number(entry.idx))),
        score: Number(entry.score),
      }))
      .sort((a, b) =>
        b.score - a.score ||
        Math.abs(a.idx - cursorLine) - Math.abs(b.idx - cursorLine) ||
        a.idx - b.idx,
      );
    const interimAmbiguityBest = interimAmbiguityCandidates[0] || null;
    const interimAmbiguitySecond = interimAmbiguityCandidates[1] || null;
    const interimAmbiguityTranscript =
      transcriptComparable ||
      normalizeComparableText(bufferedText || compacted || text);
    const interimAmbiguityTranscriptContent = getContentTokenSet(normTokens(interimAmbiguityTranscript));
    const interimAmbiguityBestTokens = interimAmbiguityBest
      ? normTokens(normalizeComparableText(getLineTextAt(interimAmbiguityBest.idx)))
      : [];
    const interimAmbiguitySecondTokens = interimAmbiguitySecond
      ? normTokens(normalizeComparableText(getLineTextAt(interimAmbiguitySecond.idx)))
      : [];
    const interimAmbiguityBestContentCount = getContentTokenSet(interimAmbiguityBestTokens).size;
    const interimAmbiguityBestOverlapHits = countSharedContentTokenHits(
      interimAmbiguityTranscriptContent,
      interimAmbiguityBestTokens,
    );
    const interimAmbiguityEval =
      interimAmbiguityBest &&
      interimAmbiguitySecond &&
      !isFinal
        ? evaluateShortLineAmbiguityHold(
            cursorLine,
            interimAmbiguityBest.idx,
            interimAmbiguityBest.score,
            interimAmbiguityBestContentCount,
            interimAmbiguityBestOverlapHits,
            interimAmbiguityBestTokens,
            interimAmbiguitySecond,
            interimAmbiguitySecondTokens,
          )
        : { hold: false, reason: '' };
    const interimShortLineAmbiguityBase = !isFinal && !!interimAmbiguityEval.hold;
    const interimShortLineAmbiguityReason = interimAmbiguityEval.reason || 'short_line_ambiguous';
    let outrunCommit = false;
    let forceReason: string | undefined;
    let cueBridgeNudgeDelta: number | undefined;
    let relockOverride = false;
    let relockReason: string | undefined;
    let interimShortLineAmbiguityHold = interimShortLineAmbiguityBase;
    if (interimShortLineAmbiguityBase && strongLongAnchorCandidate) {
      const before = rawIdx;
      rawIdx = strongLongAnchorCandidate.idx;
      conf = strongLongAnchorCandidate.score;
      forceReason = forceReason || 'hold-anchor';
      relockOverride = true;
      relockReason = relockReason || 'hold-anchor';
      interimShortLineAmbiguityHold = false;
      if (isDevMode()) {
        try {
          console.info(
            `ASR_HOLD_ANCHOR_OVERRIDE current=${cursorLine} best=${before} anchor=${rawIdx} sim=${formatLogScore(conf)} reason=${interimShortLineAmbiguityReason}`,
          );
        } catch {}
      }
    }
    const shortFinalTightEvidenceBypass =
      isFinal &&
      rawIdx >= cursorLine &&
      rawIdx <= cursorLine + 1 &&
      conf >= requiredThreshold;
    const forcedEvidenceOkTight = forcedEvidenceOk || shortFinalTightEvidenceBypass;
    const allowForced = !isHybridMode() && lostForwardActive && !interimShortLineAmbiguityHold;
    if (interimShortLineAmbiguityHold && lostForwardActive && isSessionLivePhase() && isSessionAsrArmed()) {
      warnGuard('hold_force_suppressed', [
        `current=${cursorLine}`,
        interimAmbiguityBest ? `best=${interimAmbiguityBest.idx}` : '',
        interimAmbiguitySecond ? `second=${interimAmbiguitySecond.idx}` : '',
        interimAmbiguityBest ? `sim=${formatLogScore(interimAmbiguityBest.score)}` : '',
        interimAmbiguitySecond ? `sim2=${formatLogScore(interimAmbiguitySecond.score)}` : '',
        `reason=${interimShortLineAmbiguityReason}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
    }
    if (
      allowForced &&
      outrunRecent &&
      (rawIdx <= cursorLine || conf < effectiveThreshold) &&
      !sameLineFinalConfirmHold
    ) {
      logForwardScanProbe({
        reason: 'forced-check',
        cursorLine,
        rangeStart: forwardRangeStart,
        rangeEnd: forwardRangeEnd,
        candidatesChecked: forwardCandidatesChecked,
        windowCandidatesChecked: forwardWindowCandidatesChecked,
        matcherInputCount: forwardMatcherInputs.length,
        bestForwardIdx,
        bestForwardSim,
        bestForwardSpan: bestForwardSpan ?? undefined,
        bestForwardSource: bestForwardSource,
        floor: outrunFloor,
      });
      if (!outrunPick) {
        logForcedDeny('evidence', [
          `tokens=${tokenCount}`,
          `chars=${evidenceChars}`,
          `forwardCandidates=${forwardCandidatesChecked}`,
          `forwardWindowCandidates=${forwardWindowCandidatesChecked}`,
          `matcherInputs=${forwardMatcherInputs.length}`,
          `forwardRange=${forwardRangeStart}-${forwardRangeEnd}`,
          `bestForwardIdx=${bestForwardIdx ?? -1}`,
          `bestForwardSim=${formatLogScore(bestForwardSim)}`,
          `bestForwardSpan=${bestForwardSpan ?? -1}`,
          `bestForwardSource=${bestForwardSource || 'none'}`,
          `floor=${formatLogScore(outrunFloor)}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
      } else if (!forcedEvidenceOkTight) {
        logForcedDeny('evidence', [
          `tokens=${tokenCount}`,
          `chars=${evidenceChars}`,
          `forwardCandidates=${forwardCandidatesChecked}`,
          `forwardWindowCandidates=${forwardWindowCandidatesChecked}`,
          `matcherInputs=${forwardMatcherInputs.length}`,
          `forwardRange=${forwardRangeStart}-${forwardRangeEnd}`,
          `bestForwardIdx=${bestForwardIdx ?? -1}`,
          `bestForwardSim=${formatLogScore(bestForwardSim)}`,
          `bestForwardSpan=${bestForwardSpan ?? -1}`,
          `bestForwardSource=${bestForwardSource || 'none'}`,
          `floor=${formatLogScore(outrunFloor)}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
      } else {
        const delta = outrunPick.idx - cursorLine;
        const cooldownRemaining = getForcedCooldownRemaining(now);
        if (delta > outrunLookaheadLines) {
          logForcedDeny('delta_cap', [
            `delta=${delta}`,
            `cap=${outrunLookaheadLines}`,
            snippet ? `clue="${snippet}"` : '',
          ]);
        } else if (cooldownRemaining > 0) {
          logForcedDeny('cooldown', [
            `cooldownMs=${cooldownRemaining}`,
            snippet ? `clue="${snippet}"` : '',
          ]);
        } else {
          const forcedCount = getForcedCount(now);
          if (forcedCount >= forcedRateMax) {
            forcedCooldownUntil = now + forcedCooldownMs;
            logForcedThrottle(forcedCount);
            logForcedDeny('throttle', [
              `count=${forcedCount}`,
              `windowMs=${forcedRateWindowMs}`,
              `cooldownMs=${forcedCooldownMs}`,
            ]);
          } else if (outrunEligible) {
            const before = rawIdx;
            const outrunNeed = outrunFloor;
            const outrunFromBehind = before < cursorLine;
            const behindContinuationSignal =
              outrunFromBehind &&
              isFinal &&
              commitCount > 0 &&
              transcriptLongerThanCurrent &&
              tokenCount >= DEFAULT_OUTRUN_BEHIND_CONTINUATION_MIN_TOKENS &&
              overlapTokensCurrent.length >= DEFAULT_OUTRUN_BEHIND_CONTINUATION_MIN_OVERLAP_TOKENS &&
              now - lastForwardCommitAt <= DEFAULT_FORWARD_PROGRESS_WINDOW_MS;
            const nearForwardPick = outrunFromBehind
              ? (() => {
                  const plusOne = forwardBandScores
                    .filter((entry) => entry.idx === cursorLine + 1)
                    .sort((a, b) => b.score - a.score || a.span - b.span)[0] || null;
                  if (plusOne) return plusOne;
                  return forwardBandScores
                    .filter((entry) =>
                      entry.idx > cursorLine &&
                      entry.idx - cursorLine <= DEFAULT_OUTRUN_BEHIND_MAX_DELTA)
                    .sort((a, b) => b.score - a.score || a.idx - b.idx || a.span - b.span)[0] || null;
                })()
              : null;
            const selectedOutrunPick = nearForwardPick || outrunPick;
            const selectedDelta = selectedOutrunPick.idx - cursorLine;
            const appendedContinuation =
              behindContinuationSignal &&
              selectedDelta === 1 &&
              currentLineComparable.length > 0 &&
              transcriptComparable.startsWith(currentLineComparable) &&
              transcriptComparable.length - currentLineComparable.length >= DEFAULT_OUTRUN_BEHIND_APPEND_MIN_EXTRA_CHARS;
            const outrunCompetitiveNeed = outrunFromBehind
              ? (appendedContinuation
                  ? DEFAULT_OUTRUN_BEHIND_APPEND_MIN_SIM
                  : behindContinuationSignal
                  ? clamp(
                      Math.max(
                        DEFAULT_OUTRUN_BEHIND_CONTINUATION_MIN_SIM,
                        conf - DEFAULT_OUTRUN_BEHIND_CONTINUATION_SIM_SLACK,
                      ),
                      0,
                      1,
                    )
                  : Math.max(
                      outrunNeed,
                      conf - DEFAULT_OUTRUN_BEHIND_SIM_SLACK,
                      conf + DEFAULT_OUTRUN_BEHIND_WIN_MARGIN,
                      DEFAULT_OUTRUN_BEHIND_MIN_SIM,
                    ))
              : outrunNeed;
            if (outrunFromBehind && selectedDelta > DEFAULT_OUTRUN_BEHIND_MAX_DELTA) {
              logForcedDeny('behind_delta_cap', [
                `current=${cursorLine}`,
                `best=${before}`,
                `forward=${selectedOutrunPick.idx}`,
                `delta=${selectedDelta}`,
                `cap=${DEFAULT_OUTRUN_BEHIND_MAX_DELTA}`,
                snippet ? `clue="${snippet}"` : '',
              ]);
            } else if (selectedOutrunPick.score < outrunCompetitiveNeed) {
              logForcedDeny('behind_compete', [
                `current=${cursorLine}`,
                `best=${before}`,
                `forward=${selectedOutrunPick.idx}`,
                `forwardSim=${formatLogScore(selectedOutrunPick.score)}`,
                `need=${formatLogScore(outrunCompetitiveNeed)}`,
                snippet ? `clue="${snippet}"` : '',
              ]);
            } else {
              rawIdx = selectedOutrunPick.idx;
              conf = selectedOutrunPick.score;
              const outrunCommitNeed = outrunFromBehind && behindContinuationSignal
                ? Math.min(outrunNeed, outrunCompetitiveNeed)
                : outrunNeed;
              effectiveThreshold = Math.min(effectiveThreshold, outrunCommitNeed);
              outrunCommit = true;
              forceReason = 'outrun';
              warnGuard('forward_outrun', [
                `current=${cursorLine}`,
                `best=${before}`,
                `forward=${rawIdx}`,
                `sim=${formatLogScore(conf)}`,
                `need=${formatLogScore(effectiveThreshold)}`,
                `delta=${rawIdx - cursorLine}`,
                behindContinuationSignal ? 'behindContinuation=1' : '',
                appendedContinuation ? 'appendContinuation=1' : '',
                snippet ? `clue="${snippet}"` : '',
              ]);
              logDev('forward outrun', { cursorLine, best: before, forward: rawIdx, sim: conf, need: effectiveThreshold });
            }
          }
        }
      }
    }
    const shortFinalForcedCandidate =
      shortFinalRecent &&
      rawIdx > cursorLine &&
      shortFinalNeed < requiredThreshold &&
      conf >= shortFinalNeed &&
      conf < requiredThreshold &&
      !sameLineFinalConfirmHold;
    let shortFinalForced = false;
    if (allowForced && shortFinalForcedCandidate && !outrunCommit) {
      const forwardCandidate = outrunCandidate;
      const forcedDelta = forwardCandidate ? forwardCandidate.idx - cursorLine : rawIdx - cursorLine;
      const cooldownRemaining = getForcedCooldownRemaining(now);
      logForwardScanProbe({
        reason: 'short-final-check',
        cursorLine,
        rangeStart: forwardRangeStart,
        rangeEnd: forwardRangeEnd,
        candidatesChecked: forwardCandidatesChecked,
        windowCandidatesChecked: forwardWindowCandidatesChecked,
        matcherInputCount: forwardMatcherInputs.length,
        bestForwardIdx,
        bestForwardSim,
        bestForwardSpan: bestForwardSpan ?? undefined,
        bestForwardSource: bestForwardSource,
        floor: outrunFloor,
      });
      if (!forcedEvidenceOkTight) {
        logForcedDeny('evidence', [
          `tokens=${tokenCount}`,
          `chars=${evidenceChars}`,
          `forwardCandidates=${forwardCandidatesChecked}`,
          `forwardWindowCandidates=${forwardWindowCandidatesChecked}`,
          `matcherInputs=${forwardMatcherInputs.length}`,
          `forwardRange=${forwardRangeStart}-${forwardRangeEnd}`,
          `bestForwardIdx=${bestForwardIdx ?? -1}`,
          `bestForwardSim=${formatLogScore(bestForwardSim)}`,
          `bestForwardSpan=${bestForwardSpan ?? -1}`,
          `bestForwardSource=${bestForwardSource || 'none'}`,
          `floor=${formatLogScore(outrunFloor)}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
      } else if (forcedDelta > outrunLookaheadLines) {
        logForcedDeny('delta_cap', [
          `delta=${forcedDelta}`,
          `cap=${outrunLookaheadLines}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
      } else if (cooldownRemaining > 0) {
        logForcedDeny('cooldown', [
          `cooldownMs=${cooldownRemaining}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
      } else {
        const forcedCount = getForcedCount(now);
        if (forcedCount >= forcedRateMax) {
          forcedCooldownUntil = now + forcedCooldownMs;
          logForcedThrottle(forcedCount);
          logForcedDeny('throttle', [
            `count=${forcedCount}`,
            `windowMs=${forcedRateWindowMs}`,
            `cooldownMs=${forcedCooldownMs}`,
          ]);
        } else {
          if (forwardCandidate && (forwardCandidate.idx !== rawIdx || forwardCandidate.score !== conf)) {
            rawIdx = forwardCandidate.idx;
            conf = forwardCandidate.score;
          }
          effectiveThreshold = Math.min(effectiveThreshold, shortFinalNeed);
          shortFinalForced = true;
          forceReason = forceReason || 'short-final';
        }
      }
    }
    if (forwardBiasEligible && rawIdx < cursorLine && topScoresSpeakable.length) {
      const behindBy = cursorLine - rawIdx;
      const biasThreshold = clamp(requiredThreshold - forwardBiasSimSlack, 0, 1);
      const forwardNeed = shortFinalRecent ? Math.min(biasThreshold, shortFinalNeed) : biasThreshold;
      const forwardMax = cursorLine + Math.max(1, forwardBiasLookaheadLines);
      const forwardPick = topScoresSpeakable
        .filter((entry) => entry.idx >= cursorLine && entry.idx <= forwardMax)
        .sort((a, b) => b.score - a.score || a.idx - b.idx)[0];
      if (forwardPick && forwardPick.score >= forwardNeed) {
        const before = rawIdx;
        rawIdx = forwardPick.idx;
        conf = forwardPick.score;
        effectiveThreshold = Math.min(effectiveThreshold, forwardNeed);
        warnGuard('forward_bias', [
          `current=${cursorLine}`,
          `best=${before}`,
          `forward=${rawIdx}`,
          `sim=${formatLogScore(conf)}`,
          `need=${formatLogScore(effectiveThreshold)}`,
          `behind=${behindBy}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
        logDev('forward bias', { cursorLine, best: before, forward: rawIdx, sim: conf, need: effectiveThreshold });
      }
    }
    const strongBehindFloor = Math.max(strongBackSim, requiredThreshold);
    const strongBehindCompetitor = topScoresSpeakable
      .filter((entry) => {
        const idx = Number(entry.idx);
        const score = Number(entry.score);
        if (!Number.isFinite(idx) || !Number.isFinite(score)) return false;
        if (idx >= cursorLine) return false;
        return score >= strongBehindFloor;
      })
      .sort((a, b) => b.score - a.score || b.idx - a.idx)[0] || null;
    const strongBehindCandidate = !!strongBehindCompetitor;
    const watchdogFloor = clamp(Math.max(stuckWatchdogForwardFloor, thresholds.candidateMinSim), 0, 1);
    const watchdogByFinals = finalsSinceCommit >= stuckWatchdogFinalEvents;
    const watchdogByInterims =
      eventsSinceCommit >= stuckWatchdogInterimEvents &&
      now - lastIngestAt <= stuckWatchdogInterimRecentMs;
    const watchdogTrafficOk = watchdogByFinals || watchdogByInterims;
    const watchdogStrongCurrentHold =
      rawIdx === cursorLine &&
      conf >= Math.max(effectiveThreshold, 0.62);
    const watchdogStalled =
      allowForced &&
      isSessionLivePhase() &&
      isSessionAsrArmed() &&
      watchdogTrafficOk &&
      now - lastCommitAt >= stuckWatchdogNoCommitMs &&
      now - lastStuckWatchdogAt >= stuckWatchdogCooldownMs &&
      !watchdogStrongCurrentHold &&
      (rawIdx <= cursorLine || conf < effectiveThreshold);
    if (watchdogStalled) {
      if (strongBehindCompetitor) {
        lastStuckWatchdogAt = now;
        warnGuard('watchdog_suppressed_behind', [
          `current=${cursorLine}`,
          `best=${rawIdx}`,
          `behind=${strongBehindCompetitor.idx}`,
          `behindSim=${formatLogScore(strongBehindCompetitor.score)}`,
          `need=${formatLogScore(strongBehindFloor)}`,
          `traffic=${watchdogByInterims ? 'interim' : 'final'}`,
          `eventsSinceCommit=${eventsSinceCommit}`,
          `finalsSinceCommit=${finalsSinceCommit}`,
          `stallMs=${now - lastCommitAt}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
        emitHudStatus('watchdog_suppressed_behind', 'Recovery skipped: behind competitor');
      } else {
        const watchdogForward = forwardBandScores
          .filter((entry) => entry.idx > cursorLine && (entry.idx - cursorLine) <= stuckWatchdogMaxDeltaLines)
          .sort((a, b) => b.score - a.score || a.idx - b.idx || a.span - b.span)[0] || null;
        if (watchdogForward && watchdogForward.score >= watchdogFloor) {
          const before = rawIdx;
          rawIdx = watchdogForward.idx;
          conf = watchdogForward.score;
          effectiveThreshold = Math.min(effectiveThreshold, watchdogFloor);
          outrunCommit = true;
          forceReason = forceReason || 'watchdog';
          lastStuckWatchdogAt = now;
          warnGuard('watchdog_forward', [
            `current=${cursorLine}`,
            `best=${before}`,
            `forward=${rawIdx}`,
            `sim=${formatLogScore(conf)}`,
            `need=${formatLogScore(effectiveThreshold)}`,
            `delta=${rawIdx - cursorLine}`,
            `traffic=${watchdogByInterims ? 'interim' : 'final'}`,
            `eventsSinceCommit=${eventsSinceCommit}`,
            `finalsSinceCommit=${finalsSinceCommit}`,
            `stallMs=${now - lastCommitAt}`,
            snippet ? `clue="${snippet}"` : '',
          ]);
          emitHudStatus(
            'watchdog_forward',
            `Recovery: +${rawIdx - cursorLine} lines (sim=${formatLogScore(conf)})`,
          );
        }
      }
    }
    inBand = rawIdx >= bandStart && rawIdx <= bandEnd;
    if (!inBand) {
      warnGuard('match_out_of_band', [
        `current=${cursorLine}`,
        `best=${rawIdx}`,
        `delta=${rawIdx - cursorLine}`,
        `baseBandStart=${baseBandStart}`,
        `baseBandEnd=${baseBandEnd}`,
        `bandStart=${bandStart}`,
        `bandEnd=${bandEnd}`,
        `inBand=${inBand ? 1 : 0}`,
      ]);
      emitHudStatus('match_out_of_band', 'Out-of-band match ignored');
      return;
    }
    const markerIdx = consistencyRequireNearMarker
      ? computeCueSafeMarkerIndex(scrollerForMatch, DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES)
      : -1;
    const nearMarker = consistencyRequireNearMarker
      ? (markerIdx < 0 || Math.abs(rawIdx - markerIdx) <= Math.max(1, consistencyMarkerBandLines))
      : true;
    if (allowCatchup) {
      const lagSample: LagSample = {
        ts: now,
        delta: rawIdx - cursorLine,
        sim: conf,
        nearMarker,
        inBand,
      };
      recordLagSample(lagSample);
      if (shouldTriggerCatchUp()) {
        activateCatchUpMode(now, lagSample);
      }
    }
    const catchUpModeActive = catchUpModeUntil > now;
    const stuckResyncActive = resyncActive && resyncReason === 'stuck';
    const relockModeActive = lagRelockActive || catchUpModeActive || stuckResyncActive;
    const forwardMatch = inBand && rawIdx >= cursorLine + minLineAdvance;
    const relockForward = relockModeActive && forwardMatch;
    if (forwardMatch) {
      if (!relockRepeatWindowStart || now - relockRepeatWindowStart > DEFAULT_RELOCK_REPEAT_WINDOW_MS) {
        relockRepeatWindowStart = now;
        relockRepeatIdx = rawIdx;
        relockRepeatCount = 1;
      } else if (Math.abs(rawIdx - relockRepeatIdx) <= 1) {
        relockRepeatCount += 1;
      } else {
        relockRepeatIdx = rawIdx;
        relockRepeatCount = 1;
      }
    } else if (relockRepeatCount || relockRepeatWindowStart) {
      relockRepeatIdx = -1;
      relockRepeatCount = 0;
      relockRepeatWindowStart = 0;
    }
    const overlapOk = Number.isFinite(bestOverlapRatio) && bestOverlapRatio >= DEFAULT_RELOCK_OVERLAP_RATIO;
    const spanOk = Number.isFinite(bestSpan) && bestSpan >= DEFAULT_RELOCK_SPAN_MIN_LINES;
    const repeatOk = relockRepeatCount >= DEFAULT_RELOCK_REPEAT_MIN;
    const finalOk = isFinal && rawIdx > cursorLine && inBand;
    const relockEvidenceOk = relockForward && (overlapOk || spanOk || repeatOk || finalOk);
    if (relockEvidenceOk && conf < effectiveThreshold) {
      effectiveThreshold = Math.min(effectiveThreshold, DEFAULT_RELOCK_SIM_FLOOR);
      relockOverride = true;
      relockReason = overlapOk ? 'overlap' : spanOk ? 'span' : repeatOk ? 'repeat' : 'final';
      emitHudStatus(
        'relock_override',
        `Relock override: ${relockReason} (sim=${formatLogScore(conf)} floor=${formatLogScore(DEFAULT_RELOCK_SIM_FLOOR)})`,
      );
      logDev('relock override', {
        reason: relockReason,
        sim: conf,
        span: bestSpan,
        overlapPct: bestOverlapRatio,
        repeat: relockRepeatCount,
        delta: rawIdx - cursorLine,
      });
    }
    const forwardEvidence = inBand && rawIdx > cursorLine;
    const lowSimForwardEvidence = relockModeActive && forwardEvidence && (isFinal || repeatOk || spanOk || overlapOk);
    if (lowSimForwardEvidence && conf < effectiveThreshold) {
      effectiveThreshold = Math.min(effectiveThreshold, conf);
      if (!relockOverride) {
        relockOverride = true;
        relockReason = isFinal ? 'final' : repeatOk ? 'repeat' : spanOk ? 'span' : 'overlap';
      }
    }
    const progressiveForwardFloorEligible =
      isSessionAsrArmed() &&
      commitCount > 0 &&
      bufferGrowing &&
      rawIdx >= cursorLine &&
      conf >= DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM &&
      !strongBehindCandidate;
    if (progressiveForwardFloorEligible) {
      const beforeNeed = effectiveThreshold;
      effectiveThreshold = Math.min(effectiveThreshold, DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM);
      if (rawIdx > cursorLine) {
        if (!interimShortLineAmbiguityHold) {
          forceReason = forceReason || 'progressive-floor';
        }
      }
      if (isDevMode() && shouldLogTag('ASR_PROGRESSIVE_FLOOR', 2, 250)) {
        try {
          console.debug('[ASR_PROGRESSIVE_FLOOR]', {
            current: cursorLine,
            best: rawIdx,
            sim: Number(conf.toFixed(3)),
            beforeNeed: Number(beforeNeed.toFixed(3)),
            need: Number(effectiveThreshold.toFixed(3)),
            bufferGrowing: !!bufferGrowing,
            commitCount,
          });
        } catch {
          // ignore
        }
      }
    }
    if (lostForwardActive && !interimShortLineAmbiguityHold) {
      const lostForwardWindow = getLostForwardLookaheadLines();
      const lostForwardCap = Math.min(lostForwardWindow, getLostForwardCommitCapLines());
      const lostForwardCandidates = forwardBandScores
        .filter((entry) =>
          entry.idx > cursorLine &&
          (entry.idx - cursorLine) <= lostForwardCap);
      const rankedLostForwardCandidates = lostForwardCandidates
        .slice()
        .sort((a, b) => b.score - a.score || a.idx - b.idx || a.span - b.span);
      let lostForwardPick = rankedLostForwardCandidates[0] || null;
      if (lostForwardPick) {
        const bestEntry = rankedLostForwardCandidates[0] || null;
        const secondEntry = rankedLostForwardCandidates[1] || null;
        const bestStats = bestEntry
          ? {
              idx: bestEntry.idx,
              score: bestEntry.score,
              contentTokenCount: getForwardLineEvidence(bestEntry.idx).contentTokenCount,
            }
          : null;
        const secondStats = secondEntry
          ? {
              idx: secondEntry.idx,
              score: secondEntry.score,
              contentTokenCount: getForwardLineEvidence(secondEntry.idx).contentTokenCount,
            }
          : null;
        const shortTiePocket = isAdjacentShortTiePocket(cursorLine, bestStats, secondStats);
        const lostForwardAnchorCandidate =
          strongLongAnchorCandidate &&
          strongLongAnchorCandidate.idx > cursorLine &&
          (strongLongAnchorCandidate.idx - cursorLine) <= lostForwardCap
            ? strongLongAnchorCandidate
            : null;
        if (shortTiePocket && lostForwardAnchorCandidate) {
          lostForwardPick = lostForwardAnchorCandidate;
          if (isDevMode()) {
            try {
              console.info(
                `ASR_LOST_FORWARD_ANCHOR_PREFER current=${cursorLine} best=${bestEntry?.idx ?? -1} second=${secondEntry?.idx ?? -1} anchor=${lostForwardAnchorCandidate.idx} sim=${formatLogScore(lostForwardAnchorCandidate.score)}`,
              );
            } catch {}
          }
        }
      }
      if (lostForwardPick) {
        const transcriptTokens = normTokens(transcriptComparable || bufferedText || compacted || text);
        const candidateLineTokens = normTokens(getLineTextAt(lostForwardPick.idx));
        const transcriptAnchorSet = getAnchorTokenSet(transcriptTokens);
        const candidateAnchorSet = getAnchorTokenSet(candidateLineTokens);
        const transcriptContentSet = getContentTokenSet(transcriptTokens);
        let sharedAnchorHits = 0;
        if (transcriptAnchorSet.size > 0 && candidateLineTokens.length > 0) {
          const candidateSet = new Set(candidateLineTokens);
          for (const token of transcriptAnchorSet) {
            if (!candidateSet.has(token)) continue;
            sharedAnchorHits += 1;
          }
        }
        const sharedContentHits = countSharedContentTokenHits(transcriptContentSet, candidateLineTokens);
        const firstMeaningfulForwardIdx = lostForwardCandidates
          .slice()
          .sort((a, b) => a.idx - b.idx)
          .find((entry) =>
            countSharedContentTokenHits(
              transcriptContentSet,
              normTokens(getLineTextAt(entry.idx)),
            ) > 0,
          )?.idx ?? null;
        const firstMeaningfulOverlap = firstMeaningfulForwardIdx != null && lostForwardPick.idx === firstMeaningfulForwardIdx;
        const cueSafeMarkerIdx = markerIdx >= 0
          ? markerIdx
          : computeCueSafeMarkerIndex(scrollerForMatch, DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES);
        const behindMarker = cueSafeMarkerIdx >= 0 && cueSafeMarkerIdx >= cursorLine + 1;
        const neededAnchorHits = transcriptAnchorSet.size >= 2 ? 2 : 1;
        const candidateAnchorCount = candidateAnchorSet.size;
        const longEnough = transcriptTokens.length >= DEFAULT_TELEPORT_MIN_TOKENS;
        const currentScoreForCompetition = Number.isFinite(arbitrationCurrentScore)
          ? arbitrationCurrentScore
          : conf;
        const competitiveForward =
          lostForwardPick.score >= currentScoreForCompetition + DEFAULT_TELEPORT_COMPETITIVE_MARGIN;
        const strongOrCompetitive =
          lostForwardPick.score >= DEFAULT_LOST_FORWARD_MIN_SIM ||
          competitiveForward;
        const anchorGateOk =
          transcriptAnchorSet.size > 0 &&
          sharedAnchorHits >= neededAnchorHits;
        const anchorTeleportGateOk =
          longEnough &&
          strongOrCompetitive &&
          anchorGateOk;
        const progressEvidenceOk =
          sharedContentHits >= DEFAULT_LOST_FORWARD_RESEEK_MIN_CONTENT_HITS ||
          firstMeaningfulOverlap;
        const contentFallbackGateOk =
          longEnough &&
          candidateAnchorCount === 0 &&
          lostForwardPick.idx > cursorLine &&
          (lostForwardPick.idx - cursorLine) <= DEFAULT_LOST_FORWARD_CONTENT_FALLBACK_MAX_DELTA_LINES &&
          lostForwardPick.score >= DEFAULT_LOST_FORWARD_RESEEK_MIN_SIM &&
          sharedContentHits >= DEFAULT_LOST_FORWARD_CONTENT_FALLBACK_MIN_HITS &&
          firstMeaningfulOverlap;
        const reseekTeleportGateOk =
          longEnough &&
          competitiveForward &&
          lostForwardPick.score >= DEFAULT_LOST_FORWARD_RESEEK_MIN_SIM &&
          progressEvidenceOk;
        const markerCatchupGateOk =
          behindMarker &&
          lostForwardPick.idx > cursorLine &&
          (lostForwardPick.idx - cursorLine) <= Math.min(
            lostForwardCap,
            DEFAULT_LOST_FORWARD_MARKER_CATCHUP_MAX_DELTA_LINES,
          ) &&
          (sharedContentHits >= 1 || firstMeaningfulOverlap) &&
          lostForwardPick.score >= DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM;
        const markerCatchupTarget = markerCatchupGateOk
          ? Math.min(lostForwardPick.idx, cursorLine + DEFAULT_LOST_FORWARD_MARKER_CATCHUP_COMMIT_CAP_LINES)
          : lostForwardPick.idx;
        const teleportGateOk = anchorTeleportGateOk || reseekTeleportGateOk || contentFallbackGateOk;
        const teleportNeed = anchorTeleportGateOk
          ? DEFAULT_LOST_FORWARD_MIN_SIM
          : DEFAULT_LOST_FORWARD_RESEEK_MIN_SIM;
        const teleportMode = anchorTeleportGateOk
          ? 'anchor'
          : (contentFallbackGateOk ? 'content' : 'reseek');
        if (teleportGateOk) {
          const before = rawIdx;
          rawIdx = lostForwardPick.idx;
          conf = lostForwardPick.score;
          effectiveThreshold = Math.min(effectiveThreshold, teleportNeed);
          outrunCommit = true;
          forceReason = 'lost-forward';
          if (isDevMode()) {
            try {
              const activeMs = lostForwardEnteredAt > 0 ? Math.max(0, now - lostForwardEnteredAt) : 0;
              console.info(
                `ASR_LOST_FORWARD_JUMP mode=${teleportMode} stage=${lostForwardStage} window=+${lostForwardWindow} cap=+${lostForwardCap} current=${cursorLine} best=${before} jump=${rawIdx} delta=${rawIdx - cursorLine} sim=${formatLogScore(conf)} need=${formatLogScore(teleportNeed)} streak=${noProgressStreak} activeMs=${activeMs} anchors=${sharedAnchorHits}/${neededAnchorHits} content=${sharedContentHits} firstOverlap=${firstMeaningfulOverlap ? 1 : 0} tokens=${transcriptTokens.length}`,
              );
            } catch {}
          }
        } else if (markerCatchupGateOk) {
          const before = rawIdx;
          rawIdx = markerCatchupTarget;
          conf = lostForwardPick.score;
          effectiveThreshold = Math.min(effectiveThreshold, DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM);
          outrunCommit = true;
          forceReason = 'lost-forward';
          emitHudStatus(
            'lost_forward_catchup',
            `Catch-up: +${Math.max(1, rawIdx - cursorLine)} lines (sim=${formatLogScore(conf)})`,
          );
          if (isDevMode()) {
            try {
              console.info(
                `ASR_LOST_FORWARD_CATCHUP mode=marker stage=${lostForwardStage} window=+${lostForwardWindow} cap=+${lostForwardCap} marker=${cueSafeMarkerIdx} current=${cursorLine} best=${before} pick=${lostForwardPick.idx} jump=${rawIdx} delta=${rawIdx - cursorLine} sim=${formatLogScore(conf)} need=${formatLogScore(DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM)} content=${sharedContentHits} firstOverlap=${firstMeaningfulOverlap ? 1 : 0} behindMarker=${behindMarker ? 1 : 0}`,
              );
            } catch {}
          }
        } else {
          lostForwardGateRejected = true;
          warnGuard('lost_forward_gate', [
            `current=${cursorLine}`,
            `best=${lostForwardPick.idx}`,
            `delta=${lostForwardPick.idx - cursorLine}`,
            `sim=${formatLogScore(lostForwardPick.score)}`,
            `needAnchor=${formatLogScore(DEFAULT_LOST_FORWARD_MIN_SIM)}`,
            `needReseek=${formatLogScore(DEFAULT_LOST_FORWARD_RESEEK_MIN_SIM)}`,
            `tokens=${transcriptTokens.length}`,
            `anchors=${sharedAnchorHits}/${neededAnchorHits}`,
            `candidateAnchors=${candidateAnchorCount}`,
            `content=${sharedContentHits}`,
            `firstOverlap=${firstMeaningfulOverlap ? 1 : 0}`,
            `long=${longEnough ? 1 : 0}`,
            `competitive=${strongOrCompetitive ? 1 : 0}`,
            `competitiveForward=${competitiveForward ? 1 : 0}`,
            `contentFallback=${contentFallbackGateOk ? 1 : 0}`,
            `behindMarker=${behindMarker ? 1 : 0}`,
            `markerCatchup=${markerCatchupGateOk ? 1 : 0}`,
            `marker=${cueSafeMarkerIdx}`,
            `window=${lostForwardWindow}`,
            `cap=${lostForwardCap}`,
            snippet ? `clue="${snippet}"` : '',
          ]);
        }
      }
    }
    const watchdogForwardSelected = forceReason === 'watchdog' && rawIdx > cursorLine;
    const watchdogForwardInterimProgress =
      !isFinal &&
      watchdogForwardSelected &&
      bufferGrowing &&
      conf >= watchdogFloor;
    if (watchdogForwardSelected && conf >= watchdogFloor) {
      // Recovery picks should carry their floor through low-sim arbitration.
      effectiveThreshold = Math.min(effectiveThreshold, watchdogFloor);
    }
    const finalNearThresholdContinuation =
      isFinal &&
      effectiveThreshold > 0 &&
      rawIdx >= cursorLine &&
      rawIdx <= cursorLine + 1 &&
      conf >= Math.max(
        DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM,
        effectiveThreshold - DEFAULT_FINAL_CONTINUATION_SIM_EPS,
      );
    if (alignedPostCatchup && effectiveThreshold > 0 && conf < effectiveThreshold) {
      logDev('postCatchup relax', {
        sim: conf,
        need: effectiveThreshold,
        delta,
        aligned: alignedPostCatchup,
        msLeft: postCatchupUntil - now,
      });
    } else if (effectiveThreshold > 0 && conf < effectiveThreshold) {
      if (finalNearThresholdContinuation) {
        const needBefore = effectiveThreshold;
        effectiveThreshold = Math.min(effectiveThreshold, conf);
        lostForwardWallStreak = 0;
        if (isDevMode()) {
          try {
            console.info(
              `ASR_FINAL_EPSILON_PASS current=${cursorLine} best=${rawIdx} delta=${rawIdx - cursorLine} sim=${formatLogScore(conf)} need=${formatLogScore(needBefore)} eps=${formatLogScore(DEFAULT_FINAL_CONTINUATION_SIM_EPS)}`,
            );
          } catch {}
        }
      } else {
      const lowSimForwardContinuationBlocked =
        rawIdx >= cursorLine &&
        rawIdx <= cursorLine + 1;
      const lostForwardWallDetected =
        lostForwardGateRejected &&
        lowSimForwardContinuationBlocked;
      if (lostForwardWallDetected) {
        lostForwardWallStreak += 1;
      } else {
        lostForwardWallStreak = 0;
      }
      const shouldAttemptEarlyRelock =
        lostForwardWallDetected &&
        noProgressStreak >= DEFAULT_LOST_FORWARD_WALL_RELOCK_STREAK &&
        lostForwardWallStreak >= DEFAULT_LOST_FORWARD_WALL_RELOCK_STREAK;
      const earlyRelock = shouldAttemptEarlyRelock
        ? attemptForwardRelock(now, cursorLine, bufferedText || compacted, isFinal)
        : null;
      if (earlyRelock?.applied) {
        lostForwardWallStreak = 0;
      }
      if (!relockModeActive) {
        if (rawIdx <= cursorLine && maybeSkipCueLine(cursorLine, now, 'low_sim_wait', snippet)) {
          return;
        }
        const microRelockCooldownReady =
          now - lastMicroRelockAt >= DEFAULT_MICRO_RELOCK_COOLDOWN_MS;
        if (
          microRelockCooldownReady &&
          rawIdx <= cursorLine &&
          cursorLine > 0 &&
          conf < effectiveThreshold
        ) {
          const prevLine = cursorLine - 1;
          const prevLineText = getLineTextAt(prevLine);
          const prevLineSpeakable =
            !!prevLineText &&
            !isIgnorableCueLineText(prevLineText);
          const cursorBlock = findBlockByLine(cursorLine);
          const prevBlock = findBlockByLine(prevLine);
          const sameBlock =
            !cursorBlock ||
            !prevBlock ||
            cursorBlock.blockId === prevBlock.blockId;
          if (prevLineSpeakable && sameBlock) {
            const transcriptTokens = normTokens(
              transcriptComparable || bufferedText || compacted || text,
            );
            const prevTokens = normTokens(normalizeComparableText(prevLineText));
            const prevSim =
              transcriptTokens.length && prevTokens.length
                ? computeLineSimilarityFromTokens(transcriptTokens, prevTokens)
                : 0;
            const currentSim =
              Number.isFinite(arbitrationCurrentScore) ? arbitrationCurrentScore : conf;
            if (tryGraceRollback(
              cursorLine,
              prevLine,
              now,
              prevSim,
              currentSim,
              effectiveThreshold,
              matchId,
              snippet,
            )) {
              return;
            }
            const graceRollbackCoolingDown = now < graceRollbackCooldownUntil;
            if (
              !graceRollbackCoolingDown &&
              prevSim >= effectiveThreshold &&
              prevSim - currentSim >= DEFAULT_MICRO_RELOCK_MARGIN
            ) {
              microRelockPreferredCursor = prevLine;
              microRelockPreferredUntil = now + DEFAULT_MICRO_RELOCK_PREFERRED_TTL_MS;
              lastMicroRelockAt = now;
              warnGuard('micro_relock_backstep', [
                `current=${cursorLine}`,
                `prefer=${prevLine}`,
                `simPrev=${formatLogScore(prevSim)}`,
                `simCur=${formatLogScore(currentSim)}`,
                `need=${formatLogScore(effectiveThreshold)}`,
                `margin=${formatLogScore(prevSim - currentSim)}`,
                snippet ? `clue="${snippet}"` : '',
              ]);
              emitHudStatus(
                'micro_relock',
                `Re-lock: biasing back to line ${prevLine}`,
              );
              return;
            }
          }
        }
        warnGuard('low_sim_wait', [
          matchId ? `matchId=${matchId}` : '',
          `current=${cursorLine}`,
          `best=${rawIdx}`,
          `delta=${rawIdx - cursorLine}`,
          `sim=${formatLogScore(conf)}`,
          `need=${formatLogScore(effectiveThreshold)}`,
          `wall=${lostForwardWallStreak}`,
          earlyRelock ? `relock=${earlyRelock.reason}` : '',
          snippet ? `clue="${snippet}"` : '',
        ]);
        emitHudStatus('low_sim_wait', 'Low confidence - waiting');
        if (!permissiveMatcher) {
          noteLowSimFreeze(now, {
            cursorLine,
            bestIdx: rawIdx,
            delta: rawIdx - cursorLine,
            sim: conf,
            inBand,
            requiredSim: requiredThreshold,
            need: effectiveThreshold,
            repeatCount: relockRepeatCount,
            bestSpan: Number.isFinite(bestSpan) ? bestSpan : undefined,
            overlapRatio: Number.isFinite(bestOverlapRatio) ? bestOverlapRatio : undefined,
            snippet: freezeSnippet,
            matchId,
            relockModeActive,
            catchUpModeActive,
            stuckResyncActive,
          });
          return;
        }
        if (rawIdx >= cursorLine) {
          effectiveThreshold = Math.min(effectiveThreshold, Math.max(thresholds.candidateMinSim, conf));
        }
      }
      warnGuard('low_sim', [
        matchId ? `matchId=${matchId}` : '',
        `current=${cursorLine}`,
        `best=${rawIdx}`,
        `delta=${rawIdx - cursorLine}`,
        `sim=${formatLogScore(conf)}`,
        `need=${formatLogScore(effectiveThreshold)}`,
        `wall=${lostForwardWallStreak}`,
        earlyRelock ? `relock=${earlyRelock.reason}` : '',
        relockModeActive ? 'relock=1' : '',
        relockReason ? `relockReason=${relockReason}` : '',
        Number.isFinite(bestSpan) ? `span=${bestSpan}` : '',
        Number.isFinite(bestOverlapRatio) ? `overlap=${formatLogScore(bestOverlapRatio)}` : '',
        relockRepeatCount ? `repeat=${relockRepeatCount}` : '',
        snippet ? `clue="${snippet}"` : '',
      ]);
      emitHudStatus(
        'low_sim_ingest',
        `Ignored: low confidence (sim=${formatLogScore(conf)} < ${formatLogScore(effectiveThreshold)})`,
      );
      if (!permissiveMatcher) {
        noteLowSimFreeze(now, {
          cursorLine,
          bestIdx: rawIdx,
          delta: rawIdx - cursorLine,
          sim: conf,
          inBand,
          requiredSim: requiredThreshold,
          need: effectiveThreshold,
          repeatCount: relockRepeatCount,
          bestSpan: Number.isFinite(bestSpan) ? bestSpan : undefined,
          overlapRatio: Number.isFinite(bestOverlapRatio) ? bestOverlapRatio : undefined,
          snippet: freezeSnippet,
          matchId,
          relockModeActive,
          catchUpModeActive,
          stuckResyncActive,
        });
        return;
      }
      if (rawIdx >= cursorLine) {
        effectiveThreshold = Math.min(effectiveThreshold, Math.max(thresholds.candidateMinSim, conf));
      }
      }
    }
    const preNudgeCandidates = topScoresSpeakable
      .map((entry) => ({ idx: Number(entry.idx), score: Number(entry.score) }))
      .filter((entry) => Number.isFinite(entry.idx) && Number.isFinite(entry.score))
      .map((entry) => ({ idx: Math.max(0, Math.floor(entry.idx)), score: entry.score }))
      .sort((a, b) => b.score - a.score || Math.abs(a.idx - cursorLine) - Math.abs(b.idx - cursorLine) || a.idx - b.idx);
    const preNudgeBest = preNudgeCandidates[0] || null;
    const preNudgeSecond = preNudgeCandidates[1] || null;
    const preNudgeTranscript = transcriptComparable || bufferedText || compacted || text;
    const preNudgeTranscriptContent = getContentTokenSet(normTokens(preNudgeTranscript));
    const preNudgeBestLine = preNudgeBest ? preNudgeBest.idx : Math.max(0, Math.floor(rawIdx));
    const preNudgeBestTokens = normTokens(normalizeComparableText(getLineTextAt(preNudgeBestLine)));
    const preNudgeSecondTokens = preNudgeSecond
      ? normTokens(normalizeComparableText(getLineTextAt(preNudgeSecond.idx)))
      : [];
    const preNudgeBestContentCount = getContentTokenSet(preNudgeBestTokens).size;
    const preNudgeBestOverlapHits = countSharedContentTokenHits(preNudgeTranscriptContent, preNudgeBestTokens);
    const preNudgeSimGap =
      preNudgeBest && preNudgeSecond
        ? preNudgeBest.score - preNudgeSecond.score
        : Number.NaN;
    const preNudgeStrongSim = conf >= DEFAULT_CUE_BRIDGE_STRONG_SIM;
    const preNudgeLargeGap =
      Number.isFinite(preNudgeSimGap) &&
      preNudgeSimGap >= DEFAULT_CUE_BRIDGE_LARGE_GAP;
    const preNudgeStableEvidence =
      !isFinal &&
      interimRepeatCount >= DEFAULT_CUE_BRIDGE_STABILITY_MIN_EVENTS;
    const cueBridgeNudgeEvidenceOk =
      preNudgeStrongSim || preNudgeLargeGap || preNudgeStableEvidence;
    const preNudgeAmbiguity = evaluateShortLineAmbiguityHold(
      cursorLine,
      preNudgeBestLine,
      preNudgeBest ? preNudgeBest.score : conf,
      preNudgeBestContentCount,
      preNudgeBestOverlapHits,
      preNudgeBestTokens,
      preNudgeSecond,
      preNudgeSecondTokens,
    );
    const preNudgeAnchorOverride =
      rawIdx >= cursorLine &&
      preNudgeAmbiguity.hold &&
      !!strongLongAnchorCandidate;
    if (preNudgeAnchorOverride && strongLongAnchorCandidate) {
      const before = rawIdx;
      rawIdx = strongLongAnchorCandidate.idx;
      conf = strongLongAnchorCandidate.score;
      forceReason = forceReason || 'hold-anchor';
      relockOverride = true;
      relockReason = relockReason || 'hold-anchor';
      if (isDevMode()) {
        try {
          console.info(
            `ASR_HOLD_ANCHOR_PRENUDGE current=${cursorLine} best=${before} anchor=${rawIdx} sim=${formatLogScore(conf)}`,
          );
        } catch {}
      }
    }
    const preNudgeShortLineAmbiguous =
      rawIdx >= cursorLine &&
      preNudgeAmbiguity.hold &&
      !preNudgeAnchorOverride;
    const preNudgeStrongFinalHoldBypass =
      isFinal &&
      rawIdx === cursorLine &&
      conf >= Math.max(
        effectiveThreshold,
        permissiveMatcher ? DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM : DEFAULT_STRONG_FORWARD_COMMIT_SIM,
      ) &&
      overlapTokensCurrent.length >= (
        permissiveMatcher ? 2 : DEFAULT_STRONG_FINAL_NUDGE_MIN_OVERLAP_TOKENS
      ) &&
      overlapRatioCurrent >= (
        permissiveMatcher ? 0.25 : DEFAULT_STRONG_FINAL_NUDGE_MIN_OVERLAP_RATIO
      );
    const permissiveMarkerConsistencyOk =
      markerIdx < 0 ||
      markerIdx >= (
        cursorLine -
        Math.max(DEFAULT_PERMISSIVE_FINAL_MARKER_BACK_TOLERANCE_LINES, consistencyMarkerBandLines)
      );
    const preNudgeHoldReason = preNudgeAmbiguity.reason || 'short_line_ambiguous';
    if (
      preNudgeShortLineAmbiguous &&
      !ambiguityHoldActive &&
      !preNudgeStrongFinalHoldBypass &&
      !permissiveMatcher
    ) {
      beginOrRefreshAmbiguityHold(
        now,
        preNudgeHoldReason,
        cursorLine,
        preNudgeBestLine,
        preNudgeBest ? preNudgeBest.score : conf,
        preNudgeSecond ? preNudgeSecond.idx : null,
        preNudgeSecond ? preNudgeSecond.score : null,
        preNudgeBestOverlapHits,
      );
      return;
    }
    const blockCueBridgeForHold =
      !permissiveMatcher &&
      (ambiguityHoldActive || preNudgeShortLineAmbiguous);
    const finalMatchNudgeEligible =
      isFinal &&
      rawIdx === cursorLine &&
      conf >= effectiveThreshold &&
      cueBridgeNudgeEvidenceOk &&
      !blockCueBridgeForHold;
    const permissiveFinalNudgeEligible =
      permissiveMatcher &&
      isFinal &&
      rawIdx === cursorLine &&
      permissiveMarkerConsistencyOk &&
      conf >= DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM &&
      preNudgeBestOverlapHits >= DEFAULT_PERMISSIVE_FINAL_MIN_CONTENT_HITS &&
      (
        overlapTokensCurrent.length >= 2 ||
        overlapRatioCurrent >= DEFAULT_PERMISSIVE_FINAL_MIN_OVERLAP_RATIO
      );
    const strongFinalNudgeHoldBypass =
      preNudgeStrongFinalHoldBypass &&
      blockCueBridgeForHold;
    const stableInterimNudgeEligible =
      !isFinal &&
      isSessionAsrArmed() &&
      commitCount > 0 &&
      bufferGrowing &&
      rawIdx === cursorLine &&
      conf >= DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM &&
      stableInterimMs >= DEFAULT_STABLE_INTERIM_NUDGE_MS &&
      now - lastStableInterimNudgeAt >= DEFAULT_STABLE_INTERIM_NUDGE_COOLDOWN_MS &&
      cueBridgeNudgeEvidenceOk &&
      !blockCueBridgeForHold;
    if (
      finalMatchNudgeEligible ||
      stableInterimNudgeEligible ||
      strongFinalNudgeHoldBypass ||
      permissiveFinalNudgeEligible
    ) {
      const nudgeDeltaCap = DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES;
      const cueBridge = findNextSpeakableWithinBridge(cursorLine, nudgeDeltaCap);
      const bridgeUsed = cueBridge.skippedReasons.length > 0;
      const nudgeTarget =
        cueBridge.nextLine != null && cueBridge.nextLine > cursorLine
          ? Math.max(cursorLine + 1, Math.floor(cueBridge.nextLine))
          : null;
      const allowBridgeNudge =
        bridgeUsed &&
        (finalMatchNudgeEligible || stableInterimNudgeEligible || permissiveFinalNudgeEligible);
      const plainStrongFinalNudge =
        !bridgeUsed &&
        nudgeTarget === cursorLine + 1 &&
        conf >= (
          permissiveFinalNudgeEligible
            ? DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM
            : DEFAULT_STRONG_FORWARD_COMMIT_SIM
        ) &&
        (finalMatchNudgeEligible || strongFinalNudgeHoldBypass || permissiveFinalNudgeEligible);
      if (nudgeTarget != null && (allowBridgeNudge || plainStrongFinalNudge)) {
        const before = rawIdx;
        rawIdx = nudgeTarget;
        cueBridgeNudgeDelta = Math.max(1, rawIdx - cursorLine);
        if (isFinal && rawIdx > cursorLine && !forceReason) {
          forceReason = permissiveFinalNudgeEligible
            ? 'permissive-final-advance'
            : 'final-forward-nudge';
        }
        if (bridgeUsed) {
          logCueBridgeUse(
            cursorLine,
            rawIdx,
            cueBridge.skippedReasons,
            stableInterimNudgeEligible ? 'stable-interim-nudge' : 'final-match-nudge',
          );
        }
        if (stableInterimNudgeEligible) {
          lastStableInterimNudgeAt = now;
        }
        if (isDevMode() && stableInterimNudgeEligible) {
          try {
            console.info(
              `ASR_STABLE_INTERIM_NUDGE best=${before} cursor=${cursorLine} sim=${formatLogScore(conf)} stableMs=${stableInterimMs} -> next=${rawIdx}`,
            );
          } catch {}
        } else if (isDevMode()) {
          try {
            console.info(
              bridgeUsed
                ? `ASR_NUDGE final_match best=${before} cursor=${cursorLine} -> next=${rawIdx}`
                : strongFinalNudgeHoldBypass
                ? `ASR_NUDGE final_match_strong_hold_bypass best=${before} cursor=${cursorLine} sim=${formatLogScore(conf)} overlap=${overlapTokensCurrent.length}/${tokenCount} -> next=${rawIdx}`
                : permissiveFinalNudgeEligible
                ? `ASR_NUDGE permissive_final best=${before} cursor=${cursorLine} sim=${formatLogScore(conf)} overlap=${overlapTokensCurrent.length}/${tokenCount} -> next=${rawIdx}`
                : `ASR_NUDGE final_match_strong best=${before} cursor=${cursorLine} sim=${formatLogScore(conf)} -> next=${rawIdx}`,
            );
          } catch {}
        }
      }
    }
    const permissiveFinalFallbackEligible =
      permissiveMatcher &&
      isFinal &&
      rawIdx === cursorLine &&
      permissiveMarkerConsistencyOk &&
      conf >= DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM &&
      preNudgeBestOverlapHits >= DEFAULT_PERMISSIVE_FINAL_MIN_CONTENT_HITS &&
      (
        overlapTokensCurrent.length >= 2 ||
        overlapRatioCurrent >= DEFAULT_PERMISSIVE_FINAL_MIN_OVERLAP_RATIO
      );
    const strictFinalFallbackEligible =
      !permissiveMatcher &&
      isFinal &&
      rawIdx === cursorLine &&
      cueBridgeNudgeEvidenceOk &&
      conf >= Math.max(effectiveThreshold, DEFAULT_STRONG_FORWARD_COMMIT_SIM) &&
      overlapTokensCurrent.length >= DEFAULT_STRONG_FINAL_NUDGE_MIN_OVERLAP_TOKENS &&
      overlapRatioCurrent >= DEFAULT_STRONG_FINAL_NUDGE_MIN_OVERLAP_RATIO;
    if (permissiveFinalFallbackEligible || strictFinalFallbackEligible) {
      const fallbackBridge = findNextSpeakableWithinBridge(
        cursorLine,
        DEFAULT_CUE_BOUNDARY_BRIDGE_MAX_DELTA_LINES,
      );
      const totalLines = getTotalLines();
      let fallbackTarget =
        fallbackBridge.nextLine != null && fallbackBridge.nextLine > cursorLine
          ? Math.max(cursorLine + 1, Math.floor(fallbackBridge.nextLine))
          : cursorLine + 1;
      if (totalLines > 0) {
        fallbackTarget = Math.min(fallbackTarget, Math.max(0, totalLines - 1));
      }
      if (fallbackTarget > cursorLine) {
        const before = rawIdx;
        rawIdx = fallbackTarget;
        cueBridgeNudgeDelta = Math.max(cueBridgeNudgeDelta || 0, rawIdx - cursorLine);
        forceReason = forceReason || (
          permissiveFinalFallbackEligible
            ? 'permissive-final-advance'
            : 'final-forward-fallback'
        );
        if (isDevMode()) {
          try {
            console.info(
              permissiveFinalFallbackEligible
                ? `ASR_NUDGE permissive_final_fallback best=${before} cursor=${cursorLine} sim=${formatLogScore(conf)} -> next=${rawIdx}`
                : `ASR_NUDGE final_forward_fallback best=${before} cursor=${cursorLine} sim=${formatLogScore(conf)} overlap=${overlapTokensCurrent.length}/${tokenCount} -> next=${rawIdx}`,
            );
          } catch {}
        }
      }
    }
    recordConsistencyEntry({
      ts: now,
      idx: rawIdx,
      delta: rawIdx - cursorLine,
      sim: conf,
      nearMarker,
      isFinal,
    });
    const genericCandidateCount = topScoresSpeakable.length
      ? topScoresSpeakable.filter((entry) => Number(entry.score) >= conf - DEFAULT_GENERIC_SIM_DELTA).length
      : 0;
    const genericTranscript =
      tokenCount > 0 &&
      tokenCount <= DEFAULT_GENERIC_MAX_TOKENS &&
      genericCandidateCount >= DEFAULT_GENERIC_MIN_CANDIDATES;
    let effectiveConsistencyCount = consistencyCount + (genericTranscript ? 1 : 0);
    const forwardDelta = rawIdx - cursorLine;
    const highConfidenceSmallDelta =
      isFinal &&
      forwardDelta >= 0 &&
      forwardDelta <= confirmationRelaxedMaxDelta &&
      conf >= confirmationRelaxedSim;
    if (highConfidenceSmallDelta && effectiveConsistencyCount >= 3) {
      effectiveConsistencyCount = Math.max(2, effectiveConsistencyCount - 1);
      logDev('confirmations relaxed', {
        count: effectiveConsistencyCount,
        delta: forwardDelta,
        sim: conf,
      });
    }
    if (catchUpModeActive && effectiveConsistencyCount > 0) {
      effectiveConsistencyCount = Math.max(1, effectiveConsistencyCount - 1);
    }
    const catchupMaxDeltaLinesEffective = catchUpModeActive
      ? Math.max(catchupMaxDeltaLines, DEFAULT_CATCHUP_MODE_MAX_JUMP)
      : catchupMaxDeltaLines;
    const catchupMinSimEffective = catchUpModeActive
      ? Math.max(catchupMinSim, DEFAULT_CATCHUP_MODE_MIN_SIM)
      : catchupMinSim;
    const allowSameLineConfirmations = highConfidenceSmallDelta && effectiveConsistencyCount > 0;
    const consistencyState = allowShortEvidence
      ? evaluateConsistency(now, {
        requiredCount: effectiveConsistencyCount,
        minSim: consistencyMinSim,
        maxDeltaLines: consistencyMaxDeltaLines,
        maxSpreadLines: consistencyMaxSpreadLines,
        requireNearMarker: consistencyRequireNearMarker,
        minDeltaLines: allowSameLineConfirmations ? 0 : minLineAdvance,
        requireForward: allowSameLineConfirmations,
      })
      : {
        ok: false,
        count: 0,
        needed: 0,
        minDelta: 0,
        maxDelta: 0,
        minSim: 0,
        spread: 0,
        nearOk: false,
      };
    const catchupState = allowCatchup
      ? evaluateConsistency(now, {
        requiredCount: effectiveConsistencyCount,
        minSim: catchupMinSimEffective,
        maxDeltaLines: catchupMaxDeltaLinesEffective,
        maxSpreadLines: consistencyMaxSpreadLines,
        requireNearMarker: consistencyRequireNearMarker,
      })
      : {
        ok: false,
        count: 0,
        needed: 0,
        minDelta: 0,
        maxDelta: 0,
        minSim: 0,
        spread: 0,
        nearOk: false,
      };
    let catchupCommit = false;
    if (allowCatchup && catchupState.ok && rawIdx > cursorLine) {
      const delta = rawIdx - cursorLine;
      if (delta <= catchupMaxDeltaLinesEffective && conf >= catchupMinSimEffective) {
        const cooldownRemaining = getForcedCooldownRemaining(now);
        if (!allowForced) {
          warnGuard('catchup_blocked', [
            `current=${cursorLine}`,
            `best=${rawIdx}`,
            `delta=${delta}`,
          ]);
        } else if (cooldownRemaining > 0) {
          logForcedDeny('cooldown', [
            `cooldownMs=${cooldownRemaining}`,
          ]);
        } else {
          const forcedCount = getForcedCount(now);
          if (forcedCount >= forcedRateMax) {
            forcedCooldownUntil = now + forcedCooldownMs;
            logForcedThrottle(forcedCount);
            logForcedDeny('throttle', [
              `count=${forcedCount}`,
              `windowMs=${forcedRateWindowMs}`,
              `cooldownMs=${forcedCooldownMs}`,
            ]);
          } else {
            catchupCommit = true;
            forceReason = forceReason || 'catchup';
            effectiveThreshold = Math.min(effectiveThreshold, catchupMinSim);
            armPostCatchupGrace('catchup');
          }
        }
      }
    }
    let interimEligible = true;
    const forwardThreshold = Math.max(requiredThreshold, effectiveThresholdForPending);
    const strongForwardInterimProgress =
      !isFinal &&
      rawIdx > cursorLine &&
      (committedFloor == null || rawIdx > committedFloor) &&
      conf >= forwardThreshold &&
      bufferGrowing;
    const progressiveForwardInterimProgress =
      !isFinal &&
      forceReason === 'progressive-floor' &&
      rawIdx >= cursorLine &&
      conf >= DEFAULT_PROGRESSIVE_FORWARD_FLOOR_SIM &&
      bufferGrowing;
    if (!isFinal) {
      if (!allowInterimCommit) {
        interimEligible = false;
      } else if (
        conf < interimHighThreshold &&
        !(consistencyState.ok || catchupState.ok) &&
        !strongForwardInterimProgress &&
        !watchdogForwardInterimProgress &&
        !progressiveForwardInterimProgress
      ) {
        lastInterimBestIdx = -1;
        interimRepeatCount = 0;
        interimEligible = false;
        warnGuard('interim_unstable', [
          `current=${cursorLine}`,
          `best=${rawIdx}`,
          `delta=${rawIdx - cursorLine}`,
          `sim=${formatLogScore(conf)}`,
          `need=${formatLogScore(interimHighThreshold)}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
      } else {
        let effectiveInterimRepeats = interimStableRepeats;
        if (allowInterimCommit && bufferGrowing && (consistencyState.ok || catchupState.ok)) {
          effectiveInterimRepeats = Math.max(1, interimStableRepeats - 1);
        } else if (allowInterimCommit && evidenceShort && !consistencyState.ok) {
          effectiveInterimRepeats = interimStableRepeats + 1;
        }
        if (rawIdx === lastInterimBestIdx) {
          interimRepeatCount += 1;
        } else {
          lastInterimBestIdx = rawIdx;
          interimRepeatCount = 1;
        }
        interimEligible =
          interimRepeatCount >= effectiveInterimRepeats || consistencyState.ok || catchupState.ok;
        if (!interimEligible) {
          if (strongForwardInterimProgress || watchdogForwardInterimProgress || progressiveForwardInterimProgress) {
            interimEligible = true;
          } else {
            warnGuard('interim_unstable', [
              `current=${cursorLine}`,
              `best=${rawIdx}`,
              `delta=${rawIdx - cursorLine}`,
              `sim=${formatLogScore(conf)}`,
              `repeats=${interimRepeatCount}`,
              `need=${effectiveInterimRepeats}`,
              snippet ? `clue="${snippet}"` : '',
            ]);
          }
        }
      }
    } else {
      lastInterimBestIdx = -1;
      interimRepeatCount = 0;
    }
    recordEvent({
      ts: new Date(now).toISOString(),
      currentIndex: currentIdx,
      lastLineIndex,
      bestIdx: rawIdx,
      sim: conf,
      isFinal,
      snippet,
      matchId,
    });
    if (topScoresSpeakable.length >= 2) {
      let near: { idx: number; score: number; dist: number } | null = null;
      let far: { idx: number; score: number; dist: number } | null = null;
      for (const entry of topScoresSpeakable) {
        const idx = Number(entry.idx);
        const score = Number(entry.score);
        if (!Number.isFinite(idx) || !Number.isFinite(score)) continue;
        const dist = Math.abs(idx - cursorLine);
        if (dist <= ambiguityNearLines && (!near || score > near.score)) {
          near = { idx, score, dist };
        }
        if (dist >= ambiguityFarLines && (!far || score > far.score)) {
          far = { idx, score, dist };
        }
      }
      if (near && far && Math.abs(near.score - far.score) <= ambiguitySimDelta) {
        warnGuard('ambiguous', [
          `current=${cursorLine}`,
          `near=${near.idx}:${formatLogScore(near.score)}`,
          `far=${far.idx}:${formatLogScore(far.score)}`,
          `delta=${Math.abs(near.score - far.score).toFixed(2)}`,
        ]);
        logDev('ambiguous match', { near, far, cursorLine });
      }
    }
    const holdCandidates = topScoresSpeakable
      .map((entry) => ({ idx: Number(entry.idx), score: Number(entry.score) }))
      .filter((entry) => Number.isFinite(entry.idx) && Number.isFinite(entry.score))
      .map((entry) => ({ idx: Math.max(0, Math.floor(entry.idx)), score: entry.score }))
      .sort((a, b) => b.score - a.score || Math.abs(a.idx - cursorLine) - Math.abs(b.idx - cursorLine) || a.idx - b.idx);
    const holdBestCandidate = holdCandidates[0] || null;
    const holdSecondCandidate = holdCandidates[1] || null;
    const holdTranscript = transcriptComparable || bufferedText || compacted || text;
    const holdTranscriptContentSet = getContentTokenSet(normTokens(holdTranscript));
    const holdBestIdx = holdBestCandidate ? holdBestCandidate.idx : Math.max(0, Math.floor(rawIdx));
    const holdBestLineTokens = normTokens(normalizeComparableText(getLineTextAt(holdBestIdx)));
    const holdSecondLineTokens = holdSecondCandidate
      ? normTokens(normalizeComparableText(getLineTextAt(holdSecondCandidate.idx)))
      : [];
    const holdBestLineContentCount = getContentTokenSet(holdBestLineTokens).size;
    const holdBestOverlapHits = countSharedContentTokenHits(holdTranscriptContentSet, holdBestLineTokens);
    const holdAmbiguity = evaluateShortLineAmbiguityHold(
      cursorLine,
      holdBestIdx,
      holdBestCandidate ? holdBestCandidate.score : conf,
      holdBestLineContentCount,
      holdBestOverlapHits,
      holdBestLineTokens,
      holdSecondCandidate,
      holdSecondLineTokens,
    );
    const holdShortLineAmbiguous =
      rawIdx >= cursorLine &&
      holdAmbiguity.hold;
    const holdReasonCode =
      holdShortLineAmbiguous
        ? (holdAmbiguity.reason || 'short_line_ambiguous')
        : '';
    const holdCandidateAmbiguous =
      rawIdx >= cursorLine &&
      holdShortLineAmbiguous &&
      !permissiveMatcher;
    const holdAnchorCandidates = forwardBandScores
      .filter((entry) =>
        entry.idx > cursorLine &&
        entry.idx <= cursorLine + DEFAULT_HOLD_ANCHOR_LOOKAHEAD_LINES)
      .map((entry) => {
        const lineTokens = normTokens(normalizeComparableText(getLineTextAt(entry.idx)));
        const contentTokenCount = getContentTokenSet(lineTokens).size;
        const sharedContentHits = countSharedContentTokenHits(holdTranscriptContentSet, lineTokens);
        const longAnchor = contentTokenCount >= DEFAULT_HOLD_ANCHOR_MIN_CONTENT_TOKENS;
        const boostedScore = entry.score + (longAnchor ? 0.03 : 0);
        return {
          ...entry,
          contentTokenCount,
          sharedContentHits,
          longAnchor,
          boostedScore,
        };
      })
      .slice()
      .sort((a, b) =>
        b.boostedScore - a.boostedScore ||
        b.sharedContentHits - a.sharedContentHits ||
        b.contentTokenCount - a.contentTokenCount ||
        b.span - a.span ||
        a.idx - b.idx,
      );
    const holdAnchorBest = holdAnchorCandidates[0] || null;
    const holdAnchorSecond = holdAnchorCandidates[1] || null;
    const holdAnchorMargin = holdAnchorBest && holdAnchorSecond
      ? holdAnchorBest.boostedScore - holdAnchorSecond.boostedScore
      : Number.POSITIVE_INFINITY;
    const holdAnchorDelta = holdAnchorBest ? holdAnchorBest.idx - cursorLine : Number.POSITIVE_INFINITY;
    const holdAnchorNearNeedsExtraStrength =
      Number.isFinite(holdAnchorDelta) &&
      holdAnchorDelta <= DEFAULT_HOLD_ANCHOR_NEAR_DELTA_LINES;
    const holdAnchorStrengthOk =
      !!holdAnchorBest &&
      (!holdAnchorNearNeedsExtraStrength || holdAnchorBest.score >= DEFAULT_HOLD_ANCHOR_NEAR_MIN_SIM);
    const holdAnchorReady =
      !!holdAnchorBest &&
      holdAnchorBest.score >= DEFAULT_HOLD_ANCHOR_MIN_SIM &&
      holdAnchorBest.longAnchor &&
      holdAnchorBest.sharedContentHits >= DEFAULT_HOLD_ANCHOR_MIN_SHARED_CONTENT_HITS &&
      holdAnchorStrengthOk &&
      holdAnchorMargin >= DEFAULT_HOLD_ANCHOR_MARGIN;
    const shouldHoldCandidate =
      holdCandidateAmbiguous &&
      !holdAnchorReady &&
      !strongLongAnchorCandidate;
    const holdBestSim = holdBestCandidate ? holdBestCandidate.score : conf;
    const holdSecondIdx = holdSecondCandidate ? holdSecondCandidate.idx : null;
    const holdSecondSim = holdSecondCandidate ? holdSecondCandidate.score : null;
    if (ambiguityHoldActive && permissiveMatcher) {
      closeAmbiguityHold(
        now,
        'permissive-mode',
        cursorLine,
        holdBestIdx,
        holdBestSim,
        holdSecondIdx,
        holdSecondSim,
      );
    }
    if (ambiguityHoldActive) {
      if (holdAnchorReady && holdAnchorBest) {
        closeAmbiguityHold(
          now,
          'anchor_relock',
          cursorLine,
          holdBestIdx,
          holdBestSim,
          holdSecondIdx,
          holdSecondSim,
          holdAnchorBest.idx,
          holdAnchorBest.score,
        );
        const before = rawIdx;
        rawIdx = holdAnchorBest.idx;
        conf = holdAnchorBest.score;
        forceReason = forceReason || 'hold-anchor';
        relockOverride = true;
        relockReason = relockReason || 'hold-anchor';
        emitHudStatus(
          'hold_anchor',
          `Anchor relock +${rawIdx - cursorLine} (sim=${formatLogScore(conf)})`,
        );
        if (isDevMode()) {
          try {
            const holdMarginText = Number.isFinite(holdAnchorMargin)
              ? formatLogScore(holdAnchorMargin)
              : 'na';
            console.info(
              `ASR_HOLD_ANCHOR current=${cursorLine} best=${before} anchor=${rawIdx} sim=${formatLogScore(conf)} margin=${holdMarginText}`,
            );
          } catch {}
        }
      } else if (
        shouldHoldCandidate ||
        conf < Math.max(requiredThreshold, DEFAULT_HOLD_ANCHOR_MIN_SIM)
      ) {
        beginOrRefreshAmbiguityHold(
          now,
          holdReasonCode || ambiguityHoldReason || 'await_anchor',
          cursorLine,
          holdBestIdx,
          holdBestSim,
          holdSecondIdx,
          holdSecondSim,
          holdBestOverlapHits,
        );
        return;
      } else {
        closeAmbiguityHold(
          now,
          'resolved',
          cursorLine,
          holdBestIdx,
          holdBestSim,
          holdSecondIdx,
          holdSecondSim,
        );
      }
    } else if (holdCandidateAmbiguous) {
      if (strongLongAnchorCandidate) {
        const before = rawIdx;
        rawIdx = strongLongAnchorCandidate.idx;
        conf = strongLongAnchorCandidate.score;
        forceReason = forceReason || 'hold-anchor';
        relockOverride = true;
        relockReason = relockReason || 'hold-anchor';
        if (isDevMode()) {
          try {
            console.info(
              `ASR_HOLD_ANCHOR_IMMEDIATE current=${cursorLine} best=${before} anchor=${rawIdx} sim=${formatLogScore(conf)} margin=${formatLogScore(strongLongAnchorCandidate.margin)}`,
            );
          } catch {}
        }
      } else if (holdAnchorReady && holdAnchorBest) {
        const before = rawIdx;
        rawIdx = holdAnchorBest.idx;
        conf = holdAnchorBest.score;
        forceReason = forceReason || 'hold-anchor';
        relockOverride = true;
        relockReason = relockReason || 'hold-anchor';
        if (isDevMode()) {
          try {
            const holdMarginText = Number.isFinite(holdAnchorMargin)
              ? formatLogScore(holdAnchorMargin)
              : 'na';
            console.info(
              `ASR_HOLD_ANCHOR_IMMEDIATE current=${cursorLine} best=${before} anchor=${rawIdx} sim=${formatLogScore(conf)} margin=${holdMarginText}`,
            );
          } catch {}
        }
      } else {
        beginOrRefreshAmbiguityHold(
          now,
          holdReasonCode || interimShortLineAmbiguityReason || 'await_anchor',
          cursorLine,
          holdBestIdx,
          holdBestSim,
          holdSecondIdx,
          holdSecondSim,
          holdBestOverlapHits,
        );
        return;
      }
    }

    const behindBy = cursorLine - rawIdx;
    if (behindBy > 0) {
      recordBehindRecoveryHit(rawIdx, conf, isFinal, now);
      if (tryBehindRecovery(cursorLine, now, conf, rawIdx, isFinal)) {
        return;
      }
      if (!isFinal) {
        behindStrongCount = 0;
        lastBehindStrongIdx = -1;
        lastBehindStrongAt = 0;
        noteBehindBlocked(now);
        warnGuard('behind_blocked', [
          `current=${cursorLine}`,
          `best=${rawIdx}`,
          `delta=${rawIdx - cursorLine}`,
          `sim=${formatLogScore(conf)}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
        emitHudStatus('behind_blocked', 'Behind match ignored');
        logDev('behind match ignored', { line: rawIdx, conf, cursorLine, isFinal, reason: 'interim' });
        return;
      }
      const strongBehind = conf >= Math.max(strongBackSim, requiredThreshold);
      if (strongBehind) {
        if (
          Math.abs(rawIdx - lastBehindStrongIdx) <= 1 &&
          now - lastBehindStrongAt <= backConfirmWindowMs
        ) {
          behindStrongCount += 1;
        } else {
          behindStrongCount = 1;
          behindStrongSince = now;
        }
        lastBehindStrongIdx = rawIdx;
        lastBehindStrongAt = now;
      } else {
        behindStrongCount = 0;
        behindStrongSince = 0;
      }
      if (
        DEFAULT_ALLOW_BEHIND_REANCHOR &&
        strongBehind &&
        behindStrongCount >= backConfirmHits &&
        behindStrongSince > 0 &&
        now - behindStrongSince >= behindRecoveryMs &&
        behindBy <= behindRecoveryMaxLines &&
        conf >= Math.max(behindRecoveryMinSim, requiredThreshold) &&
        now - lastBehindRecoveryAt >= behindRecoveryCooldownMs
      ) {
        const scroller = getScroller();
        const scrollTopBefore = scroller?.scrollTop ?? 0;
        const targetTop = scroller ? resolveTargetTop(scroller, rawIdx) : null;
        if (scroller && targetTop != null) {
          stopGlide('behind-reanchor');
          const applied = applyScrollWithHybridGuard(targetTop, {
            scroller,
            reason: 'asr-behind-reanchor',
          });
          lastKnownScrollTop = applied;
          lastMoveAt = Date.now();
          markProgrammaticScroll();
          bootTrace('SCROLL:apply', {
            y: Math.round(applied),
            from: Math.round(scrollTopBefore),
            via: 'pixel',
            reason: 'asr-behind-reanchor',
            lineIdx: rawIdx,
          });
        }
        lastLineIndex = Math.max(0, Math.floor(rawIdx));
        matchAnchorIdx = lastLineIndex;
        lastForwardCommitAt = now;
        lastSeekTs = now;
        lastEvidenceAt = now;
        noteCommit(cursorLine, lastLineIndex, now);
        closeAmbiguityHold(now, 'behind-reanchor', cursorLine, lastLineIndex, conf);
        resetLowSimStreak();
        behindStrongSince = 0;
        behindStrongCount = 0;
        lastBehindRecoveryAt = now;
        microPursuitUntil = 0;
        resetLookahead('behind-reanchor');
        setCurrentIndex(lastLineIndex, 'behind-reanchor');
        logThrottled('ASR_COMMIT', 'log', 'ASR_COMMIT', {
          prevIndex: cursorLine,
          nextIndex: lastLineIndex,
          delta: lastLineIndex - cursorLine,
          sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : conf,
          scrollTopBefore: Math.round(scrollTopBefore),
          scrollTopAfter: Math.round(targetTop ?? scrollTopBefore),
          forced: false,
          mode: getScrollMode() || 'unknown',
          reason: 'behind-reanchor',
        });
        bootTrace('ASR:commit', {
          matchId,
          prev: cursorLine,
          index: lastLineIndex,
          delta: lastLineIndex - cursorLine,
          sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : null,
          final: !!isFinal,
          via: 'pixel',
          forced: false,
          reason: 'behind-reanchor',
        });
        updateDebugState('behind-reanchor');
        return;
      }
      if (!strongBehind || behindStrongCount < backConfirmHits) {
        noteBehindBlocked(now);
        warnGuard('behind_blocked', [
          `current=${cursorLine}`,
          `best=${rawIdx}`,
          `delta=${rawIdx - cursorLine}`,
          `sim=${formatLogScore(conf)}`,
          `hits=${behindStrongCount}`,
          `need=${backConfirmHits}`,
          `strong=${strongBehind ? 1 : 0}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
        emitHudStatus('behind_blocked', 'Behind match ignored');
        logDev('behind match ignored', {
          line: rawIdx,
          conf,
          cursorLine,
          isFinal,
          reason: strongBehind ? 'confirm' : 'weak',
        });
        return;
      }
    } else {
      behindStrongCount = 0;
    }

    const aheadBy = rawIdx - cursorLine;
    if (aheadBy >= realignLeadLines && conf >= Math.max(realignSim, requiredThreshold)) {
      if (now - lastResyncAt >= resyncCooldownMs) {
        resyncUntil = now + resyncWindowMs;
        resyncAnchorIdx = Math.max(0, Math.floor(rawIdx - realignLookbackLines));
        resyncReason = 'auto';
        resetResyncOverrides();
        lastResyncAt = now;
        if (!desyncWarned) {
          desyncWarned = true;
          try { console.warn('[ASR] realigning matcher window', { targetLine: rawIdx, lastLineIndex, currentIndex: currentIdx }); } catch {}
        }
        logDev('realign matcher window', { anchor: resyncAnchorIdx, windowAhead: matchLookaheadLines + resyncLookaheadBonus });
      }
    }

    if (tokenCount === 0) {
      warnGuard('min_evidence', [
        `current=${cursorLine}`,
        `best=${rawIdx}`,
        `tokens=${tokenCount}`,
      ]);
      emitHudStatus('min_evidence_zero', 'Blocked: min evidence (tokens=0)');
      return;
    }

    pushStrongHit(rawIdx, conf, isFinal, now);
    if (outrunCommit && strongHits.length > 1) {
      strongHits.splice(0, strongHits.length - 1);
      behindStrongCount = 0;
      lastBehindStrongIdx = -1;
      lastBehindStrongAt = 0;
    }
    syncMatchAnchor(rawIdx);
    updateDebugState('strong-hit');
    let hasPairEvidence = false;
    if (strongHits.length >= 2) {
      const a = strongHits[strongHits.length - 1];
      const b = strongHits[strongHits.length - 2];
      if (Math.abs(a.idx - b.idx) <= 1 && a.idx >= cursorLine + minLineAdvance && b.idx >= cursorLine + minLineAdvance) {
        hasPairEvidence = true;
      }
    }
    const consistencyOk = allowShortEvidence && consistencyState.ok;
    const slamDunkFinal = isSlamDunkFinal(rawIdx, conf);
    const finalEvidence = hasPairEvidence || consistencyOk || rawIdx >= cursorLine + finalEvidenceLeadLines;
    const interimEvidence = hasPairEvidence || consistencyOk || bufferGrowing;
    const deltaFromCursor = rawIdx - cursorLine;
    const smallForwardEvidenceMaxDelta = Math.max(minLineAdvance, confirmationRelaxedMaxDelta);
    const hasAmbiguousForwardCollision = topScoresSpeakable.some((entry) => {
      const idx = Number(entry.idx);
      const score = Number(entry.score);
      if (!Number.isFinite(idx) || !Number.isFinite(score)) return false;
      if (idx === rawIdx) return false;
      if (Math.abs(idx - rawIdx) > Math.max(1, minLineAdvance + 1)) return false;
      return score >= conf - forwardTieEps;
    });
    const strongSmallForwardEvidence =
      inBand &&
      deltaFromCursor >= 0 &&
      deltaFromCursor <= smallForwardEvidenceMaxDelta &&
      conf >= requiredThreshold &&
      !hasAmbiguousForwardCollision;
    const lostMode =
      resyncActive ||
      lagRelockActive ||
      stuckResyncActive ||
      catchUpModeActive ||
      lookaheadBase > matchLookaheadLines ||
      forceReason === 'watchdog' ||
      lostForwardActive;
    const permissiveForcedAdvance =
      forceReason === 'permissive-final-advance' &&
      rawIdx > cursorLine;
    const finalForwardForcedAdvance =
      (forceReason === 'final-forward-nudge' || forceReason === 'final-forward-fallback') &&
      rawIdx > cursorLine;
    let hasEvidence = outrunCommit || catchupCommit || lowSimForwardEvidence || slamDunkFinal || strongSmallForwardEvidence
      ? true
      : isFinal
        ? finalEvidence
        : interimEvidence;
    if (permissiveForcedAdvance || finalForwardForcedAdvance) {
      hasEvidence = true;
    }
    const extraDeltaLines = Math.max(0, deltaFromCursor - minLineAdvance);
    if (hasEvidence && extraDeltaLines > 0) {
      const multiLineNeed = clamp(
        requiredThreshold + Math.min(0.2, extraDeltaLines * 0.04),
        0,
        1,
      );
      const forwardConfirmed = forwardCandidatesChecked > 0;
      if (!forwardConfirmed && conf < multiLineNeed) {
        warnGuard('multi_line_low_sim', [
          matchId ? `matchId=${matchId}` : '',
          `current=${cursorLine}`,
          `best=${rawIdx}`,
          `delta=${deltaFromCursor}`,
          `sim=${formatLogScore(conf)}`,
          `need=${formatLogScore(multiLineNeed)}`,
          `forwardCandidates=${forwardCandidatesChecked}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
        emitHudStatus(
          'multi_line_wait',
          `Waiting: multi-line confirmation (sim=${formatLogScore(conf)} < ${formatLogScore(multiLineNeed)})`,
        );
        return;
      }
    }
    adoptPendingMatch({
      line: Math.max(0, Math.floor(rawIdx)),
      conf,
      isFinal,
      hasEvidence,
      snippet,
      minThreshold:
        effectiveThresholdForPending < requiredThreshold ? effectiveThresholdForPending : undefined,
      requiredThreshold,
      topScores: topScoresSpeakable,
      stickinessApplied: stickAdjust > 0,
      forced: outrunCommit || shortFinalForced || catchupCommit,
      forceReason,
      consistency: { count: consistencyState.count, needed: consistencyState.needed },
      relockOverride,
      relockReason,
      relockSpan: Number.isFinite(bestSpan) ? bestSpan : undefined,
      relockOverlapRatio: Number.isFinite(bestOverlapRatio) ? bestOverlapRatio : undefined,
      relockRepeat: relockRepeatCount || undefined,
      matchId,
      recoveryDetails,
      cursorLine,
      searchWindowFrom: bandStart,
      searchWindowTo: bandEnd,
      lostMode,
      cueBridgeNudgeDelta,
    });
    schedulePending();
  };

  function maybeScheduleLineRetry(targetLine: number, pending: PendingMatch): boolean {
    if (!Number.isFinite(targetLine)) return false;
    const line = Math.max(0, Math.floor(targetLine));
    if (lineMissingRetryLine !== line) {
      lineMissingRetryLine = line;
      lineMissingRetryCount = 1;
    } else if (lineMissingRetryCount < LINE_MISSING_RETRY_LIMIT) {
      lineMissingRetryCount += 1;
    } else {
      lineMissingRetryLine = null;
      lineMissingRetryCount = 0;
      return false;
    }
    adoptPendingMatch({ ...pending });
    schedulePending();
    return true;
  }

  const dispose = () => {
    if (disposed) return;
    emitSummary('dispose');
    disposed = true;
    postCommitReadabilitySeq += 1;
    if (postCommitReadabilityTimers.size) {
      postCommitReadabilityTimers.forEach((timerId) => {
        try { window.clearTimeout(timerId); } catch {}
      });
      postCommitReadabilityTimers.clear();
    }
    try {
      unsubscribe();
    } catch {
      // ignore
    }
    try {
      unsubscribeTuning();
    } catch {
      // ignore
    }
    try { window.removeEventListener('tp:asr:silence', silenceHandler as EventListener); } catch {}
    try { window.removeEventListener('tp:script:reset', resetHandler as EventListener); } catch {}
    try { window.removeEventListener('tp:asr:rescue', rescueHandler as EventListener); } catch {}
    detachManualScrollWatcher();
    manualAnchorPending = null;
    resetAmbiguityHoldState();
    updateManualAnchorGlobalState();
    if (activeGuardCounts === guardCounts) {
      activeGuardCounts = null;
    }
  };

  const setLastLineIndex = (index: number) => {
    if (!Number.isFinite(index)) return;
    scriptEndEventEmitted = false;
    lastLineIndex = Math.max(0, Math.floor(index));
    postCommitReadabilitySeq += 1;
    if (postCommitReadabilityTimers.size) {
      postCommitReadabilityTimers.forEach((timerId) => {
        try { window.clearTimeout(timerId); } catch {}
      });
      postCommitReadabilityTimers.clear();
    }
    lastSeekTs = 0;
    lastSameLineNudgeTs = 0;
    lastMoveAt = 0;
    lastIngestAt = 0;
    lastCommitAt = Date.now();
    lastStallLogAt = 0;
    lastStarvationWarnAt = 0;
    lastStarvationRelockAt = 0;
    stallHudEmitted = false;
    stallRescueRequested = false;
    matchAnchorIdx = lastLineIndex;
    pursuitTargetTop = null;
    pursuitVel = 0;
    pursuitActive = false;
    lastEvidenceAt = 0;
    lastCommitDeltaPx = 0;
    stopGlide('sync-index');
    microPursuitUntil = 0;
    creepBudgetLine = -1;
    creepBudgetUsed = 0;
    lastInterimBestIdx = -1;
    interimRepeatCount = 0;
    relockRepeatIdx = -1;
    relockRepeatCount = 0;
    relockRepeatWindowStart = 0;
    lastResyncAt = 0;
    resyncUntil = 0;
    resyncAnchorIdx = null;
    resyncReason = null;
    clearCommitBandReseed('sync-index');
    resetResyncOverrides();
    lastBehindStrongIdx = -1;
    lastBehindStrongAt = 0;
    behindStrongSince = 0;
    behindStrongCount = 0;
    lastBehindRecoveryAt = 0;
    overshootRiskUntil = 0;
    largeDeltaConfirm = null;
    behindRecoveryHits.length = 0;
    lagRelockHits = 0;
    lagRelockWindowStart = 0;
    lastForwardCommitAt = Date.now();
    finalsSinceCommit = 0;
    eventsSinceCommit = 0;
    noProgressStreak = 0;
    lostForwardWallStreak = 0;
    lastProgressCursorLine = lastLineIndex;
    lastCueStallRescueAt = 0;
    lostForwardActive = false;
    lostForwardStage = 0;
    lostForwardEnteredAt = 0;
    lastMicroRelockAt = 0;
    graceRollbackCooldownUntil = 0;
    resetAmbiguityHoldState();
    clearMicroRelockPreference();
    resetLookahead('sync-index');
    if (pendingRaf) {
      try { cancelAnimationFrame(pendingRaf); } catch {}
      pendingRaf = 0;
    }
    pendingMatch = null;
    strongHits.length = 0;
    evidenceEntries.length = 0;
    evidenceText = '';
    lastBufferChars = 0;
    consistencyEntries.length = 0;
    lastStuckDumpAt = 0;
    manualAnchorPending = null;
    updateManualAnchorGlobalState();
    setCurrentIndex(lastLineIndex, 'manualReset');
    updateDebugState('sync-index');
  };
  const getLastLineIndex = () => lastLineIndex;
  const getStats = (): AsrScrollDriverStats => ({
    lastIngestAt,
    lastCommitAt,
    commitCount,
    eventsSinceCommit,
    finalsSinceCommit,
  });

  const driver: AsrScrollDriver = { ingest, dispose, setLastLineIndex, getLastLineIndex, getStats };
  try { (driver as any).__instanceId = driverInstanceId; } catch {}
  if (isDevMode() && typeof window !== 'undefined') {
    try { (window as any).__tpAsrDriver = driver; } catch {}
  }
  return driver;
}
