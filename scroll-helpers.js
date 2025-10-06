// Scroll helper utilities — build with a scroller getter so caller can swap roots
// Usage:
//   import { createScrollerHelpers } from './scroll-helpers.js';
//   const sh = createScrollerHelpers(() => document.getElementById('viewer'));
//   sh.scrollByPx(10);

export function createScrollerHelpers(getScroller){
  let _pendingTop = null, _rafId = 0;
  function clampScrollTop(y){
    const sc = getScroller(); if (!sc) return 0;
    const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
    return Math.max(0, Math.min(Number(y)||0, max));
  }
  // Single-writer scroll scheduler: coalesce writes into one rAF commit
  function requestScroll(top){
    const sc = getScroller(); if (!sc) return;
    _pendingTop = clampScrollTop(top);
    try { window.__lastScrollTarget = _pendingTop; } catch {}
    if (_rafId) return;
    _rafId = requestAnimationFrame(() => {
      const t = _pendingTop; _pendingTop = null; _rafId = 0;
      try { window.SCROLLER?.request({ y: t, priority: 4, src: 'helper', reason: 'scroll-helpers' }); } catch {}
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
  function scrollToElAtMarker(el){
    const sc = getScroller(); if (!sc || !el) return;
    try {
      const vRect = sc.getBoundingClientRect ? sc.getBoundingClientRect() : { top: 0 };
      const marker = document.getElementById('marker');
      let markerY = 0;
      if (marker && marker.getBoundingClientRect) {
        const mRect = marker.getBoundingClientRect();
        markerY = mRect.top - vRect.top;
      } else {
        const pct = (typeof window.MARKER_PCT === 'number' ? window.MARKER_PCT : 0.40);
        markerY = (sc.clientHeight || 0) * pct;
      }
      const y = (el.offsetTop || 0) - markerY;
      requestScroll(clampScrollTop(y));
    } catch {
      // fallback: center-ish using 40%
      const y = (el.offsetTop||0) - Math.round((getScroller()?.clientHeight||0) * 0.40);
      requestScroll(clampScrollTop(y));
    }
  }
  return { getScroller, clampScrollTop, scrollByPx, scrollToY, scrollToEl, scrollToElAtMarker, requestScroll };
}
