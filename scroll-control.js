// Minimal PID-like auto catch-up scroll controller
function _dbg(ev){
  try {
    if (typeof debug === 'function') debug(ev);
    else if (window && window.HUD) HUD.log(ev.tag || 'log', ev);
  } catch {}
}
// Single-writer micro lock with TTL; simple arbitration across modules
const WriteLock = (()=>{ let owner = null, until = 0; return {
  try(id, ms = 500){
    try {
      const now = performance.now();
      if (now > until || owner === id){ owner = id; until = now + ms; try { if (typeof window!=='undefined') window.__TP_WRITE_OWNER = owner; } catch {} return true; }
      return false;
    } catch { return true; }
  },
  release(id){ try { if (owner === id) { until = 0; owner = null; try { if (typeof window!=='undefined') window.__TP_WRITE_OWNER = null; } catch {} } } catch {} },
  heldBy(){ return owner; }
}; })();
// Global animation/timer state and generation token
let GEN = (typeof window !== 'undefined' && typeof window.__TP_GEN === 'number') ? window.__TP_GEN : 0;
let rafId, prevErr = 0, active = false;
const timers = new Set();
export function nextGen(){ try { GEN = ((typeof window!=='undefined' ? (window.__TP_GEN = ((window.__TP_GEN||0)+1)) : (GEN+1))); } catch { GEN++; } try { if (typeof window!=='undefined') window.__TP_GEN = GEN; } catch {} return GEN; }
export function inGen(g){ try { return g === ((typeof window!=='undefined' && typeof window.__TP_GEN==='number') ? window.__TP_GEN : GEN); } catch { return g === GEN; } }
export function addTimer(id){ try { if (id != null) timers.add(id); } catch {} return id; }
export function clearAllTimers(){ try { timers.forEach(id => { try { clearTimeout(id); } catch {} }); timers.clear(); } catch {} }
export function killMomentum(){ try { const s = (typeof window!=='undefined') ? window.SCROLLER : null; if (s) { try { s.v = 0; } catch {} try { s.stop && s.stop(); } catch {} } } catch {} }
try { if (typeof window!=='undefined'){ window.nextGen = nextGen; window.inGen = inGen; window.addTimer = addTimer; window.clearAllTimers = clearAllTimers; window.killMomentum = killMomentum; } } catch {}
// Unsubscribe handle for ScrollManager onResult during catchup
let __unsubCatchupResult = null;
// Mark document as animating to pause IO rebinds and other churn
function _markAnim(on){
  try {
    const doc = (typeof document !== 'undefined') ? document : null;
    if (doc && doc.documentElement && doc.documentElement.classList) {
      doc.documentElement.classList.toggle('tp-animating', !!on);
    }
    if (typeof window !== 'undefined') window.__TP_ANIMATING = !!on;
  } catch {}
}

// Pin the scroller viewport height during motion (prevents clientHeight flapping)
let __PINNED_H = null;
let __PIN_TARGET = null;
function __getPinTarget(){
  try {
    const sc = (typeof window !== 'undefined' && window.SCROLLER && typeof window.SCROLLER.getContainer==='function') ? window.SCROLLER.getContainer() : null;
    const doc = (typeof document !== 'undefined') ? document : null;
    const viewer = doc ? doc.getElementById('viewer') : null;
    // Prefer the SCROLLER container if it's a real element; otherwise fall back to #viewer
    if (sc && sc !== window && sc !== document && sc !== document.body && sc !== document.documentElement) return sc;
    return viewer;
  } catch { return null; }
}
function __applyPin(){
  try {
    const v = __getPinTarget();
    if (!v) return;
    __PIN_TARGET = v;
    __PINNED_H = v.clientHeight;
    const px = (__PINNED_H|0) + 'px';
    v.style.minHeight = px;
    v.style.maxHeight = px;
    // Include paint containment to fully isolate reflow/paint jitter during motion
    v.style.contain = 'layout size paint';
    try { _dbg({ tag:'ui:pin-viewer', h: __PINNED_H, id: v.id||v.tagName }); } catch {}
  } catch {}
}
function __clearPin(){
  try {
    const v = __PIN_TARGET || __getPinTarget();
    if (!v) return;
    v.style.minHeight = '';
    v.style.maxHeight = '';
    v.style.contain = '';
    try { _dbg({ tag:'ui:unpin-viewer', h: __PINNED_H, id: v.id||v.tagName }); } catch {}
    __PINNED_H = null; __PIN_TARGET = null;
  } catch {}
}
// Reference-counted global pin/unpin (safe across multiple animators)
try { if (typeof window !== 'undefined' && typeof window.__TP_PIN_COUNT !== 'number') window.__TP_PIN_COUNT = 0; } catch {}
export function pinViewport(){ try { if (typeof window !== 'undefined'){ window.__TP_PIN_COUNT = (window.__TP_PIN_COUNT||0) + 1; if (window.__TP_PIN_COUNT === 1) __applyPin(); } else { __applyPin(); } } catch {} }
export function unpinViewport(){ try { if (typeof window !== 'undefined'){ window.__TP_PIN_COUNT = Math.max(0, (window.__TP_PIN_COUNT||0) - 1); if (window.__TP_PIN_COUNT === 0) __clearPin(); } else { __clearPin(); } } catch {} }
try { if (typeof window !== 'undefined'){ window.pinViewport = pinViewport; window.unpinViewport = unpinViewport; } } catch {}
function _startCatchup(){
  try { window.__TP_CATCHUP_ACTIVE = true; } catch {}
  // Mute ensure helpers during animation to avoid fighting
  try { (window.__TP_RUNTIME = (window.__TP_RUNTIME||{ ensureEnabled:true })).ensureEnabled = false; } catch {}
  _markAnim(true);
  pinViewport();
  // Disable pinch/kinetic gestures while catchup owns the scroll
  try {
    const sc = __getPinTarget();
    if (sc && sc.style){
      try { sc.dataset.prevTouchAction = sc.style.touchAction || ''; } catch {}
      sc.style.touchAction = 'none';
    }
  } catch {}
}
function _endCatchup(){
  unpinViewport();
  try { window.__TP_CATCHUP_ACTIVE = false; } catch {}
  _markAnim(false);
  // Restore touch-action after motion ends
  try {
    const sc = __getPinTarget();
    if (sc && sc.style){
      const prev = (sc.dataset && sc.dataset.prevTouchAction) ? sc.dataset.prevTouchAction : '';
      sc.style.touchAction = prev;
      try { if (sc.dataset) delete sc.dataset.prevTouchAction; } catch {}
    }
  } catch {}
  // Keep helpers off briefly to dampen post-stop thrash; re-enable after 300ms
  try {
    const reenable = () => { try { if (window.__TP_RUNTIME) window.__TP_RUNTIME.ensureEnabled = true; } catch {} };
    addTimer(setTimeout(reenable, 300));
  } catch {}
}

export function startAutoCatchup(getAnchorY, getTargetY, scrollBy) {
  if (active) return;
  active = true;
  prevErr = 0;
  const kP = 0.12;      // proportional gain (gentle)
  const kD = 0.10;      // derivative gain (damping)
  const vMin = 0.2;     // px/frame (deadzone)
  const vMax = 12;      // px/frame cap
  const bias = 0;       // baseline offset
  const EPS = 24;       // close-enough tolerance (px)

  _dbg({ tag:'match:catchup:start' });
  _startCatchup();
  // Capture generation at start; bail if invalidated
  const localGen = (typeof window!=='undefined' && typeof window.__TP_GEN==='number') ? window.__TP_GEN : GEN;

  // Stop catchup on ScrollManager signals for bounded advance or explicit close-enough
  try {
    if (typeof window !== 'undefined' && window.SCROLLER && typeof window.SCROLLER.onResult === 'function'){
      __unsubCatchupResult = window.SCROLLER.onResult((ev)=>{
        try {
          if (!active) return;
          const reason = String(ev?.reason||'');
          if (reason === 'accepted:bounded-advance' || reason === 'close-enough') {
            try { _dbg({ tag:'match:catchup:finish', reason }); } catch {}
            stopAutoCatchup();
          }
        } catch {}
      });
    }
  } catch {}

  function tick() {
    try {
      if (!inGen(localGen)) { stopAutoCatchup(); return; }
      const anchorY = getAnchorY();     // current line Y within viewport
      const targetY = getTargetY();     // desired Y (e.g., 0.4 * viewportHeight)
      let err = targetY - anchorY;      // positive => line is below target (we need to scroll down)
      // Early finish if close enough to target band
      try {
          // Invalidate stale frames by generation
          if (!inGen(localGen)) { stopAutoCatchup(); return; }
          const recentBA = (function(){ try { return (window.__tpCatchupLastReason === 'accepted:bounded-advance') && ((performance.now() - (window.__tpCatchupLastAt||0)) < 300); } catch { return false; } })();
          if (Math.abs(err) <= EPS || recentBA) {
          _dbg({ tag:'match:catchup:close-enough', err, anchorY, targetY, EPS });
          stopAutoCatchup();
          return;
        }
      } catch {}
      const deriv = err - prevErr;
      const vRaw = (kP*err) + (kD*deriv) + bias;
      let v = vRaw;

      // Clamp + deadzone
      if (Math.abs(v) < vMin) v = 0;
      v = Math.max(-vMax, Math.min(vMax, v));

      if (v !== 0) {
        // Single-writer arbitration: catchup owns the lock while active
        if (WriteLock.try('catchup', 400)) {
          try { scrollBy(v); } catch {}
        }
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
  _endCatchup();
  try { WriteLock.release('catchup'); } catch {}
  // Remove any active subscription to ScrollManager results
  try { if (__unsubCatchupResult) { __unsubCatchupResult(); __unsubCatchupResult = null; } } catch {}
  // Clear scheduled timers associated with this module
  try { clearAllTimers(); } catch {}
}

// Factory so caller can treat this as a controller instance
export function createScrollController(getScroller){
  const getSc = (typeof getScroller === 'function') ? getScroller : () => (document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body);
  const write = (y) => { try { const sc = getSc(); if (sc) sc.scrollTop = (y|0); } catch {} };
  const request = (y, tag = '') => {
    try {
      // Policy: while catchup is active, only catchup may write; others bail
      if ((tag||'') !== 'catchup' && window.__TP_CATCHUP_ACTIVE) return false;
      const id = tag || 'teleprompter';
      if (!WriteLock.try(id, 400)) return false;
      write(y);
      addTimer(setTimeout(()=>{ try { WriteLock.release(id); } catch {} }, 100));
      return true;
    } catch { return false; }
  };
  return { startAutoCatchup, stopAutoCatchup, isActive: () => active, request, write, isLocked: () => !!WriteLock.heldBy() };
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
    pendingIdx: 0,
    stableHits: 0,
    lastBestAt: 0,
    lastCommitAt: 0,
    lastCommitIdx: 0,
    lastClampY: -1,
  };

  // Monotonic commit with hysteresis and per-commit jump cap
  const STABLE_HITS = 2;            // require staying on candidate across frames
  const FWD_SIM = 0.82;             // forward threshold
  const BACK_SIM = 0.86;            // stricter to backtrack
  const MAX_STEP = 6;               // cap per-commit move in indices

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
        tId = addTimer(setTimeout(()=>{
          last = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          tId = null;
          try { fn.apply(lastThis, lastArgs); } catch {}
        }, Math.max(0, remain)));
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

  // Legacy policy helper retained for compatibility; no-op gate now
  window.__tpShouldCommitIdx = function(){ return true; };

  // Wrap existing scrollToCurrentIndex if present on window
  const _origScrollToCurrentIndex = window.scrollToCurrentIndex;
  if (typeof _origScrollToCurrentIndex === 'function'){
    // Throttled applier to coalesce frequent commits
    const applyCommitThrottled = throttle((commitIdx)=>{
      try {
        // End-of-script guard
        try {
          const sc = document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body;
          const atBottom = (sc.scrollTop + sc.clientHeight) >= (sc.scrollHeight - 4);
          if (atBottom) return;
        } catch {}
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

        // Hysteresis commit: only commit after stability across frames, with direction-specific thresholds
        // Respect jitter elevation from main module
        let effFwd = FWD_SIM, effBack = BACK_SIM;
        try {
          const J = (window.__tpJitter || {});
          const elevated = (typeof J.spikeUntil === 'number') && (now < J.spikeUntil);
          if (elevated) { effFwd += 0.06; effBack += 0.06; }
        } catch {}

        const movingBack = bestIdx < S.committedIdx;
        const ok = (!movingBack && sim >= effFwd) || (movingBack && sim >= effBack);
        if (!ok) { S.stableHits = 0; logEv({ tag:'match:gate', reason:'sim-too-low', bestIdx, committedIdx:S.committedIdx, sim, effFwd, effBack, movingBack }); return; }

        if (bestIdx === S.pendingIdx) S.stableHits++;
        else { S.pendingIdx = bestIdx; S.stableHits = 1; }

        if (S.stableHits < STABLE_HITS) { logEv({ tag:'match:gate', reason:'unstable', bestIdx, pendingIdx:S.pendingIdx, hits:S.stableHits, need:STABLE_HITS }); return; }

        // Clamp commit to MAX_STEP towards pending index
        const dir = Math.sign(S.pendingIdx - S.committedIdx) || 0;
        if (dir === 0) { return; }
        const step = Math.min(Math.abs(S.pendingIdx - S.committedIdx), MAX_STEP);
        const commitIdx = S.committedIdx + (dir * step);

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
