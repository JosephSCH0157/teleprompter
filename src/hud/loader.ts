import { initSpeechNotesHud } from './speech-notes-hud';
import { initAsrStatsHud } from './asr-stats';
import { initRecStatsHud } from './rec-stats';
import { initScrollStripHud } from './scroll-strip';
import { attachHudDrag } from './drag';
import { initHudPopup, type HudPopupApi } from './popup';
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

let didInit = false;
let cachedHud: HudLoaderApi | null = null;
let popupApi: HudPopupApi | null = null;

function shouldAutoInitHud(): boolean {
  try {
    const qs = new URLSearchParams(String(location.search || ''));
    if (qs.has('dev') || qs.get('dev') === '1') return true;
    if (qs.has('dev1') || qs.get('dev1') === '1') return true;
    if (qs.has('hud') || qs.get('hud') === '1') return true;
    if (qs.has('scrollDebug') || qs.get('scrollDebug') === '1') return true;
    if (/(#|&)dev\b/i.test(location.hash || '')) return true;
    const w: any = window as any;
    if (w.__TP_DEV || w.__TP_DEV1) return true;
    if (localStorage.getItem('tp_dev_mode') === '1') return true;
    if (localStorage.getItem('tp_hud_prod') === '1') return true;
  } catch {}
  return false;
}

export function initHud(opts: HudLoaderOptions = { store: (window as any).__tpStore ?? null }): HudLoaderApi {
  if (didInit && cachedHud) return cachedHud;
  const { store } = opts;
  const bus = opts.bus ?? createHudBus();
  const root = opts.root ?? document.getElementById('hud-root') ?? document.body;

  try {
    if ((window as any).__TP_DEV) console.debug('[HUD] initHud() called');
  } catch {}

  if (!root) {
    throw new Error('[HUD] No root element found');
  }

  try {
    if ((window as any).__TP_DEV) {
      const hudSupported = !!document.getElementById('hud-root') || !!document.getElementById('tp-speech-notes-hud');
      const hudEnabledByUser = !!store?.get?.('hudEnabledByUser');
      console.debug('[HUD] mounting…', { hudSupported, hudEnabledByUser });
    }
  } catch {}

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
let popoutPoll: number | null = null;
let popoutBridgeUnsub: (() => void) | null = null;

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

  const ensurePopup = (): HudPopupApi | null => {
    if (popupApi) return popupApi;
    if (!root) return null;
    popupApi = initHudPopup({
      root,
      getStore: () => (window as any).__tpStore,
      dev: !!(window as any).__TP_DEV || /[?#]dev=1/.test(location.href),
    });
    (window as any).__tpHudPopup = popupApi;
    return popupApi;
  };

  const startPopoutClosedPoll = () => {
    if (popoutPoll) return;
    const popupState = (window as any).__tpHudPopup?.getState?.();
    if (!popupState?.popout) return;
    popoutPoll = window.setInterval(() => {
      const w = (window as any).__tpHudPopoutWin as Window | null | undefined;
      if (w && w.closed) {
        (window as any).__tpHudPopup?.setPopout?.(false);
        (window as any).__tpHudPopoutWin = null;
        try {
          (window as any).__tpHudBridge?.send?.({
            type: 'hud:state',
            state: (window as any).__tpHudPopup?.getState?.(),
          });
        } catch {}
        stopPopoutClosedPoll();
      }
    }, 1000);
  };

  const stopPopoutClosedPoll = () => {
    if (!popoutPoll) return;
    try { window.clearInterval(popoutPoll); } catch {}
    popoutPoll = null;
  };

  const subscribePopoutBridge = () => {
    popoutBridgeUnsub?.();
    const bridge = (window as any).__tpHudBridge;
    if (!bridge?.on) return;
    popoutBridgeUnsub = bridge.on((msg: any) => {
      if (msg.type === 'hud:state') {
        if (msg.state?.popout) {
          startPopoutClosedPoll();
        } else {
          stopPopoutClosedPoll();
        }
      }
    });
  };

  startPopoutClosedPoll();
  subscribePopoutBridge();

  const showHudRoot = () => {
    try {
      root.style.display = '';
      root.removeAttribute('aria-hidden');
      try {
        const p = ensurePopup();
        if (p && !p.isOpen()) p.setOpen(true);
        p?.log('HUD mounted');
        p?.dumpSnapshot('BOOT');
      } catch {}
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
  stopPopoutClosedPoll();
  popoutBridgeUnsub?.();
  popoutBridgeUnsub = null;
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

  cachedHud = { destroy, bus };
  didInit = true;
  return cachedHud;
}

try {
  if (shouldAutoInitHud()) initHud();
} catch {}
