// src/features/asr/persistence.ts
import { speechStore, type SpeechState } from '../../state/speech-store';

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
  // Hydrate from disk
  const persisted = loadPersistedAsrSettings();
  if (persisted) {
    try {
      speechStore.set({
        engine: persisted.engine,
        lang: persisted.lang,
        interim: persisted.interim,
        threshold: persisted.threshold,
        endpointingMs: persisted.endpointingMs,
        fillerFilter: persisted.fillerFilter,
      } as Partial<SpeechState>);
    } catch (err) {
      try { console.warn('[ASR] failed to hydrate persisted settings', err); } catch {}
    }
  }

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
    });
  } catch (err) {
    try { console.warn('[ASR] failed to subscribe for persistence', err); } catch {}
  }
}
