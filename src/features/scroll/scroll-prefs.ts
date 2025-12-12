// src/features/scroll/scroll-prefs.ts
// Tiny helper to persist scroll mode prefs alongside the TS store.

export type ScrollModePref = 'hybrid' | 'timed' | 'wpm' | 'asr' | 'step' | 'rehearsal';

export interface ScrollPrefs {
  mode?: ScrollModePref;
}

export interface ScrollStoreLike {
  get?<T = unknown>(key: string): T;
  set?<T = unknown>(key: string, value: T): T;
  subscribe?<T = unknown>(key: string, fn: (value: T) => void): () => void;
}

const STORAGE_KEY = 'tp_scroll_prefs_v1';
const LEGACY_KEYS = ['tp_scroll_mode_v1', 'tp_scroll_mode', 'scrollMode'];

function normalizeMode(mode: string | null | undefined): ScrollModePref | null {
  const v = String(mode || '').toLowerCase();
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

export function loadScrollPrefs(): ScrollPrefs | null {
  try {
    if (typeof window === 'undefined') return null;
    const parsed = safeParse(window.localStorage.getItem(STORAGE_KEY));
    if (parsed) return parsed;

    // Legacy fallback: treat stored string keys as { mode }
    for (const key of LEGACY_KEYS) {
      const legacy = normalizeMode(window.localStorage.getItem(key));
      if (legacy) return { mode: legacy };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveScrollPrefs(next: ScrollPrefs): void {
  try {
    if (typeof window === 'undefined') return;
    const normalized = normalizeMode(next?.mode || null);
    if (!normalized) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: normalized }));
  } catch {
    // storage failures are non-fatal
  }
}

export function initScrollPrefsPersistence(store: ScrollStoreLike | undefined | null): void {
  if (!store) return;

  const fromStore = normalizeMode(store.get?.('scrollMode') as string | undefined);
  const persisted = normalizeMode(loadScrollPrefs()?.mode);
  const initial = persisted || fromStore || 'hybrid';

  try {
    if (!fromStore || fromStore !== initial) {
      store.set?.('scrollMode', initial as any);
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
