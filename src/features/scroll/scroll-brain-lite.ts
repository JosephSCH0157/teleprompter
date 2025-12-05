// src/features/scroll/scroll-brain-lite.ts
// A small, self-contained scroll brain with typed modes.
// Does NOT replace your existing PLL/scheduler logic;
// it’s a clean, typed module you can wire in when ready.

import type { ScrollWriter } from '../../scroll/scroll-writer';

export type ScrollMode = 'manual' | 'auto' | 'hybrid' | 'step' | 'rehearsal';

export interface ScrollBrainOptions {
  /**
   * Pixels per frame at ~60fps. Default ~2.4 → ~144 px/sec.
   */
  speedPxPerFrame?: number;

  /**
   * Optional HUD/log hook for debugging.
   */
  log?: (msg: string) => void;
}

export interface ScrollBrain {
  /**
   * Set the current scroll mode.
   */
  setMode(mode: ScrollMode): void;

  /**
   * Get the current scroll mode.
   */
  getMode(): ScrollMode;

  /**
   * Explicitly start the engine. Usually not needed; mode changes
   * will auto-start when appropriate.
   */
  start(): void;

  /**
   * Explicitly stop the engine, regardless of mode.
   */
  stop(): void;
}

let raf: typeof requestAnimationFrame | null =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : null;
let caf: typeof cancelAnimationFrame | null =
  typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame
    : null;

function getWriter(): ScrollWriter | null {
  try {
    const w = (window as any).__tpScrollWrite as ScrollWriter | undefined;
    if (w && typeof w.scrollTo === 'function' && typeof w.scrollBy === 'function') {
      return w;
    }
  } catch {
    // ignore
  }
  try {
    console.warn('[scroll-brain-lite] __tpScrollWrite missing; scroll loop will no-op.');
  } catch {}
  return null;
}

/**
 * Create a simple scroll brain that manages a scroll loop for
 * auto / hybrid modes, and exposes a clean typed interface.
 *
 * This is intentionally decoupled from your PLL/scheduler system.
 */
export function createScrollBrainLite(
  opts: ScrollBrainOptions = {},
): ScrollBrain {
  let mode: ScrollMode = 'manual';
  let timer: number | null = null;
  let frameCount = 0;

  const SPEED = typeof opts.speedPxPerFrame === 'number'
    ? opts.speedPxPerFrame
    : 2.4;

  const log = (msg: string): void => {
    try {
      if (typeof opts.log === 'function') {
        opts.log(msg);
        return;
      }
      // Optional HUD integration
      (window as any).HUD?.log?.('scroll-brain-lite', msg);
    } catch {
      // silent
    }
  };

  function scrollBySpeed(speed: number): void {
    const writer = getWriter();
    if (!writer) return;
    try { writer.scrollBy(speed, { behavior: 'auto' }); } catch {}
  }

  function applyHybridScroll(): void {
    // Placeholder: integrate with ASR/PLL later if desired.
    scrollBySpeed(SPEED);
  }

  function shouldEngineRunForMode(m: ScrollMode): boolean {
    return m === 'auto' || m === 'hybrid';
  }

  function tick(): void {
    if (!raf) {
      timer = null;
      return;
    }

    frameCount++;

    switch (mode) {
      case 'auto':
        scrollBySpeed(SPEED);
        break;
      case 'hybrid':
        applyHybridScroll();
        break;
      case 'step':
        // Step mode is discrete in this brain; no per-frame work.
        break;
      case 'rehearsal':
      case 'manual':
      default:
        // No auto movement in these modes.
        break;
    }

    if (frameCount % 10 === 0) {
      try {
        const y =
          typeof window !== 'undefined'
            ? (window.scrollY || window.pageYOffset || 0)
            : 0;
        log(`scroll[${mode}]: y=${y.toFixed(1)}`);
      } catch {
        // ignore
      }
    }

    // Only keep ticking while an engine-using mode is active.
    if (shouldEngineRunForMode(mode)) {
      timer = raf(tick) as unknown as number;
    } else {
      timer = null;
    }
  }

  function startEngine(): void {
    if (!raf) return;
    if (timer !== null) return;
    timer = raf(tick) as unknown as number;
  }

  function stopEngine(): void {
    if (!caf) {
      timer = null;
      return;
    }
    if (timer === null) return;
    caf(timer);
    timer = null;
  }

  function setMode(next: ScrollMode): void {
    if (mode === next) return;
    mode = next;
    log(`Scroll mode → ${mode}`);

    // Engine decision lives here, not in callers.
    if (shouldEngineRunForMode(mode)) {
      startEngine();
    } else {
      stopEngine();
    }
  }

  function getMode(): ScrollMode {
    return mode;
  }

  function start(): void {
    if (shouldEngineRunForMode(mode)) {
      startEngine();
    }
  }

  function stop(): void {
    stopEngine();
  }

  return {
    setMode,
    getMode,
    start,
    stop,
  };
}
