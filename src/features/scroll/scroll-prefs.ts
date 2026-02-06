// src/features/scroll/scroll-prefs.ts
// Tiny helper to persist scroll mode prefs alongside the TS store.
import { withScrollModeWriter } from '../../scroll/audit';

export type ScrollModePref = 'hybrid' | 'timed' | 'wpm' | 'asr' | 'step' | 'rehearsal';

export interface ScrollPrefs {
  mode?: ScrollModePref;
}

export interface ScrollStoreLike {
  get?<T = unknown>(key: string): T;
  set?<T = unknown>(key: string, value: T): T;
  subscribe?<T = unknown>(key: string, fn: (value: T) => void): () => void;
}

const CANONICAL_KEY = 'scrollMode';
const LEGACY_KEYS = ['tp_scroll_prefs_v1', 'tp_scroll_mode_v1', 'tp_scroll_mode'];

function normalizeMode(mode: string | null | undefined): ScrollModePref | null {
  const v = String(mode || '').toLowerCase();
  if (v === 'manual') return 'step';
  const allowed: ScrollModePref[] = ['hybrid', 'timed', 'wpm', 'asr', 'step', 'rehearsal'];
  return allowed.includes(v as ScrollModePref) ? (v as ScrollModePref) : null;
}

function safeParse(raw: string | null): ScrollPrefs | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const normalized = normalizeMode((parsed as any).mode);
    if (!normalized) return null;
    return { mode: normalized };
  } catch {
    return null;
  }
}

function readLegacyMode(key: string, raw: string | null): ScrollModePref | null {
  if (!raw) return null;
  if (key === 'tp_scroll_prefs_v1') {
    return safeParse(raw)?.mode ?? null;
  }
  return normalizeMode(raw);
}

function cleanLegacyKeys(storage: Storage) {
  LEGACY_KEYS.forEach((key) => {
    try { storage.removeItem(key); } catch {}
  });
}

function migrateLegacyScrollMode(): ScrollModePref | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = window.localStorage;
    const canonical = normalizeMode(storage.getItem(CANONICAL_KEY));
    if (canonical) {
      cleanLegacyKeys(storage);
      return canonical;
    }
    for (const key of LEGACY_KEYS) {
      const legacy = readLegacyMode(key, storage.getItem(key));
      if (legacy) {
        storage.setItem(CANONICAL_KEY, legacy);
        cleanLegacyKeys(storage);
        return legacy;
      }
    }
    cleanLegacyKeys(storage);
  } catch {
    // swallow storage/migration failures
  }
  return null;
}

export function loadScrollPrefs(): ScrollPrefs | null {
  try {
    if (typeof window === 'undefined') return null;
    const mode = migrateLegacyScrollMode();
    if (!mode) return null;
    return { mode };
  } catch {
    return null;
  }
}

export function saveScrollPrefs(next: ScrollPrefs): void {
  try {
    if (typeof window === 'undefined') return;
    const normalized = normalizeMode(next?.mode || null);
    if (!normalized) return;
    window.localStorage.setItem(CANONICAL_KEY, normalized);
    cleanLegacyKeys(window.localStorage);
  } catch {
    // storage failures are non-fatal
  }
}

export function initScrollPrefsPersistence(store: ScrollStoreLike | undefined | null): void {
  if (!store) return;

  const fromStore = normalizeMode(store.get?.('scrollMode') as string | undefined);
  const persisted = normalizeMode(loadScrollPrefs()?.mode);
  const initial = normalizeMode(fromStore || persisted || 'hybrid') || 'hybrid';

  try {
    if (!fromStore || fromStore !== initial) {
      withScrollModeWriter('state/app-store', () => {
        try { store.set?.('scrollMode', initial as any); } catch {}
      }, { source: 'migration' });
    }
  } catch {
    // ignore
  }

  try {
    store.subscribe?.('scrollMode', (mode: any) => {
      const normalized = normalizeMode(mode);
      if (normalized) saveScrollPrefs({ mode: normalized });
    });
  } catch {
    // ignore
  }
}
