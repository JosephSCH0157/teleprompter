// Generic Hotkey adapter via local HTTP helper (tools/hotkey_bridge.ps1)
// Sends OS-level hotkeys by calling: GET {baseUrl}/send?keys=Ctrl+R
// Config shape: { baseUrl?: string, startHotkey?: string, stopHotkey?: string }

/**
 * @param {string} id
 * @param {string} label
 * @returns {import('../recorders.js').RecorderAdapter}
 */
export function createHotkeyAdapter(id = 'hotkey', label = 'Hotkey') {
  let cfg = { baseUrl: 'http://127.0.0.1:5723', startHotkey: 'Ctrl+R', stopHotkey: '' };
  function configure(next) { cfg = { ...cfg, ...(next || {}) }; }
  function urlFor(keys) {
    const base = (cfg.baseUrl || 'http://127.0.0.1:5723').replace(/\/+$/, '');
    return base + '/send?keys=' + encodeURIComponent(String(keys || cfg.startHotkey || 'Ctrl+R'));
  }
  async function ping(keys) {
    try {
      const u = urlFor(keys);
      await fetch(u, { method: 'GET', mode: 'no-cors' });
    } catch {}
  }
  return {
    id,
    label,
    configure,
    async isAvailable() {
      // Best-effort: assume available to avoid accidental hotkey sends during probing.
      // Users can hit "Test" in Settings to verify the helper is running.
      return true;
    },
    async start() { await ping(cfg.startHotkey); },
    async stop() { const k = cfg.stopHotkey || cfg.startHotkey; if (k) await ping(k); },
    async test() { await ping(cfg.startHotkey); },
  };
}
