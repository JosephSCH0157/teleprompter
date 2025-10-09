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
  try {
    // Signal to clamp guard that we're in continuous catch-up mode
    window.__tpCatchupActive = true;
  } catch {}
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
      // Error is measured as how far the anchor sits below the target within the viewport.
      // Positive err => anchor is too low (large Y), so we should scroll down (increase scrollTop).
      // Negative err => anchor is too high, so we should scroll up (decrease scrollTop).
      let err = anchorY - targetY;
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
  try {
    window.__tpCatchupActive = false;
  } catch {}
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
    lastClampAt: 0,
    lastClampIdx: -1,
    lastBestIdx: -1,
    seenHits: 0,
    // Leaky integrator for micro-clamps when not in catch-up
    accumDelta: 0,
    accumDir: 0,
    lastLeakAt: 0,
  };

  // Monotonic commit with hysteresis and per-commit jump cap
  const STABLE_HITS = typeof window.__tpStableHits === 'number' ? window.__tpStableHits : 2; // require staying on candidate across frames
  const FWD_SIM = 0.82; // forward threshold
  const BACK_SIM = 0.86; // stricter to backtrack
  const MAX_STEP = typeof window.__tpMaxCommitStep === 'number' ? window.__tpMaxCommitStep : 6; // cap per-commit move in indices

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

  // Helper to wrap a provided core scrollToCurrentIndex with commit gating and metadata updates
  function __installCommitGateInternal(coreFn) {
    if (typeof coreFn !== 'function') return;
    // Avoid double-wrapping
    if (
      typeof window.scrollToCurrentIndex === 'function' &&
      window.scrollToCurrentIndex.__tpCommitWrapped
    ) {
      return;
    }
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
        coreFn();
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

    function gatedScrollToCurrentIndex() {
      try {
        const bestIdx = window.currentIndex;
        const sim = window.__lastSimScore ?? 1;
        const now = performance.now();

        // Relax commit gating near end (last 20%): lower sim/hits thresholds
        let anchorRatio = 0,
          docRatio = 0;
        try {
          if (typeof window.__tpGetAnchorRatio === 'function')
            anchorRatio = window.__tpGetAnchorRatio();
        } catch {}
        try {
          const v = document.getElementById('viewer');
          if (v) {
            const max = Math.max(0, v.scrollHeight - v.clientHeight);
            const top = Math.max(0, v.scrollTop || 0);
            docRatio = max ? top / max : 0;
          }
        } catch {}
        const NEAR_END = anchorRatio > 0.38 || docRatio > 0.72;

        // Hysteresis commit: only commit after stability across frames, with direction-specific thresholds
        // Respect jitter elevation from main module and allow dynamic tuning from main app (__tpGateFwdSim/__tpGateBackSim)
        let effFwd = typeof window.__tpGateFwdSim === 'number' ? window.__tpGateFwdSim : FWD_SIM,
          effBack = typeof window.__tpGateBackSim === 'number' ? window.__tpGateBackSim : BACK_SIM;
        let needHitsAdj = 0;
        if (NEAR_END) {
          effFwd = Math.min(effFwd, 0.68); // allow lower sim
          effBack = Math.min(effBack, 0.7);
          needHitsAdj = -1; // require fewer stable hits
        }
        try {
          const J = window.__tpJitter || {};
          const elevated = typeof J.spikeUntil === 'number' && now < J.spikeUntil;
          if (elevated) {
            effFwd += 0.06;
            effBack += 0.06;
          }
        } catch {}

        // Track persistence of bestIdx regardless of sim-threshold pass/fail
        if (bestIdx === S.lastBestIdx) {
          S.seenHits++;
        } else {
          S.lastBestIdx = bestIdx;
          S.seenHits = 1;
          S.lastBestAt = now;
        }

        const movingBack = bestIdx < S.committedIdx;
        const deltaIdx = bestIdx - S.committedIdx;
        const adelta = Math.abs(deltaIdx);

        // Single-line stability/time gating to reduce oscillation
        const singleDebounceMs =
          typeof window.__tpSingleDebounceMs === 'number' ? window.__tpSingleDebounceMs : 220;
        const singleFreezeMs =
          typeof window.__tpSingleFreezeMs === 'number' ? window.__tpSingleFreezeMs : 140;

        // If within a short freeze window after a single-line commit, ignore further +/-1 flips
        if (adelta === 1 && typeof S.singleFreezeUntil === 'number' && now < S.singleFreezeUntil) {
          logEv({
            tag: 'match:gate',
            reason: 'single-freeze',
            bestIdx,
            committedIdx: S.committedIdx,
          });
          return;
        }
        const ok = (!movingBack && sim >= effFwd) || (movingBack && sim >= effBack);
        if (!ok) {
          S.stableHits = 0;

          // Fallback: if we've stalled without commits for a while but the bestIdx
          // persists ahead by a noticeable gap with moderate confidence, take a small step.
          const RECOMMIT_MS =
            typeof window.__tpRecommitMs === 'number' ? window.__tpRecommitMs : 1500;
          const RECOMMIT_SIM_LOW =
            typeof window.__tpRecommitSimLow === 'number' ? window.__tpRecommitSimLow : 0.5;
          const RECOMMIT_GAP =
            typeof window.__tpRecommitGap === 'number' ? window.__tpRecommitGap : 6;
          const RECOMMIT_HITS =
            typeof window.__tpRecommitHits === 'number' ? window.__tpRecommitHits : 3;

          const stalledLong = S.lastCommitAt ? now - S.lastCommitAt >= RECOMMIT_MS : false;
          const forwardDrift = !movingBack && adelta >= RECOMMIT_GAP && sim >= RECOMMIT_SIM_LOW;
          const persistent = S.seenHits >= RECOMMIT_HITS;
          if (stalledLong && forwardDrift && persistent) {
            const dir = Math.sign(deltaIdx);
            // Take a conservative step to avoid overshoot; capped by MAX_STEP
            const step = Math.max(1, Math.min(adelta, Math.min(MAX_STEP, 3)));
            const commitIdx = S.committedIdx + dir * step;
            applyCommitThrottled(commitIdx);
            S.singleFreezeUntil = 0; // do not enforce single-line freeze on fallback
            logEv({
              tag: 'match:commit:fallback',
              reason: 'low-sim-stall',
              bestIdx,
              committedIdx: S.committedIdx,
              sim,
              step,
              adelta,
              stalledMs: Math.floor(now - S.lastCommitAt),
            });
            return;
          }

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

        // Require extra stability/time for single-line commits
        let needHits = STABLE_HITS + needHitsAdj;
        if (adelta === 1) needHits += movingBack ? 2 : 1;
        if (S.stableHits < needHits) {
          logEv({
            tag: 'match:gate',
            reason: 'unstable',
            bestIdx,
            pendingIdx: S.pendingIdx,
            hits: S.stableHits,
            need: needHits,
          });
          return;
        }

        // Time gate for single-line commits
        if (adelta === 1 && S.lastCommitAt && now - S.lastCommitAt < singleDebounceMs) {
          logEv({
            tag: 'match:gate',
            reason: 'single-debounce',
            since: Math.floor(now - S.lastCommitAt),
            needMs: singleDebounceMs,
            bestIdx,
            committedIdx: S.committedIdx,
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

        // After committing a single step, set a brief freeze to resist ping-pong
        if (adelta === 1) {
          S.singleFreezeUntil = now + singleFreezeMs;
        } else {
          S.singleFreezeUntil = 0;
        }
      } catch (e) {
        logEv({ tag: 'match:gate:error', e: String(e) });
      }
    }
    // Mark and install
    try {
      gatedScrollToCurrentIndex.__tpCommitWrapped = true;
      window.scrollToCurrentIndex = gatedScrollToCurrentIndex;
    } catch {}
  }

  // Expose installer on window for late binding from core
  try {
    window.__tpInstallCommitGate = function (coreFn) {
      __installCommitGateInternal(coreFn);
    };
  } catch {}

  // Wrap existing scrollToCurrentIndex if present on window at load time
  const _origScrollToCurrentIndex = window.scrollToCurrentIndex;
  if (typeof _origScrollToCurrentIndex === 'function') {
    __installCommitGateInternal(_origScrollToCurrentIndex);
  }

  // Throttle identical clamps (call this inside your clamp function)
  window.__tpClampGuard = function (targetY, _maxY) {
    if (typeof targetY !== 'number') return true;
    const now =
      typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const inCatchup = !!(typeof window !== 'undefined' && window.__tpCatchupActive);
    // During a short stall-rescue window, or when we're near the document bottom,
    // relax clamp rules so small corrections and modest jumps aren't vetoed by sticky/min-delta.
    const stallRelax = !!(
      typeof window !== 'undefined' &&
      typeof window.__tpStallRelaxUntil === 'number' &&
      now < window.__tpStallRelaxUntil
    );
    const docBottomish = (function () {
      try {
        const max = typeof _maxY === 'number' ? _maxY : 0;
        if (max <= 0) return false;
        const r = targetY / max;
        const thr =
          typeof window !== 'undefined' && typeof window.__tpClampDocRelaxRatio === 'number'
            ? window.__tpClampDocRelaxRatio
            : 0.7;
        return r > thr;
      } catch {
        return false;
      }
    })();
    // Near-bottom anti-backscroll: when bottomish, avoid upward moves beyond a tiny tolerance
    // to prevent visible "pull up" near the end. Allow very small settling moves.
    if (S.lastClampY >= 0 && docBottomish) {
      const up = targetY < S.lastClampY;
      if (up) {
        const upDelta = Math.abs(targetY - S.lastClampY);
        const MAX_UP_PX =
          typeof window !== 'undefined' && typeof window.__tpClampMaxUpPxNearBottom === 'number'
            ? window.__tpClampMaxUpPxNearBottom
            : 2; // tiny settling only
        if (upDelta > MAX_UP_PX) {
          logEv({
            tag: 'scroll:clamp-bottom-up-skip',
            targetY,
            last: S.lastClampY,
            upDelta,
            maxUp: MAX_UP_PX,
          });
          return false;
        }
      }
    }
    // First-time initialization
    if (S.lastClampY < 0) {
      S.lastClampY = targetY;
      S.lastClampAt = now;
      try {
        S.lastClampIdx = typeof window.currentIndex === 'number' ? window.currentIndex : -1;
      } catch {
        S.lastClampIdx = -1;
      }
      S.accumDelta = 0;
      S.accumDir = 0;
      S.lastLeakAt = now;
      return true;
    }
    const delta = Math.abs(targetY - S.lastClampY);
    // In continuous catch-up mode, allow fine-grained steps to pass through the guard.
    // Otherwise, use a leaky integrator to periodically allow micro re-clamps in a consistent direction
    // so we don't get stuck hovering near the bottom.
    let leakyPass = false;
    if (!inCatchup && delta < G.minClampDeltaPx) {
      const dir = Math.sign(targetY - S.lastClampY);
      if (dir === 0) {
        logEv({ tag: 'scroll:clamp-skip', targetY, last: S.lastClampY, delta });
        return false;
      }
      if (S.accumDir === dir) S.accumDelta += delta;
      else {
        S.accumDir = dir;
        S.accumDelta = delta;
      }
      const timeSinceLast = now - (S.lastLeakAt || 0);
      const LEAK_INTERVAL_MS =
        typeof window.__tpClampLeakMs === 'number' ? window.__tpClampLeakMs : 420;
      const LEAK_MIN_DELTA =
        typeof window.__tpClampLeakMinPx === 'number' ? window.__tpClampLeakMinPx : 8;
      if (S.accumDelta >= G.minClampDeltaPx) {
        leakyPass = true;
        logEv({
          tag: 'scroll:clamp-leak-pass',
          targetY,
          last: S.lastClampY,
          delta,
          accum: S.accumDelta,
          dir,
        });
      } else if (timeSinceLast >= LEAK_INTERVAL_MS && delta >= LEAK_MIN_DELTA) {
        leakyPass = true;
        logEv({
          tag: 'scroll:clamp-time-pass',
          targetY,
          last: S.lastClampY,
          delta,
          accum: S.accumDelta,
          dir,
          ms: Math.floor(timeSinceLast),
        });
      } else {
        // If we're in a relaxed window (stall rescue) or near the document bottom,
        // permit this micro step to avoid bottom-hover stalls.
        if (stallRelax || docBottomish) {
          leakyPass = true;
          logEv({
            tag: 'scroll:clamp-relax-pass',
            targetY,
            last: S.lastClampY,
            delta,
            accum: S.accumDelta,
            dir,
            context: stallRelax ? 'stall' : 'doc',
          });
        } else {
          logEv({
            tag: 'scroll:clamp-skip',
            targetY,
            last: S.lastClampY,
            delta,
            accum: S.accumDelta,
            dir,
          });
          return false;
        }
      }
    }

    // Sticky guard: if we're trying to reclamp the same index within a short window
    // and the target Y is within a modest band, skip to avoid visible top flipping.
    // While auto catch-up is active, disable sticky suppression to allow smooth continuous motion.
    const stickyMs =
      inCatchup || leakyPass || stallRelax || docBottomish
        ? 0
        : typeof window.__tpClampStickyMs === 'number'
          ? window.__tpClampStickyMs
          : 600;
    const stickyPx =
      inCatchup || leakyPass || stallRelax || docBottomish
        ? 0
        : typeof window.__tpClampStickyPx === 'number'
          ? window.__tpClampStickyPx
          : 64;
    let idx = -1;
    try {
      idx = typeof window.currentIndex === 'number' ? window.currentIndex : -1;
    } catch {}
    if (!(inCatchup || leakyPass || stallRelax || docBottomish)) {
      if (
        idx === S.lastClampIdx &&
        S.lastClampAt &&
        now - S.lastClampAt < stickyMs &&
        Math.abs(targetY - S.lastClampY) < stickyPx
      ) {
        logEv({
          tag: 'scroll:clamp-sticky',
          targetY,
          last: S.lastClampY,
          delta,
          idx,
          since: Math.floor(now - S.lastClampAt),
          stickyMs,
          stickyPx,
        });
        return false;
      }
    }

    // Accept this clamp and record
    S.lastClampY = targetY;
    S.lastClampAt = now;
    S.lastClampIdx = idx;
    if (leakyPass && S.accumDir) {
      // Reduce accumulator by the applied delta in the same direction, keep leftover to continue smooth drift
      S.accumDelta = Math.max(0, S.accumDelta - delta);
      S.lastLeakAt = now;
    } else if (inCatchup) {
      // Catch-up writes reset the leak timers/accum to avoid double-counting
      S.accumDelta = 0;
      S.accumDir = 0;
      S.lastLeakAt = now;
    }
    if (inCatchup) {
      logEv({ tag: 'scroll:clamp-catchup', targetY, last: S.lastClampY, delta });
    }
    return true;
  };

  // ===== Recovery spot marker (telemetry-only) =====
  // Non-invasive: lets us record a snapshot for later rescue logic.
  (function installRecoveryMarker() {
    if (typeof window.__tpMarkRecoverySpot === 'function') return; // idempotent
    const spots = [];
    function getAnchorRatio() {
      try {
        const viewer =
          document.getElementById('viewer') ||
          document.scrollingElement ||
          document.documentElement ||
          document.body;
        const h = Math.max(1, viewer.clientHeight || 1);
        // Prefer IO anchor if present
        const vis =
          window.__anchorObs && typeof window.__anchorObs.mostVisibleEl === 'function'
            ? window.__anchorObs.mostVisibleEl()
            : null;
        const el = vis || document.querySelector('#script p.active') || null;
        if (el && viewer && typeof el.getBoundingClientRect === 'function') {
          const er = el.getBoundingClientRect();
          const vr = viewer.getBoundingClientRect ? viewer.getBoundingClientRect() : { top: 0 };
          const anchorY = er.top - vr.top;
          return Math.max(0, Math.min(1, anchorY / h));
        }
      } catch {}
      return null;
    }
    // Expose minimal commit metadata for stall detection
    if (typeof window.__tpGetCommitMeta !== 'function') {
      window.__tpGetCommitMeta = function () {
        try {
          return {
            lastCommitAt: S.lastCommitAt || 0,
            lastCommitIdx: S.lastCommitIdx || 0,
            committedIdx: S.committedIdx || 0,
          };
        } catch {
          return { lastCommitAt: 0, lastCommitIdx: 0, committedIdx: 0 };
        }
      };
    }
    window.__tpMarkRecoverySpot = function (reason, extra) {
      try {
        const now =
          typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        const viewer =
          document.getElementById('viewer') ||
          document.scrollingElement ||
          document.documentElement ||
          document.body;
        const max = Math.max(0, (viewer.scrollHeight || 0) - (viewer.clientHeight || 0));
        const top = viewer.scrollTop || 0;
        const ratio = max ? top / max : 0;
        const anchorRatio = getAnchorRatio();
        const rec = {
          tag: 'recovery:mark',
          t: now,
          reason: reason || 'manual',
          committedIdx: S.committedIdx,
          lastCommitAt: S.lastCommitAt,
          pendingIdx: S.pendingIdx,
          lastBestIdx: S.lastBestIdx,
          sim: typeof window.__lastSimScore === 'number' ? window.__lastSimScore : null,
          currentIndex: typeof window.currentIndex === 'number' ? window.currentIndex : null,
          scrollTop: top,
          scrollRatio: ratio,
          anchorRatio,
          jitter: window.__tpJitter || null,
          extra: extra || null,
        };
        spots.push(rec);
        try {
          window.__tpRecoverySpots = spots;
        } catch {}
        _dbg(rec);
        return rec;
      } catch (e) {
        _dbg({ tag: 'recovery:mark:error', e: String(e) });
        return null;
      }
    };
  })();
})();
