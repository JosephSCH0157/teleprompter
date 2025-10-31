// src/wiring/wire.js
// Own the OBS Test button wiring in the module runtime and expose a simple probe.

const OBS_TEST_SEL = '#settingsObsTest,[data-action="obs-test"],#obsTest';

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
  // Fallback probe using the global OBS adapter if dev probe isn't available.
  return new Promise((resolve, reject) => {
    try {
      const adapter = (window && window.__tpOBS) || null;
      if (!adapter || typeof adapter.connect !== 'function') return reject(new Error('OBS adapter unavailable'));
      let connOpts = { host: '127.0.0.1', port: 4455, secure: false, password: String(pass || '') };
      try {
        const u = new URL(String(urlLike || 'ws://127.0.0.1:4455'));
        connOpts = { host: u.hostname, port: Number(u.port || 4455), secure: (u.protocol === 'wss:'), password: String(pass || '') };
      } catch {}
      const conn = adapter.connect({ ...connOpts, reconnect: false });
      const cleanup = () => { try { conn && conn.close && conn.close(); } catch {} };
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
        const hostEl = document.getElementById('settingsObsHost');
        const passEl = document.getElementById('settingsObsPassword');
        const hostRaw = (hostEl && hostEl.value ? String(hostEl.value) : '').trim();
        const host = hostRaw || 'ws://127.0.0.1:4455';
        const pass = passEl && passEl.value != null ? String(passEl.value) : '';

        const probe = window.__obsTestConnect || defaultObsProbe;
        Promise.resolve()
          .then(() => probe(host, pass))
          .then((res) => {
            const v = res && res.version ? `connected (${res.version})` : 'connected';
            ensureObsPill(btn, v);
          })
          .catch((err) => {
            ensureObsPill(btn, 'failed: ' + (err && err.message ? err.message : String(err)));
          });
      } catch {}
    }, true);
  } catch {}
}

// Auto-init when imported, but also export for explicit invocation
try { initSettingsWiring(); } catch {}
export default initSettingsWiring;
