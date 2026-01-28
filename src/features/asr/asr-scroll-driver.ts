import { matchBatch as computeMatchBatch, normTokens, type MatchResult } from '../../speech/matcher';
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
import { shouldLogScrollWrite } from '../../scroll/scroll-helpers';
import { getAsrDriverThresholds, setAsrDriverThresholds } from '../../asr/asr-threshold-store';

// ASR Training rule: matching should be permissive; committing should be conservative.

type DriverOptions = {
  /** Minimum forward line delta before issuing a seek. */
  minLineAdvance?: number;
  /** Minimum milliseconds between seeks (throttle) */
  seekThrottleMs?: number;
  /** Scale applied to the confidence threshold when processing interim results (values >1 tighten). */
  interimConfidenceScale?: number;
};

type TranscriptDetail = {
  matchId?: string | null;
  match?: MatchResult;
  source?: string;
  meta?: boolean;
  noMatch?: boolean;
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

export interface AsrScrollDriver {
  ingest(text: string, isFinal: boolean, detail?: TranscriptDetail): void;
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
const DEFAULT_MATCH_TOKEN_WINDOW = 18;
const DEFAULT_LOOKAHEAD_BUMP_COOLDOWN_MS = 2000;
const DEFAULT_LOOKAHEAD_BEHIND_HITS = 2;
const DEFAULT_LOOKAHEAD_BEHIND_WINDOW_MS = 1800;
const DEFAULT_LOOKAHEAD_STALL_MS = 2500;
const DEFAULT_SAME_LINE_THROTTLE_MS = 300;
const DEFAULT_CREEP_PX = 8;
const DEFAULT_CREEP_NEAR_PX = 12;
const DEFAULT_CREEP_BUDGET_PX = 40;
const DEFAULT_DEADBAND_PX = 32;
const DEFAULT_MAX_VEL_PX_PER_SEC = 470;
const DEFAULT_MAX_VEL_MED_PX_PER_SEC = 170;
const DEFAULT_MAX_VEL_CATCHUP_PX_PER_SEC = 240;
const DEFAULT_MAX_ACCEL_PX_PER_SEC2 = 800;
const DEFAULT_MIN_STEP_PX = 6;
const DEFAULT_MAX_STEP_PX = 10;
const DEFAULT_CATCHUP_MED_MIN_PX = 80;
const DEFAULT_CATCHUP_FAST_MIN_PX = 250;
const DEFAULT_MAX_TARGET_JUMP_PX = 120;
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
const DEFAULT_BACK_RECOVERY_MAX_PX = 15;
const DEFAULT_BACK_RECOVERY_COOLDOWN_MS = 5000;
const DEFAULT_BACK_RECOVERY_HIT_LIMIT = 2;
const DEFAULT_BACK_RECOVERY_WINDOW_MS = 1200;
const DEFAULT_BACK_RECOVERY_STRONG_CONF = 0.75;
const MARKER_BIAS_PX = 6;
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
const DEFAULT_OUTRUN_RELAXED_SIM = 0.5;
const DEFAULT_OUTRUN_WINDOW_MS = DEFAULT_FORWARD_PROGRESS_WINDOW_MS;
const DEFAULT_OUTRUN_LOOKAHEAD_LINES = 6;
const DEFAULT_FORCED_RATE_WINDOW_MS = 10000;
const DEFAULT_FORCED_RATE_MAX = 2;
const DEFAULT_FORCED_COOLDOWN_MS = 5000;
const DEFAULT_FORCED_MIN_TOKENS = 4;
const DEFAULT_FORCED_MIN_CHARS = 24;
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
const DEFAULT_STALL_COMMIT_MS = 15000;
const DEFAULT_STALL_LOG_COOLDOWN_MS = 4000;
const DEFAULT_LOW_SIM_FLOOR = 0.35;
const DEFAULT_BEHIND_NOISE_MIN_SIM = 0.15;
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
const DEFAULT_CATCHUP_MODE_MIN_SIM = 0.55;
const DEFAULT_CATCHUP_MODE_DURATION_MS = 2500;
const DEFAULT_CATCHUP_LOOKAHEAD_BONUS = 120;
const POST_CATCHUP_MS = 2200;
const POST_CATCHUP_DROP = 0.05;
const POST_CATCHUP_MAX_DELTA = 24;
const POST_CATCHUP_REQUIRE_IN_BAND = true;
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
const HUD_PURSUE_THROTTLE_MS = 200;
let lastPursueHudAt = 0;

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

function getScroller(): HTMLElement | null {
  const primary = getPrimaryScroller();
  const root = getScriptRoot();
  const fallback = root || getFallbackScroller();
  return resolveActiveScroller(primary, fallback);
}

function getLineElementByIndex(scroller: HTMLElement | null, lineIndex: number): HTMLElement | null {
  if (!scroller) return null;
  const idx = Math.max(0, Math.floor(lineIndex));
  const selectors = [
    `.line[data-line="${idx}"]`,
    `.tp-line[data-line="${idx}"]`,
    `.line[data-line-idx="${idx}"]`,
    `.tp-line[data-line-idx="${idx}"]`,
  ];
  for (const selector of selectors) {
    const candidate = scroller.querySelector<HTMLElement>(selector);
    if (candidate) return candidate;
  }
  return null;
}

function computeLineTargetTop(scroller: HTMLElement | null, lineEl: HTMLElement | null): number | null {
  if (!scroller || !lineEl) return null;
  const offset = Math.max(0, (scroller.clientHeight - (lineEl.offsetHeight || lineEl.clientHeight || 0)) / 2);
  const raw = (lineEl.offsetTop || 0) - offset;
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
  setAsrDriverThresholds({ candidateMinSim: threshold });
  let lastLineIndex = -1;
  let postCatchupUntil = 0;
  let postCatchupSamplesLeft = 0;
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
  let lowSimStreak = 0;
  let lowSimFirstAt = 0;
  let lowSimFreezeLogged = false;
  let resyncUntil = 0;
  let resyncAnchorIdx: number | null = null;
  let resyncReason: string | null = null;
  let resyncLookaheadBonus = DEFAULT_RESYNC_LOOKAHEAD_BONUS;
  let resyncBacktrackOverride = DEFAULT_MATCH_BACKTRACK_LINES;
  let matchAnchorIdx = -1;
    let pursuitTargetTop: number | null = null;
    let appliedTopPx = 0;
    let pursuitVel = 0;
    let pursuitLastTs = 0;
    let pursuitActive = false;
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
    if (isHybridMode()) {
      logAsrScrollAttempt('denied', {
        targetTop,
        currentTop,
        reason: `${reason}:hybrid`,
        scroller,
        source,
        applied: false,
      });
      return currentTop;
    }
    const payload = { ...opts, scroller };
    const appliedTop = applyCanonicalScrollTop(targetTop, { ...payload, source });
    try {
      const afterTop = Number.isFinite(appliedTop) ? appliedTop : (scroller.scrollTop || 0);
      const delta = afterTop - currentTop;
      if (Math.abs(delta) >= 0.5) {
        window.dispatchEvent(new CustomEvent('tp:scroll:commit', {
          detail: {
            delta,
            targetTop: afterTop,
            currentTop,
            maxScrollTop: Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0)),
            source: 'asr',
          },
        }));
      }
    } catch {
      // ignore
    }
    scheduleAsrWriteCheck(scroller, currentTop, reason, targetTop, source);
    return appliedTop;
  }
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
  let behindDebt = 0;
  let behindDebtStreak = 0;
  let lastBehindRecoveryAt = 0;
  let lookaheadStepIndex = 0;
  let lastLookaheadBumpAt = 0;
  let behindHitCount = 0;
  let behindHitWindowStart = 0;
  let lagRelockHits = 0;
  let lagRelockWindowStart = 0;
    let pendingMatch: PendingMatch | null = null;
    let pendingSeq = 0;

    const adoptPendingMatch = (next: PendingMatch) => {
      pendingMatch = next;
      pendingSeq += 1;
      return pendingMatch;
    };
    let pendingRaf = 0;
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
    let lastScriptHash = '';
    let lastScriptChangeAt = 0;
    let lastScriptChangeHash = '';
    let scriptChangeHandler: ((event: Event) => void) | null = null;
    let missingMatchIdKeysLogged = false;
    let fallbackMatchIdSeq = 0;
    const armPostCatchupGrace = (reason: string) => {
      const now = Date.now();
      postCatchupUntil = now + POST_CATCHUP_MS;
      postCatchupSamplesLeft = POST_CATCHUP_SAMPLES;
      logDev('[ASR] post catchup armed', { reason, until: postCatchupUntil });
    };
    const isPostCatchupActive = (now: number) =>
      now < postCatchupUntil && postCatchupSamplesLeft > 0;

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
    lowSimFreezeLogged = false;
    strongHits.length = 0;
    pendingMatch = null;
    pendingSeq += 1;
    lastLineIndex = normalized;
    matchAnchorIdx = normalized;
    lastEvidenceAt = now;
    lastForwardCommitAt = now;
    lastCommitAt = now;
    lastSeekTs = now;
    lastMoveAt = now;
    lastIngestAt = now;
    resyncUntil = 0;
    resyncAnchorIdx = null;
    resyncReason = null;
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
    if (typeof state.threshold === 'number' && !isDevMode()) {
      threshold = clamp(state.threshold, 0, 1);
      setAsrDriverThresholds({ candidateMinSim: threshold });
    }
  });

  const unsubscribeTuning = onAsrTuning(() => {
    applyTuningProfile(getActiveAsrTuningProfile());
  });

  const syncMatchAnchor = (idx: number) => {
    if (!Number.isFinite(idx)) return;
    const next = Math.max(0, Math.floor(idx));
    matchAnchorIdx = matchAnchorIdx >= 0 ? Math.max(matchAnchorIdx, next) : next;
    setCurrentIndex(matchAnchorIdx, 'match-anchor');
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
    if (err <= deadbandPx) {
      const target = pursuitTargetTop;
      pursuitVel = 0;
      pursuitActive = false;
      pursuitTargetTop = null;
      emitPursuitHud(err, pursuitVel, target, current);
      return;
    }

    const maxVelForErr = resolveMaxVel(err);
    const desiredVel = Math.min(maxVelForErr, Math.max(0, err * DEFAULT_PURSUE_KP));
    const accelCap = maxAccelPxPerSec2 * dt;
    const velDelta = clamp(desiredVel - pursuitVel, -accelCap, accelCap);
    pursuitVel = clamp(pursuitVel + velDelta, 0, maxVelForErr);

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
    if (pursuitActive) return;
    pursuitActive = true;
    pursuitLastTs = performance.now();
    window.requestAnimationFrame(tickController);
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
      } = pending;
      const thresholds = getAsrDriverThresholds();
      const requiredThresholdValue =
        typeof pendingRequiredThreshold === 'number' ? pendingRequiredThreshold : NaN;
      const baselineRequired = Number.isFinite(requiredThresholdValue)
        ? clamp(requiredThresholdValue, 0, 1)
        : 0;
      const minThresholdValue = typeof minThreshold === 'number' ? minThreshold : NaN;
      const matchThreshold = Number.isFinite(minThresholdValue)
        ? clamp(minThresholdValue, 0, 1)
        : baselineRequired;
      const secondScore = topScores.length > 1 ? Number(topScores[1].score) : undefined;
      const tieMargin = typeof secondScore === 'number' && Number.isFinite(secondScore)
        ? conf - secondScore
        : typeof tieGap === 'number'
          ? tieGap
          : undefined;
      const tieOk = tieMargin === undefined || tieMargin >= thresholds.tieDelta;
      const strongMatch = conf >= matchThreshold && tieOk;
      if (!strongMatch) {
        const tieParts = !tieOk && typeof tieMargin === 'number'
          ? [`tie=${formatLogScore(tieMargin)}`, `tieNeed=${formatLogScore(thresholds.tieDelta)}`]
          : [];
        warnGuard('low_sim', [
          matchId ? `matchId=${matchId}` : '',
          `current=${lastLineIndex}`,
          `best=${line}`,
          `delta=${line - lastLineIndex}`,
          `sim=${formatLogScore(conf)}`,
          `need=${formatLogScore(matchThreshold)}`,
          ...tieParts,
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
          `Low confidence - waiting (sim=${formatLogScore(conf)} < ${formatLogScore(matchThreshold)})`,
        );
        noteLowSimFreeze(Date.now(), {
          cursorLine: lastLineIndex,
          bestIdx: line,
          delta: line - lastLineIndex,
          sim: conf,
          inBand: true,
          requiredSim: baselineRequired,
          need: matchThreshold,
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

      let targetLine = Math.max(0, Math.floor(line));
      let lineEl = getLineElementByIndex(scroller, targetLine);
      if (!lineEl) {
        lineEl = await findLineElWithRetry(scroller, targetLine);
        if (seq !== pendingSeq) {
          return;
        }
      }
      let targetTop = computeLineTargetTop(scroller, lineEl);
      const currentTop = scroller.scrollTop || 0;
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
            if (deltaPx > creepNearPx) {
              const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
              const base = pursuitTargetTop == null ? currentTop : pursuitTargetTop;
              const desired = clamp(targetTop, 0, max);
              const limitedTarget = Math.min(desired, base + jumpCap);
              if (limitedTarget > base) {
                pursuitTargetTop = limitedTarget;
                lastSameLineNudgeTs = now;
                lastEvidenceAt = now;
                ensurePursuitActive();
                logDev('same-line recenter', { line: targetLine, px: Math.round(limitedTarget - base), conf });
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
              const base = pursuitTargetTop == null ? currentTop : pursuitTargetTop;
              const creepStep = Math.min(creepPx, creepBudgetPx - creepBudgetUsed);
              const creepTarget = clamp(base + creepStep, 0, max);
              const limitedTarget = Math.min(creepTarget, base + jumpCap);
              if (limitedTarget > base) {
                pursuitTargetTop = limitedTarget;
                lastSameLineNudgeTs = now;
                lastEvidenceAt = now;
                creepBudgetUsed += Math.max(0, limitedTarget - base);
                ensurePursuitActive();
                logDev('same-line creep', { line: targetLine, px: creepStep, conf });
                emitHybridTargetHint(
                  limitedTarget,
                  isFinal ? 0.8 : 0.6,
                  'asr-same-line-creep',
                  undefined,
                  targetLine,
                );
                updateDebugState('same-line-creep');
              }
            }
          return;
        }

        const strongBack = conf >= Math.max(backRecoverStrongConf, baselineRequired);
        if (isFinal && strongBack && deltaPx < 0 && Math.abs(deltaPx) <= backRecoverMaxPx) {
          if (Math.abs(targetLine - lastBackRecoverIdx) <= 1 && now - lastBackRecoverHitAt <= backRecoverWindowMs) {
            backRecoverStreak += 1;
          } else {
            backRecoverStreak = 1;
          }
          lastBackRecoverIdx = targetLine;
          lastBackRecoverHitAt = now;
              if (backRecoverStreak >= backRecoverHitLimit && now - lastBackRecoverAt >= backRecoverCooldownMs) {
                const applied = applyScrollWithHybridGuard(currentTop + deltaPx, {
                  scroller,
                  reason: 'asr-back-recovery',
                });
              lastKnownScrollTop = applied;
              lastMoveAt = Date.now();
              markProgrammaticScroll();
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
      const base = pursuitTargetTop == null ? currentTop : pursuitTargetTop;
      const candidate = clamp(targetTop, 0, max);
      const limitedTarget = forced ? candidate : Math.min(candidate, base + jumpCap);
      const nextTargetTop = Math.max(base, limitedTarget);
      pursuitTargetTop = nextTargetTop;
      if (nextTargetTop > base) {
        emitHybridTargetHint(
          nextTargetTop,
          isFinal ? 0.9 : 0.7,
          forced ? 'asr-forced-commit' : 'asr-commit',
          undefined,
          targetLine,
        );
      }
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
      else {
        jumpHistory.push(now);
      }
      noteCommit(prevLineIndex, targetLine, now);
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
      const intendedTargetTop = pursuitTargetTop ?? currentTop;
      try { console.info('[ASR_COMMIT_TARGET]', { line: targetLine, targetTop: Math.round(intendedTargetTop) }); } catch {}
      logThrottled('ASR_COMMIT', 'log', 'ASR_COMMIT', {
        matchId,
        prevIndex: prevLineIndex,
        nextIndex: targetLine,
        delta: targetLine - prevLineIndex,
        sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : conf,
        scrollTopBefore: Math.round(currentTop),
        scrollTopAfter: Math.round(pursuitTargetTop ?? currentTop),
        targetTop: Math.round(intendedTargetTop),
        forced: !!forced,
        mode: getScrollMode() || 'unknown',
        relock: !!relockOverride,
        relockReason: relockReason || undefined,
      });
      ensurePursuitActive();
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
          matchId ? `matchId=${matchId}` : '',
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
      logDev('target update', { line: targetLine, conf, pxDelta: deltaPx, targetTop: pursuitTargetTop });
      updateDebugState('target-update');
      })();
    });
  };

  const nextFallbackMatchId = () => {
    fallbackMatchIdSeq += 1;
    return `fb${Date.now().toString(36)}-${fallbackMatchIdSeq}`;
  };

  const logFallbackMatch = (match: MatchResult, detail: TranscriptDetail) => {
    if (!isDevMode()) return;
    const w: any = window as any;
    const cursorRaw = lastLineIndex >= 0 ? lastLineIndex : Number(w?.currentIndex ?? 0);
    const cursorLine = Number.isFinite(cursorRaw) ? Math.floor(cursorRaw) : 0;
    const rawBestIdx = Number(match?.bestIdx);
    const bestIdx = Number.isFinite(rawBestIdx) ? Math.floor(rawBestIdx) : -1;
    const rawSim = Number(match?.bestSim);
    const sim = Number.isFinite(rawSim) ? Number(rawSim.toFixed(3)) : rawSim;
    const matchWindowBackRaw = Number((match as any)?.windowBack);
    const matchWindowAheadRaw = Number((match as any)?.windowAhead);
    const windowBack = Number.isFinite(matchWindowBackRaw)
      ? Math.max(0, Math.floor(matchWindowBackRaw))
      : matchBacktrackLines;
    const windowAhead = Number.isFinite(matchWindowAheadRaw)
      ? Math.max(0, Math.floor(matchWindowAheadRaw))
      : matchLookaheadLines;
    const totalLines = getTotalLines();
    const bandStart = Number.isFinite((match as any)?.bandStart)
      ? Math.max(0, Math.floor((match as any).bandStart))
      : Math.max(0, cursorLine - windowBack);
    let bandEnd = Number.isFinite((match as any)?.bandEnd)
      ? Math.max(bandStart, Math.floor((match as any).bandEnd))
      : Math.max(bandStart, cursorLine + windowAhead);
    if (totalLines > 0) bandEnd = Math.min(totalLines - 1, bandEnd);
    const commitDelta = Number.isFinite(bestIdx) ? bestIdx - cursorLine : NaN;
    const sourceRaw = typeof detail?.source === 'string' ? detail.source : '';
    const source = sourceRaw && sourceRaw !== 'speech-loader' ? sourceRaw : 'webspeech';
    const payload: Record<string, unknown> = {
      source,
      bestIdx,
      sim,
      windowStart: bandStart,
      windowEnd: bandEnd,
    };
    if (Number.isFinite(commitDelta)) payload.commitDelta = commitDelta;
    logThrottled('ASR_FALLBACK_MATCH', 'debug', '[ASR_FALLBACK_MATCH]', payload);
  };

  const logFallbackSource = (reason: string) => {
    if (!isDevMode()) return;
    try {
      const w: any = window as any;
      const scriptHash = readScriptHash();
      const vParaIndex = Array.isArray(w?.__vParaIndex) ? w.__vParaIndex : [];
      let candidateIdx = -1;
      let candidateLine = '';
      for (let i = 0; i < vParaIndex.length; i++) {
        const val = vParaIndex[i];
        const text = typeof val === 'string' ? val.trim() : '';
        if (text) {
          candidateIdx = i;
          candidateLine = text;
          break;
        }
      }
      if (candidateIdx < 0 && vParaIndex.length) {
        candidateIdx = 0;
        candidateLine = typeof vParaIndex[0] === 'string' ? String(vParaIndex[0]).trim() : '';
      }
      const root = getScriptRoot() || getPrimaryScroller() || document;
      const lineNodes = root?.querySelectorAll?.('.line');
      let uiIdx = -1;
      let uiLine = '';
      if (lineNodes && lineNodes.length) {
        for (let i = 0; i < lineNodes.length; i++) {
          const el = lineNodes[i] as HTMLElement;
          const text = String(el.textContent || '').trim();
          if (text) {
            uiIdx = Number(el.dataset.line || el.dataset.index || el.dataset.i || i);
            uiLine = text;
            break;
          }
        }
        if (uiIdx < 0) {
          const first = lineNodes[0] as HTMLElement;
          uiIdx = Number(first?.dataset?.line || first?.dataset?.index || first?.dataset?.i || 0);
          uiLine = String(first?.textContent || '').trim();
        }
      }
      if (!candidateLine && !uiLine) return;
      const payload: Record<string, unknown> = { reason };
      if (scriptHash) payload.scriptHash = scriptHash;
      if (candidateIdx >= 0) payload.candidateIdx = candidateIdx;
      if (candidateLine) payload.candidateLine = formatLogSnippet(candidateLine, 80);
      if (uiIdx >= 0) payload.uiIdx = uiIdx;
      if (uiLine) payload.uiLine = formatLogSnippet(uiLine, 80);
      logThrottled('ASR_FALLBACK_SOURCE', 'debug', '[ASR_FALLBACK_SOURCE]', payload);
    } catch {}
  };

  const computeFallbackMatch = (text: string, isFinal: boolean, now: number): MatchResult | null => {
    if (typeof window === 'undefined') return null;
    const normalizeFallbackMatch = (res: MatchResult | null): MatchResult | null => {
      if (!res || typeof res !== 'object') return res;
      const rawIdx = Number((res as any).bestIdx);
      const rawSim = Number((res as any).bestSim);
      const sim = Number.isFinite(rawSim) ? rawSim : 0;
      const idx = Number.isFinite(rawIdx) ? Math.floor(rawIdx) : NaN;
      if (!Number.isFinite(idx) || idx < 0 || sim <= 0) {
        (res as any).bestIdx = -1;
        (res as any).bestSim = sim > 0 ? sim : 0;
        (res as any).delta = 0;
        (res as any).noMatch = 1;
      }
      return res;
    };
    logFallbackSource('fallback-start');
    const w: any = window as any;
    const resyncActive = now < resyncUntil && Number.isFinite(resyncAnchorIdx ?? NaN);
    const windowBack = resyncActive ? resyncBacktrackOverride : matchBacktrackLines;
    const windowAhead = resolveLookahead(resyncActive);
    const currentIndexRaw = lastLineIndex >= 0 ? lastLineIndex : Number(w?.currentIndex ?? 0);
    const currentIndex = Number.isFinite(currentIndexRaw) ? Math.floor(currentIndexRaw) : 0;

    const useFullTokens = isFinal && currentIndex === 0;
    const shim = w?.__tpSpeech?.matchBatch;
    if (!useFullTokens && typeof shim === 'function') {
      try {
        const res = shim(text, isFinal, { currentIndex, windowBack, windowAhead }) as MatchResult | null;
        if (res) {
          (res as any).windowBack =
            Number.isFinite((res as any).windowBack) ? (res as any).windowBack : windowBack;
          (res as any).windowAhead =
            Number.isFinite((res as any).windowAhead) ? (res as any).windowAhead : windowAhead;
          return normalizeFallbackMatch(res);
        }
      } catch (err) {
        logDev('fallback matchBatch shim failed', { err: String(err) });
      }
    }

    const scriptWords: string[] = Array.isArray(w?.scriptWords) ? w.scriptWords : [];
    const paraIndex = Array.isArray(w?.paraIndex) ? w.paraIndex : [];
    const vParaIndex = Array.isArray(w?.__vParaIndex) ? w.__vParaIndex : null;
    if (!scriptWords.length || !paraIndex.length) return null;
    const tokens = normTokens(text || '');
    if (!tokens.length) return null;
    const matchTokens = useFullTokens ? tokens : tokens.slice(-DEFAULT_MATCH_TOKEN_WINDOW);
    const cfg = {
      MATCH_WINDOW_AHEAD: windowAhead,
      MATCH_WINDOW_BACK: windowBack,
      SIM_THRESHOLD: typeof w?.SIM_THRESHOLD === 'number' ? w.SIM_THRESHOLD : 0.46,
      MAX_JUMP_AHEAD_WORDS: typeof w?.MAX_JUMP_AHEAD_WORDS === 'number' ? w.MAX_JUMP_AHEAD_WORDS : 18,
    };
    try {
      const res = computeMatchBatch(
        matchTokens,
        scriptWords,
        paraIndex,
        vParaIndex,
        cfg,
        currentIndex,
        w.__viterbiIPred || null,
      );
      (res as any).windowBack = windowBack;
      (res as any).windowAhead = windowAhead;
      return normalizeFallbackMatch(res);
    } catch (err) {
      logDev('fallback matcher failed', { err: String(err) });
      return null;
    }
  };

  const ingest = (text: string, isFinal: boolean, detail?: TranscriptDetail) => {
    if (disposed) return;
    const normalized = String(text || '').trim();
    if (!normalized) return;
    const compacted = normalized.replace(/\s+/g, ' ').trim();
    const now = Date.now();
    if (postCatchupSamplesLeft > 0) postCatchupSamplesLeft -= 1;
    const detailObj: TranscriptDetail =
      detail && typeof detail === 'object' ? { ...(detail as TranscriptDetail) } : {};
    let rawMatchId = detailObj.matchId;
    let noMatch = detailObj.noMatch === true;
    let hasMatchId = typeof rawMatchId === 'string' && rawMatchId.length > 0;
    let explicitNoMatch = rawMatchId === null && noMatch;
    if (!hasMatchId && !explicitNoMatch) {
      if (isDevMode() && !missingMatchIdKeysLogged) {
        missingMatchIdKeysLogged = true;
        try {
          const keys = detailObj && typeof detailObj === 'object' ? Object.keys(detailObj as Record<string, unknown>) : [];
          console.debug('[ASR_PIPELINE] missing matchId; fallback matcher engaged keys=[' + keys.join(',') + ']');
        } catch {}
      }
      const fallbackMatch = detailObj.match ?? computeFallbackMatch(compacted, isFinal, now);
      const fallbackBestIdx = Number((fallbackMatch as any)?.bestIdx);
      const fallbackBestSim = Number((fallbackMatch as any)?.bestSim);
      const fallbackNoMatch =
        (fallbackMatch as any)?.noMatch === 1 || (fallbackMatch as any)?.noMatch === true;
      const fallbackValid =
        !!fallbackMatch &&
        Number.isFinite(fallbackBestIdx) &&
        fallbackBestIdx >= 0 &&
        Number.isFinite(fallbackBestSim) &&
        fallbackBestSim > 0 &&
        !fallbackNoMatch;
      if (fallbackValid) {
        detailObj.match = fallbackMatch;
        detailObj.matchId = nextFallbackMatchId();
        detailObj.noMatch = false;
        logFallbackMatch(fallbackMatch, detailObj);
      } else {
        detailObj.matchId = null;
        detailObj.noMatch = true;
      }
      rawMatchId = detailObj.matchId;
      noMatch = detailObj.noMatch === true;
      hasMatchId = typeof rawMatchId === 'string' && rawMatchId.length > 0;
      explicitNoMatch = rawMatchId === null && noMatch;
    }
    if (!hasMatchId && !explicitNoMatch) {
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
    const metaTranscript = detailObj?.source === 'meta' || detailObj?.meta === true;
    const incomingMatch = detailObj?.match;
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
    const anchorTarget = effectiveAnchor;

    const driverWindowBack = resyncActive ? resyncBacktrackOverride : matchBacktrackLines;
    const catchUpModeActivePre = catchUpModeUntil > now;
    const lookaheadBase = resolveLookahead(resyncActive);
    const driverWindowAhead = catchUpModeActivePre
      ? clamp(lookaheadBase + DEFAULT_CATCHUP_LOOKAHEAD_BONUS, matchLookaheadLines, matchLookaheadMax + DEFAULT_CATCHUP_LOOKAHEAD_BONUS)
      : lookaheadBase;
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
    const currentIdxRaw = Number((window as any)?.currentIndex ?? -1);
    const currentIdx = Number.isFinite(currentIdxRaw) ? currentIdxRaw : -1;
    const cursorLine = lastLineIndex >= 0 ? lastLineIndex : effectiveAnchor;
    const baseCommitThreshold = isFinal
      ? thresholds.commitFinalMinSim
      : clamp(thresholds.commitInterimMinSim * interimScale, 0, 1);
    const shortBoost = tokenCount <= shortTokenMax ? shortTokenBoost : 0;
    const requiredThreshold = clamp(baseCommitThreshold + shortBoost, 0, 1);
    const interimHighThreshold = clamp(requiredThreshold + interimHysteresisBonus, 0, 1);
    const consistencyMinSim = clamp(requiredThreshold - consistencySimSlack, 0, 1);
    const catchupMinSim = clamp(requiredThreshold - catchupSimSlack, 0, 1);
    const prevIndex = Number.isFinite(currentIdxRaw) ? Math.floor(currentIdxRaw) : 0;
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
    if (isDevMode() && rawIdx !== cursorLine) {
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
      warnGuard('no_match', [
        `current=${currentIdx}`,
        `final=${isFinal ? 1 : 0}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
      emitHudStatus('no_match', 'No match');
      return;
    }
    const totalLines = getTotalLines();
    const bandStart = Number.isFinite((match as any)?.bandStart)
      ? Math.max(0, Math.floor((match as any).bandStart))
      : Math.max(0, cursorLine - matchWindowBack);
    const bandEnd = Number.isFinite((match as any)?.bandEnd)
      ? Math.max(bandStart, Math.floor((match as any).bandEnd))
      : (totalLines > 0
        ? Math.min(totalLines - 1, cursorLine + matchWindowAhead)
        : cursorLine + matchWindowAhead);
    const inBand = rawIdx >= bandStart && rawIdx <= bandEnd;
    const manualAnchorEnabled = isManualAnchorAdoptEnabled();
    if (manualAnchorPending && manualAnchorEnabled && now - manualAnchorPending.ts >= MANUAL_ANCHOR_PENDING_TIMEOUT_MS) {
      rejectManualAnchorPending('no local evidence');
    }
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
    const candidateIdx = Number.isFinite(rawIdx) ? Math.max(0, Math.floor(rawIdx)) : -1;
    const confirmingCurrentLine = candidateIdx >= 0 && candidateIdx === cursorLine;
    const stickAdjust = confirmingCurrentLine ? thresholds.stickinessDelta : 0;
    const effectiveThresholdForPending = clamp(requiredThreshold - stickAdjust, 0, 1);
    const topScores = Array.isArray(match.topScores) ? match.topScores : [];
    const rawScoreByIdx = new Map<number, number>();
    topScores.forEach((entry) => {
      const idx = Number(entry.idx);
      const score = Number(entry.score);
      if (Number.isFinite(idx) && Number.isFinite(score)) {
        rawScoreByIdx.set(idx, score);
      }
    });
    const bestSpan = Number((match as any)?.bestSpan);
    const bestOverlap = Number((match as any)?.bestOverlap);
    const bestOverlapRatio = Number((match as any)?.bestOverlapRatio);
    const isSlamDunkFinal = (idx: number, sim: number) => {
      if (!isFinal) return false;
      const delta = idx - cursorLine;
      if (delta < 0 || delta > slamDunkMaxDelta) return false;
      if (sim < slamDunkSim) return false;
      const hasCompetitor = topScores.some((entry) => {
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
    if (!Number.isFinite(effectiveRawSim) || effectiveRawSim <= 0) {
      warnGuard('no_match', [
        `current=${cursorLine}`,
        `best=${rawIdx}`,
        `sim=${formatLogScore(effectiveRawSim)}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
      emitHudStatus('no_match', 'No match');
      noteNoMatchGap(now, 'sim_zero', snippet);
      resetLagRelock('no_match');
      return;
    }
    if (rawIdx < cursorLine && effectiveRawSim < DEFAULT_BEHIND_NOISE_MIN_SIM) {
      warnGuard('no_match', [
        `current=${cursorLine}`,
        `best=${rawIdx}`,
        `sim=${formatLogScore(effectiveRawSim)}`,
        `min=${formatLogScore(DEFAULT_BEHIND_NOISE_MIN_SIM)}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
      emitHudStatus('no_match', 'No match');
      noteNoMatchGap(now, 'behind_sim', snippet);
      resetLagRelock('behind_sim');
      return;
    }
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
    logThrottled('ASR_MATCH', 'log', 'ASR_MATCH', {
      matchId,
      currentIndex: cursorLine,
      bestIndex: rawIdx,
      delta: rawIdx - cursorLine,
      sim: Number.isFinite(conf) ? Number(conf.toFixed(3)) : conf,
      scrollTop: Math.round(scrollTopForMatch),
      winBack: matchWindowBack,
      winAhead: matchWindowAhead,
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
    const slamDunkFinalEarly = isSlamDunkFinal(rawIdx, conf);
    const forcedEvidenceOk =
      slamDunkFinalEarly ||
      ((tokenCount >= forcedMinTokens || evidenceChars >= forcedMinChars) && forwardCandidateOk);
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
        return;
      }
      if (hasTie && !forwardPick && !forwardBiasEligible && !shortFinalRecent && !outrunEligible) {
        const guardReason = rawIdx <= cursorLine ? 'same_line_noop' : 'no_match_wait';
        warnGuard(guardReason, [
          `current=${cursorLine}`,
          `best=${rawIdx}`,
          `minForward=${forwardMinIdx}`,
          `sim=${formatLogScore(bestScore)}`,
          `need=${formatLogScore(effectiveThreshold)}`,
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
    if (alignedPostCatchup && effectiveThreshold > 0 && conf < effectiveThreshold) {
      logDev('postCatchup relax', {
        sim: conf,
        need: effectiveThreshold,
        delta,
        aligned: alignedPostCatchup,
        msLeft: postCatchupUntil - now,
      });
    } else if (effectiveThreshold > 0 && conf < effectiveThreshold) {
      if (!relockModeActive) {
        warnGuard('low_sim_wait', [
          matchId ? `matchId=${matchId}` : '',
          `current=${cursorLine}`,
          `best=${rawIdx}`,
          `delta=${rawIdx - cursorLine}`,
          `sim=${formatLogScore(conf)}`,
          `need=${formatLogScore(effectiveThreshold)}`,
          snippet ? `clue="${snippet}"` : '',
        ]);
        emitHudStatus('low_sim_wait', 'Low confidence - waiting');
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
      warnGuard('low_sim', [
        matchId ? `matchId=${matchId}` : '',
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
        `Ignored: low confidence (sim=${formatLogScore(conf)} < ${formatLogScore(effectiveThreshold)})`,
      );
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
      matchId,
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
          const applied = applyScrollWithHybridGuard(targetTop, {
            scroller,
            reason: 'asr-behind-reanchor',
          });
        lastKnownScrollTop = applied;
        lastMoveAt = Date.now();
        markProgrammaticScroll();
        }
        lastLineIndex = Math.max(0, Math.floor(rawIdx));
        matchAnchorIdx = lastLineIndex;
        lastForwardCommitAt = now;
        lastSeekTs = now;
        lastEvidenceAt = now;
        noteCommit(cursorLine, lastLineIndex, now);
        resetLowSimStreak();
        behindStrongSince = 0;
        behindStrongCount = 0;
        lastBehindRecoveryAt = now;
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
    const hasEvidence = outrunCommit || catchupCommit || lowSimForwardEvidence || slamDunkFinal
      ? true
      : isFinal
        ? finalEvidence
        : interimEvidence;
    adoptPendingMatch({
      line: Math.max(0, Math.floor(rawIdx)),
      conf,
      isFinal,
      hasEvidence,
      snippet,
      minThreshold:
        effectiveThresholdForPending < requiredThreshold ? effectiveThresholdForPending : undefined,
      requiredThreshold,
      topScores,
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
    try {
      if (scriptChangeHandler) {
        window.removeEventListener('tp:scriptChanged', scriptChangeHandler as EventListener);
      }
    } catch {}
    scriptChangeHandler = null;
    detachManualScrollWatcher();
    manualAnchorPending = null;
    updateManualAnchorGlobalState();
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
    pursuitTargetTop = null;
    pursuitVel = 0;
    pursuitActive = false;
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
    manualAnchorPending = null;
    updateManualAnchorGlobalState();
    setCurrentIndex(lastLineIndex, 'manualReset');
    updateDebugState('sync-index');
  };
  const handleScriptChanged = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    const source = typeof (detail as any)?.source === 'string' ? (detail as any).source : '';
    const incomingHash = typeof (detail as any)?.hash === 'string' ? (detail as any).hash : '';
    const scriptHash = incomingHash || readScriptHash();
    const now = Date.now();
    const hashKnown = !!scriptHash;
    const sameHash = hashKnown && scriptHash === lastScriptChangeHash;
    const recent = now - lastScriptChangeAt < 500;
    if (source === 'editor') {
      lastScriptChangeAt = now;
      if (hashKnown) lastScriptChangeHash = scriptHash;
      return;
    }
    if (sameHash && recent) return;
    lastScriptChangeAt = now;
    if (hashKnown) lastScriptChangeHash = scriptHash;
    missingMatchIdKeysLogged = false;
    lastMatchId = undefined;
    fallbackMatchIdSeq = 0;
    bootLogged = false;
    forcedCommitTimes.length = 0;
    jumpHistory = [];
    guardCounts.clear();
    resetLowSimStreak();
    resetNoMatchTracking('script-change');
    resetResyncOverrides();
    resetLagRelock('script-change');
    resetLookahead('script-change');
    setLastLineIndex(0);
    logDev('script change reset', { source, scriptHash });
  };
  scriptChangeHandler = handleScriptChanged;
  try { window.addEventListener('tp:scriptChanged', handleScriptChanged as EventListener); } catch {}

  const getLastLineIndex = () => lastLineIndex;

  return { ingest, dispose, setLastLineIndex, getLastLineIndex };
}
