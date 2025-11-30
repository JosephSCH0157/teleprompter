// src/wiring/obs-wiring.ts
// Minimal, UI-safe OBS wiring for TS path
// Uses the lightweight inline OBS v5 bridge in recorders.js

// @ts-ignore - recorders.js is JS
import { getSettings as getRecorderSettings, setSelected as setRecorderSelected } from '../../recorders';
import * as rec from '../../recorders.js';
import { obsTestConnect } from '../dev/obs-probe';
import type { AppStore } from '../state/app-store';

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function syncRegistrySelection(next: unknown): void {
  const ids = toStringArray(next);
  try {
    setRecorderSelected(ids);
  } catch (err) {
    try { console.warn('[obs-wiring] syncRegistrySelection failed', err); } catch {}
  }
}

// Optional: expose a dev console hook for quick OBS probes
try { if (location.search.includes('dev=1')) { (window as any).__obsTestConnect = obsTestConnect; } } catch {}

export function initObsUI() {
  // TS is the SSOT; mark ownership and proceed even if legacy markers are present
  try {
    const w = (window as any);
    w.__tpObsSSOT = 'ts';
    w.__tpObsWireActive = true;
  } catch {}
  try { (window as any).__tpObsInlineBridgeActive = true; } catch {}
  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const pillEl = () => (byId<HTMLElement>('obsStatusText') || byId<HTMLElement>('obsStatus'));
  const testMsgEl = () => byId<HTMLElement>('settingsObsTestMsg');

  const store: AppStore | null = (() => {
    try { return (window as any).__tpStore || null; } catch { return null; }
  })();

  // Persistent Enable OBS flag (UI-independent), drives connection and reconnection
  const OBS_EN_KEY = 'tp_obs_enabled_v1';
  const readStoredEnabled = () => {
    try {
      if (store && typeof store.get === 'function') {
        const val = store.get('obsEnabled');
        if (typeof val === 'boolean') return val;
      }
    } catch {}
    try { return localStorage.getItem(OBS_EN_KEY) === '1'; } catch { return false; }
  };
  let obsEnabled = readStoredEnabled();
  const getObsEnabled = () => {
    try {
      if (store && typeof store.get === 'function') {
        const val = store.get('obsEnabled');
        if (typeof val === 'boolean') return val;
      }
    } catch {}
    return obsEnabled;
  };
  const applyEnabled = (on: boolean, { persistLegacy = false }: { persistLegacy?: boolean } = {}) => {
    obsEnabled = !!on;

    // 🔍 DEBUG: log every apply call so we know the flag is being driven
    try {
      console.log('[OBS-WIRING] applyEnabled', obsEnabled, { persistLegacy });
    } catch {}

    writeEnabledToUI(obsEnabled);
    if (persistLegacy) {
      try { localStorage.setItem(OBS_EN_KEY, obsEnabled ? '1' : '0'); } catch {}
    }
    try { rec.setEnabled(obsEnabled); } catch {}
    const cfg = getRecorderSettings();
    const next = new Set(Array.isArray(cfg?.selected) ? cfg.selected : []);
    if (obsEnabled) next.add('obs'); else next.delete('obs');
    syncRegistrySelection(Array.from(next));
  };
  const pushObsEnabled = (on: boolean) => {
    const next = !!on;
    if (store && typeof store.set === 'function') {
      try { store.set('obsEnabled', next); return; } catch {}
    }
    applyEnabled(next, { persistLegacy: true });
  };

  const readUrl = () => {
    const urlIn = (byId<HTMLInputElement>('settingsObsUrl') || byId<HTMLInputElement>('obsUrl'));
    const hostIn = byId<HTMLInputElement>('settingsObsHost');
    const u = urlIn?.value?.trim();
    if (u) return u;
    const h = hostIn?.value?.trim();
    if (h) return `ws://${h}${/:[0-9]+$/.test(h) ? '' : ':4455'}`;
    return 'ws://127.0.0.1:4455';
  };
  const readPass = () => (byId<HTMLInputElement>('settingsObsPassword')?.value ?? byId<HTMLInputElement>('obsPassword')?.value ?? '');
  // UI checkbox reader is used to reflect state in the UI only; the engine relies on getObsEnabled()
  const readEnabledFromUI = () => {
    const els = [
      byId<HTMLInputElement>('settingsEnableObs'),
      byId<HTMLInputElement>('enableObs'),
      document.querySelector<HTMLInputElement>('[data-tp-obs-toggle]'),
    ];
    for (const el of els) {
      if (el) return !!el.checked;
    }
    return getObsEnabled();
  };
  const writeEnabledToUI = (on: boolean) => {
    try {
      const els = [
        byId<HTMLInputElement>('settingsEnableObs'),
        byId<HTMLInputElement>('enableObs'),
        document.querySelector<HTMLInputElement>('[data-tp-obs-toggle]'),
      ];
      els.forEach((el) => {
        if (!el) return;
        el.checked = !!on;
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
        (el as HTMLElement).dataset.state = on ? 'on' : 'off';
      });
    } catch {}
  };

  // Initialize recorder bridge with dynamic getters
  try {
    const initResult = rec.init({
      getUrl: readUrl,
      getPass: readPass,
      // Important: drive connection using the persistent flag, not the transient UI
      isEnabled: getObsEnabled,
      onStatus: (txt: string, ok: boolean) => {
        // 🔍 DEBUG: surface status transitions in console
        try { console.info('[OBS-STATUS]', txt || (ok ? 'ok' : 'status'), ok); } catch {}
        try { const p = pillEl(); if (p) p.textContent = ok ? 'connected' : (txt || 'disconnected'); } catch {}
      },
      onRecordState: (_active: boolean) => {},
    });
    try { console.log('[OBS-WIRING] rec.init result', initResult); } catch {}
  } catch (err) {
    try { console.error('[OBS-WIRING] rec.init error', err); } catch {}
  }

  // Delegated listeners so it works even if Settings overlay mounts later
  try {
    document.addEventListener('change', (e) => {
      const t = e.target as HTMLElement | null;
      const id = (t as any)?.id || '';
      const hasObsToggleAttr = !!(t && t.hasAttribute && t.hasAttribute('data-tp-obs-toggle'));
      if (id === 'settingsEnableObs' || id === 'enableObs' || hasObsToggleAttr) {
        pushObsEnabled(readEnabledFromUI());
      }
      if (id === 'settingsObsUrl' || id === 'obsUrl' || id === 'settingsObsHost') {
        try { rec.reconfigure(parseWsUrl(readUrl(), readPass())); } catch {}
      }
      if (id === 'settingsObsPassword' || id === 'obsPassword') {
        try { rec.reconfigure({ password: readPass() } as any); } catch {}
      }
    }, { capture: true });
  } catch {}

  // If the overlay/checkbox renders later, reflect the persisted state into it.
  try {
    const mo = new MutationObserver(() => {
      try {
        const el =
          byId<HTMLInputElement>('settingsEnableObs') ||
          byId<HTMLInputElement>('enableObs') ||
          document.querySelector<HTMLInputElement>('[data-tp-obs-toggle]');
        if (el) writeEnabledToUI(getObsEnabled());
      } catch {}
    });
    try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
    // Also attempt an immediate sync in case the checkbox already exists
    writeEnabledToUI(getObsEnabled());
  } catch {}

  // Delegated Test/Sync/Poke buttons
  try {
    const onObsClick = async (e: Event) => {
      const t = e.target as HTMLElement | null;
      const id = (t as any)?.id || '';
      let pill = pillEl();
      const testMsg = testMsgEl();
      const clearMsg = () => { try { if (testMsg) { testMsg.textContent = ''; testMsg.classList.remove('obs-test-ok','obs-test-error'); } } catch {} };
      const okMsg = (s: string) => { try { if (testMsg) { testMsg.textContent = s; testMsg.classList.add('obs-test-ok'); } } catch {} };
      const errMsg = (s: string) => { try { if (testMsg) { testMsg.textContent = s; testMsg.classList.add('obs-test-error'); } } catch {} };

      const testBtn = (t && (t.closest('#settingsObsTest,#obsTest,[data-action="obs-test"]') as HTMLElement | null)) || null;
      if (testBtn) {
        try { e.preventDefault(); e.stopImmediatePropagation(); } catch {}
        // Ensure a pill exists near the button if missing
        if (!pill && testBtn && testBtn.parentElement) {
          try {
            const span = document.createElement('span');
            span.id = 'obsStatusText';
            span.style.marginLeft = '8px';
            testBtn.after(span);
            pill = span as any;
          } catch {}
        }
        clearMsg(); if (pill) pill.textContent = 'testing…';
        try {
          const url = readUrl();
          const pass = readPass();
          // Run a real v5 handshake probe to validate connectivity
          const { version } = await obsTestConnect(url, pass);
          okMsg('OBS test: OK' + (version ? ` (v${version})` : ''));
          if (pill) pill.textContent = version ? `connected (${version})` : 'connected';
        } catch (err: any) {
          errMsg('OBS test failed: ' + (err?.message || String(err))); if (pill) pill.textContent = 'failed';
        }
      }
      if (id === 'settingsObsSyncTest') {
        clearMsg(); if (pill) pill.textContent = 'testing…';
        try {
          await rec.reconfigure(parseWsUrl(readUrl(), readPass()));
          const ok = await rec.test();
          if (!ok) throw new Error('test failed');
          okMsg('OBS sync+test: OK'); if (pill) pill.textContent = 'ok';
        } catch (err: any) {
          errMsg('OBS sync+test failed: ' + (err?.message || String(err))); if (pill) pill.textContent = 'failed';
        }
      }
      if (id === 'settingsObsPoke') {
        clearMsg();
        try {
          const ok = await rec.test();
          if (!ok) throw new Error('poke failed');
          okMsg('OBS poke: OK');
        } catch (err: any) {
          errMsg('OBS poke failed: ' + (err?.message || String(err)));
        }
      }
    };
    // Capture-phase interception (primary)
    document.addEventListener('click', onObsClick as any, { capture: true });
    // Bubble-phase interception (belt-and-suspenders)
    document.addEventListener('click', onObsClick as any, { capture: false });
  } catch {}

  // Reflect recorder status in the pill whenever it changes
  try {
    window.addEventListener('tp-recorder-status' as any, (e: any) => {
      try {
        const p = pillEl();
        const d = e?.detail || {};
        if (p) p.textContent = d.ok ? 'connected' : (d.state || 'disconnected');
      } catch {}
    });
  } catch {}

  function parseWsUrl(u: string, pass: string) {
    try {
      const url = new URL(u);
      return { secure: url.protocol === 'wss:', host: url.hostname, port: Number(url.port || 4455), password: pass } as any;
    } catch { return { password: pass } as any; }
  }

  // Bridge to central store if present, so toggles from Settings drive the bridge too
  try {
    if (store && typeof store.subscribe === 'function') {
      try {
        store.subscribe('obsEnabled', (v: any) => applyEnabled(!!v, { persistLegacy: true }));
      } catch {}
      try { store.subscribe('obsHost', (h: any) => { try { rec.reconfigure(parseWsUrl(h ? `ws://${String(h)}` : readUrl(), readPass())); } catch {} }); } catch {}
      try { store.subscribe('obsPassword', (p: any) => { try { rec.reconfigure({ password: String(p || '') } as any); } catch {} }); } catch {}
    }
  } catch {}

  // On load: apply persisted state (connect if enabled), and ensure clean disconnect on page close
  try {
    applyEnabled(getObsEnabled(), { persistLegacy: true });
  } catch {}
  try {
    window.addEventListener('beforeunload', () => { try { rec.setEnabled(false); } catch {} });
  } catch {}
}
