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
    obs: { url: 'ws://192.168.1.198:4455', password: '' },
    companion: { url: 'http://127.0.0.1:8000', buttonId: '1.1' },
    bridge: { startUrl: 'http://127.0.0.1:5723/record/start', stopUrl: '' },
    descript: { startHotkey: 'Ctrl+R', via: 'bridge' },
    capcut: { startHotkey: 'Ctrl+R', via: 'companion' },
    winmedia: { startHotkey: 'Ctrl+R', via: 'bridge' },
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

function selectedIds() {
  const ids = Array.isArray(settings.selected) ? settings.selected.slice() : [];
  if (settings.mode === 'single' && ids.length > 1) ids.length = 1;
  return ids.filter((id) => registry.has(id));
}

/** Start selected recorders based on settings (respects mode, timeouts, failPolicy). */
export async function startSelected() {
  return guarded(async () => {
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

/* ------------------------------------------------------------------
 * Minimal inline OBS v5 bridge (safe, idempotent)
 * Exposes: init, setEnabled, reconfigure, test, connect, disconnect, isConnected
 * This is a lightweight client implementing the minimal Identify handshake
 * so the rest of the app can call connect/test without needing adapters/obs.js.
 * ------------------------------------------------------------------ */

let _ws = null,
  _connecting = false,
  _identified = false;
let _cfgBridge = {
  getUrl: () => 'ws://127.0.0.1:4455',
  getPass: () => '',
  isEnabled: () => false,
  onStatus: (txt, ok) => console.log('[OBS]', txt, ok),
  onRecordState: () => {},
};

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
export function reconfigure() {
  try {
    if (_identified) reconnectSoon();
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
export function disconnect() {
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

export function connect({ testOnly } = {}) {
  return new Promise((resolve, reject) => {
    try {
      if (!_cfgBridge.isEnabled() && !testOnly) return reject(new Error('disabled'));
      const url = _cfgBridge.getUrl?.() || 'ws://127.0.0.1:4455';
      const pass = _cfgBridge.getPass?.() || ''; // Original line for context
      try {
        _ws && _ws.close(1000, 'reconnect');
      } catch {}
      _identified = false;
      _connecting = true;
      try {
        _cfgBridge.onStatus?.('connecting…', false);
      } catch {}

      _ws = new WebSocket(url);

      _ws.onopen = () => {
        /* wait for Hello */
      };

      _ws.onmessage = async (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.op === 0) {
            try {
              const { challenge, salt } = msg.d.authentication || {};
              const rpcVersion = 1;
              let auth;
              if (challenge && salt && pass) {
                // Decode base64 salt to bytes
                const base64ToUint8Array = (b64Str) => {
                  try {
                    const bin = atob(b64Str);
                    const a = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
                    return a;
                  } catch {
                    return new Uint8Array();
                  }
                };
                const concatUint8 = (a, b) => {
                  const out = new Uint8Array(a.length + b.length);
                  out.set(a, 0);
                  out.set(b, a.length);
                  return out;
                };
                const enc = (s) => new TextEncoder().encode(s);
                const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

                const saltBytes = base64ToUint8Array(salt);
                const passBytes = enc(pass);
                const secretInput = concatUint8(saltBytes, passBytes);
                const secretBuf = await crypto.subtle.digest('SHA-256', secretInput);
                const secretB64 = b64(secretBuf);

                // Alternate variant: SHA256(secretB64 + challenge)
                const authInputStr = secretB64 + challenge;
                const authBuf = await crypto.subtle.digest('SHA-256', enc(authInputStr));
                auth = b64(authBuf);
              }
              _ws.send(JSON.stringify({ op: 1, d: { rpcVersion, authentication: auth } }));
            } catch {
              try {
                _cfgBridge.onStatus?.('auth compute error', false);
              } catch {}
              return _ws.close(4000, 'auth-error');
            }
          } else if (msg.op === 2) {
            _identified = true;
            _connecting = false;
            try {
              _cfgBridge.onStatus?.('connected', true);
            } catch {}
            if (testOnly) {
              try {
                _ws.close(1000, 'test-ok');
              } catch {}
              resolve(true);
            }
          } else if (msg.op === 7) {
            const evType = msg.d?.eventType;
            if (evType === 'RecordStateChanged') {
              const st = msg.d?.eventData?.outputState?.toLowerCase() || 'idle';
              try {
                _cfgBridge.onRecordState?.(st);
              } catch {}
            }
          }
        } catch {
          try {
            _cfgBridge.onStatus?.('msg-parse-error', false);
          } catch {}
        }
      };

      _ws.onerror = (_e) => {
        try {
          _cfgBridge.onStatus?.('socket error', false);
        } catch {}
        _connecting = false;
      };

      _ws.onclose = (e) => {
        try {
          const code = e?.code || 0;
          const reason = e?.reason || '';
          _identified = false;
          _connecting = false;
          try {
            _cfgBridge.onStatus?.(`closed ${code} ${reason}`.trim(), false);
          } catch {}
          if (!testOnly && _cfgBridge.isEnabled() && code !== 1000) reconnectSoon(800);
          if (testOnly) reject(new Error(`close ${code}`));
        } catch (ee) {
          if (testOnly) reject(ee);
        }
      };
    } catch (outer) {
      try {
        _cfgBridge.onStatus?.('connect-exception', false);
      } catch {}
      return reject(outer);
    }
  });
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
