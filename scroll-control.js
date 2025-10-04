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

  // Simple consecutive confirmations gate
  const STABLE_HITS = 2;            // number of consecutive matches to same idx
  const SIM_IMMEDIATE = 0.82;       // immediate commit if idx changed AND sim >= this

  // Minimal throttle helper (~6-8 updates/sec @ 125ms)
  function throttle(fn, wait){
    let last = 0, tId = null, lastArgs = null, lastThis = null;
    return function throttled(){
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      lastArgs = arguments; lastThis = this;
      const remain = wait - (now - last);
      if (remain <= 0){
        if (tId) { clearTimeout(tId); tId = null; }
        last = now;
        try { return fn.apply(lastThis, lastArgs); } catch {}
      } else if (!tId) {
        tId = setTimeout(()=>{
          last = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          tId = null;
          try { fn.apply(lastThis, lastArgs); } catch {}
        }, Math.max(0, remain));
      }
    };
  }

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

  // Legacy policy helper retained for compatibility; not used by the new gate
  window.__tpShouldCommitIdx = function(bestIdx, sim){
    // New simplified rule is implemented in the wrapper below; we keep this to avoid breaking callers.
    const gap = bestIdx - S.committedIdx;
    const absGap = Math.abs(gap);
    if (absGap <= G.deadbandIdx && sim >= 0.85) return false;
    return true;
  };

  // Wrap existing scrollToCurrentIndex if present on window
  const _origScrollToCurrentIndex = window.scrollToCurrentIndex;
  if (typeof _origScrollToCurrentIndex === 'function'){
    // Throttled applier to coalesce frequent commits
    const applyCommitThrottled = throttle((commitIdx)=>{
      try {
        const __prev = window.currentIndex;
        window.currentIndex = commitIdx;
        _origScrollToCurrentIndex();
      } catch {} finally {
        try { window.currentIndex = window.currentIndex; } catch {}
      }
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      S.committedIdx = commitIdx;
      S.lastCommitAt = now;
      S.lastCommitIdx = commitIdx;
      logEv({ tag:'match:commit', committedIdx:S.committedIdx, sim: (window.__lastSimScore ?? 1) });
    }, 125);

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

        // Update stability confirmations for the current bestIdx, only when sim is decent (>= 0.72)
        if (bestIdx === S.lastBestIdx) {
          S.stableHits = (sim >= 0.72) ? (S.stableHits + 1) : 0;
        } else {
          S.lastBestIdx = bestIdx;
          S.stableHits = (sim >= 0.72) ? 1 : 0;
        }

        // New simplified gate:
        // Only scroll when (idx changed && sim >= SIM_IMMEDIATE) OR after STABLE_HITS confirmations.
        const idxChangedFromCommitted = (bestIdx !== S.committedIdx);
        if (!idxChangedFromCommitted) {
          logEv({ tag:'match:gate', reason:'no-idx-change', bestIdx, committedIdx:S.committedIdx, sim });
          return;
        }
        // Respect temporary jitter elevation from main module if present
        let simImmediateEff = SIM_IMMEDIATE;
        try {
          const J = (window.__tpJitter || {});
          const elevated = (typeof J.spikeUntil === 'number') && (performance.now() < J.spikeUntil);
          if (elevated) simImmediateEff = SIM_IMMEDIATE + 0.06;
        } catch {}
        const immediateOk = (sim >= simImmediateEff);
        const confirmationsOk = (sim >= 0.72) && (S.stableHits >= STABLE_HITS);
        if (!immediateOk && !confirmationsOk) {
          logEv({ tag:'match:gate', reason:'await-confirmations', bestIdx, committedIdx:S.committedIdx, sim, hits:S.stableHits, need:STABLE_HITS });
          return;
        }

        // Apply backtrack cap to avoid ping-pong across big spans
        let commitIdx = bestIdx;
        if (bestIdx < S.committedIdx) {
          const capped = Math.max(S.committedIdx - 2, bestIdx);
          if (capped !== bestIdx) {
            logEv({ tag:'match:back-cap', from: S.committedIdx, bestIdx, commitIdx: capped });
          }
          commitIdx = capped;
        }

        // Use throttled applier to coalesce high-frequency updates
        applyCommitThrottled(commitIdx);
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
