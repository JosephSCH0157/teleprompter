import { buildSettingsContent as buildFromBuilder } from './settings/builder';
import { setupSettingsTabs } from './settings/tabs';
import { wireSettingsDynamic } from './settings/wire';

export function mountSettings(rootEl: HTMLElement | null) {
  try {
    // Prefer legacy in-file builder when present for safe migration
    if (typeof (window as any).buildSettingsContent === 'function') {
      try { (window as any).buildSettingsContent(); return; } catch {}
    }

    if (!rootEl) return;
    // Use the lightweight builder to prepare content (string or DOM insertion)
    try {
      const html = buildFromBuilder(rootEl) || '';
      if (html) rootEl.innerHTML = html;
    } catch {}
    try { wireSettingsDynamic(rootEl); } catch {}
    try { setupSettingsTabs(rootEl); } catch {}
  } catch {}
}

// Register on window for runtime access
try {
  (window as any).__tp = (window as any).__tp || {};
  (window as any).__tp.settings = (window as any).__tp.settings || {};
  if (typeof (window as any).__tp.settings.mount !== 'function') (window as any).__tp.settings.mount = mountSettings;
} catch {}

export default mountSettings;
