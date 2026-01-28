// src/features/scroll/scroll-prefs.ts
// Tiny helper to persist scroll mode prefs alongside the TS store.
import { readScrollMode, writeScrollMode } from '../../persist/scrollModePersist';

export type ScrollModePref =
  | 'hybrid'
  | 'timed'
  | 'wpm'
  | 'asr'
  | 'step'
  | 'rehearsal'
  | 'auto'
  | 'off';

export interface ScrollPrefs {
  mode?: ScrollModePref;
}

export interface ScrollStoreLike {
  get?<T = unknown>(key: string): T;
  set?<T = unknown>(key: string, value: T): T;
  subscribe?<T = unknown>(key: string, fn: (value: T) => void): () => void;
}

function normalizeMode(mode: string | null | undefined): ScrollModePref | null {
  const v = String(mode || '').toLowerCase();
  if (v === 'manual') return 'step';
  const allowed: ScrollModePref[] = ['hybrid', 'timed', 'wpm', 'asr', 'step', 'rehearsal', 'auto', 'off'];
  return allowed.includes(v as ScrollModePref) ? (v as ScrollModePref) : null;
}

export function loadScrollPrefs(): ScrollPrefs | null {
  try {
    const mode = readScrollMode();
    if (!mode) return null;
    return { mode: mode as ScrollModePref };
  } catch {
    return null;
  }
}

export function saveScrollPrefs(next: ScrollPrefs): void {
  try {
    const normalized = normalizeMode(next?.mode || null);
    if (!normalized) return;
    writeScrollMode(normalized);
  } catch {
    // storage failures are non-fatal
  }
}

export function initScrollPrefsPersistence(store: ScrollStoreLike | undefined | null): void {
  if (!store) return;

  const fromStore = normalizeMode(store.get?.('scrollMode') as string | undefined);
  const persisted = normalizeMode(readScrollMode());
  const initial = normalizeMode(fromStore || persisted || 'hybrid') || 'hybrid';

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
      if (normalized) writeScrollMode(normalized);
    });
  } catch {
    // ignore
  }
}
