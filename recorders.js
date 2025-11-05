// --- Compatibility shim (legacy callers expect a registry) ---


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

export default {
  init: initCompat,
  get(name) {
    return name === 'obs' ? recorder : null;
  },
  // Also surface the modern API explicitly if anyone wants it
  recorder
};

// UMD-style safety net for non-module script loads
if (typeof window !== 'undefined') {
  window.__recorder = window.__recorder || {
    get(name) {
      return name === 'obs' ? recorder : null;
    }
  };
  window.recorders = window.recorders || window.__recorder;
}
// Simple recorder adapter registry
// Usage:
//   import { register, get, all } from './recorders.js';
//   register({ id: 'bridge', label: 'Bridge', isAvailable: async () => true, start: async ()=>{}, stop: async ()=>{} });
//   const adapter = get('bridge');
//   const list = all();

/**
 * @typedef {Object} RecorderAdapter
 * @property {string} id                       // e.g. "obs", "companion", "bridge"
 * @property {string} label                    // e.g. "OBS (WebSocket)"
 * @property {() => Promise<boolean>} isAvailable
 * @property {() => Promise<void>} start
 * @property {() => Promise<void>} stop
 * @property {() => Promise<void>} [test]      // optional “Test” button
 * @property {(cfg: any) => void} [configure]  // pass settings in
 */

/* ------------------------------------------------------------------
 * SSOT Recording API — window.__tpRecording
 * One call: start()/stop() routes to OBS / Bridge / Premiere
 * Reads config from either a top-level 'configs' blob or 'tp_rec_settings_v1'.
 * ------------------------------------------------------------------ */
(function(){
      try {
        if (typeof window === 'undefined') return;
        const LS = {
          cfg: 'configs',                 // whole app config blob (optional)
          recAdapter: 'tp_rec_adapter',   // 'obs' | 'bridge' | 'premiere'
          autoStart: 'tp_auto_record_on_start_v1',
          modern: 'tp_rec_settings_v1',   // modern settings blob from registry (has .configs)
        };

        function getJSON(k, d){
          try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : (d||{}); } catch { return (d||{}); }
        }
        function getCfg(){
          // Merge top-level configs with modern settings.configs
          const a = getJSON(LS.cfg, {});
          const b = getJSON(LS.modern, {});
          const inner = (b && b.configs) || {};
          // Top-level may also carry a recording sub-blob
          const merged = { ...inner, ...a };
          if (a && a.recording) merged.recording = a.recording;
          return merged;
        }
        function getAdapter(){
          const cfg = getCfg();
          try { return (cfg.recording && cfg.recording.adapter) || localStorage.getItem(LS.recAdapter) || 'bridge'; } catch { return 'bridge'; }
        }
        function wantsAuto(){ try { return localStorage.getItem(LS.autoStart) === '1'; } catch { return false; } }

        async function httpSend(url, body){
          if (!url) throw new Error('Missing URL');
          const res = await fetch(url, {
            method: body ? 'POST' : 'GET',
            headers: body ? { 'content-type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
            mode: 'no-cors',
          });
          // In no-cors mode, ok may be false even if delivered; consider as best-effort success
          try { return !!res.ok || true; } catch { return true; }
        }

        function bridgeCfg(){
          const cfg = getCfg().bridge || {};
          return {
            mode: cfg.mode || 'hotkey',
            baseUrl: String(cfg.baseUrl || 'http://127.0.0.1:5723').replace(/\/+$/, ''),
            startHotkey: cfg.startHotkey || cfg.preset || 'Ctrl+R',
            stopHotkey: cfg.stopHotkey || '',
            startUrl: cfg.startUrl || '',
            stopUrl: cfg.stopUrl || '',
          };
        }

        async function bridgeStart(){
          const b = bridgeCfg();
          if (b.mode === 'http') {
            return httpSend(b.startUrl);
          }
          const url = b.baseUrl + '/send?keys=' + encodeURIComponent(b.startHotkey);
          try { return await httpSend(url); }
          catch { return httpSend(b.baseUrl + '/send', { keys: b.startHotkey }); }
        }
        async function bridgeStop(){
          const b = bridgeCfg();
          if (b.mode === 'http') {
            return b.stopUrl ? httpSend(b.stopUrl) : true;
          }
          if (!b.stopHotkey) return true;
          const url = b.baseUrl + '/send?keys=' + encodeURIComponent(b.stopHotkey);
          try { return await httpSend(url); }
          catch { return httpSend(b.baseUrl + '/send', { keys: b.stopHotkey }); }
        }

        async function obsStart(){
          try {
            if (window.__obsBridge && typeof window.__obsBridge.start === 'function') {
              await window.__obsBridge.start();
              return true;
            }
          } catch {}
          try {
            if (window.__tpObs && typeof window.__tpObs.ensureRecording === 'function') {
              return !!(await window.__tpObs.ensureRecording(true));
            }
          } catch {}
          return false;
        }
        async function obsStop(){
          try {
            if (window.__obsBridge && typeof window.__obsBridge.stop === 'function') {
              await window.__obsBridge.stop();
              return true;
            }
          } catch {}
          try {
            if (window.__tpObs && typeof window.__tpObs.ensureRecording === 'function') {
              return !!(await window.__tpObs.ensureRecording(false));
            }
          } catch {}
          return false;
        }

        async function premStart(){
          // Use the same hotkey bridge pattern as Premiere Hotkey adapter UI
          const p = getCfg().premiere || {};
          const base = String(p.baseUrl || 'http://127.0.0.1:5723').replace(/\/+$/, '');
          const hk = String(p.startHotkey || 'Ctrl+R');
          const url = base + '/send?keys=' + encodeURIComponent(hk);
          try { return await httpSend(url); }
          catch { return httpSend(base + '/send', { keys: hk }); }
        }
        async function premStop(){
          const p = getCfg().premiere || {};
          const base = String(p.baseUrl || 'http://127.0.0.1:5723').replace(/\/+$/, '');
          const hk = String(p.stopHotkey || '');
          if (!hk) return true;
          const url = base + '/send?keys=' + encodeURIComponent(hk);
          try { return await httpSend(url); }
          catch { return httpSend(base + '/send', { keys: hk }); }
        }

        async function start(){
          const a = getAdapter();
          try { window.__tpHud?.log?.('[rec]', 'start', a); } catch {}
          if (a === 'obs') return obsStart();
          if (a === 'descript') return premStart();
          if (a === 'premiere') return premStart();
          return bridgeStart();
        }
        async function stop(){
          const a = getAdapter();
          try { window.__tpHud?.log?.('[rec]', 'stop', a); } catch {}
          if (a === 'obs') return obsStop();
          if (a === 'descript') return premStop();
          if (a === 'premiere') return premStop();
          return bridgeStop();
        }

        window.__tpRecording = { start, stop, wantsAuto, getAdapter };
      } catch {}
  })();

/** @type {Map<string, RecorderAdapter>} */
const registry = new Map(); // id -> adapter

// Settings and orchestration
const LS_KEY = 'tp_rec_settings_v1';

/**
 * @typedef {Object} RecorderSettings
 * @property {('single'|'multi')} mode
 * @property {string[]} selected
 * @property {Record<string, any>} configs
 * @property {{ start: number, stop: number }} timeouts
 * @property {('continue'|'abort-on-first-fail')} failPolicy
 */

/** @type {RecorderSettings} */
let settings = {
  mode: 'multi',
  selected: ['obs', 'descript'],
    configs: {
      obs: { url: 'ws://192.168.1.200:4455', password: '' },
    companion: { url: 'http://127.0.0.1:8000', buttonId: '1.1' },
    bridge: { startUrl: 'http://127.0.0.1:5723/record/start', stopUrl: '' },
    descript: { startHotkey: 'Ctrl+R', via: 'bridge' },
    capcut: { startHotkey: 'Ctrl+R', via: 'companion' },
    winmedia: { startHotkey: 'Ctrl+R', via: 'bridge' },
    premiere: { startHotkey: 'Ctrl+R', stopHotkey: '', baseUrl: 'http://127.0.0.1:5723' },
  },
  timeouts: { start: 3000, stop: 3000 },
  failPolicy: 'continue',
};

// Load saved settings if available
try {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') settings = { ...settings, ...parsed };
  } else {
    // First run: persist the defaults exactly once so future merges have a stored baseline
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(settings));
    } catch {}
  }
} catch {}

function persistSettings() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  } catch {}
}

/**
 * Update settings; shallow-merge known keys.
 * @param {Partial<RecorderSettings>} next
 */
export function setSettings(next) {
  if (!next || typeof next !== 'object') return;
  const prev = settings;
  settings = {
    ...prev,
    ...('mode' in next ? { mode: next.mode } : {}),
    ...('selected' in next
      ? { selected: Array.isArray(next.selected) ? next.selected.slice() : prev.selected }
      : {}),
    ...('configs' in next ? { configs: { ...prev.configs, ...(next.configs || {}) } } : {}),
    ...('timeouts' in next ? { timeouts: { ...prev.timeouts, ...(next.timeouts || {}) } } : {}),
    ...('failPolicy' in next ? { failPolicy: next.failPolicy } : {}),
  };
  persistSettings();
  applyConfigs();
}

export function getSettings() {
  return JSON.parse(JSON.stringify(settings));
}

export function setSelected(ids) {
  setSettings({ selected: Array.isArray(ids) ? ids : [] });
}
export function setMode(mode) {
  setSettings({ mode });
}
export function setTimeouts(t) {
  setSettings({ timeouts: t });
}
export function setFailPolicy(p) {
  setSettings({ failPolicy: p });
}

/** Apply per-adapter configuration objects via adapter.configure(cfg) when present. */
export function applyConfigs() {
  for (const [id, a] of registry.entries()) {
    try {
      const cfg = settings.configs?.[id];
      if (cfg && typeof a.configure === 'function') a.configure(cfg);
    } catch {}
  }
}

function callWithTimeout(promiseOrFn, ms) {
  const p = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;
  return Promise.race([
    Promise.resolve().then(() => p),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), Math.max(0, ms || 0))),
  ]);
}

let _busy = false;
async function guarded(fn) {
  if (_busy) return { skipped: true };
  _busy = true;
  try {
    return await fn();
  } finally {
    _busy = false;
  }
}

// Global guard: skip starting any recorders in Rehearsal mode
function isNoRecordMode() {
  try {
    return !!(window.__tpNoRecord || (typeof document !== 'undefined' && document.body && document.body.classList && document.body.classList.contains('mode-rehearsal')));
  } catch { return false; }
}

function selectedIds() {
  const ids = Array.isArray(settings.selected) ? settings.selected.slice() : [];
  if (settings.mode === 'single' && ids.length > 1) ids.length = 1;
  return ids.filter((id) => registry.has(id));
}

/** Start selected recorders based on settings (respects mode, timeouts, failPolicy). */
export async function startSelected() {
  return guarded(async () => {
    if (isNoRecordMode()) {
      try { window.HUD?.log?.('rehearsal', { skip: 'startSelected (no-record)' }); } catch {}
      return { results: [], started: [] };
    }
    applyConfigs();
    const ids = selectedIds();
    const started = [];
    const actions = ids.map((id) => ({ id, a: registry.get(id) }));
    const doStart = async ({ id, a }) => {
      if (!a) return { id, ok: false, error: 'missing' };
      try {
        const avail = await callWithTimeout(() => a.isAvailable(), settings.timeouts.start);
        if (!avail) return { id, ok: false, error: 'unavailable' };
      } catch (e) {
        return { id, ok: false, error: String(e?.message || e) };
      }
      try {
        await callWithTimeout(() => a.start(), settings.timeouts.start);
        started.push(id);
        return { id, ok: true };
      } catch (e) {
        return { id, ok: false, error: String(e?.message || e) };
      }
    };

    const results = [];
    if (settings.failPolicy === 'abort-on-first-fail') {
      // Serial, abort early
      for (const act of actions) {
        const r = await doStart(act);
        results.push(r);
        if (!r.ok) break;
      }
    } else {
      // Parallel, continue on failure
      const rs = await Promise.all(actions.map(doStart));
      results.push(...rs);
    }
    return { results, started };
  });
}

/** Stop selected recorders (parallel, timeout per adapter). */
export async function stopSelected() {
  return guarded(async () => {
    // Allow stop to proceed even in no-record mode (safe cleanup)
    if (isNoRecordMode()) {
      try { window.HUD?.log?.('rehearsal', { note: 'stopSelected (allowed during no-record)' }); } catch {}
    }
    const ids = selectedIds();
    const actions = ids.map((id) => ({ id, a: registry.get(id) })).filter((x) => !!x.a);
    const rs = await Promise.all(
      actions.map(async ({ id, a }) => {
        try {
          const avail = await callWithTimeout(() => a.isAvailable(), settings.timeouts.stop);
          if (!avail) return { id, ok: false, error: 'unavailable' };
        } catch (e) {
          return { id, ok: false, error: String(e?.message || e) };
        }
        try {
          await callWithTimeout(() => a.stop(), settings.timeouts.stop);
          return { id, ok: true };
        } catch (e) {
          return { id, ok: false, error: String(e?.message || e) };
        }
      })
    );
    return { results: rs };
  });
}

/**
 * Register or replace a recorder adapter by id.
 * @param {RecorderAdapter} adapter
 */
export function register(adapter) {
  registry.set(adapter.id, adapter);
}

/**
 * Get a recorder adapter by id.
 * @param {string} id
 * @returns {RecorderAdapter | undefined}
 */
export function get(id) {
  return registry.get(id);
}

/**
 * List all registered adapters in insertion order.
 * @returns {RecorderAdapter[]}
 */
export function all() {
  return [...registry.values()];
}

// --- Built-in adapters (OBS, Bridge) registration ---
let _builtInsInit = false;
export async function initBuiltIns() {
  if (_builtInsInit) return;
  _builtInsInit = true;
  try {
    // Attempt to load and register built-in adapters. Each is optional.
    const adapters = [];
    try {
      const m = await import((window.__TP_ADDV || ((p) => p))('./adapters/bridge.js'));
      const a = m?.createBridgeAdapter?.();
      if (a) adapters.push(a);
    } catch {}
    try {
      const m = await import((window.__TP_ADDV || ((p) => p))('./adapters/obs.js'));
      const a = m?.createOBSAdapter?.();
      if (a) adapters.push(a);
    } catch {}
    try {
      const m = await import((window.__TP_ADDV || ((p) => p))('./adapters/hotkey.js'));
      const aPrem = m?.createHotkeyAdapter?.('premiere', 'Adobe Premiere Pro');
      if (aPrem) adapters.push(aPrem);
    } catch {}
    try {
      // If obsBridge exists, register a thin adapter that delegates to it. This keeps
      // backwards compatibility for code that expects an adapter with id 'obs'.
      if (typeof window !== 'undefined' && window.__obsBridge) {
        const bridge = window.__obsBridge;
        const wrapper = {
          id: 'obs',
          label: 'OBS (WebSocket) - bridge',
          configure(cfg) {
            try {
              bridge.configure(cfg);
            } catch {}
          },
          async isAvailable() {
            try {
              return bridge.isConnected
                ? bridge.isConnected()
                : bridge.isConnected && bridge.isConnected();
            } catch {
              return !!bridge.isConnected && bridge.isConnected();
            }
          },
          async start() {
            return bridge.start();
          },
          async stop() {
            return bridge.stop();
          },
          async test() {
            return bridge.getRecordStatus();
          },
        };
        adapters.push(wrapper);
      }
    } catch {}
    for (const a of adapters) {
      try {
        register(a);
      } catch {}
    }
    applyConfigs();
  } catch {}
}

// Fire-and-forget initialization on module load (safe if ignored)
try {
  initBuiltIns();
} catch {}

// Simple aliases for consumers that prefer start/stop terminology
export async function start() {
  return startSelected();
}
export async function stop() {
  return stopSelected();
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
    if (!api.getSettings) api.getSettings = () => getSettings();
    if (!api.setSettings) api.setSettings = (next) => setSettings(next);
    if (!api.setSelected) api.setSelected = (ids) => setSelected(ids);
    if (!api.setMode) api.setMode = (mode) => setMode(mode);
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

export function initBridge(opts = {}) {
  _cfgBridge = { ..._cfgBridge, ...opts };
  try {
    if (_cfgBridge.isEnabled()) connect();
  } catch {}
}

export function setEnabled(on) {
  try {
    if (on) connect();
    else disconnect();
  } catch {}
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
    await connect({ testOnly: true });
    return true;
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
    _reconnTimer = setTimeout(() => {
      connect();
    }, ms);
  } catch {}
}

export async function connect({ testOnly = false, reason = 'runtime' } = {}) {
  // If the bridge isn’t loaded yet, try to load it (once)
  if (!window.__obsBridge || !window.__obsBridge.connect) {
    if (typeof window.__loadObsBridge === 'function') {
      try { await window.__loadObsBridge(); } catch {}
    }
  }
  // If still not present, surface a clear error
  if (!window.__obsBridge || !window.__obsBridge.connect) {
    throw new Error('OBS bridge is not available on the page.');
  }
  // Mark desire for a persistent session; the bridge’s onclose will check this
  _cfgBridge.isEnabled = () => _enabled === true;
  // Hand off to the bridge
  return window.__obsBridge.connect({ testOnly, reason });
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

// --- Compatibility recorder surface used by the app ---
// Provides a small surface with idempotent lifecycle and status events.

