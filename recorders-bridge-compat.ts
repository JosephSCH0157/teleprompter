// @ts-nocheck
import {
    applyConfigs,
    clearHandoffTimer,
    getSettings,
    setMode,
    setSelected,
    setSettings,
    setTrackedTimeout,
    start,
    startSelected,
    stopSelected,
} from './recorders-core';

// --- Compatibility recorder surface used by the app ---
// Provides a small surface with idempotent lifecycle and status events.
const recorder = {
  state: 'disabled',
  async init() { return true; },
  async connect() { return true; },
  async disconnect() { return true; },
  setEnabled(_on) { /* no-op for stub */ },
};

export function initCompat() {
  // Create a minimal registry surface the old code expects.
  if (typeof window !== 'undefined') {
    if (!window.__recorder) {
      window.__recorder = {
        get(name) {
          return name === 'obs' ? recorder : null;
        }
      };
    }
    // Also expose a global for anything still probing window.recorders
    window.recorders = window.recorders || window.__recorder;
  }
  return typeof window !== 'undefined' ? window.__recorder : { get: () => null };
}

const compatDefault = {
  init: initCompat,
  get(name) {
    return name === 'obs' ? recorder : null;
  },
  // Also surface the modern API explicitly if anyone wants it
  recorder
};

export default compatDefault;

// UMD-style safety net for non-module script loads
if (typeof window !== 'undefined') {
  window.__recorder = window.__recorder || {
    get(name) {
      return name === 'obs' ? recorder : null;
    }
  };
  window.recorders = window.recorders || window.__recorder;
}

// --- Legacy global bridge ---------------------------------------------------
// Many legacy callers (teleprompter_pro.js) expect window.__recorder to expose
// start/stop and settings helpers. Provide a thin bridge to the SSOT above.
try {
  if (typeof window !== 'undefined') {
    // Ensure the base shim exists
    initCompat();
    const api = window.__recorder;
    // Attach SSOT methods (idempotent)
    if (!api.start) api.start = () => startSelected();
    if (!api.stop) api.stop = () => stopSelected();
    // Expose a minimal preflight helper (currently OBS-centric)
    if (!api.preflight) api.preflight = async (target = 'obs') => {
      const issues = [];
      try {
        if (target === 'obs') {
          const bridge = window.__obsBridge || null;
          if (!bridge) issues.push('OBS bridge missing');
          else {
            try {
              const st = await bridge.getRecordStatus();
              if (!st) issues.push('OBS not responding');
            } catch { issues.push('OBS GetRecordStatus failed'); }
            try {
              if (typeof bridge.getRecordDirectory === 'function') {
                const dir = await bridge.getRecordDirectory();
                if (!dir || !dir.recordDirectory) issues.push('Record directory unknown');
              }
            } catch { /* optional */ }
            try {
              const stats = await bridge.getStats();
              const bytes = stats?.recording?.freeDiskSpace || stats?.free_disk_space || null;
              const free = typeof bytes === 'number' ? bytes : (typeof bytes === 'string' && /^\d+$/.test(bytes) ? Number(bytes) : null);
              if (free != null && free < 2 * 1024 * 1024 * 1024) issues.push('Low disk space (<2 GB)');
            } catch { /* ignore */ }
          }
        }
      } catch {}
      return issues;
    };
    if (!api.getSettings) api.getSettings = () => getSettings();
    if (!api.setSettings) api.setSettings = (next) => setSettings(next);
    if (!api.setSelected) api.setSelected = (ids) => setSelected(ids);
    if (!api.setMode) api.setMode = (mode) => setMode(mode);
    if (!api.__finalizeForTests) api.__finalizeForTests = () => { try { clearHandoffTimer(); } catch {} };
    // Keep a stable alias under window.recorders too
    window.recorders = window.recorders || api;
  }
} catch {}

/* ------------------------------------------------------------------
 * Minimal inline OBS v5 bridge (safe, idempotent)
 * Exposes: init, setEnabled, reconfigure, test, connect, disconnect, isConnected
 * This is a lightweight client implementing the minimal Identify handshake
 * so the rest of the app can call connect/test without needing adapters/obs.js.
 * ------------------------------------------------------------------ */

let _ws = null,
  _connecting = false,
  _identified = false;
// Config for inline bridge connection when used directly
let obsCfg = { host: '127.0.0.1', port: 4455, secure: false };
let _cfgBridge = {
  getUrl: () => 'ws://127.0.0.1:4455',
  getPass: () => '',
  isEnabled: () => false,
  onStatus: (txt, ok) => console.log('[OBS]', txt, ok),
  onRecordState: () => {},
};

let _enabled = false;

function getObsBridge(): any | null {
  try {
    const w = window as any;
    return w.__obsBridge ?? w.__tpObsBridge ?? null;
  } catch {
    return null;
  }
}

async function safeConnect(testOnly?: boolean): Promise<boolean> {
  let bridge = getObsBridge();
  if (!bridge || typeof bridge.connect !== 'function') {
    if (typeof (window as any).__loadObsBridge === 'function') {
      try { await (window as any).__loadObsBridge(); } catch {}
      bridge = getObsBridge();
    }
  }
  if (!bridge || typeof bridge.connect !== 'function') {
    try { console.warn('[OBS] connect(testOnly=%o) ignored; no bridge present', !!testOnly); } catch {}
    return false;
  }
  try {
    _cfgBridge.isEnabled = () => _enabled === true;
    const res = await bridge.connect({ testOnly });
    return !!res;
  } catch (e) {
    try { console.warn('[OBS] connect failed', e); } catch {}
    return false;
  }
}

async function safeSetEnabled(on: boolean): Promise<boolean> {
  _enabled = !!on;
  const bridge = getObsBridge();
  if (!bridge) {
    try { console.warn('[OBS] setEnabled(%o) ignored; no bridge present', on); } catch {}
    return false;
  }
  try {
    if (typeof bridge.setEnabled === 'function') {
      await bridge.setEnabled(on);
    } else {
      if (on) await bridge.connect?.({});
      else await bridge.disconnect?.();
    }
    return true;
  } catch (e) {
    try { console.warn('[OBS] setEnabled(%o) failed', on, e); } catch {}
    return false;
  }
}

export function initBridge(opts = {}) {
  _cfgBridge = { ..._cfgBridge, ...opts };
  try {
    if (_cfgBridge.isEnabled()) connect();
  } catch {}
}

export function setEnabled(on) {
  return safeSetEnabled(on);
}
export async function reconfigure(cfg = {}) {
  try {
    if (cfg && typeof cfg === 'object') {
      obsCfg = { ...obsCfg, ...cfg, port: Number(cfg.port) || obsCfg.port };
      // Keep password available for the inline bridge connect logic
      if (cfg.password != null) {
        try {
          obsCfg.password = String(cfg.password || '');
        } catch {}
      }
      // Update the bridge getter so connect() picks up the latest password
      try {
        _cfgBridge.getPass = () => obsCfg.password || '';
      } catch {}
    }
    // If already connected, reconnect soon to apply changes
    try {
      if (_ws) {
        try {
          // best-effort: close then reconnect
          _ws.close(1000, 'reconfig');
        } catch {}
        reconnectSoon(200);
      }
    } catch {}
  } catch {}
}
export async function test() {
  try {
    return await connect({ testOnly: true });
  } catch {
    return false;
  }
}
export async function disconnect() {
  try {
    _identified = false;
    _connecting = false;
    try {
      _ws && _ws.close(1000, 'manual');
    } catch {}
    _ws = null;
    try {
      _cfgBridge.onStatus?.('disconnected', false);
    } catch {}
  } catch {}
  return true;
}

let _reconnTimer = 0;
function reconnectSoon(ms = 400) {
  try {
    clearTimeout(_reconnTimer);
    _reconnTimer = setTrackedTimeout(() => {
      try { connect(); } catch {}
    }, ms);
  } catch {}
}

export async function connect({ testOnly = false, reason = 'runtime' } = {}) {
  return safeConnect(testOnly);
}

export function isConnected() {
  return _identified;
}

// Public initializer for UI wiring. Maps simple UI hooks into the registry settings
export function init({ getUrl, getPass, isEnabled, onStatus, onRecordState } = {}) {
  try {
    if (typeof onStatus === 'function') onStatus('recorder loaded', true);

    if (getUrl || getPass) {
      try {
        setSettings({
          configs: {
            obs: {
              url: getUrl ? getUrl() : undefined,
              password: getPass ? getPass() : undefined,
            },
          },
        });
      } catch {}
    }
    try {
      applyConfigs();
    } catch {}

    try {
      if (isEnabled && isEnabled()) {
        // startSelected alias
        start();
      }
    } catch {}

    // Also initialize the inline bridge if present so it can use the same hooks
    try {
      if (typeof initBridge === 'function') {
        initBridge({ getUrl, getPass, isEnabled, onStatus, onRecordState });
      }
    } catch {}

    return true;
  } catch {
    return false;
  }
}
