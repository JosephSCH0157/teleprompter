// Bridge adapter: triggers local HTTP endpoints or simulates starts/stops
// Config shape (from recorders settings):
// { startUrl: string, stopUrl?: string }

/** @returns {import('../recorders.js').RecorderAdapter} */
export function createBridgeAdapter(){
  let cfg = { startUrl: '', stopUrl: '' };
  let active = false;
  function configure(next){ cfg = { ...cfg, ...(next||{}) }; }
  async function ping(url){
    if (!url) return;
    try {
      await fetch(url, { method: 'POST', mode: 'no-cors' });
    } catch {}
  }
  return {
    id: 'bridge',
    label: 'Bridge (HTTP hooks)',
    configure,
    async isAvailable(){ return true; },
    async start(){ active = true; await ping(cfg.startUrl); },
    async stop(){ if (!active) return; active = false; await ping(cfg.stopUrl); },
    async test(){ await ping(cfg.startUrl || cfg.stopUrl); }
  };
}
