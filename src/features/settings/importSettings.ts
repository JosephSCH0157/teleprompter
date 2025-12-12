// src/features/settings/importSettings.ts
import { showToast } from '../../ui/toasts';

export interface ExportedSettingsEnvelope {
  version: 1;
  createdAt: string;
  source: 'anvil';
  data: Record<string, string | null>;
}

const ALLOWED_PREFIXES = ['tp_', 'tp-'];
const EXCLUDED_KEYS = new Set<string>(['tp_dev_mode', '__TP_SKIP_AUTH']);

function applyEnvelopeToLocalStorage(env: ExportedSettingsEnvelope): void {
  if (env.version !== 1 || env.source !== 'anvil') {
    throw new Error('Not a compatible Anvil settings file');
  }
  const data = env.data || {};
  const ls = window.localStorage;
  Object.keys(data).forEach((key) => {
    if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) return;
    if (EXCLUDED_KEYS.has(key)) return;
    const value = data[key];
    if (value === null || value === undefined) ls.removeItem(key);
    else ls.setItem(key, value);
  });
}

export function triggerSettingsImport(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.style.position = 'fixed';
  input.style.left = '-9999px';

  const cleanup = () => {
    input.remove();
  };

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) {
      cleanup();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const parsed = JSON.parse(text) as ExportedSettingsEnvelope;
        applyEnvelopeToLocalStorage(parsed);
        try { console.info('[settings-import] applied settings, reloading'); } catch {}
        showToast('Settings imported. Reloading...', { type: 'info' });
        window.location.reload();
      } catch (err) {
        try { console.error('[settings-import] failed to import settings', err); } catch {}
        showToast('Failed to import settings. Is this an Anvil settings file?', { type: 'error' });
      } finally {
        cleanup();
      }
    };
    reader.onerror = () => {
      try { console.error('[settings-import] file read error', reader.error); } catch {}
      showToast('Could not read settings file.', { type: 'error' });
      cleanup();
    };
    reader.readAsText(file);
  });

  document.body.appendChild(input);
  input.click();
}
