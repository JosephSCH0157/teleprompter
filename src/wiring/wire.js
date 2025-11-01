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
  } catch {}
}

// Auto-init when imported, but also export for explicit invocation
try { initSettingsWiring(); } catch {}
export default initSettingsWiring;

// --- Persistent OBS Enable wiring ---
// When the "Enable OBS" checkbox is checked, hold an open websocket until
// unchecked or the page unloads.
(function setupPersistentObs() {
  try {
    const obs =
      (window.__tpOBS) ||
      (window.Adapters && window.Adapters.obsAdapter &&
       window.Adapters.obsAdapter.create && window.Adapters.obsAdapter.create());
    if (!obs) return;

    const el = {
      en:  document.getElementById('settingsEnableObs'),
      host:document.getElementById('settingsObsHost'),
      port:document.getElementById('settingsObsPort'),
      sec: document.getElementById('settingsObsSecure'),
      pw:  document.getElementById('settingsObsPassword'),
    };

    if (!el.en) return; // Settings panel not mounted in this build

    function urlFromInputs() {
      const host = (el.host && el.host.value || '127.0.0.1').trim();
      const port = parseInt(el.port && el.port.value || '4455', 10) || 4455;
      const secure = !!(el.sec && el.sec.checked);
      return (secure ? 'wss' : 'ws') + '://' + host + ':' + port;
    }

    function configureAdapter() {
      obs.configure({
        url: urlFromInputs(),
        password: (el.pw && el.pw.value) || '',
        // lets the adapter know if it should keep auto-reconnecting
        isEnabled: () => !!(el.en && el.en.checked),
      });
    }

    async function applyEnableState() {
      configureAdapter();
      try {
        if (el.en.checked) {
          await obs.connect();                 // open (or re-open) persistent connection
          if (typeof obs.pokeStatusTest === 'function') obs.pokeStatusTest(); // refresh chip/status
        } else {
          if (typeof obs.disconnect === 'function') { await obs.disconnect(); }
          else if (typeof obs.stop === 'function') { await obs.stop(); }      // closes WS in legacy adapter
        }
      } catch (e) {
        console.warn('OBS enable apply failed:', e);
      }
    }

    // Toggle wiring
    el.en.addEventListener('change', applyEnableState, { passive: true });

    // If connection details change while enabled, reconfigure & reconnect
    [el.host, el.port, el.sec, el.pw].forEach(input => {
      if (!input) return;
      input.addEventListener('change', () => {
        if (el.en && el.en.checked) applyEnableState();
        else configureAdapter();
      }, { passive: true });
    });

    // Close on navigation
    window.addEventListener('beforeunload', () => {
      try {
        if (typeof obs.disconnect === 'function') obs.disconnect();
        else if (typeof obs.stop === 'function') obs.stop();
      } catch {}
    });

    // Boot: if the toggle is already checked (persisted), connect now
    configureAdapter();
    if (el.en.checked) setTimeout(() => { applyEnableState(); }, 0);
  } catch (e) {
    console.debug('OBS persistent wiring skipped:', e);
  }
})();
