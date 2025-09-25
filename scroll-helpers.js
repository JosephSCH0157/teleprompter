// Scroll helper utilities — build with a scroller getter so caller can swap roots
// Usage:
//   import { createScrollerHelpers } from './scroll-helpers.js';
//   const sh = createScrollerHelpers(() => document.getElementById('viewer'));
//   sh.scrollByPx(10);

export function createScrollerHelpers(getScroller){
  function clampScrollTop(y){
    const sc = getScroller(); if (!sc) return 0;
    const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
    return Math.max(0, Math.min(Number(y)||0, max));
  }
  function scrollByPx(px){
    const sc = getScroller(); if (!sc) return;
    sc.scrollTop = clampScrollTop(sc.scrollTop + (Number(px)||0));
  }
  function scrollToY(y){
    const sc = getScroller(); if (!sc) return;
    sc.scrollTop = clampScrollTop(Number(y)||0);
  }
  function scrollToEl(el, offset=0){
    const sc = getScroller(); if (!sc || !el) return;
    const y = (el.offsetTop||0) - (Number(offset)||0);
    sc.scrollTop = clampScrollTop(y);
  }
  return { getScroller, clampScrollTop, scrollByPx, scrollToY, scrollToEl };
}
