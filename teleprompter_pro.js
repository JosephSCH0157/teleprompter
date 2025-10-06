/* Teleprompter Pro — JS CLEAN (v1.5.8)
   - Display handshake + retry pump
   - SmartTag supports: Name:, Name —, Name >, and block headers >> NAME:
   - DOCX import via Mammoth (auto‑loads on demand)
   - dB meter + mic selector
   - Camera overlay (mirror/size/opacity/PiP)
   - Auto‑scroll + timer
   - NEW: Speakers section hide/show with persistence
*/

// Reinstate IIFE wrapper (was removed causing brace imbalance)
(function(){
  'use strict';
  // Flags (URL or localStorage): ?calm=1&dev=1
  try {
    const Q = new URLSearchParams(location.search);
    const DEV  = Q.has('dev')  || localStorage.getItem('tp_dev_mode') === '1';
    const CALM = Q.has('calm') || localStorage.getItem('tp_calm')    === '1';
    try { window.__TP_DEV = DEV; window.__TP_CALM = CALM; } catch {}
    // Ensure DEV-only UI (like build label) is gated by a class on <html>
    try {
      document.documentElement.classList.toggle('tp-dev', !!DEV);
    } catch {}
    try { if (CALM) { window.__TP_DISABLE_NUDGES = true; } } catch {}
    try { if (DEV) console.info('[TP-Pro] DEV mode enabled'); } catch {}
    try { if (CALM) console.info('[TP-Pro] Calm Mode enabled'); } catch {}
  } catch {}
  // Boot instrumentation (added)
  try {
    window.__TP_BOOT_TRACE = [];
    const _origLog = console.log.bind(console);
    const tag = (m)=> `[TP-BOOT ${Date.now()%100000}] ${m}`;
  // Publish build version for About panel and diagnostics
  try { window.APP_VERSION = '1.5.8'; } catch {}
  window.__tpBootPush = (m)=>{ try { const rec = { t: Date.now(), m }; window.__TP_BOOT_TRACE.push(rec); console.log('[TP-TRACE]', rec.m); } catch(e){ try { console.warn('[TP-TRACE-FAIL]', e); } catch {} } };
    __tpBootPush('script-enter');
    _origLog(tag('entered main IIFE'));
    window.addEventListener('DOMContentLoaded', ()=>{ __tpBootPush('dom-content-loaded'); });
    document.addEventListener('readystatechange', ()=>{ __tpBootPush('rs:' + document.readyState); });
    // Global error hooks (diagnostic): capture earliest uncaught issues
    window.addEventListener('error', ev => {
      try { (__TP_BOOT_TRACE||[]).push({t:Date.now(), m:'onerror:'+ (ev?.error?.message||ev?.message) }); } catch {}
      try { console.error('[TP-BOOT onerror]', ev?.error || ev?.message || ev); } catch {}
    });
    window.addEventListener('unhandledrejection', ev => {
      try { (__TP_BOOT_TRACE||[]).push({t:Date.now(), m:'unhandled:'+ (ev?.reason?.message||ev?.reason) }); } catch {}
      try { console.error('[TP-BOOT unhandled]', ev?.reason); } catch {}
    });
    _origLog(tag('installed global error hooks'));
  } catch {}
  try { __tpBootPush('after-boot-block'); } catch {}

  // Calm Mode geometry helpers: unified target math and clamped scroll writes
  // These are safe to define always; callers should only use them when CALM is enabled.
  function getYForElInScroller(el, sc = (window.__TP_SCROLLER || document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body), pct = 0.38) {
    try {
      if (!el || !sc) return 0;
      const elR = el.getBoundingClientRect();
      const scR = (typeof sc.getBoundingClientRect === 'function') ? sc.getBoundingClientRect() : { top: 0 };
      const base = (typeof window.__TP_VIEWER_HEIGHT_BASE === 'number' && window.__TP_VIEWER_HEIGHT_BASE > 0) ? window.__TP_VIEWER_HEIGHT_BASE : (sc.clientHeight || 0);
      const raw = (sc.scrollTop || 0) + (elR.top - scR.top) - Math.round(base * pct);
      const max = Math.max(0, (sc.scrollHeight || 0) - (sc.clientHeight || 0));
      return Math.max(0, Math.min(raw | 0, max));
    } catch { return 0; }
  }
  function tpScrollTo(y, sc = (window.__TP_SCROLLER || document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body)) {
    try {
      const max = Math.max(0, (sc.scrollHeight || 0) - (sc.clientHeight || 0));
      const target = Math.min(Math.max(0, y | 0), max);
      sc.scrollTop = target;
      if (window.__TP_DEV) {
        try { console.debug('[TP-Pro Calm] tpScrollTo', { y, target, max, scroller: sc.id || sc.tagName }); } catch {}
      }
    } catch {}
  }
  // Unified scroll scheduler entry: prefer rAF-batched writer if available
  function requestScroll(y){ try { (window.__tpScrollWrite || tpScrollTo)(y); } catch {} }

  // Minimal write batching to shed main-thread load during bursts
  const __tpWriteQ = [];
  let __tpWriteRAF = 0;
  function scheduleWrite(fn){
    try {
      __tpWriteQ.push(fn);
      if (!__tpWriteRAF){
        __tpWriteRAF = requestAnimationFrame(()=>{
          const q = __tpWriteQ.splice(0, __tpWriteQ.length);
          __tpWriteRAF = 0;
          for (const w of q){ try { w(); } catch {} }
        });
      }
    } catch {}
  }
  try { window.scheduleWrite = scheduleWrite; } catch {}

  // EMA-smoothed confidence computation to resist jitter spikes
  let __tpJitterEma = 0;
  let __tpJFactorPrev = 1;
  let __tpSpikeGuardUntil = 0;
  function onJitterSpike(){ try { __tpSpikeGuardUntil = performance.now() + 1200; } catch {} }
  function computeConf({ sim, cov, jitterStd }) {
    try {
      __tpJitterEma = __tpJitterEma ? (0.3 * jitterStd + 0.7 * __tpJitterEma) : jitterStd;
      let jFactor = Math.max(0.35, 1 - (__tpJitterEma / 18));
      // Sedate attenuation during jitter spikes so confidence isn't yanked down mid-lock
      try {
        if (performance.now() < __tpSpikeGuardUntil) {
          jFactor = Math.max(__tpJFactorPrev, 0.60);
        }
        __tpJFactorPrev = jFactor;
      } catch {}
      const conf = (0.55 * sim + 0.45 * cov) * jFactor;
      try {
        if (typeof debug === 'function')
          debug({ tag:'match:conf', sim:+Number(sim).toFixed(3), cov:+Number(cov).toFixed(2), jitterStd:+Number(jitterStd||0).toFixed(2), jEma:+Number(__tpJitterEma).toFixed(2), jFactor:+Number(jFactor).toFixed(2), conf:+Number(conf).toFixed(3) });
      } catch {}
      return conf;
    } catch {
      return (0.55 * sim + 0.45 * cov);
    }
  }

  // Reader-lock: when the anchor (active line) is out of view for >2 frames (~250ms), pause auto-follow
  const VIEW_GUARD_MS = 250;
  let __tpAnchorOffAt = 0;
  let __tpReaderLocked = false;
  function onAnchorVisibility(visible){
    try {
      const now = performance.now();
      if (!visible) {
        if (!__tpAnchorOffAt) __tpAnchorOffAt = now;
        if (!__tpReaderLocked && (now - __tpAnchorOffAt) > VIEW_GUARD_MS) {
          __tpReaderLocked = true;
          try { if (typeof HUD?.log === 'function') HUD.log('reader:locked', { since: __tpAnchorOffAt, at: now }); } catch {}
          try { if (typeof debug === 'function') debug({ tag:'reader:locked', since: __tpAnchorOffAt, at: now }); } catch {}
        }
      } else {
        __tpAnchorOffAt = 0;
      }
    } catch {}
  }
  function unlockReaderLock(reason='manual'){
    try {
      __tpReaderLocked = false; __tpAnchorOffAt = 0;
      const now = performance.now();
      try { if (typeof HUD?.log === 'function') HUD.log('reader:unlocked', { at: now, reason }); } catch {}
      try { if (typeof debug === 'function') debug({ tag:'reader:unlocked', at: now, reason }); } catch {}
    } catch {}
  }
  function maybeAutoScroll(targetY, scroller, opts = {}){
    try {
      if (__tpReaderLocked && !opts.overrideLock) { try { if (typeof debug==='function') debug({ tag:'reader:block-scroll', targetY }); } catch {} return; }
      requestScroll(targetY);
    } catch {}
  }
  try { window.unlockReaderLock = unlockReaderLock; } catch {}
  // Utility: check if an element is within a comfort band inside the active scroller
  function isInComfortBand(el, opts = {}){
    try {
      if (!el) return false;
      const sc = (window.__TP_SCROLLER || document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body);
      const useWindow = (sc === document.scrollingElement || sc === document.documentElement || sc === document.body);
      const vh = useWindow ? (window.innerHeight||0) : (sc.clientHeight||0);
      if (!vh) return false;
      const topFrac = (typeof opts.top === 'number') ? opts.top : 0.25;
      const botFrac = (typeof opts.bottom === 'number') ? opts.bottom : 0.55;
      const topBand = vh * topFrac;
      const botBand = vh * botFrac;
      const scTop = useWindow ? 0 : ((typeof sc.getBoundingClientRect === 'function') ? sc.getBoundingClientRect().top : 0);
      const r = el.getBoundingClientRect();
      const top = r.top - scTop;
      const bottom = r.bottom - scTop;
      return (top >= topBand && bottom <= botBand);
    } catch { return false; }
  }
  try { window.isInComfortBand = isInComfortBand; } catch {}
  // User scrolling detector to avoid fighting the reader
  let __tpUserScrollUntil = 0;
  function markUserScroll(){ try { __tpUserScrollUntil = performance.now() + 600; } catch {} }
  try {
    const sc = (window.__TP_SCROLLER || document.getElementById('viewer') || document);
    ['wheel','touchstart','pointerdown','keydown'].forEach(evt => (sc.addEventListener ? sc.addEventListener(evt, markUserScroll, { passive:true }) : window.addEventListener(evt, markUserScroll, { passive:true })));
  } catch {}
  function isUserScrolling(){ try { return performance.now() < __tpUserScrollUntil; } catch { return false; } }
  // Keep an element within a comfort band (defaults: top=25%, bottom=55% of viewport)
  function ensureInView(el, opts = {}){
    try {
      if (!el) return;
      const sc = (window.__TP_SCROLLER || document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body);
      const useWindow = (sc === document.scrollingElement || sc === document.documentElement || sc === document.body);
      const vh = useWindow ? (window.innerHeight||0) : (sc.clientHeight||0);
      if (!vh) return;
      const topFrac = (typeof opts.top === 'number') ? opts.top : 0.25;
      const botFrac = (typeof opts.bottom === 'number') ? opts.bottom : 0.55;
      const topBand = vh * topFrac;
      const botBand = vh * botFrac;
      const scTop = useWindow ? 0 : ((typeof sc.getBoundingClientRect === 'function') ? sc.getBoundingClientRect().top : 0);
      const r = el.getBoundingClientRect();
      const top = r.top - scTop;
      const bottom = r.bottom - scTop;
      let delta = 0;
      if (top < topBand) delta = top - topBand;
      else if (bottom > botBand) delta = bottom - botBand;
      if (Math.abs(delta) < 1) return;
      if (window.__tpReaderLocked) { try { if (typeof debug==='function') debug({ tag:'reader:block-scroll', reason:'ensureInView', delta }); } catch {} return; }
      // Route through single-flight ScrollManager for critically damped motion
      try {
        const targetY = Math.max(0, Math.min((sc.scrollTop||0) + delta, Math.max(0, (sc.scrollHeight||0) - (sc.clientHeight||0))));
        window.SCROLLER?.request({ y: targetY, priority: 4, src: 'viewer', reason: 'ensureInView' });
      } catch {}
    } catch {}
  }
  try { window.ensureInView = ensureInView; } catch {}

  // Find the nearest scrollable ancestor (overflowY/overflow auto|scroll|overlay) or fall back to document.scrollingElement
  function getScrollableAncestor(el){
    try {
      let a = el;
      while (a){
        try {
          const s = getComputedStyle(a);
          const canScroll = /(auto|scroll|overlay)/.test(s.overflowY || s.overflow || '');
          if (canScroll && (a.scrollHeight > (a.clientHeight + 4))) return a;
        } catch {}
        a = a.parentElement;
      }
      return document.scrollingElement || document.documentElement || document.body;
    } catch { return document.scrollingElement || document.documentElement || document.body; }
  }
  function __nodeId(node){ try { return (node && (node.id || node.getAttribute?.('data-testid') || node.tagName)) || 'unknown'; } catch { return 'unknown'; } }
  // Tolerance + hysteresis for scroll targeting
  const MIN_NUDGE_PX = 2;   // ignore attempts smaller than this
  const IN_BAND_EPS  = 8;   // sticky band tolerance to avoid re-triggering (tuned)
  const HYSTERESIS   = 16;  // must drift > this before we try again (tuned)
  // Hard-stable gate tuneables
  const SIM_OK        = 0.70; // below this => freeze window
  const JITTER_HIGH   = 25;   // std dev threshold (from logs)
  const USER_FREEZE   = 1000; // ms after user scroll
  const LOWSIM_FREEZE = 1500; // ms after a low-sim/jitter tick
  // Gate state
  let __tpLastProgAt = 0;
  let __tpLastUserAt = 0;
  let __tpLowSimAt   = 0;
  function __tpOnUserScroll(){ try { __tpLastUserAt = performance.now(); } catch {} }
  try { window.addEventListener('scroll', __tpOnUserScroll, { passive: true }); } catch {}
  function __tpCanProgrammaticScroll(now){
    try {
      const t = (typeof now === 'number') ? now : performance.now();
      if (t - __tpLastUserAt < USER_FREEZE)   return false;
      if (t - __tpLowSimAt   < LOWSIM_FREEZE) return false;
      if (t - __tpLastProgAt < 150)           return false; // coalescing cooldown
      return true;
    } catch { return true; }
  }
  // Hard-stable eligibility gate: freeze on low-sim/jitter or invisible anchor
  function stableEligible({ sim, jitterStd, anchorVisible }){
    try {
      if (!anchorVisible || sim < SIM_OK || jitterStd > JITTER_HIGH){
        try { __tpLowSimAt = performance.now(); } catch {}
        return false;
      }
      return true;
    } catch { return false; }
  }
  function inBand(targetY, top, vh, band){
    try {
      const b0 = Array.isArray(band) ? band[0] : 0.28;
      const b1 = Array.isArray(band) ? band[1] : 0.55;
      const minTop = targetY - b1*vh - IN_BAND_EPS;
      const maxTop = targetY - b0*vh + IN_BAND_EPS;
      return top >= minTop && top <= maxTop;
    } catch { return false; }
  }
  function isOutsideBandBy(targetY, top, vh, band, px){
    try {
      const b0 = Array.isArray(band) ? band[0] : 0.28;
      const b1 = Array.isArray(band) ? band[1] : 0.55;
      const minTop = targetY - b1*vh - (px||0);
      const maxTop = targetY - b0*vh + (px||0);
      return (top < minTop) || (top > maxTop);
    } catch { return true; }
  }
  // Sticky band around the snapped targetTop with tolerance
  const STICKY_EPS = IN_BAND_EPS;
  function inStickyBand(targetTop, top, vh, band){
    try {
      const b0 = Array.isArray(band) ? band[0] : 0.28;
      const b1 = Array.isArray(band) ? band[1] : 0.55;
      const minTop = targetTop - b1*vh - STICKY_EPS;
      const maxTop = targetTop - b0*vh + STICKY_EPS;
      return top >= minTop && top <= maxTop;
    } catch { return false; }
  }
  // Device-pixel-snapped programmatic scroll (auto behavior), ignores tiny moves
  function scrollToSnapped(scroller, top){
    try {
      const DPR = (window.devicePixelRatio || 1);
      const snapped = Math.round(top * DPR) / DPR;
      const dist = snapped - (scroller.scrollTop||0);
      if (Math.abs(dist) < MIN_NUDGE_PX) return;
      try { __tpLastProgAt = performance.now(); } catch {}
      if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: snapped, behavior: 'auto' });
      else scroller.scrollTop = snapped;
    } catch {}
  }

  // Abortable lock with timeout + cancellation for reader-critical sections
  class __TpMutex {
    constructor(){ this.q = []; this.locked = false; }
    async acquire(timeoutMs = 3000){
      if (!this.locked){ this.locked = true; return () => this.release(); }
      let release;
      const ticket = new Promise(res => this.q.push(res));
      const timed = new Promise((_, rej) => setTimeout(()=> rej(new Error('lock-timeout')), timeoutMs));
      try { release = await Promise.race([ticket, timed]); }
      catch(e){
        try { console.warn('reader:lock:timeout → forcing progress'); } catch {}
        this.locked = true; // take over to keep pipeline moving
        return () => this.release();
      }
      return release;
    }
    release(){ const next = this.q.shift(); if (next) next(() => this.release()); else this.locked = false; }
  }
  const readerLock = new __TpMutex();
  async function withReader(fn, where='reader'){ const release = await readerLock.acquire(3000); try { return await fn(); } finally { try { release(); } catch {} } }
  try { window.readerLock = readerLock; window.withReader = withReader; } catch {}

  // ===== ScrollManager v2 — critically damped, single-flight, deadbanded =====
  (function installScrollManager(){
    try {
      if (window.SCROLLER) return;
      function clamp(n,min,max){ return Math.min(max, Math.max(min, n)); }
      function getScroller(){ return (window.__TP_SCROLLER || document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body); }
      function getScrollTop(sc){ return (sc === window) ? (window.scrollY||0) : (sc.scrollTop||0); }
      function setScrollTop(sc, top){ try { if (sc === window) window.scrollTo(0, top); else sc.scrollTo({ top, behavior:'auto' }); } catch { if (sc !== window) sc.scrollTop = top; else try{ window.scrollTo(0, top); }catch{} } }
      function getMaxTop(sc){ try { const h = (sc===window) ? document.documentElement.scrollHeight : (sc.scrollHeight||0); const vh = (sc===window) ? (window.innerHeight||0) : (sc.clientHeight||0); return Math.max(0, h - vh); } catch { return 0; } }
      function computeTargetYForEl(el, sc){ try { if (!el||!sc) return null; const scR = (sc===window) ? { top:0 } : (sc.getBoundingClientRect?.()||{top:0}); const r = el.getBoundingClientRect(); const vh = (sc===window) ? (window.innerHeight||0) : (sc.clientHeight||0); const bias = 0.35; const y = getScrollTop(sc) + (r.top - scR.top) - Math.round(vh * bias); return clamp(y, 0, getMaxTop(sc)); } catch { return null; } }

      class ScrollManager {
        constructor(){ this.targetY = null; this.raf = 0; this.v = 0; this.lastTs = 0; this.coolingUntil = 0; this.pending = null; this.kp = 0.028; this.kd = 0.18; this.maxSpeed = 1600; this.deadband = 28; this.settleMs = 240; this.lastOutside = 0; this._preempts=0; try { const cool = (ms)=>{ this.coolingUntil = performance.now() + ms; }; ['wheel','touchmove'].forEach(ev=> window.addEventListener(ev, ()=>cool(1400), { passive:true })); window.addEventListener('keydown', (e)=>{ try { if (['PageDown','PageUp','ArrowDown','ArrowUp','Home','End',' '].includes(e.key)) cool(1400); } catch {} }, { passive:true }); } catch {} }
        request(r){
          try {
            const sc = getScroller();
            // Emergency path: jump immediately (e.g., a11y reveal) bypassing animation/cooldown
            if (r && r.immediate) {
              let y0 = (typeof r.y === 'number') ? r.y : (r.el ? computeTargetYForEl(r.el, sc) : null);
              if (y0 != null) {
                setScrollTop(sc, y0);
                this.targetY = y0; this.v = 0; this.lastTs = 0; this.pending = null;
                return;
              }
            }
            let y = (typeof r?.y === 'number') ? r.y : (r?.el ? computeTargetYForEl(r.el, sc) : null);
            if (y == null) return;
            if (!this.pending || (r.priority|0) >= (this.pending.priority|0)) {
              if (this.pending && (r.priority|0) > (this.pending.priority|0)) { try { window.__tpScrollerPreempts = (window.__tpScrollerPreempts||0) + 1; } catch {} this._preempts++; }
              this.pending = { y, priority: (r.priority|0), src: r.src||'system', reason: r.reason||'' };
            }
            if (!this.raf) this.start();
          } catch {}
        }
        onMatchActivate({ idx, reason, conf }){ try { const bucket = Math.round((Number(conf)||0) * 20); const key = `${idx}|${reason||''}|${bucket}`; if (key === this._lastMatchKey) return; this._lastMatchKey = key; const el = (document.getElementById('script')||document).querySelector(`[data-match-idx="${idx}"]`) || document.querySelector(`#match-${idx}`) || null; if (!el) return; this.request({ el, priority:5, src:'match', reason:String(reason||'') }); } catch {} }
        onSpeechFinal(node){ try { if (!node) return; this.request({ el: node, priority: 10, src:'speech', reason:'final' }); } catch {} }
        onUserScroll(){ try { this.coolingUntil = performance.now() + 1400; } catch {} }
        start(){ try { this.raf = requestAnimationFrame(this.tick); } catch {} }
        stop(){ try { cancelAnimationFrame(this.raf); } catch {} this.raf = 0; this.v = 0; this.lastTs = 0; this.pending = null; this.targetY = null; this.lastOutside = 0; }
        tick = (ts) => {
          this.raf = requestAnimationFrame(this.tick);
          const sc = getScroller();
          if (ts < this.coolingUntil) return; // user truce
          if (this.pending){ this.targetY = this.pending.y; this.pending = null; }
          if (this.targetY == null) return this.stop();
          const pos = getScrollTop(sc);
          const err = this.targetY - pos;
          const absErr = Math.abs(err);
          if (absErr < this.deadband){ if (!this.lastOutside) this.lastOutside = ts; if (ts - this.lastOutside >= this.settleMs) return this.stop(); } else { this.lastOutside = 0; }
          const dt = (this.lastTs ? (ts - this.lastTs) : 16.7) / 1000; this.lastTs = ts;
          const a = this.kp * err - this.kd * this.v;
          this.v = clamp(this.v + a * dt, -this.maxSpeed, this.maxSpeed);
          const next = clamp(pos + this.v * dt, 0, getMaxTop(sc));
          setScrollTop(sc, next);
        }
      }
      try { window.ScrollManager = ScrollManager; window.SCROLLER = new ScrollManager(); } catch {}
    } catch {}
  })();
  // Temporary safety net: shims to route native scroll calls through SCROLLER
  (function installScrollShims(){
    try {
      if (window.__tpScrollShimsInstalled) return; window.__tpScrollShimsInstalled = true;
      const origScrollTo = window.scrollTo ? window.scrollTo.bind(window) : null;
      const origScrollBy = window.scrollBy ? window.scrollBy.bind(window) : null;
      const origSIV = Element?.prototype?.scrollIntoView;
      if (origScrollTo) window.scrollTo = function(x, y){ try { const top = (typeof x === 'object') ? (x?.top ?? 0) : (y ?? 0); window.SCROLLER?.request({ y: Number(top)||0, src:'shim', reason:'scrollTo', priority:5 }); } catch { try { return origScrollTo(x, y); } catch {} } };
      if (origScrollBy) window.scrollBy = function(x, y){ try { const dy = (typeof x === 'number' && typeof y === 'number') ? y : ((x && typeof x==='object') ? (x.top ?? 0) : 0); const start = (window.scrollY||0); window.SCROLLER?.request({ y: Number(start + dy)||0, src:'shim', reason:'scrollBy', priority:5 }); } catch { try { return origScrollBy(x, y); } catch {} } };
      if (origSIV) Element.prototype.scrollIntoView = function(arg){ try { window.SCROLLER?.request({ el: this, src:'shim', reason:'scrollIntoView', priority:6 }); } catch { try { return origSIV.call(this, arg); } catch {} } };
    } catch {}
  })();
  // Telemetry: count non-SCROLLER scrolls (should be 0)
  (function installScrollTelemetry(){
    try {
      if (window.__tpScrollTelemetryInstalled) return; window.__tpScrollTelemetryInstalled = true;
      const sc = (window.__TP_SCROLLER || document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body);
      let lastTop = (sc===window) ? (window.scrollY||0) : (sc.scrollTop||0);
      const onScroll = ()=>{
        try {
          const cur = (sc===window) ? (window.scrollY||0) : (sc.scrollTop||0);
          const intended = (typeof window.__lastScrollTarget==='number') ? window.__lastScrollTarget : null;
          const ok = intended != null && Math.abs(cur - intended) <= 2;
          if (!ok && Math.abs(cur - lastTop) >= 1){ try { window.__tpNonScrollerScrolls = (window.__tpNonScrollerScrolls||0) + 1; } catch {} }
          lastTop = cur;
        } catch {}
      };
      try { (sc===window?window:sc).addEventListener('scroll', onScroll, { passive:true }); } catch {}
    } catch {}
  })();
  // Hash/anchor handling: prevent native jumps; route through SCROLLER
  (function installAnchorHandlers(){
    try {
      if (window.__tpAnchorHandlersInstalled) return; window.__tpAnchorHandlersInstalled = true;
      try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}
      document.addEventListener('click', (ev)=>{
        try {
          const a = ev.target && (ev.target.closest ? ev.target.closest('a[href^="#"]') : null);
          if (!a) return;
          const href = a.getAttribute('href')||''; if (!href || href === '#') return;
          const raw = href.slice(1);
          const id = raw ? decodeURIComponent(raw) : '';
          if (!id) return;
          const el = document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`);
          if (!el) return;
          ev.preventDefault();
          try { history.pushState(null, '', href); } catch {}
          try { window.SCROLLER?.request({ el, priority: 8, src: 'system', reason: 'hash' }); } catch {}
        } catch {}
      }, true);
      window.addEventListener('hashchange', ()=>{
        try {
          const id = (location.hash||'').replace(/^#/, ''); if (!id) return;
          const el = document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`);
          if (!el) return;
          window.SCROLLER?.request({ el, priority: 8, src: 'system', reason: 'hash' });
        } catch {}
      });
    } catch {}
  })();
  // Oscillation breaker: detect A↔B↔A within 500ms and <=200px separation
  let __tpLastPosSamples = [];
  let __tpOscFreezeUntil = 0; // retained for metrics only
  function __tpRecordTopSample(top){
    try {
      const t = performance.now();
      __tpLastPosSamples.push({ top: Number(top)||0, t });
      if (__tpLastPosSamples.length > 6) __tpLastPosSamples.shift();
    } catch {}
  }
  // Removed oscillation hold/release: PD loop will dampen without backoff
  function __tpIsOscillating(){
    try {
      if (!__tpLastPosSamples || __tpLastPosSamples.length < 4) return false;
      const s = __tpLastPosSamples.slice(-4);
      const a = s[0], b = s[1], c = s[2], d = s[3];
      const ab = Math.abs(a.top - b.top);
      const ac = Math.abs(a.top - c.top);
      const bd = Math.abs(b.top - d.top);
      const span = (d.t - a.t);
      // Two alternations: a≈c and b≈d, with pair separation not too large and within short time window
      return (ac < 4) && (bd < 4) && (ab <= 200) && (span <= 500);
    } catch { return false; }
  }
  // Watchdog: gently recenter when off for a while, with strict gating
  (function installMaybeRecenter(){
    try {
      if (window.__tpMaybeRecenterInstalled) return; window.__tpMaybeRecenterInstalled = true;
      let _sinceTooFar = 0;
      window.maybeRecenter = function(el){
        try {
          if (!el) return;
          const now = performance.now();
          const box = el.getBoundingClientRect();
          const topPct = box.top / (window.innerHeight||1);
          const err = Math.min(Math.abs(box.top - (window.innerHeight||0)*0.35), 9999);
          const scIdle = !window.SCROLLER?.raf;
          const outsideCooldown = now > (window.SCROLLER?.coolingUntil||0);
          const tooFar = (topPct < 0.10) || (topPct > 0.85) || (err > 180);
          if (tooFar) {
            if (!_sinceTooFar) _sinceTooFar = now;
          } else {
            _sinceTooFar = 0;
          }
          const held = _sinceTooFar && ((now - _sinceTooFar) >= 500);
          if (scIdle && outsideCooldown && held) {
            window.SCROLLER?.request({ el, priority: 2, src: 'system', reason: 'watchdog' });
            _sinceTooFar = 0; // one-shot until it drifts again
            return true;
          }
        } catch {}
        return false;
      };
    } catch {}
  })();
  // Helper: focus element without native scrolling, then request SCROLLER placement
  try {
    window.focusVisible = function(el, prio = 9){
      try { el?.focus?.({ preventScroll: true }); } catch { try { el?.focus?.(); } catch {} }
      try { if (el) window.SCROLLER?.request({ el, priority: prio|0, src: 'system', reason: 'focus' }); } catch {}
    };
  } catch {}
  // Action-level scroll logs
  function logScrollAttempt(scroller, before, desiredTop, reason){
    try {
      const payload = { scroller: __nodeId(scroller), before, desiredTop, delta: (desiredTop - before), reason };
      try { if (typeof HUD?.log === 'function') HUD.log('scroll:attempt', payload); } catch {}
      try { if (typeof debug === 'function') debug({ tag:'scroll:attempt', ...payload }); } catch {}
    } catch {}
  }
  function logScrollFailure(scroller, before, desiredTop){
    try {
      const payload = { scroller: __nodeId(scroller), before, desiredTop, note: 'No change after retries; small step fallback on same scroller.' };
      try { if (typeof HUD?.log === 'function') HUD.log('scroll:stalled', payload); } catch {}
      try { if (typeof debug === 'function') debug({ tag:'scroll:stalled', ...payload }); } catch {}
    } catch {}
  }
  // Small, repeatable step was previously provided by stepScroll(scroller, dir)
  // Removed to avoid any accidental root/window fallback. Use fallbackNudge instead.
  // Fallback nudge with hard-stable and cooldown gates; always same scroller
  function fallbackNudge({ scroller, delta, metrics }){
    try {
      const m = metrics || { sim: (window.__lastSimScore||1), jitterStd: (window.__tpJitterEma||0), anchorVisible: true };
      if (!__tpCanProgrammaticScroll()) { try { if (typeof debug==='function') debug({ tag:'scroll:fallback:skip', reason:'frozen' }); } catch {} return 'skip:frozen'; }
      if (!stableEligible({ sim: Number(m.sim)||0, jitterStd: Number(m.jitterStd)||0, anchorVisible: !!m.anchorVisible })) { try { if (typeof debug==='function') debug({ tag:'scroll:fallback:skip', reason:'unstable' }); } catch {} return 'skip:unstable'; }
      const STEP = 24;
      const dy = (Math.sign(delta)||1) * STEP;
      if (typeof scroller.scrollBy === 'function') scroller.scrollBy({ top: dy, behavior: 'auto' });
      else scroller.scrollTop = (scroller.scrollTop||0) + dy;
      return 'ok:nudged';
    } catch { return 'skip:error'; }
  }
  // Minimal catch-up mover: apply hard gates, sticky-band hold, then snapped write
  function scrollToBandSimple({ scroller, targetTop, band, viewportHeight, sim, jitterStd, anchorVisible }){
    try {
      if (!stableEligible({ sim, jitterStd, anchorVisible })) return 'hold:unstable';
      if (!__tpCanProgrammaticScroll()) return 'hold:cooldown';
      const top = (scroller?.scrollTop||0);
      if (inStickyBand(targetTop, top, viewportHeight, band)) return 'ok:in-band';
      scrollToSnapped(scroller, targetTop);
      return 'ok:snapped';
    } catch { return 'hold:error'; }
  }
  // Scroll such that targetY aligns roughly to the band center, verify progress, and escalate if needed
  function scrollToBand(targetY, band=[0.28, 0.55], anchorEl=null, opts={}){
    try {
      const scroller = getScrollableAncestor(anchorEl || document.getElementById('viewer') || document.body);
      if (__tpReaderLocked && !opts.overrideLock) { try { if (typeof debug==='function') debug({ tag:'reader:block-scroll', reason:'scrollToBand' }); } catch {} return; }
      const isRoot = (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body);
      const vh = isRoot ? (window.innerHeight||0) : (scroller.clientHeight||0);
      if (!vh) return;
      const [b0, b1] = Array.isArray(band) && band.length===2 ? band : [0.28, 0.55];
      const bandCenter = (b0 + b1) / 2;
      const maxScroll = Math.max(0, (scroller.scrollHeight||0) - vh);
      const desiredTopRaw = Math.max(0, Math.min(targetY - bandCenter * vh, maxScroll));
      const DPR = (window.devicePixelRatio || 1);
      const targetTop = Math.max(0, Math.min(Math.round(desiredTopRaw * DPR) / DPR, maxScroll));
      const prefersReduced = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      const before = (scroller.scrollTop||0);
      // Early success: already in band (with epsilon tolerance)
      if (inBand(targetY, before, vh, band)){
        // If we are in an oscillation freeze window, treat as settled
        if (performance.now() < __tpOscFreezeUntil){
          try { if (typeof debug==='function') debug({ tag:'scroll:settled:freeze', before, targetY, band }); } catch {}
          return 'ok:settled';
        }
        try { if (typeof debug==='function') debug({ tag:'scroll:in-band', before, targetY, band }); } catch {}
        try { if (__isHudVerbose() && typeof HUD?.log === 'function') HUD.log('scroll:in-band', { before, targetY, band }); } catch {}
        return 'ok:in-band';
      }
      // Early noop: tiny nudge — treat as success and skip actuation
      const dist = targetTop - before;
      if (Math.abs(dist) < MIN_NUDGE_PX){
        try { if (typeof debug==='function') debug({ tag:'scroll:tiny-noop', before, desiredTop: targetTop, dist }); } catch {}
        try { if (__isHudVerbose() && typeof HUD?.log === 'function') HUD.log('scroll:tiny-noop', { before, desiredTop: targetTop, dist }); } catch {}
        return 'ok:tiny-noop';
      }
      // Sticky band guard: only move when outside the sticky band of the snapped target
      if (inStickyBand(targetTop, before, vh, band)){
        try { if (typeof debug==='function') debug({ tag:'scroll:sticky-hold', before, targetTop, band, STICKY_EPS }); } catch {}
        return 'ok:sticky';
      }
      // Log actuator attempt before issuing the scroll
      logScrollAttempt(scroller, before, targetTop, opts?.aggressive ? 'scrollToBand:aggressive' : 'scrollToBand');
      if (opts?.aggressive) { try { scrollToSnapped(scroller, targetTop); } catch {} }
      else {
        if (prefersReduced) { try { scrollToSnapped(scroller, targetTop); } catch {} }
        else { try { scroller.scrollTo({ top: targetTop, behavior: 'smooth' }); } catch { try { scrollToSnapped(scroller, targetTop); } catch {} } }
      }
      let tries = 0;
      let _lastHudProgressAt = 0;
      const verify = () => {
        try {
          const nowTop = (scroller.scrollTop||0);
          // Record for oscillation detection
          __tpRecordTopSample(nowTop);
          // If in freeze window, do not escalate; consider settled
          if (performance.now() < __tpOscFreezeUntil){ return; }
          // If ABAB oscillation detected, freeze fallbacks for 1s and mark settled
          if (__tpIsOscillating()){
            __tpOscFreezeUntil = performance.now() + 1000;
            try { if (typeof debug==='function') debug({ tag:'scroll:oscillation-freeze', until: __tpOscFreezeUntil }); } catch {}
            try { if (__isHudVerbose() && typeof HUD?.log === 'function') HUD.log('scroll:oscillation-freeze', { until: __tpOscFreezeUntil }); } catch {}
            return; // ok:settled
          }
          if (Math.abs(nowTop - before) > 1 || tries > 2){
            try {
              const ev = { tag:'scroll:progress', before, nowTop, desiredTop: targetTop, scroller: __nodeId(scroller) };
              if (typeof debug==='function') debug(ev);
              const now = performance.now();
              if (__isHudVerbose() && typeof HUD?.log === 'function' && (now - _lastHudProgressAt) > 500) { HUD.log('scroll:progress', ev); _lastHudProgressAt = now; }
            } catch {}
            if (Math.abs(nowTop - before) <= 1 && tries > 2) {
              // No progress after escalations => log stall
              logScrollFailure(scroller, before, targetTop);
            }
            return;
          }
          tries++;
          if (tries === 2){
            // Force movement on stubborn containers
            try { scrollToSnapped(scroller, targetTop); } catch {}
            // If direct set had no effect and the delta was not tiny, attempt a gated small-step nudge on the same scroller
            if (Math.abs((scroller.scrollTop||0) - before) <= 1){
              const delta = targetTop - before;
              if (Math.abs(delta) >= MIN_NUDGE_PX){
                const metrics = (typeof opts?.metrics === 'object') ? opts.metrics : { sim: (window.__lastSimScore||1), jitterStd: (window.__tpJitterEma||0), anchorVisible: true };
                fallbackNudge({ scroller, delta, metrics });
              }
            }
          }
          requestAnimationFrame(verify);
        } catch {}
      };
      requestAnimationFrame(verify);
    } catch {}
  }
  try { window.getScrollableAncestor = getScrollableAncestor; window.scrollToBand = scrollToBand; } catch {}

  // Index→Y mapping: keep a map of word-index to element top (offsetTop) so we can estimate target Y even when no element is present
  const yByIdx = new Map();
  let __tpAvgPerWordH = 24; // fallback per-word vertical increment
  function currentScrollTop(){
    try {
      const sc = (window.__TP_SCROLLER || document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body);
      return (sc===window) ? (window.scrollY||0) : (sc.scrollTop||0);
    } catch { return 0; }
  }
  function recomputeAvgPerWord(){
    try {
      const N = (paraIndex||[]);
      if (!N.length) return;
      const steps = [];
      for (let i=0;i<N.length-1;i++){
        const a = N[i], b = N[i+1];
        const dy = Math.max(0, (b.el?.offsetTop||0) - (a.el?.offsetTop||0));
        const dw = Math.max(1, (b.start - a.start)); // words between starts ≈ tokens in a
        if (dy>0 && dw>0) steps.push(dy/dw);
      }
      if (steps.length){
        steps.sort((x,y)=>x-y);
        const mid = steps[Math.floor(steps.length/2)] || steps[0];
        __tpAvgPerWordH = Math.max(6, Math.min(64, mid));
      }
    } catch {}
  }
  function avgLineHeight(){ return __tpAvgPerWordH; }
  // Probe escalation state and helpers
  let __tpProbeTier = 0; // 0..3
  let __tpPrevProbeSim = 0;
  let __tpPrevProbeCov = 0;
  function __tpProbeBandForTier(t){
    try { const n = Math.max(0, Math.min(3, Number(t)||0)); return n===0? [0.20,0.50] : n===1? [0.15,0.55] : n===2? [0.10,0.60] : [0.05,0.65]; } catch { return [0.20,0.50]; }
  }
  function __tpAfterProbeSample(prevSim, prevCov, m){
    try {
      const cov = (Number(m?.covBest)||0) + (Number(m?.clusterCov)||0) + (Number(m?.covActive)||0);
      if ((Number(m?.sim)||0) > (Number(prevSim)||0) + 0.02 || cov > (Number(prevCov)||0)) {
        __tpProbeTier = 0; // progress: reset
      } else {
        __tpProbeTier = Math.min(3, (__tpProbeTier|0) + 1);
      }
    } catch {}
  }
  function refreshYIndexMap(){
    // Wrap in abortable lock to avoid wedging on rapid DOM mutations
    (async ()=>{
      const release = await readerLock.acquire(3000);
      try {
        yByIdx.clear();
        const list = (paraIndex||[]);
        for (const p of list){
          const start = Number(p?.start)||0;
          const y = Math.max(0, Number(p?.el?.offsetTop)||0);
          if (p?.el) { try { p.el.setAttribute('data-idx', String(start)); } catch {} }
          yByIdx.set(start, y);
        }
        recomputeAvgPerWord();
      } catch {}
      finally { try { release(); } catch {} }
    })();
  }
  function estimateY(idx){
    try {
      idx = Number(idx)||0;
      if (yByIdx.has(idx)) return yByIdx.get(idx);
      const known = Array.from(yByIdx.keys()).sort((a,b)=>a-b);
      if (!known.length) return currentScrollTop();
      const below = known.find(k => k > idx);
      let above = null; for (let i=known.length-1;i>=0;i--){ if (known[i] < idx){ above = known[i]; break; } }
      if (above != null && below != null){
        const dy = (yByIdx.get(below) - yByIdx.get(above)) / Math.max(1, (below - above));
        return Math.round(yByIdx.get(above) + dy * (idx - above));
      }
      if (above != null) return Math.round(yByIdx.get(above) + avgLineHeight() * (idx - above));
      if (below != null) return Math.round(yByIdx.get(below) - avgLineHeight() * (below - idx));
      // absolute fallback: current scrollTop + (idx - activeIdx)*avgLineHeight
      let activeIdx = (function(){
        try {
          const el = (document.getElementById('script')||document).querySelector('p.active');
          const p = el ? (paraIndex||[]).find(pp => pp.el === el) : null;
          if (p) return p.start|0;
        } catch {}
        return Number(currentIndex)||0;
      })();
      return Math.round(currentScrollTop() + (idx - activeIdx) * avgLineHeight());
    } catch { return currentScrollTop(); }
  }
  try { window.__tpYByIdx = yByIdx; window.estimateY = estimateY; } catch {}
  // Observe layout and DOM changes to keep the map fresh
  try {
    const installYIdxObservers = () => {
      const viewer = document.getElementById('viewer');
      const script = document.getElementById('script');
      if (!script) return;
      if (!window.__tpYIdxRO && window.ResizeObserver){
        window.__tpYIdxRO = new ResizeObserver(()=>{ try { refreshYIndexMap(); } catch {} });
        try { window.__tpYIdxRO.observe(script); } catch {}
        if (viewer) try { window.__tpYIdxRO.observe(viewer); } catch {}
      }
      if (!window.__tpYIdxMO && window.MutationObserver){
        window.__tpYIdxMO = new MutationObserver(()=>{ try { refreshYIndexMap(); } catch {} });
        try { window.__tpYIdxMO.observe(script, { childList:true, subtree:true }); } catch {}
      }
    };
    // Defer until DOMContentLoaded if needed
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installYIdxObservers, { once:true });
    else installYIdxObservers();
  } catch {}

  // Programmatic scroll guard with TTL to avoid stuck states
  let __tpProgrammaticScroll = false;
  let __tpScrollTTL = null;
  function beginProgrammaticScroll(ms = 800){
    try {
      __tpProgrammaticScroll = true;
      if (__tpScrollTTL) { try { clearTimeout(__tpScrollTTL); } catch {} }
      __tpScrollTTL = setTimeout(()=>{ try { __tpProgrammaticScroll = false; __tpScrollTTL = null; } catch {} }, ms);
    } catch {}
  }
  function endProgrammaticScroll(){
    try {
      __tpProgrammaticScroll = false;
      if (__tpScrollTTL) { try { clearTimeout(__tpScrollTTL); } catch {} __tpScrollTTL = null; }
    } catch {}
  }
  // Optional: listen for scrollend to end cooldown earlier, but respect a minimum hold time (500ms)
  try {
    const MIN_HOLD = 500;
    const _begin = beginProgrammaticScroll;
    beginProgrammaticScroll = function(ms = 800){
      try { __tpLastProgAt = performance.now(); } catch {}
      return _begin(ms);
    };
    window.addEventListener('scrollend', ()=>{
      try {
        if (!__tpProgrammaticScroll) return;
        const dt = performance.now() - __tpLastProgAt;
        if (dt >= MIN_HOLD) { endProgrammaticScroll(); }
      } catch {}
    }, { passive:true });
  } catch {}
  try { window.beginProgrammaticScroll = beginProgrammaticScroll; window.endProgrammaticScroll = endProgrammaticScroll; } catch {}

  // Continuous catch-up scheduler: evaluate gentle scroll-follow independently of activation
  let __tpStagnantTicks = 0;
  function evaluateCatchUp(){
    try {
      // Cooldown guard: if a programmatic scroll was issued recently, skip re-evaluation
      if (__tpProgrammaticScroll) { return; }
      const vList = __vParaIndex || [];
      if (!Array.isArray(vList) || !vList.length) return;
      const fIdx = (typeof window.__tpFrontierIdx === 'number' && window.__tpFrontierIdx >= 0) ? window.__tpFrontierIdx : currentIndex || 0;
      const frontierWord = Math.max(0, Math.min(Math.round(fIdx), (scriptWords?.length||1) - 1));
      const vCurIdx = vList.findIndex(v => frontierWord >= v.start && frontierWord <= v.end);
      if (vCurIdx < 0) return;
      const vCur = vList[vCurIdx];
      // Compute cluster coverage around frontier using last spoken tail
      let clusterCov = 0;
      let covBest = 0;
      try {
        const tail = Array.isArray(window.__tpPrevTail) ? window.__tpPrevTail : [];
        const w = [vCurIdx - 1, vCurIdx, vCurIdx + 1].filter(i => i >= 0 && i < vList.length);
        let hit = 0, tot = 0;
        for (const i of w){
          const tks = scriptWords.slice(vList[i].start, vList[i].end + 1);
          const c = tokenCoverage(tks, tail);
          const wgt = (i === vCurIdx) ? 1.0 : 0.6;
          hit += wgt * (c * tks.length);
          tot += wgt * tks.length;
        }
        clusterCov = tot ? (hit / tot) : 0;
        // covBest: coverage of the frontier's current virtual line
        try { const lineTokens = scriptWords.slice(vCur.start, vCur.end + 1); covBest = tokenCoverage(lineTokens, tail); } catch { covBest = 0; }
      } catch { clusterCov = 0; }
      const bestSim = (typeof window.__lastSimScore === 'number') ? window.__lastSimScore : 0;
  const activeEl = (document.getElementById('script')||document).querySelector('p.active');
      const anchorVisible = isInComfortBand(activeEl, { top: 0.25, bottom: 0.55 });
      const now = performance.now();
      try { if (anchorVisible) window.__tpLastAnchorInViewAt = now; } catch {}
      const lastIn = (window.__tpLastAnchorInViewAt||0);
  const STALE_MS = 1200, MIN_SIM = 0.92, LEAD_LINES = 2;
      const stale = (now - lastIn) > STALE_MS;
      // Lead in virtual lines
      let lead = 0; try {
        const activeIdx = (function(){
          try {
            const el = activeEl; if (!el) return -1;
            const para = paraIndex.find(p => p.el === el) || null;
            if (!para) return -1; return para.start;
          } catch { return -1; }
        })();
        const fV = vCurIdx;
        const aV = vList.findIndex(v => activeIdx >= v.start && activeIdx <= v.end);
        if (fV >= 0 && aV >= 0) lead = fV - aV;
      } catch { lead = 0; }
      // Compute active coverage for logging (not used in decision)
      let covActive = 0; try {
        const el = activeEl; if (el){ const para = paraIndex.find(p => p.el === el) || null; if (para){ const tail = Array.isArray(window.__tpPrevTail) ? window.__tpPrevTail : []; const lineTokens = scriptWords.slice(para.start, para.end + 1); covActive = tokenCoverage(lineTokens, tail); } }
      } catch { covActive = 0; }
      // Oscillation breaker: with ScrollManager PD loop, avoid hard holds to reduce tug-of-war
      try {
        const topNow = currentScrollTop();
        __tpRecordTopSample(topNow);
        // If oscillation is detected, prefer letting ScrollManager PD settle; continue to decision logic
        if (__tpIsOscillating()){ /* no-op: let PD loop dampen */ }
      } catch {}
      // Hard-stable eligibility check (applies before any catch-up/fallback)
      try {
        const jitterStd = (typeof window.__tpJitterEma === 'number') ? window.__tpJitterEma : 0;
        if (!stableEligible({ sim: bestSim, jitterStd, anchorVisible })){
          const ev = { tag:'catchup:stable:hold', sim:+Number(bestSim).toFixed(2), jitterStd:+Number(jitterStd).toFixed(2), anchorVisible, until: (__tpLowSimAt + LOWSIM_FREEZE) };
          try { if (typeof debug==='function') debug(ev); } catch {}
          try { if (__isHudVerbose() && typeof HUD?.log === 'function') HUD.log('catchup:stable:hold', ev); } catch {}
          try { window.__tpLastCatchupDecision = 'hold:unstable'; } catch {}
          return;
        }
      } catch {}
      // Dual thresholds + deadman probe
      const SIM_GO = 0.82;
      const SIM_PROBE = 0.60;
      const HOLD_DEADMAN = 24; // ~24 ticks without progress => probe
      window.__tpHoldStreak = (typeof window.__tpHoldStreak === 'number') ? window.__tpHoldStreak : 0;
      const covered = (covBest + clusterCov + covActive) > 0;
      function decideCatchup(m){
        if (m.sim >= SIM_GO) return 'go:signal';
        // Probes allowed independent of coverage; key predicates: stale, anchor invisible, sim above probe, and hold streak
        if (m.stale && !m.anchorVisible && m.sim >= SIM_PROBE && window.__tpHoldStreak >= HOLD_DEADMAN) return 'go:probe';
        return 'hold';
      }
      const metrics = { lead, sim: bestSim, stale, anchorVisible, covBest, clusterCov, covActive };
  const decision = decideCatchup(metrics);
  try { window.__tpLastCatchupDecision = decision; } catch {}
      // Low-sim/jitter freeze marker
      try {
        const jStd = (typeof window.__tpJitterEma === 'number') ? window.__tpJitterEma : 0;
        if (bestSim < SIM_OK || jStd > JITTER_HIGH){ __tpLowSimAt = performance.now(); }
      } catch {}
      // Log eligibility each tick with reason (debug always; HUD only if verbose)
      try {
        let reason = (decision === 'go:signal') ? 'ok:signal' : (decision === 'go:probe') ? 'ok:probe' : 'hold';
        if (decision === 'hold'){
          const blockers = [];
          if (bestSim < SIM_GO) blockers.push('sim<thresh');
          if (!stale) blockers.push('notStale');
          if (anchorVisible) blockers.push('anchorVisible');
          if (bestSim < SIM_PROBE) blockers.push('sim<probe');
          if ((window.__tpHoldStreak|0) < HOLD_DEADMAN) blockers.push('hold<deadman');
          // coverage is not a gate for probing, but include as info if present
          if (covered) blockers.push('covered>0');
          reason = blockers.join('|') || 'hold';
        }
        const ev = { tag:'catchup:eligibility', lead, sim:+Number(bestSim).toFixed(2), covBest:+Number(covBest).toFixed(2), clusterCov:+Number(clusterCov).toFixed(2), covActive:+Number(covActive).toFixed(2), stale, anchorVisible, decision, reason, SIM_GO, SIM_PROBE, holdStreak:(window.__tpHoldStreak|0) };
        if (typeof debug==='function') debug(ev);
        if (__isHudVerbose() && typeof HUD?.log === 'function') HUD.log('catchup:eligibility', ev);
      } catch {}
      if (decision.startsWith('go')){
        try {
          // Hard-stable programmatic gate: skip actuation if in freeze windows
          if (!__tpCanProgrammaticScroll()) { try { window.__tpLastCatchupDecision = 'hold:cooldown'; } catch {} return; }
          const el = (function(){ try { const p = paraIndex.find(p => frontierWord >= p.start && frontierWord <= p.end); return p?.el; } catch { return null; } })();
          // Control loop: widen band and skip smoothing if probing or after repeated no-op attempts
          __tpStagnantTicks++;
          const aggressive = (decision === 'go:probe') || (__tpStagnantTicks > 12);
          const band = (decision === 'go:probe') ? __tpProbeBandForTier(__tpProbeTier) : [0.28, 0.55];
          // Avoid recomputing/retargeting while in programmatic cooldown
          if (__tpProgrammaticScroll) return;
          const estY = estimateY(frontierWord);
          // Hysteresis: don’t fire catch-up unless target drifted sufficiently outside the band
          try {
            const sc = (window.__TP_SCROLLER || document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body);
            const useWindow = (sc === document.scrollingElement || sc === document.documentElement || sc === document.body);
            const vhNow = useWindow ? (window.innerHeight||0) : (sc.clientHeight||0);
            const topNow = (sc.scrollTop||0);
            if (!isOutsideBandBy(estY, topNow, vhNow, band, HYSTERESIS) && decision !== 'go:probe'){
              // For normal signal-go, bail if within hysteresis margin
              try { if (typeof debug==='function') debug({ tag:'catchup:hysteresis-suppress', topNow, estY, band, HYSTERESIS }); } catch {}
              return; // skip this tick
            }
          } catch {}
          try {
            const bestIdx = frontierWord; const frontierIdx = frontierWord;
            const haveExact = (function(){ try { return !!(__tpYByIdx && __tpYByIdx.has(frontierIdx)); } catch { return false; } })();
            if (typeof HUD?.log === 'function') HUD.log('catchup:target', { bestIdx, frontierIdx, haveExact, targetY: estY });
            if (typeof debug === 'function') debug({ tag:'catchup:target', bestIdx, frontierIdx, haveExact, targetY: estY });
          } catch {}
          const lastTop = currentScrollTop();
          // Keep programmatic flag for at least 500ms to allow coalescing
          beginProgrammaticScroll(500);
          try { __tpLastProgAt = performance.now(); } catch {}
          // Snapshot metrics before probe to compare after movement
          const prevSim = bestSim;
          const prevCov = (covBest + clusterCov + covActive);
          // Prepare simple mover inputs
          const scroller = getScrollableAncestor(el || document.getElementById('viewer') || document.body);
          const useWindow = (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body);
          const vhNow = useWindow ? (window.innerHeight||0) : (scroller.clientHeight||0);
          // Route programmatic movement through ScrollManager (single authority, deadband + PD)
          try {
            const prio = (decision === 'go:signal') ? 6 : 7; // probe edges slightly higher to help recovery
            window.SCROLLER?.request({ y: estY, priority: prio, src: (decision==='go:signal'?'match':'system'), reason: 'catchup' });
          } catch {}
          setTimeout(()=>{
            try {
              const nowTop = currentScrollTop();
              if (Math.abs(nowTop - lastTop) < 1) {
                __tpStagnantTicks = Math.max(__tpStagnantTicks, 16);
              } else {
                __tpStagnantTicks = 0;
              }
              // Reset hold streak after any go
              window.__tpHoldStreak = 0;
              // If this was a probe, evaluate progress and adjust tier
              if (decision === 'go:probe') {
                const m2 = { lead, sim: bestSim, stale, anchorVisible, covBest, clusterCov, covActive };
                __tpAfterProbeSample(prevSim, prevCov, m2);
                try {
                  if (__isHudVerbose() && typeof HUD?.log === 'function') HUD.log('catchup:probe_tier', { tier: __tpProbeTier, prevSim: +Number(prevSim).toFixed(2), sim: +Number(bestSim).toFixed(2), prevCov: +Number(prevCov).toFixed(2), cov: +Number((covBest+clusterCov+covActive)).toFixed(2) });
                } catch {}
              } else {
                __tpProbeTier = 0; // normal success resets probe tier
              }
            } catch {}
            endProgrammaticScroll();
          }, 300);
          try { if (typeof debug==='function') debug({ tag:'scroll:catchup:tick', lead, clusterCov:+clusterCov.toFixed(2), sim:+bestSim.toFixed(2), stale, anchorVisible }); } catch {}
        } catch {}
      }
      else {
        __tpStagnantTicks = 0;
        try { window.__tpLastCatchupDecision = 'hold'; } catch {}
        try {
          window.__tpHoldStreak += 1;
          if (window.__tpHoldStreak % 24 === 0) {
            try {
              log('catchup:hold_streak', { holdStreak: window.__tpHoldStreak, sim: bestSim });
              if (__isHudVerbose() && typeof HUD?.log === 'function') HUD.log('catchup:hold_streak', { holdStreak: window.__tpHoldStreak, sim: +Number(bestSim).toFixed(2) });
            } catch {}
          }
        } catch {}
      }
      // Comfort band watchdog: gated recenter through ScrollManager
      try {
        const armed = (window.__tpWatchdogArmed !== false);
        if (!anchorVisible && armed && activeEl) {
          const did = window.maybeRecenter?.(activeEl);
          if (did) {
            try {
              const ev = { tag:'watchdog:recenter', reason:'maybeRecenter', ts: Date.now() };
              if (typeof debug==='function') debug(ev);
              if (__isHudVerbose() && typeof HUD?.log === 'function') HUD.log('watchdog:recenter', ev);
            } catch {}
            try { window.__tpWatchdogArmed = false; } catch {}
          }
        }
        if (anchorVisible) { try { window.__tpWatchdogArmed = true; } catch {} }
      } catch {}
    } catch {}
  }
  // Run a small rAF scheduler to keep catch-up re-armed unless user is actively scrolling
  try {
    if (!window.__tpCatchupRAF){
      const tick = () => { try { evaluateCatchUp(); } catch {} window.__tpCatchupRAF = requestAnimationFrame(tick); };
      window.__tpCatchupRAF = requestAnimationFrame(tick);
    }
  } catch {}

  // Activation helpers: tolerate jitter using EMA conf, suffix hits, and a timeout guard
  let __tpLowConfSince = 0;
  let __tpLastAct = { idx: null, reason: null };
  function activateLine(idx, opts = {}){
    const payload = { idx, reason: opts.reason||'conf', sim: opts.sim, cov: opts.cov, conf: opts.conf, suffixHits: opts.suffixHits };
    // Dedupe: if we already activated the same idx with the same reason, skip logging/hud spam but return true
    try {
      if (__tpLastAct && __tpLastAct.idx === idx && __tpLastAct.reason === payload.reason) {
        return true;
      }
      __tpLastAct = { idx, reason: payload.reason };
    } catch {}
  try { if (typeof debug === 'function') debug({ tag:'match:activate', ...payload }); } catch {}
  try { if (typeof HUD?.log === 'function') HUD.log('match:activate', payload); } catch {}
  // Emit to bus so debouncers can coalesce before reaching SCROLLER
  try { window.HUD?.bus?.emit('match:activate', payload); } catch {}
    try { window.__tpLastActivation = { idx, reason: payload.reason, t: performance.now() }; } catch {}
    return true;
  }
  function maybeActivate({ idx, sim, cov, suffixHits = 0, jitterStd }){
    const CONF_T = 0.58; // base
    const conf = computeConf({ sim, cov, jitterStd });
    const confOk = conf >= Math.max(0.33, CONF_T - 0.25 * cov);
  let reason = null;
  if (cov === 1 && confOk) reason = 'conf';
  else if (sim >= 0.92 && cov >= 0.14) reason = 'sim+cov';
  else if (suffixHits >= 2 && sim >= 0.88) reason = 'suffix';
  else if (cov >= 0.35 && sim >= 0.85) reason = 'cov+sim';
  else if (confOk) reason = 'conf';

    if (reason) {
      __tpLowConfSince = 0;
      return activateLine(idx, { reason, sim, cov, conf, suffixHits });
    }
    // timeout guard: if we’re clearly on the right line but jitter is noisy
    if (sim >= 0.95) {
      if (!__tpLowConfSince) __tpLowConfSince = performance.now();
      if (performance.now() - __tpLowConfSince > 1200 && cov >= 0.12) {
        __tpLowConfSince = 0;
        return activateLine(idx, { reason: 'timeout-guard', sim, cov, conf, suffixHits });
      }
    } else {
      __tpLowConfSince = 0;
    }
    return false;
  }

  // Debounce chatty sources before they reach SCROLLER
  const __tpDebouncers = new Map();
  function debounceKeyed(key, fn, ms = 150){ try { const tPrev = __tpDebouncers.get(key); if (tPrev) clearTimeout(tPrev); const t = setTimeout(()=>{ try{ fn(); }catch{} }, ms); __tpDebouncers.set(key, t); } catch {} }

  // If a bus exists, coalesce bursts of match:activate events into one SCROLLER request
  try {
    if (window.HUD?.bus && typeof window.HUD.bus.on === 'function' && window.SCROLLER){
      window.HUD.bus.on('match:activate', (p)=>{
        try {
          const bucket = Math.round((Number(p?.conf)||0) * 20);
          const key = `ma:${p?.idx}|${p?.reason}|${bucket}`;
          debounceKeyed(key, ()=>{ try { window.SCROLLER.onMatchActivate(p); } catch {} }, 120);
        } catch {}
      });
    }
  } catch {}

  // Early real-core waiter: provides a stable entry that will call the real core once it appears
  try {
    if (typeof window.__tpRealCore !== 'function') {
      window.__tpRealCore = async function __coreWaiter(){
        const self = window.__tpRealCore;
        for (let i = 0; i < 2000; i++) { // ~20s
          try {
            if (typeof _initCore === 'function' && _initCore !== self && _initCore !== window._initCore) {
              return _initCore();
            }
          } catch {}
          if (typeof window._initCore === 'function' && window._initCore !== self) {
            return window._initCore();
          }
          await new Promise(r => setTimeout(r, 10));
        }
        throw new Error('Core waiter timeout');
      };
      try { window.__tpRealCore.__tpWaiter = true; } catch {}
    }
  } catch {}
  // Install an early stub for core init that queues until the real core is defined
  try {
    if (typeof window._initCore !== 'function') {
      window._initCore = async function __initCoreStub(){
        try { __tpBootPush('initCore-stub-wait'); } catch {}
        const self = window._initCore;
        // If the hoisted function exists and is not this stub, call it immediately
        try {
          if (typeof _initCore === 'function' && _initCore !== self && _initCore !== window._initCore) {
            try { __tpBootPush('initCore-stub-direct-call'); } catch {}
            return _initCore();
          }
        } catch {}
        const core = await new Promise((res)=>{
          let tries = 0; const id = setInterval(()=>{
  
      // Tiny global commit/scroll scheduler to centralize writes and make metrics easier
      ;(function installTinyScheduler(){
        try {
          if (window.__tpTinySchedulerInstalled) return;
          window.__tpTinySchedulerInstalled = true;
          let _pendingTop = null, _rafId = 0;
          const getScroller = ()=> (window.__TP_SCROLLER || document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body);
          function clamp(y){ const sc = getScroller(); if (!sc) return 0; const max = Math.max(0, sc.scrollHeight - sc.clientHeight); return Math.max(0, Math.min(Number(y)||0, max)); }
          function requestScrollTop(y){ const sc = getScroller(); if (!sc) return; _pendingTop = clamp(y); try{ window.__lastScrollTarget = _pendingTop; }catch{} if (_rafId) return; _rafId = requestAnimationFrame(()=>{ const t=_pendingTop; _pendingTop=null; _rafId=0; try{ sc.scrollTo({ top: t, behavior:'auto' }); } catch { sc.scrollTop = t; } try{ window.__lastScrollTarget=null; }catch{} }); }
          // publish minimal API
          window.__tpScrollWrite = requestScrollTop;
          // optional: wrap viewer.scrollTop writes
          const sc = getScroller();
          if (sc && !sc.__tpWriteWrapped){
            sc.__tpWriteWrapped = true;
            try {
              const origSet = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sc), 'scrollTop')?.set;
              if (origSet){
                Object.defineProperty(sc, 'scrollTop', { configurable:true, set(v){ requestScrollTop(v); } });
              }
            } catch {}
          }
        } catch {}
      })();
            // Prefer explicitly published real core ONLY if it's not just the early waiter
            if (typeof window.__tpRealCore === 'function' && !window.__tpRealCore.__tpWaiter) { clearInterval(id); return res(window.__tpRealCore); }
            // Or if window._initCore has been swapped to a different function, use that
            if (typeof window._initCore === 'function' && window._initCore !== self) { clearInterval(id); return res(window._initCore); }
            // Or if the hoisted real function has appeared, use it directly
            try { if (typeof _initCore === 'function' && _initCore !== self) { clearInterval(id); return res(_initCore); } } catch {}
            if (++tries > 2000) { clearInterval(id); return res(null); } // ~20s
          }, 10);
        });
        if (typeof core === 'function') return core();
        throw new Error('Core not ready after stub wait');
      };
    }
  } catch {}
  // Watchdog: if the real core is not defined soon, dump boot trace for diagnosis
  try {
    setTimeout(()=>{
      try {
        const trace = (window.__TP_BOOT_TRACE||[]);
        const hasCoreDef = trace.some(r => r && r.m === 'after-_initCore-def');
        if (!hasCoreDef) {
          console.warn('[TP-Pro] Core definition not reached yet; dumping boot trace tail…');
          const tail = trace.slice(-50).map(x=>x && x.m);
          console.log('[TP-Pro] Boot tail:', tail);
        }
      } catch {}
    }, 3000);
  } catch {}
    // Establish a stable core runner that waits until core is ready
    try {
      if (!window._initCoreRunner) {
        let __resolveCoreRunner;
        const __coreRunnerReady = new Promise(r => { __resolveCoreRunner = r; });
        window._initCoreRunner = async function(){
          try { await __coreRunnerReady; } catch {}
          if (typeof window._initCore === 'function') return window._initCore();
          if (typeof _initCore === 'function') return _initCore();
          throw new Error('Core not ready');
        };
        window.__tpSetCoreRunnerReady = () => { try { __resolveCoreRunner && __resolveCoreRunner(); } catch {} };
      }
    } catch {}
  // Provide a safe early init proxy on window that forwards to core when available
  try {
    // Promise that resolves when core initializer becomes available
    if (!window.__tpCoreReady) {
      window.__tpCoreReady = new Promise((resolve) => { window.__tpResolveCoreReady = resolve; });
    }
    if (typeof window.init !== 'function') {
      window.init = async function(){
        try {
          // If core is already available, run immediately
          if (typeof _initCore === 'function' || typeof window._initCore === 'function') {
            return (window._initCore || _initCore)();
          }
          try { __tpBootPush('window-init-proxy-waiting-core'); } catch {}
          // Wait briefly for core to appear (either via assignment or resolve hook)
          const core = await Promise.race([
            new Promise((res)=>{
              let tries = 0; const id = setInterval(()=>{
                if (typeof _initCore === 'function' || typeof window._initCore === 'function') { clearInterval(id); res(window._initCore || _initCore); }
                else if (++tries > 300) { clearInterval(id); res(null); }
              }, 10);
            }),
            (window.__tpCoreReady?.then(()=> (window._initCore || _initCore)).catch(()=>null))
          ]);
          if (typeof core === 'function') { return core(); }
          console.warn('[TP-Pro] window.init proxy: core not ready after wait');
            // Use the stable runner which waits until core is ready
            try { __tpBootPush('window-init-proxy-waiting-core'); } catch {}
            return await window._initCoreRunner();
        } catch(e){ console.error('[TP-Pro] window.init proxy error', e); }
      };
      __tpBootPush('window-init-proxy-installed');
    }
  } catch {}
  // Early minimal init safety net: builds placeholder + dB meter if deep init stalls.
  (function earlyInitFallback(){
    try {
      if (window.__tpInitSuccess || window.__tpEarlyInitRan) return;
      // Defer a tick so DOM is definitely present
      requestAnimationFrame(()=>{
        try {
          if (window.__tpInitSuccess || window.__tpEarlyInitRan) return;
          const scriptEl = document.getElementById('script');
          const editorEl = document.getElementById('editor');
          if (scriptEl && !scriptEl.innerHTML) {
            scriptEl.innerHTML = '<p><em>Paste text in the editor to begin… (early)</em></p>';
          }
          // Build minimal dB meter bars if missing
          const meter = document.getElementById('dbMeterTop');
          if (meter && !meter.querySelector('.bar')) {
            try { (typeof buildDbBars === 'function') ? buildDbBars(meter) : (function(m){ for(let i=0;i<10;i++){ const b=document.createElement('div'); b.className='bar'; m.appendChild(b);} })(meter); } catch {}
          }
          window.__tpEarlyInitRan = true;
          try { __tpBootPush && __tpBootPush('early-init-fallback'); } catch {}
        } catch (e) { console.warn('[TP-Pro] earlyInitFallback error', e); }
      });
    } catch {}
  })();

  // Absolute minimal boot (independent of full init) to restore placeholder + meter if script aborts early.
  function minimalBoot(){
    try {
      if (window.__tpInitSuccess || window.__tpMinimalBootRan) return;
      window.__tpMinimalBootRan = true;
      const scriptEl = document.getElementById('script');
      const editorEl = document.getElementById('editor');
      if (scriptEl && (!scriptEl.textContent || !scriptEl.textContent.trim())) {
        scriptEl.innerHTML = '<p><em>Paste text in the editor to begin…</em></p>';
      }
      // Build meter bars (lightweight fallback if buildDbBars not yet defined)
      const meter = document.getElementById('dbMeterTop');
      if (meter && !meter.querySelector('.bar')) {
        if (typeof buildDbBars === 'function') { try { buildDbBars(meter); } catch {} }
        else {
          for (let i=0;i<12;i++){ const b=document.createElement('div'); b.className='bar'; meter.appendChild(b); }
        }
      }
      // Wire top normalize button minimally (may be overwritten by full init later)
      const nbtn = document.getElementById('normalizeTopBtn');
      if (nbtn && !nbtn.__mini){
        nbtn.__mini = true;
        nbtn.addEventListener('click', ()=>{
          try {
            if (typeof window.normalizeToStandard === 'function') window.normalizeToStandard();
            else if (typeof window.fallbackNormalize === 'function') window.fallbackNormalize();
          } catch(e){ console.warn('Mini normalize failed', e); }
        });
      }
      try { __tpBootPush('minimal-boot'); } catch {}
    } catch (e){ console.warn('[TP-Pro] minimalBoot error', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', minimalBoot);
  else minimalBoot();
  try { __tpBootPush('post-minimalBoot'); } catch {}
  // Ultra-early safety init attempt (will run before normal scheduler if nothing else fires)
  setTimeout(()=>{
    try {
      if (!window.__tpInitSuccess && !window.__tpInitCalled && typeof init === 'function') {
        if (window.__TP_DEV) { try { console.info('[TP-Pro] Early zero-time force init attempt'); } catch {} }
        window.__tpInitCalled = true;
        init();
      }
    } catch(e){ console.error('[TP-Pro] early force init error', e); }
  }, 0);
  try { __tpBootPush('after-zero-time-init-attempt-scheduled'); } catch {}
  // cSpell:ignore playsinline webkit-playsinline recog chrono preroll topbar labelledby uppercased Tunables tunables Menlo Consolas docx openxmlformats officedocument wordprocessingml arrayBuffer FileReader unpkg mammoth

  // Early redundant init scheduling (safety net): wait for init to be defined, then call once
  try { __tpBootPush('pre-init-scheduling-early'); } catch {}
  try {
    const callInitOnce = () => {
      if (window.__tpInitCalled) return;
      if (typeof init === 'function') {
        window.__tpInitCalled = true;
        try { __tpBootPush('early-init-invoking'); } catch {}
        try { init(); } catch(e){ console.error('init failed (early)', e); }
      } else if (typeof window._initCore === 'function') {
        window.__tpInitCalled = true;
        try { __tpBootPush('early-core-invoking'); } catch {}
        (async ()=>{
          try {
            await window._initCore();
            console.log('[TP-Pro] _initCore early path end (success)');
          } catch(e){
            console.error('[TP-Pro] _initCore failed (early path):', e);
          }
        })();
      } else {
        // Shouldn’t happen due to guard, but reset flag to allow later retry
        window.__tpInitCalled = false;
      }
    };
    const whenInitReady = () => {
      if (typeof init === 'function') { callInitOnce(); return; }
      try { __tpBootPush('early-waiting-for-init'); } catch {}
      let tries = 0;
      const id = setInterval(() => {
        if (typeof init === 'function' || typeof window._initCore === 'function') { clearInterval(id); callInitOnce(); }
        else if (++tries > 300) { clearInterval(id); console.warn('[TP-Pro] init not defined after wait'); }
      }, 10);
    };
    if (!window.__tpInitScheduled) {
      window.__tpInitScheduled = true;
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', whenInitReady, { once: true });
      } else {
        Promise.resolve().then(whenInitReady);
      }
    }
  } catch(e){ console.warn('early init scheduling error', e); }
  try { __tpBootPush('init-scheduling-early-exited'); } catch {}

  /* ──────────────────────────────────────────────────────────────
   * Boot diagnostics
   * ────────────────────────────────────────────────────────────── */
  const log  = (...a) => console.log('[TP-Pro]', ...a);
  const warn = (...a) => console.warn('[TP-Pro]', ...a);
  const err  = (...a) => console.error('[TP-Pro]', ...a);

  // Missing constants / safe fallbacks (restored)
  const DEVICE_KEY = 'tp_mic_device_v1';
  const SETTINGS_KEY = 'hudSettings';
  // Define globals used later to avoid early ReferenceErrors halting script
  let dbAnim = null;          // requestAnimationFrame id for dB meter
  let audioStream = null;     // MediaStream for mic
  let analyser = null;        // AnalyserNode
  let audioCtx = null;        // AudioContext
  // Display & camera/session globals (avoid ReferenceErrors during early handlers)
  let displayReady = false;           // display window handshake state
  let displayHelloTimer = null;       // hello ping interval id
  let displayHelloDeadline = 0;       // cutoff for hello pings
  let camStream = null;               // active camera MediaStream
  let wantCamRTC = false;             // user intent to mirror cam to display
  let camPC = null;                   // RTCPeerConnection for camera
  let recog = null;                   // SpeechRecognition instance
  let camAwaitingAnswer = false;      // negotiation flag to gate remote answers
  // Peak hold state for dB meter
  const peakHold = { value: 0, lastUpdate: 0, decay: 0.9 };
  // Default for recAutoRestart until init wires it; exposed via defineProperty later
  let recAutoRestart = false;
  // Auto-start mic if previously chosen device is present
  let pendingAutoStart = false;
  function _toast(msg, opts){
    // Lightweight fallback if the richer toast system was not injected
    try { console.debug('[toast]', msg, opts||''); } catch {}
  }

  window.addEventListener('error', e => setStatus('Boot error: ' + (e?.message || e)));
  window.addEventListener('unhandledrejection', e => setStatus('Promise rejection: ' + (e?.reason?.message || e?.reason || e)));

  // CSS rule '.hidden { display: none !important; }' removed. Add this to your CSS file instead.

  // TP: zoom-guard (main)
  // Prevent browser-level zoom (Ctrl/Meta + wheel or +/-/0) so each window keeps its own in-app typography zoom.
  try {
    window.addEventListener('wheel', (e)=>{
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); }
    }, { passive: false });
    window.addEventListener('keydown', (e)=>{
      if (e.ctrlKey || e.metaKey) {
        const k = (e.key||'');
        if (k === '+' || k === '=' || k === '-' || k === '_' || k === '0') e.preventDefault();
      }
    }, { capture: true });
  } catch {}
  try { __tpBootPush('after-zoom-guard'); } catch {}



function setStatus(msg){
  try {
    const s = document.getElementById('status') || (() => {
      const p = document.createElement('p');
      p.id = 'status';
      (document.body || document.documentElement).appendChild(p);
      return p;
    })();
    s.textContent = String(msg);
  } catch (e) {
    // ignore
  }

// Confusion pairs canonicalization: editable via Settings + defaults
const DEFAULT_CONFUSIONS = {
  confusionPairs: {
    single: ["sing"],
    portion: ["port", "portion"],
    sale: ["sal", "salem"],
    cell: ["cell", "salem", "sale"],
    enforcement: ["enforcement", "forcemen", "forcement", "salemforcement"],
    ev: ["ev", "uv", "evil"],
    line: ["line", "l", "lion"],
  }
};

let CANON = {};
// One-time, versioned settings migration to merge defaults into localStorage without clobbering user values
function migrateHudSettings(defaults, opts = {}) {
  const STORAGE_KEY     = opts.storageKey || 'hudSettings';
  const VERSION         = (opts.version ?? 1);
  const versionStrategy = opts.versionStrategy || 'flag'; // 'flag' | 'meta'
  const FLAG_KEY        = `${STORAGE_KEY}:migrated:v${VERSION}`;

  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;

    // Decide if migration already done
    if (versionStrategy === 'flag' && localStorage.getItem(FLAG_KEY)) return false;

    let current = {};
    const raw = localStorage.getItem(STORAGE_KEY);
    try { if (raw) current = JSON.parse(raw); }
    catch {
      try { localStorage.setItem(`${STORAGE_KEY}:backup:${Date.now()}`, raw || ''); } catch {}
      current = {};
    }

    // meta-based short-circuit
    if (versionStrategy === 'meta'){
      const metaV = current?.__meta?.defaultsVersion ?? 0;
      if (metaV >= VERSION) return false;
    }

    const [merged, changed] = (function mergeMissingDeep(dst, src){
      let changed = false;
      const out = (Array.isArray(dst) ? [...dst] : (isPlainObject(dst) ? { ...dst } : dst));

      if (Array.isArray(src)){
        const set = new Set(Array.isArray(out) ? out : []);
        for (const v of src) if (!set.has(v)) { set.add(v); changed = true; }
        return [Array.from(set), changed];
      }

      if (isPlainObject(src)){
        const base = isPlainObject(out) ? out : {};
        for (const [k, v] of Object.entries(src)){
          if (!(k in base) || base[k] === undefined){
            // structuredClone fallback
            let clone;
            try { clone = typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)); }
            catch { clone = v; }
            base[k] = clone;
            changed = true;
          } else if (isPlainObject(v)){
            const [child, c] = mergeMissingDeep(base[k], v);
            if (c) { base[k] = child; changed = true; }
          } else if (Array.isArray(v) && Array.isArray(base[k])){
            const [arr, c] = mergeMissingDeep(base[k], v);
            if (c) { base[k] = arr; changed = true; }
          }
        }
        return [base, changed];
      }

      return [out, changed];

      function isPlainObject(x){ return x && typeof x === 'object' && !Array.isArray(x); }
    })(current, defaults);

    // Stamp version according to strategy
    if (versionStrategy === 'meta'){
      try {
        merged.__meta = merged.__meta || {};
        merged.__meta.defaultsVersion = VERSION;
        if (!merged.__meta.migratedAt) merged.__meta.migratedAt = new Date().toISOString();
      } catch {}
    }

    try {
      if (changed || versionStrategy === 'meta') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        // let the app know so Settings can re-render
        try { window.dispatchEvent(new CustomEvent('hudSettings:migrated', { detail: { storageKey: STORAGE_KEY, version: VERSION, strategy: versionStrategy } })); } catch {}
      }
      if (versionStrategy === 'flag') localStorage.setItem(FLAG_KEY, '1'); // one-time per version
    } catch (err) {
      console.warn('hudSettings migration failed:', err);
      return false;
    }

    return changed;
  } catch { return false; }
}
function loadConfusions(settings){
  try {
    CANON = {};
    // 1) Apply defaults first (can be overridden by user settings)
    const defaults = (DEFAULT_CONFUSIONS && DEFAULT_CONFUSIONS.confusionPairs) || {};
    for (const [canon, alts] of Object.entries(defaults)){
      for (const alt of (alts||[])) { CANON[String(alt||'').toLowerCase()] = String(canon||''); }
    }
    // 2) Then apply user settings
    const pairs = (settings && settings.confusionPairs) || {};
    for (const [canon, alts] of Object.entries(pairs)){
      for (const alt of (alts||[])) { CANON[String(alt||'').toLowerCase()] = String(canon||''); }
    }
  } catch {}
}
function canonicalizeToken(token){ try { const t=String(token||'').toLowerCase(); return CANON[t] || token; } catch { return token; } }
function normalizeTail(tail){ try { return String(tail||'').split(/\s+/).filter(Boolean).map(canonicalizeToken).join(' '); } catch { return String(tail||''); } }
function saveSettings(settings){ try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings||{})); loadConfusions(settings||{}); } catch {} }
// Boot-load settings (run migration first)
try {
  const DEFAULTS = {
    nav: { anchorVH: 0.45, minDelta: 6, quietMs: 350, comfortBand: [0.25, 0.75] },
    ux:  { snapActiveOnly: true, anchorSnap: '45vh', highlightActive: false },
    confusionPairs: {
      single: ['sing'],
      portion: ['port', 'portion'],
      sale: ['sal', 'salem'],
      cell: ['cell', 'sale', 'salem'],
      enforcement: ['enforcement','forcemen','forcement','salemforcement'],
      ev: ['ev','uv','evil'],
      line: ['line','l','lion']
    }
  };
  migrateHudSettings(DEFAULTS, { storageKey: SETTINGS_KEY, version: 3, versionStrategy: 'meta' });
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  loadConfusions(saved||{});
} catch {}

// Lightweight hydrator to apply UX settings immediately on migrate or storage updates
function __readHudSettings(){ try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; } }
function __isHudVerbose(){
  try {
    const s = __readHudSettings();
    return !!(s?.debug?.verbose);
  } catch { return false; }
}
function __applyUxFromSettings(s){
  try {
    const ux = s?.ux || {};
    const scriptRoot = document.querySelector('.viewer .script');
    const viewerRoot = document.querySelector('.viewer');
    if (scriptRoot){
      if (ux.snapActiveOnly) scriptRoot.classList.add('snap-active-only'); else scriptRoot.classList.remove('snap-active-only');
      try { if (typeof window.setSnapMode === 'function') window.setSnapMode(ux.snapActiveOnly ? 'active' : 'all'); } catch {}
      if (ux.anchorSnap) try { scriptRoot.style.setProperty('--anchor-snap', ux.anchorSnap); } catch {}
    }
    if (viewerRoot){
      try { viewerRoot.classList.toggle('highlight-on', !!ux.highlightActive); } catch {}
    }
  } catch {}
}

// Live viewer style hydrator (CSS variables) for UX-visual settings
const __STYLE_MAP = {
  'ux.activeBg'       : ['--viewer-active-bg',        (v)=> String(v) ],
  'ux.inactiveOpacity': ['--viewer-inactive-opacity', (v)=> { const spec=__getRange('ux.inactiveOpacity'); return String(__clamp(Number(v), spec)); } ],
  'ux.fontSize'       : ['--viewer-font-size',        (v)=> { const spec=__getRange('ux.fontSize'); return `${__clamp(Number(v), spec)}px`; } ],
  'ux.lineHeight'     : ['--viewer-line-height',      (v)=> { const spec=__getRange('ux.lineHeight'); return String(__clamp(Number(v), spec)); } ],
  'ux.scrollMarginTop': ['--viewer-scroll-margin-top',(v)=> { const spec=__getRange('ux.scrollMarginTop'); return `${__clamp(Number(v), spec)}px`; } ],
  'ux.anchorPadding'  : ['--viewer-anchor-padding',   (v)=> { const spec=__getRange('ux.anchorPadding'); return `${__clamp(Number(v), spec)}px`; } ],
};
function __applyStyleFromSettings(hudSettings, rootEl){
  try {
    const root = rootEl || document.querySelector('.viewer');
    if (!root) return;
    // Optional class to signify whether highlighting is active
    try { root.classList.toggle('highlight-on', !!__getDeep(hudSettings, 'ux.highlightActive')); } catch {}
    for (const [path, [cssVar, toCss]] of Object.entries(__STYLE_MAP)){
      const val = __getDeep(hudSettings, path);
      if (val != null) try {
        if (path === 'ux.activeBg'){
          // Respect highlightActive toggle: if off, clear any active background to revert to original look
          const on = !!__getDeep(hudSettings, 'ux.highlightActive');
          if (on) root.style.setProperty(cssVar, toCss(val));
          else root.style.setProperty(cssVar, 'transparent');
        } else {
          root.style.setProperty(cssVar, toCss(val));
        }
      } catch {}
    }
    // Snap-only toggle
    try { root.classList.toggle('snap-only', !!__getDeep(hudSettings, 'ux.snapActiveOnly')); } catch {}
  } catch {}
}
try { const __bootS = __readHudSettings(); __applyUxFromSettings(__bootS); __applyStyleFromSettings(__bootS); } catch {}
window.addEventListener('hudSettings:migrated', (ev)=>{ try { const s=__readHudSettings(); __applyUxFromSettings(s); __applyStyleFromSettings(s); __hydrateSettingsControls(s); } catch {} });
window.addEventListener('storage', (e)=>{ try {
  if (e && e.key === SETTINGS_KEY){
    const s = __readHudSettings();
    // Respect optional dev.hydrateOnStorage flag (default true)
    const hydrate = (s?.dev?.hydrateOnStorage !== false);
    if (hydrate){ __applyUxFromSettings(s); __hydrateSettingsControls(s); }
  }
} catch {} });

// ---- Settings controls hydrator/binder ----
// Ranges and defaults for clamping and UI attributes
const RANGE = {
  ux: {
    inactiveOpacity: {min: 0,   max: 1,   step: 0.05, def: 0.8},
    scrollMarginTop: {min: 0,   max: 300, step: 4,    def: 140},
    anchorPadding:   {min: 0,   max: 200, step: 2,    def: 0},
    fontSize:        {min: 12,  max: 28,  step: 1,    def: 18},
    lineHeight:      {min: 1.2, max: 2.0, step: 0.05, def: 1.5}
  },
  viewer: {
    scrollStep:      {min: 8,   max: 120, step: 4,    def: 24}
  },
  autoscroll: {
    baseSpeed:       {min: 0,   max: 2000,step: 50,   def: 600},
    accel:           {min: 0,   max: 2000,step: 50,   def: 300}
  },
  match: {
    windowAhead:     {min: 60,  max: 600, step: 30,   def: 240},
    catchupJitterStd:{min: 0.2, max: 4,   step: 0.1,  def: 2.0}
  }
};
const __clamp = (v, spec) => Math.min(spec.max, Math.max(spec.min, v));
function __getRange(path){ try { return path.split('.').reduce((a,k)=> a && a[k], RANGE); } catch { return undefined; } }
function __applyRanged(path, raw){
  const spec = __getRange(path); if (!spec) return raw;
  const n = Number(raw);
  const val = Number.isFinite(n) ? n : spec.def;
  return __clamp(val, spec);
}
const __SETTINGS_BINDINGS = [
  // UX / Navigation
  { sel:'#snap-active-only',   path:'ux.snapActiveOnly',   type:'checkbox' },
  { sel:'#anchor-snap',        path:'ux.anchorSnap',       type:'text'     },
  { sel:'#scroll-margin-top',  path:'ux.scrollMarginTop',  type:'number'   },
  { sel:'#anchor-padding',     path:'ux.anchorPadding',    type:'number'   },
  { sel:'#highlight-active',   path:'ux.highlightActive',  type:'checkbox' },
  { sel:'#active-bg',          path:'ux.activeBg',         type:'color'    },
  { sel:'#inactive-opacity',   path:'ux.inactiveOpacity',  type:'number'   },
  { sel:'#font-size',          path:'ux.fontSize',         type:'number'   },
  { sel:'#line-height',        path:'ux.lineHeight',       type:'text'     },
  // Autoscroll
  { sel:'#autoscroll-enabled', path:'autoscroll.enabled',  type:'checkbox' },
  { sel:'#autoscroll-speed',   path:'autoscroll.baseSpeed',type:'number'   },
  { sel:'#autoscroll-accel',   path:'autoscroll.accel',    type:'number'   },
  { sel:'#autoscroll-pause-hover', path:'autoscroll.pauseOnHover', type:'checkbox' },
  // Viewer / Scrolling
  { sel:'#scroll-smooth',      path:'viewer.smoothScroll', type:'checkbox' },
  { sel:'#scroll-step',        path:'viewer.scrollStep',   type:'number'   },
  { sel:'#dom-snap-recovery',  path:'viewer.domSnapRecovery', type:'checkbox' },
  { sel:'#marker-visibility-ensure', path:'viewer.visibilityEnsure', type:'checkbox' },
  // Matcher / Catch-up
  { sel:'#match-window-ahead', path:'match.windowAhead',   type:'number'   },
  { sel:'#catchup-jitter-std', path:'match.catchupJitterStd', type:'number' },
  // Speech / Confusions
  { sel:'#confusables',        path:'speech.confusionPairs', type:'json'   },
  { sel:'#voice-hints',        path:'speech.hints',         type:'json'    },
  // Debug / Dev
  { sel:'#debug-overlay',      path:'debug.overlay',        type:'checkbox' },
  { sel:'#debug-logs',         path:'debug.verbose',        type:'checkbox' },
  { sel:'#storage-strategy',   path:'dev.versionStrategy',  type:'text'     },
  { sel:'#defaults-version',   path:'dev.defaultsVersion',  type:'number-ro' },
  { sel:'#hydrate-on-storage', path:'dev.hydrateOnStorage', type:'checkbox' },
];

function __getDeep(obj, path){ try { return String(path).split('.').reduce((a,k)=> (a&&a[k]!==undefined)? a[k] : undefined, obj); } catch { return undefined; } }
function __setDeep(obj, path, value){
  try {
    const keys = String(path).split('.');
    const out = (obj && typeof obj==='object') ? JSON.parse(JSON.stringify(obj)) : {};
    let cur = out;
    for (let i=0;i<keys.length-1;i++){
      const k = keys[i];
      if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
      cur = cur[k];
    }
    cur[keys[keys.length-1]] = value;
    return out;
  } catch { return obj; }
}
function __castFromControl(el, type){
  try {
    if (type==='checkbox') return !!el.checked;
    if (type==='number' || type==='range') return (el.value===''? undefined : Number(el.value));
    if (type==='color' || type==='text' || type==='select') return el.value;
    if (type==='json') { try { return JSON.parse(el.value||'{}'); } catch { return undefined; } }
    if (type==='number-ro') return undefined; // read-only; do not write back
    return el.value;
  } catch { return undefined; }
}
function __applyToControl(el, type, val){
  try {
    if (type==='checkbox') el.checked = !!val;
    else if (type==='number' || type==='range' || type==='color' || type==='text' || type==='select') el.value = (val ?? '');
    else if (type==='json') el.value = (val ? JSON.stringify(val, null, 2) : '');
    else if (type==='number-ro') el.value = (val ?? '');
  } catch {}
}
function __hydrateSettingsControls(s){
  try {
    for (const b of __SETTINGS_BINDINGS){
      const el = document.querySelector(b.sel);
      if (!el) continue;
      // Set range attributes and hints when applicable
      const spec = __getRange(b.path);
      if (spec && (b.type==='number' || b.type==='range')){
        try { el.min = String(spec.min); el.max = String(spec.max); el.step = String(spec.step); } catch {}
        try { el.title = `${spec.min}–${spec.max}`; } catch {}
      }
      let val = __getDeep(s, b.path);
      // special for defaults version: reflect from __meta if not set in dev
      if (b.path==='dev.defaultsVersion' && (val===undefined || val===null)) val = s?.__meta?.defaultsVersion ?? '';
      // Clamp on hydrate
      if (spec && val != null && (b.type==='number' || b.type==='range')) val = __clamp(Number(val), spec);
      __applyToControl(el, b.type, val);

      // Reveal defaults-version if strategy is meta
      if (b.sel==='#defaults-version'){
        try {
          const stratEl = document.querySelector('#storage-strategy');
          const strategy = stratEl ? String(stratEl.value||'') : String(__getDeep(s,'dev.versionStrategy')||'');
          const wrap = el.closest('.settings-row') || el.parentElement;
          if (wrap) wrap.style.display = (strategy==='meta') ? '' : 'none';
        } catch {}
      }
    }
  } catch {}
}
function __bindSettingsControls(){
  try {
    for (const b of __SETTINGS_BINDINGS){
      const el = document.querySelector(b.sel);
      if (!el || el.dataset.wired) continue;
      el.dataset.wired = '1';
      const ev = (el.tagName==='SELECT'||el.type==='checkbox') ? 'change' : 'input';
      el.addEventListener(ev, ()=>{
        try {
          const type = b.type;
          let val = __castFromControl(el, type);
          // Clamp ranges on write
          const spec = __getRange(b.path);
          if (spec && (type==='number' || type==='range')){
            const raw = (val===undefined ? spec.def : Number(val));
            val = __clamp(Number.isFinite(raw) ? raw : spec.def, spec);
          }
          if (type==='number-ro') return; // do not write back
          const cur = __readHudSettings();
          const next = (val===undefined ? cur : __setDeep(cur, b.path, val));
          try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
          // Apply UX live and re-hydrate in case of derived changes
          __applyUxFromSettings(next);
          __applyStyleFromSettings(next);
          __hydrateSettingsControls(next);
          // Broadcast change event for any listeners
          try { window.dispatchEvent(new CustomEvent('hudSettings:changed', { detail: { storageKey: SETTINGS_KEY, path: b.path } })); } catch {}
        } catch {}
      });
    }
  } catch {}
}
}

// Shared Normalize wiring helper
function wireNormalizeButton(btn){
  try {
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      try {
        if (typeof window.normalizeToStandard === 'function') window.normalizeToStandard();
        else if (typeof window.fallbackNormalize === 'function') window.fallbackNormalize();
      } catch(e){ try { alert('Normalize error: '+(e?.message||e)); } catch {} }
    });
  } catch {}
}
try { __tpBootPush('after-wireNormalizeButton'); } catch {}

// Tiny toast utility (optional) for subtle pings
    // Incremental build only once; subsequent opens just sync values
    let _settingsBuilt = false;

    // Dynamic wiring helper must exist before buildSettingsContent uses it
    // (Removed duplicate wireSettingsDynamic definition; primary is declared near top.)

    function buildSettingsContent(){
      const body = document.getElementById('settingsBody');
      if (!body) return;
      if (_settingsBuilt){
        if (!body.querySelector('.settings-card')) { _settingsBuilt = false; }
        else { syncSettingsValues(); return; }
      }
      const getVal = (id, fallback='') => {
        try { const el = document.getElementById(id); return (el && 'value' in el && el.value !== undefined) ? el.value : fallback; } catch { return fallback; }
      };
      const isChecked = (id) => { try { const el = document.getElementById(id); return !!el?.checked; } catch { return false; } };
      const speakersHidden = !!document.getElementById('speakersBody')?.classList.contains('hidden');

      const frag = document.createDocumentFragment();
      const card = (id, title, tab, innerHtml) => {
        const d = document.createElement('div');
        d.className = 'settings-card';
        d.dataset.tab = tab;
        d.id = id;
        d.innerHTML = `<h4>${title}</h4><div class="settings-card-body">${innerHtml}</div>`;
        return d;
      };
      frag.appendChild(card('cardMic','Microphone','media',`
        <div class="settings-inline-row">
          <button id="settingsReqMic" class="btn-chip">Request mic</button>
          <button id="settingsRelMic" class="btn-chip">Release mic</button>
          <select id="settingsMicSel" class="select-md"></select>
        </div>
        <div class="settings-small">Select input and grant permission for speech sync & dB meter.</div>`));
      frag.appendChild(card('cardCam','Camera','media',`
        <div class="settings-inline-row">
          <button id="settingsStartCam" class="btn-chip">Start</button>
          <button id="settingsStopCam" class="btn-chip">Stop</button>
          <select id="settingsCamSel" class="select-md"></select>
        </div>
        <div class="settings-inline-row">
          <label>Size <input id="settingsCamSize" type="number" min="15" max="60" value="${getVal('camSize',28)}" style="width:70px"></label>
          <label>Opacity <input id="settingsCamOpacity" type="number" min="20" max="100" value="${getVal('camOpacity',100)}" style="width:80px"></label>
          <label><input id="settingsCamMirror" type="checkbox" ${isChecked('camMirror')? 'checked':''}/> Mirror</label>
        </div>
        <div class="settings-small">Camera overlay floats over the script.</div>`));
      frag.appendChild(card('cardSpeakers','Speakers','general',`
        <div class="settings-inline-row">
          <button id="settingsShowSpeakers" class="btn-chip">${speakersHidden?'Show':'Hide'} List</button>
          <button id="settingsNormalize" class="btn-chip">Normalize Script</button>
        </div>
        <div class="settings-small">Manage speaker tags & quick normalization.</div>`));
      frag.appendChild(card('cardRecording','Recording','recording',`
        <div class="settings-inline-row">
          <label><input type="checkbox" id="settingsEnableObs" ${isChecked('enableObs')?'checked':''}/> Enable OBS</label>
          <input id="settingsObsUrl" class="obs-url" type="text" value="${getVal('obsUrl','ws://127.0.0.1:4455')}" placeholder="ws://host:port" />
          <input id="settingsObsPass" class="obs-pass" type="password" value="${getVal('obsPassword','')}" placeholder="password" />
          <button id="settingsObsTest" class="btn-chip">Test</button>
        </div>
        <div class="settings-small">Controls global recorder settings (mirrors panel options).</div>`));
      try {
        body.appendChild(frag);
        wireSettingsDynamic();
        syncSettingsValues();
        setupSettingsTabs();
        if (body.querySelector('.settings-card')) _settingsBuilt = true;
      } catch (e) {
        console.warn('Settings build failed, will retry', e);
        _settingsBuilt = false;
      }
    }
  try { __tpBootPush('after-buildSettingsContent-def'); } catch {}

    function syncSettingsValues(){
      // Mic devices now source-of-truth is settingsMicSel itself; nothing to sync.
      const micSel = document.getElementById('settingsMicSel');
      if (micSel && !micSel.options.length) {
        // If not yet populated, attempt populateDevices (async, fire and forget)
        try { populateDevices(); } catch {}
      }
      const camSelS = document.getElementById('settingsCamSel');
      if (camSelS && camDeviceSel){
        if (camSelS){
          camSelS.addEventListener('change', async ()=>{
            try { if (typeof camDeviceSel !== 'undefined' && camDeviceSel) camDeviceSel.value = camSelS.value; } catch {}
            if (camVideo?.srcObject && camSelS.value) {
              try { await switchCamera(camSelS.value); _toast('Camera switched',{type:'ok'}); } catch(e){ warn('Camera switch failed', e); _toast('Camera switch failed'); }
            }
          });
        }
      }
      const showSpk = document.getElementById('settingsShowSpeakers');
      if (showSpk) showSpk.textContent = speakersBody?.classList.contains('hidden') ? 'Show List' : 'Hide List';
      // Mirror OBS fields from main panel to Settings overlay (query directly; avoid non-global vars)
      try {
        const obsEnable = document.getElementById('settingsEnableObs');
        const mainEnable = document.getElementById('enableObs');
        if (obsEnable && mainEnable) obsEnable.checked = !!mainEnable.checked;
      } catch {}
      try {
        const obsUrlS = document.getElementById('settingsObsUrl');
        const mainUrl = document.getElementById('obsUrl');
        if (obsUrlS && mainUrl && typeof mainUrl.value === 'string') obsUrlS.value = mainUrl.value;
      } catch {}
      try {
        const obsPassS = document.getElementById('settingsObsPass');
        const mainPass = document.getElementById('obsPassword');
        if (obsPassS && mainPass && typeof mainPass.value === 'string') obsPassS.value = mainPass.value;
      } catch {}
    }
  try { __tpBootPush('after-syncSettingsValues-def'); } catch {}

    function setupSettingsTabs(){
      const tabs = Array.from(document.querySelectorAll('#settingsTabs .settings-tab'));
      // Query cards from the DOM directly; do not rely on a non-global settingsBody variable
      const sb = document.getElementById('settingsBody');
      const cards = sb ? Array.from(sb.querySelectorAll('.settings-card')) : [];
      // Hide tabs with no cards lazily
      tabs.forEach(tab => {
        const tabName = tab.dataset.tab;
        const hasCard = cards.some(c => c.dataset.tab === tabName);
        if (!hasCard) tab.style.display = 'none';
      });

      // Animation helpers
      const ANIM_IN = 'anim-in';
      const ANIM_OUT = 'anim-out';
      function showCard(c){
        if (c._visible) return; // already visible
        c._visible = true;
        c.style.display = 'flex';
        c.classList.remove(ANIM_OUT);
        // force reflow for animation restart
        void c.offsetWidth;
        c.classList.add(ANIM_IN);
        c.addEventListener('animationend', (e)=>{ if(e.animationName==='cardFadeIn') c.classList.remove(ANIM_IN); }, { once:true });
      }
      function hideCard(c){
        if (!c._visible) return; // already hidden
        c._visible = false;
        c.classList.remove(ANIM_IN);
        c.classList.add(ANIM_OUT);
        c.addEventListener('animationend', (e)=>{
          if (e.animationName==='cardFadeOut') { c.classList.remove(ANIM_OUT); c.style.display='none'; }
        }, { once:true });
      }

      const apply = (name) => {
        const sel = name || 'general';
        try { localStorage.setItem('tp_settings_tab', sel); } catch {}
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === sel));
        cards.forEach(c => {
          const show = c.dataset.tab === sel;
            if (show) showCard(c); else hideCard(c);
        });
      };
      tabs.forEach(t => t.addEventListener('click', ()=> apply(t.dataset.tab)));
      let last = 'general';
      try { last = localStorage.getItem('tp_settings_tab') || 'general'; } catch {}
      // Initialize visibility (no animation on first render)
      cards.forEach(c => { c._visible = false; c.style.display='none'; });
      apply(last);
    }
  try { __tpBootPush('after-setupSettingsTabs-def'); } catch {}
    // (Removed stray recorder settings snippet accidentally injected here)
    // Kick self-checks if available (guard so we only run once)
    try { if (typeof runSelfChecks === 'function' && !window.__selfChecksRan) { window.__selfChecksRan = true; setTimeout(()=>{ try{ runSelfChecks(); }catch{} }, 120); } } catch {}

    // NOTE: wireSettingsDynamic previously lived inside init(), making it inaccessible
    // to buildSettingsContent() (which resides at top scope) and causing a ReferenceError
    // when settings were first opened. We hoist it to top-level scope so the call inside
    // buildSettingsContent() succeeds. (See removal of inner duplicate later in init()).
    function wireSettingsDynamic(){
      // Mic
  const reqMicBtn = document.getElementById('settingsReqMic');
  const relMicBtn2 = document.getElementById('settingsRelMic');
      const micSel    = document.getElementById('settingsMicSel');
      if (micSel){
        micSel.addEventListener('change', ()=>{
          try { localStorage.setItem(DEVICE_KEY, micSel.value); } catch {};
        });
      }
  reqMicBtn?.addEventListener('click', async ()=> { await micBtn?.click(); _toast('Mic requested',{type:'ok'}); });
  relMicBtn2?.addEventListener('click', ()=> { try { releaseMic(); } finally { _toast('Mic released',{type:'ok'}); } });
      // Camera
      const startCamS = document.getElementById('settingsStartCam');
      const stopCamS  = document.getElementById('settingsStopCam');
      const camSelS   = document.getElementById('settingsCamSel');
      const camSizeS  = document.getElementById('settingsCamSize');
      const camOpacityS = document.getElementById('settingsCamOpacity');
      const camMirrorS  = document.getElementById('settingsCamMirror');
      if (camSelS && camDeviceSel){
        camSelS.addEventListener('change', async ()=>{
          camDeviceSel.value = camSelS.value;
          if (camVideo?.srcObject && camSelS.value) {
            try { await switchCamera(camSelS.value); _toast('Camera switched',{type:'ok'}); } catch(e){ warn('Camera switch failed', e); _toast('Camera switch failed'); }
          }
        });
      }
      startCamS?.addEventListener('click', ()=> { startCamBtn?.click(); _toast('Camera starting…'); });
      stopCamS?.addEventListener('click', ()=> { stopCamBtn?.click(); _toast('Camera stopped',{type:'ok'}); });
      camSizeS?.addEventListener('change', ()=>{ if (camSize) { camSize.value = camSizeS.value; camSize.dispatchEvent(new Event('input',{bubbles:true})); }});
      camOpacityS?.addEventListener('change', ()=>{ if (camOpacity){ camOpacity.value = camOpacityS.value; camOpacity.dispatchEvent(new Event('input',{bubbles:true})); }});
      camMirrorS?.addEventListener('change', ()=>{ if (camMirror){ camMirror.checked = camMirrorS.checked; camMirror.dispatchEvent(new Event('change',{bubbles:true})); }});
      // Speakers
      const showSpk = document.getElementById('settingsShowSpeakers');
      showSpk?.addEventListener('click', ()=>{ toggleSpeakersBtn?.click(); buildSettingsContent(); });
      document.getElementById('settingsNormalize')?.addEventListener('click', ()=> normalizeTopBtn?.click());
      // Recording / OBS
      const obsEnable = document.getElementById('settingsEnableObs');
      const obsUrlS = document.getElementById('settingsObsUrl');
      const obsPassS = document.getElementById('settingsObsPass');
      const obsTestS = document.getElementById('settingsObsTest');
      obsEnable?.addEventListener('change', ()=>{ if (enableObsChk){ enableObsChk.checked = obsEnable.checked; enableObsChk.dispatchEvent(new Event('change',{bubbles:true})); } });
      obsUrlS?.addEventListener('change', ()=>{ if (obsUrlInput){ obsUrlInput.value = obsUrlS.value; obsUrlInput.dispatchEvent(new Event('change',{bubbles:true})); }});
      obsPassS?.addEventListener('change', ()=>{ if (obsPassInput){ obsPassInput.value = obsPassS.value; obsPassInput.dispatchEvent(new Event('change',{bubbles:true})); }});
      obsTestS?.addEventListener('click', async ()=> { obsTestBtn?.click(); setTimeout(()=>{ _toast(obsStatus?.textContent||'OBS test', { type: (obsStatus?.textContent||'').includes('ok')?'ok':'error' }); }, 600); });
    }

  // TP: normalize-fallback
  // Shared, safe fallback normalizer used when normalizeToStandard() is not provided
  function fallbackNormalize(){
    try {
      const ta = document.getElementById('editor');
      if (!ta) return;
      let txt = String(ta.value || '');
      // Normalize newlines & spaces; convert smart quotes; trim trailing spaces per-line
      txt = txt.replace(/\r\n?/g, '\n')
               .replace(/ +\n/g, '\n')
               .replace(/[’]/g, "'");
      // Ensure closing tags aren't accidentally uppercased/spaced
      txt = txt.replace(/\[\/\s*s1\s*\]/gi, '[/s1]')
               .replace(/\[\/\s*s2\s*\]/gi, '[/s2]')
               .replace(/\[\/\s*note\s*\]/gi, '[/note]');
      ta.value = txt;
      // Re-render via input event to keep everything in sync
      const ev = new Event('input'); ta.dispatchEvent(ev);
      alert('Basic normalization applied.');
    } catch (e) {
      alert('Normalize fallback failed: ' + e.message);
    }
  }
  try { __tpBootPush('after-fallbackNormalize-def'); } catch {}

  // TP: normalize-strict
  // Strict normalizer (single source of truth)
  window.normalizeToStandard = function normalizeToStandard() {
    const ta = document.getElementById('editor');
    if (!ta) return;
    let txt = String(ta.value || '');

    // Canonicalize whitespace/quotes/case
    txt = txt.replace(/\r\n?/g, '\n')
             .replace(/[ \t]+\n/g, '\n')
             .replace(/[’]/g, "'")
             .replace(/\[\s*(s1|s2|note)\s*\]/gi, (_,x)=>`[${x.toLowerCase()}]`)
             .replace(/\[\s*\/\s*(s1|s2|note)\s*\]/gi, (_,x)=>`[/${x.toLowerCase()}]`);

    // Move inline notes out of speaker paragraphs
    txt = txt.replace(
      /\[(s1|s2)\]([\s\S]*?)\[note\]([\s\S]*?)\[\/note\]([\s\S]*?)\[\/\1\]/gi,
      (_,r,pre,note,post)=>`[note]${note.trim()}[/note]\n[${r}]${(pre+' '+post).trim()}[/${r}]`
    );

    // Ensure speaker/close tags are on their own lines
    txt = txt.replace(/\[(s1|s2)\]\s*(?=\S)/gi, (_,r)=>`[${r}]\n`)
             .replace(/([^\n])\s*\[\/s(1|2)\](?=\s*$)/gmi, (_,ch,sp)=>`${ch}\n[/s${sp}]`);

    // Notes must be standalone blocks
    txt = txt.replace(/\n?(\[note\][\s\S]*?\[\/note\])\n?/gi, '\n$1\n');

    // Collapse excess blank lines
    txt = txt.replace(/\n{3,}/g, '\n\n').trim() + '\n';

    // Wrap untagged blocks with current (default s1); ensure missing closers
    const blocks = txt.split(/\n{2,}/);
    let current = 's1';
    const out = [];
    for (let b of blocks) {
      const first = b.match(/^\s*\[(s1|s2|note)\]/i)?.[1]?.toLowerCase();
      if (first === 'note') { out.push(b); continue; }
      if (first === 's1' || first === 's2') {
        current = first;
        if (!/\[\/s[12]\]/i.test(b)) b = b + `\n[/${current}]`;
        out.push(b);
      } else {
        // untagged → wrap under current speaker
        out.push(`[${current}]\n${b}\n[/${current}]`);
      }
    }
    ta.value = out.join('\n\n') + '\n';
    ta.dispatchEvent(new Event('input', { bubbles:true }));
    if (typeof saveDraft === 'function') saveDraft();
    if (typeof setStatus === 'function') setStatus('Normalized to standard.');
  };
  try { __tpBootPush('after-normalizeToStandard-def'); } catch {}

  // Validator (quick “am I standard?” check)
  function showCopyDialog(text, title='Validation Results'){
    if (window.__help?.showCopyDialog) return window.__help.showCopyDialog(text, title);
    // fallback: simple alert
    alert(String(title)+"\n\n"+String(text||''));
  }

  // Global helper: show validation output in the Help overlay's panel with copy support
  window.showValidation = function showValidation(text){
    if (window.__help?.showValidation) return window.__help.showValidation(text);
    return showCopyDialog(text, 'Validation');
  };

  window.validateStandardTags = function validateStandardTags(silent=false) {
    if (window.__help?.validateStandardTags) return window.__help.validateStandardTags(silent);
    const ta = document.getElementById('editor');
    const src = String(ta?.value || '');
    const lines = src.split(/\r?\n/);
    // Configurable tag set
    if (!window.validatorConfig) window.validatorConfig = { allowedTags: new Set(['s1','s2','note']) };
    const allowed = window.validatorConfig.allowedTags;
    const speakerTags = new Set(['s1','s2']);
    const stack = []; // {tag,line}
    let s1Blocks=0, s2Blocks=0, noteBlocks=0; let unknownCount=0;
    const issues=[]; const issueObjs=[];
    function addIssue(line,msg,type='issue',detail){ issues.push(`line ${line}: ${msg}`); issueObjs.push({ line, message: msg, type, detail }); }
    const tagRe = /\[(\/)?([a-z0-9]+)(?:=[^\]]+)?\]/gi;
    for (let i=0;i<lines.length;i++){
      const rawLine=lines[i]; const lineNum=i+1; let m; tagRe.lastIndex=0;
      while((m=tagRe.exec(rawLine))){
        const closing=!!m[1]; const nameRaw=m[2]; const name=nameRaw.toLowerCase();
        if(!allowed.has(name)){ unknownCount++; addIssue(lineNum,`unsupported tag [${closing?'\/':''}${nameRaw}]`,'unsupported',{tag:name}); continue; }
        if(!closing){
          if(name==='note'){
            if(stack.length){ addIssue(lineNum,`[note] must not appear inside [${stack[stack.length-1].tag}] (opened line ${stack[stack.length-1].line})`,'nested-note',{parent:stack[stack.length-1].tag}); }
            stack.push({tag:name,line:lineNum});
          } else if(speakerTags.has(name)) {
            if(stack.length && speakerTags.has(stack[stack.length-1].tag)) addIssue(lineNum,`[${name}] opened before closing previous [${stack[stack.length-1].tag}] (opened line ${stack[stack.length-1].line})`,'nested-speaker',{prev:stack[stack.length-1].tag,prevLine:stack[stack.length-1].line});
            stack.push({tag:name,line:lineNum});
          } else { stack.push({tag:name,line:lineNum}); }
        } else {
          if(!stack.length){ addIssue(lineNum,`stray closing tag [\/${name}]`,'stray-close',{tag:name}); continue; }
          const top=stack[stack.length-1];
          if(top.tag===name){ stack.pop(); if(name==='s1') s1Blocks++; else if(name==='s2') s2Blocks++; else if(name==='note') noteBlocks++; }
          else {
            addIssue(lineNum,`mismatched closing [\/${name}] – expected [\/${top.tag}] for opening on line ${top.line}`,'mismatch',{expected:top.tag,openLine:top.line,found:name});
            let poppedAny=false; while(stack.length && stack[stack.length-1].tag!==name){ stack.pop(); poppedAny=true; }
            if(stack.length && stack[stack.length-1].tag===name){ const opener=stack.pop(); if(name==='s1') s1Blocks++; else if(name==='s2') s2Blocks++; else if(name==='note') noteBlocks++; if(poppedAny) addIssue(lineNum,`auto-recovered by closing [\/${name}] (opened line ${opener.line}) after mismatches`,'auto-recover',{tag:name,openLine:opener.line}); }
            else addIssue(lineNum,`no matching open tag for [\/${name}]`,'no-match',{tag:name});
          }
        }
      }
    }
    for(const open of stack) addIssue(open.line,`unclosed [${open.tag}] opened here`,'unclosed',{tag:open.tag});
    const summaryParts=[`s1 blocks: ${s1Blocks}`,`s2 blocks: ${s2Blocks}`,`notes: ${noteBlocks}`]; if(unknownCount) summaryParts.push(`unsupported tags: ${unknownCount}`);
    // Quick fixes
    const fixes=[]; for(const iss of issueObjs){
      if(iss.type==='unclosed' && /(s1|s2)/i.test(iss.message)){ const tag=iss.message.match(/\[(s1|s2)\]/i)?.[1]; if(tag) fixes.push({type:'append-close',tag,label:`Append closing [\/${tag}] at end`,apply:(text)=> text + (text.endsWith('\n')?'':'\n') + `[\/${tag}]\n`}); }
      else if(iss.type==='stray-close'){ fixes.push({type:'remove-line',line:iss.line,label:`Remove stray closing tag on line ${iss.line}`,apply:(text)=> text.split(/\r?\n/).filter((_,i)=>i!==iss.line-1).join('\n')}); }
      else if(iss.type==='mismatch'){ const found=iss.message.match(/mismatched closing \[\/(\w+)\]/i)?.[1]; const expected=iss.message.match(/expected \[\/(\w+)\]/i)?.[1]; if(found&&expected&&found!==expected) fixes.push({type:'replace-tag',line:iss.line,from:found,to:expected,label:`Replace [\/${found}] with [\/${expected}] on line ${iss.line}`,apply:(text)=>{ const arr=text.split(/\r?\n/); const ln=arr[iss.line-1]; if(ln) arr[iss.line-1]=ln.replace(new RegExp(`\[\/${found}\]`,'i'),`[\/${expected}]`); return arr.join('\n'); }}); }
    }
  let msg = !issues.length ? `No issues found. (${summaryParts.join(', ')})` : `Validation issues (${issues.length}):\n- ${issues.join('\n- ')}\n\nSummary: ${summaryParts.join(', ')}`;
    window.__lastValidation={ issues: issueObjs, summary: summaryParts, fixes };
    // Inline highlighting
    try {
      const existing = document.getElementById('validatorLineOverlay');
      if (existing) existing.remove();
      if (issueObjs.length && ta){
        const overlay = document.createElement('div');
        overlay.id='validatorLineOverlay';
        overlay.style.cssText='position:absolute;inset:0;pointer-events:none;font:inherit;';
        // Positioning container wrapper if not already relative
        const wrap = ta.parentElement;
        if (wrap && getComputedStyle(wrap).position==='static') wrap.style.position='relative';
        // Map: line -> severity color
        const colors = { 'unclosed':'#d33', 'mismatch':'#d33', 'nested-speaker':'#d33', 'nested-note':'#d33', 'stray-close':'#d55', 'unsupported':'#b46', 'auto-recover':'#c80', 'no-match':'#d33', 'issue':'#c30' };
        const badLines = new Set(issueObjs.map(i=>i.line));
        // Build spans aligned via line height approximation
        const style = getComputedStyle(ta); const lh = parseFloat(style.lineHeight)||16; const padTop = ta.scrollTop; // will adjust on scroll
        function rebuild(){
          try {
            overlay.innerHTML='';
            const scrollTop = ta.scrollTop; const firstVisible = Math.floor(scrollTop / lh)-1; const linesVisible = Math.ceil(ta.clientHeight / lh)+2;
            for (let i=0;i<linesVisible;i++){
              const lineIdx = firstVisible + i; if (lineIdx <0) continue; const lineNumber=lineIdx+1; if(!badLines.has(lineNumber)) continue;
              const issue = issueObjs.find(o=>o.line===lineNumber);
              const bar = document.createElement('div');
              bar.title = issue.message;
              bar.style.cssText = `position:absolute;left:0;right:0;top:${lineIdx*lh}px;height:${lh}px;background:linear-gradient(90deg,${colors[issue.type]||'#c30'}22,transparent 80%);pointer-events:none;`;
              overlay.appendChild(bar);
            }
          } catch {}
        }
        rebuild();
        ta.addEventListener('scroll', rebuild, { passive:true });
        wrap.appendChild(overlay);
      }
    } catch {}

    // Return the textual report for callers (e.g., Help overlay validate button)
    return msg;
  // Expose a live getter/setter for Help → Advanced to toggle at runtime
  } // <-- end validateStandardTags

  // Expose a live getter/setter for Help → Advanced to toggle at runtime (top-level)
  try {
    Object.defineProperty(window, 'recAutoRestart', {
      configurable: true,
      get(){ return recAutoRestart; },
      set(v){ recAutoRestart = !!v; try{ localStorage.setItem('tp_rec_autorestart_v1', recAutoRestart ? '1' : '0'); } catch {} }
    });
  } catch {}
  try { __tpBootPush('after-validateStandardTags-def'); } catch {}
  let recBackoffMs   = 300;       // grows on repeated failures
  const MATCH_WINDOW = 6;         // how far ahead we’ll look for the next word
  // Safe placeholders for optional modules to prevent ReferenceError when dynamic import fails
  let __scrollHelpers = null; // set after scroll-helpers.js loads
  let __anchorObs = null;     // set after io-anchor.js loads
  let __scrollCtl = null;     // set after scroll-control.js loads
  // Mic selector single source of truth (settings overlay)
  const getMicSel = () => document.getElementById('settingsMicSel');
  let autoTimer = null, chrono = null, chronoStart = 0;
  let scriptWords = [], paraIndex = [], currentIndex = 0;
  // Paragraph token stats for rarity gating (computed on render)
  let __paraTokens = [];           // Array<Array<string>> per paragraph
  let __dfMap = new Map();         // token -> in how many paragraphs it appears
  let __dfN = 0;                   // number of paragraphs
  function __idf(t){ try { return Math.log(1 + (__dfN || 1) / ((__dfMap.get(t) || 0) || 1)); } catch { return 0; } }
  // Duplicate-line disambiguation
  let __lineFreq = new Map();      // original paragraph line frequencies (by key)
  // Virtual lines (merge short runts so matcher scores over real phrases)
  let __vParaIndex = [];           // merged paragraph index
  let __vLineFreq = new Map();     // virtual line frequencies (by merged key)
  let __vSigCount = new Map();     // prefix signature counts (first 4 tokens) for virtual lines
  function normLineKey(text){
    // Build line keys from fully normalized tokens to ensure duplicate detection
    // matches what the matcher “hears” (contractions, unicode punctuation, numerals → words, etc.)
    try {
      const toks = normTokens(text || '');
      return toks.join(' ');
    } catch { return ''; }
  }
  // Lost-mode state
  let __tpLost = false; let __tpLowSimCount = 0;
  const __STOP = new Set(['the','and','a','an','to','of','in','on','for','with','as','at','by','is','are','was','were','be','been','being','or','but','if','then','that','this','these','those','you','your','yours','we','our','ours','they','their','them','it','its','he','she','his','her','hers','do','did','does','done','have','has','had']);
  // Junk-anchor set: tokens that should not drive medium/long jumps on their own
  const __JUNK = new Set(['so','and','but','the','a','an','to','of','in','on','for','with','or','is','are']);
  function extractHighIDFPhrases(tokens, n=3, topK=6){
    const out = [];
    if (!Array.isArray(tokens) || tokens.length < n) return out;
    for (let i = 0; i <= tokens.length - n; i++){
      const gram = tokens.slice(i, i+n);
      if (gram.some(t => __STOP.has(t))) continue; // never on a stop-word
      const rarity = gram.reduce((s,t)=> s + __idf(t), 0);
      out.push({ gram, rarity });
    }
    out.sort((a,b)=> b.rarity - a.rarity);
    return out.slice(0, topK);
  }
  function searchBand(anchors, startIdx, endIdx, spoken){
    const hits = [];
    if (!anchors?.length) return hits;
    const n = anchors[0]?.gram?.length || 3;
    const s = Math.max(0, startIdx|0), e = Math.min(scriptWords.length, endIdx|0);
    for (let i = s; i <= e - n; i++){
      const win = scriptWords.slice(i, i+n);
      for (const a of anchors){
        let match = true;
        for (let k=0;k<n;k++){ if (win[k] !== a.gram[k]) { match = false; break; } }
        if (match){
          // Compute an overall score using the full spoken window similarity
          const windowTokens = normTokens(scriptWords.slice(i, i + spoken.length).join(' '));
          const sim = _sim(spoken, windowTokens);
          const score = sim; // rarity was used to gate anchors; keep sim as score
          hits.push({ idx: i, score });
          break;
        }
      }
    }
    return hits;
  }
  // Hard-bound current line tracking
  let currentEl = null;               // currently active <p> element
  let lineEls = [];                   // array of <p> elements in script order
  // Recording / speech state flags
  let recActive = false;              // true when speech recognition session is active
  // Central gate so toggling Speech Sync truly quiets aligner and scroller
  let speechOn = false;
  // Display window handle
  let displayWin = null;              // popup window reference for mirrored display
  let shortcutsBtn, shortcutsOverlay, shortcutsClose;


  const ROLE_KEYS = ['s1','s2','g1','g2'];
  const ROLES_KEY = 'tp_roles_v2';
  const ROLE_DEFAULTS = {
    s1: { name: 'Speaker 1', color: '#60a5fa' },
    s2: { name: 'Speaker 2', color: '#facc15' },
    g1: { name: 'Guest 1',   color: '#34d399' },
    g2: { name: 'Guest 2',   color: '#f472b6' }
  };
  let ROLES = loadRoles();
  // Broadcast channel to keep display colors in sync with Settings
  let bc = null; try { bc = new BroadcastChannel('prompter'); } catch {}
  function applyRoleCssVars(){
    try {
      const r = document.documentElement;
      if (ROLES?.s1?.color) r.style.setProperty('--s1-color', ROLES.s1.color);
      if (ROLES?.s2?.color) r.style.setProperty('--s2-color', ROLES.s2.color);
    } catch {}
  }
  function broadcastSpeakerColors(){
    try { bc && bc.postMessage({ type:'SPEAKER_COLORS', s1: ROLES?.s1?.color, s2: ROLES?.s2?.color }); } catch {}
  }
  function broadcastSpeakerNames(){
    try { bc && bc.postMessage({ type:'SPEAKER_NAMES', s1Name: ROLES?.s1?.name, s2Name: ROLES?.s2?.name }); } catch {}
  }

  // DOM (late‑bound during init)
  let editor, scriptEl, viewer, legendEl,
    permChip, displayChip, recChip, camRtcChip,
    debugPosChip,
      openDisplayBtn, closeDisplayBtn, presentBtn,
  micBtn, recBtn, refreshDevicesBtn,
      fontSizeInput, lineHeightInput,
      autoToggle, autoSpeed,
      timerEl, resetBtn, loadSample, clearText,
      saveLocalBtn, loadLocalBtn, downloadFileBtn, uploadFileBtn, uploadFileInput,
      wrapBold, wrapItalic, wrapUnderline, wrapNote, wrapColor, wrapBg, autoTagBtn,
      nameS1, colorS1, wrapS1, nameS2, colorS2, wrapS2, nameG1, colorG1, wrapG1, nameG2, colorG2, wrapG2,
      camWrap, camVideo, startCamBtn, stopCamBtn, camDeviceSel, camSize, camOpacity, camMirror, camPiP,
      prerollInput, countOverlay, countNum,
  dbMeterTop,
      toggleSpeakersBtn, speakersBody;

  // TP: meter-audio
  // ───────────────────────────────────────────────────────────────
  // dB meter utilities (single source of truth: top bar only)
  // ───────────────────────────────────────────────────────────────
  function buildDbBars(target){
    if (!target) return [];
    target.classList.add('db-bars');
    // If already has bars, reuse
    let bars = Array.from(target.querySelectorAll('.bar'));
    if (bars.length >= 16) return bars;
    target.innerHTML = '';
    const total = 20;
    for (let i=0;i<total;i++){
      const b=document.createElement('div');
      b.className='bar';
      const ratio = i/(total-1); // 0 (left) -> 1 (right)
      // Interpolate hue 120 (green) -> 0 (red)
      const hue = 120 - (120 * ratio);
      const sat = 70; // percent
      const light = 30 + (ratio*25); // brighten a bit toward red end
      b.style.setProperty('--bar-color', `hsl(${hue}deg ${sat}% ${light}%)`);
      target.appendChild(b);
    }
    // Peak marker
    const peak = document.createElement('div'); peak.className='peak-marker'; peak.style.transform='translateX(0)'; target.appendChild(peak);
    // Scale ticks (every 5 bars) – positioned absolutely
    const ticks = document.createElement('div');
    ticks.style.cssText='position:absolute;inset:0;pointer-events:none;font:8px/1 ui-monospace,monospace;color:#fff5;display:flex;';
    for (let i=0;i<20;i++){
      if (i % 5 === 0){
        const t = document.createElement('div');
        t.style.cssText='flex:1;position:relative;';
        const line = document.createElement('div'); line.style.cssText='position:absolute;top:0;bottom:0;left:0;width:1px;background:#ffffff22';
        const lbl = document.createElement('div'); lbl.textContent = (i===0?'-∞': `-${(20 - i)}dB`).replace('--','-'); lbl.style.cssText='position:absolute;bottom:100%;left:0;transform:translate(-2px,-2px);white-space:nowrap;';
        t.appendChild(line); t.appendChild(lbl); ticks.appendChild(t);
      } else {
        const spacer = document.createElement('div'); spacer.style.flex='1'; ticks.appendChild(spacer);
      }
    }
    target.appendChild(ticks);
    return Array.from(target.querySelectorAll('.bar'));
  }

  function clearBars(el){ if (!el) return; el.querySelectorAll('.bar.on').forEach(b=>b.classList.remove('on')); }

  function stopDbMeter(){
    if (dbAnim) cancelAnimationFrame(dbAnim); dbAnim = null;
    try{ if (audioStream) audioStream.getTracks().forEach(t=>t.stop()); }catch{}
    audioStream = null; analyser = null;
  try { clearBars(dbMeterTop); } catch {}
  }

  // Explicitly release the microphone and audio resources
  function releaseMic(){
    try {
      stopDbMeter();
      if (audioCtx && typeof audioCtx.close === 'function') {
        try { audioCtx.close(); } catch {}
      }
      audioCtx = null;
      // Update UI chips
      try { if (permChip) permChip.textContent = 'Mic: idle'; } catch {}
      _toast('Mic released',{type:'ok'});
    } catch(e){ warn('Release mic failed', e); }
  }

  async function startDbMeter(stream){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { warn('AudioContext unavailable'); return; }
  const ctx = new AC();
  audioCtx = ctx; // retain for suspend/resume when tab visibility changes
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const topBars  = buildDbBars(dbMeterTop);
    const peakEl = dbMeterTop?.querySelector('.peak-marker');
    peakHold.value = 0; peakHold.lastUpdate = performance.now();
    // Log scaling configuration
    const dBFloor = -60;  // anything quieter treated as silence
    const attack = 0.55;  // 0..1 (higher = faster rise)
    const release = 0.15; // 0..1 (higher = faster fall)
    let levelSmooth = 0;  // smoothed 0..1 level after log mapping
    const draw = () => {
      analyser.getByteFrequencyData(data);
      // Root-mean-square amplitude 0..1
      const rms = Math.sqrt(data.reduce((a,b)=>a + b*b, 0) / data.length) / 255;
      // Convert to approximate dBFS
      const dbfs = rms>0 ? (20 * Math.log10(rms)) : -Infinity;
      // Clamp & normalize to 0..1 based on floor
      const dB = dbfs === -Infinity ? dBFloor : Math.max(dBFloor, Math.min(0, dbfs));
      let level = (dB - dBFloor) / (0 - dBFloor); // linear 0..1 after log compress
      if (!isFinite(level) || level < 0) level = 0; else if (level > 1) level = 1;
      // Smooth (different attack/release)
      if (level > levelSmooth) levelSmooth = levelSmooth + (level - levelSmooth) * attack; else levelSmooth = levelSmooth + (level - levelSmooth) * release;
      const bars = Math.max(0, Math.min(topBars.length, Math.round(levelSmooth * topBars.length)));
      for (let i=0;i<topBars.length;i++) topBars[i].classList.toggle('on', i < bars);
      // Peak hold: keep highest bar for a short decay
      const now = performance.now();
      if (bars > peakHold.value) { peakHold.value = bars; peakHold.lastUpdate = now; }
      else if (now - peakHold.lastUpdate > 350) { // start decay after hold period
        peakHold.value = Math.max(0, peakHold.value - peakHold.decay * ( (now - peakHold.lastUpdate) / 16 ));
      }
      const peakIndex = Math.max(0, Math.min(topBars.length-1, Math.floor(peakHold.value-1)));
      if (peakEl){
        const bar = topBars[peakIndex];
        if (bar){
          const x = bar.offsetLeft;
          peakEl.style.transform = `translateX(${x}px)`;
          peakEl.style.opacity = peakHold.value>0?'.9':'0';
          // Color shift based on level percentage
          const pct = levelSmooth; // use smoothed 0..1 level for color classification
          let color = '#2eff7d'; // green
          if (pct > 0.85) color = '#ff3131';
          else if (pct > 0.65) color = '#ffb347';
          peakEl.style.backgroundColor = color;
          peakEl.style.boxShadow = `0 0 4px ${color}aa`;
        }
        // Tooltip stats (rounded)
        peakEl.title = `Approx RMS: ${(rms*100).toFixed(0)}%\nApprox dBFS: ${dbfs===-Infinity?'–∞':dbfs.toFixed(1)} dB`;
      }
      dbAnim = requestAnimationFrame(draw);
    };
    draw();
  }

  async function requestMic(){
    try {
      const chosenId = getMicSel()?.value || undefined;
      const constraints = { audio: { deviceId: chosenId ? { exact: chosenId } : undefined } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      audioStream = stream;
      try { permChip && (permChip.textContent = 'Mic: allowed'); } catch {}
      startDbMeter(stream);
      // Persist chosen device
      try { if (chosenId) localStorage.setItem(DEVICE_KEY, chosenId); } catch {}
    } catch(e){
      warn('Mic denied or failed', e);
      try { permChip && (permChip.textContent = 'Mic: denied'); } catch {}
    }
  }

  async function populateDevices(){
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devs = await navigator.mediaDevices.enumerateDevices();
      const aud = devs.filter(d => d.kind === 'audioinput');
      const cams = devs.filter(d => d.kind === 'videoinput');

      // Populate only the active settings mic selector; leave hidden legacy stub inert
      const micSelB = document.getElementById('settingsMicSel');
      if (micSelB){
        try {
          const cur = micSelB.value;
          micSelB.innerHTML = '';
          aud.forEach(d => {
            const o = document.createElement('option');
            o.value = d.deviceId; o.textContent = d.label || 'Microphone';
            micSelB.appendChild(o);
          });
          if (cur && Array.from(micSelB.options).some(o=>o.value===cur)) micSelB.value = cur;
        } catch {}
      }

      const camSelA = (typeof camDeviceSel !== 'undefined') ? camDeviceSel : null;
      const camSelB = document.getElementById('settingsCamSel');
      [camSelA, camSelB].filter(Boolean).forEach(sel => {
        try {
          const cur = sel.value;
          sel.innerHTML = '';
          cams.forEach(d => {
            const o = document.createElement('option');
            o.value = d.deviceId; o.textContent = d.label || 'Camera';
            sel.appendChild(o);
          });
          if (cur && Array.from(sel.options).some(o=>o.value===cur)) sel.value = cur;
        } catch {}
      });
    } catch (e) { /* ignore */ }
  }

  // TP: init-minimal
  // Minimal init to wire the meter pieces and help overlay (internal helper)
  async function __initMinimal(){
    // Help UI
    try { ensureHelpUI(); } catch {}

    // Query essentials
    permChip = document.getElementById('permChip');
    micBtn = document.getElementById('micBtn');
    // (Removed micDeviceSel rebinding; use getMicSel())
    refreshDevicesBtn = document.getElementById('refreshDevicesBtn');
    dbMeterTop = document.getElementById('dbMeterTop');
    const normalizeTopBtn = document.getElementById('normalizeTopBtn');

    // Build both meters
    buildDbBars(dbMeterTop);

    // TP: mic-wire
    micBtn?.addEventListener('click', requestMic);
    const relMicBtn = document.getElementById('relMicBtn');
    relMicBtn?.addEventListener('click', releaseMic);
    refreshDevicesBtn?.addEventListener('click', populateDevices);
    try {
      await populateDevices();
      // Pre-select last device if present
      try {
        const last = localStorage.getItem(DEVICE_KEY);
        if (last) {
          const sel = document.getElementById('settingsMicSel');
          if (sel && Array.from(sel.options).some(o=>o.value===last)) sel.value = last;
          // Do not auto-start mic on load; require explicit user action
        }
      } catch {}
      // Reflect idle state if mic not yet granted
      try { if (!audioStream && permChip) permChip.textContent = 'Mic: idle'; } catch {}
      updateMicUIState();
    } catch {}

    // TP: normalize-top-btn
    // Wire Top-bar Normalize button
    wireNormalizeButton(normalizeTopBtn);
  }

  /* ────────────────────────────────────────────────────────────── */
  // Speakers section show/hide with persistence (robust)
  (function setupSpeakersToggle(){
    const KEY = 'tp_speakers_hidden';
    const btn  = document.getElementById('toggleSpeakers');
    let body   = document.getElementById('speakersBody');

    // Fallback: if no wrapper, find the key rows and hide those
    const rows = body ? [] : [
      '#wrap-s1', '#wrap-s2', '#wrap-g1', '#wrap-g2', '#wrap-bold'
    ].map(sel => document.querySelector(sel)?.closest('.row')).filter(Boolean);

    const isHidden = () => body
      ? body.classList.contains('hidden')
      : (rows[0] ? rows[0].classList.contains('hidden') : false);

    const apply = (hidden) => {
      if (body) body.classList.toggle('hidden', !!hidden);
      else rows.forEach(r => r.classList.toggle('hidden', !!hidden));
      if (btn) {
        btn.textContent = hidden ? 'Show Speakers' : 'Hide';
        btn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
      }
    };

    const saved = localStorage.getItem(KEY) === '1';
    apply(saved);

    btn?.addEventListener('click', () => {
      const next = !isHidden();
      localStorage.setItem(KEY, next ? '1' : '0');
      apply(next);
    });
  })();

  // ---- Help / Tag Guide injection ----
function ensureHelpUI(){
  if (window.__help?.ensureHelpUI) return window.__help.ensureHelpUI();
  // --- minimal CSS (only if missing) ---
  if (!document.getElementById('helpStyles')) {
    const css = `
      .hidden{display:none!important}
      .overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);
        backdrop-filter:saturate(1.2) blur(2px);z-index:9999;
        display:flex;align-items:center;justify-content:center}
      .sheet{width:min(820px,92vw);max-height:85vh;overflow:auto;
        background:#0e141b;border:1px solid var(--edge);border-radius:16px;padding:20px}
      .sheet header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
      .hr{border:0;border-top:1px solid var(--edge);margin:12px 0}
      .shortcuts-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .btn-chip{background:#0e141b;border:1px solid var(--edge);padding:8px 10px;border-radius:10px;cursor:pointer}
    `;
    const st = document.createElement('style');
    st.id = 'helpStyles'; st.textContent = css; document.head.appendChild(st);
  }

  // --- ensure Help button exists in the top bar ---
  const topBarEl = document.querySelector('.topbar');
  let helpBtn = document.getElementById('shortcutsBtn');
  if (!helpBtn) {
    helpBtn = Object.assign(document.createElement('button'), {
      id: 'shortcutsBtn', className: 'chip', textContent: 'Help',
      ariaHasPopup: 'dialog', ariaExpanded: 'false'
    });
  topBarEl && topBarEl.appendChild(helpBtn);
  } else {
    helpBtn.textContent = 'Help';
  }

  // --- ensure overlay exists ---
  let overlay = document.getElementById('shortcutsOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'shortcutsOverlay';
    overlay.className = 'overlay hidden';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-labelledby','shortcutsTitle');
    overlay.innerHTML = `
      <div class="sheet">
        <header>
          <h3 id="shortcutsTitle">Help</h3>
          <button id="shortcutsClose" class="btn-chip">Close</button>
        </header>

        <div class="shortcuts-grid" style="margin-bottom:8px">
          <div><strong>Space</strong></div><div>Toggle Auto-scroll</div>
          <div><strong>↑ / ↓</strong></div><div>Adjust Auto-scroll speed</div>
          <div><strong>Shift + ?</strong></div><div>Open Help</div>
          <div><strong>Ctrl/Cmd + S</strong></div><div>Save to browser</div>
          <div><strong>~</strong></div><div>Debug HUD</div>
          <div><strong>?v=clear</strong></div><div>Force refresh</div>
        </div>

        <hr class="hr" />
        <div>
          <h4 style="margin:8px 0 6px">Official Teleprompter Tags</h4>
          <p style="margin:0 0 8px; color:#96a0aa">Speakers: <code>[s1] ... [/s1]</code>, <code>[s2] ... [/s2]</code>. Notes: <code>[note] ... [/note]</code>.</p>
          <!-- Tag guide will be augmented below if missing Normalize/Validate -->
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  // If we reused an existing overlay, inject Tag Guide only if a Tags heading is NOT already present
  if (overlay && !overlay.querySelector('#normalizeBtn') && !overlay.querySelector('#guideNormalize')){
    const sheet = overlay.querySelector('.sheet') || overlay;
    const hasTagsHeading = !!sheet.querySelector('h4') && Array.from(sheet.querySelectorAll('h4')).some(h=>/Official\s+Teleprompter\s+Tags/i.test(h.textContent||''));
    if (!hasTagsHeading){
      const container = document.createElement('div');
      container.innerHTML = `
        <hr class="hr" />
        <div class="tp-tags-block">
          <h4 style="margin:8px 0 6px">Official Teleprompter Tags</h4>
          <p style="margin:0 0 8px; color:#96a0aa">
            Speakers: <code>[s1] ... [/s1]</code>, <code>[s2] ... [/s2]</code>. Notes: <code>[note] ... [/note]</code>.
          </p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
            <button id="normalizeBtn" class="btn-chip">Normalize current script</button>
            <button id="validateBtn" class="btn-chip">Validate markup</button>
          </div>
        </div>`;
      sheet.appendChild(container);
    }
  }

  // If missing, append the optional Advanced section (hidden by default)
  if (overlay && !overlay.querySelector('#helpAdvanced')){
    const sheet = overlay.querySelector('.sheet') || overlay;
    const adv = document.createElement('div');
    adv.innerHTML = `
<div id="helpAdvanced" class="hidden" style="margin-top:12px">
  <h4 style="margin:0 0 6px">Advanced</h4>
  <div class="shortcuts-grid">
    <div><strong>Alt-click title</strong></div><div>Toggle this section</div>
    <div><strong>~</strong></div><div>Debug HUD</div>
    <div><strong>?v=clear</strong></div><div>Force refresh</div>
  </div>
</div>`;
    sheet.appendChild(adv.firstElementChild);
  }

  // --- wire open/close ---
  const closeBtn = overlay.querySelector('#shortcutsClose');
  function openHelp(){ overlay.classList.remove('hidden'); helpBtn.setAttribute('aria-expanded','true'); }
  function closeHelp(){ overlay.classList.add('hidden'); helpBtn.setAttribute('aria-expanded','false'); }
  if (helpBtn) helpBtn.onclick = openHelp;
  if (closeBtn) closeBtn.onclick = closeHelp;
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) closeHelp(); });
  document.addEventListener('keydown', (e)=>{ if(e.key === '?' && (e.shiftKey || e.metaKey || e.ctrlKey)) { e.preventDefault(); openHelp(); } });

  // --- Normalize button wiring ---
  wireNormalizeButton(overlay.querySelector('#normalizeBtn'));

  // --- Validate tags quickly ---
  const validateBtn = overlay.querySelector('#validateBtn');
  if (validateBtn) {
    const showValidation = (text) => {
      const sheet = overlay.querySelector('.sheet') || overlay;
      let panel = sheet.querySelector('#validatePanel');
      if (!panel) {
        const frag = document.createElement('div');
        frag.innerHTML = `
<div id="validatePanel" class="sheet-section hidden">
  <header style="display:flex;justify-content:space-between;align-items:center;gap:8px">
    <h4 style="margin:0">Validation results</h4>
    <button id="copyValidateBtn" class="btn-chip">Copy</button>
  </header>
  <pre id="validateOut" tabindex="0" style="white-space:pre-wrap; user-select:text; margin-top:8px"></pre>
</div>`;
        panel = frag.firstElementChild;
        sheet.appendChild(panel);
        const copyBtn = panel.querySelector('#copyValidateBtn');
        if (copyBtn && !copyBtn.dataset.wired) {
          copyBtn.dataset.wired = '1';
          copyBtn.addEventListener('click', async () => {
            const pre = panel.querySelector('#validateOut');
            const txt = pre?.textContent || '';
            try {
              await navigator.clipboard.writeText(txt);
              try { setStatus && setStatus('Validation copied ✓'); } catch {}
            } catch {
              // fallback if clipboard API blocked
              try {
                const sel = window.getSelection(); const r = document.createRange();
                r.selectNodeContents(pre); sel.removeAllRanges(); sel.addRange(r);
                document.execCommand('copy');
                try { setStatus && setStatus('Validation copied ✓'); } catch {}
              } catch (e) {
                try { setStatus && setStatus('Copy failed: ' + (e?.message||e)); } catch {}
              }
            }
          });
        }
      }
      const pre = panel.querySelector('#validateOut');
      pre.textContent = (String(text||'').trim()) || 'No issues found.';
      panel.classList.remove('hidden');
      // focus so Ctrl/Cmd+C works immediately
      try { pre.focus({ preventScroll: true }); } catch { try { pre.focus(); } catch {} }
      try { window.SCROLLER?.request({ el: pre, priority: 9, src: 'system', reason: 'focus' }); } catch {}
      // auto-select all for instant copy
      try {
        const sel = window.getSelection(); const r = document.createRange();
        r.selectNodeContents(pre); sel.removeAllRanges(); sel.addRange(r);
      } catch {}
    };

    validateBtn.onclick = () => {
      let msg;
      try { msg = window.validateStandardTags ? window.validateStandardTags(true) : 'Validator missing.'; }
      catch(e){ msg = 'Validation error: ' + (e?.message||e); }
      try { window.showValidation(msg); } catch { showCopyDialog(msg, 'Validator'); }
    };
  }
}
try { __tpBootPush('after-ensureHelpUI-def'); } catch {}

function injectHelpPanel(){
  try{
    const btn   = document.getElementById('shortcutsBtn');
    const modal = document.getElementById('shortcutsOverlay');
    const title = document.getElementById('shortcutsTitle');
  // Notify ScrollManager about user input to enter cooldown truce
  try { ['wheel','touchmove','keydown'].forEach(evt => window.addEventListener(evt, ()=>{ try { window.SCROLLER?.onUserScroll(); } catch {} }, { passive:true })); } catch {}
    const close = document.getElementById('shortcutsClose');
    if (!modal) return;

    // Rename button + title
    if (btn)   { btn.textContent = 'Help'; btn.setAttribute('aria-label','Help and shortcuts'); }
    if (title) { title.textContent = 'Help'; }

    // Find the sheet body
    const sheet = modal.querySelector('.sheet');
    if (!sheet) return;

    // Prevent duplicate insertion
    if (sheet.querySelector('#tagGuide')) return;

    const guide = document.createElement('div');
    guide.id = 'tagGuide';
    guide.innerHTML = `
      <hr class="hr" />
      <details open>
        <summary><strong>Script Tag Guide</strong></summary>
        <div class="tag-guide">
          <p class="dim">Official tags for podcast scripts — consistent and scroll‑ready.</p>
          <h4>Speaker Tags</h4>
          <ul>
            <li><code>[s1] ... [/s1]</code> → Joe</li>
            <li><code>[s2] ... [/s2]</code> → Brad</li>
          </ul>
          <p><em>Always close the tag. Never add <code>: Name</code> after the tag.</em></p>

          <h4>Notes / Cues</h4>
          <ul>
            <li><code>[note] ... [/note]</code> — stage direction, tone, pacing, delivery, music cues, etc.</li>
            <li><strong>Notes must be on their own line</strong> (not inside speaker tags).</li>
          </ul>

          <h4>Inline Styles</h4>
          <ul>
            <li>No inline color, italics, or extra formatting.</li>
            <li>If emphasis is needed, describe it in a <code>[note]</code> block instead.</li>
          </ul>

          <h4>Rules</h4>
          <ul>
            <li>Every spoken paragraph starts with <code>[s1]</code> or <code>[s2]</code>.</li>
            <li>Every note uses <code>[note]...[/note]</code> on its own paragraph.</li>
            <li>No duplicate or stray tags.</li>
            <li>Keep scripts human‑readable and teleprompter‑friendly.</li>
          </ul>

          <div class="row" style="margin-top:.6rem">
            <button id="guideNormalize" class="btn-chip">Normalize current script</button>
            <button id="guideValidate" class="btn-chip">Validate</button>
          </div>
        </div>
      </details>
    `;

    // Insert guide after the shortcuts grid
    const grid = sheet.querySelector('.shortcuts-grid');
    if (grid && grid.parentElement) {
      grid.parentElement.appendChild(guide);
    } else {
      sheet.appendChild(guide);
    }

    // Wire quick actions (reuse existing functions if present)
    document.getElementById('guideNormalize')?.addEventListener('click', ()=>{
      try{
        const src = (typeof editor !== 'undefined' && editor) ? editor.value : '';
        if (typeof normalizeScriptStrict === 'function'){
          const out = normalizeScriptStrict(src);
          if (editor) editor.value = out;
          if (typeof renderScript === 'function') renderScript(out);
          setStatus && setStatus('Normalized to standard tags.');
        } else if (typeof normalizeScript === 'function'){
          const out = normalizeScript(src).text || normalizeScript(src); // backward compat
          if (editor) editor.value = out;
          if (typeof renderScript === 'function') renderScript(out);
          setStatus && setStatus('Normalized.');
        }
      }catch(err){ console.error(err); }
    });

    document.getElementById('guideValidate')?.addEventListener('click', ()=>{
      try{
        const src = (typeof editor !== 'undefined' && editor) ? editor.value : '';
        if (typeof validateScriptStrict === 'function'){
          const issues = validateScriptStrict(src);
          if (!issues.length) alert('✅ Script passes the standard.');
          else alert('⚠️ Issues:\\n- ' + issues.join('\\n- '));
        } else {
          alert('Validation is not available in this build.');
        }
      }catch(err){ console.error(err); }
    });

  }catch(err){ console.error('Help injection failed', err); }
}

// Wrap the original init logic so we can capture early failures.
async function _initCore() {
  // Make the real core visible to the stub/runner and resolve any waiters
  try {
    // publish the real core so window.init and the stub can find it
    window._initCore = _initCore;

    // wake the stable runner promise (defined earlier)
    if (typeof window.__tpSetCoreRunnerReady === 'function') {
      window.__tpSetCoreRunnerReady();
    }

    // also resolve the simple "core ready" latch, if present
    if (typeof window.__tpResolveCoreReady === 'function') {
      window.__tpResolveCoreReady();
    }
  } catch {}
  console.log('[TP-Pro] _initCore start');
  // Calm Mode: lock scroller and freeze base viewport height early
  try {
    if (window.__TP_CALM) {
      function chooseScroller() {
        const v = document.getElementById('viewer');
        if (v && (v.scrollHeight - v.clientHeight > 1)) return v;
        return document.scrollingElement || document.documentElement || document.body;
      }
      const SCROLLER = chooseScroller();
      const VIEWER_HEIGHT_BASE = SCROLLER?.clientHeight || 0;
      // publish for other modules that may consult these
      try { window.__TP_SCROLLER = SCROLLER; } catch {}
      try { window.__TP_VIEWER_HEIGHT_BASE = VIEWER_HEIGHT_BASE; } catch {}
      console.info('[TP-Pro Calm] Scroller locked:', SCROLLER?.id || SCROLLER?.tagName, 'vh_base=', VIEWER_HEIGHT_BASE);
    }
  } catch (e) { console.warn('[TP-Pro Calm] scroller lock failed', e); }
  // Run minimal wiring first (meters, help overlay, normalize button)
  try { __initMinimal(); } catch(e) { console.warn('Minimal init failed', e); }
  // ⬇️ grab these *first*
  shortcutsBtn     = document.getElementById('shortcutsBtn');
  shortcutsOverlay = document.getElementById('shortcutsOverlay');
  shortcutsClose   = document.getElementById('shortcutsClose');

  // Shortcuts overlay open/close logic (now safe)
  function openShortcuts(){
    if (!shortcutsOverlay) return;
    shortcutsOverlay.classList.remove('hidden');
    shortcutsBtn?.setAttribute('aria-expanded','true');
  setTimeout(()=>{ try { shortcutsClose?.focus({ preventScroll: true }); } catch { try { shortcutsClose?.focus(); } catch {} } try { window.SCROLLER?.request({ el: shortcutsClose, priority: 9, src: 'system', reason: 'focus' }); } catch {} }, 0);
  }
  // (rest of init logic continues below ... existing code ...)
  function closeShortcuts(){
    if (!shortcutsOverlay) return;
    shortcutsOverlay.classList.add('hidden');
    shortcutsBtn?.setAttribute('aria-expanded','false');
  try { shortcutsBtn?.focus({ preventScroll: true }); } catch { try { shortcutsBtn?.focus(); } catch {} }
  try { window.SCROLLER?.request({ el: shortcutsBtn, priority: 9, src: 'system', reason: 'focus' }); } catch {}
  }

  // Now bind listeners
  shortcutsBtn?.addEventListener('click', openShortcuts);
  shortcutsClose?.addEventListener('click', closeShortcuts);
  shortcutsOverlay?.addEventListener('click', (e)=>{
    if (e.target === shortcutsOverlay) closeShortcuts();
  });
  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if (typing) return; // don't steal keys when user is typing

    switch (e.key) {
      case ' ': // Space
        e.preventDefault();
        if (autoTimer) stopAutoScroll(); else startAutoScroll();
        break;
      case 'ArrowUp':
        e.preventDefault();
        tweakSpeed(+5); // +5 px/s
        break;
      case 'ArrowDown':
        e.preventDefault();
        tweakSpeed(-5); // -5 px/s
        break;
      case '1':
        wrapSelection('[s1]', '[/s1]');
        break;
      case '2':
        wrapSelection('[s2]', '[/s2]');
        break;
      case '3':
        wrapSelection('[g1]', '[/g1]');
        break;
      case '4':
        wrapSelection('[g2]', '[/g2]');
        break;
      case '?':
      case '/':
        if (e.shiftKey) { e.preventDefault(); openShortcuts(); }
        break;
    }
  });

  // ===== Progressive Fallback Nudge (strict, no root fallback, gated) =====
  (function(){
    const F = {
      stepPx: 24,            // small push, device-ish friendly
      coolDownMs: 900,       // don’t spam nudges
    };
    const S = { lastAt: 0 };
    let fbDelay = 250, fbTimer = 0;
    window.__tpScheduleFallback = function(fn){
      if (fbTimer) return;
      fbTimer = setTimeout(async () => {
        fbTimer = 0;
        let didSomething = false;
        try { didSomething = !!(await fn()); } catch {}
        fbDelay = didSomething ? 250 : Math.min(fbDelay * 2, 2000);
      }, fbDelay);
    };

    function syncDisplay(){
      try{
        const viewer = document.getElementById('viewer');
        if (!viewer) return;
        const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
        const ratio = max ? (viewer.scrollTop / max) : 0;
        sendToDisplay && sendToDisplay({ type:'scroll', top: viewer.scrollTop, ratio });
      } catch {}
    }

    window.__tpFallbackNudge = function(bestIdx){
      const now = performance.now();
      if (now - S.lastAt < F.coolDownMs) {
        try { if (typeof debug === 'function') debug({ tag:'fallback-nudge:cooldown' }); } catch {}
        return false;
      }
      S.lastAt = now;

      const viewer = document.getElementById('viewer');
      if (!viewer) return false;
      // Disable any fallback if the catch-up decision is hold or we cannot programmatically scroll
      try {
        const decision = String(window.__tpLastCatchupDecision||'');
        if (!decision || decision.startsWith('hold')) { try { if (typeof debug==='function') debug({ tag:'fallback-nudge:skip', reason:'decision-hold' }); } catch {} return false; }
      } catch {}
      try { if (!__tpCanProgrammaticScroll()) { if (typeof debug==='function') debug({ tag:'fallback-nudge:skip', reason:'cooldown' }); return false; } } catch {}
      // Also guard on stability
      try {
        const sim = (typeof window.__lastSimScore==='number') ? window.__lastSimScore : 0;
        const jitterStd = (typeof window.__tpJitterEma==='number') ? window.__tpJitterEma : 0;
        const activeEl = (document.getElementById('script')||document).querySelector('p.active');
        const anchorVisible = isInComfortBand(activeEl, { top: 0.25, bottom: 0.55 });
        if (!stableEligible({ sim, jitterStd, anchorVisible })) { try { if (typeof debug==='function') debug({ tag:'fallback-nudge:skip', reason:'unstable' }); } catch {} return false; }
      } catch {}

      // Tiny same-scroller nudge only
  const to = viewer.scrollTop + (F.stepPx * 1);
  try { if (typeof debug === 'function') debug({ tag:'fallback-nudge', top: to, idx: bestIdx, phase:'tiny' }); } catch {}
  try { window.SCROLLER?.request({ y: to, priority: 3, src: 'system', reason: 'fallback-nudge' }); } catch {}
      syncDisplay();
      return true;
    };
  })();

  // Stall-recovery watchdog: if matching goes quiet, nudge forward gently
  setInterval(() => {
    if (window.__TP_DISABLE_NUDGES) return;
    if (!recActive || !viewer) return; // only when speech sync is active
    if (typeof autoTimer !== 'undefined' && autoTimer) return; // don't fight auto-scroll
    const now = performance.now();
  const MISS_FALLBACK_MS = 1800;   // no matches for ~1.8s
    // If similarity has been in the mid band (0.72–0.80) very recently, wait a couple frames (~300ms)
    try {
      const sim = (window.__lastSimScore ?? null);
      if (sim !== null && sim >= 0.72 && sim < 0.80) {
        window.__tpLastMidSimAt = now;
      }
    } catch {}
    const recentMid = (typeof window.__tpLastMidSimAt === 'number') && ((now - window.__tpLastMidSimAt) < 300);
    if (now - _lastAdvanceAt > MISS_FALLBACK_MS) {
      if (recentMid) { return; }
      try { window.__tpScheduleFallback?.(() => window.__tpFallbackNudge?.(currentIndex || 0)); } catch {}
      _lastAdvanceAt = now; // cool-off gate for next nudge check
      // dead-man watchdog after logical index adjustment
      try { deadmanWatchdog(currentIndex); } catch {}
    }
  }, 250);

  // STALL resolver (don’t spin): react to emitted stall events
  try {
    window.addEventListener('tp:stall', (ev) => {
      try {
        const data = ev?.detail || {};
        const cov = Number(data.cov || 0);
        const now = performance.now();
        if (cov >= 0.70) {
          const recentSuffix = (typeof window.__tpLastSuffixHitAt === 'number') && ((now - window.__tpLastSuffixHitAt) < 400);
          if (recentSuffix) {
            try { if (typeof window.commitLine === 'function') window.commitLine(); } catch {}
          } else {
            try { if (typeof window.scheduleCatchupScan === 'function') window.scheduleCatchupScan(); } catch {}
          }
        }
      } catch {}
    });
  } catch {}

  // After wiring open/close for the overlay:
  (window.__help?.ensureHelpUI || ensureHelpUI)();  // <- renames “Shortcuts” to “Help” and injects Normalize + Validate

  // Query all elements once
  shortcutsBtn     = document.getElementById('shortcutsBtn');
shortcutsOverlay = document.getElementById('shortcutsOverlay');
shortcutsClose   = document.getElementById('shortcutsClose');


  editor   = document.getElementById('editor');
  scriptEl = document.getElementById('script');
  viewer   = document.getElementById('viewer');
  legendEl = document.getElementById('legend');
  debugPosChip = document.getElementById('debugPosChip');

  permChip    = document.getElementById('permChip');
  displayChip = document.getElementById('displayChip');
  recChip     = document.getElementById('recChip');
  camRtcChip  = document.getElementById('camRtcChip');

  openDisplayBtn  = document.getElementById('openDisplayBtn');
  closeDisplayBtn = document.getElementById('closeDisplayBtn');
  presentBtn      = document.getElementById('presentBtn');

  micBtn          = document.getElementById('micBtn');
  recBtn          = document.getElementById('recBtn');
  // (Legacy hidden micDeviceSel retained but not bound; use getMicSel())
  refreshDevicesBtn = document.getElementById('refreshDevicesBtn');

  fontSizeInput   = document.getElementById('fontSize');
  lineHeightInput = document.getElementById('lineHeight');
  autoToggle      = document.getElementById('autoToggle');
  autoSpeed       = document.getElementById('autoSpeed');
  const catchUpBtn      = document.getElementById('catchUpBtn');
  const matchAggroSel   = document.getElementById('matchAggro');
  const motionSmoothSel = document.getElementById('motionSmooth');

  timerEl     = document.getElementById('timer');
  resetBtn    = document.getElementById('resetBtn');
  loadSample  = document.getElementById('loadSample');
  clearText   = document.getElementById('clearText');

  downloadFileBtn  = document.getElementById('downloadFile');
  uploadFileBtn    = document.getElementById('uploadFileBtn');
  uploadFileInput  = document.getElementById('uploadFile');
  const scriptSelect = document.getElementById('scriptSelect');
  const saveAsBtn    = document.getElementById('saveAsBtn');
  const loadBtn      = document.getElementById('loadBtn');
  const deleteBtn    = document.getElementById('deleteBtn');
  const resetScriptBtn = document.getElementById('resetScriptBtn');

  wrapBold      = document.getElementById('wrap-bold');
  wrapItalic    = document.getElementById('wrap-italic');
  wrapUnderline = document.getElementById('wrap-underline');
  wrapNote      = document.getElementById('wrap-note');
  wrapColor     = document.getElementById('wrap-color');
  wrapBg        = document.getElementById('wrap-bg');
  autoTagBtn    = document.getElementById('autoTagBtn');

  nameS1 = document.getElementById('name-s1');
  colorS1= document.getElementById('color-s1');
  wrapS1 = document.getElementById('wrap-s1');

  nameS2 = document.getElementById('name-s2');
  colorS2= document.getElementById('color-s2');
  wrapS2 = document.getElementById('wrap-s2');

  nameG1 = document.getElementById('name-g1');
  colorG1= document.getElementById('color-g1');
  wrapG1 = document.getElementById('wrap-g1');

  nameG2 = document.getElementById('name-g2');
  colorG2= document.getElementById('color-g2');
  wrapG2 = document.getElementById('wrap-g2');

  camWrap    = document.getElementById('camWrap');
  camVideo   = document.getElementById('camVideo');
  // Ensure inline playback on mobile Safari without using unsupported HTML attribute in some browsers
  if (camVideo) {
    try {
      // Set properties first (best practice for autoplay/inline)
      camVideo.muted = true;            // required for mobile autoplay
      camVideo.autoplay = true;
      camVideo.playsInline = true;
      // Hide native controls
      camVideo.controls = false;
      camVideo.removeAttribute('controls');
      camVideo.removeAttribute('controlsList');
      camVideo.disablePictureInPicture = true;
      camVideo.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback');
      // Then mirror as attributes for broader compatibility
      camVideo.setAttribute('playsinline', '');
      camVideo.setAttribute('webkit-playsinline', '');
    } catch {}
  }
  startCamBtn= document.getElementById('startCam');
  stopCamBtn = document.getElementById('stopCam');
  camDeviceSel = document.getElementById('camDevice');
  camSize    = document.getElementById('camSize');
  camOpacity = document.getElementById('camOpacity');
  camMirror  = document.getElementById('camMirror');
  camPiP     = document.getElementById('camPiP');

  prerollInput = document.getElementById('preroll');
  countOverlay = document.getElementById('countOverlay');
  countNum     = document.getElementById('countNum');
  // OBS toggle UI
  const enableObsChk = document.getElementById('enableObs');
  const obsStatus    = document.getElementById('obsStatus');
  const obsUrlInput  = document.getElementById('obsUrl');
  const obsPassInput = document.getElementById('obsPassword');
  const obsTestBtn   = document.getElementById('obsTestBtn');
  const settingsBtn  = document.getElementById('settingsBtn');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const settingsClose = document.getElementById('settingsClose');
  const settingsBody  = document.getElementById('settingsBody');

  // Speakers toggle bits
  toggleSpeakersBtn = document.getElementById('toggleSpeakers');
  speakersBody      = document.getElementById('speakersBody');

  if (!openDisplayBtn) { setStatus('Boot: DOM not ready / IDs missing'); return; }
    // Initialize modular helpers now that viewer exists
    try {
      const shMod = await import('./scroll-helpers.js');
  const sh = shMod.createScrollerHelpers(() => viewer);
      __scrollHelpers = sh;
    clampScrollTop = sh.clampScrollTop;
    scrollByPx     = (px)=>{ sh.scrollByPx(px); try{ updateDebugPosChip(); }catch{} };
    scrollToY      = (y)=>{ sh.scrollToY(y); try{ updateDebugPosChip(); }catch{} };
    scrollToEl     = (el,off=0)=>{ sh.scrollToEl(el,off); try{ updateDebugPosChip(); }catch{} };
  scrollToElAtMarker = (el)=>{ sh.scrollToElAtMarker(el); try{ updateDebugPosChip(); }catch{} };
    // Session scroller lock to avoid double-scroll race between page and viewer
    (function installSessionScrollerLock(){
      try {
        if (window.__tpSessScrollerLockInstalled) return; window.__tpSessScrollerLockInstalled = true;
        let _locked = false;
        function detectViewer(){ try { const v = document.getElementById('viewer'); if (!v) return null; const canScroll = (v.scrollHeight - v.clientHeight) > 1; return canScroll ? v : null; } catch { return null; } }
        function lockToViewerIfPossible(){ if (_locked) return; const v = detectViewer(); if (v){ try { window.__TP_SCROLLER = v; } catch {} _locked = true; try { console.info('[TP-Pro] Active scroller locked: viewer'); } catch {} } }
        function scrollToY(y){
          try {
            // Attempt to lock to viewer at first opportunity (when it can scroll)
            lockToViewerIfPossible();
            const viewerEl = document.getElementById('viewer');
            const pageEl = document.scrollingElement || document.documentElement || document.body;
            const sc = (_locked && window.__TP_SCROLLER) ? window.__TP_SCROLLER : (detectViewer() || pageEl);
            const max = Math.max(0, (sc.scrollHeight||0) - (sc.clientHeight||0));
            const to = Math.max(0, Math.min(Number(y)||0, max));
            // Route through single authority
            try { window.SCROLLER?.request({ y: to, priority: 7, src: 'system', reason: 'session-lock' }); } catch {}
          } catch {}
        }
        // Publish helpers (optional teardown could unset lock if needed later)
        try { window.__lockActiveScroller = ()=>{ _locked=true; if (!window.__TP_SCROLLER) { const v=detectViewer(); window.__TP_SCROLLER = v || (document.scrollingElement||document.documentElement||document.body); } }; } catch {}
        try { window.__unlockActiveScroller = ()=>{ _locked=false; }; } catch {}
        // Override requestScroll to force a single target per session
        requestScroll  = (y)=>{
          try{
            const sc = (window.__TP_SCROLLER || document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body);
            const before = (sc===window) ? (window.scrollY||0) : (sc.scrollTop||0);
            scrollToY(y);
            // Telemetry: measure result after ~160ms to spot dead scrolls
            setTimeout(()=>{
              try {
                const after = (sc===window) ? (window.scrollY||0) : (sc.scrollTop||0);
                const delta = Math.round((after||0) - (before||0));
                const intended = Math.round(Number(y)||0);
                const tag = 'scroll:result';
                const payload = { before, after, delta, intended, ok: Math.abs(delta) >= 1 };
                try { if (typeof debug==='function') debug({ tag, ...payload }); } catch {}
                try { if (typeof HUD?.log === 'function') HUD.log(tag, payload); } catch {}
              } catch {}
            }, 160);
          }catch{ try{ window.SCROLLER?.request({ y, priority: 7, src: 'system', reason: 'requestScroll:fallback' }); }catch{} }
          try{ updateDebugPosChip(); }catch{}
        };
        // Snap mode toggle: 'all' | 'active' | 'off'
        try {
          window.setSnapMode = function setSnapMode(mode){
            try {
              const root = document.querySelector('.viewer .script');
              if (!root) return;
              root.classList.toggle('snap-active-only', mode === 'active');
              root.classList.toggle('no-snap', mode === 'off');
            } catch {}
          };
        } catch {}
      } catch {}
    })();
    } catch(e) { console.warn('scroll-helpers load failed', e); }

    try {
      const ioMod = await import('./io-anchor.js');
      __anchorObs = ioMod.createAnchorObserver(() => viewer, () => { try{ updateDebugPosChip(); }catch{} });
    } catch(e) { console.warn('io-anchor load failed', e); }
    try {
      const scMod = await import('./scroll-control.js');
      __scrollCtl = scMod.createScrollController(() => viewer);
    } catch (e) { console.warn('scroll-control load failed', e); }
  // …keep the rest of your init() as-is…

    // Wire UI
    openDisplayBtn.addEventListener('click', openDisplay);
    closeDisplayBtn.addEventListener('click', closeDisplay);
    presentBtn.addEventListener('click', openDisplay);
  // Mark that core buttons have direct listeners (used by delegation heuristic)
  try { openDisplayBtn.__listenerAttached = true; closeDisplayBtn.__listenerAttached = true; presentBtn.__listenerAttached = true; } catch {}
  window.__tpInitSuccess = true;
  console.log('[TP-Pro] _initCore mid (core UI wired)');

    fontSizeInput.addEventListener('input', applyTypography);
    lineHeightInput.addEventListener('input', applyTypography);

    autoToggle.addEventListener('click', () => {
      if (autoTimer) stopAutoScroll(); else startAutoScroll();
    });

    // OBS enable toggle wiring (after recorder module possibly loaded)
    if (enableObsChk) {
      const applyFromSettings = () => {
        try {
          if (!__recorder?.getSettings) return;
            const s = __recorder.getSettings();
            const has = s.selected.includes('obs');
            enableObsChk.checked = has;
            if (obsStatus) obsStatus.textContent = has ? 'OBS: enabled' : 'OBS: disabled';
            // Prefill URL/password
            try {
              if (obsUrlInput && s.configs?.obs?.url) obsUrlInput.value = s.configs.obs.url;
              if (obsPassInput && typeof s.configs?.obs?.password === 'string') obsPassInput.value = s.configs.obs.password;
            } catch {}
        } catch {}
      };
      applyFromSettings();
      enableObsChk.addEventListener('change', async ()=>{
        try {
          if (!__recorder?.getSettings || !__recorder?.setSettings) return;
          const s = __recorder.getSettings();
          let sel = s.selected.filter(id => id !== 'obs');
          if (enableObsChk.checked) sel.push('obs');
          const cfgs = { ...(s.configs||{}) };
          if (!cfgs.obs) cfgs.obs = { url: obsUrlInput?.value || 'ws://127.0.0.1:4455', password: obsPassInput?.value || '' };
          __recorder.setSettings({ selected: sel, configs: cfgs });
          if (obsStatus) obsStatus.textContent = enableObsChk.checked ? 'OBS: enabled' : 'OBS: disabled';
          // Optionally check availability quickly
          if (enableObsChk.checked && __recorder.get('obs')?.isAvailable) {
            try {
              const ok = await __recorder.get('obs').isAvailable();
              if (obsStatus) obsStatus.textContent = ok ? 'OBS: ready' : 'OBS: offline';
            } catch { if (obsStatus) obsStatus.textContent = 'OBS: offline'; }
          }
        } catch {}
      });
    }

    // Settings overlay wiring
    if (settingsBtn && settingsOverlay && settingsClose && settingsBody){
      const openSettings = () => {
        try { buildSettingsContent(); } catch(e){}
        try { const s=__readHudSettings(); __hydrateSettingsControls(s); __bindSettingsControls(); __applyStyleFromSettings(s); } catch {}
        settingsOverlay.classList.remove('hidden');
        settingsBtn.setAttribute('aria-expanded','true');
      };
      // Prebuild asynchronously after main init so first open isn't empty if user opens quickly
  setTimeout(()=>{ try { const s=__readHudSettings(); buildSettingsContent(); __hydrateSettingsControls(s); __bindSettingsControls(); __applyStyleFromSettings(s); } catch{} }, 0);
      const closeSettings = () => { settingsOverlay.classList.add('hidden'); settingsBtn.setAttribute('aria-expanded','false'); };
      settingsBtn.addEventListener('click', openSettings);
      settingsClose.addEventListener('click', closeSettings);
      settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) closeSettings(); });
      window.addEventListener('keydown', e => { if (e.key === 'Escape' && !settingsOverlay.classList.contains('hidden')) closeSettings(); });
    }

    // (Removed duplicate simple buildSettingsContent; using tabbed version defined earlier.)

    // wireSettingsDynamic moved to top-level (see earlier definition)

    // OBS URL/password change persistence (debounced lightweight)
    const saveObsConfig = () => {
      try {
        if (!__recorder?.getSettings || !__recorder?.setSettings) return;
        const s = __recorder.getSettings();
        const cfgs = { ...(s.configs||{}) };
        const prev = cfgs.obs || {};
        cfgs.obs = { ...prev, url: obsUrlInput?.value || prev.url || 'ws://127.0.0.1:4455', password: obsPassInput?.value || prev.password || '' };
        __recorder.setSettings({ configs: cfgs });
        if (obsStatus && enableObsChk?.checked) obsStatus.textContent = 'OBS: updated';
      } catch {}
    };
    obsUrlInput?.addEventListener('change', saveObsConfig);
    obsPassInput?.addEventListener('change', saveObsConfig);

    // Test button
    obsTestBtn?.addEventListener('click', async ()=>{
      if (!__recorder?.get || !__recorder.get('obs')) { if (obsStatus) obsStatus.textContent='OBS: adapter missing'; return; }
      if (obsStatus) obsStatus.textContent='OBS: testing…';
      try {
        saveObsConfig();
        const ok = await __recorder.get('obs').test();
        if (obsStatus) obsStatus.textContent = 'OBS: ok';
      } catch (e){
        if (obsStatus) obsStatus.textContent = 'OBS: failed';
        try {
          const errMsg = __recorder.get('obs').getLastError?.() || e?.message || String(e);
          obsStatus.title = errMsg;
        } catch {}
      }
    });

    resetBtn.addEventListener('click', resetTimer);

    loadSample.addEventListener('click', () => {
      editor.value = 'Welcome to [b]Teleprompter Pro[/b].\n\nUse [s1]roles[/s1], [note]notes[/note], and colors like [color=#ff0]this[/color].';
      renderScript(editor.value);
    });
    clearText.addEventListener('click', () => { editor.value=''; renderScript(''); });

    // Top-bar Normalize button (near Load sample)
    const normalizeTopBtn = document.getElementById('normalizeTopBtn');
    if (normalizeTopBtn && !normalizeTopBtn.dataset.wired){
      normalizeTopBtn.dataset.wired = '1';
      normalizeTopBtn.addEventListener('click', () => {
        if (typeof window.normalizeToStandard === 'function') {
          try { window.normalizeToStandard(); } catch (e) { alert('Normalize error: ' + e.message); }
          return;
        }
        // Shared fallback
        fallbackNormalize();
      });
    }

    // Populate dropdown from browser storage (single draft for now)
    function refreshScriptSelect(){
      if (!scriptSelect) return;
      const opts = [];
      try { if (localStorage.getItem(LS_KEY)) opts.push({ key: LS_KEY, name: 'Draft (browser)' }); } catch {}
      scriptSelect.innerHTML = '';
      if (opts.length === 0){
        const o = document.createElement('option'); o.value=''; o.textContent='— No saved draft —'; scriptSelect.appendChild(o);
      } else {
        for (const it of opts){ const o=document.createElement('option'); o.value=it.key; o.textContent=it.name; scriptSelect.appendChild(o); }
      }
    }
    refreshScriptSelect();

    // Save As -> writes to browser draft and refreshes dropdown
    saveAsBtn?.addEventListener('click', () => { saveToLocal(); refreshScriptSelect(); });
    // Load button -> loads the draft from LS
    loadBtn?.addEventListener('click', () => { loadFromLocal(); });
    // Delete -> clears the draft from LS
    deleteBtn?.addEventListener('click', () => { try{ localStorage.removeItem(LS_KEY); }catch{} refreshScriptSelect(); setStatus('Deleted browser draft.'); });
    // Download current script in chosen format
    const fmtSel = document.getElementById('downloadFormat');
    downloadFileBtn?.addEventListener('click', () => {
      const fmt = (fmtSel?.value || 'txt');
      const name = `script.${fmt}`;
      let mime = 'text/plain';
      if (fmt === 'md') mime = 'text/markdown';
      else if (fmt === 'rtf') mime = 'application/rtf';
      else if (fmt === 'text') mime = 'text/plain';
      // For future docx support, we will generate a blob via Mammoth or a docx builder.
      downloadAsFile(name, editor.value, mime);
    });

    uploadFileBtn?.addEventListener('click', () => uploadFileInput?.click());
    uploadFileInput?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      await uploadFromFile(f);
      uploadFileInput.value = '';
    });

    editor.addEventListener('input', () => renderScript(editor.value));
    editor.addEventListener('paste', (ev) => {
      const dt = ev.clipboardData;
      if (!dt) return; const text = dt.getData('text/plain');
      if (!text) return;
      ev.preventDefault();
      const alreadyTagged = /\[(s1|s2|g1|g2)\]/i.test(text);
      const normalized = normalizeSimpleTagTypos(text);
      const converted = alreadyTagged ? normalized : smartTag(normalized);
      const start = editor.selectionStart, end = editor.selectionEnd;
      const v = editor.value; editor.value = v.slice(0,start) + converted + v.slice(end);
      editor.selectionStart = editor.selectionEnd = start + converted.length;
      renderScript(editor.value);
    });

    // Role inputs -> live update
    syncRoleInputs();
    [nameS1,colorS1, nameS2,colorS2, nameG1,colorG1, nameG2,colorG2].forEach(el => el?.addEventListener('input', onRoleChange));
    updateLegend();

    wrapS1?.addEventListener('click', () => wrapSelection('[s1]','[/s1]'));
    wrapS2?.addEventListener('click', () => wrapSelection('[s2]','[/s2]'));
    wrapG1?.addEventListener('click', () => wrapSelection('[g1]','[/g1]'));
    wrapG2?.addEventListener('click', () => wrapSelection('[g2]','[/g2]'));

    wrapBold?.addEventListener('click', () => wrapSelection('[b]','[/b]'));
    wrapItalic?.addEventListener('click', () => wrapSelection('[i]','[/i]'));
    wrapUnderline?.addEventListener('click', () => wrapSelection('[u]','[/u]'));
    wrapNote?.addEventListener('click', () => wrapSelection('[note]','[/note]'));
    wrapColor?.addEventListener('click', () => {
      const c = prompt('Color (name or #hex):', '#ff0'); if (!c) return; wrapSelection(`[color=${c}]`, '[/color]');
    });
    wrapBg?.addEventListener('click', () => {
      const c = prompt('Background (name or #hex):', '#112233'); if (!c) return; wrapSelection(`[bg=${c}]`, '[/bg]');
    });

    autoTagBtn?.addEventListener('click', () => {
      editor.value = smartTag(editor.value);
      renderScript(editor.value);
    });

    // Reset Script -> clear draft, clear editor, reset view and sync
    resetScriptBtn?.addEventListener('click', resetScript);

    // Catch Up button: snap immediately to current line at 40% viewport height
    if (catchUpBtn && !catchUpBtn.dataset.wired){
      catchUpBtn.dataset.wired = '1';
      catchUpBtn.addEventListener('click', () => {
        try {
          // Stop auto-catchup momentarily to avoid contention
          __scrollCtl?.stopAutoCatchup?.();
          const sc = getScroller();
          // Prefer currentEl, else the paragraph for currentIndex, else most-visible
          const vis = __anchorObs?.mostVisibleEl?.() || null;
          let el = currentEl || (paraIndex.find(p=>currentIndex>=p.start && currentIndex<=p.end)?.el) || vis || null;
          if (!el && Array.isArray(lineEls)) el = lineEls[0] || null;
          if (el) {
            if (typeof scrollToElAtMarker === 'function') scrollToElAtMarker(el); else scrollToEl(el, Math.round(sc.clientHeight * 0.40));
            const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
            const ratio = max ? (sc.scrollTop / max) : 0;
            sendToDisplay({ type:'scroll', top: sc.scrollTop, ratio });
          }
        } catch {}
      });
    }


    // Mic and devices
    micBtn?.addEventListener('click', requestMic);
    refreshDevicesBtn?.addEventListener('click', populateDevices);

    // Recognition on/off (placeholder toggle)
    recBtn?.addEventListener('click', toggleRec);

    // Speech availability hint: disable if unsupported
    try {
      const SRAvail = (window.SpeechRecognition || window.webkitSpeechRecognition);
      if (!SRAvail) {
        if (recBtn) { recBtn.disabled = true; recBtn.title = 'Speech recognition not supported in this browser'; }
        if (recChip) { recChip.textContent = 'Speech: unsupported'; }
      } else {
        // Supported → ensure the button is enabled (HTML defaults to disabled)
        if (recBtn) { recBtn.disabled = false; try { recBtn.removeAttribute('title'); } catch {} }
      }
    } catch {}

    // dB meter power save: suspend AudioContext when tab hidden, resume on return
    document.addEventListener('visibilitychange', () => {
      try {
        if (!audioCtx) return;
        if (document.hidden) {
          if (audioCtx.state === 'running') audioCtx.suspend();
        } else {
          if (audioCtx.state === 'suspended') audioCtx.resume();
        }
      } catch {}
    });
    // Extra safety: some browsers fire blur/focus without visibilitychange (e.g., alt-tab quickly)
    window.addEventListener('focus', () => { try { if (audioCtx?.state === 'suspended') audioCtx.resume(); } catch {} });
    window.addEventListener('blur',  () => { try { if (audioCtx?.state === 'running' && document.hidden) audioCtx.suspend(); } catch {} });

    // Tiny wink: Shift+click Rec to hint at future calibration
    if (recBtn){
      recBtn.addEventListener('click', (e)=>{
        if (e.shiftKey){
          try { setStatus && setStatus('Calibration read: listen for pace… (coming soon)'); } catch {}
          // future: sample speech rate and tune MATCH_WINDOW_AHEAD, thresholds, etc.
        }
      }, { capture:true }); // capture so it runs before the normal handler
    }

    // Camera
    startCamBtn?.addEventListener('click', startCamera);
    stopCamBtn?.addEventListener('click', stopCamera);
    camDeviceSel?.addEventListener('change', () => { if (camVideo?.srcObject) startCamera(); });
    camSize?.addEventListener('input', applyCamSizing);
    camOpacity?.addEventListener('input', applyCamOpacity);
    camMirror?.addEventListener('change', applyCamMirror);
    camPiP?.addEventListener('click', togglePiP);

  // TP: display-handshake
  // Display handshake: accept either a string ping or a typed object
  window.addEventListener('message', async (e) => {
      if (!displayWin || e.source !== displayWin) return;
      if (e.data === 'DISPLAY_READY' || e.data?.type === 'display-ready') {
        displayReady = true;
        // Stop any outstanding hello ping loop
        if (displayHelloTimer) { clearInterval(displayHelloTimer); displayHelloTimer = null; }
        displayChip.textContent = 'Display: ready';
        // push initial state
        sendToDisplay({ type:'render', html: scriptEl.innerHTML, fontSize: fontSizeInput.value, lineHeight: lineHeightInput.value });
        // also push explicit typography in case display needs to apply restored prefs
        sendToDisplay({ type:'typography', fontSize: fontSizeInput.value, lineHeight: lineHeightInput.value });
        {
          const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
          const ratio = max ? (viewer.scrollTop / max) : 0;
          sendToDisplay({ type:'scroll', top: viewer.scrollTop, ratio });
        }
        closeDisplayBtn.disabled = false;
        // If user intended camera mirroring, (re)establish
        try { if (wantCamRTC && camStream) ensureCamPeer(); } catch {}
      } else if (e.data?.type === 'cam-answer' && camPC) {
        try {
          const st = camPC.signalingState;
          if (st !== 'have-local-offer') {
            // Ignore late/duplicate answers; we're either already stable or in an unexpected state
            camAwaitingAnswer = false;
            return;
          }
          const desc = { type:'answer', sdp: e.data.sdp };
          await camPC.setRemoteDescription(desc);
          camAwaitingAnswer = false;
        } catch {}
      } else if (e.data?.type === 'cam-ice' && camPC) {
        try {
          // Only add ICE candidates once we have a remote description, else some browsers throw
          if (camPC.remoteDescription && camPC.remoteDescription.type) {
            await camPC.addIceCandidate(e.data.candidate);
          } else {
            // Buffer or drop silently; for simplicity, drop to avoid complex buffering here
          }
        } catch {}
      }
    });

  // (Removed stray buildDbBars() call without target; meter already built earlier.)

    // Restore UI prefs from localStorage (if any)
      const FONT_KEY = 'tp_font_size_v1';
      const LINE_KEY = 'tp_line_height_v1';
      try {
        const savedFont = localStorage.getItem(FONT_KEY);
        if (savedFont && fontSizeInput) fontSizeInput.value = savedFont;
      } catch {}
      try {
        const savedLH = localStorage.getItem(LINE_KEY);
        if (savedLH && lineHeightInput) lineHeightInput.value = savedLH;
      } catch {}
    const AGGRO_KEY = 'tp_match_aggro_v1';
  // Dev tuning persistence keys
  const TUNE_KEY = 'tp_match_tuning_v1';
  const TUNE_ENABLE_KEY = 'tp_match_tuning_enabled_v1';
  let _tunePanelEl = null;
  let _tuneInputs = {};
  const DEV_MODE = /[?&]dev=1/.test(location.search) || location.hash.includes('dev') || (()=>{ try { return localStorage.getItem('tp_dev_mode')==='1'; } catch { return false; } })();
    try {
      const savedAggro = localStorage.getItem(AGGRO_KEY);
      if (savedAggro && matchAggroSel) matchAggroSel.value = savedAggro;
    } catch {}
    const SMOOTH_KEY = 'tp_motion_smooth_v1';
    try {
      const savedSmooth = localStorage.getItem(SMOOTH_KEY);
      if (savedSmooth && motionSmoothSel) motionSmoothSel.value = savedSmooth;
    } catch {}

  // TP: initial-render
  // Initial render
    renderScript(editor.value || '');
    // Apply aggressiveness mapping now and on change
  // TP: matcher-tunables
  function applyAggro(){
      const v = (matchAggroSel?.value || '2');
      if (v === '1'){
        // Conservative: require higher similarity, smaller search windows, stricter forward jumping
        SIM_THRESHOLD = 0.62;
        MATCH_WINDOW_AHEAD = 140;
        MATCH_WINDOW_BACK  = 20;
        STRICT_FORWARD_SIM = 0.82;
        MAX_JUMP_AHEAD_WORDS = 8;
      }
      else if (v === '4'){
        // Aggressive live-read: fastest catch for rapid speakers; very permissive similarity, broad forward window
        // Intent: minimize lag when reader sprints ahead; accept earlier fuzzy alignment
        SIM_THRESHOLD = 0.46;          // slightly below preset 3 to allow earlier partial matches
        MATCH_WINDOW_AHEAD = 240;      // wide look-ahead similar to '3'
        MATCH_WINDOW_BACK  = 40;       // allow some recovery if we overshoot
        STRICT_FORWARD_SIM = 0.62;     // relax strict forward gate further
        MAX_JUMP_AHEAD_WORDS = 22;     // permit larger forward corrections in one step
      }
      else if (v === '3'){
        // Aggressive: lower similarity bar, broader windows, allow larger forward nudges
        SIM_THRESHOLD = 0.48;
        MATCH_WINDOW_AHEAD = 240;
        MATCH_WINDOW_BACK  = 40;
        STRICT_FORWARD_SIM = 0.65;
        MAX_JUMP_AHEAD_WORDS = 18;
      }
      else {
        // Normal/balanced defaults
        SIM_THRESHOLD = 0.55;
        MATCH_WINDOW_AHEAD = 200;
        MATCH_WINDOW_BACK  = 30;
        STRICT_FORWARD_SIM = 0.72;
        MAX_JUMP_AHEAD_WORDS = 12;
      }
      // After applying preset, optionally override with custom tuning profile if enabled
      try {
        if (localStorage.getItem(TUNE_ENABLE_KEY)==='1') {
          const raw = localStorage.getItem(TUNE_KEY);
          if (raw) {
            const cfg = JSON.parse(raw);
            if (cfg && typeof cfg==='object') {
              const n = (x)=> typeof x === 'number' && !isNaN(x);
              if (n(cfg.SIM_THRESHOLD)) SIM_THRESHOLD = cfg.SIM_THRESHOLD;
              if (n(cfg.MATCH_WINDOW_AHEAD)) MATCH_WINDOW_AHEAD = cfg.MATCH_WINDOW_AHEAD;
              if (n(cfg.MATCH_WINDOW_BACK)) MATCH_WINDOW_BACK = cfg.MATCH_WINDOW_BACK;
              if (n(cfg.STRICT_FORWARD_SIM)) STRICT_FORWARD_SIM = cfg.STRICT_FORWARD_SIM;
              if (n(cfg.MAX_JUMP_AHEAD_WORDS)) MAX_JUMP_AHEAD_WORDS = cfg.MAX_JUMP_AHEAD_WORDS;
            }
          }
        }
      } catch {}
      // Reflect live constants in panel if open
      if (_tunePanelEl) populateTuningInputs();
    }
    applyAggro();
    matchAggroSel?.addEventListener('change', (e)=>{
      applyAggro();
      try { localStorage.setItem(AGGRO_KEY, matchAggroSel.value || '2'); } catch {}
    });

    // --- Dev-only tuning panel -------------------------------------------------
    function populateTuningInputs(){
      if (!_tuneInputs) return;
      const setV = (k,v)=>{ if(_tuneInputs[k]) _tuneInputs[k].value = String(v); };
      setV('SIM_THRESHOLD', SIM_THRESHOLD);
      setV('MATCH_WINDOW_AHEAD', MATCH_WINDOW_AHEAD);
      setV('MATCH_WINDOW_BACK', MATCH_WINDOW_BACK);
      setV('STRICT_FORWARD_SIM', STRICT_FORWARD_SIM);
      setV('MAX_JUMP_AHEAD_WORDS', MAX_JUMP_AHEAD_WORDS);
    }
    function applyFromInputs(){
      const getNum = (k)=>{ const v = parseFloat(_tuneInputs[k]?.value); return isFinite(v)?v:undefined; };
      const newVals = {
        SIM_THRESHOLD: getNum('SIM_THRESHOLD'),
        MATCH_WINDOW_AHEAD: getNum('MATCH_WINDOW_AHEAD'),
        MATCH_WINDOW_BACK: getNum('MATCH_WINDOW_BACK'),
        STRICT_FORWARD_SIM: getNum('STRICT_FORWARD_SIM'),
        MAX_JUMP_AHEAD_WORDS: getNum('MAX_JUMP_AHEAD_WORDS')
      };
      if (typeof newVals.SIM_THRESHOLD==='number') SIM_THRESHOLD = newVals.SIM_THRESHOLD;
      if (typeof newVals.MATCH_WINDOW_AHEAD==='number') MATCH_WINDOW_AHEAD = newVals.MATCH_WINDOW_AHEAD;
      if (typeof newVals.MATCH_WINDOW_BACK==='number') MATCH_WINDOW_BACK = newVals.MATCH_WINDOW_BACK;
      if (typeof newVals.STRICT_FORWARD_SIM==='number') STRICT_FORWARD_SIM = newVals.STRICT_FORWARD_SIM;
      if (typeof newVals.MAX_JUMP_AHEAD_WORDS==='number') MAX_JUMP_AHEAD_WORDS = newVals.MAX_JUMP_AHEAD_WORDS;
    }
    function saveTuningProfile(){
      try {
        const payload = {
          SIM_THRESHOLD, MATCH_WINDOW_AHEAD, MATCH_WINDOW_BACK, STRICT_FORWARD_SIM, MAX_JUMP_AHEAD_WORDS,
          savedAt: Date.now()
        };
        localStorage.setItem(TUNE_KEY, JSON.stringify(payload));
        const stamp = _tunePanelEl?.querySelector('[data-tune-status]');
        if (stamp) { stamp.textContent = 'Saved'; setTimeout(()=>{ if(stamp.textContent==='Saved') stamp.textContent=''; }, 1500); }
      } catch {}
    }
    function loadTuningProfile(){
      try {
        const raw = localStorage.getItem(TUNE_KEY);
        if (!raw) return false;
        const cfg = JSON.parse(raw);
        if (cfg && typeof cfg==='object') {
          const n=(x)=> typeof x==='number' && !isNaN(x);
          if (n(cfg.SIM_THRESHOLD)) SIM_THRESHOLD = cfg.SIM_THRESHOLD;
          if (n(cfg.MATCH_WINDOW_AHEAD)) MATCH_WINDOW_AHEAD = cfg.MATCH_WINDOW_AHEAD;
          if (n(cfg.MATCH_WINDOW_BACK)) MATCH_WINDOW_BACK = cfg.MATCH_WINDOW_BACK;
          if (n(cfg.STRICT_FORWARD_SIM)) STRICT_FORWARD_SIM = cfg.STRICT_FORWARD_SIM;
          if (n(cfg.MAX_JUMP_AHEAD_WORDS)) MAX_JUMP_AHEAD_WORDS = cfg.MAX_JUMP_AHEAD_WORDS;
          return true;
        }
      } catch {}
      return false;
    }
    function toggleCustomEnabled(on){
      try { localStorage.setItem(TUNE_ENABLE_KEY, on?'1':'0'); } catch {}
      if (on) {
        if (!loadTuningProfile()) saveTuningProfile();
      } else {
        // Reapply preset to revert
        applyAggro();
      }
    }
    function ensureTuningPanel(){
      if (!DEV_MODE) return;
      if (_tunePanelEl) { _tunePanelEl.style.display='block'; populateTuningInputs(); return; }
      const div = document.createElement('div');
      div.id = 'tuningPanel';
      div.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:9999;background:#111c;border:1px solid #444;padding:8px 10px;font:12px system-ui;color:#eee;box-shadow:0 2px 8px #0009;backdrop-filter:blur(4px);max-width:240px;line-height:1.3;border-radius:6px;';
      div.innerHTML = `\n        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">\n          <strong style="font-size:12px;">Matcher Tuning</strong>\n          <button data-close style="background:none;border:0;color:#ccc;cursor:pointer;font-size:14px;">✕</button>\n        </div>\n        <div style="display:grid;grid-template-columns:1fr 60px;gap:4px;">\n          <label style="display:contents;">SIM<th style="display:none"></th><input data-k="SIM_THRESHOLD" type="number" step="0.01" min="0" max="1"></label>\n          <label style="display:contents;">Win+<input data-k="MATCH_WINDOW_AHEAD" type="number" step="10" min="10" max="1000"></label>\n          <label style="display:contents;">Win-<input data-k="MATCH_WINDOW_BACK" type="number" step="1" min="0" max="200"></label>\n          <label style="display:contents;">Strict<input data-k="STRICT_FORWARD_SIM" type="number" step="0.01" min="0" max="1"></label>\n          <label style="display:contents;">Jump<input data-k="MAX_JUMP_AHEAD_WORDS" type="number" step="1" min="1" max="120"></label>\n        </div>\n        <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">\n          <button data-apply style="flex:1 1 auto;">Apply</button>\n          <button data-save style="flex:1 1 auto;">Save</button>\n        </div>\n        <label style="display:flex;align-items:center;gap:4px;margin-top:4px;">\n          <input data-enable type="checkbox"> Override presets\n        </label>\n        <div data-tune-status style="font-size:11px;color:#8ec;margin-top:2px;height:14px;"></div>\n        <div style="font-size:10px;color:#999;margin-top:4px;">Ctrl+Alt+T to re-open</div>\n      `;
      document.body.appendChild(div);
      _tunePanelEl = div;
      _tuneInputs = {};
      Array.from(div.querySelectorAll('input[data-k]')).forEach(inp => {
        _tuneInputs[inp.getAttribute('data-k')] = inp;
      });
      populateTuningInputs();
      // Load existing saved (but don't auto-enable)
      try {
        const raw = localStorage.getItem(TUNE_KEY);
        if (raw) {
          const cfg = JSON.parse(raw);
          if (cfg && typeof cfg==='object') {
            for (const k of Object.keys(_tuneInputs)) if (k in cfg && typeof cfg[k]==='number') _tuneInputs[k].value = cfg[k];
          }
        }
      } catch {}
      // Reflect enabled
      try { const en = localStorage.getItem(TUNE_ENABLE_KEY)==='1'; const cb = div.querySelector('input[data-enable]'); if (cb) cb.checked = en; } catch {}
      div.addEventListener('click', (e)=>{
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
        if (t.matches('[data-close]')) { div.style.display='none'; }
        else if (t.matches('[data-apply]')) { applyFromInputs(); populateTuningInputs(); }
        else if (t.matches('[data-save]')) { applyFromInputs(); saveTuningProfile(); }
      });
      const enableCb = div.querySelector('input[data-enable]');
      if (enableCb) enableCb.addEventListener('change', ()=>{ toggleCustomEnabled(enableCb.checked); if (enableCb.checked){ applyFromInputs(); saveTuningProfile(); } });
      // Live update on input (without saving)
      div.querySelectorAll('input[data-k]').forEach(inp=>{
        inp.addEventListener('input', ()=>{ applyFromInputs(); });
      });
    }
    // Keybinding to toggle panel (dev mode only)
    window.addEventListener('keydown', (e)=>{
      if (e.ctrlKey && e.altKey && e.key.toLowerCase()==='t') { if (DEV_MODE){ ensureTuningPanel(); e.preventDefault(); } }
    });
    // Auto-create if dev hash present
    if (DEV_MODE && (location.hash.includes('devtune') || location.search.includes('devtune=1'))) setTimeout(()=> ensureTuningPanel(), 300);

    // If override enabled on load, ensure it applies AFTER initial preset
    setTimeout(()=>{
      try {
        if (localStorage.getItem(TUNE_ENABLE_KEY)==='1') {
          // Re-run applyAggro to force preset then override
          applyAggro();
        }
      } catch {}
    }, 50);

    // Apply motion smoothness mapping now and on change
  // TP: motion-smoothness
  function applySmooth(){
      const v = (motionSmoothSel?.value || 'balanced');
      // adjust soft scroll tunables used in advanceByTranscript and scrollToCurrentIndex
      if (v === 'stable'){
        window.__TP_SCROLL = { DEAD: 22, THROTTLE: 280, FWD: 80, BACK: 30, EASE_STEP: 60, EASE_MIN: 12 };
      } else if (v === 'responsive'){
        // less jitter: higher deadband/throttle, smaller back steps
        window.__TP_SCROLL = { DEAD: 20, THROTTLE: 240, FWD: 110, BACK: 50, EASE_STEP: 96, EASE_MIN: 6 };
      } else {
        // balanced
        window.__TP_SCROLL = { DEAD: 22, THROTTLE: 260, FWD: 96, BACK: 40, EASE_STEP: 80, EASE_MIN: 10 };
      }
    }
    applySmooth();
    motionSmoothSel?.addEventListener('change', ()=>{
      applySmooth();
      try { localStorage.setItem(SMOOTH_KEY, motionSmoothSel.value || 'balanced'); } catch {}
    });

    // Try to list devices
    populateDevices();
  setStatus('Ready.');
    // Fun extras (Konami theme, meter party, advanced tools, :roar) — call once at the very end
  try { (window.__eggs?.installEasterEggs || installEasterEggs)(); } catch {}
    // CK watermark egg (toggleable)
  try { (window.__eggs?.installCKEgg || installCKEgg)(); } catch {}

    // Run tiny self-checks to catch regressions fast
    try { setTimeout(runSelfChecks, 0); } catch {}

    // Keep bottom padding/spacer responsive to viewport changes
    try { window.addEventListener('resize', applyBottomPad, { passive: true }); } catch {}
    try { window.addEventListener('resize', updateEndSpacer, { passive: true }); } catch {}
    try {
      const _v = document.getElementById('viewer');
      if (window.ResizeObserver && _v) {
        const ro = new ResizeObserver(() => { try { updateEndSpacer(); } catch {} });
        ro.observe(_v);
        window.__tpSpacerRO = ro;
      }
    } catch {}
    // Update debug chip on scroll
    try { viewer?.addEventListener('scroll', () => { updateDebugPosChip(); }, { passive:true }); } catch {}
    // Initial debug chip paint
    try { updateDebugPosChip(); } catch {}
  }
  // Ensure placeholder render if script empty
  try {
    if (scriptEl && !scriptEl.innerHTML) {
      renderScript(editor?.value || '');
    }
  } catch {}
  console.log('[TP-Pro] _initCore end');

  // Calm Mode: CSS + guardrails to stabilize geometry and suppress external scrolls
  try {
    if (window.__TP_CALM && !window.__TP_CALM_CSS_INJECTED) {
      window.__TP_CALM_CSS_INJECTED = true;
      try {
        const st = document.createElement('style');
        st.setAttribute('data-tp-calm', '1');
        st.textContent = `
          #viewer, html, body { scroll-behavior: auto !important; overscroll-behavior: contain; }
          #viewer, #viewer * { scroll-snap-type: none !important; scroll-snap-align: none !important; }
        `;
        document.head.appendChild(st);
      } catch {}

      // Keep overlays from perturbing geometry
      try {
        ['#hud','#help','#debug','#devpanel','[data-tp-hud]'].forEach(sel => {
          document.querySelectorAll(sel).forEach(n => { try { n.style.position = 'fixed'; } catch {} });
        });
      } catch {}

      // Optional: neutralize external scrollIntoView while CALM
      try {
        if (!window.__TP_SCROLL_INTO_VIEW_ORIG && Element && Element.prototype && Element.prototype.scrollIntoView) {
          window.__TP_SCROLL_INTO_VIEW_ORIG = Element.prototype.scrollIntoView;
          Element.prototype.scrollIntoView = function(...args){
            try {
              if (!window.__TP_CALM) return window.__TP_SCROLL_INTO_VIEW_ORIG.apply(this, args);
              if (window.__TP_DEV) console.debug('[TP-Pro Calm] scrollIntoView suppressed for', this);
            } catch {}
          };
        }
      } catch {}
    }
  } catch {}

  // Calm Mode: highlight observer as a second trigger for smooth anchoring
  try {
    if (window.__TP_CALM) {
      const root = document.getElementById('script')
        || document.querySelector('#viewer .script')
        || document.getElementById('viewer')
        || document.body;
      const sc = (window.__TP_SCROLLER
        || document.getElementById('viewer')
        || document.scrollingElement
        || document.documentElement
        || document.body);

      const isActive = (el) => !!(el && el.classList && (el.classList.contains('current') || el.classList.contains('active')))
        || (el && typeof el.getAttribute === 'function' && (el.getAttribute('data-active') === '1' || el.getAttribute('aria-current') === 'true'));
      const getActive = () => root && root.querySelector && root.querySelector('.current, .active, [data-active="1"], .tp-active, .spoken, [aria-current="true"]');
  const anchor = (el) => { if (!el) return; try { window.SCROLLER?.request({ el, priority: 8, src: 'system', reason: 'anchor' }); } catch {} };

      try { anchor(getActive()); } catch {}
      try {
        new MutationObserver(() => {
          try {
            const cand = getActive();
            if (cand) anchor(cand);
          } catch {}
        }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class','data-active','aria-current'] });
      } catch {}
    }
  } catch (e) { try { console.warn('[TP-Pro Calm] highlight observer failed', e); } catch {} }

  /* ──────────────────────────────────────────────────────────────
   * Roles + Legend
   * ────────────────────────────────────────────────────────────── */
  function loadRoles(){
    try { return Object.assign({}, ROLE_DEFAULTS, JSON.parse(localStorage.getItem(ROLES_KEY)||'{}')); }
    catch { return {...ROLE_DEFAULTS}; }
  }
  function saveRoles(map){ localStorage.setItem(ROLES_KEY, JSON.stringify(map)); }

  function syncRoleInputs(){
    if (nameS1) nameS1.value = ROLES.s1.name; if (colorS1) colorS1.value = ROLES.s1.color;
    if (nameS2) nameS2.value = ROLES.s2.name; if (colorS2) colorS2.value = ROLES.s2.color;
    if (nameG1) nameG1.value = ROLES.g1.name; if (colorG1) colorG1.value = ROLES.g1.color;
    if (nameG2) nameG2.value = ROLES.g2.name; if (colorG2) colorG2.value = ROLES.g2.color;
    applyRoleCssVars();
    broadcastSpeakerColors();
    broadcastSpeakerNames();
  }
  function onRoleChange(){
    ROLES.s1.name = nameS1?.value || ROLES.s1.name; ROLES.s1.color = colorS1?.value || ROLES.s1.color;
    ROLES.s2.name = nameS2?.value || ROLES.s2.name; ROLES.s2.color = colorS2?.value || ROLES.s2.color;
    ROLES.g1.name = nameG1?.value || ROLES.g1.name; ROLES.g1.color = colorG1?.value || ROLES.g1.color;
    ROLES.g2.name = nameG2?.value || ROLES.g2.name; ROLES.g2.color = colorG2?.value || ROLES.g2.color;
    saveRoles(ROLES);
    updateLegend();
    renderScript(editor.value);
    applyRoleCssVars();
    broadcastSpeakerColors();
    broadcastSpeakerNames();
  }
  function updateLegend(){
    if (!legendEl) return; legendEl.innerHTML = '';
    for (const key of ROLE_KEYS){
      const item = ROLES[key];
      const tag = document.createElement('span');
      tag.className = 'tag';
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = item.color;
      const name = document.createElement('span'); name.textContent = item.name;
      tag.appendChild(dot); tag.appendChild(name);
      legendEl.appendChild(tag);
    }
  }
  function safeColor(c){
    c = String(c||'').trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
    if (/^rgba?\(/i.test(c)) return c;
    if (/^[a-z]{3,20}$/i.test(c)) return c; // simple keyword
    return '';
  }
  function roleStyle(key){
    const item = ROLES[key] || ROLES.s1;
    return `color:${item.color}; font-size:inherit; line-height:inherit;`;
  }

  /* ──────────────────────────────────────────────────────────────
   * Markup + Render
   * ────────────────────────────────────────────────────────────── */
 function normWord(w){ return String(w).toLowerCase().replace(/[^a-z0-9']/g,''); }
function splitWords(t){ return String(t).toLowerCase().split(/\s+/).map(normWord).filter(Boolean); }

// TP: scroll-current-index
function scrollToCurrentIndex(){
  if (!paraIndex.length) return;
  // End-of-script guard: stop further scrolling when at bottom
  try { if (atBottom(viewer)) return; } catch {}
  const p = paraIndex.find(p => currentIndex >= p.start && currentIndex <= p.end) || paraIndex[paraIndex.length-1];
  // Highlight active paragraph (optional)
  paraIndex.forEach(pi => pi.el.classList.toggle('active', pi === p));
  // Center-ish scroll
  const target = Math.max(0, p.el.offsetTop - (viewer.clientHeight * 0.40));
  // Route through SCROLLER single authority
  try { window.SCROLLER?.request({ y: target, priority: 6, src: 'system', reason: 'advanceEase' }); } catch {}
  if (typeof markAdvance === 'function') markAdvance(); else _lastAdvanceAt = performance.now();
  if (typeof debug === 'function') debug({ tag:'scroll', top: target });
  {
  const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
  const ratio = max ? (target / max) : 0;
  sendToDisplay({ type: 'scroll', top: target, ratio });
  }
}
// Install HUD (tilde to toggle). Safe if file missing.
try { window.__tpHud = window.__tpInstallHUD && window.__tpInstallHUD({ hotkey: '~' }); } catch {}
// Signal that core init function is now defined; publish to a temp handle, then swap stub
try {
  window.__tpRealCore = _initCore;
  __tpBootPush('after-_initCore-def');
  window.__tpResolveCoreReady && window.__tpResolveCoreReady();
  window.__tpSetCoreRunnerReady && window.__tpSetCoreRunnerReady();
  // Replace stub with the real core
  window._initCore = _initCore;
} catch {}

// Ensure init runs (was previously implicit). Guard against double-run.
try { __tpBootPush('pre-init-scheduling'); } catch {}
try {
  if (!window.__tpInitScheduled) {
    window.__tpInitScheduled = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { try { init(); } catch(e){ console.error('init failed', e); } });
    } else {
      Promise.resolve().then(()=>{ try { init(); } catch(e){ console.error('init failed', e); } });
    }
  }
} catch {}
try { __tpBootPush('init-scheduling-exited'); } catch {}

// Hard fallback: if init hasn't marked success soon, force-call it (guards against missed events or earlier silent exceptions)
setTimeout(()=>{
  try {
    if (!window.__tpInitSuccess) {
      console.warn('[TP-Pro] Late init fallback firing');
      if (typeof init === 'function') init();
    }
  } catch (e) { console.error('[TP-Pro] Late init fallback failed', e); }
}, 1500);
try { __tpBootPush('late-init-fallback-scheduled'); } catch {}

// Dump boot trace if user presses Ctrl+Alt+B (debug aid)
window.addEventListener('keydown', (e)=>{
  if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'b') {
    try { console.log('[TP-Pro] Boot trace:', (window.__TP_BOOT_TRACE||[]).map(x=>x.m)); } catch {}
  }
});

// Conditionally install last‑resort delegation ONLY if core buttons appear unwired after init grace period.
setTimeout(() => {
  try {
    if (window.__tpInitSuccess) return; // direct wiring succeeded, skip fallback
    // Heuristic: if openDisplayBtn exists and has no inline onclick AND we haven't flagged init success
    const btn = document.getElementById('openDisplayBtn');
    if (!btn) return; // no need
    const already = btn.__listenerAttached; // we can mark in init later if desired
    if (already) return; // direct wiring succeeded
    // Light probe: synthesize a custom event property after adding direct listener (future refactor)
    let delegated = false;
    const fallback = (e) => {
      const id = e.target?.id;
      try {
        if (id === 'openDisplayBtn' && typeof openDisplay === 'function') { openDisplay(); }
        else if (id === 'closeDisplayBtn' && typeof closeDisplay === 'function') { closeDisplay(); }
        else if (id === 'presentBtn' && typeof openDisplay === 'function') { openDisplay(); }
        else if (id === 'micBtn') { requestMic(); }
      } catch(err){ console.warn('Delegated handler error', err); }
    };
    document.addEventListener('click', fallback, { capture:true });
    delegated = true;
    if (delegated) console.warn('[TP-Pro] Fallback delegation installed (direct button wiring not detected).');
  } catch {}
}, 800);

// Gentle PID-like catch-up controller
  function tryStartCatchup(){
  if (!speechOn) { try{ __scrollCtl?.stopAutoCatchup?.(); }catch{} return; }
  if (!__scrollCtl?.startAutoCatchup || !viewer) return;
  // If auto-scroll is running, skip catch-up to avoid conflicts
  if (autoTimer) return;
  const markerTop = () => (viewer?.clientHeight || 0) * (typeof MARKER_PCT === 'number' ? MARKER_PCT : 0.36);
  const getTargetY = () => markerTop();
  const getAnchorY = () => {
    try {
      // Prefer most-visible paragraph from IntersectionObserver
  const vis = __anchorObs?.mostVisibleEl?.() || null;
      if (vis) {
        const rect = vis.getBoundingClientRect();
        const vRect = viewer.getBoundingClientRect();
        return rect.top - vRect.top; // Y relative to viewer
      }
      // Otherwise, find active paragraph (as set in scrollToCurrentIndex)
      const activeP = (scriptEl || viewer)?.querySelector('p.active') || null;
      if (activeP) {
        const rect = activeP.getBoundingClientRect();
        const vRect = viewer.getBoundingClientRect();
        return rect.top - vRect.top; // Y relative to viewer
      }
      // Fallback: approximate using currentIndex paragraph element if available
      const p = (paraIndex || []).find(p => currentIndex >= p.start && currentIndex <= p.end) || (paraIndex||[])[0];
      if (p?.el) {
        const rect = p.el.getBoundingClientRect();
        const vRect = viewer.getBoundingClientRect();
        return rect.top - vRect.top;
      }
    } catch {}
    return markerTop();
  };
  const scrollBy = (dy) => {
    try {
      viewer.scrollTop = Math.max(0, Math.min(viewer.scrollTop + dy, viewer.scrollHeight));
      const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
      const ratio = max ? (viewer.scrollTop / max) : 0;
      sendToDisplay({ type:'scroll', top: viewer.scrollTop, ratio });
    } catch {}
  };
  try { __scrollCtl.stopAutoCatchup(); } catch {}
  __scrollCtl.startAutoCatchup(getAnchorY, getTargetY, scrollBy);
}

// Heuristic gate: only run catch-up if the anchor (current line) sits low in the viewport
let _lowStartTs = 0;
function maybeCatchupByAnchor(anchorY, viewportH){
  try {
    if (!speechOn) { _lowStartTs = 0; try{ __scrollCtl?.stopAutoCatchup?.(); }catch{}; return; }
    if (!__scrollCtl?.startAutoCatchup || !viewer) return;
    // Don't start while auto-scroll is active
    if (autoTimer) { _lowStartTs = 0; try{ __scrollCtl.stopAutoCatchup(); }catch{}; return; }
    const h = Math.max(1, Number(viewportH)||viewer.clientHeight||1);
    const ratio = anchorY / h; // 0=top, 1=bottom
    if (ratio > 0.65){
      if (!_lowStartTs) _lowStartTs = performance.now();
      if (performance.now() - _lowStartTs > 500){
        // Start (or keep) the catch-up loop with our standard closures
        tryStartCatchup();
      }
    } else {
      _lowStartTs = 0;
      // Save CPU/jitter when we don't need it
      try { __scrollCtl.stopAutoCatchup(); } catch {}
    }
  } catch {}
}


// Matcher constants and helpers (single source of truth)
let _lastMatchAt = 0;
let _lastCorrectionAt = 0;
let _lastAdvanceAt = performance.now(); // stall-recovery timestamp
// Throttle interim matches; how many recent spoken tokens to consider
const MATCH_INTERVAL_MS = 120;
const SPOKEN_N = 8;
// Window relative to currentIndex to search
  // Tunables (let so we can adjust via the “Match aggressiveness” select)
  let MATCH_WINDOW_BACK  = 30;   // how far back we search around the current index
  let MATCH_WINDOW_AHEAD = 200;  // how far forward we search
  let SIM_THRESHOLD      = 0.55; // minimum similarity to accept a match (0..1)
// Similarity thresholds and motion clamps
let STRICT_FORWARD_SIM = 0.72;   // extra gate when skipping forward a lot
let MAX_JUMP_AHEAD_WORDS = 12;   // max words to bump when pushing forward
// Scroll correction tuning
// TP: marker-percent — forward bias the reading line slightly to reduce lag
const MARKER_PCT = 0.36;
// Gentler motion to avoid jumpiness
let DEAD_BAND_PX = 18;          // ignore small errors
// NOTE: Historical naming mismatch: some earlier code / docs referenced CORRECTION_MIN_INTERVAL_MS.
// We keep the original internal name CORRECTION_MIN_MS and provide an alias to avoid ReferenceErrors.
let CORRECTION_MIN_MS = 240;    // throttle corrections
// Backwards-compatible alias (do NOT reassign directly elsewhere)
try { Object.defineProperty(window, 'CORRECTION_MIN_INTERVAL_MS', { get(){ return CORRECTION_MIN_MS; }, set(v){ CORRECTION_MIN_MS = Number(v)||CORRECTION_MIN_MS; } }); } catch {}
let MAX_FWD_STEP_PX = 96;       // clamp forward step size
let MAX_BACK_STEP_PX = 140;     // clamp backward step size
// Anti-jitter: remember last move direction (+1 fwd, -1 back, 0 none)
let _lastMoveDir = 0;

// Bottom guard helper: true if scroller is at/near bottom
function atBottom(container){
  try {
    if (!container) return false;
    return (container.scrollTop + container.clientHeight) >= (container.scrollHeight - 4);
  } catch { return false; }
}

// End-game easing: slightly more permissive near the end of script
function endGameAdjust(idx, sim){
  try {
    const nearEnd = ((scriptWords?.length || 0) - (idx || 0)) < 30;
    return nearEnd ? Math.min(1, sim + 0.03) : sim;
  } catch { return sim; }
}

// Coverage-based soft advance to avoid stalls when a short line is consumed
let __tpStag = { vIdx: -1, since: performance.now() };
const STALL_MS = 1800;       // ~1.8s feels good in speech
const COV_THRESH = 0.82;     // % of tokens matched in order
const NEXT_SIM_FLOOR = 0.68; // allow slightly lower sim to prime next line
// Stall instrumentation state
let __tpStall = { reported: false };
// Lookahead hop stabilization state
let __tpHopGate = { idx: -1, hits: 0, firstAt: 0 };

// Frontier tracker (EMA-smoothed with median-of-3 prefilter)
let __tpFrontier = { idx: -1, alpha: 0.5, buf: [] };

// Persistent spoken tail tracker and per-line progress tracker
let __tpPrevTail = [];
let __tpLineTracker = { vIdx: -1, pos: 0, len: 0, line: [] };
function __resetLineTracker(vIdx, lineTokens){
  try {
    __tpLineTracker = { vIdx, pos: 0, len: (lineTokens?.length||0), line: Array.isArray(lineTokens)? lineTokens.slice() : [] };
  } catch { __tpLineTracker = { vIdx, pos: 0, len: 0, line: [] }; }
}
function __feedLineTracker(newTokens){
  try {
    if (!Array.isArray(newTokens) || !newTokens.length) return;
    const lookMax = (typeof window.__tpLookaheadMax === 'number' ? window.__tpLookaheadMax : 3) || 3;
    for (const t of newTokens){
      for (let look = 0; look < lookMax; look++){
        const want = __tpLineTracker.line[__tpLineTracker.pos + look];
        if (want === t){ __tpLineTracker.pos += (look + 1); break; }
      }
      if (__tpLineTracker.pos >= __tpLineTracker.len) { __tpLineTracker.pos = __tpLineTracker.len; break; }
    }
    if (__tpLineTracker.pos > __tpLineTracker.len) __tpLineTracker.pos = __tpLineTracker.len;
  } catch {}
}
function __tailDelta(prev, cur){
  try {
    const max = Math.min(prev.length|0, cur.length|0);
    let overlap = 0;
    for (let r = max; r >= 0; r--){
      let ok = true;
      for (let i = 0; i < r; i++){
        if (prev[prev.length - r + i] !== cur[i]){ ok = false; break; }
      }
      if (ok){ overlap = r; break; }
    }
    return cur.slice(overlap);
  } catch { return cur || []; }
}

// Rough fuzzy match: allow <=1 edit for 4+ char tokens
function __editDistanceAtMost1(a, b){
  try {
    if (a === b) return true;
    const la = a.length|0, lb = b.length|0;
    const d = Math.abs(la - lb);
    if (d > 1) return false;
    // Same length: allow one substitution
    if (d === 0){
      let diff = 0; for (let i=0;i<la;i++){ if (a[i] !== b[i]){ diff++; if (diff > 1) return false; } }
      return diff <= 1;
    }
    // Length diff 1: allow single insertion/deletion via two-pointer scan
    let i=0,j=0, edits=0; const long = la>lb?a:b, short = la>lb?b:a;
    while (i<long.length && j<short.length){
      if (long[i] === short[j]){ i++; j++; }
      else { edits++; if (edits>1) return false; i++; }
    }
    return true; // trailing char allowed
  } catch { return false; }
}
function __roughMatchesAnyToken(token, lineTokens){
  try {
    if (!token) return false;
    const lt = Array.isArray(lineTokens) ? lineTokens : [];
    // Fast exact match first
    const set = new Set(lt);
    if (set.has(token)) return true;
    if (token.length < 3) return false;
    for (const s of lt){
      if (!s) continue;
      const dl = Math.abs((s.length|0) - (token.length|0));
      if (dl > 1) continue;
      if (s.length >= 4 && token.length >= 4 && __editDistanceAtMost1(s, token)) return true;
    }
    return false;
  } catch { return true; }
}

function tokenCoverage(lineTokens, tailTokens){
  try {
    if (!Array.isArray(lineTokens) || !lineTokens.length) return 0;
    if (!Array.isArray(tailTokens) || !tailTokens.length) return 0;
    // Gate short shards from tail to avoid fake coverage bumps
    let tail = tailTokens.filter(t => t && t.length >= 3);
    // Optional: ignore tokens that don't roughly match any token on the candidate line (helps on messy ASR)
    try { tail = tail.filter(t => __roughMatchesAnyToken(t, lineTokens)); } catch {}
    if (!tail.length) return 0;
    let i = 0, hit = 0;
    for (const tok of lineTokens){
      while (i < tail.length && tail[i] !== tok) i++;
      if (i < tail.length){ hit++; i++; }
    }
    return hit / Math.max(1, lineTokens.length);
  } catch { return 0; }
}

// Detect enumeration "list mode": 3 consecutive content tokens (high-IDF, non-stop)
function __isContentToken(t){
  try {
    if (!t) return false;
    if (__STOP.has(t)) return false;
    if (typeof __JUNK?.has === 'function' && __JUNK.has(t)) return false;
    const idf = __idf(t);
    return idf >= 1.2; // heuristic threshold for distinctiveness
  } catch { return false; }
}
function detectListMode(tokens){
  try {
    if (!Array.isArray(tokens) || tokens.length < 3) return false;
    let streak = 0;
    for (const t of tokens){
      if (__isContentToken(t)) { streak++; if (streak >= 3) return true; }
      else streak = 0;
    }
    return false;
  } catch { return false; }
}

// Cheap suffix hit using last k tokens: Jaccard + substring containment
function suffixHit(lineTokens, tailTokens, k = 6){
  try {
    const A = (Array.isArray(lineTokens) ? lineTokens : []).slice(-k);
    const B = (Array.isArray(tailTokens) ? tailTokens : []).slice(-k);
    if (!A.length || !B.length) return false;
    const setA = new Set(A), setB = new Set(B);
    let inter = 0; for (const t of setA) if (setB.has(t)) inter++;
    const jacc = inter / Math.max(1, (setA.size + setB.size - inter));
    if (jacc >= 0.8) return true;
    const L = A.join(' '), T = B.join(' ');
    if (!L || !T) return false;
    return L.includes(T) || T.includes(L);
  } catch { return false; }
}

function maybeSoftAdvance(bestIdx, bestSim, spoken){
  try {
    // Find current virtual line context
    const vList = __vParaIndex && __vParaIndex.length ? __vParaIndex : null;
    if (!vList) return { idx: bestIdx, sim: bestSim, soft: false };
    const vIdx = vList.findIndex(v => bestIdx >= v.start && bestIdx <= v.end);
    if (vIdx < 0) return { idx: bestIdx, sim: bestSim, soft: false };

    // Update stagnation tracker (stagnant if staying within same virtual line)
    const now = performance.now();
    if (vIdx !== __tpStag.vIdx){ __tpStag = { vIdx, since: now }; }
    const stagnantMs = now - __tpStag.since;

    // Compute coverage of current virtual line by spoken tail
    const lineTokens = scriptWords.slice(vList[vIdx].start, vList[vIdx].end + 1);
    // List-mode detection from current spoken tail
    const listMode = detectListMode(spoken.slice(-6));
    try { window.__tpLookaheadMax = listMode ? 4 : 3; } catch { /* no-op */ }
    let cov = 0;
    try {
      if (__tpLineTracker.vIdx === vIdx){
        cov = Math.min(1, (__tpLineTracker.pos || 0) / Math.max(1, __tpLineTracker.len || 1));
      } else {
        cov = tokenCoverage(lineTokens, spoken);
      }
    } catch { cov = tokenCoverage(lineTokens, spoken); }
    // Early soft-advance window (≈700–900ms) based on coverage or suffix hit
    const SOFT_EARLY_MS = 850;
    const COV_T   = listMode ? 0.65 : COV_THRESH;
    const STALL_T = listMode ? 700  : STALL_MS;
  const suffix = suffixHit(lineTokens, spoken, 6);
  if (suffix) {
    try { window.__tpLastSuffixHitAt = performance.now(); } catch {}
    try { const b = (window.__tpSuffixBuf ||= []); const now = performance.now(); b.push(now); while (b.length && now - b[0] > 2000) b.shift(); } catch {}
    try { if (typeof debug==='function') debug({ tag:'SUFFIX_HIT', idx: bestIdx, k: 6, ok: true }); } catch {}
  }
    const earlyOk = (stagnantMs >= SOFT_EARLY_MS) && (cov >= COV_T || suffix);
    const lateOk  = (stagnantMs >= STALL_T)       && (cov >= COV_T);
    if (earlyOk || lateOk){
      // Probe the next few virtual lines for a prefix match
      const maxProbe = Math.min(vList.length - 1, vIdx + 4);
      for (let j = vIdx + 1; j <= maxProbe; j++){
        const v = vList[j];
        const win = scriptWords.slice(v.start, Math.min(v.start + spoken.length, v.end + 1));
        const sim = _sim(spoken, win);
        if (sim >= NEXT_SIM_FLOOR){
          // Stabilize lookahead hop: for larger hops require two consecutive frames (>=250ms total) with high sim
          const dist = Math.abs(v.start - bestIdx);
          // Require at least one non-stopword among last-4 tail tokens for 1-4 word tails
          const hasContent = (function(){
            try {
              const tail = spoken.slice(-4);
              return tail.some(t => !__STOP.has(t) && !(__JUNK?.has?.(t)));
            } catch { return true; }
          })();
          const nowMs = performance.now();
          const highSim = sim >= 0.90;
          let gateOk = true;
          if (dist > 4){
            gateOk = false;
            if (!hasContent){
              try { if (typeof debug==='function') debug({ tag:'match:soft-advance:gate', why:'no-content', to:v.start, sim:+sim.toFixed(3) }); } catch {}
            } else if (__tpHopGate.idx === v.start && highSim){
              if (__tpHopGate.hits >= 1 && (nowMs - __tpHopGate.firstAt) >= 250){ gateOk = true; }
              else {
                __tpHopGate.hits = Math.max(1, __tpHopGate.hits);
                try { if (typeof debug==='function') debug({ tag:'match:soft-advance:gate', why:'wait', to:v.start, hits:__tpHopGate.hits, elapsed: Math.floor(nowMs - __tpHopGate.firstAt) }); } catch {}
              }
            } else if (highSim) {
              __tpHopGate = { idx: v.start, hits: 1, firstAt: nowMs };
              try { if (typeof debug==='function') debug({ tag:'match:soft-advance:gate', why:'start', to:v.start, sim:+sim.toFixed(3) }); } catch {}
            } else {
              // reset when not high-sim
              __tpHopGate = { idx: -1, hits: 0, firstAt: 0 };
            }
          }
          if (!gateOk) continue;
          // reset hop gate upon passing
          try {
            const hold = (__tpHopGate && __tpHopGate.firstAt) ? Math.floor(now - __tpHopGate.firstAt) : 0;
            if (typeof debug==='function') debug({ tag:'LOOKAHEAD_LATCH', from: bestIdx, to: v.start, hold: hold + 'ms', sim: +sim.toFixed(2) });
          } catch {}
          __tpHopGate = { idx: -1, hits: 0, firstAt: 0 };
          try { if (typeof debug==='function') debug({ tag:'match:soft-advance', from: bestIdx, to: v.start, cov: +cov.toFixed(2), suffix, sim: +sim.toFixed(3), stagnantMs: Math.floor(stagnantMs), early: earlyOk }); } catch {}
          // reset stagnation to the new virtual line
          __tpStag = { vIdx: j, since: now };
          return { idx: v.start, sim, soft: true };
        }
      }
    }
    return { idx: bestIdx, sim: bestSim, soft: false };
  } catch { return { idx: bestIdx, sim: bestSim, soft: false }; }
}

// Quick fuzzy contain check (Unicode-aware normalization)
function _normQuick(s){
  try { return String(s||'').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim(); }
  catch { // fallback for engines lacking Unicode property escapes
    return String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  }
}
function fuzzyAdvance(textSlice, spoken){
  const A = _normQuick(textSlice);
  const rawB = _normQuick(spoken);
  const B = rawB.length > 80 ? rawB.slice(-80) : rawB; // focus on tail
  return A.indexOf(B); // >= 0 if found
}
function getUpcomingTextSlice(maxWords = 120){
  try {
    const end = Math.min(scriptWords.length, currentIndex + Math.max(1, maxWords));
    return (scriptWords.slice(currentIndex, end) || []).join(' ');
  } catch { return ''; }
}
// expose for quick experiments in console/debug tools
try { Object.assign(window, { fuzzyAdvance, getUpcomingTextSlice }); } catch {}

// Fast overlap score: count of shared tokens (case-normalized by normTokens already)
function _overlap(a, b){
  if (!a?.length || !b?.length) return 0;
  const set = new Set(b);
  let n = 0; for (const w of a) if (set.has(w)) n++;
  return n;
}

// Token similarity in 0..1 using Dice coefficient (robust and cheap)
function _sim(a, b){
  if (!a?.length || !b?.length) return 0;
  const overlap = _overlap(a, b);
  return (2 * overlap) / (a.length + b.length);
}

// Speech commit hook: use geometry-based targeting only in Calm Mode
function legacyOnSpeechCommit(activeEl){
  // No-op by default: non-Calm keeps existing behavior already executed in advanceByTranscript
}
function onSpeechCommit(activeEl){
  try {
    if (!window.__TP_CALM) return legacyOnSpeechCommit(activeEl);
    // Route through ScrollManager single authority
    window.SCROLLER?.request({ el: activeEl, priority: 10, src: 'speech', reason: 'commit' });
  } catch {}
}

// Advance currentIndex by trying to align recognized words to the upcoming script words
// TP: advance-by-transcript
function advanceByTranscript(transcript, isFinal){
  // Hard gate: no matching when speech sync is off
  if (!speechOn) { try{ if (typeof debug==='function') debug({ tag:'match:gate', reason:'speech-off' }); }catch{} return; }
  // Adopt current smoothness settings if provided
  const SC = (window.__TP_SCROLL || { DEAD: DEAD_BAND_PX, THROTTLE: CORRECTION_MIN_MS, FWD: MAX_FWD_STEP_PX, BACK: MAX_BACK_STEP_PX });
  DEAD_BAND_PX = SC.DEAD; CORRECTION_MIN_MS = SC.THROTTLE; MAX_FWD_STEP_PX = SC.FWD; MAX_BACK_STEP_PX = SC.BACK;
  if (!scriptWords.length) return;
  const now = performance.now();
  if (now - _lastMatchAt < MATCH_INTERVAL_MS && !isFinal) return;
  _lastMatchAt = now;

  const spokenAll = normTokens(transcript);
  const spoken    = spokenAll.slice(-SPOKEN_N);
  if (!spoken.length) return;

  // (tracker feeding happens after selecting bestIdx)

  // Search a band around currentIndex with dynamic forward window if tail looks common
  let windowAhead = MATCH_WINDOW_AHEAD;
  try {
    const TAIL_N = 3; // examine last 3 tokens for duplication nearby
    if (spoken.length >= TAIL_N) {
      const tail = spoken.slice(-TAIL_N);
      const bStart = Math.max(0, currentIndex - 80);
      const bEnd   = Math.min(scriptWords.length, currentIndex + Math.min(MATCH_WINDOW_AHEAD, 160));
      let occ = 0; let lastPos = -9999; let tightSpan = 0;
      for (let i = bStart; i <= bEnd - TAIL_N; i++){
        if (scriptWords[i] === tail[0] && scriptWords[i+1] === tail[1] && scriptWords[i+2] === tail[2]){
          occ++;
          if (lastPos > 0) tightSpan += Math.min(200, i - lastPos);
          lastPos = i;
          if (occ >= 4) break; // enough evidence
        }
      }
      if (occ >= 3) {
        const avgGap = (occ > 1) ? (tightSpan / (occ - 1)) : 9999;
        // Consider it “common nearby” if appears ≥3x and average gap is small
        if (avgGap < 60) {
          const prev = windowAhead;
          windowAhead = Math.max(20, Math.min(windowAhead, 40));
          try { if (typeof debug === 'function') debug({ tag:'match:window-tune', reason:'tail-common', tail: tail.join(' '), occ, avgGap, windowAheadPrev: prev, windowAhead }); } catch {}
        }
      }
    }
  } catch {}
  const start = Math.max(0, currentIndex - MATCH_WINDOW_BACK);
  const end   = Math.min(scriptWords.length, currentIndex + windowAhead);

  // Build candidates with a fast overlap filter first
  const candidates = [];
  for (let i = start; i <= end - spoken.length; i++){
    const win = normTokens(scriptWords.slice(i, i + spoken.length).join(' '));
    const fast = _overlap(spoken, win);
    if (fast > 0) candidates.push({ i, win, fast });
  }
  if (!candidates.length) return;

  candidates.sort((a,b)=>b.fast - a.fast);
  const top = candidates.slice(0, 8);

  // Refine with similarity + distance-penalized scoring and rarity gating
  const idxBefore = currentIndex; // for jitter metric
  let bestIdx = currentIndex, bestRank = -Infinity, bestSim = -Infinity;
  const phraseRarity = (()=>{ try { return spoken.reduce((s,t)=> s + __idf(t), 0); } catch { return 0; } })();
  for (const c of top){
    const simRaw = _sim(spoken, c.win);
    const dist = Math.abs(c.i - currentIndex);
    // Require distinctive phrase for long jumps
    const needsRarity = dist > 20;
    if (needsRarity && phraseRarity < 8) { continue; }
    // Junk-anchor gate v2: forbid >6-word jumps when spoken tail is all junk
    try {
      const allJunk = (spoken.length > 0) && spoken.every(t => __JUNK.has(t));
      if (dist > 6 && allJunk) { continue; }
    } catch {}
    // Distance penalty (~0 near, ~1 far)
    const distancePenalty = (function(){ try { return 1 / (1 + Math.exp(-(dist - 10))); } catch { return 0; } })();
    const lambda = 0.35;
    // Duplicate-line penalty using virtual lines; avoid runts jitter
    const v = (function(){ try { return (__vParaIndex || []).find(v => c.i >= v.start && c.i <= v.end) || null; } catch { return null; } })();
    const dupPenalty = (function(){ try { return (v && v.key && (__vLineFreq.get(v.key) || 0) > 1) ? 0.08 : 0; } catch { return 0; } })();
    // Cluster penalty: repeated prefix (first 4 tokens) disambiguation
    const sigPenalty = (function(){ try { const n = v?.sig ? (__vSigCount.get(v.sig) || 0) : 0; return n > 1 ? 0.06 : 0; } catch { return 0; } })();
    const rank = (simRaw - dupPenalty - sigPenalty) - lambda * distancePenalty;
    if (rank > bestRank){ bestRank = rank; bestIdx = c.i; bestSim = simRaw; }
  }
  if (!(bestRank > -Infinity)) return; // nothing acceptable
  // Breadcrumb: report similarity outcome for this match step (and stash score for gate)
  try {
    window.__lastSimScore = Number(bestSim.toFixed(3));
    if (typeof debug === 'function') debug({ tag:'match:sim', idx: currentIndex, bestIdx, sim: window.__lastSimScore, windowAhead: MATCH_WINDOW_AHEAD });
  } catch {}

  // Ensure per-bestIdx line tracker is initialized and fed only new tokens
  try {
    const vList = __vParaIndex || [];
    const vCur = vList.find(v => bestIdx >= v.start && bestIdx <= v.end) || null;
    const vIdx = vCur ? vList.indexOf(vCur) : -1;
    if (vIdx >= 0){
      const lineTokens = scriptWords.slice(vCur.start, vCur.end + 1);
      if (__tpLineTracker.vIdx !== vIdx){ __resetLineTracker(vIdx, lineTokens); __tpPrevTail = []; }
      let newTail = __tailDelta(__tpPrevTail, spoken);
      // Ignore <3 char shards to avoid fake coverage bumps
      try { newTail = Array.isArray(newTail) ? newTail.filter(t => t && t.length >= 3) : []; } catch {}
      if (newTail.length) {
        __feedLineTracker(newTail);
        // Debounce coverage update logs/UI to avoid flicker on partial tokens
        try {
          const buf = (window.__tpCovBuf ||= []);
          // Keep only clean tokens in buffer
          const clean = newTail.filter(t => t && t.length >= 3);
          if (clean.length) buf.push(...clean);
          clearTimeout(window.__tpCovT);
          window.__tpCovT = setTimeout(()=>{
            try {
              // Final clean pass before commit
              const tokens = (window.__tpCovBuf||[]).filter(t => t && t.length >= 3).slice(-24); // cap payload
              if (typeof debug==='function') debug({ tag:'COV_UPDATE', idx: bestIdx, pos: __tpLineTracker.pos, len: __tpLineTracker.len, tokens });
            } catch {}
            try { window.__tpCovBuf = []; } catch {}
          }, 80);
        } catch {}
      }
      __tpPrevTail = spoken.slice();
    }
  } catch {}

  // Jitter meter: rolling std-dev of (bestIdx - idx)
  try {
    const J = (window.__tpJitter ||= { buf: [], max: 30, mean: 0, std: 0, spikeUntil: 0, lastLogAt: 0 });
    const d = (bestIdx - idxBefore);
    J.buf.push(d); if (J.buf.length > J.max) J.buf.shift();
    if (J.buf.length >= 5){
      const m = J.buf.reduce((a,b)=>a+b,0) / J.buf.length;
      const v = J.buf.reduce((a,b)=>a + Math.pow(b - m, 2), 0) / J.buf.length;
      J.mean = +(m.toFixed(2));
      J.std  = +(Math.sqrt(v).toFixed(2));
      const nowJ = performance.now();
      const elevated = (nowJ < (J.spikeUntil||0));
      // Emit at most ~3 times/sec
      if (!J.lastLogAt || nowJ - J.lastLogAt > 330){
        J.lastLogAt = nowJ;
        try { if (typeof debug==='function') debug({ tag:'match:jitter', mean: J.mean, std: J.std, n: J.buf.length, elevated }); } catch {}
      }
      // Spike detector: if std-dev spikes past 7, raise thresholds for ~8s
      if (J.std >= 7 && (!elevated)) {
        J.spikeUntil = nowJ + 8000;
        try { if (typeof debug==='function') debug({ tag:'match:jitter:spike', std: J.std, until: J.spikeUntil }); } catch {}
        try { if (typeof onJitterSpike === 'function') onJitterSpike(); } catch {}
      }
    }
  } catch {}
  // Apply elevated thresholds during jitter spikes
  const J = (window.__tpJitter || {});
  const jitterElevated = (typeof J.spikeUntil === 'number') && (performance.now() < J.spikeUntil);
  let EFF_SIM_THRESHOLD = SIM_THRESHOLD + (jitterElevated ? 0.08 : 0);
  let EFF_STRICT_FWD_SIM = STRICT_FORWARD_SIM + (jitterElevated ? 0.06 : 0);
  // End-game easing: give bestSim a tiny boost near the end
  const __adj = endGameAdjust(bestIdx, bestSim);
  if (__adj !== bestSim){ try { if (typeof debug==='function') debug({ tag:'match:sim:end-ease', bestIdx, sim:Number(bestSim.toFixed(3)), adj:Number(__adj.toFixed(3)) }); } catch {}
    bestSim = __adj; }
  if (bestSim < EFF_SIM_THRESHOLD) return;

  // Frontier smoothing: median-of-3 prefilter + EMA to stabilize hopping
  try {
    const f = (__tpFrontier ||= { idx: -1, alpha: 0.5, buf: [] });
    f.buf.push(bestIdx); if (f.buf.length > 3) f.buf.shift();
    const med = (f.buf.length === 3) ? f.buf.slice().sort((a,b)=>a-b)[1] : bestIdx;
    f.idx = (f.idx < 0) ? med : (f.alpha * med + (1 - f.alpha) * f.idx);
    try { window.__tpFrontierIdx = f.idx; } catch {}
  } catch {}

  // Confidence gate before switching active line (EMA-smoothed, suffix-aware, frontier/cluster-aware)
  try {
    // Compute instantaneous coverage for current virtual line
    const vList = __vParaIndex || [];
    const fIdx = (typeof window.__tpFrontierIdx === 'number' && window.__tpFrontierIdx >= 0) ? window.__tpFrontierIdx : bestIdx;
    const vCur = vList.find(v => fIdx >= v.start && fIdx <= v.end) || null;
    const vIdx = vCur ? vList.indexOf(vCur) : -1;
    let covGate = 0;
    if (vIdx >= 0){
      const lineTokens = scriptWords.slice(vCur.start, vCur.end + 1);
      // Cluster coverage within a small window around the frontier to resist zeroing on flips
      let clusterCov = 0;
      try {
        const w = [vIdx - 1, vIdx, vIdx + 1].filter(i => i >= 0 && i < vList.length);
        let hit = 0, tot = 0;
        for (const i of w){
          const tks = scriptWords.slice(vList[i].start, vList[i].end + 1);
          const c = tokenCoverage(tks, spoken);
          const wgt = (i === vIdx) ? 1.0 : 0.6; // center heavier
          hit += wgt * (c * tks.length);
          tot += wgt * tks.length;
        }
        clusterCov = tot ? (hit / tot) : 0;
      } catch { clusterCov = 0; }
      try {
        if (__tpLineTracker.vIdx === vIdx) covGate = Math.min(1, (__tpLineTracker.pos||0) / Math.max(1, __tpLineTracker.len||1));
        else covGate = clusterCov;
      } catch { covGate = clusterCov; }
    }
    const jitterStd = Number((J.std||0));
    // Scroll-follow gating: allow gentle catch-up based on sim/lead/cluster coverage (separate from activation)
    try {
      const STALE_MS = 1200, MIN_SIM = 0.92, LEAD_LINES = 2;
      const activeEl = (document.getElementById('script')||document).querySelector('p.active');
      const anchorVisible = isInComfortBand(activeEl, { top: 0.25, bottom: 0.55 });
      // Track last time anchor was visible in band
      const nowT = performance.now();
      try {
        if (anchorVisible) window.__tpLastAnchorInViewAt = nowT;
      } catch {}
      const lastIn = (window.__tpLastAnchorInViewAt||0);
      const stale = (nowT - lastIn) > STALE_MS;
      // Compute lead in lines using virtual line indices
      let lead = 0;
      try {
        const vList = __vParaIndex || [];
        const activeIdx = (function(){
          try {
            const el = activeEl; if (!el) return -1;
            const para = paraIndex.find(p => p.el === el) || null;
            if (!para) return -1;
            return para.start;
          } catch { return -1; }
        })();
        const frontierWord = Math.max(0, Math.min(Math.round(fIdx), scriptWords.length - 1));
        const fV = vList.findIndex(v => frontierWord >= v.start && frontierWord <= v.end);
        const aV = vList.findIndex(v => activeIdx >= v.start && activeIdx <= v.end);
        if (fV >= 0 && aV >= 0) lead = fV - aV;
      } catch { lead = 0; }
      const shouldCatchUp = (lead >= LEAD_LINES && (clusterCov >= 0.35 || bestSim >= MIN_SIM)) && (!isUserScrolling() && (stale || !anchorVisible));
      if (shouldCatchUp) {
        try {
          const sc = (window.__TP_SCROLLER || document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body);
          const vh = (sc === window) ? (window.innerHeight||0) : (sc.clientHeight||0);
          const bandTop = Math.floor(vh * 0.25);
          const targetY = Math.max(0, Math.min((vCur?.start != null ? (scriptWords.slice(0, vCur.start).join(' ').length) : 0), Math.max(0, (sc.scrollHeight||0) - (sc.clientHeight||0))));
          // Use ensureInView on the element if available; else compute a placement near the band
          if (vCur) {
            const el = (function(){ try { const p = paraIndex.find(p => fIdx >= p.start && fIdx <= p.end); return p?.el; } catch { return null; } })();
            if (el) ensureInView(el, { top: 0.25, bottom: 0.55 }); else maybeAutoScroll(targetY, sc, { overrideLock: true });
          }
          try { if (typeof debug==='function') debug({ tag:'scroll:catchup', lead, clusterCov:+clusterCov.toFixed(2), sim:+bestSim.toFixed(2), stale, anchorVisible }); } catch {}
        } catch {}
      }
    } catch {}
    // Count recent suffix hits in a short window to strengthen activation
    let suffixHits = 0; try { const nowH=performance.now(); const b=(window.__tpSuffixBuf||[]); suffixHits = b.filter(t => nowH - t <= 1500).length; } catch {}
    const ok = maybeActivate({ idx: bestIdx, sim: bestSim, cov: covGate, suffixHits, jitterStd });
    if (!ok) return; // Defer switching active to avoid flicker; let matcher accumulate more evidence
  } catch {}

  // Lost-mode tracker: increment low-sim runs and enter lost if jitter large
  try {
    if (bestSim < 0.6) __tpLowSimCount++; else __tpLowSimCount = 0;
    if ((J.std || 0) > 12 || __tpLowSimCount >= 8) {
      if (!__tpLost) { __tpLost = true; try { if (typeof debug==='function') debug({ tag:'match:lost:enter', std: J.std, lowSimCount: __tpLowSimCount }); } catch {} }
    }
  } catch {}

  // If we’re lost, try to recover by widening a local search around current position on distinctive anchors
  if (__tpLost) {
    try {
      const BAND_BEFORE = 35, BAND_AFTER = 120;
      const anchors = extractHighIDFPhrases(spoken, 3);
      const hits = searchBand(anchors, currentIndex - BAND_BEFORE, currentIndex + BAND_AFTER, spoken);
      const best = (hits.sort((a,b)=> b.score - a.score)[0]) || null;
      if (best && best.score > 0.78) {
        currentIndex = Math.max(0, Math.min(best.idx, scriptWords.length - 1));
        __tpLost = false; __tpLowSimCount = 0;
        try { if (typeof debug==='function') debug({ tag:'match:lost:recover', idx: currentIndex, score: best.score }); } catch {}
      } else {
        // Defer normal motion until we recover
        return;
      }
    } catch { return; }
  }

  // Coverage-based soft advance probe to prevent stalls
  // Stall instrumentation: if we haven't advanced for >1s, emit a one-line summary
  try {
    const nowS = performance.now();
    const idleMs = nowS - (_lastAdvanceAt || 0);
    if (idleMs > 1000) {
      const v = (__vParaIndex || []).find(v => currentIndex >= v.start && currentIndex <= v.end) || null;
      const lineTokens = v ? scriptWords.slice(v.start, v.end + 1) : [];
      // Prefer accumulated tracker coverage when available; fallback to instantaneous coverage
      let cov = 0;
      try {
        if (__tpLineTracker.vIdx === (__vParaIndex||[]).findIndex(x => currentIndex >= x.start && currentIndex <= x.end)){
          cov = Math.min(1, (__tpLineTracker.pos || 0) / Math.max(1, __tpLineTracker.len || 1));
        } else {
          cov = tokenCoverage(lineTokens, spoken);
        }
      } catch { cov = tokenCoverage(lineTokens, spoken); }
      // probe next virtual line similarity (cheap local look-ahead)
      let nextSim = 0;
      try {
        const vList = __vParaIndex || [];
        const vIdx = vList.findIndex(x => currentIndex >= x.start && currentIndex <= x.end);
        if (vIdx >= 0 && vIdx + 1 < vList.length){
          const nxt = vList[vIdx + 1];
          const win = scriptWords.slice(nxt.start, Math.min(nxt.start + spoken.length, nxt.end + 1));
          nextSim = _sim(spoken, win);
        }
      } catch {}
      const nearEnd = ((scriptWords.length - currentIndex) < 30);
      let bottom = false; try { bottom = atBottom(document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body); } catch {}
      if (!__tpStall?.reported){
        try { if (typeof debug==='function') debug({ tag:'STALL', idx: currentIndex, cov: +cov.toFixed(2), nextSim: +nextSim.toFixed(2), time: +(idleMs/1000).toFixed(1), nearEnd, atBottom: bottom }); } catch {}
        try { __tpStall.reported = true; } catch {}
      }
    } else {
      try { __tpStall.reported = false; } catch {}
    }
  } catch {}

  try {
    const soft = maybeSoftAdvance(bestIdx, bestSim, spoken);
    if (soft && soft.soft) { bestIdx = soft.idx; bestSim = soft.sim; }
  } catch {}

  // Soften big forward jumps unless similarity is very strong
  const delta = bestIdx - currentIndex;
  // Only log candidate when index or score meaningfully changes
  const __candPrev = (window.__tpLastCand ||= { idx: -1, score: -1 });
  const __scoreNow = Number(bestSim.toFixed(3));
  const __logCand = (bestIdx !== __candPrev.idx) || (Math.abs(__scoreNow - __candPrev.score) >= 0.01);
  if (__logCand) debug({
    tag: 'match:candidate',
    // normalize spoken tail consistently with line keys and matcher
    spokenTail: (function(){ try { return normTokens(spoken.join(' ')).join(' '); } catch { return spoken.join(' '); } })(),
    bestIdx,
    bestScore: Number(bestSim.toFixed(3)),
    // Duplicate penalty visibility in HUD
    ...(function(){
      try {
        // Original paragraph key context (for reference)
        const para = paraIndex.find(p => bestIdx >= p.start && bestIdx <= p.end) || null;
        const key = para?.key || '';
        const count = key ? (__lineFreq.get(key) || 0) : 0;
        const dup = count > 1;
        // Virtual merged-line context (used for penalty)
        const v = (__vParaIndex || []).find(v => bestIdx >= v.start && bestIdx <= v.end) || null;
        const vKey = v?.key || '';
        const vCount = vKey ? (__vLineFreq.get(vKey) || 0) : 0;
        const vDup = vCount > 1;
        const vSig = v?.sig || '';
        const vSigCount = vSig ? (__vSigCount.get(vSig) || 0) : 0;
        const dupPenalty = vDup ? 0.08 : 0;
        const sigPenalty = vSigCount > 1 ? 0.06 : 0;
        return { dup, dupCount: count, lineKey: key?.slice(0,80), vDup, vDupCount: vCount, vLineKey: vKey?.slice(0,80), vSig: vSig?.slice(0,80), vSigCount, dupPenalty, sigPenalty };
      } catch { return {}; }
    })(),
    delta,
    ...(function(){ try { const a=window.__tpLastActivation; if (!a) return {}; const age=performance.now()-a.t; return age<1200? { lastActivation: { idx: a.idx, reason: a.reason, age: Math.round(age) } } : {}; } catch { return {}; } })()
  });
  try { window.__tpLastCand = { idx: bestIdx, score: __scoreNow }; } catch {}
  // Visibility gate: ensure the target paragraph is visible in the active scroller before advancing idx
  try {
    if (paraIndex && paraIndex.length) {
      const nextPara = paraIndex.find(p => bestIdx >= p.start && bestIdx <= p.end) || paraIndex[paraIndex.length-1];
      const sc = (window.__TP_SCROLLER || document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body);
      const vh = (sc === window) ? (window.innerHeight||0) : (sc.clientHeight||0);
      const scTop = (sc === window) ? 0 : ((typeof sc.getBoundingClientRect === 'function') ? sc.getBoundingClientRect().top : 0);
      if (nextPara && nextPara.el && typeof nextPara.el.getBoundingClientRect === 'function'){
        const r = nextPara.el.getBoundingClientRect();
        const top = r.top - scTop; const bottom = r.bottom - scTop;
  const visible = (top >= 0 && bottom <= vh);
  try { if (typeof onAnchorVisibility === 'function') onAnchorVisibility(!!visible); } catch {}
        // Coalesce triggers: only when idx changes, active element changes, or anchor is not visible
        const curActive = (document.querySelector('.transcript-line.is-active') || document.querySelector('p.active') || null);
        const st = (window.__tpVisGateState ||= { lastIdx: -1, lastActive: null });
        const idxChanged = bestIdx !== st.lastIdx;
        const activeChanged = curActive !== st.lastActive;
        const shouldFollow = idxChanged || activeChanged || !visible;

        if (shouldFollow){
          if (!visible){
            // Prefer navigator for debounced, comfort-band-aware placement
            let usedNavigator = false;
            try {
              const viewerEl = document.getElementById('viewer') || sc;
              if (!window.__tpNav && viewerEl) window.__tpNav = makeNavigator(viewerEl);
              if (window.__tpNav && typeof window.__tpNav.follow === 'function'){
                window.__tpNav.follow(nextPara.el, bestIdx);
                usedNavigator = true;
                try { if (typeof debug==='function') debug({ tag:'visibility:navigator', idx: bestIdx }); } catch {}
              }
            } catch {}
            if (!usedNavigator){
              const getTop = ()=>{ try {
                const se = document.scrollingElement || document.documentElement || document.body;
                if (sc === se || sc === document.documentElement || sc === document.body) return (se?.scrollTop||document.documentElement?.scrollTop||document.body?.scrollTop||0);
                return (sc?.scrollTop||0);
              } catch { return 0; } };
              const beforeTop = getTop();
              const targetTop = Math.max(0, (nextPara.el.offsetTop||0) - Math.floor(vh * 0.45));
              try { requestScroll(targetTop); } catch { try { window.SCROLLER?.request({ y: targetTop, priority: 6, src: 'system', reason: 'visibility:ensure' }); } catch {} }
              // Escalate if movement is <12px within ~150ms
              setTimeout(()=>{
                try {
                  const afterTop = getTop();
                  if (Math.abs((afterTop||0) - (beforeTop||0)) < 12) {
                    try { window.SCROLLER?.request({ el: nextPara.el, priority: 6, src: 'system', reason: 'visibility' }); } catch {}
                    try { if (typeof debug==='function') debug({ tag:'visibility:escalate', method:'SCROLLER', block:'center' }); } catch {}
                  }
                } catch {}
              }, 160);
              try { if (typeof debug==='function') debug({ tag:'visibility:ensure', targetTop, vh, lineTop: (nextPara.el.offsetTop||0) }); } catch {}
            }
          }
          // Telemetry alongside anchor:marker for visibility (only when we ran)
          try {
            const viewerEl = document.getElementById('viewer');
            const scrollerName = (sc === window) ? 'page' : (sc.id || sc.tagName || 'scroller');
            const vTopBefore = (sc===window) ? (window.scrollY||0) : (sc.scrollTop||0);
            const anchorVisible = visible ? 1 : 0;
            const attempt = (function(){ try { window.__tpVisAttempt = (window.__tpVisAttempt||0) + 1; return window.__tpVisAttempt; } catch { return 1; } })();
            const payload = { source:'main', scroller: scrollerName, viewerTopBefore: vTopBefore, anchorVisible, attempt };
            try { if (typeof HUD?.log === 'function') HUD.log('anchor:marker:vis', payload); } catch {}
            try { if (typeof debug==='function') debug({ tag:'anchor:marker:vis', ...payload }); } catch {}
          } catch {}
          // Visibility failure counter for recovery (only when we ran)
          try {
            const nowV = performance.now();
            const buf = (window.__tpVisFailBuf ||= []);
            if (!visible) { buf.push(nowV); while (buf.length && nowV - buf[0] > 500) buf.shift(); }
          } catch {}
          // Anchor attempt cap + single-shot fallback
          try {
            const attempts = (window.__tpVisAttempt||0);
            if (attempts > 8) {
              // Cancel anchor work for now and center the active line smoothly (respect reduced motion)
              const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              const el = curActive || nextPara.el;
              try { if (el) window.SCROLLER?.request({ el, priority: 5, src: 'system', reason: 'ensureVisible' }); } catch {}
              try { if (typeof debug==='function') debug({ tag:'anchor:giveup', idx: bestIdx, attempts }); } catch {}
              try { if (typeof HUD?.log === 'function') HUD.log('anchor:giveup', { idx: bestIdx, attempts }); } catch {}
              try { window.__tpVisAttempt = 0; } catch {}
              try { st.lastIdx = bestIdx; st.lastActive = el; } catch {}
            }
          } catch {}
        }
        // Update coalesce state
        try { st.lastIdx = bestIdx; st.lastActive = curActive; } catch {}
      }
    }
  } catch {}
  if (delta > MAX_JUMP_AHEAD_WORDS && bestSim < EFF_STRICT_FWD_SIM){
    currentIndex += MAX_JUMP_AHEAD_WORDS;
  } else {
    currentIndex = Math.max(0, Math.min(bestIdx, scriptWords.length - 1));
  }

  // Recovery: if similarity is weak or repeated visibility failures, snap by DOM text search
  try {
    const weakSim = (function(){ try { return (window.__lastSimScore||0) < 0.6; } catch { return false; } })();
    const manyVisFails = (function(){ try { const b=(window.__tpVisFailBuf||[]); const now=performance.now(); const recent=b.filter(t=> now - t <= 500).length; return recent >= 2; } catch { return false; } })();
    if (weakSim || manyVisFails) {
      const sc = (window.__TP_SCROLLER || document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body);
      const doc = document;
      // Build a tail phrase of 3-5 tokens from spoken tail
      const tail = (function(){ try { const arr=(window.__tpPrevTail||[]); const n=Math.min(5, Math.max(3, arr.length)); return normalizeTail(arr.slice(-n).join(' ')); } catch { return ''; } })();
      if (tail && doc){
        // Find nearest paragraph whose text includes the tail (case-insensitive)
        const paras = Array.from(doc.querySelectorAll('#script p'));
        const lowerTail = tail.toLowerCase();
        let bestEl = null; let bestDist = Infinity;
        const scTop = (sc===window) ? 0 : ((typeof sc.getBoundingClientRect==='function')? sc.getBoundingClientRect().top : 0);
        const curTop = (sc===window) ? (window.scrollY||0) : (sc.scrollTop||0);
        for (const p of paras){
          try {
            const txt = (p.textContent||'').toLowerCase();
            if (!txt.includes(lowerTail)) continue;
            const r = p.getBoundingClientRect();
            const y = (r.top - scTop) + curTop;
            const dist = Math.abs(y - curTop);
            if (dist < bestDist){ bestDist = dist; bestEl = p; }
          } catch {}
        }
        if (bestEl){
          const vh = (sc===window) ? (window.innerHeight||0) : (sc.clientHeight||0);
          const targetTop = Math.max(0, (bestEl.offsetTop||0) - Math.floor(vh * 0.45));
          const before = (sc===window) ? (window.scrollY||0) : (sc.scrollTop||0);
          try { requestScroll(targetTop); } catch { try { window.SCROLLER?.request({ y: targetTop, priority: 6, src: 'system', reason: 'recovery:dom-snap' }); } catch {} }
          // Telemetry for recovery
          setTimeout(()=>{
            try {
              const after = (sc===window) ? (window.scrollY||0) : (sc.scrollTop||0);
              const moved = Math.round((after||0) - (before||0));
              const payload = { tag:'recovery:dom-snap', tail, before, after, moved };
              try { if (typeof debug==='function') debug(payload); } catch {}
              try { if (typeof HUD?.log === 'function') HUD.log('recovery:dom-snap', payload); } catch {}
            } catch {}
          }, 160);
        }
      }
    }
  } catch {}

  // Scroll toward the paragraph that contains currentIndex, gently clamped
  if (!paraIndex.length) return;
  const targetPara = paraIndex.find(p => currentIndex >= p.start && currentIndex <= p.end) || paraIndex[paraIndex.length-1];
  // Maintain a persistent pointer to the current line element
  try { if (currentEl && currentEl !== targetPara.el) { currentEl.classList.remove('active'); currentEl.classList.remove('current'); } } catch {}
  currentEl = targetPara.el;
  try { currentEl.classList.add('active'); currentEl.classList.add('current'); } catch {}

  const markerTop  = Math.round(viewer.clientHeight * (typeof MARKER_PCT === 'number' ? MARKER_PCT : 0.4));
  const desiredTop = (targetPara.el.offsetTop - markerTop); // let scheduler clamp
  // Base cap to keep motion tame; relax near the end to avoid slowdown perception
  const maxScroll  = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
  const progress   = maxScroll ? (viewer.scrollTop / maxScroll) : 0;
  let capPx        = Math.floor((viewer.clientHeight || 0) * 0.60);
  if (progress >= 0.75) capPx = Math.floor((viewer.clientHeight || 0) * 0.90);

  if (isFinal && window.__TP_CALM) {
    // If similarity isn't very high, cap the jump size to keep motion tame (but relax near end)
    try {
      if ((Number.isFinite(bestScore) && bestScore < 0.90)){
        const dTop = desiredTop - viewer.scrollTop;
        const inTail = progress >= 0.85; // last ~15%: no cap
        if (!inTail && Math.abs(dTop) > capPx){
          const limitedTop = viewer.scrollTop + Math.sign(dTop) * capPx;
          try { requestScroll(limitedTop); if (typeof debug === 'function') debug({ tag:'scroll', top: limitedTop, mode:'calm-cap' }); } catch {}
          // sync display based on intended target (avoid read-after-write)
          try {
            const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
            const ratio = max ? (limitedTop / max) : 0;
            sendToDisplay({ type:'scroll', top: limitedTop, ratio });
          } catch {}
          if (typeof markAdvance === 'function') markAdvance(); else _lastAdvanceAt = performance.now();
          return; // defer full commit until next cycle
        }
      }
    } catch {}
    // Calm Mode: snap using geometry-based targeting at commit time
    try { onSpeechCommit(currentEl); } catch {}
  if (typeof debug === 'function') debug({ tag:'scroll', top: (typeof window.__lastScrollTarget==='number'?window.__lastScrollTarget:viewer.scrollTop), mode:'calm-commit' });
    {
      const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
  const tTop = (typeof window.__lastScrollTarget==='number'?window.__lastScrollTarget:viewer.scrollTop);
  const ratio = max ? (tTop / max) : 0;
  sendToDisplay({ type:'scroll', top: tTop, ratio });
    }
    try {
      const vRect = viewer.getBoundingClientRect();
      const anchorEl = (__anchorObs?.mostVisibleEl?.() || null) || targetPara.el;
      const pRect = anchorEl.getBoundingClientRect();
      const anchorY = pRect.top - vRect.top;
      maybeCatchupByAnchor(anchorY, viewer.clientHeight);
    } catch {}
    if (typeof markAdvance === 'function') markAdvance(); else _lastAdvanceAt = performance.now();
  } else {
  const err = desiredTop - viewer.scrollTop;
    const tNow = performance.now();
    if (Math.abs(err) < DEAD_BAND_PX || (tNow - _lastCorrectionAt) < CORRECTION_MIN_MS) return;

    // Anti-jitter: for interim results, avoid backward corrections entirely
    const dir = err > 0 ? 1 : (err < 0 ? -1 : 0);
    if (!isFinal && dir < 0) return;
    // Hysteresis: don’t change direction on interim unless the error is clearly large
    if (!isFinal && _lastMoveDir !== 0 && dir !== 0 && dir !== _lastMoveDir && Math.abs(err) < (DEAD_BAND_PX * 2)) return;

    // Scale steps based on whether this came from a final (more confident) match
    const fwdStep = isFinal ? MAX_FWD_STEP_PX : Math.round(MAX_FWD_STEP_PX * 0.6);
    const backStep = isFinal ? MAX_BACK_STEP_PX : Math.round(MAX_BACK_STEP_PX * 0.6);
    // Prefer element-anchored scrolling; apply jump cap unless similarity is very high
    try {
      const dTop = desiredTop - viewer.scrollTop;
      const inTail = progress >= 0.85; // last ~15%: no cap
      if (!inTail && (Number.isFinite(bestScore) && bestScore < 0.90) && Math.abs(dTop) > capPx){
        const limitedTop = viewer.scrollTop + Math.sign(dTop) * capPx;
        requestScroll(limitedTop);
      } else {
        if (typeof scrollToElAtMarker === 'function') scrollToElAtMarker(currentEl); else scrollToEl(currentEl, markerTop);
      }
    } catch {
      let next;
      if (err > 0) next = Math.min(viewer.scrollTop + fwdStep, desiredTop);
      else         next = Math.max(viewer.scrollTop - backStep, desiredTop);
      try { requestScroll(next); } catch { try { window.SCROLLER?.request({ y: next, priority: 6, src: 'system', reason: 'advance:fallback' }); } catch {} }
    }
    if (typeof debug === 'function') debug({ tag:'scroll', top: (typeof window.__lastScrollTarget==='number'?window.__lastScrollTarget:viewer.scrollTop) });
    {
      // compute output from intended target if we just scheduled a write
      const tTop = (()=>{
        try{
          const last = (typeof window.__lastScrollTarget === 'number') ? window.__lastScrollTarget : null;
          return last ?? viewer.scrollTop;
        }catch{return viewer.scrollTop}
      })();
      const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
      const ratio = max ? (tTop / max) : 0;
      sendToDisplay({ type:'scroll', top: tTop, ratio });
    }
    // Evaluate whether to run the gentle catch-up loop based on anchor position
    try {
      const vRect = viewer.getBoundingClientRect();
      // Prefer the most visible element if available; else current paragraph
      const anchorEl = (__anchorObs?.mostVisibleEl?.() || null) || targetPara.el;
      const pRect = anchorEl.getBoundingClientRect();
      const anchorY = pRect.top - vRect.top; // anchor relative to viewer
      maybeCatchupByAnchor(anchorY, viewer.clientHeight);
    } catch {}
    // mark progress for stall-recovery
    if (typeof markAdvance === 'function') markAdvance(); else _lastAdvanceAt = performance.now();
    _lastCorrectionAt = tNow;
    if (dir !== 0) _lastMoveDir = dir;
  }
  // Dead-man timer: ensure scroll keeps up with HUD index
  try { deadmanWatchdog(currentIndex); } catch {}
}

  function escapeHtml(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  function formatInlineMarkup(text){
    let s = escapeHtml(text);
    // basic inline tags
    s = s
      .replace(/\[b\]([\s\S]+?)\[\/b\]/gi, '<strong>$1<\/strong>')
      .replace(/\[i\]([\s\S]+?)\[\/i\]/gi, '<em>$1<\/em>')
      .replace(/\[u\]([\s\S]+?)\[\/u\]/gi, '<span class="u">$1<\/span>')
      // Notes render as block-level for clarity
      .replace(/\[note\]([\s\S]+?)\[\/note\]/gi, '<div class="note">$1<\/div>');
    // color/bg
    s = s.replace(/\[color=([^\]]+)\]([\s\S]+?)\[\/color\]/gi, (_, col, inner) => {
      const c = safeColor(col);
      return c ? `<span style="color:${c}">${inner}<\/span>` : inner;
    });
    s = s.replace(/\[bg=([^\]]+)\]([\s\S]+?)\[\/bg\]/gi, (_, col, inner) => {
      const c = safeColor(col);
      return c ? `<span style="background:${c};padding:0 .15em;border-radius:.2em">${inner}<\/span>` : inner;
    });
    // roles (standardized: only s1/s2 are colorized; g1/g2 and guest wrappers are stripped)
    s = s.replace(/\[s1\]([\s\S]+?)\[\/s1\]/gi, (_, inner) => `<span style="${roleStyle('s1')}">${inner}<\/span>`);
    s = s.replace(/\[s2\]([\s\S]+?)\[\/s2\]/gi, (_, inner) => `<span style="${roleStyle('s2')}">${inner}<\/span>`);
    // Strip g1/g2 wrappers, keep content
    s = s.replace(/\[(g1|g2)\]([\s\S]+?)\[\/\1\]/gi, '$2');
    // Map [speaker=1|2] to s1/s2 styling; strip [guest=*]
    s = s.replace(/\[speaker\s*=\s*(1|2)\]([\s\S]+?)\[\/speaker\]/gi, (_, idx, inner) => `<span style="${roleStyle('s'+idx)}">${inner}<\/span>`);
    s = s.replace(/\[guest\s*=\s*(1|2)\]([\s\S]+?)\[\/guest\]/gi, '$2');
    // final scrub: remove any stray speaker tags that slipped into inline text (notes are handled as blocks)
    s = s.replace(/\[\/?(?:s1|s2|g1|g2)\]/gi, '');
    return s;
  }

  function stripTagsForTokens(text){
    let s = String(text||'');
    // Notes are not spoken → drop entirely
    s = s.replace(/\[note\][\s\S]*?\[\/note\]/gi, '');
    // Keep spoken content; drop wrappers
    s = s.replace(/\[(?:s1|s2)\]([\s\S]+?)\[\/(?:s1|s2)\]/gi, '$1');
    // Drop g1/g2 and guest wrappers entirely (content kept by previous rules if needed)
    s = s.replace(/\[(?:g1|g2)\][\s\S]*?\[\/(?:g1|g2)\]/gi, '');
    s = s.replace(/\[(?:guest|speaker)\s*=\s*(?:1|2)\]([\s\S]+?)\[\/(?:guest|speaker)\]/gi, '$1');
    s = s.replace(/\[color=[^\]]+\]([\s\S]+?)\[\/color\]/gi, '$1');
    s = s.replace(/\[bg=[^\]]+\]([\s\S]+?)\[\/bg\]/gi, '$1');
    s = s.replace(/\[(?:b|i|u)\]([\s\S]+?)\[\/(?:b|i|u)\]/gi, '$1');
    return s;
  }

  // TP: typography-apply
  function applyTypography(){
    scriptEl.querySelectorAll('p, .note').forEach(el => {
     
     
      el.style.fontSize  = String(fontSizeInput.value) + 'px';
      el.style.lineHeight= String(lineHeightInput.value);
    });
    // Persist preferences
    try { localStorage.setItem('tp_font_size_v1', String(fontSizeInput.value||'')); } catch {}
    try { localStorage.setItem('tp_line_height_v1', String(lineHeightInput.value||'')); } catch {}
    sendToDisplay({ type: 'typography', fontSize: fontSizeInput.value, lineHeight: lineHeightInput.value });
  }

  function renderScript(text){
    const t = String(text || '');

  // Tokenize for speech sync (strip tags so only spoken words are matched)
  scriptWords = normTokens(stripTagsForTokens(text));

    // Build paragraphs; preserve single \n as <br>
    // First, split on double newlines into blocks, then further split any block
    // that contains note divs so note blocks always stand alone.
    const blocks = t.split(/\n{2,}/);
    const outParts = [];
    for (const b of blocks){
      // Convert inline markup first so notes become <div class="note"> blocks
      const html = formatInlineMarkup(b).replace(/\n/g,'<br>');
      // If there are one or more note divs inside, split them out to standalone entries
      if (/<div class=\"note\"[\s\S]*?<\/div>/i.test(html)){
        const pieces = html.split(/(?=<div class=\"note")|(?<=<\/div>)/i).filter(Boolean);
        for (const piece of pieces){
          if (/^\s*<div class=\"note\"/i.test(piece)) outParts.push(piece);
          else if (piece.trim()) outParts.push(`<p>${piece}</p>`);
        }
      } else {
        outParts.push(html.trim() ? `<p>${html}</p>` : '');
      }
    }
    const paragraphs = outParts.filter(Boolean).join('');

  scriptEl.innerHTML = paragraphs || '<p><em>Paste text in the editor to begin…</em></p>';
    applyTypography();
  // Ensure enough breathing room at the bottom so the last lines can reach the marker comfortably
  applyBottomPad();
  try { updateEndSpacer(); } catch {}
  // currentIndex = 0; // Do not reset index when rendering script for speech sync

    // Mirror to display (only if open & ready)
    try {
      if (displayWin && !displayWin.closed && displayReady) {
        sendToDisplay({ type:'render', html: scriptEl.innerHTML, fontSize: fontSizeInput.value, lineHeight: lineHeightInput.value });
      }
    } catch {}

    // Build paragraph index
    // Rebuild IntersectionObserver and (re)observe visible paragraphs
    // Rebuild IntersectionObserver via modular anchor observer
    try { __anchorObs?.ensure?.(); } catch {}
  const paras = Array.from(scriptEl.querySelectorAll('p'));
    try { __anchorObs?.observeAll?.(paras); } catch {}
    lineEls = paras;
    try { updateDebugPosChip(); } catch {}
  paraIndex = []; let acc = 0;
  __lineFreq = new Map();
  __vParaIndex = []; __vLineFreq = new Map(); __vSigCount = new Map();
    // Prepare rarity stats structures
    __paraTokens = []; __dfMap = new Map();
    for (const el of paras){
      const toks = normTokens(el.textContent || '');
      const wc = toks.length || 1;
      const key = normLineKey(el.textContent || '');
      // assign data-idx for lookup and debugging
      try { el.setAttribute('data-idx', String(acc)); } catch {}
      paraIndex.push({ el, start: acc, end: acc + wc - 1, key });
      acc += wc;
      __paraTokens.push(toks);
      try { const uniq = new Set(toks); uniq.forEach(t => __dfMap.set(t, (__dfMap.get(t) || 0) + 1)); } catch {}
      try { if (key) __lineFreq.set(key, (__lineFreq.get(key) || 0) + 1); } catch {}
    }
    __dfN = __paraTokens.length;
    // Refresh the y-index map now that indices are rebuilt
    try { refreshYIndexMap(); } catch {}
    // Build virtual merged lines for matcher duplicate disambiguation
    try {
      const MIN_LEN = 35, MAX_LEN = 120; // characters
      let bufText = '';
      let bufStart = -1;
      let bufEnd = -1;
      let bufEls = [];
      for (const p of paraIndex){
        const text = String(p.el?.textContent || '').trim();
        const candidate = (bufText ? (bufText + ' ' + text) : text);
        if (candidate.trim().length < MAX_LEN){
          // absorb
          if (!bufText){ bufStart = p.start; bufEnd = p.end; bufEls = [p.el]; bufText = text; }
          else { bufText = candidate; bufEnd = p.end; bufEls.push(p.el); }
          if (bufText.length >= MIN_LEN){
            const key = normLineKey(bufText);
            const sig = (function(){ try { return normTokens(bufText).slice(0,4).join(' '); } catch { return ''; } })();
            __vParaIndex.push({ text: bufText, start: bufStart, end: bufEnd, key, sig, els: bufEls.slice() });
            if (key) __vLineFreq.set(key, (__vLineFreq.get(key) || 0) + 1);
            if (sig) __vSigCount.set(sig, (__vSigCount.get(sig) || 0) + 1);
            bufText = ''; bufStart = -1; bufEnd = -1; bufEls = [];
          }
        } else {
          // flush buffer if any
          if (bufText){
            const key = normLineKey(bufText);
            const sig = (function(){ try { return normTokens(bufText).slice(0,4).join(' '); } catch { return ''; } })();
            __vParaIndex.push({ text: bufText, start: bufStart, end: bufEnd, key, sig, els: bufEls.slice() });
            if (key) __vLineFreq.set(key, (__vLineFreq.get(key) || 0) + 1);
            if (sig) __vSigCount.set(sig, (__vSigCount.get(sig) || 0) + 1);
            bufText = ''; bufStart = -1; bufEnd = -1; bufEls = [];
          }
          // push current as its own
          const key = normLineKey(text);
          const sig = (function(){ try { return normTokens(text).slice(0,4).join(' '); } catch { return ''; } })();
          __vParaIndex.push({ text, start: p.start, end: p.end, key, sig, els: [p.el] });
          if (key) __vLineFreq.set(key, (__vLineFreq.get(key) || 0) + 1);
          if (sig) __vSigCount.set(sig, (__vSigCount.get(sig) || 0) + 1);
        }
      }
      if (bufText){
        const key = normLineKey(bufText);
        const sig = (function(){ try { return normTokens(bufText).slice(0,4).join(' '); } catch { return ''; } })();
        __vParaIndex.push({ text: bufText, start: bufStart, end: bufEnd, key, sig, els: bufEls.slice() });
        if (key) __vLineFreq.set(key, (__vLineFreq.get(key) || 0) + 1);
        if (sig) __vSigCount.set(sig, (__vSigCount.get(sig) || 0) + 1);
      }
    } catch {}
    // Initialize current element pointer
    try { currentEl?.classList.remove('active'); } catch {}
    currentEl = paraIndex.find(p => currentIndex >= p.start && currentIndex <= p.end)?.el || paraIndex[0]?.el || null;
    if (currentEl) {
      currentEl.classList.add('active');
      try {
        const viewer = document.getElementById('viewer');
        const marker = document.getElementById('marker');
        if (viewer && marker) {
          const vRect = viewer.getBoundingClientRect();
          const mRect = marker.getBoundingClientRect();
          const aRect = currentEl.getBoundingClientRect();
          const markerY = mRect.top - vRect.top;
          const activeY = aRect.top - vRect.top;
          const deltaPx = Math.round(activeY - markerY);
          const vh = Math.max(1, viewer.clientHeight || 1);
          const deltaVH = +(deltaPx / vh).toFixed(3);
          if (typeof window.HUD?.log === 'function') HUD.log('anchor:marker:active', { markerY: Math.round(markerY), activeY: Math.round(activeY), deltaPx, deltaVH });
        }
      } catch {}
    }
  }

  // Dynamic bottom spacer/padding so the marker can sit over the final paragraphs
  function applyBottomPad(){
    try {
      const pad = Math.max(window.innerHeight * 0.5, 320);
      // Prefer a persistent spacer element inside the viewer for headroom
      const spacer = document.getElementById('end-spacer');
      if (spacer) { try { updateEndSpacer(); } catch {} }
      // Keep padding as a fallback for legacy flows
      if (scriptEl) scriptEl.style.paddingBottom = `${pad}px`;
    } catch {}
  }

  // Size spacer so the end-of-content aligns to the marker when scrolled to max
  function updateEndSpacer(){
    try {
      const viewer = document.getElementById('viewer');
      const marker = document.getElementById('marker');
      const spacer = document.getElementById('end-spacer');
      if (!viewer || !marker || !spacer) return;
      const vRect = viewer.getBoundingClientRect();
      const mRect = marker.getBoundingClientRect();
      const markerY = mRect.top - vRect.top; // marker offset within viewer
      const S = Math.max(0, (viewer.clientHeight || 0) - markerY);
      spacer.style.height = `${S}px`;
    } catch {}
  }

  // Ensure the last line can physically reach the marker by adding just-enough spacer
  function ensureReachableForLastLine(markerYFromHud = null){
    try {
      const viewer = document.getElementById('viewer');
      const marker = document.getElementById('marker');
      const spacer = document.getElementById('end-spacer');
      const content = document.getElementById('script');
      if (!viewer || !content || !spacer) return;
      const lastLine = content.lastElementChild;
      if (!lastLine) return;
      // reset before measuring true bottom
      spacer.style.height = '0px';
      const llRect = lastLine.getBoundingClientRect();
      const vTop = viewer.getBoundingClientRect().top;
      const markerTop = markerYFromHud != null ? Number(markerYFromHud) : (function(){ try { return document.getElementById('marker').getBoundingClientRect().top; } catch { return vTop + Math.round((viewer.clientHeight||0)*0.4); } })();
      // How much more scrollTop is needed for lastLine.TOP to align with the marker?
      const deltaToMarker   = llRect.top - markerTop;
      const neededScrollTop = viewer.scrollTop + deltaToMarker;
      // Current max scrollTop
      const maxScrollTop    = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
      // Add just enough space so that neededScrollTop is attainable
      const neededExtra     = Math.max(0, Math.ceil(neededScrollTop - maxScrollTop));
      if (neededExtra) spacer.style.height = `${neededExtra + 2}px`; // +2 safety to beat rounding
    } catch {}
  }

  // Simple follower that nudges scroll so the active line aligns to marker using HUD delta
  function nudgeToMarker(markerY, activeY){
    try {
      const viewer = document.getElementById('viewer');
      if (!viewer) return;
      // Round and ignore tiny deltas to reduce jitter
      const ay = Math.round(Number(activeY));
      const my = Math.round(Number(markerY));
      const delta = ay - my; // + => content needs to move up (scroll down)
      if (!Number.isFinite(delta) || Math.abs(delta) < 6) return;
      const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
      const target = Math.max(0, Math.min(Math.round(viewer.scrollTop + delta), max));
  try { requestScroll(target); } catch { try { window.SCROLLER?.request({ y: target, priority: 6, src: 'system', reason: 'nudgeToMarker' }); } catch {} }
    } catch {}
  }

  // Small navigator with latches, comfort band, and min-delta
  function makeNavigator(scroller){
    const ANCHOR_VH = 0.45;       // where we like the active line to sit
    const QUIET_MS  = 350;        // don't re-run ensureVisible within this window for same idx
    const CACHE_MS  = 2000;       // remember "definitely visible" lines briefly
    const MIN_DELTA = 6;          // ignore scrolls smaller than this (px)
    const BAND      = [0.25, 0.75]; // comfort band as fraction of scroller height
    const RATIO_OK  = 0.8;        // IO ratio to count as visible enough

    let lastIdx = -1;
    let lastRunTs = 0;
    let raf = 0;
    const visibleUntil = new WeakMap(); // el -> expiry ms

    const io = new IntersectionObserver((entries) => {
      const now = performance.now();
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= RATIO_OK) {
          visibleUntil.set(e.target, now + CACHE_MS);
        }
      }
    }, { root: scroller, threshold: [RATIO_OK] });

    function isRecentlyVisible(el){ return (visibleUntil.get(el) || 0) > performance.now(); }
    function inComfortBand(rect, h){
      const topOK = rect.top >= h * BAND[0];
      const botOK = rect.bottom <= h * BAND[1];
      return topOK && botOK;
    }
    function ensureVisible(el){
      try {
        if (window.__tpReaderLocked) return; // don't yank the page while user reads
        const h = scroller.clientHeight || 0;
        const r = el.getBoundingClientRect();
        if (h && inComfortBand(r, h)) return; // Already good
        // Primary precise placement
        const targetTop = Math.max(0, (el.offsetTop||0) - Math.floor(h * ANCHOR_VH));
        const curTop = (scroller.scrollTop||0);
        if (Math.abs(curTop - targetTop) > MIN_DELTA){
          try { requestScroll(targetTop); } catch { try { window.SCROLLER?.request({ y: targetTop, priority: 4, src: 'system', reason: 'navigator:ensureVisible' }); } catch {} }
        }
        // Fallback DOM snap once layout settles (benefits from scroll-margin-block)
        requestAnimationFrame(()=>{
          try { if (!window.__tpReaderLocked) window.SCROLLER?.request({ el, priority: 4, src: 'system', reason: 'ensureVisible:fallback' }); } catch {}
        });
      } catch {}
    }
    function queue(el, idx){
      const now = performance.now();
      if (idx === lastIdx && (now - lastRunTs) < QUIET_MS) return;
      if (isRecentlyVisible(el)) { lastIdx = idx; lastRunTs = now; return; }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(()=>{
        try { io.observe(el); } catch {}
        ensureVisible(el);
        lastIdx = idx; lastRunTs = performance.now();
        try { if (typeof onAnchorVisibility === 'function') onAnchorVisibility(inComfortBand(el.getBoundingClientRect(), scroller.clientHeight||0)); } catch {}
      });
    }
    // Optional: pause auto-follow while the user scrolls
    let pausedUntil = 0; const PAUSE_MS = 1200;
    function pause(){ pausedUntil = performance.now() + PAUSE_MS; }
    try { ['wheel','touchstart','pointerdown','keydown'].forEach(evt => scroller.addEventListener(evt, pause, { passive:true })); } catch {}
    return { follow(el, idx){ if (performance.now() < pausedUntil) return; queue(el, idx); } };
  }
  try { window.makeNavigator = makeNavigator; } catch {}
  // ---------- context selection ----------
  function getDisplayContext(){
    try {
      if (displayWin && !displayWin.closed){
        try { void displayWin.document; return { name:'popup', win: displayWin, doc: displayWin.document }; } catch {}
      }
    } catch {}
    try {
      const frame = document.getElementById('displayFrame');
      if (frame && frame.contentWindow){
        try { void frame.contentWindow.document; return { name:'iframe', win: frame.contentWindow, doc: frame.contentWindow.document }; } catch {}
      }
    } catch {}
    return { name:'main', win: window, doc: document };
  }
  function getContextScroller(ctx){
    const d = ctx?.doc; const w = ctx?.win;
    if (!d || !w) return { scroller: window, baseTop: 0 };
    const sc = d.querySelector('#displayScroll') || d.getElementById('wrap') || d.getElementById('viewer') || w;
    // Measure baseTop in the target document’s own coordinates; do not add frame offsets here
    const baseTop = (sc===w ? 0 : (sc.getBoundingClientRect().top||0));
    return { scroller: sc, baseTop };
  }
  function measureMarkerActive(ctx){
    try {
      ctx ||= getDisplayContext();
      const d = ctx.doc, w = ctx.win; if (!d || !w) return { ctx, markerY:null, activeY:null };
      const { scroller, baseTop } = getContextScroller(ctx);
      const marker = d.getElementById('marker-line') || d.getElementById('marker');
      const active = d.querySelector('.transcript-line.is-active') || d.querySelector('p.active');
      const markerY = marker ? Math.round(marker.getBoundingClientRect().top - baseTop) : null;
      const activeY = active ? Math.round(active.getBoundingClientRect().top - baseTop) : null;
      return { ctx, markerY, activeY };
    } catch { return { ctx, markerY:null, activeY:null }; }
  }
  function nudgeToMarkerInContext(ctx, markerY, activeY){
    try {
      const d = ctx?.doc, w = ctx?.win; if (!d || !w) return;
      const { scroller } = getContextScroller(ctx);
      const ay = Math.round(Number(activeY));
      const my = Math.round(Number(markerY));
      const delta = ay - my;
      if (!Number.isFinite(delta) || Math.abs(delta) < 6) return;
      const cur = (scroller === w) ? (w.scrollY||0) : (scroller.scrollTop||0);
      const max = (function(){ try { const h = (scroller===w ? (d.scrollingElement?.scrollHeight||0) : (scroller.scrollHeight||0)); const vh=(scroller===w ? (w.innerHeight||0) : (scroller.clientHeight||0)); return Math.max(0, h - vh); } catch { return 0; } })();
      const target = Math.max(0, Math.min(Math.round(cur + delta), max));
      if (scroller === w) w.scrollTo(0, target); else scroller.scrollTop = target;
    } catch {}
  }
  function alignToMarkerAuto(){
    try {
      const ctx = getDisplayContext();
      if (ctx.name !== 'main' && ctx.doc){
        const m = measureMarkerActive(ctx);
        if (m && m.markerY != null && m.activeY != null) {
          try { if (typeof window.HUD?.log === 'function') HUD.log('anchor:marker', { source: ctx.name, markerY: Math.round(m.markerY), activeY: Math.round(m.activeY) }); } catch {}
          return nudgeToMarkerInContext(ctx, m.markerY, m.activeY);
        }
        // If we got here, either element missing or measurement failed -> try cross-origin fallback if popup exists
        if (typeof window.crossOriginScroll === 'function') return window.crossOriginScroll();
        return nudgeToMarkerInDisplay();
      }
      // Fallback to main window geometry
      const viewer = document.getElementById('viewer');
      const marker = document.getElementById('marker');
      const active = (document.getElementById('script')||document).querySelector('p.active');
      if (!viewer || !marker || !active) return;
      const vRect = viewer.getBoundingClientRect();
  const markerY = Math.round(marker.getBoundingClientRect().top - vRect.top);
  const activeY = Math.round(active.getBoundingClientRect().top - vRect.top);
  try { if (typeof window.HUD?.log === 'function') HUD.log('anchor:marker', { source:'main', markerY, activeY }); } catch {}
  nudgeToMarker(markerY, activeY);
    } catch {}
  }
  try { window.getDisplayContext = getDisplayContext; window.alignToMarkerAuto = alignToMarkerAuto; } catch {}
  try {
    if (typeof window.crossOriginScroll !== 'function') {
      window.crossOriginScroll = (action)=>{
        try {
          if (displayWin && !displayWin.closed) {
            if (action === 'END_TO_MARKER') displayWin.postMessage({ type:'END_TO_MARKER' }, '*');
            else displayWin.postMessage({ type:'align-by-marker' }, '*');
          }
        } catch {}
      };
    }
  } catch {}
  // Align the external display window by marker (if open): asks display to nudge by its own delta
  function nudgeToMarkerInDisplay(){
    try {
      if (!displayWin || displayWin.closed) return;
      displayWin.postMessage({ type:'align-by-marker' }, '*');
    } catch {}
  }

  // Measure marker/active either from Display (popup or iframe) if open, else from main
  async function measureDisplayOrMain(){
    // Try display first
    try {
      if (displayWin && !displayWin.closed && displayReady) {
        const res = await new Promise((resolve)=>{
          let settled = false;
          const timeout = setTimeout(()=>{ if(!settled){ settled=true; resolve(null); } }, 200);
          function onMsg(e){
            try {
              if (e.source !== displayWin) return;
              const d = e.data||{};
              if (d.type === 'MEASURE') { settled = true; clearTimeout(timeout); window.removeEventListener('message', onMsg); resolve({ source: d.source||'display', markerY: d.markerY, activeY: d.activeY }); }
            } catch {}
          }
          window.addEventListener('message', onMsg, { once:false });
          try { displayWin.postMessage({ type:'measure-request' }, '*'); } catch {}
        });
        if (res) return res;
      }
    } catch {}
    // Fallback to main measurement
    try {
      const viewer = document.getElementById('viewer');
      const marker = document.getElementById('marker');
      const active = (document.getElementById('script')||viewer)?.querySelector('p.active');
      if (!viewer || !marker || !active) return { markerY: null, activeY: null };
      const vRect = viewer.getBoundingClientRect();
      const markerY = marker.getBoundingClientRect().top - vRect.top;
      const activeY = active.getBoundingClientRect().top - vRect.top;
      return { source:'main', markerY, activeY };
    } catch { return { markerY: null, activeY: null }; }
  }

  // ---------- doc-aware measurement helpers (main) ----------
  function __docGetScroller(doc, win){
    try { return doc.querySelector('#displayScroll') || doc.getElementById('wrap') || doc.getElementById('viewer') || win; } catch { return win; }
  }
  function __docRelTop(el, scroller, win){
    try { const r = el.getBoundingClientRect(); const baseTop = (scroller===win ? 0 : (scroller.getBoundingClientRect().top||0)); return r.top - baseTop; } catch { return 0; }
  }
  function __docRelBottom(el, scroller, win){
    try { const r = el.getBoundingClientRect(); const baseTop = (scroller===win ? 0 : (scroller.getBoundingClientRect().top||0)); return r.bottom - baseTop; } catch { return 0; }
  }
  function __docGetScrollTop(scroller, win){ try { return (scroller===win) ? (win.scrollY||0) : (scroller.scrollTop||0); } catch { return 0; } }
  function __docSetScrollTop(scroller, win, y){
    try {
      if (scroller===win) { window.SCROLLER?.request({ y: Number(y)||0, priority: 5, src:'system', reason:'doc:set' }); }
      else { window.SCROLLER?.request({ y: Number(y)||0, priority: 5, src:'system', reason:'doc:set' }); }
    } catch {}
  }
  function __docMaxScrollTop(scroller, win, doc){
    try { const h = (scroller===win ? (doc.scrollingElement?.scrollHeight||0) : (scroller.scrollHeight||0)); const vh = (scroller===win ? (win.innerHeight||0) : (scroller.clientHeight||0)); return Math.max(0, h - vh); } catch { return 0; }
  }
  // Size spacer so that when scrolled to max, the last line's bottom can sit at the marker
  function ensureEndSpacer(doc, scroller, win, markerY, padExtra = 8){
    try {
      const V = (scroller === win ? win.innerHeight : scroller.clientHeight) || 0;
      const pad = Math.max(0, Math.ceil((V - Number(markerY || 0)) + Number(padExtra)));
      const script = doc.getElementById('script') || doc.body;
      if (!script) return;
      let spacer = doc.getElementById('end-spacer');
      if (!spacer) { spacer = doc.createElement('div'); spacer.id='end-spacer'; spacer.setAttribute('aria-hidden','true'); spacer.style.pointerEvents='none'; script.appendChild(spacer); }
      spacer.style.height = pad + 'px';
    } catch {}
  }

  // ---------- main action: scroll until end hits the marker ----------
  function scrollEndToMarker(){
    try {
      const ctx = getDisplayContext();
      const win = ctx?.win, doc = ctx?.doc;
      // Preflight: if targeting a display context, nudge typography for layout parity
      try {
        if (ctx.name !== 'main' && displayWin && !displayWin.closed) {
          const fsEl = document.getElementById('fontSize');
          const lhEl = document.getElementById('lineHeight');
          const fs = Number(fsEl?.value);
          const lh = Number(lhEl?.value);
          if ((isFinite(fs) && fs > 0) || (isFinite(lh) && lh >= 1.0)) {
            sendToDisplay({ type:'typography', fontSize: isFinite(fs)?fs:undefined, lineHeight: isFinite(lh)?lh:undefined });
          }
        }
      } catch {}
      // If cross-origin (no doc access), delegate
      if (ctx.name !== 'main' && (!doc || !doc.body)) { try { if (typeof crossOriginScroll === 'function') crossOriginScroll('END_TO_MARKER'); } catch {} return; }
  const scroller = __docGetScroller(doc, win);
      const marker = (doc.getElementById('marker-line') || doc.getElementById('marker'));
  // Optional virtualization hook: allow app to materialize last node when near end
  try { if (typeof win?.__ensureLastNode === 'function') win.__ensureLastNode(); } catch {}
  const last = (doc.querySelector('.transcript-line:last-of-type') || doc.querySelector('#script p:last-of-type'));
      if (!marker || !scroller) return;
      const markerY = __docRelTop(marker, scroller, win);
  ensureEndSpacer(doc, scroller, win, markerY);
      // Recompute after spacer potential resize
      let lastBottom = null;
      if (last) {
        lastBottom = __docRelBottom(last, scroller, win);
      } else {
        // Virtualized: estimate last bottom by total content height minus scrollTop
        const totalH = (scroller===win ? (doc.scrollingElement?.scrollHeight||0) : (scroller.scrollHeight||0));
        lastBottom = Math.max(0, totalH - __docGetScrollTop(scroller, win));
      }
      const delta = lastBottom - markerY; // >0 => content needs to move up (scroll down)
      if (Math.abs(delta) <= 1) return;
      const current = __docGetScrollTop(scroller, win);
      const target = Math.min(current + delta, __docMaxScrollTop(scroller, win, doc));
      __docSetScrollTop(scroller, win, Math.max(0, target));
      // optional tidy nudge if layout shifts
      requestAnimationFrame(()=>{
        try {
          let nb = null;
          if (last) nb = __docRelBottom(last, scroller, win);
          else {
            const totalH = (scroller===win ? (doc.scrollingElement?.scrollHeight||0) : (scroller.scrollHeight||0));
            nb = Math.max(0, totalH - __docGetScrollTop(scroller, win));
          }
          const miss = nb - markerY;
          if (Math.abs(miss) > 3){
            const cur = __docGetScrollTop(scroller, win);
            const t2 = Math.min(cur + miss, __docMaxScrollTop(scroller, win, doc));
            __docSetScrollTop(scroller, win, Math.max(0, t2));
          }
        } catch {}
      });
      try {
        const scH = (scroller===win ? (win.innerHeight||0) : (scroller.clientHeight||0));
        console.info('[end→marker]', ctx.name, 'scH=', scH, 'markerY=', markerY, 'lastBottom=', lastBottom);
      } catch {}
    } catch {}
  }
  try { window.scrollEndToMarker = scrollEndToMarker; } catch {}
  // Final snap: when very close, align the active line exactly to the marker
  function endSnap(markerYViewport){
    try {
      const viewer = document.getElementById('viewer');
      const script = document.getElementById('script');
      const active = (script || viewer)?.querySelector('p.active');
      if (!viewer || !active || markerYViewport == null) return;
      const vRect = viewer.getBoundingClientRect();
      const aRect = active.getBoundingClientRect();
      // convert viewport Y values to scroller-space
      const toScrollerY = (vpY)=> (Number(vpY)||0) + (viewer.scrollTop||0) - vRect.top;
      const markerTop_sc = toScrollerY(markerYViewport);
      const activeTop_sc = toScrollerY(aRect.top);
      const delta = activeTop_sc - markerTop_sc;
      const abs = Math.abs(delta);
      const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
      const progress = max ? (viewer.scrollTop / max) : 0;
      const nearEnd = progress >= 0.92 || (function(){ try { const c = script?.children?.length||0; const idx = Array.from(script?.children||[]).indexOf(active); return c>0 && idx >= c-2; } catch { return false; } })();
      // Only snap when very close, or a bit looser near the end
      const tol = nearEnd ? 24 : 8;
      if (abs <= tol){
        const target = Math.max(0, Math.min((viewer.scrollTop||0) + delta, max));
        try { requestScroll(target); } catch { viewer.scrollTop = target; }
      }
    } catch {}
  }
  try {
    window.ensureReachableForLastLine = ensureReachableForLastLine;
    window.ensureEndSpacer = function(markerY){ try { const sc = document.getElementById('viewer'); if (sc) ensureEndSpacer(document, sc, window, markerY ?? (function(){ try{ const m=document.getElementById('marker'); const v=sc.getBoundingClientRect(); return m.getBoundingClientRect().top - v.top; } catch { return Math.round((sc.clientHeight||0)*0.4); } })()); } catch {} };
    window.nudgeToMarker = nudgeToMarker;
    window.nudgeToMarkerInDisplay = nudgeToMarkerInDisplay;
    window.measureDisplayOrMain = measureDisplayOrMain;
    // Aliases to match external snippet naming
    window.ensureEndReachability = ensureReachableForLastLine;
    window.endSnap = endSnap;
  } catch {}
  // Optional: binding for HUD-driven updates
  try {
    const _ayBuf = [];
    window.onHudUpdate = function(payload){
      try {
        const markerY = payload && payload.markerY;
        let activeY = payload && payload.activeY;
        // Median smooth activeY over last 3 samples to avoid visible flicker on rare snaps
        if (typeof activeY === 'number' && isFinite(activeY)) {
          _ayBuf.push(activeY); if (_ayBuf.length > 3) _ayBuf.shift();
          if (_ayBuf.length >= 2){ const sorted = _ayBuf.slice().sort((a,b)=>a-b); const mid = sorted[Math.floor(sorted.length/2)]; activeY = mid; }
        }
        try { window.__tpLastMarkerY = markerY; } catch {}
        // Always preflight end reachability so we never hit a ceiling near the end
        if (markerY != null) {
          ensureReachableForLastLine(markerY);
          // Also set spacer so max scroll allows last line to sit at the marker
          const sc = document.getElementById('viewer'); if (sc) ensureEndSpacer(document, sc, window, markerY);
        }
        if (markerY != null && activeY != null) nudgeToMarker(markerY, activeY);
        // Explicit source-tagged log for anchor:marker
        try { if (typeof window.HUD?.log === 'function') HUD.log('anchor:marker', { source: (getDisplayContext()?.name||'main'), markerY: Math.round(markerY??-1), activeY: Math.round(activeY??-1) }); } catch {}
      } catch {}
    };
  } catch {}

  // Hardening: avoid browser smooth-scroll lag and rubber-banding
  try {
    const sc = document.getElementById('viewer');
    if (sc && sc.style) {
      sc.style.overscrollBehavior = 'contain';
      sc.style.scrollBehavior = 'auto';
    }
  } catch {}

  // Recompute end reachability on layout changes (fonts, resize)
  try {
    const sc = document.getElementById('viewer');
    if (window.ResizeObserver && sc) {
      const ro2 = new ResizeObserver(() => { try { const vRect = sc.getBoundingClientRect(); const m = document.getElementById('marker'); const mY = m ? (m.getBoundingClientRect().top - vRect.top) : Math.round((sc.clientHeight||0)*0.4); ensureReachableForLastLine(mY); ensureEndSpacer(document, sc, window, mY); } catch {} });
      ro2.observe(sc);
      window.__tpEndReachRO = ro2;
    }
  } catch {}

  // call this whenever you actually advance or scroll due to a match
  function markAdvance(){
    _lastAdvanceAt = performance.now();
    try { (__tpStall ||= {}).reported = false; } catch {}
  }
  window.renderScript = renderScript; // for any external callers

  // Camera/WebRTC keepalive: periodically attempt reconnection if user intends camera mirroring
  setInterval(() => {
    try {
      if (!displayWin || displayWin.closed) { displayReady = false; return; }
      const st = camPC?.connectionState;
      if (wantCamRTC && camStream && (!st || st === 'failed' || st === 'disconnected')) {
        updateCamRtcChip('CamRTC: re-offer…');
        ensureCamPeer();
      }
    } catch {}
  }, 1500);

  // --- Token normalization (used by DOCX import, renderScript, and matcher) ---
function normTokens(text){
  let t = String(text).toLowerCase()
    .replace(/’/g,"'")
    // expand common contractions
    .replace(/\b(won't)\b/g, 'will not')
    // generic n't expansion for common auxiliaries/verbs (avoid 'won't' which is handled above)
    .replace(/\b(can|do|does|is|are|was|were|has|have|had|would|should|could|did)n['’]t\b/g, '$1 not')
    .replace(/\b(\w+)'re\b/g, '$1 are')
    .replace(/\b(\w+)'ll\b/g, '$1 will')
    .replace(/\b(\w+)'ve\b/g, '$1 have')
    .replace(/\b(\w+)'d\b/g, '$1 would')
    .replace(/\b(\w+)'m\b/g, '$1 am')
    .replace(/\bit's\b/g, 'it is')
    .replace(/\bthat's\b/g, 'that is');

  // split number ranges: 76–86, 8-7 → "76 86", "8 7"
  t = t.replace(/(\d+)\s*[\u2010-\u2015-]\s*(\d+)/g, '$1 $2');

  // turn percent into a word so "86 %" ≈ "eighty six percent"
  t = t.replace(/%/g, ' percent');

  // split hyphenated words into what you actually say: matter-of-fact → matter of fact
  t = t.replace(/([a-z])[\u2010-\u2015-]([a-z])/gi, '$1 $2');

  // strip punctuation broadly (unicode-aware) + long dashes
  try { t = t.replace(/[^\p{L}\p{N}\s]/gu, ' '); } catch { t = t.replace(/[.,!?;:()"\[\]`]/g, ' '); }
  t = t.replace(/[\u2010-\u2015]/g, ' ');

  // collapse whitespace (pre-tokenization)
  t = t.replace(/\s+/g, ' ').trim();

  const raw = t.split(/\s+/).filter(Boolean);

  // numerals 0..99 → words (helps overlap)
  const ones = ['zero','one','two','three','four','five','six','seven','eight','nine'];
  const teens= ['ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  const numToWords = (n) => {
    n = Number(n);
    if (Number.isNaN(n) || n < 0 || n > 99) return null;
    if (n < 10) return ones[n];
    if (n < 20) return teens[n-10];
    const t = Math.floor(n/10), o = n%10;
    return o ? `${tens[t]} ${ones[o]}` : tens[t];
  };

  const out = [];
  for (const w of raw){
    if (/^\d{1,2}$/.test(w)){
      const words = numToWords(w);
      if (words){ out.push(...words.split(' ')); continue; }
    }
    out.push(w);
  }
  return out;
}

  /* ──────────────────────────────────────────────────────────────
   * Smart Tagging (names → roles)
   * ────────────────────────────────────────────────────────────── */
  function normalizeSimpleTagTypos(text){
    // Fix common bracket typos like [ s1 ]
    return String(text||'').replace(/\[\s*(s1|s2|g1|g2)\s*\]/ig, '[$1]')
                           .replace(/\[\s*\/(s1|s2|g1|g2)\s*\]/ig, '[/$1]');
  }

  function smartTag(input, opts = {}) {
    // if already tagged, do nothing (prevents double-wrapping on re-run)
    if (/\[(s1|s2|g1|g2)\]/i.test(input)) return input;

    const keepNames = opts.keepNames !== false; // default: true
    const lines = String(input || '').split(/\r?\n/);

    const ROLE_KEYS = ['s1','s2','g1','g2'];
    const nameToRole = new Map();
    for (const key of ROLE_KEYS) {
      const nm = (ROLES[key].name || '').trim();
      if (nm) nameToRole.set(nm.toLowerCase(), key);
    }
    const aliasToRole = new Map([
      ['s1','s1'], ['speaker 1','s1'], ['host 1','s1'],
      ['s2','s2'], ['speaker 2','s2'], ['host 2','s2'],
      ['g1','g1'], ['guest 1','g1'],
      ['g2','g2'], ['guest 2','g2'],
    ]);

    const resolveRole = (name) => {
      const who = String(name||'').trim().toLowerCase().replace(/\s+/g,' ');
      return nameToRole.get(who) || aliasToRole.get(who) || null;
    };
    const displayNameFor = (role, fallback) => (ROLES[role]?.name || fallback || '').trim();

    let currentRole = null;       // active role after a block header
    let pendingLabel = null;      // add label on next paragraph flush
    let paraBuf = [];
    const out = [];

    const flush = () => {
      if (!paraBuf.length) return;
      const text = paraBuf.join(' ').trim();
      if (text) {
        if (currentRole) {
          const label = keepNames && pendingLabel ? `[b]${pendingLabel}:[/b] ` : '';
          out.push(`[${currentRole}]${label}${text}[/${currentRole}]`);
        } else {
          out.push(text);
        }
      }
      paraBuf = [];
      pendingLabel = null; // only show the label on the first paragraph after header
    };

    for (const raw of lines) {
      const s = raw.trim();

      // Block header: ">> NAME:" (also accepts single '>' and :, —, > as enders)
      const block = s.match(/^>{1,2}\s*([^:>\-—()]+?)\s*[:>\-—]\s*$/i);
      if (block) {
        flush();
        const name = block[1];
        const role = resolveRole(name);
        currentRole = role;
        pendingLabel = role && keepNames ? displayNameFor(role, name) : null;
        continue;
      }

      // Inline: "Name: text" / "Name — text" / "Name > text"
      const inline = raw.match(/^\s*([^:>\-—()]+?)(?:\s*\((off[-\s]?script)\))?\s*[:>\-—]\s*(.+)$/i);
      if (inline) {
        flush();
        const who  = inline[1];
        const body = inline[3].trim();
        const role = resolveRole(who);
        if (role) {
          const show = keepNames ? `[b]${displayNameFor(role, who)}:[/b] ` : '';
          out.push(`[${role}]${show}${body}[/${role}]`);
          currentRole = role;     // keep role active until another header/inline
          pendingLabel = null;    // inline already included label
          continue;
        }
        // if no role match, fall through and treat as plain text
      }

      // Paragraph break
      if (!s) { flush(); out.push(''); continue; }

      // Accumulate content under current role (if any)
      paraBuf.push(s);
    }

    flush();
    return out.join('\n');
  }

// TP: display-open
function openDisplay(){
  try {
    // Prefer an embedded iframe if present and same-origin; else fall back to popup
    const displayFrame = document.getElementById('displayFrame');
    if (displayFrame && displayFrame.contentWindow) {
      displayWin = displayFrame.contentWindow;
      displayReady = false;
      displayChip.textContent = 'Display: frame';
      closeDisplayBtn.disabled = true; // will enable on READY
      // Kick off handshake ping (the display will send a READY message on load)
      if (displayHelloTimer) { clearInterval(displayHelloTimer); displayHelloTimer = null; }
      displayHelloDeadline = performance.now() + 3000;
      displayHelloTimer = setInterval(()=>{
        if (!displayWin || displayReady) { clearInterval(displayHelloTimer); displayHelloTimer = null; return; }
        if (performance.now() > displayHelloDeadline) { clearInterval(displayHelloTimer); displayHelloTimer = null; return; }
        try { sendToDisplay({ type:'hello' }); } catch {}
      }, 300);
      return;
    }
    // Otherwise, open the standalone external display window
    displayWin = window.open('display.html', 'TeleprompterDisplay', 'width=1000,height=700');
    if (!displayWin) {
      setStatus('Pop-up blocked. Allow pop-ups and try again.');
      displayChip.textContent = 'Display: blocked';
      return;
    }
    displayReady = false;
    displayChip.textContent = 'Display: open';
    closeDisplayBtn.disabled = true;  // will be enabled by global DISPLAY_READY handler
    // Kick off handshake retry pings: every 300ms up to ~3s or until READY.
    if (displayHelloTimer) { clearInterval(displayHelloTimer); displayHelloTimer = null; }
    displayHelloDeadline = performance.now() + 3000; // 3s window
    displayHelloTimer = setInterval(()=>{
      // If closed or already ready, stop.
      if (!displayWin || displayWin.closed || displayReady) {
        clearInterval(displayHelloTimer); displayHelloTimer = null; return;
      }
      // If deadline passed, stop trying.
      if (performance.now() > displayHelloDeadline) {
        clearInterval(displayHelloTimer); displayHelloTimer = null; return;
      }
      try { sendToDisplay({ type:'hello' }); } catch {}
    }, 300);
  } catch (e) {
    setStatus('Unable to open display window: ' + e.message);
  }
}
  function closeDisplay(){ if(displayWin && !displayWin.closed) displayWin.close(); displayWin=null; displayReady=false; closeDisplayBtn.disabled=true; displayChip.textContent='Display: closed'; }
  // TP: display-send
  function sendToDisplay(payload){ if(displayWin && !displayWin.closed) displayWin.postMessage(payload, '*'); }
  window.sendToDisplay = sendToDisplay;

  // Centralized scroll target + helpers (always scroll the same container, not window)
  // Installed later once viewer is bound
  function getScroller(){ return viewer; }
  let clampScrollTop, scrollByPx, scrollToY, scrollToEl, scrollToElAtMarker;

  // Debug chip updater (throttled via rAF): shows anchor percentage within viewport and scrollTop
  function updateDebugPosChipImmediate(){
    try {
      if (!debugPosChip || !viewer) return;
      const vH = Math.max(1, viewer.clientHeight || 1);
      const active = (scriptEl || viewer)?.querySelector('p.active');
      const vis = __anchorObs?.mostVisibleEl?.() || null;
      const el = vis || active || (paraIndex.find(p=>currentIndex>=p.start && currentIndex<=p.end)?.el) || null;
      let pct = 0;
      if (el){
        const vRect = viewer.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const anchorY = r.top - vRect.top;
        pct = Math.round(Math.max(0, Math.min(100, (anchorY / vH) * 100)));
      }
      const topStr = (viewer.scrollTop||0).toLocaleString();
      debugPosChip.textContent = `Anchor ${pct}% • scrollTop ${topStr}`;
    } catch {}
  }
  let __debugPosRaf = 0; let __debugPosPending = false;
  function updateDebugPosChip(){
    if (__debugPosPending) return; // already scheduled
    __debugPosPending = true;
    __debugPosRaf && cancelAnimationFrame(__debugPosRaf);
    __debugPosRaf = requestAnimationFrame(()=>{ __debugPosPending = false; updateDebugPosChipImmediate(); });
  }


  // Dead-man timer: if HUD index advances but scrollTop doesn’t, force a catch-up jump
  let _wdLastIdx = -1, _wdLastTop = 0, _wdLastT = 0;
  function deadmanWatchdog(idx){
    try {
      const sc = getScroller(); if (!sc) return;
      // Don’t fight auto-scroll
      if (autoTimer) return;
      const now = performance.now();
      const top = sc.scrollTop;
      if (idx > _wdLastIdx && (now - _wdLastT) > 600 && Math.abs(top - _wdLastTop) < 4){
        // Force a catch-up jump to the current element/paragraph under idx
        let el = null;
        try {
          const p = (paraIndex||[]).find(p => idx >= p.start && idx <= p.end);
          el = p?.el || null;
          if (!el && Array.isArray(lineEls)) el = lineEls[Math.min(idx, lineEls.length-1)] || null; // best-effort fallback
        } catch {}
        if (el){
          const offset = Math.round(sc.clientHeight * 0.40);
          scrollToEl(el, offset);
          // mirror to display
          const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
          const ratio = max ? (sc.scrollTop / max) : 0;
          sendToDisplay({ type:'scroll', top: sc.scrollTop, ratio });
        }
      }
      if (idx > _wdLastIdx){ _wdLastIdx = idx; _wdLastT = now; _wdLastTop = top; }
    } catch {}
  }

  /* ──────────────────────────────────────────────────────────────
   * Typography + Auto‑scroll + Timer
   * ────────────────────────────────────────────────────────────── */
function startAutoScroll(){
  if (autoTimer) return;
  // Pause catch-up controller while auto-scroll is active
  try { __scrollCtl?.stopAutoCatchup?.(); } catch {}
  try { if (__isHudVerbose() && typeof HUD?.log === 'function') HUD.log('autoscroll:start', { speed: Number(autoSpeed?.value)||0 }); } catch {}
  const step = () => {
    const pxPerSec = Math.max(0, Number(autoSpeed.value) || 0);
    try { scrollByPx(pxPerSec / 60); } catch { viewer.scrollTop += (pxPerSec / 60); }
    {
      const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
      const ratio = max ? (viewer.scrollTop / max) : 0;
      sendToDisplay({ type: 'scroll', top: viewer.scrollTop, ratio });
    }
    // keep label updated with live speed
    autoToggle.textContent = `Auto-scroll: On (${pxPerSec}px/s)`;
    try { if (__isHudVerbose() && typeof HUD?.log === 'function') HUD.log('autoscroll:tick', { speed: pxPerSec }); } catch {}
  };
  autoTimer = setInterval(step, 1000 / 60);
  step(); // immediate tick so it feels responsive
}

function stopAutoScroll(){
  clearInterval(autoTimer);
  autoTimer = null;
  autoToggle.textContent = 'Auto-scroll: Off';
  try { if (__isHudVerbose() && typeof HUD?.log === 'function') HUD.log('autoscroll:stop', {}); } catch {}
  // Resume catch-up controller if speech sync is active — via heuristic gate
  if (recActive) {
    try {
      const vRect = viewer.getBoundingClientRect();
      // Compute current anchor from active paragraph or currentIndex
      let anchorY = 0;
  // Prefer most-visible from IO module, then active/current paragraph
      const active = (scriptEl || viewer)?.querySelector('p.active');
  const el = (__anchorObs?.mostVisibleEl?.() || null) || active || (paraIndex.find(p=>currentIndex>=p.start && currentIndex<=p.end)?.el);
      if (el){ const r = el.getBoundingClientRect(); anchorY = r.top - vRect.top; }
      maybeCatchupByAnchor(anchorY, viewer.clientHeight);
    } catch { try { __scrollCtl?.stopAutoCatchup?.(); } catch {} }
  }
}

// ⬇️ keep this OUTSIDE stopAutoScroll
function tweakSpeed(delta){
  let v = Number(autoSpeed.value) || 0;
  v = Math.max(0, Math.min(300, v + delta));
  autoSpeed.value = String(v);
  if (autoTimer) autoToggle.textContent = `Auto-scroll: On (${v}px/s)`;
}


  function startTimer(){ if (chrono) return; chronoStart = performance.now(); chrono = requestAnimationFrame(tickTimer); }
  function tickTimer(now){ const t = (now - chronoStart) / 1000; const m = Math.floor(t/60); const s = Math.floor(t%60); const d = Math.floor((t%1)*10); timerEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`; chrono = requestAnimationFrame(tickTimer); }
  function resetTimer(){ if (chrono){ cancelAnimationFrame(chrono); chrono=null; } timerEl.textContent = '00:00.0'; }

  function beginCountdownThen(sec, fn){
    sec = Math.max(0, Number(sec)||0);
    if (!sec){ fn(); return; }
    let n = sec;
  // TP: preroll-controls
  const show = (v) => { countNum.textContent = String(v); countOverlay.style.display='flex'; sendToDisplay({type:'preroll', show:true, n:v}); };
    show(n);
    const id = setInterval(() => { n -= 1; if (n<=0){ clearInterval(id); countOverlay.style.display='none'; sendToDisplay({type:'preroll', show:false}); fn(); } else show(n); }, 1000);
  }


function toggleRec(){
  if (recActive){
    // stopping (before calling recog.stop())
    recAutoRestart = false;
    recActive = false;
    speechOn = false; try{ window.HUD?.bus?.emit('speech:toggle', false); }catch{}
    document.body.classList.remove('listening'); // when stopping
    stopSpeechSync();
    recChip.textContent = 'Speech: idle';
    recBtn.textContent = 'Start speech sync';
    try { __scrollCtl?.stopAutoCatchup?.(); } catch {}
    try { window.matcher?.reset?.(); } catch {}
    // Try to stop external recorders per settings
    try { __recorder?.stop?.(); } catch {}
    return;
  }

  const sec = Number(prerollInput?.value) || 0;
  beginCountdownThen(sec, () => {
    // starting:
    recAutoRestart = true;
    recActive = true;
    document.body.classList.add('listening'); // when starting
    recChip.textContent = 'Speech: listening…';
    recBtn.textContent = 'Stop speech sync';
    startTimer();
    startSpeechSync();
    // Try to start external recorders per settings
    try { __recorder?.start?.(); } catch {}
  });
  // ...existing code...
  // NOTE: _initCore continues far below; do not prematurely close earlier.
}

// Diagnostic wrapper (placed AFTER full _initCore definition)
async function init(){
  console.log('[TP-Pro] init() wrapper start');
  try {
    await _initCore();
    console.log('[TP-Pro] init() wrapper end (success)');
    // Turn on CSS snap for active lines only to avoid micro-adjusts
    try {
      const root = document.querySelector('.viewer .script');
      if (root) root.classList.add('snap-active-only');
      // If the helper exists, also set mode explicitly for consistency
      try { if (typeof window.setSnapMode === 'function') window.setSnapMode('active'); } catch {}
    } catch {}
    // After DOM ready and core init, fetch and propagate the build version
    (async function attachVersionEverywhere(){
      try {
        const res = await fetch('./VERSION.txt', { cache: 'no-store' });
        const v = (await res.text()).trim();
        if (!v) return;
        // 1) Global
        window.APP_VERSION = v;
        // 2) Footer build label (support either #build-label or #anvil-build-label)
        const el = document.getElementById('build-label') || document.getElementById('anvil-build-label');
        if (el) el.textContent = v;
        // 3) HUD header will pick up APP_VERSION automatically
        if (window.HUD) HUD.log('boot:version', { v });
      } catch (e) {
        if (window.HUD) HUD.log('boot:version-error', String(e));
      }
    })();
  } catch(e){
    console.error('[TP-Pro] init() failed:', e);
    try { (window.__TP_BOOT_TRACE||[]).push({ t: Date.now(), m: 'init-failed:'+ (e?.message||e) }); } catch {}
    // Emergency minimal fallback to at least render placeholder + meter
    try {
      if (!window.__tpInitSuccess) {
        console.warn('[TP-Pro] Running emergency fallback init');
        const ed = document.getElementById('editor');
        const sc = document.getElementById('script');
        if (sc && !sc.innerHTML) sc.innerHTML = '<p><em>Paste text in the editor to begin… (fallback)</em></p>';
        try { buildDbBars(document.getElementById('dbMeterTop')); } catch {}
        window.__tpInitSuccess = true;
      }
    } catch(err2){ console.error('[TP-Pro] fallback init failed', err2); }
    throw e;
  }
}



  // (Removed duplicate populateDevices/requestMic/updateMicDevices/updateCamDevices — consolidated earlier.)

  /* ──────────────────────────────────────────────────────────────
   * Camera overlay
   * ────────────────────────────────────────────────────────────── */
  async function startCamera(){
    try{
      const id = camDeviceSel?.value || undefined;
      const stream = await navigator.mediaDevices.getUserMedia({ video: id? {deviceId:{exact:id}} : true, audio:false });
      // Order matters: set properties/attributes first, then assign stream, then play()
      camVideo.muted = true;            // required for mobile autoplay
      camVideo.autoplay = true;
      camVideo.playsInline = true;
  camVideo.controls = false; camVideo.removeAttribute('controls'); camVideo.removeAttribute('controlsList');
  camVideo.disablePictureInPicture = true;
  camVideo.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback');
      camVideo.setAttribute('playsinline','');
      camVideo.setAttribute('webkit-playsinline','');
      camVideo.srcObject = stream;
      try {
        await camVideo.play();
      } catch (err) {
        // Autoplay might be blocked (iOS). Provide a simple tap-to-start fallback.
        warn('Camera autoplay blocked, waiting for user gesture', err);
        setStatus('Tap the video to start the camera');
        const onTap = async () => {
          try { await camVideo.play(); setStatus(''); camVideo.removeEventListener('click', onTap); } catch {}
        };
        camVideo.addEventListener('click', onTap, { once: true });
      }
      camWrap.style.display = 'block'; startCamBtn.disabled=true; stopCamBtn.disabled=false; applyCamSizing(); applyCamOpacity(); applyCamMirror();
      camStream = stream;
      wantCamRTC = true;
      // Kick off WebRTC mirroring if display is open/ready
      try { if (displayWin && !displayWin.closed && displayReady) await ensureCamPeer(); } catch {}
      populateDevices();
    } catch(e){ warn('startCamera failed', e); }
  }
  function updateCamRtcChip(msg){ try { if (camRtcChip) camRtcChip.textContent = msg; } catch {} }
  function stopCamera(){
    wantCamRTC = false;
    try{ const s = camVideo?.srcObject; if (s) s.getTracks().forEach(t=>t.stop()); }catch{}
    camVideo.srcObject=null;
    camWrap.style.display='none'; startCamBtn.disabled=false; stopCamBtn.disabled=true;
    camStream=null;
    updateCamRtcChip('CamRTC: idle');
    try{ sendToDisplay({ type:'webrtc-stop' }); }catch{}
    try{ if (camPC){ camPC.close(); camPC=null; } }catch{}
  }
  function applyCamSizing(){ const pct = Math.max(15, Math.min(60, Number(camSize.value)||28)); camWrap.style.width = pct+'%'; try{ sendToDisplay({ type:'cam-sizing', pct }); }catch{} }
  function applyCamOpacity(){ const op = Math.max(0.2, Math.min(1, (Number(camOpacity.value)||100)/100)); camWrap.style.opacity = String(op); try{ sendToDisplay({ type:'cam-opacity', opacity: op }); }catch{} }
  function applyCamMirror(){ camWrap.classList.toggle('mirrored', !!camMirror.checked); try{ sendToDisplay({ type:'cam-mirror', on: !!camMirror.checked }); }catch{} }

  // Simple fallback: draw current video frame to a hidden canvas and postImage (future implementation placeholder)
  function enableCanvasMirrorFallback(reswitch){
    try {
      // Avoid reinitializing if already active
      if (window.__camCanvasFallback && !reswitch) return;
      const cvs = window.__camCanvasFallback || document.createElement('canvas');
      window.__camCanvasFallback = cvs;
      const ctx = cvs.getContext('2d');
      function pump(){
        try {
          if (!camVideo || !camVideo.videoWidth) { requestAnimationFrame(pump); return; }
          cvs.width = camVideo.videoWidth; cvs.height = camVideo.videoHeight;
          ctx.drawImage(camVideo, 0, 0);
          // Potential: send via postMessage with cvs.toDataURL('image/webp',0.6) throttled
          // For now: only keep canvas for possible local preview tools
        } catch {}
        requestAnimationFrame(pump);
      }
      requestAnimationFrame(pump);
      updateCamRtcChip('CamRTC: fallback');
    } catch {}
  }

  // ── WebRTC camera mirroring (simple in-window signaling) ──
  async function ensureCamPeer(){
    if (!camStream) return;
    // Fallback: if RTCPeerConnection not supported (locked-down environment), drop to canvas mirror path
    if (typeof window.RTCPeerConnection === 'undefined') {
      try { enableCanvasMirrorFallback(); } catch {}
      return;
    }
    if (camPC) return; // already active
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      camPC = pc;
      updateCamRtcChip('CamRTC: negotiating…');
      camStream.getTracks().forEach(t => pc.addTrack(t, camStream));
      try {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          const p = sender.getParameters();
          p.degradationPreference = 'maintain-framerate';
          // Target ~720p @ ~0.9 Mbps; allow downscale if upstream constrained
          p.encodings = [{ maxBitrate: 900_000, scaleResolutionDownBy: 1 }];
          await sender.setParameters(p).catch(()=>{});
        }
      } catch {}
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          try { sendToDisplay({ type:'cam-ice', candidate: e.candidate }); } catch {}
        }
      };
      pc.onconnectionstatechange = () => {
        try {
          const st = pc.connectionState;
          if (st === 'connected')      updateCamRtcChip('CamRTC: connected');
          else if (st === 'connecting')updateCamRtcChip('CamRTC: connecting…');
          else if (st === 'disconnected') updateCamRtcChip('CamRTC: retry…');
          else if (st === 'failed')   updateCamRtcChip('CamRTC: failed');
          else if (st === 'closed')   updateCamRtcChip('CamRTC: closed');
        } catch {}
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          try { pc.close(); } catch {}
          camPC = null;
        }
      };
  const offer = await pc.createOffer({ offerToReceiveVideo: false });
  await pc.setLocalDescription(offer);
  camAwaitingAnswer = true;
      // offer already sent above
    } catch (e) { warn('ensureCamPeer failed', e); }
  }

  // Hot-swap camera device without renegotiation when possible
  async function switchCamera(deviceId){
    try {
      if (!deviceId) return;
      const rtcOK = typeof window.RTCPeerConnection !== 'undefined';
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
        audio: false
      });
      const newTrack = newStream.getVideoTracks()[0];
      const oldTracks = camStream?.getVideoTracks?.() || [];
      // Update local preview
      camStream = newStream;
      camVideo.srcObject = newStream;
      if (!rtcOK) { try { enableCanvasMirrorFallback(true); } catch {} return; }
      // Replace outbound track if we have a sender
      const sender = camPC?.getSenders?.().find(s => s.track && s.track.kind === 'video');
      if (sender && newTrack){
        await sender.replaceTrack(newTrack);
        try {
          const p = sender.getParameters();
          p.degradationPreference = 'maintain-framerate';
            // Keep same bitrate cap after swap
          if (!p.encodings || !p.encodings.length) p.encodings = [{ maxBitrate: 900_000, scaleResolutionDownBy: 1 }];
          else p.encodings[0].maxBitrate = 900_000;
          await sender.setParameters(p).catch(()=>{});
        } catch {}
        oldTracks.forEach(t => { try { t.stop(); } catch {} });
        updateCamRtcChip('CamRTC: swapping…');
        // Some browsers might require renegotiation if capabilities changed (rare)
        try {
          if (camPC && camPC.signalingState === 'stable') {
            // Heuristic: if connectionState not 'connected' shortly after swap, force new offer
            setTimeout(async () => {
              try {
                if (!camPC) return;
                const st = camPC.connectionState;
                if (st === 'failed' || st === 'disconnected') {
                  // Tear down and rebuild cleanly
                  try { camPC.close(); } catch {}
                  camPC = null;
                  await ensureCamPeer();
                } else if (st !== 'connected') {
                  // Attempt proactive re-offer without full teardown
                  if (camPC.signalingState === 'stable') {
                    const offer = await camPC.createOffer();
                    await camPC.setLocalDescription(offer);
                    camAwaitingAnswer = true;
                    sendToDisplay({ type:'cam-offer', sdp: offer.sdp });
                    updateCamRtcChip('CamRTC: renegotiate…');
                  }
                }
              } catch {}
            }, 400);
          }
        } catch {}
      } else {
        // No sender yet → build peer
        await ensureCamPeer();
      }
      // Re-apply presentation props to display
      try {
        const pct = Math.max(15, Math.min(60, Number(camSize.value)||28));
        const op  = Math.max(0.2, Math.min(1, (Number(camOpacity.value)||100)/100));
        sendToDisplay({ type:'cam-sizing', pct });
        sendToDisplay({ type:'cam-opacity', opacity: op });
        sendToDisplay({ type:'cam-mirror', on: !!camMirror.checked });
      } catch {}
    } catch (e) {
      warn('switchCamera failed', e);
      throw e;
    }
  }
  async function togglePiP(){ try{ if (document.pictureInPictureElement){ await document.exitPictureInPicture(); } else { await camVideo.requestPictureInPicture(); } } catch(e){ warn('PiP failed', e); } }

  /* ──────────────────────────────────────────────────────────────
   * Local storage + File I/O (DOCX supported)
   * ────────────────────────────────────────────────────────────── */
  const LS_KEY = 'tp_script_v1';
  function saveToLocal(){ try{ localStorage.setItem(LS_KEY, editor.value||''); setStatus('Saved to browser.'); }catch(e){ setStatus('Save failed.'); } }
  function loadFromLocal(){ try{ const v = localStorage.getItem(LS_KEY)||''; editor.value=v; renderScript(v); setStatus('Loaded from browser.'); }catch(e){ setStatus('Load failed.'); } }
  function scheduleAutosave(){ /* optional: attach a debounce here */ }

  // TP: reset-script
  function resetScript(){
    // Stop auto-scroll and reset timer for a clean take
    if (autoTimer) stopAutoScroll();
    resetTimer();
    // Rebuild layout to ensure paraIndex is fresh, but keep content
    renderScript(editor?.value || '');
    // Reset logical position and scroll to the very top
    currentIndex = 0;
    viewer.scrollTop = 0;
    // Reset dead-man timer state
    _wdLastIdx = -1; _wdLastTop = 0; _wdLastT = 0;
    try {
      sendToDisplay({ type:'scroll', top: 0, ratio: 0 });
    } catch {}
    setStatus('Script reset to top for new take.');
  }

  function downloadAsFile(name, text, mime='text/plain'){
    try {
      let type = String(mime || 'text/plain');
      if (type.startsWith('text/') && !/charset=/i.test(type)) type += ';charset=utf-8';
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = name || 'download.txt';
      a.href = url;
      a.rel = 'noopener';
      // Fallback for browsers that ignore the download attribute
      if (typeof a.download === 'undefined') a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} a.remove(); }, 1000);
    } catch (e) {
      try { alert('Download failed: ' + (e?.message || e)); } catch {}
    }
  }

  /* ──────────────────────────────────────────────────────────────
   * Speech recognition start/stop logic
   * ────────────────────────────────────────────────────────────── */
  // TP: speech-start
  function startSpeechSync(){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR){
      setStatus('Speech recognition not supported in this browser.');
      return;
    }
    // Don’t fight with auto-scroll
    if (autoTimer) stopAutoScroll();

    recog = new SR();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = 'en-US';
    // Light phrase bias for domain terms commonly misheard (small boost)
    try {
      recog.maxAlternatives = Math.max(2, recog.maxAlternatives || 0);
      const SGL = (window.SpeechGrammarList || window.webkitSpeechGrammarList);
      if (SGL && 'grammars' in recog) {
  const list = new SGL();
  const domainTerms = ['ban','confiscation','transfer','possession','raid','raids','cell','sale','single'];
        const grammar = '#JSGF V1.0; grammar domain; public <term> = ' + domainTerms.join(' | ') + ' ;';
        // Small weight to gently bias without overfitting
  list.addFromString(grammar, 0.4);
        recog.grammars = list;
        try { if (typeof debug === 'function') debug({ tag:'speech:grammar', installed:true, terms:domainTerms, weight:0.4 }); } catch {}
      } else {
        try { if (typeof debug === 'function') debug({ tag:'speech:grammar', installed:false, reason:'no-SpeechGrammarList' }); } catch {}
      }
    } catch (e) {
      try { if (typeof debug === 'function') debug({ tag:'speech:grammar:error', e:String(e) }); } catch {}
    }

    // Reset backoff on a good start and reflect UI state
    recog.onstart = () => {
      recBackoffMs = 300;
      document.body.classList.add('listening');
      try { recChip.textContent = 'Speech: listening…'; } catch {}
      speechOn = true; try{ window.HUD?.bus?.emit('speech:toggle', true); }catch{}
      // HUD: speech start event
      try { if (typeof HUD?.log === 'function') HUD.log('speech:onstart', { lang: recog.lang, interim: !!recog.interimResults, continuous: !!recog.continuous }); } catch {}
    };

    let _lastInterimAt = 0;
    let _lastInterimHudAt = 0;
    recog.onresult = (e) => {
      let interim = '';
      let finals  = '';
      for (let i = e.resultIndex; i < e.results.length; i++){
        const r = e.results[i];
        if (r.isFinal) finals  += (r[0]?.transcript || '') + ' ';
        else           interim += (r[0]?.transcript || '') + ' ';
      }
      // Finals = strong jumps
      if (finals) {
        // HUD: log a compact final transcript sample
        try {
          const sample = String(finals).trim();
          const preview = sample.length > 64 ? (sample.slice(0, 64) + '…') : sample;
          if (typeof HUD?.log === 'function') HUD.log('speech:final', { len: sample.length, preview });
        } catch {}
        advanceByTranscript(finals, /*isFinal*/true);
        // Optional: if active line element exists, promote a high-priority scroll request
        try {
          const activeEl = (document.getElementById('script')||document).querySelector('p.active');
          if (activeEl) { window.SCROLLER?.onSpeechFinal(activeEl); }
        } catch {}
      }

      // Interims = gentle tracking (every ~150ms)
      const now = performance.now();
      if (interim && (now - _lastInterimAt) > 150) {
        _lastInterimAt = now;
        // Verbose HUD: rate-limit interim previews to <= 2/sec
        try {
          if (__isHudVerbose() && typeof HUD?.log === 'function' && (now - _lastInterimHudAt) > 500) {
            const sample = String(interim).trim();
            const preview = sample.length > 64 ? (sample.slice(0, 64) + '…') : sample;
            HUD.log('speech:interim', { len: sample.length, preview });
            _lastInterimHudAt = now;
          }
        } catch {}
        advanceByTranscript(interim, /*isFinal*/false);
      }
    };

    recog.onerror = (e) => {
      console.warn('speech error', e.error);
      try { if (typeof HUD?.log === 'function') HUD.log('speech:error', { error: e?.error || String(e||'') }); } catch {}
      try { if (typeof debug === 'function') debug({ tag:'speech:error', error: e?.error || String(e||'') }); } catch {}
    };
    recog.onend = () => {
      document.body.classList.remove('listening');
      try { recChip.textContent = 'Speech: idle'; } catch {}
      speechOn = false; try{ window.HUD?.bus?.emit('speech:toggle', false); }catch{}
      // HUD: speech ended (natural or error)
      try { if (typeof HUD?.log === 'function') HUD.log('speech:onend', { autoRestart: !!recAutoRestart, recActive: !!recActive, nextDelayMs: recAutoRestart? recBackoffMs : 0 }); } catch {}
      try { __scrollCtl?.stopAutoCatchup?.(); } catch {}
      // If user didn't stop it, try to bring it back with backoff
      if (recAutoRestart && recActive) {
        setTimeout(() => {
          try {
            recog.start();
            try { recChip.textContent = 'Speech: listening…'; } catch {}
            document.body.classList.add('listening');
          } catch (e) {
            // swallow; next interval will try again
          }
        }, recBackoffMs);
        recBackoffMs = Math.min(recBackoffMs * 1.5, 5000); // cap at 5s
      }
    };

    try { recog.start(); } catch(e){ console.warn('speech start failed', e); }
    // Don't start catch-up unconditionally; the heuristic will kick it in when needed
  }

  // TP: speech-stop
  function stopSpeechSync(){
    try { recog && recog.stop(); } catch(_) {}
    recog = null;
    try { if (typeof HUD?.log === 'function') HUD.log('speech:stop', {}); } catch {}
    try { __scrollCtl?.stopAutoCatchup?.(); } catch {}
  }

  // TP: docx-mammoth
  async function ensureMammoth(){
    if (window.mammoth) return window.mammoth;
    const loadScript = (src) => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = res;
      s.onerror = () => rej(new Error('Failed to load '+src));
      document.head.appendChild(s);
    });
    // Try primary CDN, then alternate, then local vendor copy if present
    const sources = [
      'https://unpkg.com/mammoth/mammoth.browser.min.js',
      'https://cdn.jsdelivr.net/npm/mammoth/mammoth.browser.min.js',
      // Optional local fallback (place file at d:/teleprompter/vendor/mammoth/mammoth.browser.min.js)
      'vendor/mammoth/mammoth.browser.min.js'
    ];
    let lastErr;
    for (const src of sources){
      try { await loadScript(src); if (window.mammoth) return window.mammoth; } catch(e){ lastErr = e; }
    }
    throw new Error('Mammoth failed to load from CDN and local fallback. '+(lastErr?.message||''));
  }

  // TP: upload-file
  async function uploadFromFile(file){
    const lower = (file.name||'').toLowerCase();
    const isDocx = lower.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    if (isDocx){
      try{
        const mammoth = await ensureMammoth();
        const arrayBuffer = await file.arrayBuffer();
        const { value } = await mammoth.extractRawText({ arrayBuffer });
        const text = String(value||'').replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
        // Pipeline: raw (Mammoth) -> Normalize (if available) -> render normalized
        editor.value = text;
        let normalized = false;
        try {
          if (typeof window.normalizeToStandard === 'function') { window.normalizeToStandard(); normalized = true; }
          else if (typeof window.fallbackNormalize === 'function') { window.fallbackNormalize(); normalized = true; }
        } catch {}
        renderScript(editor.value);
        setStatus(`Loaded "${file.name}" (.docx)${normalized ? ' and normalized' : ''}.`);
      } catch(e){ err(e); setStatus('Failed to read .docx: ' + (e?.message||e)); }
      return;
    }

    // Plain text / md / rtf / .text → read as text (RTF will include markup)
    const reader = new FileReader();
    reader.onload = () => { editor.value = reader.result || ''; renderScript(editor.value); setStatus(`Loaded “${file.name}”.`); };
    reader.onerror = () => setStatus('Failed to read file.');
    reader.readAsText(file, 'utf-8');
  }

// Debug HUD moved to debug-tools.js

// ───────────────────────────────────────────────────────────────
// Self-checks: quick asserts at load, with a small pass/fail bar
// ───────────────────────────────────────────────────────────────
// TP: self-checks
function runSelfChecks(){
  const checks = [];

  // 1) Exactly one script include (by current script src if available)
  try {
    const cs = document.currentScript;
    let count = 1, label = 'n/a';
    if (cs && cs.src){
      const src = cs.src;
      count = Array.from(document.scripts).filter(s => s.src && s.src === src).length;
      label = src.split('/').pop();
    }
    checks.push({ name:'Single script include', pass: count === 1, info:`${label} found ${count}` });
  } catch (e) {
    checks.push({ name:'Single script include', pass:true, info:'(skipped)' });
  }

  // 2) Help injected with Normalize/Validate
  try {
    const help = document.getElementById('shortcutsOverlay');
    const has = !!(help && help.querySelector('#normalizeBtn') && help.querySelector('#validateBtn'));
    checks.push({ name:'Help injected', pass: has, info: has ? 'OK' : 'missing pieces' });
  } catch { checks.push({ name:'Help injected', pass:false, info:'error' }); }

  // 3) Matcher constants defined and sane
  try {
  const a = (typeof SIM_THRESHOLD === 'number' && SIM_THRESHOLD > 0 && SIM_THRESHOLD < 1);
  const b = (typeof MATCH_WINDOW_AHEAD === 'number' && MATCH_WINDOW_AHEAD >= 60 && MATCH_WINDOW_AHEAD <= 1000);
  const c = (typeof MATCH_WINDOW_BACK === 'number' && MATCH_WINDOW_BACK >= 0 && MATCH_WINDOW_BACK <= 500);
  const d = (typeof STRICT_FORWARD_SIM === 'number' && STRICT_FORWARD_SIM > 0 && STRICT_FORWARD_SIM < 1);
  const e = (typeof MAX_JUMP_AHEAD_WORDS === 'number' && MAX_JUMP_AHEAD_WORDS >= 1 && MAX_JUMP_AHEAD_WORDS <= 200);
  checks.push({ name:'Matcher constants', pass: a && b && c && d && e, info:`SIM=${typeof SIM_THRESHOLD==='number'?SIM_THRESHOLD:'?'} WIN_F=${typeof MATCH_WINDOW_AHEAD==='number'?MATCH_WINDOW_AHEAD:'?'} WIN_B=${typeof MATCH_WINDOW_BACK==='number'?MATCH_WINDOW_BACK:'?'} STRICT=${typeof STRICT_FORWARD_SIM==='number'?STRICT_FORWARD_SIM:'?'} JUMP=${typeof MAX_JUMP_AHEAD_WORDS==='number'?MAX_JUMP_AHEAD_WORDS:'?'}` });
  } catch { checks.push({ name:'Matcher constants', pass:false, info:'not defined' }); }

  // 4) Display handshake wiring present (openDisplay + sendToDisplay)
  try {
    const ok = (typeof openDisplay === 'function' && typeof sendToDisplay === 'function');
    checks.push({ name:'Display handshake', pass: ok, info: ok ? 'wiring present' : 'functions missing' });
  } catch { checks.push({ name:'Display handshake', pass:false, info:'error' }); }

  // 5) Top Normalize button wired
  try {
    const btn = document.getElementById('normalizeTopBtn');
    const wired = !!(btn && (btn.onclick || btn.dataset.wired));
    checks.push({ name:'Top Normalize button wired', pass: wired, info: wired ? 'OK' : 'missing' });
  } catch { checks.push({ name:'Top Normalize button wired', pass:false, info:'error' }); }

  // 6) Mic bars drawing (top bar meter)
  try {
    const meter = document.getElementById('dbMeterTop');
    const bars = meter ? meter.querySelectorAll('.bar').length : 0;
    let pass = bars >= 8; let info = `${bars} bars`;
    if (audioStream && analyser){
      setTimeout(()=>{
        try {
          const on = meter.querySelectorAll('.bar.on').length;
          const row = checks.find(c=>c.name==='Mic bars drawing');
            if (row){ row.pass = row.pass && on > 0; row.info = `${bars} bars, ${on} on`; renderSelfChecks(checks); }
        } catch {}
      }, 300);
      info += ', sampling…';
    }
    checks.push({ name:'Mic bars drawing', pass, info });
  } catch { checks.push({ name:'Mic bars drawing', pass:false, info:'error' }); }

  renderSelfChecks(checks);
  return checks;
}

function renderSelfChecks(checks){
  try {
    const total = checks.length;
    const passed = checks.filter(c=>c.pass).length;
    const allOk = passed === total;

    // Try to append in the topbar if present; else fixed bar at top
    const host = document.querySelector('.topbar');
    let bar = document.getElementById('selfChecksBar');
    if (!bar){
      bar = document.createElement('div');
      bar.id = 'selfChecksBar';
      bar.style.cssText = host
        ? 'margin-left:8px; padding:4px 8px; border:1px solid var(--edge); border-radius:8px; font-size:12px; cursor:pointer;'
        : 'position:fixed; left:8px; right:8px; top:8px; z-index:99999; padding:8px 10px; border:1px solid var(--edge); border-radius:10px; font-size:13px; cursor:pointer; background:#0e141b; color:var(--fg);'
      ;
      if (host) host.appendChild(bar); else document.body.appendChild(bar);
    }

    bar.style.background = allOk ? (host ? '' : '#0e141b') : (host ? '' : '#241313');
    bar.style.borderColor = allOk ? 'var(--edge)' : '#7f1d1d';
    bar.textContent = `Self-checks: ${passed}/${total} ${allOk ? '✅' : '❌'}  (click)`;

    let panel = document.getElementById('selfChecksPanel');
    if (!panel){
      panel = document.createElement('div');
      panel.id = 'selfChecksPanel';
      panel.className = 'hidden';
      panel.style.cssText = 'position:fixed; right:10px; top:44px; z-index:99999; max-width:420px; background:#0e141b; border:1px solid var(--edge); border-radius:12px; box-shadow:0 8px 28px rgba(0,0,0,.45); padding:10px; color:var(--fg); font:12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;';
      panel.innerHTML = '<div style="margin:4px 0 6px; opacity:.8">Quick startup checks</div><div id="selfChecksList"></div>';
  document.body.appendChild(panel);
  document.addEventListener('click', (e)=>{ if (e.target !== bar && !panel.contains(e.target)) panel.classList.add('hidden'); });
  const aboutCloseBtn = panel.querySelector('#aboutClose');
  if (aboutCloseBtn) aboutCloseBtn.onclick = () => panel.classList.add('hidden');
    }

    const list = panel.querySelector('#selfChecksList');
    list.innerHTML = '';
    for (const c of checks){
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; gap:10px; padding:4px 0; border-bottom:1px dashed var(--edge)';
      row.innerHTML = `<span>${c.pass ? '✅' : '❌'} ${c.name}</span><span class="dim" style="opacity:.8">${c.info||''}</span>`;
      list.appendChild(row);
    }

    bar.onclick = () => { panel.classList.toggle('hidden'); };
  } catch (e) { try { console.warn('Self-checks UI failed:', e); } catch {} }

  // Ensure a top Normalize button exists for self-checks (in case HTML removed it)
  try {
    let topNorm = document.getElementById('normalizeTopBtn');
    if (!topNorm) {
      const targetRow = document.querySelector('.panel .row');
      if (targetRow) {
        topNorm = document.createElement('button');
        topNorm.id = 'normalizeTopBtn';
        topNorm.className = 'btn-chip';
        topNorm.textContent = 'Normalize';
        topNorm.title = 'Normalize current script tags';
        targetRow.appendChild(topNorm);
      }
    }
  } catch {}
}

// ───────────────────────────────────────────────────────────────
// Easter eggs: theme toggle, party meter, advanced tools, :roar
// ───────────────────────────────────────────────────────────────
function installEasterEggs(){
  // ---- restore theme
  try {
    const savedTheme = localStorage.getItem('egg.theme');
    if (savedTheme) document.body.classList.add(savedTheme);
  } catch {}

  // ---- Konami unlock -> toggles 'savanna' class
  const konami = [38,38,40,40,37,39,37,39,66,65];
  let pos = 0;
  window.addEventListener('keydown', (e) => {
    const code = e.keyCode || e.which;
    pos = (code === konami[pos]) ? pos + 1 : 0;
    if (pos === konami.length){
      pos = 0;
      document.body.classList.toggle('savanna');
      const on = document.body.classList.contains('savanna');
      try { localStorage.setItem('egg.theme', on ? 'savanna' : ''); } catch {}
      try { setStatus && setStatus(on ? 'Savanna unlocked 🦁' : 'Savanna off'); } catch {}
    }
  });

  // ---- dB meter party mode (5 clicks within 1.2s)
  const meter = document.getElementById('dbMeter');
  if (meter){
    let clicks = 0, t0 = 0;
    meter.addEventListener('click', () => {
      const t = performance.now();
      if (t - t0 > 1200) clicks = 0;
      t0 = t; clicks++;
      if (clicks >= 5){
        clicks = 0;
        meter.classList.toggle('party');
        try { setStatus && setStatus(meter.classList.contains('party') ? 'Meter party 🎉' : 'Meter normal'); } catch {}
      }
    });
  }

  // ---- Help title alt-click -> show hidden "Advanced" tools
  const helpTitle = document.getElementById('shortcutsTitle');
  const advanced  = document.getElementById('helpAdvanced');
  if (helpTitle && advanced){
    helpTitle.addEventListener('click', (e)=>{
      if (!e.altKey) return;
      advanced.classList.toggle('hidden');
    });
  }

} // <-- close installEasterEggs properly

  // ---- :roar in editor -> quick emoji confetti
  const ed = document.getElementById('editor');
  if (ed){
    ed.addEventListener('input', ()=>{
      const v = ed.value.slice(-5).toLowerCase();
      if (v === ':roar') {
        ed.value = ed.value.slice(0, -5);
        roarOverlay();
        ed.dispatchEvent(new Event('input', {bubbles:true}));
      }
    });
  }

function roarOverlay(){
  const o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;z-index:99999;pointer-events:none';
  o.innerText = '🦁';
  o.style.fontSize = '14vw'; o.style.opacity = '0';
  document.body.appendChild(o);
  requestAnimationFrame(()=>{
    o.style.transition = 'transform .5s ease, opacity .5s ease';
    o.style.transform = 'scale(1.1)'; o.style.opacity = '0.9';
    setTimeout(()=>{ o.style.opacity='0'; o.style.transform='scale(0.9)'; }, 700);
    setTimeout(()=> o.remove(), 1200);
  });
}

// ───────────────────────────────────────────────────────────────
// About popover (Ctrl+Alt+K)
// ───────────────────────────────────────────────────────────────
// About popover IIFE
// About popover (inline inside main scope)
  let about;
  function showAbout(){
    if (!about){
      about = document.createElement('div');
      about.className = 'overlay';
      const built = new Date().toLocaleString();
      const ver = (window.APP_VERSION||'local');
      about.innerHTML = `
      <div class="sheet" style="max-width:560px">
        <header style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <h3 style="margin:0">Teleprompter • About</h3>
          <button class="btn-chip" id="aboutClose">Close</button>
        </header>
        <p style="margin:0 0 6px; color:#96a0aa">Hidden credits & build info</p>
        <pre style="white-space:pre-wrap; user-select:text;">Build: ${built}
JS: v${ver}
Easter eggs: Konami (savanna), Meter party, :roar</pre>
      </div>`;
      document.body.appendChild(about);
      about.addEventListener('click', e => { if (e.target === about) about.classList.add('hidden'); });
      about.querySelector('#aboutClose').onclick = () => about.classList.add('hidden');
    }
    about.classList.remove('hidden');
  }
  window.addEventListener('keydown', (e)=>{
    if (e.ctrlKey && e.altKey && (e.key?.toLowerCase?.() === 'k')){ e.preventDefault(); showAbout(); }
  });
// end about popover
})(); // end main IIFE (restored)
