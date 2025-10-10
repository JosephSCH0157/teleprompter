// scroll-control.js — browser-only ES module
// A small scroll controller with feed‑forward + damping. No Node/AMD wrappers.

/**
 * @typedef {Object} Adapters
 * @property {() => number} getViewerTop - current scrollTop of the scrolling element.
 * @property {(top:number) => void} requestScroll - schedule an immediate scrollTop set.
 * @property {() => number} getViewportHeight - viewport/client height.
 * @property {() => number} now - high resolution time (e.g., performance.now).
 * @property {(cb:FrameRequestCallback) => number} raf - requestAnimationFrame.
 */

/**
 * @typedef {Object} TelemetryFn
 * @property {(tag:string, data?:any) => void} log
 */

/**
 * Factory
 * @param {Partial<Adapters>} adapters
 * @param {(tag:string, data?:any) => void} [telemetry]
 */
export default function createScrollController(adapters = {}, telemetry) {
  const log = telemetry || (() => {});

  // Adapters with sensible browser defaults
  const root = document.scrollingElement || document.documentElement;
  const A = {
    getViewerTop: adapters.getViewerTop || (() => root.scrollTop || 0),
    requestScroll:
      adapters.requestScroll ||
      ((top) => {
        root.scrollTop = top;
      }),
    getViewportHeight:
      adapters.getViewportHeight || (() => root.clientHeight || window.innerHeight || 0),
    now: adapters.now || (() => (window.performance ? performance.now() : Date.now())),
    raf: adapters.raf || ((cb) => requestAnimationFrame(cb)),
  };

  // Controller state
  let mode = 'follow'; // "follow" | "calm"
  let targetTop = 0; // where we want to be
  let lastT = A.now();
  let v = 0; // estimated velocity (px/s)
  let pendingRaf = 0;

  // Tunables
  const Kp = 0.22; // proportional gain (how strongly we chase error)
  const Kd = 0.18; // derivative gain (damps overshoot)
  const Kff = 0.55; // feed‑forward gain (uses topDelta directly)
  const MAX_STEP = 1600; // max px movement per tick
  const SNAP_EPS = 0.5; // snap when close enough
  const WAKE_EPS = 8; // require this error to (re)start RAF loop

  function step() {
    pendingRaf = 0;
    const t = A.now();
    const dt = Math.max(0.001, (t - lastT) / 1000); // seconds
    lastT = t;

    const viewerTop = A.getViewerTop();
    const error = targetTop - viewerTop;

    // INTENT FOR topDelta:
    // topDelta measures how far we are from target NOW, independent of velocity estimate.
    // We use it as a feed‑forward term to prevent slow drift & stalls when we fall behind.
    const topDelta = error; // alias for clarity in formulas

    // Basic PD + feed‑forward controller
    const accel = Kp * error - Kd * v + Kff * (topDelta / Math.max(1, A.getViewportHeight()));
    v += accel * dt * 1000; // px/s update (scaled)

    // Convert to a bounded step
    let stepPx = v * dt;
    if (!Number.isFinite(stepPx)) stepPx = 0;
    stepPx = Math.max(-MAX_STEP, Math.min(MAX_STEP, stepPx));

    // If we're close, snap and sleep
    if (Math.abs(error) <= SNAP_EPS) {
      if (Math.abs(v) > 1) v *= 0.5;
      A.requestScroll(targetTop);
      log('scroll', { tag: 'scroll', top: targetTop, mode });
      return; // sleep until new target arrives
    }

    const nextTop = viewerTop + stepPx;
    A.requestScroll(nextTop);
    log('scroll', { tag: 'scroll', top: nextTop, mode });

    // Keep animating while there’s meaningful error
    if (Math.abs(targetTop - nextTop) > WAKE_EPS) {
      pendingRaf = A.raf(step);
    }
  }

  function ensureLoop() {
    // Wake the loop only if we are meaningfully off
    if (!pendingRaf && Math.abs(targetTop - A.getViewerTop()) > WAKE_EPS) {
      lastT = A.now();
      pendingRaf = A.raf(step);
    }
  }

  return {
    /**
     * Push a new target. If you already know the absolute top, pass it here.
     * @param {{top:number}} param0
     */
    requestScroll({ top }) {
      if (typeof top === 'number' && Number.isFinite(top)) {
        targetTop = top;
        ensureLoop();
      }
    },

    /**
     * Convenience helper when you only know a delta you’d like to cover.
     * @param {number} delta
     */
    nudge(delta) {
      if (!Number.isFinite(delta)) return;
      targetTop = (A.getViewerTop() || 0) + delta;
      ensureLoop();
    },

    /**
     * Match updates from your alignment engine.
     * Provide an absolute `nextTop` if you have it; otherwise provide an error proxy.
     * @param {{ nextTop?: number, behindPx?: number }} update
     */
    updateMatch(update) {
      try {
        if (typeof update?.nextTop === 'number' && Number.isFinite(update.nextTop)) {
          targetTop = update.nextTop;
        } else if (typeof update?.behindPx === 'number' && Number.isFinite(update.behindPx)) {
          // If we only know we're behind by X pixels, move toward that
          targetTop = (A.getViewerTop() || 0) + update.behindPx;
        }
        ensureLoop();
      } catch {
        // deliberately empty — guard against malformed updates in production
      }
    },

    /**
     * Switch controller profile.
     * "follow": quicker to react; "calm": slower, less jittery.
     */
    setMode(m) {
      mode = m === 'calm' ? 'calm' : 'follow';
      // In "calm" we reduce gains a bit; mild tweak via local closure variables:
      // (Do it by small factors to avoid abrupt changes.)
      // Note: We can’t reassign consts, so damp velocity as a soft reset.
      v *= mode === 'calm' ? 0.6 : 1.0;
    },
  };
}
