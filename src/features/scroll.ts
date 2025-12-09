import { createScrollModeRouter } from './scroll/mode-router';
import { getAutoScrollApi } from './scroll/auto-adapter';
import { appStore } from '../state/app-store';
function bindAutoControls() {
  // Intentionally left empty; auto controls are owned by autoscroll.ts bindings.
}

function bindRouterControls() {
  try {
    // Create the router against the store/auto brain; DOM select is bridged elsewhere (mode-bridge.ts).
    const auto = getAutoScrollApi();
    const router = createScrollModeRouter({ auto, store: appStore });
    // Expose for legacy callers without touching #scrollMode directly.
    if (!(window as any).__tpScrollMode) {
      (window as any).__tpScrollMode = router;
    }
  } catch {}
}

export function initScrollFeature() {
  bindAutoControls();
  bindRouterControls();
}

// Back-compat alias kept for legacy callers
export const initScroll = initScrollFeature;
