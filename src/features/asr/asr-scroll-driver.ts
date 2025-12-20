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
  let disposed = false;
  let desyncWarned = false;

  const unsubscribe = speechStore.subscribe((state) => {
    if (disposed) return;
    if (typeof state.threshold === 'number') {
      threshold = clamp(state.threshold, 0, 1);
    }
  });

  const ingest = (text: string, isFinal: boolean) => {
    if (disposed) return;
    const normalized = String(text || '').trim();
    if (!normalized) return;
    const tokenCount = normalized.split(/\s+/).filter(Boolean).length;

    const match = matchBatch(normalized, !!isFinal);
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
    if (targetLine - lastLineIndex < minLineAdvance) {
      logDev('not enough forward progress', { targetLine, lastLineIndex, minLineAdvance });
      return;
    }
    const now = Date.now();
    if (now - lastSeekTs < seekThrottleMs) {
      logDev('throttled seek', { elapsed: now - lastSeekTs, throttle: seekThrottleMs });
      return;
    }

    lastLineIndex = targetLine;
    lastSeekTs = now;
    logDev('seeking to line', targetLine, { conf });
    centerLine(targetLine);
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
  };
  const getLastLineIndex = () => lastLineIndex;

  return { ingest, dispose, setLastLineIndex, getLastLineIndex };
}
