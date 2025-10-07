/* ScrollManager v2 — critically damped, single-flight, deadbanded */
// Extracted from teleprompter_pro.js to keep core slim and focused
(function(){
  'use strict';
  if (window.SCROLLER) return;
  function clamp(n,min,max){ return Math.min(max, Math.max(min, n)); }
  function getScroller(){
    try {
      const pref = (function(){ try { return window.__TP_SCROLLER; } catch { return null; } })();
      if (pref && (pref === window || (pref instanceof Element))) return pref;
      const viewer = document.getElementById('viewer');
      if (viewer) return viewer;
      return (document.scrollingElement || document.documentElement || document.body);
    } catch { return (document.scrollingElement || document.documentElement || document.body); }
  }
  function getScrollTop(sc){ return (sc === window) ? (window.scrollY||0) : (sc.scrollTop||0); }
  function getMaxTop(sc){ try { const h = (sc===window) ? document.documentElement.scrollHeight : (sc.scrollHeight||0); const vh = (sc===window) ? (window.innerHeight||0) : (sc.clientHeight||0); return Math.max(0, h - vh); } catch { return 0; } }
  function setScrollTop(sc, top){
    try {
      try { if (typeof performance!=='undefined') window.__TP_LAST_WRITE = { tag:'SCROLLER.setScrollTop', t: performance.now() }; } catch {}
      try { window.__tpInSetScrollTop = true; } catch {}
      if (sc === window) window.scrollTo(0, top);
      else sc.scrollTo({ top, behavior:'auto' });
    } catch {
      if (sc !== window) {
        try { if (typeof performance!=='undefined') window.__TP_LAST_WRITE = { tag:'SCROLLER.setScrollTop:direct', t: performance.now() }; } catch {}
        sc.scrollTop = top;
      } else {
        try { if (typeof performance!=='undefined') window.__TP_LAST_WRITE = { tag:'SCROLLER.setScrollTop:window', t: performance.now() }; window.scrollTo(0, top); }catch{}
      }
    } finally {
      try { window.__tpInSetScrollTop = false; } catch {}
    }
  }
  function computeTargetYForEl(el, sc){ try { if (!el||!sc) return null; const scR = (sc===window) ? { top:0 } : (sc.getBoundingClientRect?.()||{top:0}); const r = el.getBoundingClientRect(); const vh = (sc===window) ? (window.innerHeight||0) : (sc.clientHeight||0); const bias = 0.35; const y = getScrollTop(sc) + (r.top - scR.top) - Math.round(vh * bias); return clamp(y, 0, getMaxTop(sc)); } catch { return null; } }
  function getLineHeightPx(){
    try {
      const root = (document.getElementById('script')||document);
      const p = root.querySelector('p.active') || root.querySelector('.script p') || root.querySelector('p');
      if (!p) return 64;
      const cs = getComputedStyle(p);
      let lh = parseFloat(cs.lineHeight);
      if (!isFinite(lh)) { const fs = parseFloat(cs.fontSize)||48; lh = fs * 1.35; }
      return Math.max(24, Math.round(lh));
    } catch { return 64; }
  }
  class ScrollManager {
    constructor(){ this.targetY = null; this.raf = 0; this.v = 0; this.lastTs = 0; this.coolingUntil = 0; this.pending = null; this.kp = 0.028; this.kd = 0.18; this.maxSpeed = 1600; this.deadband = 28; this.settleMs = 240; this.lastOutside = 0; this._preempts=0; this.state = { container: null }; this.holdState = { active:false, since:0, pos:0, tag:'' }; this._rej = new Map(); this._resultListeners = new Set(); this._pendingPostFrame = false; this._count = { animRejects: 0 }; try { this.state.container = getScroller(); const cool = (ms)=>{ this.coolingUntil = performance.now() + ms; }; ['wheel','touchmove'].forEach(ev=> window.addEventListener(ev, ()=>cool(1400), { passive:true })); window.addEventListener('keydown', (e)=>{ try { if (['PageDown','PageUp','ArrowDown','ArrowUp','Home','End',' '].includes(e.key)) cool(1400); } catch {} }, { passive:true }); } catch {} }
    _postFrame(){ /* hook */ }
    // External hint: user scrolled; enter cooldown briefly
    onUserScroll(ms){ try { const d = Number(ms)||1400; this.coolingUntil = performance.now() + d; } catch {} }
    // Optional: react to match-activate events (HUD bus). No-op unless an element is provided.
    onMatchActivate(p){ try { const el = p && p.el; if (el) this.request({ el, priority: (p.priority||7), src: 'match', reason: 'matchActivate' }); } catch {} }
    getContainer(){ try { this.state.container = getScroller(); } catch {} return this.state.container; }
    onResult(fn){ try { if (typeof fn === 'function') { this._resultListeners.add(fn); return () => { try { this._resultListeners.delete(fn); } catch {} }; } } catch {} return () => {}; }
    _emitResult(ev){ try { this._resultListeners.forEach(cb => { try { cb(ev); } catch {} }); } catch {} }
    _log(ev){ try { this._emitResult(ev); if (typeof debug==='function') debug(ev); if (typeof HUD?.log==='function'){ const ok=!!ev?.ok, anim=!!this.raf; const notable=/^(accepted:bounded-advance|accepted:manual-probe|immediate)$/i.test(String(ev?.reason||'')); if (!ok) HUD.log('scroll:result', ev); else if (notable || !anim) HUD.log('scroll:result', ev); } } catch {} }
    _logReject(ev, ts){ try { this._emitResult(ev); const reason = String(ev?.reason||''); if (reason === 'reject:anim-active'){ this._count.animRejects = (this._count.animRejects||0)+1; return; } const key = `${ev.reason||'unk'}|${ev.containerId||'unk'}|${ev.holdTag||''}|${ev.tag||''}`; let s = this._rej.get(key); if (!s) { s = { nextAt: 0, count: 0, interval: 150 }; this._rej.set(key, s); } if (ts < s.nextAt) { s.count++; return; } const suppressed = s.count|0; s.count = 0; s.nextAt = ts + s.interval; s.interval = Math.min(Math.max(150, s.interval * 2), 1500); if (suppressed > 0) ev.suppressed = suppressed; console.log(`[reject] reason=${ev.reason||''} container=${ev.containerId||''}`); this._log(ev); } catch { this._log(ev); } }
    request(r){
      try {
  let sc = getScroller(); this.state.container = sc;
        const ts = performance.now();
        const lockFlags = { cooling: (ts < this.coolingUntil), animating: !!this.raf };
        const containerId = (sc?.id || sc?.tagName || 'unknown');
        const dims = { scrollHeight: (sc===window?document.documentElement?.scrollHeight:sc?.scrollHeight)|0, clientHeight: (sc===window?window.innerHeight:sc?.clientHeight)|0 };
        const maxTop = getMaxTop(sc);
        const posNow = getScrollTop(sc)|0;
        if (r && (!r.tag || r.tag === '')) r.tag = 'helper';
        const isManual = !!(r && (r.manual === true || r.priority === 'manual'));
        const isTele = !!(r && ((r.tag === 'teleprompter') || (r.src === 'teleprompter') || (r.tag === 'catchup')));
        const prioNum = (typeof r?.priority === 'string') ? ((r.priority === 'manual') ? 99 : 5) : (r?.priority|0);
        const animActive = !!(this.raf || window.__TP_CATCHUP_ACTIVE || window.__TP_ANIMATING || (window.WriteLock && typeof WriteLock?.heldBy==='function' && WriteLock.heldBy()==='catchup'));
        if (animActive && !isTele){ const ev = { tag:'scroll:result', ok:false, reason:'reject:anim-active', containerId, ...dims, lockFlags, holdTag: r?.reason||'', tag: (r?.tag||'') }; this._logReject(ev, ts); return ev; }
        const cdUntil = Math.max(window.__TP_CATCHUP_COOLDOWN_UNTIL||0, window.__TP_COOLDOWN_UNTIL||0);
        if (ts < cdUntil && !isTele){ const ev = { tag:'scroll:result', ok:false, reason:'reject:cooldown', containerId, ...dims, lockFlags, holdTag: r?.reason||'', tag: (r?.tag||'') }; this._logReject(ev, ts); return ev; }
        if (this.holdState.active && r?.tag === 'teleprompter'){
          const heldMs = ts - (this.holdState.since||0);
          const noMove = Math.abs(posNow - (this.holdState.pos||0)) < 1;
          if (heldMs > 600 && noMove){ const ev = { tag:'scroll:result', ok:false, reason:'debounce:hold', containerId, ...dims, lockFlags, holdTag: r?.reason||'' }; this._logReject(ev, ts); return ev; }
        }
        if (r && r.immediate) {
          let y0 = (typeof r.y === 'number') ? r.y : (r.el ? computeTargetYForEl(r.el, sc) : null);
          if (y0 != null) { setScrollTop(sc, y0); this.targetY = y0; this.v = 0; this.lastTs = 0; this.pending = null; const ev = { tag:'scroll:result', ok:true, immediate:true, containerId, ...dims, lockFlags, y:y0|0, pos: posNow, holdTag: r?.reason||'', tag: (r?.tag||'') }; this._rej.clear(); this._log(ev); this.holdState.active = false; return ev; }
        }
        let y = (typeof r?.y === 'number') ? r.y : (r?.el ? computeTargetYForEl(r.el, sc) : null);
        if (y == null) { const ev = { tag:'scroll:result', ok:false, reason:'no-target', containerId, ...dims, lockFlags, holdTag: r?.reason||'', tag: (r?.tag||''), anchorVisible: !!r?.anchorVisible }; this._logReject(ev, ts); return ev; }
        if (!isManual && ts < this.coolingUntil && !isTele) { const ev = { tag:'scroll:result', ok:false, reason:'locked:inertia', containerId, ...dims, lockFlags, holdTag: r?.reason||'', tag: (r?.tag||''), anchorVisible: !!r?.anchorVisible }; this._logReject(ev, ts); return ev; }
        if (!sc || dims.clientHeight <= 0 || (maxTop|0) <= 0) {
          // Fallback: if we mistakenly chose HTML/body but a #viewer exists and is scrollable, swap to it
          try {
            const v = document.getElementById('viewer');
            if (v && v.clientHeight > 0 && (v.scrollHeight - v.clientHeight) > 0) {
              sc = v; this.state.container = sc;
              dims.scrollHeight = v.scrollHeight|0; dims.clientHeight = v.clientHeight|0;
              const newMaxTop = getMaxTop(sc);
              if (newMaxTop > 0) {
                // Recompute target and continue with the viewer scroller
                const y2 = (typeof r?.y === 'number') ? r.y : (r?.el ? computeTargetYForEl(r.el, sc) : null);
                if (y2 != null) {
                  const yCl2 = Math.max(0, Math.min(Number(y2)||0, newMaxTop));
                  const pos2 = getScrollTop(sc)|0;
                  if (Math.abs(yCl2 - pos2) < this.deadband) {
                    // Treat as bounded advance if teleprompter
                    if (r?.tag === 'teleprompter' && r?.anchorVisible === false) {
                      const dir = Math.sign((yCl2 - pos2) || 1) || 1; const step = Math.min(32, Math.max(8, Math.abs(yCl2 - pos2) || 32));
                      const yb = Math.max(0, Math.min(pos2 + dir * step, newMaxTop));
                      this.pending = { y: yb, priority: (r?.priority|0) || 5, src: r?.src||'system', reason: r?.reason||'' };
                      if (!this.raf) this.start(); this.holdState.active = false;
                      const ev2 = { tag:'scroll:result', ok:true, reason:'accepted:bounded-advance', containerId:(sc?.id || sc?.tagName || 'viewer'), ...dims, lockFlags, y: yb|0, pos: pos2, holdTag: r?.reason||'', tag: (r?.tag||'') };
                      this._rej.clear(); this._log(ev2); return ev2;
                    }
                  } else {
                    // Normal accept path with the viewer
                    const pr = (typeof r?.priority === 'string') ? ((r.priority === 'manual') ? 99 : 5) : (r?.priority|0);
                    this.pending = { y: yCl2, priority: pr, src: r?.src||'system', reason: r?.reason||'' };
                    if (!this.raf) this.start(); this.holdState.active = false;
                    const ev2 = { tag:'scroll:result', ok:true, reason:'accepted', containerId:(sc?.id || sc?.tagName || 'viewer'), ...dims, lockFlags, y: yCl2|0, pos: pos2, holdTag: r?.reason||'', tag: (r?.tag||'') };
                    this._rej.clear(); this._log(ev2); return ev2;
                  }
                }
              }
            }
          } catch {}
          const ev = { tag:'scroll:result', ok:false, reason:'not-scrollable', containerId, ...dims, lockFlags, holdTag: r?.reason||'', tag: (r?.tag||''), anchorVisible: !!r?.anchorVisible };
          this._logReject(ev, ts); return ev;
        }
        const yClamped = Math.max(0, Math.min(Number(y)||0, maxTop));
        const atBoundNoMove = (yClamped === posNow);
        try {
          const held = (window.WriteLock && typeof window.WriteLock.heldBy === 'function') ? window.WriteLock.heldBy() : null;
          const locked = (window.WriteLock && typeof window.WriteLock.isLocked === 'function') ? window.WriteLock.isLocked() : !!held;
          const tagNow = (r?.tag || '');
          const compatible = (isTele && (held === 'catchup' || held === 'teleprompter')) || (tagNow === held);
          if (locked && held && !compatible) { const ev = { tag:'scroll:result', ok:false, reason:'reject:locked-by', containerId, ...dims, lockFlags, holdTag: r?.reason||'', tag: tagNow, heldBy: held }; this._logReject(ev, ts); return ev; }
        } catch {}
        if (atBoundNoMove || Math.abs(yClamped - posNow) < this.deadband) {
          if (isManual) {
            const dir = Math.sign((yClamped - posNow) || 1) || 1; const step = 2; y = Math.max(0, Math.min(posNow + dir * step, maxTop)); window.__lastScrollTarget = y;
            if (!this.pending || prioNum >= (this.pending.priority|0)) { if (this.pending && prioNum > (this.pending.priority|0)) { window.__tpScrollerPreempts = (window.__tpScrollerPreempts||0) + 1; this._preempts++; } this.pending = { y, priority: prioNum, src: r?.src||'manual', reason: r?.reason||'probe' }; }
            if (!this.raf) this.start(); this.holdState.active = false; const ev = { tag:'scroll:result', ok:true, reason:'accepted:manual-probe', containerId, ...dims, lockFlags, y: y|0, pos: posNow, holdTag: r?.reason||'', tag: (r?.tag||'manual') }; this._rej.clear(); this._log(ev); return ev;
          }
          if (r?.tag === 'teleprompter' && r?.anchorVisible === false) {
            const dir = Math.sign((yClamped - posNow) || 1) || 1; const step = Math.min(32, Math.max(8, Math.abs(yClamped - posNow) || 32)); y = Math.max(0, Math.min(posNow + dir * step, maxTop)); window.__lastScrollTarget = y; if (!this.pending || prioNum >= (this.pending.priority|0)) { if (this.pending && prioNum > (this.pending.priority|0)) { window.__tpScrollerPreempts = (window.__tpScrollerPreempts||0) + 1; this._preempts++; } this.pending = { y, priority: prioNum, src: r.src||'system', reason: r.reason||'' }; } if (!this.raf) this.start(); this.holdState.active = false; const ev = { tag:'scroll:result', ok:true, reason:'accepted:bounded-advance', containerId, ...dims, lockFlags, y: y|0, pos: posNow, holdTag: r?.reason||'', tag: (r?.tag||'') }; this._rej.clear(); this._log(ev); return ev;
          }
          if (!this.holdState.active) { this.holdState.active = true; this.holdState.since = ts; this.holdState.pos = posNow; this.holdState.tag = String(r?.tag||''); }
          else { this.holdState.pos = posNow; }
          const reason = atBoundNoMove && (yClamped !== y) ? 'bounds-clamp' : 'hold:stable'; const ev = { tag:'scroll:result', ok:false, reason, containerId, ...dims, lockFlags, holdTag: r?.reason||'', tag: (r?.tag||''), anchorVisible: !!r?.anchorVisible }; this._logReject(ev, ts); return ev;
        }
        y = yClamped; window.__lastScrollTarget = y; if (!this.pending || prioNum >= (this.pending.priority|0)) { if (this.pending && prioNum > (this.pending.priority|0)) { window.__tpScrollerPreempts = (window.__tpScrollerPreempts||0) + 1; this._preempts++; } this.pending = { y, priority: prioNum, src: r.src||'system', reason: r.reason||'' }; }
        if (!this.raf) this.start(); this.holdState.active = false; const ev = { tag:'scroll:result', ok:true, reason:'accepted', containerId, ...dims, lockFlags, y: y|0, pos: posNow, holdTag: r?.reason||'', tag: (r?.tag||'') }; this._rej.clear(); this._log(ev); return ev;
      } catch {}
    }
    to(opts){ try { const o = Object.assign({ src:'manual', reason:'probe' }, (opts||{})); if (o.priority === 'manual') { o.manual = true; o.priority = 99; } else if (o.manual && typeof o.priority !== 'number') { o.priority = 99; } if (!o.tag) o.tag = 'manual'; return this.request(o); } catch { return { ok:false, reason:'error', tag:'manual' }; } }
    start(){ try { this.raf = requestAnimationFrame(this.tick); } catch {} }
    stop(){ try { cancelAnimationFrame(this.raf); } catch {} this.raf = 0; this.v = 0; this.lastTs = 0; this.pending = null; this.targetY = null; this.lastOutside = 0; try { window.__lastScrollTarget = null; } catch {} try { if (this._count && this._count.animRejects>0) { try { console.debug('[scroll] animRejects', this._count.animRejects); } catch {} this._count.animRejects = 0; } } catch {} try { window.dispatchEvent(new CustomEvent('tp-settled', { detail: { source: 'scroller' } })); } catch {} }
    tick = (ts) => {
      this.raf = requestAnimationFrame(this.tick);
      if (ts < this.coolingUntil) return;
      const sc = getScroller();
      try { window.beginMeasure && window.beginMeasure(); } catch {}
      if (this.pending){
        const cand = this.pending.y; this.pending = null;
        try {
          const db = this.deadband|0;
          const frozen = (typeof window.__TP_FROZEN_TARGET_Y === 'number') ? window.__TP_FROZEN_TARGET_Y : (this.targetY ?? cand);
          if (this.targetY != null && Math.abs(cand - (frozen ?? this.targetY)) <= db) {
            this.targetY = (frozen ?? this.targetY);
          } else {
            const thresh = Math.max(db, Math.round(getLineHeightPx() * 0.6));
            if (typeof frozen !== 'number' || Math.abs(cand - frozen) > thresh) {
              this.targetY = cand; window.__TP_FROZEN_TARGET_Y = cand;
            } else {
              this.targetY = (frozen ?? cand);
            }
          }
        } catch { this.targetY = cand; }
      }
      if (this.targetY == null) { try { window.endFrame && window.endFrame(); } catch {} return this.stop(); }
      const pos = getScrollTop(sc);
      const err = this.targetY - pos; const absErr = Math.abs(err);
      const rawDtMs = (this.lastTs ? (ts - this.lastTs) : 16.7); const dt = rawDtMs / 1000; this.lastTs = ts;
      if (rawDtMs > 180) { this.v = 0; try { window.endFrame && window.endFrame(); } catch {}; if (!this._pendingPostFrame) { this._pendingPostFrame = true; queueMicrotask(()=>{ this._pendingPostFrame = false; this._postFrame(); }); } return; }
      try { window.beginMutate && window.beginMutate(); } catch {}
      if (absErr < this.deadband){ if (!this.lastOutside) this.lastOutside = ts; if (ts - this.lastOutside >= this.settleMs) { try { window.endFrame && window.endFrame(); } catch {} return this.stop(); } } else { this.lastOutside = 0; }
      try {
        const nowMs = performance.now();
        const lastPos = (typeof this._lastPos === 'number') ? this._lastPos : pos;
        const lastT   = (typeof this._lastT === 'number')   ? this._lastT   : (nowMs - 16);
        const vPxMs = Math.abs((pos - lastPos) / Math.max(1, (nowMs - lastT)));
        this._lastPos = pos; this._lastT = nowMs;
        if (absErr <= (this.deadband|0) && vPxMs <= 0.2) { this._within = (this._within|0) + 1; } else { this._within = 0; }
        if ((this._within|0) >= 3) { try { window.endFrame && window.endFrame(); } catch {} return this.stop(); }
      } catch {}
      // Adaptive taper + quiet backoff
      let kp = this.kp, kd = this.kd, vmax = this.maxSpeed;
      try {
        if (absErr < 160) {
          const e = absErr;
          const scale = (e <= 40) ? 0.4 : (e <= 80 ? 0.6 : 0.8);
          kp = this.kp * scale;
          kd = this.kd * Math.max(0.7, scale);
          vmax = Math.max(300, this.maxSpeed * (0.5 + 0.5*scale));
        }
      } catch {}
      const a = kp * err - kd * this.v;
      this.v = clamp(this.v + a * dt, -vmax, vmax);
      try {
        this._quietUntil = (typeof this._quietUntil === 'number') ? this._quietUntil : 0;
        this._lastErr = (typeof this._lastErr === 'number') ? this._lastErr : absErr;
        const speed = Math.abs(this.v);
        const errImproving = absErr <= this._lastErr + 0.5;
        if (absErr < (this.deadband*2 + 6) && speed < 22 && errImproving) {
          if (ts < this._quietUntil) { this._lastErr = absErr; try { window.endFrame && window.endFrame(); } catch {} return; }
          this._quietUntil = ts + 25;
        } else if (absErr > (this.deadband*3)) { this._quietUntil = 0; }
        this._lastErr = absErr;
      } catch {}
      const next = clamp(pos + this.v * dt, 0, getMaxTop(sc));
      if (Math.abs(next - pos) >= 0.25) { setScrollTop(sc, next); }
      try { window.endFrame && window.endFrame(); } catch {}
      if (!this._pendingPostFrame) { this._pendingPostFrame = true; try { queueMicrotask(()=>{ try { this._pendingPostFrame = false; this._postFrame(); } catch { this._pendingPostFrame = false; } }); } catch { this._pendingPostFrame = false; } }
    }
  }
  window.ScrollManager = ScrollManager; window.SCROLLER = new ScrollManager();
  // Early lock: prefer #viewer as the active scroller once DOM is ready
  try {
    window.addEventListener('DOMContentLoaded', ()=>{
      try {
        const v = document.getElementById('viewer');
        if (v) {
          window.__TP_SCROLLER = v;
          // Freeze a base viewport height to reduce geometry flapping
          try { if (!window.__TP_VIEWER_HEIGHT_BASE) window.__TP_VIEWER_HEIGHT_BASE = v.clientHeight|0; } catch {}
        }
      } catch {}
    }, { once:true });
  } catch {}
})();
