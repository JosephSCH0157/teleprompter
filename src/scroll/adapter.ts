import { createScrollerHelpers } from './scroll-helpers';

declare global {
  interface Window {
    __tpScrollWrite?: (_top: number) => void;
    __tpScrollSSOT?: 'ts' | 'js';
  }
}

const helpers = createScrollerHelpers(() => document.getElementById('viewer') as HTMLElement | null);

try {
  if (!window.__tpScrollSSOT || window.__tpScrollSSOT === 'ts') {
    window.__tpScrollSSOT = 'ts';
    window.__tpScrollWrite = window.__tpScrollWrite || function (top: number) {
      try {
        helpers.requestScroll(Number(top) || 0);
      } catch {}
    };
  }
} catch {}

export { };

