// adapters/bridge.ts
function createBridgeAdapter() {
  let cfg = { startUrl: "", stopUrl: "" };
  let active = false;
  function configure(next) {
    cfg = { ...cfg, ...next || {} };
  }
  async function ping(url) {
    if (!url) return;
    try {
      await fetch(url, { method: "POST", mode: "no-cors" });
    } catch {
    }
  }
  return {
    id: "bridge",
    label: "Bridge (HTTP hooks)",
    configure,
    async isAvailable() {
      return true;
    },
    async start() {
      active = true;
      await ping(cfg.startUrl);
    },
    async stop() {
      if (!active) return;
      active = false;
      await ping(cfg.stopUrl);
    },
    async test() {
      await ping(cfg.startUrl || cfg.stopUrl);
    }
  };
}
export {
  createBridgeAdapter
};
//# sourceMappingURL=bridge.js.map
