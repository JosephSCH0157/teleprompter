import { centerLine } from '../../scroll/scroll-helpers';
import { matchBatch } from '../../speech/orchestrator';
import { speechStore } from '../../state/speech-store';
import { getAsrSettings } from '../speech/speech-store';

type DriverOptions = {
  /** Minimum forward line delta before issuing a seek. */
  minLineAdvance?: number;
  /** Minimum milliseconds between seeks (throttle) */
  seekThrottleMs?: number;
  /** Scale applied to the confidence threshold when processing interim results. */
  interimConfidenceScale?: number;
};

export interface AsrScrollDriver {
  ingest(text: string, isFinal: boolean): void;
  dispose(): void;
  setLastLineIndex(index: number): void;
  getLastLineIndex(): number;
}

const DEFAULT_MIN_LINE_ADVANCE = 1;
const DEFAULT_SEEK_THROTTLE_MS = 200;
const DEFAULT_INTERIM_SCALE = 0.6;
const DEFAULT_MATCH_BACKTRACK_LINES = 2;
const DEFAULT_MATCH_LOOKAHEAD_LINES = 50;
const DEFAULT_BACKTRACK_COOLDOWN_MS = 1500;
const DEFAULT_MAX_BACKTRACK_PX = 120;
const DEFAULT_FORWARD_STEP_PX = 30;
const DEFAULT_BACKWARD_STEP_PX = 15;
const DEFAULT_SNAP_THRESHOLD_PX = 1500;
const DEFAULT_SNAP_TAIL_PX = 300;
const DEFAULT_SAME_LINE_STEP_PX = 30;
const DEFAULT_SAME_LINE_THROTTLE_MS = 160;
const DEFAULT_STABLE_HIT_LIMIT = 6;
const DEFAULT_STALL_MS = 800;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

export function createAsrScrollDriver(options: DriverOptions = {}): AsrScrollDriver {
  const minLineAdvance = Number.isFinite(options.minLineAdvance ?? DEFAULT_MIN_LINE_ADVANCE)
    ? Math.max(0, options.minLineAdvance ?? DEFAULT_MIN_LINE_ADVANCE)
    : DEFAULT_MIN_LINE_ADVANCE;
  const seekThrottleMs = Number.isFinite(options.seekThrottleMs ?? DEFAULT_SEEK_THROTTLE_MS)
    ? Math.max(0, options.seekThrottleMs ?? DEFAULT_SEEK_THROTTLE_MS)
    : DEFAULT_SEEK_THROTTLE_MS;
  const interimScale = Number.isFinite(options.interimConfidenceScale ?? DEFAULT_INTERIM_SCALE)
    ? clamp(options.interimConfidenceScale ?? DEFAULT_INTERIM_SCALE, 0, 1)
    : DEFAULT_INTERIM_SCALE;

  let threshold = resolveThreshold();
  let lastLineIndex = -1;
  let lastSeekTs = 0;
  let lastBacktrackTs = 0;
  let lastSameLineNudgeTs = 0;
  let lastMoveAt = 0;
  let lastStableLine = -1;
  let stableHitCount = 0;
  let disposed = false;
  let desyncWarned = false;
  let stepTarget: number | null = null;
  let stepRaf = 0;

  const forwardStepPx = DEFAULT_FORWARD_STEP_PX;
  const backwardStepPx = DEFAULT_BACKWARD_STEP_PX;
  const snapThresholdPx = DEFAULT_SNAP_THRESHOLD_PX;
  const snapTailPx = DEFAULT_SNAP_TAIL_PX;
  const maxBacktrackPx = DEFAULT_MAX_BACKTRACK_PX;
  const backtrackCooldownMs = DEFAULT_BACKTRACK_COOLDOWN_MS;
  const matchBacktrackLines = DEFAULT_MATCH_BACKTRACK_LINES;
  const matchLookaheadLines = DEFAULT_MATCH_LOOKAHEAD_LINES;
  const sameLineStepPx = DEFAULT_SAME_LINE_STEP_PX;
  const sameLineThrottleMs = DEFAULT_SAME_LINE_THROTTLE_MS;
  const stableHitLimit = DEFAULT_STABLE_HIT_LIMIT;
  const stallMs = DEFAULT_STALL_MS;

  const unsubscribe = speechStore.subscribe((state) => {
    if (disposed) return;
    if (typeof state.threshold === 'number') {
      threshold = clamp(state.threshold, 0, 1);
    }
  });

  const ensureStepLoop = () => {
    if (stepRaf) return;
    stepRaf = window.requestAnimationFrame(() => {
      stepRaf = 0;
      const scroller = getScroller();
      if (!scroller || stepTarget == null) return;
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const target = clamp(stepTarget, 0, max);
      const current = scroller.scrollTop || 0;
      const delta = target - current;
      if (Math.abs(delta) <= 1) {
        scroller.scrollTop = target;
        lastMoveAt = Date.now();
        stepTarget = null;
        return;
      }
      if (Math.abs(delta) >= snapThresholdPx) {
        scroller.scrollTop = target - Math.sign(delta) * snapTailPx;
        lastMoveAt = Date.now();
        ensureStepLoop();
        return;
      }
      const cap = delta >= 0 ? forwardStepPx : backwardStepPx;
      const next = current + Math.sign(delta) * Math.min(Math.abs(delta), cap);
      scroller.scrollTop = next;
      if (next !== current) lastMoveAt = Date.now();
      ensureStepLoop();
    });
  };

  const stepToTarget = (targetTop: number) => {
    stepTarget = targetTop;
    ensureStepLoop();
  };

  const ingest = (text: string, isFinal: boolean) => {
    if (disposed) return;
    const normalized = String(text || '').trim();
    if (!normalized) return;
    const tokenCount = normalized.split(/\s+/).filter(Boolean).length;

    const anchorIdx = lastLineIndex >= 0
      ? lastLineIndex
      : Number((window as any)?.currentIndex ?? 0);
    try { (window as any).currentIndex = Math.max(0, Math.floor(anchorIdx)); } catch {}

    const match = matchBatch(normalized, !!isFinal, {
      currentIndex: Math.max(0, Math.floor(anchorIdx)),
      windowBack: matchBacktrackLines,
      windowAhead: matchLookaheadLines,
    });
    if (!match) return;
    const rawIdx = Number(match.bestIdx);
    const conf = Number.isFinite(match.bestSim) ? match.bestSim : 0;
    const requiredThreshold = isFinal ? threshold : Math.max(0, threshold * interimScale);
    const currentIdx = Number((window as any)?.currentIndex ?? -1);

    logDev('ingest', { text: normalized, isFinal, idx: rawIdx, conf, threshold, requiredThreshold });

    if (!desyncWarned && Number.isFinite(currentIdx) && rawIdx + 5 < lastLineIndex && currentIdx + 5 < lastLineIndex) {
      desyncWarned = true;
      try { console.warn('[ASR] index desync detected; resyncing', { targetLine: rawIdx, lastLineIndex, currentIndex: currentIdx }); } catch {}
      lastLineIndex = Math.max(0, Math.floor(rawIdx));
      try { (window as any).currentIndex = Math.max(0, Math.floor(rawIdx)); } catch {}
    }

    if (requiredThreshold > 0 && conf < requiredThreshold) {
      const allowLowConfidence = isFinal && tokenCount >= 3;
      if (!allowLowConfidence) {
        logDev('confidence below threshold, skipping', { tokenCount });
        return;
      }
      logDev('low confidence fallback', { conf, requiredThreshold, tokenCount });
    }

    if (!Number.isFinite(rawIdx)) return;
    const targetLine = Math.max(0, Math.floor(rawIdx));
    const deltaLines = targetLine - lastLineIndex;
    const now = Date.now();
    const strongMatch = isFinal ? conf >= threshold : conf >= requiredThreshold;

    const scroller = getScroller();
    const targetTop = scroller ? resolveTargetTop(scroller, targetLine) : null;
    const currentTop = scroller ? (scroller.scrollTop || 0) : 0;
    const deltaPx = targetTop != null ? targetTop - currentTop : 0;
    const allowSoftAccept = strongMatch && targetLine === lastLineIndex;
    const allowBacktrack =
      deltaLines < 0 &&
      isFinal &&
      strongMatch &&
      targetTop != null &&
      Math.abs(deltaPx) <= maxBacktrackPx &&
      (now - lastBacktrackTs) >= backtrackCooldownMs;

    if (allowSoftAccept) {
      try { (window as any).currentIndex = targetLine; } catch {}
      if (lastStableLine === targetLine) {
        stableHitCount += 1;
      } else {
        lastStableLine = targetLine;
        stableHitCount = 1;
      }
      const sinceLastMove = lastMoveAt ? now - lastMoveAt : Number.POSITIVE_INFINITY;
      if ((now - lastSameLineNudgeTs) >= sameLineThrottleMs && scroller) {
        const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const nudgeTarget = clamp(currentTop + sameLineStepPx, 0, max);
        if (nudgeTarget > currentTop) {
          lastSameLineNudgeTs = now;
          stepToTarget(nudgeTarget);
          logDev('same-line nudge', { targetLine, deltaPx, stableHitCount, sinceLastMoveMs: sinceLastMove });
        }
      }
      if (stableHitCount >= stableHitLimit && sinceLastMove >= stallMs && scroller) {
        const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const nudgeTarget = clamp(currentTop + sameLineStepPx, 0, max);
        if (nudgeTarget > currentTop) {
          lastSameLineNudgeTs = now;
          stableHitCount = 0;
          stepToTarget(nudgeTarget);
          logDev('stagnation nudge', { targetLine, deltaPx, stableHitCount, sinceLastMoveMs: sinceLastMove });
        }
      }
      return;
    }

    if (deltaLines === 0) {
      logDev('no line change', { targetLine, lastLineIndex });
      return;
    }

    if (now - lastSeekTs < seekThrottleMs) {
      logDev('throttled seek', { elapsed: now - lastSeekTs, throttle: seekThrottleMs });
      return;
    }

    let accepted = false;
    if (deltaLines > 0) {
      if (deltaLines < minLineAdvance) {
        logDev('not enough forward progress', { targetLine, lastLineIndex, minLineAdvance });
        return;
      }
      accepted = true;
    } else if (allowBacktrack) {
      accepted = true;
      lastBacktrackTs = now;
    }

    logDev('match gate', {
      lastLineIndex,
      matcherIndex: currentIdx,
      bestIdx: targetLine,
      bestSim: conf,
      isFinal,
      accepted,
    });

    if (!accepted) return;

    lastLineIndex = targetLine;
    lastSeekTs = now;
    if (lastStableLine === targetLine) {
      stableHitCount += 1;
    } else {
      lastStableLine = targetLine;
      stableHitCount = 1;
    }
    try { (window as any).currentIndex = targetLine; } catch {}
    logDev('seeking to line', targetLine, { conf, deltaLines, deltaPx });
    if (targetTop != null && scroller) {
      stepToTarget(targetTop);
    } else {
      centerLine(targetLine);
      lastMoveAt = Date.now();
    }
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
    lastStableLine = lastLineIndex;
    stableHitCount = 0;
    try { (window as any).currentIndex = lastLineIndex; } catch {}
  };
  const getLastLineIndex = () => lastLineIndex;

  return { ingest, dispose, setLastLineIndex, getLastLineIndex };
}
