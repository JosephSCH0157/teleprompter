// src/features/scroll/mode-router.ts
// Central router for scroll modes. Decides which subsystems are active:
// - auto/hybrid scroll engine
// - step scroll
// - rehearsal mode
// and keeps them in sync with the global scrollMode value.

import type { StepScrollAPI } from './step-scroll';

// These should match whatever you’re already using as mode labels
export type ScrollMode =
  | 'manual'
  | 'auto'
  | 'hybrid'
  | 'step'
  | 'rehearsal';

export interface AutoScrollAPI {
  setEnabled(on: boolean): void;
  setMode?(mode: 'auto' | 'hybrid'): void;
}

export interface RehearsalApi {
  enable(): void;
  disable(): void;
  isActive(): boolean;
}

export interface StoreLike {
  subscribe?(key: string, cb: (value: unknown) => void): () => void;
  get?(key: string): unknown;
  set?(key: string, value: unknown): void;
}

export interface ScrollModeRouterDeps {
  store?: StoreLike | null;
  storeKey?: string; // usually 'scrollMode'
  auto?: AutoScrollAPI | null;
  step?: StepScrollAPI | null;
  rehearsal?: RehearsalApi | null;
  log?: (msg: string) => void;
}

export interface ScrollModeRouter {
  setMode(next: ScrollMode): void;
  getMode(): ScrollMode;
  dispose(): void;
}

function asMode(v: unknown, fallback: ScrollMode = 'manual'): ScrollMode {
  const m = String(v || '').toLowerCase();
  if (m === 'auto' || m === 'hybrid' || m === 'step' || m === 'rehearsal') {
    return m as ScrollMode;
  }
  return fallback;
}

export function createScrollModeRouter(
  deps: ScrollModeRouterDeps,
): ScrollModeRouter {
  const log =
    deps.log ||
    ((msg: string) => {
      try {
        (window as any).HUD?.log?.('mode-router', msg);
      } catch {
        // ignore
      }
    });

  const key = deps.storeKey || 'scrollMode';
  let mode: ScrollMode = 'manual';
  let unsubStore: (() => void) | null = null;
  let updatingFromStore = false;

  function applyToStore(next: ScrollMode): void {
    const s = deps.store;
    if (!s || typeof s.set !== 'function') return;
    try {
      updatingFromStore = true;
      s.set(key, next);
    } catch {
      // ignore
    } finally {
      updatingFromStore = false;
    }
  }

  function syncAuto(next: ScrollMode): void {
    const auto = deps.auto;
    if (!auto) return;

    if (next === 'auto' || next === 'hybrid') {
      auto.setEnabled(true);
      if (auto.setMode) {
        auto.setMode(next);
      }
    } else {
      auto.setEnabled(false);
    }
  }

  function syncStep(next: ScrollMode): void {
    const step = deps.step;
    if (!step) return;

    if (next === 'step') {
      step.enable();
    } else {
      step.disable();
    }
  }

  function syncRehearsal(next: ScrollMode): void {
    const reh = deps.rehearsal;
    if (!reh) return;

    const wants = next === 'rehearsal';
    const on = reh.isActive();

    if (wants && !on) {
      reh.enable();
    } else if (!wants && on) {
      // Let Rehearsal handle any confirmation / UI; router just nudges.
      reh.disable();
    }
  }

  function applyMode(next: ScrollMode): void {
    if (mode === next) return;
    mode = next;
    log(`mode → ${mode}`);

    syncAuto(next);
    syncStep(next);
    syncRehearsal(next);
  }

  function setMode(next: ScrollMode): void {
    const m = asMode(next, mode);
    applyMode(m);
    applyToStore(m);
  }

  function getMode(): ScrollMode {
    return mode;
  }

  function bindStore(): void {
    const s = deps.store;
    if (!s || typeof s.subscribe !== 'function') return;

    unsubStore =
      s.subscribe(key, (v) => {
        if (updatingFromStore) return;
        const m = asMode(v, mode);
        applyMode(m);
      }) || null;

    try {
      const current = s.get?.(key);
      const initial = asMode(current, mode);
      applyMode(initial);
    } catch {
      // ignore
    }
  }

  bindStore();

  function dispose(): void {
    try {
      unsubStore?.();
    } catch {
      // ignore
    }
    unsubStore = null;
  }

  return {
    setMode,
    getMode,
    dispose,
  };
}
