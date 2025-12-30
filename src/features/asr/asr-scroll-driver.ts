import { matchBatch } from '../../speech/orchestrator';
import { normTokens } from '../../speech/matcher';
import { speechStore } from '../../state/speech-store';
import { getAsrSettings } from '../speech/speech-store';
import { ensureAsrTuningProfile, getActiveAsrTuningProfile, onAsrTuning, type AsrTuningProfile } from '../../asr/tuning-store';
import {
  applyCanonicalScrollTop,
  describeElement,
  getFallbackScroller,
  getPrimaryScroller,
  getScriptRoot,
  resolveActiveScroller,
} from '../../scroll/scroller';

type DriverOptions = {
  /** Minimum forward line delta before issuing a seek. */
  minLineAdvance?: number;
  /** Minimum milliseconds between seeks (throttle) */
  seekThrottleMs?: number;
  /** Scale applied to the confidence threshold when processing interim results (values >1 tighten). */
  interimConfidenceScale?: number;
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
};

type AsrEventSnapshot = {
  ts: string;
  currentIndex: number;
  lastLineIndex: number;
  bestIdx: number;
  sim: number;
  isFinal: boolean;
  snippet: string;
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

export interface AsrScrollDriver {
  ingest(text: string, isFinal: boolean): void;
  dispose(): void;
  setLastLineIndex(index: number): void;
  getLastLineIndex(): number;
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
const DEFAULT_SAME_LINE_THROTTLE_MS = 500;
const DEFAULT_CREEP_PX = 8;
const DEFAULT_CREEP_NEAR_PX = 28;
const DEFAULT_CREEP_BUDGET_PX = 40;
const DEFAULT_DEADBAND_PX = 32;
const DEFAULT_MAX_VEL_PX_PER_SEC = 110;
const DEFAULT_MAX_VEL_MED_PX_PER_SEC = 170;
const DEFAULT_MAX_VEL_CATCHUP_PX_PER_SEC = 240;
const DEFAULT_MAX_ACCEL_PX_PER_SEC2 = 800;
const DEFAULT_MIN_STEP_PX = 6;
const DEFAULT_MAX_STEP_PX = 10;
const DEFAULT_CATCHUP_MED_MIN_PX = 80;
const DEFAULT_CATCHUP_FAST_MIN_PX = 250;
const DEFAULT_MAX_TARGET_JUMP_PX = 120;
const DEFAULT_MAX_TARGET_JUMP_HYBRID_PX = 80;
const DEFAULT_STRONG_WINDOW_MS = 700;
const DEFAULT_FINAL_EVIDENCE_LEAD_LINES = 2;
const DEFAULT_BACK_RECOVERY_MAX_PX = 15;
const DEFAULT_BACK_RECOVERY_COOLDOWN_MS = 5000;
const DEFAULT_BACK_RECOVERY_HIT_LIMIT = 2;
const DEFAULT_BACK_RECOVERY_WINDOW_MS = 1200;
const DEFAULT_BACK_RECOVERY_STRONG_CONF = 0.75;
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
const DEFAULT_LAG_RELOCK_MIN_OVERLAP = 2;
const DEFAULT_LAG_RELOCK_MIN_TOKEN_LEN = 4;
const DEFAULT_LAG_RELOCK_MULTI_MIN_LINES = 2;
const DEFAULT_LAG_RELOCK_MULTI_MAX_LINES = 4;
const DEFAULT_LAG_RELOCK_LOW_SIM_FLOOR = 0.3;
const DEFAULT_RELOCK_SIM_FLOOR = 0.45;
const DEFAULT_RELOCK_OVERLAP_RATIO = 0.3;
const DEFAULT_RELOCK_SPAN_MIN_LINES = 2;
const DEFAULT_RELOCK_REPEAT_WINDOW_MS = 2200;
const DEFAULT_RELOCK_REPEAT_MIN = 3;
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
const DEFAULT_MIN_TOKEN_COUNT = 6;
const DEFAULT_MIN_EVIDENCE_CHARS = 40;
const DEFAULT_INTERIM_HYSTERESIS_BONUS = 0.15;
const DEFAULT_INTERIM_STABLE_REPEATS = 2;
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
const DEFAULT_OUTRUN_RELAXED_SIM = 0.5;
const DEFAULT_OUTRUN_WINDOW_MS = DEFAULT_FORWARD_PROGRESS_WINDOW_MS;
const DEFAULT_OUTRUN_LOOKAHEAD_LINES = 6;
const DEFAULT_FORCED_RATE_WINDOW_MS = 10000;
const DEFAULT_FORCED_RATE_MAX = 2;
const DEFAULT_FORCED_COOLDOWN_MS = 5000;
const DEFAULT_FORCED_MIN_TOKENS = 4;
const DEFAULT_FORCED_MIN_CHARS = 24;
const GUARD_THROTTLE_MS = 750;
const DEFAULT_SHORT_TOKEN_MAX = 4;
const DEFAULT_SHORT_TOKEN_BOOST = 0.12;
const DEFAULT_STALL_COMMIT_MS = 15000;
const DEFAULT_STALL_LOG_COOLDOWN_MS = 4000;
const DEFAULT_LOW_SIM_FLOOR = 0.35;
const DEFAULT_STUCK_RESYNC_WINDOW_MS = 2600;
const DEFAULT_STUCK_RESYNC_LOOKAHEAD_BONUS = 80;
const DEFAULT_STUCK_RESYNC_BACKTRACK_LINES = 1;
const DEFAULT_STUCK_RELOCK_SIM = 0.55;
const DEFAULT_DISTANCE_PENALTY_PER_LINE = 0.004;
const DEFAULT_GENERIC_SIM_DELTA = 0.03;
const DEFAULT_GENERIC_MIN_CANDIDATES = 3;
const DEFAULT_GENERIC_MAX_TOKENS = 8;
const DEFAULT_LAG_DELTA_LINES = 12;
const DEFAULT_LAG_WINDOW_MATCHES = 5;
const DEFAULT_LAG_MIN_FORWARD_HITS = 3;
const DEFAULT_CATCHUP_MODE_MAX_JUMP = 25;
const DEFAULT_CATCHUP_MODE_MIN_SIM = 0.55;
const DEFAULT_CATCHUP_MODE_DURATION_MS = 2500;
const EVENT_RING_MAX = 50;
const EVENT_DUMP_COUNT = 12;

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

function applyDistancePenalty(score: number, distance: number, penaltyPerLine: number): number {
  const penalty = Math.max(0, distance) * Math.max(0, penaltyPerLine);
  return clamp(score - penalty, 0, 1);
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
const LOG_THROTTLE_MS = 500;
const HUD_STATUS_THROTTLE_MS = 500;

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
  try {
    if (activeGuardCounts) {
      activeGuardCounts.set(reason, (activeGuardCounts.get(reason) || 0) + 1);
    }
  } catch {
    // ignore
  }
  const now = Date.now();
  const last = guardLastAt.get(reason) ?? 0;
  if (now - last < GUARD_THROTTLE_MS) return;
  guardLastAt.set(reason, now);
  try {
    const line = ['🧱 ASR_GUARD', `reason=${reason}`, ...parts.filter(Boolean)];
    console.warn(line.join(' '));
  } catch {}
  logThrottled(`ASR_GUARD:${reason}`, 'warn', 'ASR_GUARD', { reason, parts: parts.filter(Boolean) });
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

function logDev(...args: any[]) {
  if (!isDevMode()) return;
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

function isHybridMode(): boolean {
  return getScrollMode() === 'hybrid';
}

function getScroller(): HTMLElement | null {
  const primary = getPrimaryScroller();
  const root = getScriptRoot();
  const fallback = root || getFallbackScroller();
  return resolveActiveScroller(primary, fallback);
}

function resolveTargetTop(scroller: HTMLElement, lineIndex: number): number | null {
  if (!scroller) return null;
  const idx = Math.max(0, Math.floor(lineIndex));
  const line =
    scroller.querySelector<HTMLElement>(`.line[data-i="${idx}"]`) ||
    scroller.querySelector<HTMLElement>(`.line[data-index="${idx}"]`);
  if (!line) return null;
  const offset = Math.max(0, (scroller.clientHeight - line.offsetHeight) / 2);
  const raw = (line.offsetTop || 0) - offset;
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  return clamp(raw, 0, max);
}

function getLineElementByIndex(scroller: HTMLElement | null, lineIndex: number): HTMLElement | null {
  if (!scroller) return null;
  const idx = Math.max(0, Math.floor(lineIndex));
  return (
    scroller.querySelector<HTMLElement>(`.line[data-i="${idx}"]`) ||
    scroller.querySelector<HTMLElement>(`.line[data-index="${idx}"]`) ||
    scroller.querySelector<HTMLElement>(`.line[data-line-idx="${idx}"]`)
  );
}

function computeMarkerLineIndex(scroller: HTMLElement | null): number {
  try {
    const viewer = scroller || getPrimaryScroller();
    const root = getScriptRoot() || viewer;
    const container = viewer || root;
    const lineEls = Array.from((container || document).querySelectorAll<HTMLElement>('.line'));
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
    const markerY = rect.top + (host ? host.clientHeight : window.innerHeight) * markerPct;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < lineEls.length; i++) {
      const el = lineEls[i];
      const r = el.getBoundingClientRect();
      const y = r.top + r.height * 0.5;
      const d = Math.abs(y - markerY);
      if (d < bestDist) {
        bestDist = d;
        const dataIdx = el.dataset.i || el.dataset.index || el.getAttribute('data-line-idx');
        bestIdx = dataIdx ? Math.max(0, Number(dataIdx) || 0) : i;
      }
    }
    return Math.max(0, Math.floor(bestIdx));
  } catch {
    return 0;
  }
}

export function createAsrScrollDriver(options: DriverOptions = {}): AsrScrollDriver {
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
  let threshold = resolveThreshold();
  let lastLineIndex = -1;
  let lastSeekTs = 0;
  let lastSameLineNudgeTs = 0;
  let lastMoveAt = 0;
  let lastIngestAt = 0;
  let lastCommitAt = sessionStartAt;
  let commitCount = 0;
  let firstCommitIndex: number | null = null;
  let lastCommitIndex: number | null = null;
  let lastKnownScrollTop = 0;
  let summaryEmitted = false;
  let lastStallLogAt = 0;
  let lastForwardCommitAt = Date.now();
  let disposed = false;
  let desyncWarned = false;
  let resyncUntil = 0;
  let resyncAnchorIdx: number | null = null;
  let resyncReason: string | null = null;
  let resyncLookaheadBonus = DEFAULT_RESYNC_LOOKAHEAD_BONUS;
  let resyncBacktrackOverride = DEFAULT_MATCH_BACKTRACK_LINES;
  let matchAnchorIdx = -1;
  let targetTopPx: number | null = null;
  let appliedTopPx = 0;
  let velPxPerSec = 0;
  let lastTickAt = 0;
  let controllerActive = false;
  let lastEvidenceAt = 0;
  let lastBackRecoverAt = 0;
  let lastBackRecoverIdx = -1;
  let lastBackRecoverHitAt = 0;
  let backRecoverStreak = 0;
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
  let lastBehindRecoveryAt = 0;
  let lookaheadStepIndex = 0;
  let lastLookaheadBumpAt = 0;
  let behindHitCount = 0;
  let behindHitWindowStart = 0;
  let lagRelockHits = 0;
  let lagRelockWindowStart = 0;
  let pendingMatch: PendingMatch | null = null;
  let pendingRaf = 0;
  let bootLogged = false;
  let forcedCooldownUntil = 0;
  const forcedCommitTimes: number[] = [];
  let lastStuckDumpAt = 0;

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
  const backRecoverMaxPx = DEFAULT_BACK_RECOVERY_MAX_PX;
  const backRecoverCooldownMs = DEFAULT_BACK_RECOVERY_COOLDOWN_MS;
  const backRecoverHitLimit = DEFAULT_BACK_RECOVERY_HIT_LIMIT;
  const backRecoverWindowMs = DEFAULT_BACK_RECOVERY_WINDOW_MS;
  const backRecoverStrongConf = DEFAULT_BACK_RECOVERY_STRONG_CONF;
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
  let minTokenCount = DEFAULT_MIN_TOKEN_COUNT;
  let minEvidenceChars = DEFAULT_MIN_EVIDENCE_CHARS;
  let interimHysteresisBonus = DEFAULT_INTERIM_HYSTERESIS_BONUS;
  let interimStableRepeats = DEFAULT_INTERIM_STABLE_REPEATS;
  let bufferMs = 0;
  let allowShortEvidence = false;
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
  const evidenceEntries: EvidenceEntry[] = [];
  let evidenceText = '';
  let lastBufferChars = 0;
  const consistencyEntries: ConsistencyEntry[] = [];
  const lagSamples: LagSample[] = [];
  let catchUpModeUntil = 0;
  const eventRing: AsrEventSnapshot[] = [];
  const guardCounts = new Map<string, number>();

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

  try {
    const hasScript = !!(getScriptRoot() || document.querySelector('.line'));
    if (hasScript) ensureAsrTuningProfile('reading');
  } catch {}
  applyTuningProfile(getActiveAsrTuningProfile());

  const unsubscribe = speechStore.subscribe((state) => {
    if (disposed) return;
    if (typeof state.threshold === 'number') {
      threshold = clamp(state.threshold, 0, 1);
    }
  });

  const unsubscribeTuning = onAsrTuning(() => {
    applyTuningProfile(getActiveAsrTuningProfile());
  });

  const syncMatchAnchor = (idx: number) => {
    if (!Number.isFinite(idx)) return;
    const next = Math.max(0, Math.floor(idx));
    matchAnchorIdx = matchAnchorIdx >= 0 ? Math.max(matchAnchorIdx, next) : next;
    try { (window as any).currentIndex = matchAnchorIdx; } catch {}
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
        targetTopPx,
        appliedTopPx,
        lastMoveAt,
        tuningProfileId: activeTuningProfileId,
        bufferChars: evidenceText.length,
        bufferEntries: evidenceEntries.length,
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
    const ok =
      nearOk &&
      minDelta >= minLineAdvance &&
      maxDelta <= opts.maxDeltaLines &&
      spread <= opts.maxSpreadLines &&
      minSim >= opts.minSim;
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
    const forwardHits = window.filter((entry) => entry.delta >= DEFAULT_LAG_DELTA_LINES && entry.nearMarker);
    if (forwardHits.length < DEFAULT_LAG_MIN_FORWARD_HITS) return false;
    const hasConfident = forwardHits.some((entry) => entry.sim >= DEFAULT_CATCHUP_MODE_MIN_SIM);
    return hasConfident;
  };

  const activateCatchUpMode = (now: number, sample: LagSample) => {
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

  try { window.addEventListener('tp:asr:silence', silenceHandler as EventListener); } catch {}
  try { window.addEventListener('tp:script:reset', resetHandler as EventListener); } catch {}

  const summarizeGuardCounts = (limit = Number.POSITIVE_INFINITY) => {
    const entries = Array.from(guardCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
    return entries.slice(0, limit);
  };

  const getTotalLines = () => {
    try {
      const root = getScriptRoot() || getPrimaryScroller();
      const container = root || document;
      const lines = container?.querySelectorAll?.('.line');
      return lines ? lines.length : 0;
    } catch {
      return 0;
    }
  };

  const noteCommit = (prevIndex: number, nextIndex: number, now: number) => {
    commitCount += 1;
    if (firstCommitIndex == null && Number.isFinite(prevIndex)) {
      firstCommitIndex = Math.max(0, Math.floor(prevIndex));
    }
    if (Number.isFinite(nextIndex)) {
      lastCommitIndex = Math.max(0, Math.floor(nextIndex));
    }
    lastCommitAt = now;
  };

  const emitSummary = (source: string) => {
    if (summaryEmitted) return;
    summaryEmitted = true;
    const now = Date.now();
    const durationMs = Math.max(0, now - sessionStartAt);
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
      firstIndex,
      lastIndex,
      linesAdvanced,
      traversedPct: Number(traversedPct.toFixed(1)),
      guardCounts: guardMap,
      lastKnownScrollTop: Math.round(scrollTop || 0),
      scrollerId,
      source,
    };
    try { console.warn('ASR_SESSION_SUMMARY', summary); } catch {}
    try {
      window.dispatchEvent(new CustomEvent('tp:asr:summary', { detail: summary }));
    } catch {}
    const warnUnsafe = commitCount === 0 || traversedPct < 5;
    if (warnUnsafe) {
      try {
        (window as any).toast?.(
          'ASR did not advance the script (0 commits). This run is not production-safe.',
          { type: 'warning' },
        );
      } catch {}
    } else {
      try {
        (window as any).toast?.(
          `ASR session: ${commitCount} commits, ${linesAdvanced >= 0 ? '+' : ''}${linesAdvanced} lines (${summary.traversedPct}%)`,
          { type: 'info' },
        );
      } catch {}
    }
  };

  const summarizeGuardText = () => {
    const top = summarizeGuardCounts(4);
    if (!top.length) return 'none';
    return top.map((entry) => `${entry.reason}:${entry.count}`).join(', ');
  };

  const maybeLogStall = (now: number) => {
    if (now - lastCommitAt < DEFAULT_STALL_COMMIT_MS) return;
    if (now - lastStallLogAt < DEFAULT_STALL_LOG_COOLDOWN_MS) return;
    lastStallLogAt = now;
    const reasonSummary = summarizeGuardText();
    try {
      console.warn('[ASR_STALLED] no commits in 15s', {
        sinceMs: Math.round(now - lastCommitAt),
        commitCount,
        lastLineIndex,
        reasonSummary,
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
    if (!controllerActive || disposed) return;
    const scroller = getScroller();
    if (!scroller) {
      controllerActive = false;
      return;
    }

    const now = performance.now();
    const dt = Math.max(0.001, (now - (lastTickAt || now)) / 1000);
    lastTickAt = now;

    const current = scroller.scrollTop || 0;
    appliedTopPx = current;
    if (targetTopPx == null) {
      velPxPerSec = 0;
      controllerActive = false;
      return;
    }

    if (targetTopPx < current) {
      targetTopPx = current;
    }

    const err = targetTopPx - current;
    if (err <= deadbandPx) {
      velPxPerSec = 0;
      window.requestAnimationFrame(tickController);
      return;
    }

    const maxVelForErr = resolveMaxVel(err);
    if (velPxPerSec > maxVelForErr) {
      velPxPerSec = maxVelForErr;
    }
    velPxPerSec = Math.min(maxVelForErr, velPxPerSec + maxAccelPxPerSec2 * dt);
    let move = velPxPerSec * dt;
    move = Math.max(minStepPx, move);
    move = Math.min(err, move, maxStepPx);

    if (move > 0) {
      const applied = applyCanonicalScrollTop(current + move, { scroller, reason: 'asr-tick' });
      appliedTopPx = applied;
      lastKnownScrollTop = applied;
      lastMoveAt = Date.now();
    }
    window.requestAnimationFrame(tickController);
  };

  const ensureControllerActive = () => {
    if (controllerActive) return;
    controllerActive = true;
    lastTickAt = performance.now();
    window.requestAnimationFrame(tickController);
  };

  const schedulePending = () => {
    if (pendingRaf) return;
    pendingRaf = window.requestAnimationFrame(() => {
      pendingRaf = 0;
      if (disposed) return;
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
      } = pending;
      const requiredThreshold = clamp(isFinal ? threshold : threshold * interimScale, 0, 1);
      const effectiveThreshold = Number.isFinite(minThreshold)
        ? clamp(minThreshold as number, 0, 1)
        : requiredThreshold;
      const strongMatch = conf >= effectiveThreshold;
      if (!strongMatch) {
        warnGuard('low_sim', [
          `current=${lastLineIndex}`,
          `best=${line}`,
          `delta=${line - lastLineIndex}`,
          `sim=${formatLogScore(conf)}`,
          `need=${formatLogScore(effectiveThreshold)}`,
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
          `Blocked: low confidence (sim=${formatLogScore(conf)} < ${formatLogScore(effectiveThreshold)})`,
        );
        return;
      }

      let targetLine = Math.max(0, Math.floor(line));
      let targetTop = resolveTargetTop(scroller, targetLine);
      const currentTop = scroller.scrollTop || 0;
      let deltaPx = targetTop != null ? targetTop - currentTop : 0;

      if (targetTop == null) {
        warnGuard('no_target', [
          `current=${lastLineIndex}`,
          `best=${targetLine}`,
          `delta=${targetLine - lastLineIndex}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
        return;
      }

      if (targetLine <= lastLineIndex) {
        if (targetLine === lastLineIndex) {
          if (isFinal && hasEvidence && strongMatch && deltaPx > 0 && deltaPx <= creepNearPx) {
            const nextLine = targetLine + 1;
            const nextTop = resolveTargetTop(scroller, nextLine);
            if (nextTop != null) {
              const nextDeltaPx = nextTop - currentTop;
              if (nextDeltaPx > 0 && nextDeltaPx <= jumpCap) {
                targetLine = nextLine;
                targetTop = nextTop;
                deltaPx = nextDeltaPx;
                logDev('same-line advance', { line: targetLine, px: Math.round(nextDeltaPx), conf });
              }
            }
          }
        }
      }
      if (targetLine <= lastLineIndex) {
        if (targetLine === lastLineIndex) {
          if (deltaPx < 0) {
            warnGuard('same_line_noop', [
              `current=${lastLineIndex}`,
              `best=${targetLine}`,
              `deltaPx=${Math.round(deltaPx)}`,
              `nearPx=${creepNearPx}`,
              snippet ? `clue="${snippet}"` : '',
            ]);
            return;
          }
          if (now - lastSameLineNudgeTs < sameLineThrottleMs) {
            warnGuard('same_line_throttle', [
              `line=${targetLine}`,
              `since=${now - lastSameLineNudgeTs}`,
              `throttle=${sameLineThrottleMs}`,
            ]);
            return;
          }
          if (deltaPx > creepNearPx) {
            const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
            const base = targetTopPx == null ? currentTop : targetTopPx;
            const desired = clamp(targetTop, 0, max);
            const limitedTarget = Math.min(desired, base + jumpCap);
            if (limitedTarget > base) {
              targetTopPx = limitedTarget;
              lastSameLineNudgeTs = now;
              lastEvidenceAt = now;
              ensureControllerActive();
              logDev('same-line recenter', { line: targetLine, px: Math.round(limitedTarget - base), conf });
              updateDebugState('same-line-recenter');
              return;
            }
            warnGuard('same_line_noop', [
              `current=${lastLineIndex}`,
              `best=${targetLine}`,
              `deltaPx=${Math.round(deltaPx)}`,
              `nearPx=${creepNearPx}`,
              snippet ? `clue="${snippet}"` : '',
            ]);
            return;
          }
          if (now - lastSameLineNudgeTs >= sameLineThrottleMs) {
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
            const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
            const base = targetTopPx == null ? currentTop : targetTopPx;
            const creepStep = Math.min(creepPx, creepBudgetPx - creepBudgetUsed);
            const creepTarget = clamp(base + creepStep, 0, max);
            const limitedTarget = Math.min(creepTarget, base + jumpCap);
            if (limitedTarget > base) {
              targetTopPx = limitedTarget;
              lastSameLineNudgeTs = now;
              lastEvidenceAt = now;
              creepBudgetUsed += Math.max(0, limitedTarget - base);
              ensureControllerActive();
              logDev('same-line creep', { line: targetLine, px: creepStep, conf });
              updateDebugState('same-line-creep');
            }
          }
          return;
        }

        const strongBack = conf >= Math.max(backRecoverStrongConf, requiredThreshold);
        if (isFinal && strongBack && deltaPx < 0 && Math.abs(deltaPx) <= backRecoverMaxPx) {
          if (Math.abs(targetLine - lastBackRecoverIdx) <= 1 && now - lastBackRecoverHitAt <= backRecoverWindowMs) {
            backRecoverStreak += 1;
          } else {
            backRecoverStreak = 1;
          }
          lastBackRecoverIdx = targetLine;
          lastBackRecoverHitAt = now;
          if (backRecoverStreak >= backRecoverHitLimit && now - lastBackRecoverAt >= backRecoverCooldownMs) {
            const applied = applyCanonicalScrollTop(currentTop + deltaPx, {
              scroller,
              reason: 'asr-back-recovery',
            });
            lastKnownScrollTop = applied;
            lastMoveAt = Date.now();
            lastBackRecoverAt = now;
            backRecoverStreak = 0;
            logDev('back-recovery nudge', { px: deltaPx, conf, line: targetLine });
            updateDebugState('back-recovery');
          }
        } else {
          backRecoverStreak = 0;
        }
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

      const prevLineIndex = lastLineIndex;
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const base = targetTopPx == null ? currentTop : targetTopPx;
      const candidate = clamp(targetTop, 0, max);
      const limitedTarget = forced ? candidate : Math.min(candidate, base + jumpCap);
      targetTopPx = Math.max(base, limitedTarget);
      lastLineIndex = Math.max(lastLineIndex, targetLine);
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
      noteCommit(prevLineIndex, targetLine, now);
      try { (window as any).currentIndex = lastLineIndex; } catch {}
      logThrottled('ASR_COMMIT', 'log', 'ASR_COMMIT', {
        prevIndex: prevLineIndex,
        nextIndex: targetLine,
        delta: targetLine - prevLineIndex,
        sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : conf,
        scrollTopBefore: Math.round(currentTop),
        scrollTopAfter: Math.round(targetTopPx ?? currentTop),
        forced: !!forced,
        mode: getScrollMode() || 'unknown',
        relock: !!relockOverride,
        relockReason: relockReason || undefined,
      });
      ensureControllerActive();
      try {
        const forcedCount = getForcedCount(now);
        const forcedCooldown = getForcedCooldownRemaining(now);
        const markerIdx = computeMarkerLineIndex(scroller);
        const currentEl = getLineElementByIndex(scroller, prevLineIndex);
        const bestEl = getLineElementByIndex(scroller, targetLine);
        const markerEl = getLineElementByIndex(scroller, markerIdx);
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
          `marker=${markerIdx}`,
          `scrollTop=${Math.round(scroller.scrollTop || 0)}`,
          `lineH=${lineHeight}`,
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
          markerText ? `markerText="${markerText}"` : '',
          snippet ? `clue="${snippet}"` : '',
        ].filter(Boolean).join(' ');
        console.log(commitLine);
      } catch {}
      if (forced && forceReason === 'catchup') {
        emitHudStatus('catchup_commit', `Catch-up commit +${targetLine - prevLineIndex}`);
      }
      clearEvidenceBuffer('commit');
      logDev('target update', { line: targetLine, conf, pxDelta: deltaPx, targetTop: targetTopPx });
      updateDebugState('target-update');
    });
  };

  const ingest = (text: string, isFinal: boolean) => {
    if (disposed) return;
    const normalized = String(text || '').trim();
    if (!normalized) return;
    const compacted = normalized.replace(/\s+/g, ' ').trim();
    const now = Date.now();
    const prevBufferChars = lastBufferChars;
    const bufferedText = updateEvidenceBuffer(compacted, isFinal, now);
    const bufferGrowing = bufferMs > 0 && bufferedText.length > prevBufferChars;
    const snippet = formatLogSnippet(bufferedText, 60);
    const fragmentTokenCount = normTokens(compacted).length;
    const tokenCount = normTokens(bufferedText).length;
    const evidenceChars = bufferedText.length;
    if (!bootLogged) {
      bootLogged = true;
      try {
        const viewer = getScroller();
        const root = getScriptRoot() || viewer;
        const scroller = resolveActiveScroller(viewer, root || getFallbackScroller());
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
    if (now - lastForwardCommitAt >= DEFAULT_FORWARD_PROGRESS_WINDOW_MS && now - lastStuckDumpAt >= DEFAULT_FORWARD_PROGRESS_WINDOW_MS) {
      lastStuckDumpAt = now;
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

    const anchorIdx = matchAnchorIdx >= 0
      ? matchAnchorIdx
      : (lastLineIndex >= 0 ? lastLineIndex : Number((window as any)?.currentIndex ?? 0));
    const resyncActive = now < resyncUntil && Number.isFinite(resyncAnchorIdx ?? NaN);
    const lagRelockActive = resyncActive && resyncReason === 'lag';
    const effectiveAnchor = resyncActive
      ? Math.max(0, Math.floor(resyncAnchorIdx as number))
      : Math.max(0, Math.floor(anchorIdx));
    try { (window as any).currentIndex = effectiveAnchor; } catch {}

    const windowBack = resyncActive ? resyncBacktrackOverride : matchBacktrackLines;
    const windowAhead = resolveLookahead(resyncActive);
    const match = matchBatch(bufferedText, !!isFinal, {
      currentIndex: effectiveAnchor,
      windowBack,
      windowAhead,
      minTokenOverlap: lagRelockActive ? DEFAULT_LAG_RELOCK_MIN_OVERLAP : undefined,
      minTokenLen: lagRelockActive ? DEFAULT_LAG_RELOCK_MIN_TOKEN_LEN : undefined,
      multiLineMinLines: lagRelockActive ? DEFAULT_LAG_RELOCK_MULTI_MIN_LINES : undefined,
      multiLineMaxLines: lagRelockActive ? DEFAULT_LAG_RELOCK_MULTI_MAX_LINES : undefined,
    });
    if (!match) {
      warnGuard('no_match', [
        `current=${effectiveAnchor}`,
        `final=${isFinal ? 1 : 0}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
      return;
    }
    let rawIdx = Number(match.bestIdx);
    let conf = Number.isFinite(match.bestSim) ? match.bestSim : 0;
    const baseThreshold = isFinal ? threshold : threshold * interimScale;
    const shortBoost = tokenCount <= shortTokenMax ? shortTokenBoost : 0;
    const requiredThreshold = clamp(baseThreshold + shortBoost, 0, 1);
    const interimHighThreshold = clamp(baseThreshold + shortBoost + interimHysteresisBonus, 0, 1);
    const consistencyMinSim = clamp(requiredThreshold - consistencySimSlack, 0, 1);
    const catchupMinSim = clamp(requiredThreshold - catchupSimSlack, 0, 1);
    const currentIdxRaw = Number((window as any)?.currentIndex ?? -1);
    const currentIdx = Number.isFinite(currentIdxRaw) ? currentIdxRaw : -1;
    if (!Number.isFinite(rawIdx)) {
      warnGuard('invalid_match', [
        `current=${currentIdx}`,
        `final=${isFinal ? 1 : 0}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
      return;
    }
    if (rawIdx < 0) {
      warnGuard('no_match', [
        `current=${currentIdx}`,
        `final=${isFinal ? 1 : 0}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
      emitHudStatus('no_match', 'No match');
      return;
    }

    const cursorLine = lastLineIndex >= 0 ? lastLineIndex : effectiveAnchor;
    const totalLines = getTotalLines();
    const bandStart = Number.isFinite((match as any)?.bandStart)
      ? Math.max(0, Math.floor((match as any).bandStart))
      : Math.max(0, cursorLine - windowBack);
    const bandEnd = Number.isFinite((match as any)?.bandEnd)
      ? Math.max(bandStart, Math.floor((match as any).bandEnd))
      : (totalLines > 0
        ? Math.min(totalLines - 1, cursorLine + windowAhead)
        : cursorLine + windowAhead);
    const inBand = rawIdx >= bandStart && rawIdx <= bandEnd;
    if (!inBand) {
      warnGuard('match_out_of_band', [
        `current=${cursorLine}`,
        `best=${rawIdx}`,
        `delta=${rawIdx - cursorLine}`,
        `bandStart=${bandStart}`,
        `bandEnd=${bandEnd}`,
        `inBand=${inBand ? 1 : 0}`,
      ]);
      emitHudStatus('match_out_of_band', 'Out-of-band match ignored');
      resetLagRelock('out-of-band');
      return;
    }
    const rawBestSim = conf;
    const rawScores = Array.isArray(match.topScores) ? match.topScores : [];
    const rawScoreByIdx = new Map<number, number>();
    rawScores.forEach((entry) => {
      const idx = Number(entry.idx);
      const score = Number(entry.score);
      if (Number.isFinite(idx) && Number.isFinite(score)) {
        rawScoreByIdx.set(idx, score);
      }
    });
    let topScores = rawScores;
    if (rawScores.length) {
      const penalized = rawScores
        .map((entry) => {
          const idx = Number(entry.idx);
          const score = Number(entry.score);
          if (!Number.isFinite(idx) || !Number.isFinite(score)) return null;
          const dist = Math.abs(idx - cursorLine);
          return { idx, score: applyDistancePenalty(score, dist, DEFAULT_DISTANCE_PENALTY_PER_LINE) };
        })
        .filter(Boolean) as Array<{ idx: number; score: number }>;
      penalized.sort((a, b) => b.score - a.score || a.idx - b.idx);
      const best = penalized[0];
      if (best) {
        rawIdx = best.idx;
        conf = best.score;
      }
      topScores = penalized;
    } else {
      const dist = Math.abs(rawIdx - cursorLine);
      conf = applyDistancePenalty(conf, dist, DEFAULT_DISTANCE_PENALTY_PER_LINE);
    }
    const bestSpan = Number((match as any)?.bestSpan);
    const bestOverlap = Number((match as any)?.bestOverlap);
    const bestOverlapRatio = Number((match as any)?.bestOverlapRatio);
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
    const scrollerForMatch = getScroller();
    const scrollTopForMatch = scrollerForMatch?.scrollTop ?? 0;
    const catchUpModeWasActive = catchUpModeUntil > now;
    const lowSimFloor = lagRelockActive ? DEFAULT_LAG_RELOCK_LOW_SIM_FLOOR : DEFAULT_LOW_SIM_FLOOR;
    const behindByLowSim =
      rawIdx < cursorLine - windowBack ||
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
    resetLagRelock('in-band');
    logThrottled('ASR_MATCH', 'log', 'ASR_MATCH', {
      currentIndex: cursorLine,
      bestIndex: rawIdx,
      delta: rawIdx - cursorLine,
      sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : conf,
      scrollTop: Math.round(scrollTopForMatch),
      winBack: windowBack,
      winAhead: windowAhead,
      final: isFinal ? 1 : 0,
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
    const outrunMax = cursorLine + Math.max(1, outrunLookaheadLines);
    const forwardBandScores = topScores.length
      ? topScores
        .map((entry) => ({ idx: Number(entry.idx), score: Number(entry.score) }))
        .filter((entry) => Number.isFinite(entry.idx) && Number.isFinite(entry.score))
        .filter((entry) => entry.idx > cursorLine && entry.idx <= outrunMax)
      : [];
    const outrunCandidate = forwardBandScores
      .sort((a, b) => b.score - a.score || a.idx - b.idx)[0] || null;
    const bestForwardSim = outrunCandidate ? outrunCandidate.score : 0;
    const outrunPick = outrunCandidate;
    const outrunFloor = shortFinalRecent ? shortFinalNeed : outrunRelaxedSim;
    const forwardCandidateOk = !!outrunCandidate && bestForwardSim >= outrunFloor;
    const forcedEvidenceOk =
      (tokenCount >= forcedMinTokens || evidenceChars >= forcedMinChars) && forwardCandidateOk;
    const outrunEligible = !!outrunPick && outrunRecent && forcedEvidenceOk;
    const behindByForBias = cursorLine - rawIdx;
    const forwardBiasEligible =
      isFinal &&
      behindByForBias > 0 &&
      behindByForBias <= forwardBiasRecentLines &&
      lastLineIndex >= 0 &&
      now - lastForwardCommitAt <= forwardBiasWindowMs;
    if (topScores.length) {
      const bestScore = conf;
      const tieCandidates = topScores
        .map((entry) => ({ idx: Number(entry.idx), score: Number(entry.score) }))
        .filter((entry) => Number.isFinite(entry.idx) && Number.isFinite(entry.score))
        .filter((entry) => entry.score >= bestScore - forwardTieEps);
      const hasTie = tieCandidates.length >= 2;
      const forwardCandidates = tieCandidates
        .filter((entry) => entry.idx >= cursorLine)
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
        return;
      }
      if (hasTie && !forwardPick && !forwardBiasEligible && !shortFinalRecent && !outrunEligible) {
        warnGuard('tie_forward', [
          `current=${cursorLine}`,
          `best=${rawIdx}`,
          `sim=${formatLogScore(bestScore)}`,
          `need=${formatLogScore(requiredThreshold)}`,
          `eps=${forwardTieEps}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
        return;
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
    if (shortFinalRecent && rawIdx >= cursorLine) {
      const forwardBand = rawIdx - cursorLine <= shortFinalLookaheadLines;
      if (forwardBand && shortFinalNeed < effectiveThreshold) {
        effectiveThreshold = shortFinalNeed;
        logDev('short-final threshold', { cursorLine, best: rawIdx, need: effectiveThreshold, sim: conf });
      }
    }
    let outrunCommit = false;
    let forceReason: string | undefined;
    let relockOverride = false;
    let relockReason: string | undefined;
    const allowForced = !isHybridMode();
    if (allowForced && outrunRecent && (rawIdx <= cursorLine || conf < effectiveThreshold)) {
      if (!outrunPick) {
        logForcedDeny('evidence', [
          `tokens=${tokenCount}`,
          `chars=${evidenceChars}`,
          `bestForwardSim=${formatLogScore(bestForwardSim)}`,
          `floor=${formatLogScore(outrunFloor)}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
      } else if (!forcedEvidenceOk) {
        logForcedDeny('evidence', [
          `tokens=${tokenCount}`,
          `chars=${evidenceChars}`,
          `bestForwardSim=${formatLogScore(bestForwardSim)}`,
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
            rawIdx = outrunPick.idx;
            conf = outrunPick.score;
            effectiveThreshold = Math.min(effectiveThreshold, outrunNeed);
            outrunCommit = true;
            forceReason = 'outrun';
            warnGuard('forward_outrun', [
              `current=${cursorLine}`,
              `best=${before}`,
              `forward=${rawIdx}`,
              `sim=${formatLogScore(conf)}`,
              `need=${formatLogScore(effectiveThreshold)}`,
              `delta=${rawIdx - cursorLine}`,
              snippet ? `clue="${snippet}"` : '',
            ]);
            logDev('forward outrun', { cursorLine, best: before, forward: rawIdx, sim: conf, need: effectiveThreshold });
          }
        }
      }
    }
    const shortFinalForcedCandidate =
      shortFinalRecent &&
      rawIdx > cursorLine &&
      shortFinalNeed < requiredThreshold &&
      conf >= shortFinalNeed &&
      conf < requiredThreshold;
    let shortFinalForced = false;
    if (allowForced && shortFinalForcedCandidate && !outrunCommit) {
      const forwardCandidate = outrunCandidate;
      const forcedDelta = forwardCandidate ? forwardCandidate.idx - cursorLine : rawIdx - cursorLine;
      const cooldownRemaining = getForcedCooldownRemaining(now);
      if (!forcedEvidenceOk) {
        logForcedDeny('evidence', [
          `tokens=${tokenCount}`,
          `chars=${evidenceChars}`,
          `bestForwardSim=${formatLogScore(bestForwardSim)}`,
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
          if (forwardCandidate.idx !== rawIdx || forwardCandidate.score !== conf) {
            rawIdx = forwardCandidate.idx;
            conf = forwardCandidate.score;
          }
          effectiveThreshold = Math.min(effectiveThreshold, shortFinalNeed);
          shortFinalForced = true;
          forceReason = forceReason || 'short-final';
        }
      }
    }
    if (forwardBiasEligible && rawIdx < cursorLine && topScores.length) {
      const behindBy = cursorLine - rawIdx;
      const biasThreshold = clamp(requiredThreshold - forwardBiasSimSlack, 0, 1);
      const forwardNeed = shortFinalRecent ? Math.min(biasThreshold, shortFinalNeed) : biasThreshold;
      const forwardMax = cursorLine + Math.max(1, forwardBiasLookaheadLines);
      const forwardPick = topScores
        .map((entry) => ({ idx: Number(entry.idx), score: Number(entry.score) }))
        .filter((entry) => Number.isFinite(entry.idx) && Number.isFinite(entry.score))
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
    const markerIdx = consistencyRequireNearMarker ? computeMarkerLineIndex(scrollerForMatch) : -1;
    const nearMarker = consistencyRequireNearMarker
      ? Math.abs(rawIdx - markerIdx) <= Math.max(1, consistencyMarkerBandLines)
      : true;
    if (allowCatchup) {
      const lagSample: LagSample = {
        ts: now,
        delta: rawIdx - cursorLine,
        sim: conf,
        nearMarker,
      };
      recordLagSample(lagSample);
      if (shouldTriggerCatchUp()) {
        activateCatchUpMode(now, lagSample);
      }
    }
    const catchUpModeActive = catchUpModeUntil > now;
    const stuckResyncActive = resyncActive && resyncReason === 'stuck';
    const relockModeActive = lagRelockActive || catchUpModeActive || stuckResyncActive;
    const relockForward = relockModeActive && inBand && rawIdx >= cursorLine + minLineAdvance;
    if (relockForward) {
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
    recordConsistencyEntry({
      ts: now,
      idx: rawIdx,
      delta: rawIdx - cursorLine,
      sim: conf,
      nearMarker,
      isFinal,
    });
    const genericCandidateCount = topScores.length
      ? topScores.filter((entry) => Number(entry.score) >= conf - DEFAULT_GENERIC_SIM_DELTA).length
      : 0;
    const genericTranscript =
      tokenCount > 0 &&
      tokenCount <= DEFAULT_GENERIC_MAX_TOKENS &&
      genericCandidateCount >= DEFAULT_GENERIC_MIN_CANDIDATES;
    let effectiveConsistencyCount = consistencyCount + (genericTranscript ? 1 : 0);
    if (catchUpModeActive && effectiveConsistencyCount > 0) {
      effectiveConsistencyCount = Math.max(1, effectiveConsistencyCount - 1);
    }
    const catchupMaxDeltaLinesEffective = catchUpModeActive
      ? Math.max(catchupMaxDeltaLines, DEFAULT_CATCHUP_MODE_MAX_JUMP)
      : catchupMaxDeltaLines;
    const catchupMinSimEffective = catchUpModeActive
      ? Math.max(catchupMinSim, DEFAULT_CATCHUP_MODE_MIN_SIM)
      : catchupMinSim;
    const consistencyState = allowShortEvidence
      ? evaluateConsistency(now, {
        requiredCount: effectiveConsistencyCount,
        minSim: consistencyMinSim,
        maxDeltaLines: consistencyMaxDeltaLines,
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
          }
        }
      }
    }
    let interimEligible = true;
    if (!isFinal) {
      if (!allowInterimCommit) {
        interimEligible = false;
      } else if (conf < interimHighThreshold && !(consistencyState.ok || catchupState.ok)) {
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
    });
    if (topScores.length >= 2) {
      let near: { idx: number; score: number; dist: number } | null = null;
      let far: { idx: number; score: number; dist: number } | null = null;
      for (const entry of topScores) {
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

    const behindBy = cursorLine - rawIdx;
    if (behindBy > 0) {
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
          const applied = applyCanonicalScrollTop(targetTop, {
            scroller,
            reason: 'asr-behind-reanchor',
          });
          lastKnownScrollTop = applied;
          lastMoveAt = Date.now();
        }
        lastLineIndex = Math.max(0, Math.floor(rawIdx));
        matchAnchorIdx = lastLineIndex;
        lastForwardCommitAt = now;
        lastSeekTs = now;
        lastEvidenceAt = now;
        noteCommit(cursorLine, lastLineIndex, now);
        behindStrongSince = 0;
        behindStrongCount = 0;
        lastBehindRecoveryAt = now;
        resetLookahead('behind-reanchor');
        try { (window as any).currentIndex = lastLineIndex; } catch {}
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

    const overlapOk = Number.isFinite(bestOverlapRatio) && bestOverlapRatio >= DEFAULT_RELOCK_OVERLAP_RATIO;
    const spanOk = Number.isFinite(bestSpan) && bestSpan >= DEFAULT_RELOCK_SPAN_MIN_LINES;
    const repeatOk = relockRepeatCount >= DEFAULT_RELOCK_REPEAT_MIN;
    const finalOk = isFinal && rawIdx > cursorLine;
    const relockEvidenceOk = relockForward && (overlapOk || spanOk || repeatOk || finalOk);
    if (relockEvidenceOk && conf < effectiveThreshold && conf >= DEFAULT_RELOCK_SIM_FLOOR) {
      effectiveThreshold = Math.min(effectiveThreshold, DEFAULT_RELOCK_SIM_FLOOR);
      relockOverride = true;
      relockReason = overlapOk ? 'overlap' : spanOk ? 'span' : repeatOk ? 'repeat' : 'final';
      emitHudStatus(
        'relock_override',
        `Relock override: ${relockReason} (sim=${formatLogScore(conf)} >= ${formatLogScore(DEFAULT_RELOCK_SIM_FLOOR)})`,
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
    if (effectiveThreshold > 0 && conf < effectiveThreshold) {
      warnGuard('low_sim', [
        `current=${cursorLine}`,
        `best=${rawIdx}`,
        `delta=${rawIdx - cursorLine}`,
        `sim=${formatLogScore(conf)}`,
        `need=${formatLogScore(effectiveThreshold)}`,
        relockModeActive ? 'relock=1' : '',
        relockReason ? `relockReason=${relockReason}` : '',
        Number.isFinite(bestSpan) ? `span=${bestSpan}` : '',
        Number.isFinite(bestOverlapRatio) ? `overlap=${formatLogScore(bestOverlapRatio)}` : '',
        relockRepeatCount ? `repeat=${relockRepeatCount}` : '',
        snippet ? `clue="${snippet}"` : '',
      ]);
      emitHudStatus(
        'low_sim_ingest',
        `Blocked: low confidence (sim=${formatLogScore(conf)} < ${formatLogScore(effectiveThreshold)})`,
      );
      return;
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

    strongHits.push({ ts: now, idx: rawIdx, conf, isFinal });
    while (strongHits.length && strongHits[0].ts < now - strongWindowMs) {
      strongHits.shift();
    }
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
    const hasEvidence = outrunCommit || catchupCommit
      ? true
      : (isFinal
        ? (hasPairEvidence || consistencyOk || rawIdx >= cursorLine + finalEvidenceLeadLines)
        : ((hasPairEvidence || consistencyOk) && interimEligible));
    pendingMatch = {
      line: Math.max(0, Math.floor(rawIdx)),
      conf,
      isFinal,
      hasEvidence,
      snippet,
      minThreshold: effectiveThreshold < requiredThreshold ? effectiveThreshold : undefined,
      forced: outrunCommit || shortFinalForced || catchupCommit,
      forceReason,
      consistency: { count: consistencyState.count, needed: consistencyState.needed },
      relockOverride,
      relockReason,
      relockSpan: Number.isFinite(bestSpan) ? bestSpan : undefined,
      relockOverlapRatio: Number.isFinite(bestOverlapRatio) ? bestOverlapRatio : undefined,
      relockRepeat: relockRepeatCount || undefined,
    };
    schedulePending();
  };

  const dispose = () => {
    if (disposed) return;
    emitSummary('dispose');
    disposed = true;
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
    if (activeGuardCounts === guardCounts) {
      activeGuardCounts = null;
    }
  };

  const setLastLineIndex = (index: number) => {
    if (!Number.isFinite(index)) return;
    lastLineIndex = Math.max(0, Math.floor(index));
    lastSeekTs = 0;
    lastSameLineNudgeTs = 0;
    lastMoveAt = 0;
    lastIngestAt = 0;
    lastCommitAt = Date.now();
    lastStallLogAt = 0;
    matchAnchorIdx = lastLineIndex;
    targetTopPx = null;
    velPxPerSec = 0;
    controllerActive = false;
    lastEvidenceAt = 0;
    lastBackRecoverAt = 0;
    lastBackRecoverIdx = -1;
    lastBackRecoverHitAt = 0;
    backRecoverStreak = 0;
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
    resetResyncOverrides();
    lastBehindStrongIdx = -1;
    lastBehindStrongAt = 0;
    behindStrongSince = 0;
    behindStrongCount = 0;
    lastBehindRecoveryAt = 0;
    lagRelockHits = 0;
    lagRelockWindowStart = 0;
    lastForwardCommitAt = Date.now();
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
    try { (window as any).currentIndex = lastLineIndex; } catch {}
    updateDebugState('sync-index');
  };
  const getLastLineIndex = () => lastLineIndex;

  return { ingest, dispose, setLastLineIndex, getLastLineIndex };
}
