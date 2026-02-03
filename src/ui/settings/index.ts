import { ensureSettingsFolderControls } from '../inject-settings-folder';
import { initAsrSettingsUI } from './asr-wizard';
import { addAsrWizardCard, buildSettingsContent as buildFromBuilder } from './builder';
import { bindHybridGateSetting } from './hybridGate';
import { bindTypographyPanel } from './typographyPanel';
import { wireSettingsDynamic } from './wire';
import {
  flushAsrSettingsToStore,
  hydrateAsrSettingsCard,
  wireAsrSettingsCard,
} from '../settings-asr';
import { createAppStore, type AppStore } from '../../state/app-store';
import { speechStore } from '../../state/speech-store';
import { wireTypographyPresets } from './typography-presets';
import { wireUiScaleControls } from '../ui-scale';

function setSettingsHydrating(value: boolean) {
  try {
    (window as any).__tpSettingsHydrating = value;
  } catch {
    // ignore if window not available
  }
}

function scheduleSettingsHydrationComplete() {
  const clear = () => setSettingsHydrating(false);
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(clear);
  } else if (typeof Promise !== 'undefined' && typeof Promise.resolve === 'function') {
    Promise.resolve().then(clear);
  } else {
    setTimeout(clear, 0);
  }
}

function getStore(store?: AppStore | null): AppStore | null {
  if (store) return store;
  try {
    return (window as any).__tpStore || null;
  } catch {
    return null;
  }
}

function isSettingsDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    if (w?.localStorage?.getItem('tp_dev_mode') === '1') return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.has('dev')) return true;
    const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    if (hash === 'dev' || hash === 'dev=1' || hash.includes('dev=1')) return true;
  } catch {
    return false;
  }
  return false;
}

function buildAsrSnapshot(store: AppStore | null): Record<string, unknown> {
  const speechState = speechStore.get();
  const snapshot = store
    ? {
        engine: store.get?.('asr.engine'),
        lang: store.get?.('asr.language'),
        useInterimResults: store.get?.('asr.useInterimResults'),
        filterFillers: store.get?.('asr.filterFillers'),
        threshold: store.get?.('asr.threshold'),
        endpointingMs: store.get?.('asr.endpointMs'),
      }
    : null;
  return { store: snapshot, speechStore: speechState };
}

function logSettingsHydrationSnapshot(store: AppStore | null): void {
  if (!isSettingsDebugMode()) return;
  try {
    console.log('SettingsOpen: hydrating from SSOT snapshot', { asr: buildAsrSnapshot(store) });
  } catch {}
}

// Core mount function used internally
export function mountSettings(rootEl: HTMLElement | null, store?: AppStore | null) {
  setSettingsHydrating(true);
  try {
    const resolvedStore = getStore(store) || createAppStore();
    logSettingsHydrationSnapshot(resolvedStore);
    if ((window as any).__TP_DEV) {
      try { console.count('mountSettings'); } catch {}
    }
    if (!rootEl) return;
    // Clear any leftover legacy/fallback content before rebuilding
    try {
      rootEl.dataset.tpSettingsWired = '';
      rootEl.innerHTML = '';
    } catch {}
    // Use the lightweight builder to prepare content (string or DOM insertion)
    try {
      const html = buildFromBuilder(rootEl) || '';
      if (html) rootEl.innerHTML = html;
      // Signal that settings DOM is now present so dependent UI can wire safely
      try { document.dispatchEvent(new CustomEvent('tp:settings:rendered')); } catch {}
    } catch {}
    try { wireSettingsDynamic(rootEl, resolvedStore); } catch {}
    // Bind new typography panels (main + display)
    try { bindTypographyPanel('main'); } catch {}
    try { bindTypographyPanel('display'); } catch {}
    try { wireTypographyPresets(); } catch {}
    try { wireUiScaleControls(rootEl); } catch {}
    // Add ASR wizard card under Media tab and initialize it
    try { addAsrWizardCard(rootEl); } catch {}
    try { initAsrSettingsUI(); } catch {}
    // Bind Hybrid gate preference select
    try { bindHybridGateSetting(rootEl); } catch {}
    try { wireAsrSettingsCard(rootEl, resolvedStore); } catch {}
    try { hydrateAsrSettingsCard(rootEl); } catch {}
    try { syncSettingsValues(resolvedStore); } catch {}

    // Inline link: Hybrid row → jump to ASR settings card
    try {
      rootEl.addEventListener('click', (e: Event) => {
        const t = e.target as HTMLElement | null;
        if (t && (t as HTMLElement).id === 'linkAsrSettings') {
          e.preventDefault();
          try {
            // ensure Media tab visible
            rootEl.querySelectorAll('[data-tab-content]')?.forEach((c) => ((c as HTMLElement).style.display = 'none'));
            const media = rootEl.querySelector('[data-tab-content="media"]') as HTMLElement | null;
            if (media) media.style.display = '';
            const sec = document.getElementById('asrSettings');
            if (sec) {
              try { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { sec.scrollIntoView(); }
              try { sec.classList.add('asr-highlight'); setTimeout(() => sec.classList.remove('asr-highlight'), 1400); } catch {}
            }
          } catch {}
        }
      }, { capture: true });
    } catch {}

    // Legacy compatibility: mirror minimal font size/line height controls if present
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

    // Ensure the Scripts Folder card is present after builder render (builder may overwrite earlier injection)
    try { ensureSettingsFolderControls(); } catch {}
  } catch {}
  finally {
    scheduleSettingsHydrationComplete();
  }
}

export function wireSettings(options?: { root?: HTMLElement | null; store?: AppStore | null; force?: boolean }) {
  const store = getStore(options?.store) || createAppStore();
  const target = options?.root ?? document.getElementById('settingsBody') ?? null;
  if ((window as any).__tpSettingsBootedByTs && !options?.force) {
    return { root: target, store };
  }
  try { (window as any).__tpSettingsBootedByTs = true; } catch {}
  mountSettings(target, store);
  return { root: target, store };
}

export function mountSettingsOverlay(root?: HTMLElement, store?: AppStore | null) {
  const target = root || document.getElementById('settingsBody') || null;
  mountSettings(target, store);
}

export function openSettings(store?: AppStore | null) {
  try {
    const overlay = document.getElementById('settingsOverlay');
    const body = document.getElementById('settingsBody');
    if (!overlay || !body) return;
    overlay.classList.remove('hidden');
    overlay.style.display = '';
    try { mountSettings(body, store); } catch {}
    // focus first tabbable inside overlay
    try { const first = body.querySelector('button, [href], input, select, textarea') as HTMLElement | null; if (first) first.focus(); } catch {}
  } catch {}
}

export function syncSettingsValues(store?: AppStore | null) {
  const s = getStore(store);
  try {
    // Minimal sync: propagate known state values to UI elements
    try {
      const micVal = s && typeof s.get === 'function' ? s.get('micDevice') : null;
      const settingsMic = document.getElementById('settingsMicSel') as HTMLSelectElement | null;
      if (settingsMic && micVal != null) settingsMic.value = String(micVal);
    } catch {}
  } catch {}
}

export function flushPendingSettingsEdits(store?: AppStore | null) {
  flushAsrSettingsToStore(store);
}

// Minimal runtime shim for legacy code during migration
try {
  (window as any).__tp = (window as any).__tp || {};
  (window as any).__tp.settings = (window as any).__tp.settings || {};
  if (typeof (window as any).__tp.settings.mount !== 'function') (window as any).__tp.settings.mount = mountSettingsOverlay;
  // also expose older helper name space
  (window as any).__tpSettings = (window as any).__tpSettings || {};
  (window as any).__tpSettings.open = (window as any).__tpSettings.open || (() => openSettings());
  (window as any).__tpSettings.syncValues = (window as any).__tpSettings.syncValues || (() => syncSettingsValues());
} catch {}

export default wireSettings;
