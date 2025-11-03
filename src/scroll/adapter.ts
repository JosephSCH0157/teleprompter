import { createScrollerHelpers } from './scroll-helpers';

declare global {
  interface Window {
    __tpScrollWrite?: (_top: number) => void;
  }
}

const helpers = createScrollerHelpers(() => document.getElementById('viewer') as HTMLElement | null);

window.__tpScrollWrite = window.__tpScrollWrite || function (top: number) {
  try {
    helpers.requestScroll(Number(top) || 0);
  } catch {}
};

export { };

