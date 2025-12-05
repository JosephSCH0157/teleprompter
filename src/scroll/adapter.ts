import { createScrollerHelpers } from './scroll-helpers';
import type { ScrollWriter } from './scroll-writer';

declare global {
  interface Window {
    __tpScrollWrite?: ScrollWriter;
    __tpScrollSSOT?: 'ts' | 'js';
  }
}

const helpers = createScrollerHelpers(() => document.getElementById('viewer') as HTMLElement | null);

try {
  if (!window.__tpScrollSSOT || window.__tpScrollSSOT === 'ts') {
    window.__tpScrollSSOT = 'ts';
    const writer: ScrollWriter = {
      scrollTo(top: number, opts?: { behavior?: ScrollBehavior }) {
        try {
          helpers.requestScroll(Number(top) || 0);
        } catch {}
      },
      scrollBy(delta: number, opts?: { behavior?: ScrollBehavior }) {
        try {
          helpers.scrollByPx?.(Number(delta) || 0);
        } catch {}
      },
      ensureVisible(top: number, paddingPx = 80) {
        try {
          const sc = helpers.getScroller();
          if (!sc) return;
          const h = sc.clientHeight || 0;
          const cur = sc.scrollTop || 0;
          const pad = Math.max(0, paddingPx | 0);
          const min = cur + pad;
          const max = cur + h - pad;
          if (top < min) helpers.requestScroll(Math.max(0, top - pad));
          else if (top > max) helpers.requestScroll(Math.max(0, top - h + pad));
        } catch {}
      },
    };
    if (!window.__tpScrollWrite) {
      window.__tpScrollWrite = writer;
    }
  }
} catch {}

export { };
