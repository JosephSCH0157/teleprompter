// Step scroll engine: manual gearbox for arrow/page/pedal input.
// Primary mode: only steps move the viewport (no continuous engines).
// Helper mode: steps nudge while continuous engines may run.

import { clampActive, getViewportMetrics, scrollByLines, scrollByPx } from './scroll-helpers';

export interface StepScrollEngine {
  enablePrimaryMode(): void;
  enableHelperMode(): void;
  disable(): void;
}

type KeyHandler = (e: KeyboardEvent) => void;

export function createStepScrollEngine(): StepScrollEngine {
  let enabled = false;
  let primary = false;

  const onKey: KeyHandler = (e) => {
    if (!enabled) return;
    if (clampActive()) return;
    const k = (e.key || '').toLowerCase();
    switch (k) {
      case 'arrowdown':
        e.preventDefault();
        scrollByLines(+1);
        break;
      case 'arrowup':
        e.preventDefault();
        scrollByLines(-1);
        break;
      case 'pagedown': {
        e.preventDefault();
        const { viewportHeight } = getViewportMetrics();
        scrollByPx(viewportHeight * 0.8);
        break;
      }
      case 'pageup': {
        e.preventDefault();
        const { viewportHeight } = getViewportMetrics();
        scrollByPx(-viewportHeight * 0.8);
        break;
      }
      default:
        // ignore
        break;
    }
  };

  const addListeners = () => {
    try {
      window.addEventListener('keydown', onKey, { capture: true });
    } catch {
      // ignore
    }
  };

  const removeListeners = () => {
    try {
      window.removeEventListener('keydown', onKey, { capture: true });
    } catch {
      // ignore
    }
  };

  return {
    enablePrimaryMode: () => {
      enabled = true;
      primary = true;
      addListeners();
    },
    enableHelperMode: () => {
      enabled = true;
      primary = false;
      addListeners();
    },
    disable: () => {
      enabled = false;
      primary = false;
      removeListeners();
    },
  };
}

export default createStepScrollEngine;
