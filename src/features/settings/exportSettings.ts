// src/features/settings/exportSettings.ts
export interface ExportedSettingsEnvelope {
  version: 1;
  createdAt: string;
  source: 'anvil';
  data: Record<string, string | null>;
}

const ALLOWED_PREFIXES = ['tp_', 'tp-'];
const EXCLUDED_KEYS = new Set<string>(['tp_dev_mode', '__TP_SKIP_AUTH']);

function shouldExport(key: string): boolean {
  return ALLOWED_PREFIXES.some((p) => key.startsWith(p)) && !EXCLUDED_KEYS.has(key);
}

export function collectSettingsFromLocalStorage(): ExportedSettingsEnvelope {
  const data: Record<string, string | null> = {};
  try {
    const ls = window.localStorage;
    const len = ls.length;
    for (let i = 0; i < len; i++) {
      const key = ls.key(i);
      if (!key) continue;
      if (!shouldExport(key)) continue;
      data[key] = ls.getItem(key);
    }
  } catch (err) {
    try { console.warn('[settings-export] failed to read localStorage', err); } catch {}
  }

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    source: 'anvil',
    data,
  };
}

export function triggerSettingsDownload(): void {
  try {
    const envelope = collectSettingsFromLocalStorage();
    const json = JSON.stringify(envelope, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anvil-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
    }, 1000);
  } catch (err) {
    try { console.error('[settings-export] download failed', err); } catch {}
  }
}
