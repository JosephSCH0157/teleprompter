import { buildSettingsContent as buildFromBuilder } from './settings/builder';
import { setupSettingsTabs } from './settings/tabs';
import { wireSettingsDynamic } from './settings/wire';

// Core mount function used internally
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

    // Legacy-ID compatibility: alias legacy IDs used in monolith
    try {
      const legacyMap: Record<string,string> = {
        'settingsReqMic': 'settingsRequestMicBtn',
        'settingsReqMicBtn': 'settingsRequestMicBtn'
      };
      Object.keys(legacyMap).forEach((legacyId) => {
        try {
          const modern = legacyMap[legacyId];
          const modernEl = rootEl.querySelector('#' + modern) as HTMLElement | null;
          if (modernEl && !document.getElementById(legacyId)) {
            // expose as a window reference for legacy codepaths instead of duplicating IDs
            (window as any).__tpLegacyRefs = (window as any).__tpLegacyRefs || {};
            (window as any).__tpLegacyRefs[legacyId] = modernEl;
          }
        } catch {}
      });
    } catch {}
  } catch {}
}

// Public API requested by the migration
export function mountSettingsOverlay(root?: HTMLElement) {
  const target = root || document.getElementById('settingsBody') || null;
  mountSettings(target);
}

export function openSettings() {
  try {
    const overlay = document.getElementById('settingsOverlay');
    const body = document.getElementById('settingsBody');
    if (!overlay || !body) return;
    overlay.classList.remove('hidden');
    overlay.style.display = '';
    try { mountSettings(body); } catch {}
    // focus first tabbable inside overlay
    try { const first = body.querySelector('button, [href], input, select, textarea') as HTMLElement | null; if (first) first.focus(); } catch {}
  } catch {}
}

export function syncSettingsValues() {
  try {
    // Minimal sync: propagate known state values to UI elements
    try {
      const S = (window as any).__tp && (window as any).__tp.store ? (window as any).__tp.store : null;
      // example: mic device
      const micVal = S && typeof S.get === 'function' ? S.get('micDevice') : null;
      const settingsMic = document.getElementById('settingsMicSel') as HTMLSelectElement | null;
      if (settingsMic && micVal != null) settingsMic.value = micVal;
    } catch {}
  } catch {}
}

// Minimal runtime shim for legacy code during migration
try {
  (window as any).__tp = (window as any).__tp || {};
  (window as any).__tp.settings = (window as any).__tp.settings || {};
  if (typeof (window as any).__tp.settings.mount !== 'function') (window as any).__tp.settings.mount = mountSettingsOverlay;
  // also expose older helper name space
  (window as any).__tpSettings = (window as any).__tpSettings || {};
  (window as any).__tpSettings.open = (window as any).__tpSettings.open || openSettings;
  (window as any).__tpSettings.syncValues = (window as any).__tpSettings.syncValues || syncSettingsValues;
} catch {}

export default mountSettingsOverlay;
