export type CatchUpDeps = {
  getScroller: () => HTMLElement | null;
  getMarkerOffsetPx: () => number;
  getActiveLineEl: () => HTMLElement | null;
  scrollToTop: (top: number) => void;
  devLog?: (...args: any[]) => void;
};

function elementTopRelativeTo(el: HTMLElement, scroller: HTMLElement): number {
  try {
    const isWin =
      scroller === document.scrollingElement ||
      scroller === document.documentElement ||
      scroller === document.body;
    if (isWin) {
      const rect = el.getBoundingClientRect();
      const scrollTop =
        window.scrollY || window.pageYOffset || scroller.scrollTop || 0;
      return rect.top + scrollTop;
    }
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
    const scroller = deps.getScroller();
    const line = deps.getActiveLineEl();
    if (!scroller) return;
    if (!line) {
      deps.devLog?.('[catchup] no active line element found (nothing to catch up to)');
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
  });
}
