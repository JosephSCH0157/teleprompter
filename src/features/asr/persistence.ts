// src/features/asr/persistence.ts
import { speechStore, type SpeechState } from '../../state/speech-store';
import { getAppStore } from '../../state/appStore';

export interface PersistedAsrSettings {
  engine?: string;
  lang?: string;
  interim?: boolean;
  threshold?: number;
  endpointingMs?: number;
  fillerFilter?: boolean;
}

const STORAGE_KEY = 'tp_asr_settings_v1';

function safeParse(raw: string | null): PersistedAsrSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as PersistedAsrSettings;
  } catch {
    return null;
  }
}

export function loadPersistedAsrSettings(): PersistedAsrSettings | null {
  try {
    if (typeof window === 'undefined') return null;
    return safeParse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function savePersistedAsrSettings(next: PersistedAsrSettings): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage failures are non-fatal
  }
}

export function initAsrPersistence(): void {
  // Hydrate from disk/store
  const persisted = loadPersistedAsrSettings();
  const store = getAppStore();
  const initialState: SpeechState = {
    engine:
      (store?.get('asr.engine') as string | undefined) ??
      persisted?.engine ??
      'webspeech',
    lang:
      (store?.get('asr.language') as string | undefined) ??
      persisted?.lang ??
      'en-US',
    interim:
      (store?.get('asr.useInterimResults') as boolean | undefined) ??
      persisted?.interim ??
      true,
    threshold:
      (store?.get('asr.threshold') as number | undefined) ??
      persisted?.threshold ??
      0.6,
    endpointingMs:
      (store?.get('asr.endpointMs') as number | undefined) ??
      persisted?.endpointingMs ??
      700,
    fillerFilter:
      (store?.get('asr.filterFillers') as boolean | undefined) ??
      persisted?.fillerFilter ??
      true,
  };
  try {
    speechStore.set(initialState);
  } catch (err) {
    try {
      console.warn('[ASR] failed to hydrate persisted settings', err);
    } catch {}
  }

  const syncToStore = (next: SpeechState) => {
    if (!store) return;
    try { store.set('asr.engine', next.engine); } catch {}
    try { store.set('asr.language', next.lang); } catch {}
    try { store.set('asr.useInterimResults', next.interim); } catch {}
    try { store.set('asr.filterFillers', next.fillerFilter); } catch {}
    try { store.set('asr.threshold', next.threshold); } catch {}
    try { store.set('asr.endpointMs', next.endpointingMs); } catch {}
  };
  syncToStore(initialState);

  // Subscribe for future changes
  try {
    speechStore.subscribe((state) => {
      const toSave: PersistedAsrSettings = {
        engine: state.engine,
        lang: state.lang,
        interim: state.interim,
        threshold: state.threshold,
        endpointingMs: state.endpointingMs,
        fillerFilter: state.fillerFilter,
      };
      savePersistedAsrSettings(toSave);
      syncToStore(state);
    });
  } catch (err) {
    try { console.warn('[ASR] failed to subscribe for persistence', err); } catch {}
  }
}
