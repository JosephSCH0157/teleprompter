// src/wiring/obs-wiring.ts
// Minimal, UI-safe OBS wiring for TS path
// Uses the lightweight inline OBS v5 bridge in recorders.js

// @ts-ignore - recorders.js is JS
import { getSettings as getRecorderSettings, setSelected as setRecorderSelected } from '../../recorders';
import * as rec from '../../recorders.js';
import { obsTestConnect } from '../dev/obs-probe';

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

  // Persistent Enable OBS flag (UI-independent), drives connection and reconnection
  const OBS_EN_KEY = 'tp_obs_enabled_v1';
  let obsEnabled = (() => { try { return localStorage.getItem(OBS_EN_KEY) === '1'; } catch { return false; } })();
  const getObsEnabled = () => obsEnabled;
  const setObsEnabled = (on: boolean) => {
    obsEnabled = !!on;
    try { localStorage.setItem(OBS_EN_KEY, obsEnabled ? '1' : '0'); } catch {}
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
  const readEnabledFromUI = () => !!(byId<HTMLInputElement>('settingsEnableObs')?.checked || byId<HTMLInputElement>('enableObs')?.checked);
  const writeEnabledToUI = (on: boolean) => {
    try {
      const elA = byId<HTMLInputElement>('settingsEnableObs');
      const elB = byId<HTMLInputElement>('enableObs');
      if (elA) elA.checked = !!on;
      if (elB) elB.checked = !!on;
    } catch {}
  };

  // Initialize recorder bridge with dynamic getters
  try {
    rec.init({
      getUrl: readUrl,
      getPass: readPass,
      // Important: drive connection using the persistent flag, not the transient UI
      isEnabled: getObsEnabled,
      onStatus: (txt: string, ok: boolean) => {
        try { const p = pillEl(); if (p) p.textContent = ok ? 'connected' : (txt || 'disconnected'); } catch {}
      },
      onRecordState: (_active: boolean) => {},
    });
  } catch {}

  // Delegated listeners so it works even if Settings overlay mounts later
  try {
    document.addEventListener('change', (e) => {
      const t = e.target as HTMLElement | null;
      const id = (t as any)?.id || '';
      if (id === 'settingsEnableObs' || id === 'enableObs') {
        // Persist and apply immediately
        const on = readEnabledFromUI();
        setObsEnabled(on);
        try { rec.setEnabled(on); } catch {}
        const cfg = getRecorderSettings();
        const next = new Set(Array.isArray(cfg?.selected) ? cfg.selected : []);
        if (on) next.add('obs'); else next.delete('obs');
        syncRegistrySelection(Array.from(next));
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
        const el = byId<HTMLInputElement>('settingsEnableObs') || byId<HTMLInputElement>('enableObs');
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
    const S = (window as any).__tpStore;
    if (S && typeof S.subscribe === 'function') {
      try {
        S.subscribe('obsEnabled', (v: any) => {
          const next = !!v;
          try { setObsEnabled(next); } catch {}
          try { rec.setEnabled(next); } catch {}
          const cfg = getRecorderSettings();
          const current = Array.isArray(cfg?.selected) ? cfg.selected : [];
          const set = new Set(current);
          if (next) {
            set.add('obs');
          } else {
            set.delete('obs');
          }
          syncRegistrySelection(Array.from(set));
        });
      } catch {}
      try { S.subscribe('obsHost', (h: any) => { try { rec.reconfigure(parseWsUrl(h ? `ws://${String(h)}` : readUrl(), readPass())); } catch {} }); } catch {}
      try { S.subscribe('obsPassword', (p: any) => { try { rec.reconfigure({ password: String(p || '') } as any); } catch {} }); } catch {}
    }
  } catch {}

  // On load: apply persisted state (connect if enabled), and ensure clean disconnect on page close
  try {
    if (getObsEnabled()) {
      try { rec.setEnabled(true); } catch {}
    }
    const cfg = getRecorderSettings();
    syncRegistrySelection(Array.isArray(cfg?.selected) ? cfg.selected : []);
  } catch {}
  try {
    window.addEventListener('beforeunload', () => { try { rec.setEnabled(false); } catch {} });
  } catch {}
}
