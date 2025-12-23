/**
 * Rehearsal Engine — Phase 4.6 Clamp Mode
 *
 * Responsibilities:
 * - Provide a clean, minimal interface to activate and deactivate
 *   the global "clamp" state used by scroll-helpers.
 * - Turning clamp on blocks ALL programmatic scrolling (Timed/WPM/Hybrid/ASR/Step).
 * - Turning clamp off allows mode-router to re-enable engines appropriate to the mode.
 *
 * Non-responsibilities:
 * - No scrolling.
 * - No ASR alignment.
 * - No speed setting.
 * - No interacting with scroll-brain.
 * - No DOM.
 * - No mode logic.
 * - No listener management (step-scroll handles that).
 */

import { setClampActive } from './scroll-helpers';

export interface RehearsalEngine {
  enableClamp(): void;
  disableClamp(): void;
}

export function createRehearsalEngine(): RehearsalEngine {
  let active = false;

  function enableClamp() {
    if (active) return;
    active = true;
    setClampActive(true);
  }

  function disableClamp() {
    if (!active) return;
    active = false;
    setClampActive(false);
  }

  return {
    enableClamp,
    disableClamp,
  };
}

export default createRehearsalEngine;
