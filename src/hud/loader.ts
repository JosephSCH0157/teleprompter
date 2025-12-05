import { initSpeechNotesHud } from './speech-notes-hud';
import { initAsrStatsHud } from './asr-stats';
import { initRecStatsHud } from './rec-stats';
import { initScrollStripHud } from './scroll-strip';
import type { AppStore } from '../state/app-store';
import type { HudBus } from './speech-notes-hud';

export interface HudLoaderOptions {
  root?: HTMLElement | null;
  store: AppStore | null;
  bus?: HudBus | null;
}

export interface HudLoaderApi {
  destroy(): void;
  bus: HudBus;
}

function createHudBus(): HudBus {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const bus = ((event: string, payload?: unknown) => {
    try { bus.log?.(event, payload); } catch {}
    const set = listeners.get(event);
    if (set) {
      for (const fn of Array.from(set)) {
        try { fn(payload); } catch {}
      }
    }
  }) as HudBus;
  bus.on = (event, handler) => {
    if (!handler) return;
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(handler);
  };
  bus.off = (event, handler) => {
    if (!handler) return;
    const set = listeners.get(event);
    if (set) set.delete(handler);
  };
  bus.emit = (event, payload) => {
    bus(event, payload);
  };
  bus.log = (event, payload) => {
    try { console.debug('[HUD]', event, payload); } catch {}
  };
  return bus;
}

export function initHud(opts: HudLoaderOptions): HudLoaderApi {
  const { store } = opts;
  const bus = opts.bus ?? createHudBus();
  const root = opts.root ?? document.getElementById('hud-root') ?? document.body;

  const speechNotes = initSpeechNotesHud({ root, bus, store });
  const asrStats = initAsrStatsHud({ root, bus, store });
  const recStats = initRecStatsHud({ root, bus, store });
  const scrollStrip = initScrollStripHud({ root });

  function destroy() {
    speechNotes?.destroy?.();
    asrStats?.destroy?.();
    recStats?.destroy?.();
    scrollStrip?.destroy?.();
  }

  try {
    (window as any).__tpHud = { bus, root };
    (window as any).tp_hud = (event: string, payload?: unknown) => {
      try { bus(event, payload); } catch {}
    };
    (window as any).HUD = { log: (event: string, payload?: unknown) => { try { bus(event, payload); } catch {} }, bus };
    try { window.dispatchEvent(new CustomEvent('hud:ready')); } catch {}
  } catch {
    /* ignore */
  }

  return { destroy, bus };
}
