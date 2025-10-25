// Scroll helper utilities — build with a scroller getter so caller can swap roots
// Usage:
//   import { createScrollerHelpers } from './scroll-helpers.js';
//   const sh = createScrollerHelpers(() => document.getElementById('viewer'));
//   sh.scrollByPx(10);

import { requestWrite } from './src/boot/scheduler.js';

export function createScrollerHelpers(getScroller) {
  let _pendingTop = null,
    _rafId = 0;
  function clampScrollTop(y) {
    const sc = getScroller();
    if (!sc) return 0;
    const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
    return Math.max(0, Math.min(Number(y) || 0, max));
  }
  // Single-writer scroll scheduler: coalesce writes into one rAF commit
  function requestScroll(top) {
    const sc = getScroller();
    if (!sc) return;
    let t = clampScrollTop(top);
    try {
      if (typeof window.__tpClampGuard === 'function') {
        if (!window.__tpClampGuard(t, Math.max(0, sc.scrollHeight - sc.clientHeight))) return;
      }
    } catch {}
    _pendingTop = t;
    try {
      window.__lastScrollTarget = _pendingTop;
    } catch {}
    if (_rafId) return;
    _rafId = requestAnimationFrame(() => {
      const t = _pendingTop;
      _pendingTop = null;
      _rafId = 0;
      // Use scheduler to perform DOM write in a single-writer queue
      requestWrite(() => {
        try {
          sc.scrollTo({ top: t, behavior: 'auto' });
        } catch {
          sc.scrollTop = t;
        }
        try {
          window.__lastScrollTarget = null;
        } catch {}
      });
      // Do NOT read layout here; defer reads to next frame.
    });
  }
  function scrollByPx(px) {
    const sc = getScroller();
    if (!sc) return;
    const target = clampScrollTop(sc.scrollTop + (Number(px) || 0));
    requestScroll(target);
  }
  function scrollToY(y) {
    const sc = getScroller();
    if (!sc) return;
    requestScroll(clampScrollTop(Number(y) || 0));
  }
  function scrollToEl(el, offset = 0) {
    const sc = getScroller();
    if (!sc || !el) return;
    const y = (el.offsetTop || 0) - (Number(offset) || 0);
    const t = clampScrollTop(y);
    try {
      if (typeof window.__tpClampGuard === 'function') {
        if (!window.__tpClampGuard(t, Math.max(0, sc.scrollHeight - sc.clientHeight))) return;
      }
    } catch {}
    requestScroll(t);
  }
  return { getScroller, clampScrollTop, scrollByPx, scrollToY, scrollToEl, requestScroll };
}
