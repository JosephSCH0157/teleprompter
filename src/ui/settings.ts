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

    // Typography wiring: Settings is source-of-truth; mirror to legacy main inputs and trigger updates
    try {
      const fsS = document.getElementById('settingsFontSize') as HTMLInputElement | null;
      const lhS = document.getElementById('settingsLineHeight') as HTMLInputElement | null;
      const fsMain = (window as any).$id?.('fontSize') ?? document.getElementById('fontSize');
      const lhMain = (window as any).$id?.('lineHeight') ?? document.getElementById('lineHeight');
      const applyFromSettings = () => {
        try {
          if (fsS && fsMain) {
            if ((fsMain as HTMLInputElement).value !== fsS.value) (fsMain as HTMLInputElement).value = fsS.value;
            try { (fsMain as HTMLInputElement).dispatchEvent(new Event('input', { bubbles: true })); } catch {}
          }
          if (lhS && lhMain) {
            if ((lhMain as HTMLInputElement).value !== lhS.value) (lhMain as HTMLInputElement).value = lhS.value;
            try { (lhMain as HTMLInputElement).dispatchEvent(new Event('input', { bubbles: true })); } catch {}
          }
          try { (window as any).applyTypography && (window as any).applyTypography(); } catch {}
          try {
            if (fsS?.value) localStorage.setItem('tp_font_size_v1', String(fsS.value));
            if (lhS?.value) localStorage.setItem('tp_line_height_v1', String(lhS.value));
          } catch {}
        } catch {}
      };
      if (fsS) fsS.addEventListener('input', applyFromSettings);
      if (lhS) lhS.addEventListener('input', applyFromSettings);
      // Initial sync
      try {
        const storedFS = (() => { try { return localStorage.getItem('tp_font_size_v1'); } catch { return null; } })();
        const storedLH = (() => { try { return localStorage.getItem('tp_line_height_v1'); } catch { return null; } })();
        if (fsS) fsS.value = ((fsMain as HTMLInputElement | null)?.value) || storedFS || '48';
        if (lhS) lhS.value = ((lhMain as HTMLInputElement | null)?.value) || storedLH || '1.35';
        applyFromSettings();
      } catch {}
    } catch {}

      // Ensure device selects are populated (keeps new and legacy selects in sync)
      try {
        // use the mic API if available, else try a local implementation
        const micApi = (window as any).__tpMic;
        if (micApi && typeof micApi.populateDevices === 'function') {
          try { micApi.populateDevices(); } catch {}
        } else {
          // fallback: minimal populate that tolerates legacy/new IDs
          (async function populateDevicesFallback() {
            try {
              if (!navigator.mediaDevices?.enumerateDevices) return;
              const devs = await navigator.mediaDevices.enumerateDevices();
              const mics = devs.filter(d => d.kind === 'audioinput');
              const cams = devs.filter(d => d.kind === 'videoinput');
              const fill = (id: string, list: MediaDeviceInfo[]) => {
                try {
                  const el = (window.$id?.(id) ?? document.getElementById(id)) as HTMLSelectElement | null;
                  if (!el) return;
                  const prev = el.value;
                  el.innerHTML = '';
                  for (const d of list) {
                    const opt = document.createElement('option');
                    opt.value = d.deviceId;
                    opt.textContent = d.label || (d.kind === 'audioinput' ? 'Microphone' : 'Camera');
                    el.appendChild(opt);
                  }
                  try { if (prev && Array.from(el.options).some(o => o.value === prev)) el.value = prev; } catch {}
                } catch {}
              };
              fill('settingsMicSel', mics);
              fill('micDeviceSel', mics);
              fill('settingsCamSel', cams);
            } catch {}
          })();
        }
      } catch {}

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
