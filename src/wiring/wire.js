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
      if (typeof window.__obsDebug !== 'function') {
        window.__obsDebug = async () => {
          const hasBridge = !!window.__obsBridge;
          const hasAdapter = !!(window && window.__tpOBS);
          const connected = !!window.__tpObsConnected;
          const lastError = window.__tpObsLastErr || null;
          try { console.table({ hasAdapter, hasBridge, connected, lastError }); } catch {}
          return { hasAdapter, hasBridge, connected, lastError };
        };
      }
    } catch {}
    // Note: OBS connect/wait helpers and getObsCfg are defined below in the module-scoped helpers section
  } catch {}
}

// Auto-init when imported, but also export for explicit invocation
try { initSettingsWiring(); } catch {}
export default initSettingsWiring;

// ---------- OBS helpers (module path) ----------
function _sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

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

async function waitForObsSurface(timeout = 5000){
  const t0 = performance.now();
  while (performance.now() - t0 < timeout) {
    const a = window.__recorder?.get?.('obs');
    if (a && (a.connect || typeof a.connect === 'function')) return a;
    // Clean legacy fallback: bridge surface
    const b = window.__obsBridge;
    if (b && (b.connect || typeof b.connect === 'function')) return b;
    await _sleep(50);
  }
  throw new Error('[obs] surface not ready');
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

async function connectAndWait(cfgRaw){
  const s = await waitForObsSurface();
  const cfg = _normalizeObsCfg(cfgRaw);
  const tap = _tapObsEvents(s);           // watch for events too

  // Try both shapes: url+password AND host/port/secure/password
  try {
    if (s.connect.length >= 1) s.connect({ url: cfg.url, password: cfg.password, ...cfg });
    else s.connect({ url: cfg.url, password: cfg.password, ...cfg });
  } catch (e) {
    console.warn('[obs] connect threw, retrying with host/port shape', e);
    try { s.connect({ host: cfg.host, port: cfg.port, secure: cfg.secure, password: cfg.password }); }
    catch (e2) { console.warn('[obs] second connect form threw', e2); }
  }

  const ok = await _waitUntil(async () => (tap.any() || _isObsUp(s)), 10000, 120);
  if (!ok) {
    try { s.lastError = 'timeout'; } catch {}
    try { window.__tpObsLastErr = 'timeout'; } catch {}
    try { window.__tpObsConnected = false; } catch {}
    throw new Error('[obs] connect timeout');
  }
  window.__tpObsConn = s;
  try { window.__tpObsConnected = true; window.__tpObsLastErr = null; } catch {}
  return s;
}

function getObsCfg(raw){ return _normalizeObsCfg(raw); }

Object.assign(window, { waitForObsSurface, connectAndWait, getObsCfg });

// ---------- Persistent connect / UI wiring ----------
async function obsConnectPersistent(){ await connectAndWait(getObsCfg()); }
async function obsDisconnectPersistent(){
  const s = window.__recorder?.get?.('obs');
  try { await s?.disconnect?.(); } catch {}
  window.__tpObsConn = null;
  try { window.__tpObsConnected = false; } catch {}
}

async function restoreObsOnBoot(){
  const box = document.getElementById('settingsEnableObs');
  if (!box?.checked) return;
  try { await obsConnectPersistent(); } catch (e) { console.warn('[obs] restore failed', e); }
}

export function wireObsPersistentUI(){
  const box = document.getElementById('settingsEnableObs');
  if (!box || box.__obsWired) return;
  box.__obsWired = true;
  box.addEventListener('change', (e) => {
    if (e.target.checked) obsConnectPersistent();
    else obsDisconnectPersistent();
  });
  restoreObsOnBoot();
}
