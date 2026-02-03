import type { ScrollIntent } from './scroll-intent';

const EVENT = 'tp:scroll:intent';

export function emitScrollIntent(intent: ScrollIntent) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: intent }));
}

export function onScrollIntent(cb: (i: ScrollIntent) => void) {
  const h = (e: Event) => cb((e as CustomEvent).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
