// src/wiring/obs-wiring.ts
// Minimal, UI-safe OBS wiring for TS path
// Uses the lightweight inline OBS v5 bridge in recorders.js

// @ts-ignore - recorders.js is JS
import * as rec from '../../recorders.js';

export function initObsUI() {
  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

  // Inputs (use either Settings overlay or main panel ids)
  const urlIn  = (byId<HTMLInputElement>('settingsObsUrl')    || byId<HTMLInputElement>('obsUrl'));
  const passIn = (byId<HTMLInputElement>('settingsObsPassword')|| byId<HTMLInputElement>('obsPassword'));
  const enable = (byId<HTMLInputElement>('settingsEnableObs')  || byId<HTMLInputElement>('enableObs'));

  // Buttons / status
  const testBtn  = byId<HTMLButtonElement>('settingsObsTest');
  const syncBtn  = byId<HTMLButtonElement>('settingsObsSyncTest');
  const pokeBtn  = byId<HTMLButtonElement>('settingsObsPoke'); // optional
  const pill     = (byId<HTMLElement>('obsStatusText') || byId<HTMLElement>('obsStatus'));
  const testMsg  = byId<HTMLElement>('settingsObsTestMsg');

  const getUrl  = () => (urlIn?.value?.trim() || 'ws://127.0.0.1:4455');
  const getPass = () => (passIn?.value ?? '');

  // Initialize recorder bridge with UI hooks
  try {
    rec.init({
      getUrl,
      getPass,
      isEnabled: () => !!(enable?.checked),
      onStatus: (txt: string, ok: boolean) => {
        try { if (pill) pill.textContent = ok ? 'connected' : (txt || 'disconnected'); } catch {}
      },
      onRecordState: (_active: boolean) => { /* hook if needed */ },
    });
  } catch {}

  // Live config updates → apply to bridge
  try { enable?.addEventListener('change', () => rec.setEnabled(!!enable.checked)); } catch {}
  try { urlIn?.addEventListener('change', () => rec.reconfigure(parseWsUrl(getUrl(), getPass()))); } catch {}
  try { passIn?.addEventListener('change', () => rec.reconfigure({ password: getPass() })); } catch {}

  // “Test” = connect with testOnly=true under the hood
  try {
    testBtn?.addEventListener('click', async () => {
      clearMsg(); pill && (pill.textContent = 'testing…');
      try {
        const ok = await rec.test();
        if (!ok) throw new Error('test failed');
        okMsg('OBS test: OK'); pill && (pill.textContent = 'ok');
      } catch (e: any) {
        errMsg('OBS test failed: ' + (e?.message || String(e))); pill && (pill.textContent = 'failed');
      }
    });
  } catch {}

  // “Sync & Test” = push current URL/pass to bridge, then test
  try {
    syncBtn?.addEventListener('click', async () => {
      clearMsg();
      try {
        await rec.reconfigure(parseWsUrl(getUrl(), getPass()));
        const ok = await rec.test();
        if (!ok) throw new Error('test failed');
        okMsg('OBS sync+test: OK'); pill && (pill.textContent = 'ok');
      } catch (e: any) {
        errMsg('OBS sync+test failed: ' + (e?.message || String(e)));
      }
    });
  } catch {}

  // Optional: “Poke” (no-op call to verify RPC works)
  try {
    pokeBtn?.addEventListener('click', async () => {
      clearMsg();
      try {
        const ok = await rec.test();
        if (!ok) throw new Error('poke failed');
        okMsg('OBS poke: OK');
      } catch (e: any) {
        errMsg('OBS poke failed: ' + (e?.message || String(e)));
      }
    });
  } catch {}

  function clearMsg() { try { if (testMsg) { testMsg.textContent = ''; testMsg.classList.remove('obs-test-ok','obs-test-error'); } } catch {} }
  function okMsg(s: string) { try { if (testMsg) { testMsg.textContent = s; testMsg.classList.add('obs-test-ok'); } } catch {} }
  function errMsg(s: string) { try { if (testMsg) { testMsg.textContent = s; testMsg.classList.add('obs-test-error'); } } catch {} }

  function parseWsUrl(u: string, pass: string) {
    try {
      const url = new URL(u);
      return { secure: url.protocol === 'wss:', host: url.hostname, port: Number(url.port || 4455), password: pass } as any;
    } catch { return { password: pass } as any; }
  }
}
