// scroll-control.js
// Clean ES module (no CommonJS/AMD).
// Provides a resilient, anti-stall, PID-like scroll follower.
//
// Usage:
//   import createScrollController from './scroll-control.js';
//   const scroller = createScrollController(adapters, logFn);
//   scroller.updateMatch({ idx, bestIdx, sim, windowAhead });
//   scroller.setMode('follow' | 'calm');
//
// Required adapters:
//   getYForIndex(idx) -> number (px from top of document for transcript line idx)
//   getViewport() -> { top, height, scrollHeight }
//   scrollTo(y, { immediate }) -> void

export default function createScrollController(adapters, log = () => {}) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const now = () => performance.now();

  // Config
  const anchorRatioBase = 0.38; // keep the matched line ~38% from top
  const leadBoostLo = 0.02; // extra lead at low confidence
  const leadBoostHi = 0.08; // extra lead at high confidence
  const ratchetSim = 0.66; // similarity threshold to enable ratchet
  const stallMs = 900; // declare stall if not catching up within this
  const microNudgePx = 1; // minimal nudge to break pixel snapping
  const calmFactor = 0.6; // gentler speed in calm mode

  // PID-ish motion parameters
  const kp = 0.24;
  const kd = 0.18;
  const maxStepLo = 180; // px/frame cap at low confidence
  const maxStepHi = 600; // px/frame cap at high confidence

  const state = {
    mode: 'follow',
    lastTs: now(),
    lastErr: 0,
    lastTop: 0,
    lastBestIdx: -1,
    lastAdvanceTs: now(),
    ratchetIdx: -1,
    ratchetTop: -1,
    targetTop: 0,
  };

  function telemetry(tag, data) {
    try {
      log(tag, data);
    } catch {}
  }

  function desiredAnchorTop(sim) {
    // Increase lead as similarity rises to avoid getting behind
    const boost = leadBoostLo + (leadBoostHi - leadBoostLo) * clamp((sim - 0.5) / 0.5, 0, 1);
    return clamp(anchorRatioBase + boost, 0.2, 0.6);
  }

  function computeTargetTop(bestIdx, sim) {
    const vp = adapters.getViewport();
    const anchor = desiredAnchorTop(sim);
    const yForBest = adapters.getYForIndex(bestIdx);
    let desiredTop = yForBest - anchor * vp.height;
    desiredTop = clamp(desiredTop, 0, Math.max(0, vp.scrollHeight - vp.height));

    // Ratchet: when confident, don't allow the target to move behind bestIdx-2
    if (sim >= ratchetSim) {
      const nextRatchetIdx = Math.max(state.ratchetIdx, bestIdx - 2);
      if (nextRatchetIdx !== state.ratchetIdx) {
        state.ratchetIdx = nextRatchetIdx;
        state.ratchetTop = clamp(
          adapters.getYForIndex(state.ratchetIdx) - anchor * vp.height,
          0,
          Math.max(0, vp.scrollHeight - vp.height)
        );
      }
      if (state.ratchetTop >= 0) {
        desiredTop = Math.max(desiredTop, state.ratchetTop);
      }
    }

    return desiredTop;
  }

  function stepScroll(ts) {
    const vp = adapters.getViewport();
    const dt = Math.max(1, ts - state.lastTs); // ms
    const err = state.targetTop - vp.top;

    // PID-like velocity (no integral term)
    let v = kp * err + kd * ((err - state.lastErr) / dt) * 16.67; // normalize to 60fps

    // Clamp speed based on confidence via targetStep range cached at updateMatch
    const maxStep = state.maxStepPx ?? maxStepLo;
    v = clamp(v, -maxStep, maxStep);

    // Calm mode damps movement
    if (state.mode === 'calm') v *= calmFactor;

    // Apply micro-nudge to break sticky states
    let nextTop = vp.top + v;
    if (Math.abs(err) > 0 && Math.abs(v) < 0.5) {
      nextTop = vp.top + Math.sign(err) * microNudgePx;
    }

    nextTop = clamp(nextTop, 0, Math.max(0, vp.scrollHeight - vp.height));

    const immediate = Math.abs(nextTop - vp.top) <= microNudgePx;
    adapters.scrollTo(nextTop, { immediate });

    state.lastTs = ts;
    state.lastErr = err;
    state.lastTop = nextTop;
  }

  function tick(ts) {
    try {
      stepScroll(ts);
    } catch {}
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    setMode(mode) {
      state.mode = mode === 'calm' ? 'calm' : 'follow';
    },

    updateMatch({ idx, bestIdx, sim = 0, windowAhead = 200 }) {
      // Detect forward progress of recognition
      const vp = adapters.getViewport();
      const prevBest = state.lastBestIdx;
      if (bestIdx > prevBest) {
        state.lastBestIdx = bestIdx;
        state.lastAdvanceTs = now();
      }

      // Compute target top and dynamic max step
      state.targetTop = computeTargetTop(bestIdx, sim);
      const conf = clamp(sim, 0, 1);
      state.maxStepPx = Math.round(maxStepLo + (maxStepHi - maxStepLo) * (conf >= 0.85 ? 1 : conf));

      // Anti-stall: if we haven't moved enough while bestIdx advanced recently, force a bump
      const sinceAdvance = now() - state.lastAdvanceTs;
      const topDelta = Math.abs(vp.top - state.lastTop);
      if (sinceAdvance > stallMs && bestIdx >= prevBest) {
        // Force a forward bump scaled by confidence & viewport
        const bumpBase = clamp(vp.height * (0.08 + 0.12 * conf), 80, 800);
        const forced = clamp(
          state.targetTop + Math.sign(state.targetTop - vp.top) * bumpBase,
          0,
          Math.max(0, vp.scrollHeight - vp.height)
        );
        adapters.scrollTo(forced, { immediate: false });
        telemetry('STALL', {
          idx,
          bestIdx,
          sim: conf,
          time: Math.round(sinceAdvance / 10) / 100,
          atBottom: vp.top + vp.height >= vp.scrollHeight - 2,
        });
        // Refresh timers so we don't spam
        state.lastAdvanceTs = now();
        state.lastTop = forced;
      }

      telemetry('match:sim', { idx, bestIdx, sim: +sim.toFixed(3), windowAhead });
    },
  };
}
