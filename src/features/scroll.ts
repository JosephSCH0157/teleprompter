import { setMode as setScrollMode, getMode as getScrollMode } from '../scroll/router';
import type { ScrollMode } from '../scroll/scroll-brain';
import * as Auto from './autoscroll';

function bindAutoControls() {
  // Intentionally left empty; auto controls are owned by autoscroll.ts bindings.
}

function bindRouterControls() {
  try {
    const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
    if (sel && !sel.dataset.bound) {
      sel.dataset.bound = '1';
      sel.value = (getScrollMode() || '').toLowerCase();
      sel.addEventListener('change', () => {
        const mode = ((sel.value || '').toLowerCase() as ScrollMode);
        setScrollMode(mode);
      });
    }
  } catch {}
}

export function initScrollFeature() {
  bindAutoControls();
  bindRouterControls();
}

// Back-compat alias kept for legacy callers
export const initScroll = initScrollFeature;
