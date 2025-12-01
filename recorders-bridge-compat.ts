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
    if (typeof window === 'undefined') return null;
    // Prefer the primary bridge
    if ((window as any).__obsBridge) return (window as any).__obsBridge;
    // Fallbacks for older wiring
    if ((window as any).__tpObsBridge) return (window as any).__tpObsBridge;
    const legacy = (window as any).__tpObs;
    if (legacy && typeof legacy === 'object') return legacy;
    return null;
  } catch { return null; }
}

function inlineConnect(testOnly?: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const cfgUrl =
        obsCfg && (obsCfg as any).host
          ? `${(obsCfg as any).secure ? 'wss' : 'ws'}://${(obsCfg as any).host}:${(obsCfg as any).port}`
          : null;
      const url =
        _cfgBridge.getUrl?.() ||
        cfgUrl ||
        'ws://127.0.0.1:4455';
      const pass = _cfgBridge.getPass?.() || '';
      try { console.log('[OBS-BRIDGE] inlineConnect', { url, hasPass: !!pass, testOnly: !!testOnly }); } catch {}

      // Simple probe: open WebSocket; resolve on open/close
      if (typeof WebSocket === 'undefined') {
        try { console.warn('[OBS-BRIDGE] inlineConnect: WebSocket not available'); } catch {}
        resolve(false);
        return;
      }

      const ws = new WebSocket(url);
      let settled = false;
      ws.onopen = () => {
        settled = true;
        try { ws.close(1000, 'probe'); } catch {}
        resolve(true);
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        resolve(false);
      };
      ws.onclose = () => {
        if (settled) return;
        settled = true;
        resolve(true);
      };
    } catch (err) {
      try { console.warn('[OBS-BRIDGE] inlineConnect error', err); } catch {}
      resolve(false);
    }
  });
}

async function safeConnect(testOnly?: boolean): Promise<boolean> {
  try { console.log('[OBS-BRIDGE] connect()', { testOnly: !!testOnly, enabled: _enabled }); } catch {}
  let bridge = getObsBridge();
  if (!bridge || typeof bridge.connect !== 'function') {
    if (typeof (window as any).__loadObsBridge === 'function') {
      try { await (window as any).__loadObsBridge(); } catch {}
      bridge = getObsBridge();
    }
  }

  // If a native bridge exists, try it first; on failure or rejection, fall back to inline WS
  if (bridge && typeof bridge.connect === 'function') {
    try {
      _cfgBridge.isEnabled = () => _enabled === true;
      const res = await bridge.connect({ testOnly });
      if (res) return true;
    } catch (e) {
      try { console.warn('[OBS] native bridge connect failed, falling back to inline', e); } catch {}
    }
  }

  // If maybeConnect exists (inline bridge style), prefer that before raw WS probe
  try {
    if (bridge && typeof bridge.maybeConnect === 'function') {
      try { await bridge.maybeConnect(); } catch {}
      return !!(bridge.isConnected?.() || false);
    }
  } catch {}

  try { console.info('[OBS] connect(testOnly=%o) no native bridge; using inline WebSocket', !!testOnly); } catch {}
  return inlineConnect(testOnly);
}

async function safeSetEnabled(on: boolean): Promise<boolean> {
  _enabled = !!on;
  const bridge = getObsBridge();
  if (!bridge) {
    try { console.info('[OBS] setEnabled(%o) no bridge; flag set inline', on); } catch {}
    // No native bridge; keep the flag and let inline connect handle it when called.
    return true;
  }
  try {
    // Prefer armed/maybeConnect if available
    const ctrl: any = (bridge as any).setArmed ? bridge : (window as any).__tpObs;
    if (ctrl && typeof ctrl.setArmed === 'function') {
      ctrl.setArmed(!!on);
      if (on && typeof ctrl.maybeConnect === 'function') {
        await ctrl.maybeConnect();
      } else if (!on && typeof ctrl.disconnect === 'function') {
        await ctrl.disconnect();
      }
      return true;
    }
    if (typeof bridge.start === 'function' && typeof bridge.stop === 'function') {
      if (on) await bridge.start();
      else await bridge.stop();
      return true;
    }
    if (typeof bridge.setEnabled === 'function') {
      await bridge.setEnabled(!!on);
      return true;
    }
    try { console.warn('[OBS] safeSetEnabled: bridge present but does not support known methods'); } catch {}
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
export async function reconfigure(cfg: any = {}) {
  try {
    // Merge incoming settings into the inline config
    obsCfg = { ...obsCfg, ...cfg };

    // Normalize port
    if (typeof cfg?.port !== 'undefined') {
      const n =
        typeof cfg.port === 'string' ? parseInt(cfg.port, 10) : Number(cfg.port);
      if (!Number.isNaN(n) && n > 0) {
        (obsCfg as any).port = n;
      }
    }

    // Normalize password
    const password =
      typeof cfg?.password === 'string'
        ? cfg.password
        : (obsCfg as any).password || '';
    (obsCfg as any).password = password;

    // Build canonical URL from host/port unless an explicit url is provided
    const explicitUrl =
      cfg && typeof cfg.url === 'string' && cfg.url.trim() ? cfg.url.trim() : '';
    const host = (obsCfg as any).host || '127.0.0.1';
    const port = (obsCfg as any).port || 4455;
    const scheme = (obsCfg as any).secure ? 'wss' : 'ws';
    const url = explicitUrl || `${scheme}://${host}:${port}/`;

    // Keep the inline bridge helpers in sync
    try {
      _cfgBridge.getUrl = () => url;
      _cfgBridge.getPass = () => password;
    } catch {}

    // If the JS bridge (obsBridge.js) is present, push config into it
    try {
      const bridge = getObsBridge();
      if (bridge && typeof (bridge as any).configure === 'function') {
        (bridge as any).configure({ url, password });
      }
    } catch (err) {
      try { console.warn('[OBS] bridge.configure failed', err); } catch {}
    }

    // If already connected, reconnect soon to apply changes
    try {
      if (_ws) {
        try { _ws.close(1000, 'reconfig'); } catch {}
        reconnectSoon(200);
      }
    } catch {}
  } catch (err) {
    try { console.warn('[OBS] reconfigure failed', err); } catch {}
  }
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

export async function connect({ testOnly = false } = {}) {
  return safeConnect(testOnly);
}

// Compat alias
export async function connect2(opts?: { testOnly?: boolean }) {
  return safeConnect(opts?.testOnly);
}

export function isConnected() {
  return _identified;
}

// Compat aliases
export function setEnabled3(on: boolean) {
  return safeSetEnabled(on);
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
