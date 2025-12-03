import { initSpeechNotesHud } from './speech-notes-hud';
import { initAsrStatsHud } from './asr-stats';
import { initRecStatsHud } from './rec-stats';
import { initScrollStripHud } from './scroll-strip';
import type { AppStore } from '../state/app-store';
import type { HudBus } from './speech-notes-hud';

export interface HudLoaderOptions {
  root?: HTMLElement | null;
  store: AppStore | null;
  bus: HudBus | null;
}

export interface HudLoaderApi {
  destroy(): void;
}

export function initHud(opts: HudLoaderOptions): HudLoaderApi {
  const { store, bus } = opts;
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
  } catch {
    /* ignore */
  }

  return { destroy };
}
