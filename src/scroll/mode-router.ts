/**
 * Mode Router — FINAL PHASE 4.6 Integration
 *
 * Drives all six engines:
 *  - timedEngine
 *  - wpmEngine
 *  - asrAlignmentEngine
 *  - stepScrollEngine
 *  - rehearsalEngine (clamp)
 *  - scrollBrain (master tick controller)
 *
 * Mode matrix is STRICTLY defined here.
 *
 * Modes:
 *  - 'timed'
 *  - 'wpm'
 *  - 'asr'
 *  - 'hybrid'
 *  - 'step'
 *  - 'rehearsal'
 *
 * No DOM, no UI, no persistence.
 */

import { recordModeTransition } from './audit';

export interface ModeRouterDeps {
  scrollBrain: any;
  timedEngine: any;
  wpmEngine: any;
  asrEngine: any;
  stepEngine: any;
  rehearsalEngine: any;
}

export function createModeRouter(deps: ModeRouterDeps) {
  const {
    scrollBrain,
    timedEngine,
    wpmEngine,
    asrEngine,
    stepEngine,
    rehearsalEngine,
  } = deps;

  let currentMode: string = 'manual';

  function getSessionPhase(): string {
    try {
      if (typeof window === 'undefined') return '';
      const store = (window as any).__tpStore;
      const phase = store?.get?.('session.phase');
      return String(phase || '');
    } catch {
      return '';
    }
  }

  function disableAllEngines() {
    try { timedEngine.disable(); } catch {}
    try { wpmEngine.disable(); } catch {}
    try { asrEngine.disable(); } catch {}
    try { stepEngine.disable(); } catch {}
    try { rehearsalEngine.disableClamp(); } catch {}
    try { scrollBrain.stopEngine(); } catch {}
  }

  function applyMode(mode: string) {
    if (!mode) return;
    if (mode === currentMode) return;

    const prevMode = currentMode;
    currentMode = mode;
    recordModeTransition({
      writer: 'scroll/mode-router',
      from: prevMode,
      to: mode,
      phase: getSessionPhase(),
      source: 'router',
    });
    disableAllEngines();

    switch (mode) {
      case 'timed':
        timedEngine.enable();
        stepEngine.enableHelperMode();
        scrollBrain.startEngine();
        break;

      case 'wpm':
        wpmEngine.enable();
        stepEngine.enableHelperMode();
        scrollBrain.startEngine();
        break;

      case 'asr':
        asrEngine.enable();
        stepEngine.enableHelperMode();
        scrollBrain.startEngine();
        break;

      case 'hybrid':
        wpmEngine.enable();
        asrEngine.enable();
        stepEngine.enableHelperMode();
        scrollBrain.startEngine();
        break;

      case 'step':
        stepEngine.enablePrimaryMode();
        break;

      case 'rehearsal':
        rehearsalEngine.enableClamp();
        break;

      default:
        // unknown mode => keep everything disabled
        break;
    }
  }

  return {
    applyMode,
    getCurrentMode: () => currentMode,
  };
}

export default createModeRouter;
