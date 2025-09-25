// OBS adapter: uses obs-websocket-js v5 via dynamic import
// Config shape: { url: string, password?: string }

let _obs = null;
let _cfg = { url: 'ws://127.0.0.1:4455', password: '' };

async function ensureObsLib(){
  if (window.OBSWebSocket) return window.OBSWebSocket;
  const mod = await import('https://cdn.jsdelivr.net/npm/obs-websocket-js@5.0.4/+esm');
  return mod.default || mod.OBSWebSocket || mod;
}

async function getObs(){
  if (_obs) return _obs;
  const OBSWebSocket = await ensureObsLib();
  _obs = new OBSWebSocket();
  return _obs;
}

/** @returns {import('../recorders.js').RecorderAdapter} */
export function createOBSAdapter(){
  let active = false;
  function configure(next){ _cfg = { ..._cfg, ...(next||{}) }; }
  return {
    id: 'obs',
    label: 'OBS (WebSocket)',
    configure,
    async isAvailable(){
      try {
        const obs = await getObs();
        if (obs?.identified) return true;
        await obs.connect(_cfg.url, _cfg.password);
        return true;
      } catch {
        try { _obs?.disconnect(); } catch {}
        _obs = null;
        return false;
      }
    },
    async start(){
      const obs = await getObs();
      if (!obs?.identified) await obs.connect(_cfg.url, _cfg.password);
      await obs.call('StartRecord');
      active = true;
    },
    async stop(){
      if (!active) return;
      const obs = await getObs();
      if (!obs?.identified) return;
      await obs.call('StopRecord');
      active = false;
    },
    async test(){
      const ok = await this.isAvailable();
      if (!ok) throw new Error('OBS not available');
      const obs = await getObs();
      await obs.call('GetRecordStatus');
    }
  };
}
