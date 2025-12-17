import { initSpeechNotesHud } from './speech-notes-hud';
import { initAsrStatsHud } from './asr-stats';
import { initRecStatsHud } from './rec-stats';
import { initScrollStripHud } from './scroll-strip';
import { attachHudDrag } from './drag';
import type { AppStore, AppStoreState } from '../state/app-store';
import type { HudBus } from './speech-notes-hud';
import { shouldShowHud } from './shouldShowHud';

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

  if (!root) {
    throw new Error('[HUD] No root element found');
  }

  try {
    root.classList.add('tp-hud-root');
    if (!root.hasAttribute('role')) root.setAttribute('role', 'complementary');
  } catch {}

  try { attachHudDrag(root); } catch {}

  const asrStats = initAsrStatsHud({ root, bus, store });
  const recStats = initRecStatsHud({ root, bus, store });
  const scrollStrip = initScrollStripHud({ root });
  let speechNotesApi: ReturnType<typeof initSpeechNotesHud> | null = null;
  const subs: Array<() => void> = [];

  const hasSpeechNotesOptIn = (snap: AppStoreState) => {
    try {
      if (snap.hudSpeechNotesEnabledByUser) return true;
    } catch {}
    try {
      return localStorage.getItem('tp_hud_speech_notes_v1') === '1';
    } catch {
      return false;
    }
  };

  const refreshSpeechNotes = () => {
    if (!store) return;
    const snap = store.getSnapshot() as AppStoreState;
    if (!shouldShowHud(snap) || !hasSpeechNotesOptIn(snap)) {
      speechNotesApi?.destroy?.();
      speechNotesApi = null;
      return;
    }
    if (!speechNotesApi) {
      speechNotesApi = initSpeechNotesHud({ root, bus, store });
    }
  };

  try {
    ['hudSupported', 'hudEnabledByUser', 'page', 'hudSpeechNotesEnabledByUser'].forEach((key) => {
      const unsub = store?.subscribe?.(key as any, () => {
        try { refreshSpeechNotes(); } catch {}
      });
      if (typeof unsub === 'function') subs.push(unsub);
    });
  } catch {}

  refreshSpeechNotes();

  const showHudRoot = () => {
    try {
      root.style.display = '';
      root.removeAttribute('aria-hidden');
    } catch {}
  };
  const hideHudRoot = () => {
    try {
      root.style.display = 'none';
      root.setAttribute('aria-hidden', 'true');
    } catch {}
  };

  function destroy() {
    hideHudRoot();
    speechNotesApi?.destroy?.();
    subs.forEach((unsub) => {
      try { unsub(); } catch {}
    });
    asrStats?.destroy?.();
    recStats?.destroy?.();
    scrollStrip?.destroy?.();
  }

  try {
    (window as any).__tpHud = { bus, root, show: showHudRoot, hide: hideHudRoot };
    (window as any).tp_hud = (event: string, payload?: unknown) => {
      try { bus(event, payload); } catch {}
    };
    (window as any).HUD = {
      log: (event: string, payload?: unknown) => { try { bus(event, payload); } catch {} },
      bus,
      show: showHudRoot,
      hide: hideHudRoot,
    };
    try { window.dispatchEvent(new CustomEvent('hud:ready')); } catch {}
  } catch {
    /* ignore */
  }

  return { destroy, bus };
}
