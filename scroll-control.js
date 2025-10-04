// Minimal PID-like auto catch-up scroll controller
function _dbg(ev){
  try {
    if (typeof debug === 'function') debug(ev);
    else if (window && window.HUD) HUD.log(ev.tag || 'log', ev);
  } catch {}
}
let rafId, prevErr = 0, active = false;

export function startAutoCatchup(getAnchorY, getTargetY, scrollBy) {
  if (active) return;
  active = true;
  prevErr = 0;
  const kP = 0.12;      // proportional gain (gentle)
  const kD = 0.10;      // derivative gain (damping)
  const vMin = 0.2;     // px/frame (deadzone)
  const vMax = 12;      // px/frame cap
  const bias = 0;       // baseline offset

  _dbg({ tag:'match:catchup:start' });

  function tick() {
    try {
      const anchorY = getAnchorY();     // current line Y within viewport
      const targetY = getTargetY();     // desired Y (e.g., 0.4 * viewportHeight)
      let err = targetY - anchorY;      // positive => line is below target (we need to scroll down)
      const deriv = err - prevErr;
      const vRaw = (kP*err) + (kD*deriv) + bias;
      let v = vRaw;

      // Clamp + deadzone
      if (Math.abs(v) < vMin) v = 0;
      v = Math.max(-vMax, Math.min(vMax, v));

      if (v === 0 && Math.abs(vRaw) >= 0) {
        // Deadzone or clamped to zero
        _dbg({ tag:'match:catchup:deadzone', err, deriv, vRaw: Number(vRaw.toFixed(3)), v: 0, vMin, vMax, anchorY, targetY });
      }

      if (v !== 0) {
        try { scrollBy(v); } catch {}
        _dbg({ tag:'match:catchup:apply', err, deriv, vRaw: Number(vRaw.toFixed(3)), v: Number(v.toFixed(3)), vMin, vMax, anchorY, targetY });
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
  _dbg({ tag:'match:catchup:stop' });
}

// Factory so caller can treat this as a controller instance
export function createScrollController(){
  return {
    startAutoCatchup,
    stopAutoCatchup,
    isActive: () => active
  };
}

// ===== Scroll & Match Gate (anti-thrash) =====
(function(){
  const G = {
    // index movement policy
    deadbandIdx: 1,          // ignore |bestIdx - committedIdx| <= 1
    forwardCommitStep: 2,    // allow forward jump if ahead by >= 2
    backwardCommitStep: 2,   // allow backward only if behind by >= 2 AND stable twice
  minSimForward: 0.80,    // sim threshold to allow forward commit (raised)
  minSimBackward: 0.72,   // allow backtrack with decent similarity
    reCommitMs: 650,         // allow re-commit if no movement for this long and sim is high
    minSimRecommit: 0.85,

    // scroll/clamp policy
    minClampDeltaPx: 24,     // don’t clamp if target Y changed less than this
    bigGapIdx: 18,           // if gap >= this, do one-time fast catchup jump
  };

  const S = {
    committedIdx: 0,
    lastBestIdx: 0,
    lastBestAt: 0,
    lastCommitAt: 0,
    lastCommitIdx: 0,
    backStableCount: 0,
    lastClampY: -1,
      stableHits: 0,
  };

  // Commit hysteresis (stability + confidence)
  // Simple consecutive confirmations gate
  const FWD_MIN_SIM = 0.80;
  const BACK_MIN_SIM = 0.72;
  const STABLE_HITS = 2;

  function considerCommit(now, sim, idx){
    try {
      simBuf.push({ t: now, sim, idx });
      if (simBuf.length > 12) simBuf.shift();
      const recent = simBuf.filter(r => now - r.t <= STABLE_MS);
      if (recent.length < WINDOW) return false;
      const okSim = recent.every(r => r.sim >= SIM_MIN);
      const monotonic = recent.every((r,i,arr) => !i || r.idx >= arr[i-1].idx);
      if (!okSim || !monotonic) return false;
      if (idx <= lastCommit.idx) return false; // forward-only commits
      lastCommit = { t: now, idx };
      return true;
    } catch { return false; }
  }

  function logEv(ev){ try { if (typeof debug==='function') debug(ev); else if (window?.HUD) HUD.log(ev.tag||'log', ev); } catch {} }

  // Helper to decide whether to commit a new index
  window.__tpShouldCommitIdx = function(bestIdx, sim){
    const now = performance.now();
    const gap = bestIdx - S.committedIdx;
    const absGap = Math.abs(gap);

    // Deadband: ignore jitter within ±deadbandIdx if sim is confident
    if (absGap <= G.deadbandIdx && sim >= 0.85) {
      logEv({ tag:'match:gate', reason:'deadband', bestIdx, committedIdx:S.committedIdx, sim });
      return false;
    }

    // Forward movement
    if (gap >= G.forwardCommitStep && sim >= G.minSimForward) {
      S.backStableCount = 0;
      return true;
    }

    // Backward movement — require stability
    if (gap <= -G.backwardCommitStep && sim >= G.minSimBackward) {
      S.backStableCount++;
      if (S.backStableCount >= 2) {
        S.backStableCount = 0;
        return true;
      }
      logEv({ tag:'match:gate', reason:'await-back-stability', bestIdx, committedIdx:S.committedIdx, sim });
      return false;
    } else if (gap > 0) {
      // reset back stability if we moved forward or equal
      S.backStableCount = 0;
    }

    // Staleness unlock: if we haven’t committed in a while and sim is solid, allow it
    if ((now - S.lastCommitAt) > G.reCommitMs && sim >= G.minSimRecommit) {
      return true;
    }

    logEv({ tag:'match:gate', reason:'no-policy-match', bestIdx, committedIdx:S.committedIdx, sim, gap });
    return false;
  };

  // Wrap existing scrollToCurrentIndex if present on window
  const _origScrollToCurrentIndex = window.scrollToCurrentIndex;
  if (typeof _origScrollToCurrentIndex === 'function'){
    window.scrollToCurrentIndex = function(){
      try {
        const bestIdx = window.currentIndex;
        const sim = (window.__lastSimScore ?? 1);
        const now = performance.now();

        // One-time fast catchup for large gaps
        if (Math.abs(bestIdx - S.committedIdx) >= G.bigGapIdx) {
          logEv({ tag:'match:catchup:start', from:S.committedIdx, to:bestIdx });
          _origScrollToCurrentIndex.apply(this, arguments);
          S.committedIdx = bestIdx;
          S.lastCommitAt = now;
          S.lastCommitIdx = bestIdx;
          logEv({ tag:'match:catchup:stop' });
          return;
        }

  // Normal gated commit (policy gate)
        if (!window.__tpShouldCommitIdx(bestIdx, sim)) return;


        // Consecutive stable hits gate (forward and backward)
        const forward = (bestIdx >= S.committedIdx);
        const cond = forward ? (sim >= FWD_MIN_SIM) : (sim >= BACK_MIN_SIM);
        if (cond) { S.stableHits++; } else { S.stableHits = 0; }
        if (S.stableHits < STABLE_HITS) {
          logEv({ tag:'match:gate', reason:'stable-hits', bestIdx, committedIdx:S.committedIdx, sim, hits:S.stableHits, need:STABLE_HITS, forward, FWD_MIN_SIM, BACK_MIN_SIM });
          return;
        }
        S.stableHits = 0;

        // Apply backtrack cap to avoid ping-pong across big spans
        let commitIdx = bestIdx;
        if (bestIdx < S.committedIdx) {
          const capped = Math.max(S.committedIdx - 2, bestIdx);
          if (capped !== bestIdx) {
            logEv({ tag:'match:back-cap', from: S.committedIdx, bestIdx, commitIdx: capped });
          }
          commitIdx = capped;
        }
        // Temporarily commit capped index to the underlying scroller
        const __prev = window.currentIndex;
        try {
          window.currentIndex = commitIdx;
          _origScrollToCurrentIndex.apply(this, arguments);
        } finally {
          window.currentIndex = __prev;
        }
        S.committedIdx = commitIdx;
        S.lastCommitAt = now;
        S.lastCommitIdx = commitIdx;
        logEv({ tag:'match:commit', committedIdx:S.committedIdx, sim });
      } catch (e) {
        logEv({ tag:'match:gate:error', e:String(e) });
      }
    };
  }

  // Throttle identical clamps (call this inside your clamp function)
  window.__tpClampGuard = function(targetY, maxY){
    if (typeof targetY !== 'number') return true;
    if (S.lastClampY < 0) { S.lastClampY = targetY; return true; }
    const delta = Math.abs(targetY - S.lastClampY);
    if (delta < G.minClampDeltaPx) {
      logEv({ tag:'scroll:clamp-skip', targetY, last:S.lastClampY, delta });
      return false;
    }
    S.lastClampY = targetY;
    return true;
  };
})();
