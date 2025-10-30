// src/wiring/obs-wiring.ts
// Minimal, UI-safe OBS wiring for TS path
// Uses the lightweight inline OBS v5 bridge in recorders.js

// @ts-ignore - recorders.js is JS
import * as rec from '../../recorders.js';
import { obsTestConnect } from '../dev/obs-probe';

export function initObsUI() {
  try { (window as any).__tpObsInlineBridgeActive = true; } catch {}
  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const pillEl = () => (byId<HTMLElement>('obsStatusText') || byId<HTMLElement>('obsStatus'));
  const testMsgEl = () => byId<HTMLElement>('settingsObsTestMsg');

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
  const readEnabled = () => !!(byId<HTMLInputElement>('settingsEnableObs')?.checked || byId<HTMLInputElement>('enableObs')?.checked);

  // Initialize recorder bridge with dynamic getters
  try {
    rec.init({
      getUrl: readUrl,
      getPass: readPass,
      isEnabled: readEnabled,
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
        try { rec.setEnabled(readEnabled()); } catch {}
      }
      if (id === 'settingsObsUrl' || id === 'obsUrl' || id === 'settingsObsHost') {
        try { rec.reconfigure(parseWsUrl(readUrl(), readPass())); } catch {}
      }
      if (id === 'settingsObsPassword' || id === 'obsPassword') {
        try { rec.reconfigure({ password: readPass() } as any); } catch {}
      }
    }, { capture: true });
  } catch {}

  // Delegated Test/Sync/Poke buttons
  try {
    document.addEventListener('click', async (e) => {
      const t = e.target as HTMLElement | null;
      const id = (t as any)?.id || '';
      const pill = pillEl();
      const testMsg = testMsgEl();
      const clearMsg = () => { try { if (testMsg) { testMsg.textContent = ''; testMsg.classList.remove('obs-test-ok','obs-test-error'); } } catch {} };
      const okMsg = (s: string) => { try { if (testMsg) { testMsg.textContent = s; testMsg.classList.add('obs-test-ok'); } } catch {} };
      const errMsg = (s: string) => { try { if (testMsg) { testMsg.textContent = s; testMsg.classList.add('obs-test-error'); } } catch {} };

      if (id === 'settingsObsTest') {
        try { e.preventDefault(); e.stopImmediatePropagation(); } catch {}
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
    }, { capture: true });
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
      try { S.subscribe('obsEnabled', (v: any) => { try { rec.setEnabled(!!v); } catch {} }); } catch {}
      try { S.subscribe('obsHost', (h: any) => { try { rec.reconfigure(parseWsUrl(h ? `ws://${String(h)}` : readUrl(), readPass())); } catch {} }); } catch {}
      try { S.subscribe('obsPassword', (p: any) => { try { rec.reconfigure({ password: String(p || '') } as any); } catch {} }); } catch {}
    }
  } catch {}
}
