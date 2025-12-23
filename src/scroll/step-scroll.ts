/**
 * StepScrollEngine — manual gearbox for teleprompter scrolling.
 *
 * Responsibilities:
 * - Provide deterministic, discrete scroll movements (lines or blocks).
 * - Primary mode: exclusively handles scroll (no continuous engines).
 * - Helper mode: can nudge viewport while continuous engines remain active.
 * - Respect clampActive(): step movement is disabled in rehearsal.
 * - Never touches scroll-brain or engines directly.
 * - Always scrolls through scroll-helpers (scrollByPx / scrollByLines).
 *
 * Not responsible for:
 * - Deciding scrollMode (mode-router handles that).
 * - Continuous scrolling (timed/WPM/hybrid).
 * - ASR logic.
 * - UI.
 */

import {
  scrollByLines,
  scrollByPx,
  getViewportMetrics,
  clampActive,
} from './scroll-helpers';

export interface StepScrollEngine {
  enablePrimaryMode(): void;
  enableHelperMode(): void;
  disable(): void;
}

export function createStepScrollEngine(): StepScrollEngine {
  let enabled = false;
  let primary = false;

  // --- Key Handler ---------------------------------------------------------
  function onKeyDown(ev: KeyboardEvent) {
    if (!enabled) return;
    if (clampActive()) return; // Rehearsal clamp blocks programmatic scroll.

    switch (ev.key) {
      case 'ArrowDown':
        ev.preventDefault();
        scrollByLines(+1);
        break;

      case 'ArrowUp':
        ev.preventDefault();
        scrollByLines(-1);
        break;

      case 'PageDown': {
        ev.preventDefault();
        const { viewportHeight, height } = getViewportMetrics();
        const h = viewportHeight || height || 0;
        scrollByPx(h * 0.8); // deterministic block step
        break;
      }

      case 'PageUp': {
        ev.preventDefault();
        const { viewportHeight, height } = getViewportMetrics();
        const h = viewportHeight || height || 0;
        scrollByPx(-h * 0.8); // deterministic block step
        break;
      }

      default:
        break;
    }
  }

  // --- Listener Management -------------------------------------------------
  function attachListeners() {
    try {
      window.addEventListener('keydown', onKeyDown, { passive: false });
    } catch {
      // ignore
    }
  }

  function detachListeners() {
    try {
      window.removeEventListener('keydown', onKeyDown);
    } catch {
      // ignore
    }
  }

  // --- Public API ----------------------------------------------------------
  function enablePrimaryMode() {
    if (enabled && primary) return; // Already in primary mode.
    enabled = true;
    primary = true;
    detachListeners();
    attachListeners();
  }

  function enableHelperMode() {
    if (enabled && !primary) return; // Already in helper mode.
    enabled = true;
    primary = false;
    detachListeners();
    attachListeners();
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    primary = false;
    detachListeners();
  }

  return {
    enablePrimaryMode,
    enableHelperMode,
    disable,
  };
}

export default createStepScrollEngine;
