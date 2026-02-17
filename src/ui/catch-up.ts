export type CatchUpDeps = {
  getScroller: () => HTMLElement | null;
  getMarkerOffsetPx: () => number;
  getMarkerLineIndex: () => number | null;
  getLineByIndex: (index: number) => HTMLElement | null;
  scrollToTop: (top: number) => void;
  onCatchUp?: (info: {
    index: number;
    line: HTMLElement;
    markerOffset: number;
    targetTop: number;
    scroller: HTMLElement;
    prevTop: number;
  }) => void;
  devLog?: (...args: any[]) => void;
};

function elementTopRelativeTo(el: HTMLElement, scroller: HTMLElement): number {
  try {
    const rect = el.getBoundingClientRect();
    const scRect = scroller.getBoundingClientRect();
    return rect.top - scRect.top + scroller.scrollTop;
  } catch {
    return el.offsetTop || 0;
  }
}

export function wireCatchUpButton(deps: CatchUpDeps): void {
  const btn = document.getElementById('catchUpBtn') as HTMLButtonElement | null;
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';

  btn.addEventListener('click', () => {
    const manualPending = (window as any).__tpAsrManualAnchorPending;
    if (manualPending) {
      deps.devLog?.('[catchup] manual anchor pending, skipping catch-up', manualPending);
      try {
        window.toast?.('Manual re-anchor pending — say a phrase to confirm your position.', { type: 'info' });
      } catch {
        // ignore
      }
      return;
    }
    const scroller = deps.getScroller();
    if (!scroller) return;
    const prevTop = scroller.scrollTop || 0;
    const markerIndex = deps.getMarkerLineIndex();
    if (!Number.isFinite(markerIndex as number) || (markerIndex as number) < 0) {
      deps.devLog?.('[catchup] marker line index not found');
      return;
    }
    const line = deps.getLineByIndex(Math.max(0, Math.floor(markerIndex as number)));
    if (!line) {
      deps.devLog?.('[catchup] no line element found for marker index', markerIndex);
      return;
    }
    const lineTop = elementTopRelativeTo(line, scroller);
    const marker = Math.max(0, Number(deps.getMarkerOffsetPx()) || 0);
    const targetTop = Math.max(0, lineTop - marker);
    deps.devLog?.('[catchup]', {
      lineTop,
      marker,
      targetTop,
      scroller: scroller.id || scroller.tagName,
    });
    deps.scrollToTop(targetTop);
    deps.onCatchUp?.({
      index: Math.max(0, Math.floor(markerIndex as number)),
      line,
      markerOffset: marker,
      targetTop,
      scroller,
      prevTop,
    });
  });
}
