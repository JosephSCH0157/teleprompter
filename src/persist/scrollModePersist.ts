import type { ScrollMode } from '../features/scroll/mode-router';

const STORAGE_KEY = 'tp_scroll_mode_v1';
const LEGACY_KEYS = [
  'scrollMode',
  'tp_scroll_mode',
  'tp_scroll_mode_v1',
  'tp_scroll_mode_v2',
  'tp_scroll_mode_backup',
  'tp_scroll_prefs_v1',
];

const ALLOWED_MODES = new Set<ScrollMode>([
  'timed',
  'wpm',
  'hybrid',
  'asr',
  'step',
  'rehearsal',
  'auto',
  'off',
]);

function normalize(raw?: string | null): ScrollMode | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'manual') return 'step';
  if (ALLOWED_MODES.has(v as ScrollMode)) return v as ScrollMode;
  return null;
}

function readLegacyValue(key: string, raw: string | null): ScrollMode | null {
  if (!raw) return null;
  if (key === 'tp_scroll_prefs_v1') {
    try {
      const parsed = JSON.parse(raw);
      return normalize((parsed as any)?.mode);
    } catch {
      return null;
    }
  }
  return normalize(raw);
}

function cleanLegacyKeys(storage: Storage): void {
  LEGACY_KEYS.forEach((key) => {
    if (key === STORAGE_KEY) return;
    try { storage.removeItem(key); } catch {}
  });
}

export function readScrollMode(): ScrollMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = window.localStorage;
    const directRaw = storage.getItem(STORAGE_KEY);
    const direct = normalize(directRaw);
    if (direct) {
      if (directRaw !== direct) {
        try { storage.setItem(STORAGE_KEY, direct); } catch {}
      }
      cleanLegacyKeys(storage);
      return direct;
    }
    if (directRaw) {
      try { storage.removeItem(STORAGE_KEY); } catch {}
    }

    for (const key of LEGACY_KEYS) {
      if (key === STORAGE_KEY) continue;
      const legacyRaw = storage.getItem(key);
      const legacy = readLegacyValue(key, legacyRaw);
      if (legacy) {
        try { storage.setItem(STORAGE_KEY, legacy); } catch {}
        cleanLegacyKeys(storage);
        return legacy;
      }
      if (legacyRaw) {
        try { storage.removeItem(key); } catch {}
      }
    }
  } catch {
    // ignore storage failures
  }
  return null;
}

export function writeScrollMode(mode: ScrollMode | string | null | undefined): ScrollMode | null {
  if (typeof window === 'undefined') return null;
  const normalized = normalize(mode == null ? null : String(mode));
  try {
    if (!normalized) {
      clearScrollMode();
      return null;
    }
    window.localStorage.setItem(STORAGE_KEY, normalized);
    cleanLegacyKeys(window.localStorage);
  } catch {
    // ignore storage failures
  }
  return normalized;
}

export function clearScrollMode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    cleanLegacyKeys(window.localStorage);
  } catch {
    // ignore storage failures
  }
}

export const SCROLL_MODE_STORAGE_KEY = STORAGE_KEY;
