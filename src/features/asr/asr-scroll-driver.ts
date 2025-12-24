import { matchBatch } from '../../speech/orchestrator';
import { normTokens } from '../../speech/matcher';
import { speechStore } from '../../state/speech-store';
import { getAsrSettings } from '../speech/speech-store';

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
const DEFAULT_RESYNC_WINDOW_MS = 1600;
const DEFAULT_RESYNC_LOOKAHEAD_BONUS = 20;
const DEFAULT_RESYNC_COOLDOWN_MS = 2500;
const DEFAULT_STRONG_BACK_SIM = 0.72;
const DEFAULT_BACK_CONFIRM_HITS = 2;
const DEFAULT_BACK_CONFIRM_WINDOW_MS = 1300;
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

const guardLastAt = new Map<string, number>();

function warnGuard(reason: string, parts: Array<string | number | null | undefined>) {
  const now = Date.now();
  const last = guardLastAt.get(reason) ?? 0;
  if (now - last < GUARD_THROTTLE_MS) return;
  guardLastAt.set(reason, now);
  try {
    const line = ['🧱 ASR_GUARD', `reason=${reason}`, ...parts.filter(Boolean)];
    console.warn(line.join(' '));
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

function getScroller(): HTMLElement | null {
  return (
    (document.getElementById('viewer') as HTMLElement | null) ||
    (document.querySelector('[data-role="viewer"]') as HTMLElement | null)
  );
}

function isScrollable(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.scrollHeight - el.clientHeight > 2) return true;
  try {
    const st = getComputedStyle(el);
    return /(auto|scroll)/.test(st.overflowY || '');
  } catch {
    return false;
  }
}

function resolveActiveScroller(primary: HTMLElement | null, fallback: HTMLElement | null): HTMLElement | null {
  if (isScrollable(primary)) return primary;
  if (isScrollable(fallback)) return fallback;
  return primary || fallback;
}

function describeElement(el: HTMLElement | null): string {
  if (!el) return 'none';
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls}` || el.tagName.toLowerCase();
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
    const viewer =
      scroller ||
      document.getElementById('viewer') ||
      document.getElementById('scriptScrollContainer');
    const root = document.getElementById('script') || viewer;
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

  let threshold = resolveThreshold();
  let lastLineIndex = -1;
  let lastSeekTs = 0;
  let lastSameLineNudgeTs = 0;
  let lastMoveAt = 0;
  let lastIngestAt = 0;
  let lastForwardCommitAt = Date.now();
  let disposed = false;
  let desyncWarned = false;
  let resyncUntil = 0;
  let resyncAnchorIdx: number | null = null;
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
  let lastResyncAt = 0;
  let lastBehindStrongIdx = -1;
  let lastBehindStrongAt = 0;
  let behindStrongCount = 0;
  let lookaheadStepIndex = 0;
  let lastLookaheadBumpAt = 0;
  let behindHitCount = 0;
  let behindHitWindowStart = 0;
  let pendingMatch: PendingMatch | null = null;
  let pendingRaf = 0;
  let bootLogged = false;
  let forcedCooldownUntil = 0;
  const forcedCommitTimes: number[] = [];

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
  const resyncLookaheadBonus = DEFAULT_RESYNC_LOOKAHEAD_BONUS;
  const resyncCooldownMs = DEFAULT_RESYNC_COOLDOWN_MS;
  const strongBackSim = DEFAULT_STRONG_BACK_SIM;
  const backConfirmHits = DEFAULT_BACK_CONFIRM_HITS;
  const backConfirmWindowMs = DEFAULT_BACK_CONFIRM_WINDOW_MS;
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
  const minTokenCount = DEFAULT_MIN_TOKEN_COUNT;
  const minEvidenceChars = DEFAULT_MIN_EVIDENCE_CHARS;
  const interimHysteresisBonus = DEFAULT_INTERIM_HYSTERESIS_BONUS;
  const interimStableRepeats = DEFAULT_INTERIM_STABLE_REPEATS;
  const shortTokenMax = DEFAULT_SHORT_TOKEN_MAX;
  const shortTokenBoost = DEFAULT_SHORT_TOKEN_BOOST;
  const ambiguitySimDelta = DEFAULT_AMBIGUITY_SIM_DELTA;
  const ambiguityNearLines = DEFAULT_AMBIGUITY_NEAR_LINES;
  const ambiguityFarLines = DEFAULT_AMBIGUITY_FAR_LINES;
  const strongHits: Array<{ ts: number; idx: number; conf: number; isFinal: boolean }> = [];
  const eventRing: AsrEventSnapshot[] = [];

  const unsubscribe = speechStore.subscribe((state) => {
    if (disposed) return;
    if (typeof state.threshold === 'number') {
      threshold = clamp(state.threshold, 0, 1);
    }
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
      };
    } catch {}
  };

  const recordEvent = (entry: AsrEventSnapshot) => {
    eventRing.push(entry);
    if (eventRing.length > EVENT_RING_MAX) eventRing.shift();
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
    const boosted = resyncActive ? base + resyncLookaheadBonus : base;
    return clamp(boosted, matchLookaheadLines, matchLookaheadMax + resyncLookaheadBonus);
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
      scroller.scrollTop = current + move;
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
      const { line, conf, isFinal, hasEvidence, snippet, minThreshold, forced, forceReason } = pending;
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
          snippet ? `clue="${snippet}"` : '',
        ]);
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
              if (nextDeltaPx > 0 && nextDeltaPx <= maxTargetJumpPx) {
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
            const limitedTarget = Math.min(desired, base + maxTargetJumpPx);
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
            const limitedTarget = Math.min(creepTarget, base + maxTargetJumpPx);
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
            scroller.scrollTop = currentTop + deltaPx;
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
      const limitedTarget = forced ? candidate : Math.min(candidate, base + maxTargetJumpPx);
      targetTopPx = Math.max(base, limitedTarget);
      lastLineIndex = Math.max(lastLineIndex, targetLine);
      creepBudgetLine = -1;
      creepBudgetUsed = 0;
      lastForwardCommitAt = now;
      resetLookahead('forward_commit');
      lastSeekTs = now;
      lastEvidenceAt = now;
      if (forced) {
        forcedCommitTimes.push(now);
        pruneForcedCommits(now);
      }
      try { (window as any).currentIndex = lastLineIndex; } catch {}
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
          `forcedCount10s=${forcedCount}`,
          forcedCooldown ? `cooldown=${forcedCooldown}` : 'cooldown=0',
          currentText ? `currentText="${currentText}"` : '',
          bestText ? `bestText="${bestText}"` : '',
          markerText ? `markerText="${markerText}"` : '',
          snippet ? `clue="${snippet}"` : '',
        ].filter(Boolean).join(' ');
        console.log(commitLine);
      } catch {}
      logDev('target update', { line: targetLine, conf, pxDelta: deltaPx, targetTop: targetTopPx });
      updateDebugState('target-update');
    });
  };

  const ingest = (text: string, isFinal: boolean) => {
    if (disposed) return;
    const normalized = String(text || '').trim();
    if (!normalized) return;
    const compacted = normalized.replace(/\s+/g, ' ').trim();
    const snippet = formatLogSnippet(compacted, 60);
    if (!bootLogged) {
      bootLogged = true;
      try {
        const viewer = getScroller();
        const root = document.getElementById('script') || viewer;
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
    const tokenCount = normTokens(compacted).length;
    const evidenceChars = compacted.length;
    const now = Date.now();
    lastIngestAt = now;
    updateDebugState('ingest');
    if (!isFinal && tokenCount < minTokenCount && evidenceChars < minEvidenceChars) {
      const cursor = lastLineIndex >= 0 ? lastLineIndex : Number((window as any)?.currentIndex ?? -1);
      warnGuard('min_evidence', [
        `cursor=${cursor}`,
        `tokens=${tokenCount}`,
        `chars=${evidenceChars}`,
        `final=${isFinal ? 1 : 0}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
      logDev('short utterance ignored', { tokenCount, evidenceChars, isFinal });
      return;
    }

    maybeBumpForStall(now);

    const anchorIdx = matchAnchorIdx >= 0
      ? matchAnchorIdx
      : (lastLineIndex >= 0 ? lastLineIndex : Number((window as any)?.currentIndex ?? 0));
    const resyncActive = now < resyncUntil && Number.isFinite(resyncAnchorIdx ?? NaN);
    const effectiveAnchor = resyncActive
      ? Math.max(0, Math.floor(resyncAnchorIdx as number))
      : Math.max(0, Math.floor(anchorIdx));
    try { (window as any).currentIndex = effectiveAnchor; } catch {}

    const windowBack = matchBacktrackLines;
    const windowAhead = resolveLookahead(resyncActive);
    const match = matchBatch(compacted, !!isFinal, {
      currentIndex: effectiveAnchor,
      windowBack,
      windowAhead,
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

    const cursorLine = lastLineIndex >= 0 ? lastLineIndex : effectiveAnchor;
    const topScores = Array.isArray(match.topScores) ? match.topScores : [];
    let effectiveThreshold = requiredThreshold;
    const shortFinal =
      isFinal && tokenCount >= shortFinalMinTokens && tokenCount <= shortFinalMaxTokens;
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
    if (outrunRecent && (rawIdx <= cursorLine || conf < effectiveThreshold)) {
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
    if (shortFinalForcedCandidate && !outrunCommit) {
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
    let interimEligible = true;
    if (!isFinal) {
      if (conf < interimHighThreshold) {
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
        if (rawIdx === lastInterimBestIdx) {
          interimRepeatCount += 1;
        } else {
          lastInterimBestIdx = rawIdx;
          interimRepeatCount = 1;
        }
        interimEligible = interimRepeatCount >= interimStableRepeats;
        if (!interimEligible) {
          warnGuard('interim_unstable', [
            `current=${cursorLine}`,
            `best=${rawIdx}`,
            `delta=${rawIdx - cursorLine}`,
            `sim=${formatLogScore(conf)}`,
            `repeats=${interimRepeatCount}`,
            `need=${interimStableRepeats}`,
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
        }
        lastBehindStrongIdx = rawIdx;
        lastBehindStrongAt = now;
      } else {
        behindStrongCount = 0;
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
        lastResyncAt = now;
        if (!desyncWarned) {
          desyncWarned = true;
          try { console.warn('[ASR] realigning matcher window', { targetLine: rawIdx, lastLineIndex, currentIndex: currentIdx }); } catch {}
        }
        logDev('realign matcher window', { anchor: resyncAnchorIdx, windowAhead: matchLookaheadLines + resyncLookaheadBonus });
      }
    }

    if (effectiveThreshold > 0 && conf < effectiveThreshold) {
      warnGuard('low_sim', [
        `current=${cursorLine}`,
        `best=${rawIdx}`,
        `delta=${rawIdx - cursorLine}`,
        `sim=${formatLogScore(conf)}`,
        `need=${formatLogScore(effectiveThreshold)}`,
        snippet ? `clue="${snippet}"` : '',
      ]);
      return;
    }
    if (tokenCount === 0) {
      warnGuard('min_evidence', [
        `current=${cursorLine}`,
        `best=${rawIdx}`,
        `tokens=${tokenCount}`,
      ]);
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
    const hasEvidence = outrunCommit
      ? true
      : (isFinal
        ? (hasPairEvidence || rawIdx >= cursorLine + finalEvidenceLeadLines)
        : (hasPairEvidence && interimEligible));
    pendingMatch = {
      line: Math.max(0, Math.floor(rawIdx)),
      conf,
      isFinal,
      hasEvidence,
      snippet,
      minThreshold: effectiveThreshold < requiredThreshold ? effectiveThreshold : undefined,
      forced: outrunCommit || shortFinalForced,
      forceReason,
    };
    schedulePending();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      unsubscribe();
    } catch {
      // ignore
    }
  };

  const setLastLineIndex = (index: number) => {
    if (!Number.isFinite(index)) return;
    lastLineIndex = Math.max(0, Math.floor(index));
    lastSeekTs = 0;
    lastSameLineNudgeTs = 0;
    lastMoveAt = 0;
    lastIngestAt = 0;
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
    lastResyncAt = 0;
    lastBehindStrongIdx = -1;
    lastBehindStrongAt = 0;
    behindStrongCount = 0;
    lastForwardCommitAt = Date.now();
    resetLookahead('sync-index');
    if (pendingRaf) {
      try { cancelAnimationFrame(pendingRaf); } catch {}
      pendingRaf = 0;
    }
    pendingMatch = null;
    strongHits.length = 0;
    try { (window as any).currentIndex = lastLineIndex; } catch {}
    updateDebugState('sync-index');
  };
  const getLastLineIndex = () => lastLineIndex;

  return { ingest, dispose, setLastLineIndex, getLastLineIndex };
}
