// OBS Bridge — small wrapper around obs-websocket-js providing
// - connection lifecycle with exponential reconnect/backoff
// - simple start/stop/getStatus API
// - UI updates for connection and recording chips
// This intentionally keeps a narrow public surface so the page can use
// window.__obsBridge as a single source of truth.

let _obsClient = null;
let _connected = false;
let _connecting = false;
let _cfg = { url: 'ws://127.0.0.1:4455', password: '' };
let _autoReconnect = true;
let _backoffMs = 1000; // start 1s
const _backoffMax = 5000;
const _backoffFactor = 2;
const _listeners = { connect: [], disconnect: [], recordstate: [], error: [] };
let _lastScene = null;

function _getElem(id) {
  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

// Return OBS stats (GetStats) if available
async function _getStats() {
  try {
    await _connectOnce();
    if (!_obsClient) return null;
    return await _obsClient.call('GetStats');
  } catch (e) {
    _emit('error', e);
    return null;
  }
}

function _setObsConnChip(connected) {
  try {
    window.__obsConnected = !!connected;
    const el = _getElem('obsConnStatus');
    if (!el) return;
    el.textContent = connected ? 'OBS: connected' : 'OBS: disconnected';
    el.classList.toggle('connected', !!connected);
    el.classList.toggle('disconnected', !connected);
  } catch {}
}

function _setRecChipRecording(active) {
  try {
    const el = _getElem('recChip');
    if (!el) return;
    if (active) el.textContent = 'Recording';
    else if (!el.textContent || /recording/i.test(el.textContent)) el.textContent = 'Speech: idle';
    el.classList.toggle('recording', !!active);
  } catch {}
}

async function _ensureObsLib() {
  if (typeof window !== 'undefined' && window.OBSWebSocket) return window.OBSWebSocket;
  const mod = await import('https://cdn.jsdelivr.net/npm/obs-websocket-js@5.0.4/+esm');
  return mod.default || mod.OBSWebSocket || mod;
}

async function _createClient() {
  if (_obsClient) return _obsClient;
  const OBSWebSocket = await _ensureObsLib();
  _obsClient = new OBSWebSocket();
  return _obsClient;
}

async function _connectOnce() {
  if (_connected || _connecting) return;
  _connecting = true;
  try {
    const client = await _createClient();
    // wire basic events
    client.on('ConnectionClosed', () => {
      _connected = false;
      _setObsConnChip(false);
      _emit('disconnect');
      try { window.HUD?.log?.('obs:close', { via: 'obs-websocket-js' }); } catch {}
      if (_autoReconnect) _scheduleReconnect();
    });
    client.on('ConnectionOpened', () => {
      _connected = true;
      _backoffMs = 1000;
      _setObsConnChip(true);
      _emit('connect');
    });
    client.on('RecordStateChanged', (ev) => {
      try {
        const active = !!(ev && (ev.outputActive || ev.outputActive === true));
        _setRecChipRecording(active);
        _emit('recordstate', active, ev);
      } catch {}
    });
    // prefer configured pw, otherwise fall back to window.getObsPassword
    const pw =
      _cfg.password ||
      (typeof window !== 'undefined' && window.getObsPassword ? window.getObsPassword() : '');
    await client.connect(_cfg.url, pw);
    // mark connected if no exception
    _connected = true;
    _setObsConnChip(true);
    _emit('connect');
    _connecting = false;
    return true;
  } catch (e) {
    _connecting = false;
    _connected = false;
    _setObsConnChip(false);
    _emit('error', e);
    try { window.HUD?.log?.('obs:error', String(e && e.message || e)); } catch {}
    try {
      // ensure client cleared to allow fresh attempts
      _obsClient?.disconnect();
    } catch {}
    _obsClient = null;
    if (_autoReconnect) _scheduleReconnect();
    return false;
  }
}

function _scheduleReconnect() {
  try {
    const delay = Math.min(_backoffMs, _backoffMax);
    _backoffMs = Math.min(_backoffMax, Math.max(1000, _backoffMs * _backoffFactor));
    setTimeout(() => {
      _connectOnce();
    }, delay);
  } catch {}
}

function _emit(name, ...args) {
  try {
    const list = _listeners[name] || [];
    for (const cb of list.slice()) {
      try {
        cb(...args);
      } catch {}
    }
  } catch {}
}

const bridge = {
  configure(next) {
    _cfg = { ..._cfg, ...(next || {}) };
  },
  async start() {
    try {
      await _connectOnce();
      if (!_obsClient) throw new Error('OBS client not available');
      await _obsClient.call('StartRecord');
    } catch (e) {
      _emit('error', e);
      throw e;
    }
  },
  async stop() {
    try {
      if (!_obsClient) return;
      await _obsClient.call('StopRecord');
    } catch (e) {
      _emit('error', e);
      throw e;
    }
  },
  async getRecordStatus() {
    try {
      await _connectOnce();
      if (!_obsClient) return { outputActive: false };
      return await _obsClient.call('GetRecordStatus');
    } catch (e) {
      _emit('error', e);
      return { outputActive: false };
    }
  },
  async getSceneList() {
    try {
      await _connectOnce();
      if (!_obsClient) return null;
      const res = await _obsClient.call('GetSceneList');
      // res.scenes expected
      return res && (res.scenes || res.sceneList || null);
    } catch (e) {
      _emit('error', e);
      return null;
    }
  },
  async getCurrentProgramScene() {
    try {
      await _connectOnce();
      if (!_obsClient) return null;
      // try likely method names
      try {
        const r = await _obsClient.call('GetCurrentProgramScene');
        return r && (r.currentProgramScene || r.currentProgramSceneName || r.sceneName || null);
      } catch {
        // fallback name
        try {
          const r2 = await _obsClient.call('GetProgramScene');
          return r2 && (r2.currentProgramScene || r2.sceneName || null);
        } catch (e2) {
          _emit('error', e2);
          return null;
        }
      }
    } catch (e) {
      _emit('error', e);
      return null;
    }
  },
  async getStats() {
    return _getStats();
  },
  async setCurrentProgramScene(sceneName) {
    try {
      await _connectOnce();
      if (!_obsClient) throw new Error('Not connected');
      const target = sceneName || _lastScene || 'default';
      const res = await _obsClient.call('SetCurrentProgramScene', { sceneName: target });
      try { _lastScene = target; } catch {}
      return res;
    } catch (e) {
      _emit('error', e);
      throw e;
    }
  },
  isConnected() {
    return !!_connected;
  },
  on(name, cb) {
    if (!_listeners[name]) _listeners[name] = [];
    _listeners[name].push(cb);
    return () => this.off(name, cb);
  },
  off(name, cb) {
    if (!_listeners[name]) return;
    const i = _listeners[name].indexOf(cb);
    if (i >= 0) _listeners[name].splice(i, 1);
  },
  enableAutoReconnect(v) {
    _autoReconnect = !!v;
    if (_autoReconnect && !_connected) _scheduleReconnect();
  },
};

// expose bridge on window for backwards compatibility
try {
  if (typeof window !== 'undefined') {
    window.__obsBridge = bridge;
    // set initial UI state
    _setObsConnChip(false);
  }
} catch {}

export default bridge;

