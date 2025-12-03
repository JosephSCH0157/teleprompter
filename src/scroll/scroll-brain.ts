/**
 * scroll-brain.ts — "Queen" of the scroll hive
 *
 * Responsibilities:
 * - Hold the active scroll mode in memory and provide a tiny API around it.
 * - Coordinate which scroll engines are allowed to run in each mode.
 * - Start/stop the continuous scroll tick loop when appropriate.
 * - Expose a small, engine-focused surface to orchestrators (mode-router, ASR bridge, etc.).
 *
 * Canonical scroll modes (from the app store `scrollMode` key):
 *   - "timed"    : fixed px/sec autoscroll, no speech following.
 *   - "wpm"      : autoscroll where px/sec is derived from target WPM + typography metrics.
 *   - "hybrid"   : timed + ASR + PLL catchup; auto scrolls and adjusts to match speech.
 *   - "asr"      : ASR-only scroll; script moves only when speech is recognized.
 *   - "step"     : pedal/arrow step scroll only; no continuous movement.
 *   - "rehearsal": practice bubble; no engines move the script, clamp blocks programmatic scroll.
 *
 * "Manual" is NOT a mode string. Manual scrolling = no engines running and not in rehearsal;
 * the user just wheels/drags the script themselves.
 *
 * Mode → engine matrix (scroll-brain is the single place that enforces this):
 *
 *   mode       timed engine   WPM adapter   ASR scroll   PLL/catchup         step engine         rehearsal clamp
 *   ----------------------------------------------------------------------------------------------------------------
 *   "timed"    ON             OFF           OFF          minimal (end-only)  allowed             OFF
 *   "wpm"      ON             ON            OFF          minimal (end-only)  allowed             OFF
 *   "asr"      OFF            OFF           ON           visual smoothing    allowed (backup)    OFF
 *   "hybrid"   ON             optional      ON           full (ASR-driven)   allowed (secondary) OFF
 *   "step"     OFF            OFF           OFF          OFF                 ON (primary)        OFF
 *   "rehearsal"OFF            OFF           OFF          OFF                 blocked by guards   ON (clamp/guards)
 *
 * Invariants:
 * - scroll-brain never touches the DOM directly (no document.getElementById, no HTML event listeners).
 * - scroll-brain never reads/writes localStorage or any persistence keys.
 * - scroll-brain does NOT know about recording, HUD, or OBS; it only coordinates scroll engines.
 * - scroll-brain does not directly call window.scrollBy / scrollTop; engines and scroll-helpers own viewport changes.
 * - scroll-brain does not call store.set('scrollMode', ...); mode is driven by the app store and reflected here.
 *
 * Expected integration:
 * - A higher-level mode-router subscribes to store.scrollMode and calls scroll-brain.setMode(mode).
 * - Engines (timed, wpm adapter, ASR scroll, PLL, step, rehearsal clamp) are injected or referenced here
 *   and toggled ON/OFF according to the matrix above.
 * - A scheduler/RAF utility is used to tick continuous engines in timed/wpm/hybrid modes while active.
 *
 * If you add a new scroll mode or engine, update this header and the matrix first,
 * then extend the implementation to keep the Queen as the single source of truth for scroll behavior.
 */

// Include legacy strings ('auto'/'off'/'manual') for compatibility with existing callers.
export type ScrollMode =
  | 'timed'
  | 'wpm'
  | 'hybrid'
  | 'asr'
  | 'step'
  | 'rehearsal'
  | 'auto'
  | 'off'
  | 'manual';

import { clampActive, scrollByPx } from './scroll-helpers';

export type AdaptSample = {
  errPx: number;
  conf?: number;
  ts?: number;
};

export interface ScrollBrain {
  // Mode
  setMode(mode: ScrollMode): void;
  getMode(): ScrollMode;

  // Engine lifecycle
  startEngine(): void;
  stopEngine(): void;

  // Speed target (continuous engines like timed/WPM/hybrid)
  setTargetSpeed(pxPerSec: number): void;
  setMetrics?(pxPerLine: number, pxPerWord: number): void;

  // ASR inputs
  reportAsrSample(sample: AdaptSample): void;
  reportAsrSilence(isSilent: boolean, ts: number): void;

  // Script alignment
  centerOnLine(lineIndex: number): void;

  // Micro adjustments
  nudge(deltaPx: number): void;

  // Legacy compatibility shims (no-op in Phase 1)
  setBaseSpeedPx?(pxPerSec: number): void;
  onManualSpeedAdjust?(deltaPxPerSec: number): void;
  getCurrentSpeedPx?(): number;
}

interface InternalState {
  mode: ScrollMode;

  // tick loop
  ticking: boolean;
  rafId: number | null;
  lastTickTs: number | null;

  // governor / PLL (hybrid)
  pll: {
    errPx: number;
    lastErrTs: number;
    smoothedErr: number;
    gain: number;
    smoothFactor: number;
  };

  // ASR silence gate
  silence: {
    isSilent: boolean;
    lastChangeTs: number;
  };

  // Speed state
  targetSpeedPxPerSec: number;
  effectiveSpeedPxPerSec: number;

  // Metrics
  pxPerLine: number;
  pxPerWord: number;

  // Nudges / centering
  manualNudgePx: number;
  lastCenteredLine: number | null;
}

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

// Debug logging is opt-in only (scrollDebug=1 or __tpScrollDebug = true)
let debugEnabled = false;
let debugCounter = 0;
const isScrollDebug = (): boolean => {
  try {
    const w = window as any;
    if (w.__tpScrollDebug === true) return true;
    const qs = new URLSearchParams(window.location.search || '');
    if (qs.has('scrollDebug')) return true;
  } catch {
    // ignore
  }
  return false;
};

export function createScrollBrain(): ScrollBrain {
  const state: InternalState = {
    mode: 'rehearsal',
    ticking: false,
    rafId: null,
    lastTickTs: null,
    pll: {
      errPx: 0,
      lastErrTs: 0,
      smoothedErr: 0,
      gain: 0.4,
      smoothFactor: 0.12,
    },
    silence: {
      isSilent: false,
      lastChangeTs: now(),
    },
    targetSpeedPxPerSec: 0,
    effectiveSpeedPxPerSec: 0,
    pxPerLine: 0,
    pxPerWord: 0,
    manualNudgePx: 0,
    lastCenteredLine: null,
  };

  const resetForMode = (mode: ScrollMode): void => {
    // Reset mode-specific state; engines remain disconnected in Phase 1.
    state.pll = { errPx: 0, lastErrTs: now(), smoothedErr: 0 };
    state.silence = { isSilent: false, lastChangeTs: now() };
    state.targetSpeedPxPerSec = 0;
    state.effectiveSpeedPxPerSec = 0;
    state.manualNudgePx = 0;
    state.lastCenteredLine = null;
    state.mode = mode;
  };

  const tick = (ts: number): void => {
    if (!state.ticking) {
      state.rafId = null;
      return;
    }
    if (!debugEnabled) debugEnabled = isScrollDebug();

    const last = state.lastTickTs ?? ts;
    const dtMs = ts - last;
    state.lastTickTs = ts;

    const dtSec = dtMs > 0 ? dtMs / 1000 : 0;

    const mode = state.mode;
    const base = state.targetSpeedPxPerSec || 0;
    let effectiveSpeed = base;

    const isClamped = clampActive();
    const silenceHold = mode === 'hybrid' && state.silence.isSilent;

    // PLL adjustment (hybrid-only)
    if (mode === 'hybrid' && !silenceHold) {
      effectiveSpeed += state.pll.smoothedErr * state.pll.gain;
    }

    // Silence gate for hybrid
    if (mode === 'hybrid' && silenceHold) {
      effectiveSpeed = 0;
    }

    // Never scroll when clamped
    if (isClamped) {
      effectiveSpeed = 0;
    }

    if (effectiveSpeed < 0 || !Number.isFinite(effectiveSpeed)) effectiveSpeed = 0;
    state.effectiveSpeedPxPerSec = effectiveSpeed;

    // Apply manual nudge once per tick if present
    let dy = effectiveSpeed * dtSec;
    if (state.manualNudgePx) {
      dy += state.manualNudgePx;
      state.manualNudgePx = 0;
    }

    if (Number.isFinite(dy) && dy !== 0 && !isClamped) {
      scrollByPx(dy);
    }

    if (!debugEnabled) {
      debugEnabled = isScrollDebug();
    }
    if (debugEnabled) {
      debugCounter++;
      if (debugCounter >= 30) {
        debugCounter = 0;
        try {
          console.log('[scroll-brain]', {
            mode,
            target: state.targetSpeedPxPerSec || 0,
            effective: effectiveSpeed,
            clamp: isClamped,
            silent: state.silence.isSilent,
            pllErr: state.pll?.smoothedErr ?? 0,
          });
        } catch {
          // ignore
        }
      }
    }

    state.rafId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(tick) : null;
  };

  const startEngine = (): void => {
    if (state.ticking) return;
    state.ticking = true;
    state.lastTickTs = null;
    state.rafId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(tick) : null;
  };

  const stopEngine = (): void => {
    state.ticking = false;
    if (state.rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(state.rafId);
    }
    state.rafId = null;
    state.lastTickTs = null;
  };

  const setMode = (mode: ScrollMode): void => {
    if (state.mode === mode) return;
    stopEngine();
    resetForMode(mode);
    // Leave engine stopped; orchestrators decide when to start based on mode.
  };

  const getMode = (): ScrollMode => state.mode;

  const setTargetSpeed = (pxPerSec: number): void => {
    const v = Number(pxPerSec);
    state.targetSpeedPxPerSec = Number.isFinite(v) && v > 0 ? v : 0;
  };

  const setMetrics = (pxPerLine: number, pxPerWord: number): void => {
    const line = Number(pxPerLine);
    const word = Number(pxPerWord);
    if (Number.isFinite(line) && line > 0) state.pxPerLine = line;
    if (Number.isFinite(word) && word > 0) state.pxPerWord = word;
  };

  const reportAsrSample = (sample: AdaptSample): void => {
    if (state.mode !== 'hybrid') return;
    if (!sample || typeof sample.errPx !== 'number') return;
    const ts = typeof sample.ts === 'number' ? sample.ts : now();
    state.pll.errPx = sample.errPx;
    state.pll.lastErrTs = ts;
    const alpha = state.pll.smoothFactor;
    state.pll.smoothedErr = state.pll.smoothedErr * (1 - alpha) + sample.errPx * alpha;
  };

  const reportAsrSilence = (isSilent: boolean, ts: number): void => {
    state.silence.isSilent = !!isSilent;
    state.silence.lastChangeTs = typeof ts === 'number' ? ts : now();
  };

  const centerOnLine = (lineIndex: number): void => {
    state.lastCenteredLine = Number.isFinite(lineIndex) ? Math.max(0, Math.floor(lineIndex)) : null;
    // No viewport movement in Phase 1.
  };

  const nudge = (deltaPx: number): void => {
    const delta = Number(deltaPx);
    if (!Number.isFinite(delta) || delta === 0) return;
    state.manualNudgePx += delta;
    // Nudge is stored; no scrolling in Phase 1.
  };

  return {
    setMode,
    getMode,
    startEngine,
    stopEngine,
    setTargetSpeed,
    setMetrics,
    reportAsrSample,
    reportAsrSilence,
    centerOnLine,
    nudge,
    // Legacy shims
    setBaseSpeedPx: (px) => {
      const val = Number(px);
      if (Number.isFinite(val)) {
        state.targetSpeedPxPerSec = val;
        state.effectiveSpeedPxPerSec = val;
      }
    },
    onManualSpeedAdjust: (delta) => {
      const d = Number(delta);
      if (Number.isFinite(d)) {
        state.targetSpeedPxPerSec += d;
      }
    },
    getCurrentSpeedPx: () => state.effectiveSpeedPxPerSec,
  };
}

export default createScrollBrain;
