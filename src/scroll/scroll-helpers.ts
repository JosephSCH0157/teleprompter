import { requestWrite } from '../boot/scheduler';

export interface ViewportMetrics {
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
  pxPerLine: number;
  pxPerWord: number;
  height?: number; // alias for viewportHeight
}

const defaultViewer = () =>
  (document.getElementById('viewer') as HTMLElement | null) ||
  (document.querySelector('[data-role=\"viewer\"]') as HTMLElement | null);

const clampGuard = (target: number, max: number): boolean => {
  try {
    const guard = (window as any).__tpClampGuard;
    if (typeof guard === 'function') return !!guard(target, max);
  } catch {}
  return true;
};

export function clampActive(): boolean {
  try { return !!(window as any).__tpClampActive; } catch { return false; }
}

export function setClampActive(on: boolean): void {
  try { (window as any).__tpClampActive = !!on; } catch {}
}

function clampScrollTop(sc: HTMLElement, y: number): number {
  const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
  const t = Math.max(0, Math.min(Number(y) || 0, max));
  return clampGuard(t, max) ? t : sc.scrollTop || 0;
}

export function scrollByPx(dy: number, getScroller = defaultViewer): void {
  if (clampActive()) return;
  const sc = getScroller();
  if (!sc) return;
  const target = clampScrollTop(sc, (sc.scrollTop || 0) + (Number(dy) || 0));
  requestWrite(() => {
    try { sc.scrollTop = target; } catch {}
  });
}

export function scrollByLines(n: number, getScroller = defaultViewer): void {
  if (clampActive()) return;
  const sc = getScroller();
  if (!sc) return;
  const metrics = getViewportMetrics(getScroller);
  const dy = (Number(n) || 0) * metrics.pxPerLine;
  scrollByPx(dy, getScroller);
}

export function centerLine(lineIndex: number, getScroller = defaultViewer): void {
  if (clampActive()) return;
  const sc = getScroller();
  if (!sc || !Number.isFinite(lineIndex)) return;
  const idx = Math.max(0, Math.floor(lineIndex));
  const line =
    sc.querySelector<HTMLElement>(`.line[data-i=\"${idx}\"]`) ||
    sc.querySelector<HTMLElement>(`.line[data-index=\"${idx}\"]`);
  if (!line) return;
  const offset = Math.max(0, (sc.clientHeight - line.offsetHeight) / 2);
  const target = clampScrollTop(sc, (line.offsetTop || 0) - offset);
  requestWrite(() => {
    try { sc.scrollTop = target; } catch {}
  });
}

export function getViewportMetrics(getScroller = defaultViewer): ViewportMetrics {
  const sc = getScroller();
  const root = document.documentElement;
  const cs = root ? getComputedStyle(root) : null;
  const fontSize = cs ? parseFloat(cs.getPropertyValue('--tp-font-size')) || 56 : 56;
  const lineHeight = cs ? parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4 : 1.4;
  const pxPerLine = fontSize * lineHeight;
  const pxPerWord = pxPerLine / 6; // coarse default; refined later by typography integration
  if (!sc) {
    return {
      scrollTop: 0,
      viewportHeight: 0,
      scrollHeight: 0,
      pxPerLine,
      pxPerWord,
    };
  }
  return {
    scrollTop: sc.scrollTop || 0,
    viewportHeight: sc.clientHeight || 0,
    height: sc.clientHeight || 0,
    scrollHeight: sc.scrollHeight || 0,
    pxPerLine,
    pxPerWord,
  };
}

// Back-compat helper for legacy TS wiring; returns the same helpers but uses the provided getter.
export type ScrollerGetter = () => HTMLElement | null;
export function createScrollerHelpers(getScroller: ScrollerGetter) {
  return {
    getScroller,
    clampScrollTop: (y: number) => {
      const sc = getScroller();
      if (!sc) return 0;
      return clampScrollTop(sc, y);
    },
    scrollByPx: (px: number) => scrollByPx(px, () => getScroller()),
    scrollByLines: (n: number) => scrollByLines(n, () => getScroller()),
    centerLine: (i: number) => centerLine(i, () => getScroller()),
    requestScroll: (top: number) => {
      if (clampActive()) return;
      const sc = getScroller();
      if (!sc) return;
      const target = clampScrollTop(sc, top);
      requestWrite(() => {
        try { sc.scrollTop = target; } catch {}
      });
    },
  };
}
