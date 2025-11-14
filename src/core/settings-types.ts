// src/core/settings-types.ts
// Minimal Settings schema + helpers for export/import and feature toggles.

export type Settings = {
  autoLoadLastScript: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  autoLoadLastScript: false,
};

export function clampSettings(s: Partial<Settings>): Settings {
  return {
    autoLoadLastScript: !!s.autoLoadLastScript,
  };
}

// Export/import helpers (stringified JSON). Keep tolerant.
export function exportSettings(current?: Settings): string {
  const snap = current || DEFAULT_SETTINGS;
  try {
    return JSON.stringify(snap, null, 2);
  } catch {
    return '{}';
  }
}

export function importSettings(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    const next = clampSettings(parsed);
    try { (window as any).__tpSettingsStore = next; } catch {}
    return true;
  } catch {
    return false;
  }
}
