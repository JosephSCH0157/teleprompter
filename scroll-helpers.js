// Scroll helper utilities — build with a scroller getter so caller can swap roots
// Usage:
//   import { createScrollerHelpers } from './scroll-helpers.js';
//   const sh = createScrollerHelpers(() => document.getElementById('viewer'));
//   sh.scrollByPx(10);

export function createScrollerHelpers(getScroller){
  let _pendingTop = null, _rafId = 0;
  // Sticky band tolerance (px) to avoid micro scroll oscillations
  function getInBandEps(){
    try {
      const ls = Number(localStorage.getItem('tp_in_band_eps'));
      if (Number.isFinite(ls) && ls >= 0) return ls;
    } catch {}
    try {
      const w = Number(window.__TP_IN_BAND_EPS);
      if (Number.isFinite(w) && w >= 0) return w;
    } catch {}
    return 12; // default
  }
  function clampScrollTop(y){
    const sc = getScroller(); if (!sc) return 0;
    const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
    return Math.max(0, Math.min(Number(y)||0, max));
  }
  // Single-writer scroll scheduler: coalesce writes into one rAF commit
  function requestScroll(top){
    const sc = getScroller(); if (!sc) return;
    const target = clampScrollTop(top);
    // Sticky band gate: if we're already within epsilon of target, skip
    try {
      const cur = sc.scrollTop || 0;
      const eps = getInBandEps();
      const withinBand = Math.abs(cur - target) <= eps;
      if (withinBand) {
        try { if (typeof debug === 'function') debug({ tag:'scroll:in-band-skip', top: cur, target, eps }); } catch {}
        return;
      }
    } catch {}
    _pendingTop = target;
    try { window.__lastScrollTarget = _pendingTop; } catch {}
    if (_rafId) return;
    _rafId = requestAnimationFrame(() => {
      const t = _pendingTop; _pendingTop = null; _rafId = 0;
      try { sc.scrollTo({ top: t, behavior: 'auto' }); } catch { sc.scrollTop = t; }
      try { window.__lastScrollTarget = null; } catch {}
      // Do NOT read layout here; defer reads to next frame.
    });
  }
  function scrollByPx(px){
    const sc = getScroller(); if (!sc) return;
    const target = clampScrollTop(sc.scrollTop + (Number(px)||0));
    requestScroll(target);
  }
  function scrollToY(y){
    const sc = getScroller(); if (!sc) return;
    requestScroll(clampScrollTop(Number(y)||0));
  }
  function scrollToEl(el, offset=0){
    const sc = getScroller(); if (!sc || !el) return;
    const y = (el.offsetTop||0) - (Number(offset)||0);
    requestScroll(clampScrollTop(y));
  }
  return { getScroller, clampScrollTop, scrollByPx, scrollToY, scrollToEl, requestScroll };
}
