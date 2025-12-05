import { createScrollModeRouter } from './scroll/mode-router';
import { getAutoScrollApi } from './scroll/auto-adapter';
import type { ScrollMode } from '../scroll/scroll-brain';
function bindAutoControls() {
  // Intentionally left empty; auto controls are owned by autoscroll.ts bindings.
}

function bindRouterControls() {
  try {
    const auto = getAutoScrollApi();
    const router = createScrollModeRouter({ auto });
    const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
    if (sel && !sel.dataset.bound) {
      sel.dataset.bound = '1';
      sel.value = (router.getMode() || '').toLowerCase();
      sel.addEventListener('change', () => {
        const mode = ((sel.value || '').toLowerCase() as ScrollMode);
        router.setMode(mode);
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
