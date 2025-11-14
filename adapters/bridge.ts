// Bridge adapter: triggers local HTTP endpoints or simulates starts/stops
// Config shape (from recorders settings):
// { startUrl: string, stopUrl?: string }

/** @returns {import('../recorders.js').RecorderAdapter} */
export function createBridgeAdapter(){
  type BridgeConfig = { startUrl: string; stopUrl?: string };
  let cfg: BridgeConfig = { startUrl: '', stopUrl: '' };
  let active = false;
  function configure(next: Partial<BridgeConfig>){ cfg = { ...cfg, ...(next||{}) }; }
  async function ping(url?: string): Promise<void>{
    if (!url) return;
    try {
      await fetch(url, { method: 'POST', mode: 'no-cors' });
    } catch {
      // ignore
    }
  }
  return {
    id: 'bridge',
    label: 'Bridge (HTTP hooks)',
    configure,
    async isAvailable(): Promise<boolean>{ return true; },
    async start(): Promise<void>{ active = true; await ping(cfg.startUrl); },
    async stop(): Promise<void>{ if (!active) return; active = false; await ping(cfg.stopUrl); },
    async test(): Promise<void>{ await ping(cfg.startUrl || cfg.stopUrl); }
  };
}
