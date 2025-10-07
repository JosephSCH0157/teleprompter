// Minimal PID-like auto catch-up scroll controller
function _dbg(ev) {
  try {
    if (typeof debug === 'function') debug(ev);
    else if (window && window.HUD) HUD.log(ev.tag || 'log', ev);
  } catch {}
}
let rafId,
  prevErr = 0,
  active = false;

export function startAutoCatchup(getAnchorY, getTargetY, scrollBy) {
  if (active) return;
  active = true;
  prevErr = 0;
  const kP = 0.12; // proportional gain (gentle)
  const kD = 0.1; // derivative gain (damping)
  const vMin = 0.2; // px/frame (deadzone)
  const vMax = 12; // px/frame cap
  const bias = 0; // baseline offset

  _dbg({ tag: 'match:catchup:start' });

  function tick() {
    try {
      const anchorY = getAnchorY(); // current line Y within viewport
      const targetY = getTargetY(); // desired Y (e.g., 0.4 * viewportHeight)
      let err = targetY - anchorY; // positive => line is below target (we need to scroll down)
      const deriv = err - prevErr;
      const vRaw = kP * err + kD * deriv + bias;
      let v = vRaw;

      // Clamp + deadzone
      if (Math.abs(v) < vMin) v = 0;
      v = Math.max(-vMax, Math.min(vMax, v));

      if (v === 0 && Math.abs(vRaw) >= 0) {
        // Deadzone or clamped to zero
        _dbg({
          tag: 'match:catchup:deadzone',
          err,
          deriv,
          vRaw: Number(vRaw.toFixed(3)),
          v: 0,
          vMin,
          vMax,
          anchorY,
          targetY,
        });
      }

      if (v !== 0) {
        try {
          scrollBy(v);
        } catch {}
        _dbg({
          tag: 'match:catchup:apply',
          err,
          deriv,
          vRaw: Number(vRaw.toFixed(3)),
          v: Number(v.toFixed(3)),
          vMin,
          vMax,
          anchorY,
          targetY,
        });
      }
      prevErr = err;
    } catch {}
    if (active) rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}

export function stopAutoCatchup() {
  active = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  _dbg({ tag: 'match:catchup:stop' });
}

// Factory so caller can treat this as a controller instance
export function createScrollController() {
  return {
    startAutoCatchup,
    stopAutoCatchup,
    isActive: () => active,
  };
}

// ===== Scroll & Match Gate (anti-thrash) =====
(function () {
  const G = {
    // index movement policy
    deadbandIdx: 1, // ignore |bestIdx - committedIdx| <= 1
    forwardCommitStep: 2, // allow forward jump if ahead by >= 2
    backwardCommitStep: 2, // allow backward only if behind by >= 2 AND stable twice
    minSimForward: 0.8, // sim threshold to allow forward commit (raised)
    minSimBackward: 0.72, // allow backtrack with decent similarity
    reCommitMs: 650, // allow re-commit if no movement for this long and sim is high
    minSimRecommit: 0.85,

    // scroll/clamp policy
    minClampDeltaPx: 24, // don’t clamp if target Y changed less than this
    bigGapIdx: 18, // if gap >= this, do one-time fast catchup jump
  };

  const S = {
    committedIdx: 0,
    pendingIdx: 0,
    stableHits: 0,
    lastBestAt: 0,
    lastCommitAt: 0,
    lastCommitIdx: 0,
    lastClampY: -1,
  };

  // Monotonic commit with hysteresis and per-commit jump cap
  const STABLE_HITS = 2; // require staying on candidate across frames
  const FWD_SIM = 0.82; // forward threshold
  const BACK_SIM = 0.86; // stricter to backtrack
  const MAX_STEP = 6; // cap per-commit move in indices

  // Minimal throttle helper (~6-8 updates/sec @ 125ms)
  function throttle(fn, wait) {
    let last = 0,
      tId = null,
      lastArgs = null,
      lastThis = null;
    return function throttled() {
      const now =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      lastArgs = arguments;
      lastThis = this;
      const remain = wait - (now - last);
      if (remain <= 0) {
        if (tId) {
          clearTimeout(tId);
          tId = null;
        }
        last = now;
        try {
          return fn.apply(lastThis, lastArgs);
        } catch {}
      } else if (!tId) {
        tId = setTimeout(
          () => {
            last =
              typeof performance !== 'undefined' && performance.now
                ? performance.now()
                : Date.now();
            tId = null;
            try {
              fn.apply(lastThis, lastArgs);
            } catch {}
          },
          Math.max(0, remain)
        );
      }
    };
  }

  // considerCommit helper removed (unused)

  function logEv(ev) {
    try {
      if (typeof debug === 'function') debug(ev);
      else if (window?.HUD) HUD.log(ev.tag || 'log', ev);
    } catch {}
  }

  // Legacy policy helper retained for compatibility; no-op gate now
  window.__tpShouldCommitIdx = function () {
    return true;
  };

  // Wrap existing scrollToCurrentIndex if present on window
  const _origScrollToCurrentIndex = window.scrollToCurrentIndex;
  if (typeof _origScrollToCurrentIndex === 'function') {
    // Throttled applier to coalesce frequent commits
    const applyCommitThrottled = throttle((commitIdx) => {
      try {
        // End-of-script guard
        try {
          const sc =
            document.getElementById('viewer') ||
            document.scrollingElement ||
            document.documentElement ||
            document.body;
          const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
          if (atBottom) return;
        } catch {}
        const __prev = window.currentIndex;
        window.currentIndex = commitIdx;
        _origScrollToCurrentIndex();
      } catch {
      } finally {
        // no-op
      }
      const now =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      S.committedIdx = commitIdx;
      S.lastCommitAt = now;
      S.lastCommitIdx = commitIdx;
      logEv({ tag: 'match:commit', committedIdx: S.committedIdx, sim: window.__lastSimScore ?? 1 });
    }, 125);

    window.scrollToCurrentIndex = function () {
      try {
        const bestIdx = window.currentIndex;
        const sim = window.__lastSimScore ?? 1;
        const now = performance.now();

        // Hysteresis commit: only commit after stability across frames, with direction-specific thresholds
        // Respect jitter elevation from main module
        let effFwd = FWD_SIM,
          effBack = BACK_SIM;
        try {
          const J = window.__tpJitter || {};
          const elevated = typeof J.spikeUntil === 'number' && now < J.spikeUntil;
          if (elevated) {
            effFwd += 0.06;
            effBack += 0.06;
          }
        } catch {}

        const movingBack = bestIdx < S.committedIdx;
        const ok = (!movingBack && sim >= effFwd) || (movingBack && sim >= effBack);
        if (!ok) {
          S.stableHits = 0;
          logEv({
            tag: 'match:gate',
            reason: 'sim-too-low',
            bestIdx,
            committedIdx: S.committedIdx,
            sim,
            effFwd,
            effBack,
            movingBack,
          });
          return;
        }

        if (bestIdx === S.pendingIdx) S.stableHits++;
        else {
          S.pendingIdx = bestIdx;
          S.stableHits = 1;
        }

        if (S.stableHits < STABLE_HITS) {
          logEv({
            tag: 'match:gate',
            reason: 'unstable',
            bestIdx,
            pendingIdx: S.pendingIdx,
            hits: S.stableHits,
            need: STABLE_HITS,
          });
          return;
        }

        // Clamp commit to MAX_STEP towards pending index
        const dir = Math.sign(S.pendingIdx - S.committedIdx) || 0;
        if (dir === 0) {
          return;
        }
        const step = Math.min(Math.abs(S.pendingIdx - S.committedIdx), MAX_STEP);
        const commitIdx = S.committedIdx + dir * step;

        // Use throttled applier to coalesce high-frequency updates
        applyCommitThrottled(commitIdx);
      } catch (e) {
        logEv({ tag: 'match:gate:error', e: String(e) });
      }
    };
  }

  // Throttle identical clamps (call this inside your clamp function)
  window.__tpClampGuard = function (targetY, _maxY) {
    if (typeof targetY !== 'number') return true;
    if (S.lastClampY < 0) {
      S.lastClampY = targetY;
      return true;
    }
    const delta = Math.abs(targetY - S.lastClampY);
    if (delta < G.minClampDeltaPx) {
      logEv({ tag: 'scroll:clamp-skip', targetY, last: S.lastClampY, delta });
      return false;
    }
    S.lastClampY = targetY;
    return true;
  };
})();
