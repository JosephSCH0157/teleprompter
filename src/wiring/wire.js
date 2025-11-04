// src/wiring/wire.js
// Own the OBS Test button wiring in the module runtime and expose a simple probe.

const OBS_TEST_SEL = '#settingsObsTest,[data-action="obs-test"],#obsTest';
let __obsDelegateCount = 0;
function log(tag, msg, extra){
  try { console.log(`[obs.${tag}] ${msg}`, extra || ''); } catch {}
}

function ensureObsPill(fromEl, text) {
  try {
    let pill = document.querySelector('#obsStatusText');
    if (!pill) {
      pill = document.createElement('span');
      pill.id = 'obsStatusText';
      pill.style.marginLeft = '0.5rem';
      (fromEl && fromEl.parentElement ? fromEl.parentElement : document.body).appendChild(pill);
    }
    if (text != null) pill.textContent = String(text);
    return pill;
  } catch { return null; }
}

function defaultObsProbe(urlLike, pass) {
  // Fallback probe using the global OBS adapter. Optionally keep connection sticky.
  return new Promise((resolve, reject) => {
    try {
      const adapter = (window && window.__tpOBS) || null;
      if (!adapter || typeof adapter.connect !== 'function') return reject(new Error('OBS adapter unavailable'));
      let connOpts = { host: '127.0.0.1', port: 4455, secure: false, password: String(pass || ''), reconnect: true };
      try {
        const u = new URL(String(urlLike || 'ws://127.0.0.1:4455'));
        connOpts = { host: u.hostname, port: Number(u.port || 4455), secure: (u.protocol === 'wss:'), password: String(pass || ''), reconnect: true };
      } catch {}
      const sticky = (() => { try { return window.__tpObsSticky === true || localStorage.getItem('tp_obs_sticky') === '1'; } catch { return false; } })();
      // Reuse existing sticky connection if present
      let conn = sticky && window.__tpObsConn ? window.__tpObsConn : null;
      if (!conn) {
        conn = adapter.connect({ ...connOpts, reconnect: true });
        if (sticky) { try { window.__tpObsConn = conn; } catch {} }
      }
      const cleanup = () => { try { if (!sticky) conn && conn.close && conn.close(); } catch {} };
      let done = false;
      const tm = setTimeout(() => { if (!done) { done = true; cleanup(); reject(new Error('timeout')); } }, 8000);
      try {
        new Promise((resolveId, rejectId) => {
          try {
            conn.on && conn.on('identified', resolveId);
            conn.on && conn.on('closed', () => rejectId(new Error('closed')));
            conn.on && conn.on('error', () => rejectId(new Error('error')));
          } catch { rejectId(new Error('listener-failed')); }
        })
        .then(() => conn.request('GetVersion', {}))
        .then((res) => {
          done = true; clearTimeout(tm); cleanup();
          if (res && res.ok) resolve({ version: (res.data && res.data.obsVersion) || '' });
          else reject(new Error('request failed'));
        })
        .catch((e) => { done = true; clearTimeout(tm); cleanup(); reject(e); });
      } catch (e) { done = true; clearTimeout(tm); cleanup(); reject(e); }
    } catch (e) { reject(e); }
  });
}

export function initSettingsWiring() {
  try {
    if (window.__tpObsWireActive) return; // idempotent
    window.__tpObsWireActive = true;
    // Claim OBS ownership so legacy settings wiring stands down
    window.__tpObsInlineBridgeActive = true;
    try { window.__tpObsSSOT = 'js'; } catch {}
    log('state', 'wire init (claim bridge)');

    // Provide a probe globally; avoid dynamic imports that can 404 in dev unless explicitly wired elsewhere
    if (typeof window.__obsTestConnect !== 'function') {
      window.__obsTestConnect = defaultObsProbe;
    }

    // Delegated, capture-phase handler so it always fires
    document.addEventListener('click', (ev) => {
      try {
        const t = ev.target;
        const btn = t && t.closest && t.closest(OBS_TEST_SEL);
        if (!btn) return;
        // eslint-disable-next-line no-restricted-syntax
        ev.preventDefault();
        ev.stopImmediatePropagation();

  ensureObsPill(btn, 'testing…');
        log('ui', 'Test click');
        const hostEl = document.getElementById('settingsObsHost');
        const passEl = document.getElementById('settingsObsPassword');
        const hostRaw = (hostEl && hostEl.value ? String(hostEl.value) : '').trim();
        const host = hostRaw || 'ws://127.0.0.1:4455';
        const pass = passEl && passEl.value != null ? String(passEl.value) : '';

        const probe = window.__obsTestConnect || defaultObsProbe;
        Promise.resolve()
          .then(() => probe(host, pass))
          .then((res) => {
            const version = (res && res.version) || '';
            const v = version ? `connected (${version})` : 'connected';
            ensureObsPill(btn, v);
            try { window.dispatchEvent(new CustomEvent('tp:obs-test', { detail: { ok: true, version } })); } catch {}
            log('state', 'probe ok', { version });
          })
          .catch((err) => {
            const msg = (err && err.message ? err.message : String(err));
            ensureObsPill(btn, 'failed: ' + msg);
            try { window.dispatchEvent(new CustomEvent('tp:obs-test', { detail: { ok: false, error: msg } })); } catch {}
            log('state', 'probe failed', { error: msg });
          });
      } catch {}
    }, true);
    __obsDelegateCount += 1; log('ui', `delegate installed`, { listenerCount: __obsDelegateCount });

    // Expose a tiny introspection hook for sanity checks
    try { window.__tpObsWiringInfo = () => ({ wireActive: !!window.__tpObsWireActive, delegateListeners: __obsDelegateCount, claimedBridge: !!window.__tpObsInlineBridgeActive }); } catch {}

    // Small dev helper for parity with legacy: window.__obsDebug()
    try {
      // Consult unified getters so debug reflects true state
      window.__obsDebug = () => {
        try {
          const R = getRecorder();
          const hasAdapter = !!(R && typeof R.get === 'function' && R.get('obs'));
          const hasBridge = !!window.__obsBridge;
          const s = (typeof window.getObsSurface === 'function') ? window.getObsSurface() : null;
          const connected = !!(s && ((typeof s.isIdentified === 'function' && s.isIdentified()) || s.connected || s.identified));
          const lastError = window.__tpObsLastErr ?? null;
          return { hasAdapter, hasBridge, connected, lastError };
        } catch {
          return { hasAdapter:false, hasBridge:!!window.__obsBridge, connected:false, lastError: window.__tpObsLastErr ?? null };
        }
      };
    } catch {}
    // Note: OBS connect/wait helpers and getObsCfg are defined below in the module-scoped helpers section
  } catch {}
}

// Auto-init when imported, but also export for explicit invocation
try { initSettingsWiring(); } catch {}
export default initSettingsWiring;

// ---------- OBS helpers (module path) ----------
function _sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// --- unified recorder lookup (module + legacy) ---
function getRecorder() {
  const candidates = [
    window.__recorder,
    window.recorder,
    window.recorders,
  ];
  for (const r of candidates) if (r && typeof r.get === 'function') return r;
  return null;
}

try {
  if (typeof window.getObsSurface !== 'function') {
    window.getObsSurface = function getObsSurface() {
      const R = getRecorder();
      const adapter = R?.get?.('obs');
      return adapter || window.__obsBridge || null;
    };
  }
  if (typeof window.getRecorder !== 'function') {
    window.getRecorder = getRecorder;
  }
} catch {}

function _normalizeObsCfg(raw){
  const hostElA = document.getElementById('settingsOBSHost') || document.getElementById('settingsObsHost');
  const portElA = document.getElementById('settingsOBSPort') || document.getElementById('settingsObsPort');
  const secElA  = document.getElementById('settingsOBSSecure') || document.getElementById('settingsObsSecure');
  const pwElA   = document.getElementById('settingsOBSPassword') || document.getElementById('settingsObsPassword');
  const host   = (raw?.host || hostElA?.value || '127.0.0.1').trim();
  const port   = Number(raw?.port ?? portElA?.value ?? 4455) || 4455;
  const secure = !!(raw?.secure ?? secElA?.checked);
  const password = String(raw?.password ?? pwElA?.value ?? '');
  const proto = secure ? 'wss' : 'ws';
  const url = `${proto}://${host}:${port}`;
  return { host, port, secure, password, url };
}

async function waitForObsSurface(timeout = 4000){
  const t0 = performance.now();
  for (;;) {
    const s = (typeof window.getObsSurface === 'function') ? window.getObsSurface() : (window.__recorder?.get?.('obs') || window.__obsBridge || null);
    if (s) return s;
    if (performance.now() - t0 > timeout) return null;
    await _sleep(50);
  }
}

async function _waitUntil(fn, timeout = 10000, step = 120){
  const t0 = performance.now();
  while (performance.now() - t0 < timeout) {
    try { if (await fn()) return true; } catch {}
    await _sleep(step);
  }
  return false;
}

function _tapObsEvents(surface){
  // Create a one-shot latch from any of the common OBS signals
  const flags = { open:false, ready:false, hello:false, identified:false };
  const set = k => () => { flags[k] = true; };
  // Support different emitters
  const on = surface.on?.bind(surface)
        || surface.addEventListener?.bind(surface)
        || ((evt, fn)=>{ try { surface[`on${evt}`] = fn; } catch {} });

  try { on && on('open', set('open')); } catch {}
  try { on && on('ready', set('ready')); } catch {}
  try { on && on('hello', set('hello')); } catch {}
  try { on && on('identified', set('identified')); } catch {}
  try { on && on('Identified', set('identified')); } catch {}
  try { on && on('ConnectionReady', set('ready')); } catch {}
  try { on && on('AuthenticationSuccess', set('identified')); } catch {}
  try { on && on('closed', () => { /* closed event from some adapters */ }); } catch {}

  return {
    flags,
    any: () => flags.open || flags.ready || flags.hello || flags.identified
  };
}

async function _isObsUp(surface){
  try { if (typeof surface.isConnected === 'function' && (await surface.isConnected())) return true; } catch {}
  if (surface.connected === true) return true;
  try { if (typeof surface.isIdentified === 'function' && surface.isIdentified()) return true; } catch {}
  if (surface.identified === true) return true;
  const ws = surface.ws || surface.socket || surface._ws;
  if (ws && ws.readyState === 1) return true;
  return false;
}

// --- BEGIN: universal OBS connect helpers ---
function _buildObsUrl(cfg) {
  if (cfg?.url) return cfg.url;
  const host = cfg?.host || '127.0.0.1';
  const port = Number(cfg?.port ?? 4455);
  const secure = !!cfg?.secure;
  return `${secure ? 'wss' : 'ws'}://${host}:${port}`;
}

async function _callMaybe(fn, ...a) {
  try { return await fn(...a); } catch (e) { return Promise.reject(e); }
}

async function _universalObsConnect(surface, rawCfg = {}) {
  const cfg = {
    host: rawCfg.host ?? '127.0.0.1',
    port: rawCfg.port ?? 4455,
    secure: !!rawCfg.secure,
    password: rawCfg.password ?? '',
    url: rawCfg.url || null,
  };
  const url = _buildObsUrl(cfg);

  // try common signatures in order
  const tries = [];
  if (typeof surface.connect === 'function') {
    // 1) connect({url,password})
    tries.push(() => _callMaybe(surface.connect.bind(surface), { url, password: cfg.password, host: cfg.host, port: cfg.port, secure: cfg.secure }));
    // 2) connect(url, password)
    tries.push(() => _callMaybe(surface.connect.bind(surface), url, cfg.password));
    // 3) connect(url)
    tries.push(() => _callMaybe(surface.connect.bind(surface), url));
  }
  if (typeof surface.open === 'function') {
    // some bridges expose open(...)
    tries.push(() => _callMaybe(surface.open.bind(surface), url, cfg.password));
  }
  if (!tries.length) throw new Error('No connect/open method on OBS surface');

  let lastErr;
  for (const t of tries) {
    try {
      const rv = await t();
      // Only treat returned value as a connection/emitter if it's an object
      return (rv && typeof rv === 'object') ? rv : null;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('OBS connect failed');
}

function _obsIsConnected(surface) {
  try {
    if (typeof surface.isConnected === 'function') return surface.isConnected();
    // tolerant flags
    if ('connected' in surface) return !!surface.connected;
    if ('identified' in surface) return !!surface.identified;
    if (surface.ws && surface.ws.readyState === 1) return true;
  } catch {}
  return false;
}

async function connectAndWaitUniversal(rawCfg, timeoutMs = 6000, pollMs = 100) {
  const surface = await waitForObsSurface(1000);
  if (!surface) {
    window.__tpObsConnected = false;
    window.__tpObsLastErr = 'no-surface';
    return false;
  }

  try {
    var conn = await _universalObsConnect(surface, rawCfg);
  } catch (e) {
    window.__tpObsConnected = false;
    window.__tpObsLastErr = (e && e.message) || 'connect-error';
    return false;
  }

  const t0 = Date.now();
  // wait for “really ready”
  while (Date.now() - t0 < timeoutMs) {
    // prefer method if present
    const target = (conn && typeof conn === 'object') ? conn : surface;
    const ok = await Promise.resolve(_obsIsConnected(target));
    if (ok) {
      window.__tpObsConn = target;
      window.__tpObsConnected = true;
      window.__tpObsLastErr = null;
      try { attachObsRelays(target); startObsPing(); } catch {}
      return true;
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
  window.__tpObsConn = (conn && typeof conn === 'object') ? conn : surface;
  window.__tpObsConnected = false;
  window.__tpObsLastErr = 'timeout';
  return false;
}

// expose a single, obvious entrypoint the UI can use
try { if (typeof window.connectAndWaitUniversal !== 'function') window.connectAndWaitUniversal = connectAndWaitUniversal; } catch {}
// --- END: universal OBS connect helpers ---

// Relay OBS events to keep the pill honest across reconnects
function attachObsRelays(surface){
  try {
    const on = surface?.on?.bind(surface);
    if (!on) return;
    on('open',       () => { try { window.__tpObsConnected = false; } catch {} updateObsPillConnecting(); });
    on('identified', () => { try { window.__tpObsConnected = true; window.__tpObsLastErr = null; } catch {} updateObsPill(); startObsPing(); });
    on('close',      () => { try { window.__tpObsConnected = false; window.__tpObsLastErr = 'closed'; } catch {} updateObsPill(); stopObsPing(); });
    on('closed',     () => { try { window.__tpObsConnected = false; window.__tpObsLastErr = 'closed'; } catch {} updateObsPill(); stopObsPing(); });
    on('error',      (e) => { try { window.__tpObsConnected = false; window.__tpObsLastErr = (e && e.message) || 'error'; } catch {} updateObsPill(); });
  } catch {}
}

// Pill/status helpers (shared)
function _getObsPillEl(){
  return document.getElementById('obsStatusText') || document.getElementById('settingsObsStatus') || null;
}
async function updateObsPillConnecting(){
  const el = _getObsPillEl();
  if (el) el.textContent = 'OBS: connecting…';
}
async function updateObsPill(){
  const el = _getObsPillEl();
  if (!el) return;
  const dbg = await (window.__obsDebug ? window.__obsDebug() : Promise.resolve({ connected:false, lastError:null }));
  el.textContent = dbg.connected ? 'OBS: connected' : `OBS: ${dbg.lastError || 'off'}`;
}

// Gentle keep-alive ping
let __obsPingTimer = null;
async function startObsPing(){
  try { stopObsPing(); } catch {}
  __obsPingTimer = setInterval(async () => {
    try {
      if (!window.__tpObsConnected) return;
      const s = window.__tpObsConn;
      if (!s) return;
      if (typeof s.request === 'function') {
        await s.request('GetVersion', {});
      } else if (typeof s.call === 'function') {
        await s.call('GetVersion');
      } else {
        /* no supported API; skip */
      }
    } catch (e) {
      try { window.__tpObsConnected = false; window.__tpObsLastErr = (e && e.message) || 'ping-failed'; } catch {}
      updateObsPill();
    }
  }, 30000);
}
function stopObsPing(){ if (__obsPingTimer) { clearInterval(__obsPingTimer); __obsPingTimer = null; } }

window.addEventListener('visibilitychange', () => {
  try {
    if (document.hidden) stopObsPing();
    else if (window.__tpObsConnected) startObsPing();
  } catch {}
});
window.addEventListener('beforeunload', () => { try { stopObsPing(); } catch {} });

async function connectAndWait(cfgRaw){
  const s = await waitForObsSurface(1000);
  if (!s) {
    try { window.__tpObsConnected = false; window.__tpObsLastErr = 'no-surface'; } catch {}
    return false;
  }
  const cfg = _normalizeObsCfg(cfgRaw);
  // Try both shapes and capture the returned connection/emitter if any
  let conn = null;
  try {
    if (typeof s.connect === 'function') {
      const rv = s.connect({ url: cfg.url, password: cfg.password, ...cfg });
      conn = (rv && typeof rv === 'object') ? rv : null;
    }
  } catch (e) {
    console.warn('[obs] connect threw, retrying with host/port shape', e);
    try {
      const rv2 = s.connect({ host: cfg.host, port: cfg.port, secure: cfg.secure, password: cfg.password });
      conn = (rv2 && typeof rv2 === 'object') ? rv2 : null;
    }
    catch (e2) { console.warn('[obs] second connect form threw', e2); }
  }
  const target = conn || s;
  const tap = _tapObsEvents(target);           // watch for events too

  const ok = await _waitUntil(async () => (tap.any() || _isObsUp(target)), 10000, 120);
  if (!ok) {
    try { target.lastError = 'timeout'; } catch {}
    try { window.__tpObsLastErr = 'timeout'; } catch {}
    try { window.__tpObsConnected = false; } catch {}
    return false;
  }
  window.__tpObsConn = target;
  try { window.__tpObsConnected = true; window.__tpObsLastErr = null; } catch {}
  attachObsRelays(target);
  startObsPing();
  return true;
}

function getObsCfg(raw){ return _normalizeObsCfg(raw); }

Object.assign(window, { waitForObsSurface, connectAndWait, getObsCfg });

// Secure-fallback helper
try {
  if (typeof window.connectWithSecureFallback !== 'function') {
    window.connectWithSecureFallback = async (rawCfg, retryOn = /timeout|network|ECONN/i) => {
      const cfg = getObsCfg(rawCfg);
      let ok = false;
      try { ok = await connectAndWait(cfg); } catch { ok = false; }
      if (ok) return true;
      const errStr = (window.__tpObsLastErr || window.__tpObsConn?.getLastError?.() || '').toString();
      if (!retryOn.test(errStr)) return false;
      const flipped = { ...cfg, secure: !cfg.secure };
      try { ok = await connectAndWait(flipped); } catch { ok = false; }
      return !!ok;
    };
  }
} catch {}

// ---------- Persistent connect / UI wiring ----------
async function obsConnectPersistent(){
  try { return await window.connectWithSecureFallback(getObsCfg()); } catch { return false; }
}
// (removed) obsDisconnectPersistent: legacy helper no longer needed; toggle path disconnects via unified surface directly.

async function _restoreObsOnBoot(){
  const box = document.getElementById('settingsEnableObs');
  if (!box?.checked) return;
  try { await obsConnectPersistent(); } catch (e) { console.warn('[obs] restore failed', e); }
}

export function wireObsPersistentUI(){
  const box = document.getElementById('settingsEnableObs');
  if (!box || box.__obsWired) return;
  box.__obsWired = true;

  box.addEventListener('change', async (e) => {
    if (e.target.checked) {
      await updateObsPillConnecting();
      const cfg = (window.getObsCfg ? window.getObsCfg() : {});
      const ok = await (window.connectWithSecureFallback ? window.connectWithSecureFallback(cfg) : connectAndWait(cfg));
      if (ok) {
        // Update conn pointer using unified surface and attach relays/ping
        const s = (typeof window.getObsSurface === 'function') ? window.getObsSurface() : null;
        if (s) { try { window.__tpObsConn = s; attachObsRelays(s); startObsPing(); } catch {} }
      }
      await updateObsPill();
    } else {
      try {
        const s = (typeof window.getObsSurface === 'function') ? window.getObsSurface() : null;
        await s?.disconnect?.();
      } catch {}
      try { window.__tpObsConnected = false; window.__tpObsLastErr = null; } catch {}
      await updateObsPill();
    }
  });
  // Boot restore with explicit pill updates
  (async () => {
    if (box.checked) {
      await updateObsPillConnecting();
      try {
        const cfg = (window.getObsCfg ? window.getObsCfg() : {});
        const ok = await (window.connectWithSecureFallback ? window.connectWithSecureFallback(cfg) : connectAndWait(cfg));
        if (ok) {
          const s = (typeof window.getObsSurface === 'function') ? window.getObsSurface() : null;
          if (s) { try { window.__tpObsConn = s; attachObsRelays(s); startObsPing(); } catch {} }
        }
      } catch {}
      await updateObsPill();
    }
  })();
}

// One-shot health check for dev/smoke convenience
try {
  if (typeof window.__obsHealth !== 'function') {
    window.__obsHealth = async () => {
      const s = await waitForObsSurface(1000);
      if (!s) return { ok:false, reason:'no-surface' };
      const cfg = getObsCfg();
      const ok = await (window.connectAndWaitUniversal ? window.connectAndWaitUniversal(cfg) : connectAndWait(cfg));
      const dbg = await (window.__obsDebug ? window.__obsDebug() : Promise.resolve({}));
      return { ok, dbg };
    };
  }
} catch {}
