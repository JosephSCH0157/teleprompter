import { requestWrite } from '../scroll/scheduler';

export type ScrollerGetter = () => HTMLElement | null | undefined;

export function createScrollerHelpers(getScroller: ScrollerGetter) {
  let _pendingTop: number | null = null;
  let _rafId = 0;

  function clampScrollTop(y: any) {
    const sc = getScroller();
    if (!sc) return 0;
    const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
    return Math.max(0, Math.min(Number(y) || 0, max));
  }

  function requestScroll(top: number) {
    const sc = getScroller();
    if (!sc) return;
    const t = clampScrollTop(top);
    try {
      if (typeof (window as any).__tpClampGuard === 'function') {
        if (!(window as any).__tpClampGuard(t, Math.max(0, sc.scrollHeight - sc.clientHeight))) return;
      }
    } catch {}
    _pendingTop = t;
    try {
      (window as any).__lastScrollTarget = _pendingTop;
    } catch {}
    if (_rafId) return;
    _rafId = requestAnimationFrame(() => {
      const t2 = _pendingTop;
      _pendingTop = null;
      _rafId = 0;
      // Use scheduler to perform DOM write in a single-writer queue
      requestWrite(() => {
        try {
          sc.scrollTo({ top: t2 as number, behavior: 'auto' });
        } catch {
          try {
            (sc as any).scrollTop = t2;
          } catch {}
        }
        try {
          (window as any).__lastScrollTarget = null;
        } catch {}
      });
    });
  }

  function scrollByPx(px: number) {
    const sc = getScroller();
    if (!sc) return;
    const target = clampScrollTop((sc.scrollTop || 0) + (Number(px) || 0));
    requestScroll(target);
  }

  function scrollToY(y: number) {
    const sc = getScroller();
    if (!sc) return;
    requestScroll(clampScrollTop(Number(y) || 0));
  }

  function scrollToEl(el: HTMLElement | null, offset = 0) {
    const sc = getScroller();
    if (!sc || !el) return;
    const y = (el.offsetTop || 0) - (Number(offset) || 0);
    const t = clampScrollTop(y);
    try {
      if (typeof (window as any).__tpClampGuard === 'function') {
        if (!(window as any).__tpClampGuard(t, Math.max(0, sc.scrollHeight - sc.clientHeight))) return;
      }
    } catch {}
    requestScroll(t);
  }

  return { getScroller, clampScrollTop, scrollByPx, scrollToY, scrollToEl, requestScroll };
}
