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
  // --- Anti-drift state ---
  let bigErrStart = null; // timestamp when |err| > macro began
  // let lastErr = 0; // (unused)
  // let lastCommitTime = 0; // (unused)
  let lastTargetTop = 0;

  // --- Endgame taper state with hysteresis ---
  const HYS_ENTER = 0; // enter when lastLineTop <= markerY
  const HYS_EXIT = 12; // exit if lastLineTop > markerY + 12px
  const END_EASE_MS = 600;
  const END_MARK_PAD = 8; // px nudge to align marker

  let endState = { armed: false, locked: false, t0: 0, v0: 0 };

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function lastVisibleLine(lineEls) {
    for (let i = lineEls.length - 1; i >= 0; i--) {
      const el = lineEls[i];
      if (!el) continue;
      if (el.offsetParent && el.offsetHeight > 0 && el.getClientRects().length) {
        return el;
      }
    }
    return null;
  }

  function computeMarkerY(viewer, markerPct) {
    const r = viewer.getBoundingClientRect();
    return r.top + viewer.clientHeight * (markerPct ?? 0.4);
  }

  // Helper: check if at bottom of doc
  // function atBottom() { ... } // (unused)
  /**
   * Drop-in scroll logic for immediate/snap vs. ease mode.
   * Call on every confirmed match or animation tick while speaking.
   * @param {Object} params
   * @param {number} params.yActive - Desired scroll position (target).
   * @param {number} params.yMarker - Current marker position (highlight).
   * @param {number} params.scrollTop - Current scroll position.
   * @param {number} params.maxScrollTop - Maximum allowed scroll position.
   * @param {number} params.now - Current time (optional, for future use).
   * @returns {{targetTop:number, mode:'snap'|'ease'}|null}
   */
  function controlScroll({
    yActive,
    yMarker,
    scrollTop,
    maxScrollTop,
    now,
    markerOffset = 0,
    sim = 1,
    stallFired = false,
  }) {
    const err = yActive - yMarker;
    const absErr = Math.abs(err);
    const micro = 12;
    const macro = 120;
    const maxStep = 320;
    const nowTs = now || (A.now ? A.now() : Date.now());

    // --- Hard resync on big error ---
    if (absErr > macro) {
      if (!bigErrStart) bigErrStart = nowTs;
      if (nowTs - bigErrStart > 300) {
        // Hard snap, skip easing/debouncers
        // lastCommitTime = nowTs; // (removed, unused)
        // lastErr = 0; // (removed, unused)
        bigErrStart = null;
        let snapTop = yActive - markerOffset;
        snapTop = Math.max(0, Math.min(snapTop, maxScrollTop));
        return { targetTop: snapTop, mode: 'snap' };
      }
    } else {
      bigErrStart = null;
    }

    // --- Calm mode bypass when behind or stalled ---
    let allowFastLane = absErr > macro || (stallFired && sim >= 0.85);

    // --- Bottom-of-doc safety ---
    if (scrollTop >= maxScrollTop - 2 && absErr > 0) {
      // At bottom, can't scroll further; shrink step to zero
      return { targetTop: maxScrollTop, mode: 'bottom' };
    }

    // --- Small errors: gentle easing (proportional) ---
    if (absErr <= micro) return null;

    // --- Large errors: snap closer in one go (clamped) ---
    const step = allowFastLane ? Math.min(absErr, maxStep) : Math.ceil(absErr * 0.35);
    let targetTop = scrollTop + Math.sign(err) * step;
    targetTop = Math.max(0, Math.min(targetTop, maxScrollTop));

    // --- Clamp to marker lock after commit ---
    if (Math.abs(targetTop - lastTargetTop) > 0) {
      // After scroll, if |err| < micro, snap remainder
      const postErr = yActive - (targetTop + markerOffset);
      if (Math.abs(postErr) < micro) {
        targetTop = yActive - markerOffset;
      }
      lastTargetTop = targetTop;
    }

    return { targetTop, mode: allowFastLane ? 'snap' : 'ease' };
  }
  const log = telemetry || (() => {});

  // Adapters with sensible browser defaults
  const root = document.scrollingElement || document.documentElement;
  const A = {
    getViewerTop: adapters.getViewerTop || (() => root.scrollTop || 0),
    requestScroll:
      adapters.requestScroll ||
      ((top) => {
        // Use scheduler to coalesce DOM writes
        try {
          const sched = window.__tpRequestWrite;
          if (typeof sched === 'function') {
            sched(() => {
              try {
                root.scrollTop = top;
              } catch {}
            });
            return;
          }
        } catch {}
        root.scrollTop = top;
      }),
    getViewportHeight:
      adapters.getViewportHeight || (() => root.clientHeight || window.innerHeight || 0),
    getViewerElement: adapters.getViewerElement || (() => document.getElementById('viewer')),
    emit:
      adapters.emit ||
      ((event, data) => {
        // Default: dispatch custom event on window
        window.dispatchEvent(new CustomEvent(event, { detail: data }));
      }),
    now: adapters.now || (() => (window.performance ? performance.now() : Date.now())),
    raf: adapters.raf || ((cb) => requestAnimationFrame(cb)),
  };

  // Controller state
  let mode = 'follow'; // "follow" | "calm"
  let targetTop = 0; // where we want to be
  let lastT = A.now();
  let v = 0; // estimated velocity (px/s)
  let pendingRaf = 0;

  // Tunables - adjusted for responsive control with hysteresis
  const Kp = 0.25; // proportional gain (more responsive)
  const Kd = 0.15; // derivative gain (moderate damping)
  const Kff = 0.6; // feed-forward gain (better speed tracking)
  const MAX_STEP = 2000; // max px movement per tick (increased for faster corrections)
  // const SNAP_EPS = 0.5; // snap when close enough (unused)
  const WAKE_EPS = 8; // require this error to (re)start RAF loop

  function step() {
    pendingRaf = 0;
    const t = A.now();
    const dt = Math.max(0.001, (t - lastT) / 1000); // seconds
    lastT = t;

    const viewerTop = A.getViewerTop();
    const maxScrollTop = Math.max(0, (root.scrollHeight || 0) - (A.getViewportHeight() || 0));
    // Use the integrated controlScrollStep to decide scroll action
    const ctrl = controlScroll({
      yActive: targetTop,
      yMarker: viewerTop,
      scrollTop: viewerTop,
      maxScrollTop,
      now: t,
    });
    if (ctrl) {
      if (ctrl.mode === 'snap') {
        // Immediate set, no batching/debounce
        A.requestScroll(ctrl.targetTop);
        log('scroll', { tag: 'scroll', top: ctrl.targetTop, mode: 'snap' });
      } else {
        // Smooth path (existing logic)
        // Basic PD + feed‑forward controller
        const error = targetTop - viewerTop;
        const topDelta = error;

        // --- Endgame taper & bottom lock with hysteresis ---
        const viewerEl = A.getViewerElement();
        const maxTop = viewerEl ? Math.max(0, viewerEl.scrollHeight - viewerEl.clientHeight) : 0;
        const atBottom = viewerTop >= maxTop - 0.5;

        // Calculate marker position
        const markerPct =
          typeof window !== 'undefined' && typeof window.__TP_MARKER_PCT === 'number'
            ? window.__TP_MARKER_PCT
            : 0.4;
        const markerY = computeMarkerY(viewerEl, markerPct);

        // Find last visible line
        const lastEl = lastVisibleLine(this._lineEls || []);
        const lastTop = lastEl ? lastEl.getBoundingClientRect().top : Infinity;

        // Hysteresis-based arming/reset
        if (!endState.locked) {
          if (!endState.armed && lastTop <= markerY + HYS_ENTER) {
            endState.armed = true;
            endState.t0 = A.now();
            endState.v0 = v;
            A.emit('end:armed', { lastTop, markerY });
            // optional: small "pad" nudge so text aligns nicely
            const target = Math.min(maxTop, Math.max(0, viewerTop + END_MARK_PAD));
            if (target !== viewerTop) {
              A.requestScroll(target);
              return; // exit early for this frame
            }
          } else if (endState.armed && lastTop > markerY + HYS_EXIT) {
            // reader scrolled back up or new content caused reflow
            endState = { armed: false, locked: false, t0: 0, v0: 0 };
            A.emit('end:retracted', { lastTop, markerY });
          }
        }

        // WRITES: taper & lock, one-way
        let currentV = v;
        if (endState.armed && !endState.locked) {
          const t = Math.min(1, (A.now() - endState.t0) / END_EASE_MS);
          currentV = endState.v0 * (1 - easeOutCubic(t)); // v -> 0

          // Snap & lock when at bottom or eased ~0
          if (atBottom || currentV < 0.5) {
            A.requestScroll(maxTop);
            v = 0; // reset velocity
            endState.locked = true;
            A.emit('end:reached', { top: maxTop, t });
            return; // exit early
          }
        }

        // If locked, hard-guard
        if (endState.locked) {
          if (!atBottom) A.requestScroll(maxTop);
          v = 0;
          return;
        }

        const accel =
          Kp * error - Kd * currentV + Kff * (topDelta / Math.max(1, A.getViewportHeight()));
        v += accel * dt * 1000;
        let stepPx = v * dt;
        if (!Number.isFinite(stepPx)) stepPx = 0;
        stepPx = Math.max(-MAX_STEP, Math.min(MAX_STEP, stepPx));
        const nextTop = viewerTop + stepPx;
        A.requestScroll(nextTop);
        log('scroll', { tag: 'scroll', top: nextTop, mode: 'ease' });
        if (Math.abs(targetTop - nextTop) > WAKE_EPS) {
          pendingRaf = A.raf(step);
        }
      }
    } else {
      // If ctrl is null, error is within micro threshold; do nothing
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
     * Force-align the committed line to the marker line (eliminates drift).
     * @param {number} idx - The committed line index.
     * @param {number} markerY - The Y position of the marker line (relative to viewport).
     */
    forceAlignToMarker(idx, markerY) {
      const el = this.getLineElement(idx);
      if (!el) {
        console.warn('[forceAlignToMarker] No element for idx', idx);
        return;
      }
      // Visual flash for debug
      try {
        el.style.transition = 'background 0.2s';
        el.style.background = '#ff0';
        setTimeout(() => {
          el.style.background = '';
        }, 200);
      } catch {}
      // Get bounding rect of the line element
      const rect = el.getBoundingClientRect();
      // Get current scroll position
      const viewerTop = A.getViewerTop();
      // Calculate the offset from the top of the viewport to the marker
      // markerY is relative to viewport (e.g., center of screen or fixed marker)
      // rect.top is relative to viewport
      const delta = rect.top - markerY;
      // Set scrollTop so the line aligns with the marker
      const newScrollTop = Math.max(0, viewerTop + delta);
      // Log to browser console
      console.debug('[forceAlignToMarker]', {
        idx,
        markerY,
        rectTop: rect.top,
        viewerTop,
        delta,
        newScrollTop,
      });
      // Log to HUD/dump with full detail
      log('scroll', {
        tag: 'force-align',
        idx,
        markerY,
        rectTop: rect.top,
        viewerTop,
        delta,
        newScrollTop,
        ts: Date.now(),
      });
      A.requestScroll(newScrollTop);
    },
    /**
     * Fast O(1) lookup array, built by buildLineIndex
     * @param {Array<HTMLElement|null>} lineEls
     */
    setLineElements(lineEls) {
      this._lineEls = Array.isArray(lineEls) ? lineEls : [];
    },

    /**
     * Get element for a given bestIdx, null if missing
     * @param {number} idx
     * @returns {HTMLElement|null}
     */
    getLineElement(idx) {
      if (!this._lineEls || idx == null) return null;
      return this._lineEls[idx] ?? null;
    },

    /**
     * Optional: resilient nearest lookup when exact index missing
     * @param {number} idx
     * @param {number} [radius=20]
     * @returns {HTMLElement|null}
     */
    getNearestLineElement(idx, radius = 20) {
      const list = this._lineEls || [];
      if (list[idx]) return list[idx];
      for (let d = 1; d <= radius; d++) {
        if (idx - d >= 0 && list[idx - d]) return list[idx - d];
        if (idx + d < list.length && list[idx + d]) return list[idx + d];
      }
      return null;
    },
    _lineEls: [],
    /**
     * Drop-in scroll logic for immediate/snap vs. ease mode.
     * Call on every confirmed match or animation tick while speaking.
     * @param {Object} params
     * @param {number} params.yActive - Desired scroll position (target).
     * @param {number} params.yMarker - Current marker position (highlight).
     * @param {number} params.scrollTop - Current scroll position.
     * @param {number} params.maxScrollTop - Maximum allowed scroll position.
     * @param {number} params.now - Current time (optional, for future use).
     * @returns {{targetTop:number, mode:'snap'|'ease'}|null}
     */
    controlScrollStep: controlScroll,
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

    /**
     * Check if the controller is actively scrolling.
     * @returns {boolean}
     */
    isActive() {
      return pendingRaf !== 0 || Math.abs(targetTop - A.getViewerTop()) > 1;
    },

    /**
     * Reset endgame state for new docs, rewinds, or mode changes.
     */
    resetEndgame() {
      endState = { armed: false, locked: false, t0: 0, v0: 0 };
    },
  };
}

// import { buildLineIndex } from "./line-index.js"; // (unused)

// function onScriptRendered(container, controller) { ... } // (unused)
