// Generic Hotkey adapter via local HTTP helper (tools/hotkey_bridge.ps1)
// Sends OS-level hotkeys by calling: GET {baseUrl}/send?keys=Ctrl+R
// Config shape: { baseUrl?: string, startHotkey?: string, stopHotkey?: string }

const configDefaults = {
  baseUrl: '',
  startHotkey: 'Ctrl+R',
  stopHotkey: 'Ctrl+R',
  label: 'Hotkey Bridge',
};

function normalizeBase(url) {
  if (!url) return '';
  return String(url).replace(/\/+$/, '');
}

function getKeys(primary, fallback) {
  return String(primary || fallback || '');
}

async function send(url) {
  if (!url) return false;
  try {
    await fetch(url, { method: 'GET', mode: 'no-cors' });
    return true;
  } catch (err) {
    try { console.warn('[bridge] hotkey send failed', err); } catch {}
    return false;
  }
}

/**
 * @param {string} id
 * @param {string} label
 * @returns {import('../recorders.js').RecorderAdapter}
 */
export function createHotkeyAdapter(id = 'hotkey', label = 'Hotkey Bridge') {
  let cfg = { ...configDefaults, label };

  const adapter = {
    id,
    label: cfg.label,
    configure: (next) => {
      cfg = { ...cfg, ...(next || {}) };
      adapter.label = cfg.label || label;
    },
    async isAvailable() {
      return !!normalizeBase(cfg.baseUrl);
    },
    async start() {
      return tap(cfg.startHotkey);
    },
    async stop() {
      const keys = cfg.stopHotkey || cfg.startHotkey;
      if (!keys) return false;
      return tap(keys);
    },
    async test() {
      return tap(cfg.startHotkey);
    },
  };

  function urlFor(keys) {
    const base = normalizeBase(cfg.baseUrl);
    if (!base) return '';
    const hotkey = getKeys(keys, cfg.startHotkey);
    if (!hotkey) return '';
    return base + '/send?keys=' + encodeURIComponent(hotkey);
  }

  async function tap(keys) {
    const target = urlFor(keys);
    return send(target);
  }

  return adapter;
}
