/*
 Simple node test for mode normalization and SSOT provenance.
 Runs under Node with minimal DOM shims and dynamic import of built dist/entry.js which initializes mode-state.
*/

(async function(){
  const assert = (cond, msg) => { if (!cond) { console.error('ASSERT FAIL:', msg); process.exitCode = 1; } };
  // Basic DOM + storage shims
  global.window = global;
  const ls = new Map();
  global.localStorage = {
    getItem: (k) => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => { ls.set(k, String(v)); },
    removeItem: (k) => { ls.delete(k); },
    clear: () => { ls.clear(); },
  };
  // Cookie shim (very simple; mode-state reads cookie via document.cookie regex)
  let cookieStr = '';
  Object.defineProperty(global, 'document', {
    value: {
      cookie: '',
      documentElement: { dataset: {} },
      getElementById: (id) => {
        if (id === 'scrollMode') {
          return { value: (global.__TEST_SELECT_VALUE || '') };
        }
        return null;
      },
      addEventListener: () => {},
    },
    writable: false
  });
  Object.defineProperty(global.document, 'cookie', {
    get(){ return cookieStr; },
    set(v){ cookieStr = String(v); }
  });
  global.CustomEvent = class { constructor(type, init){ this.type = type; this.detail = (init && init.detail) || {}; } };
  const listeners = {};
  global.addEventListener = (t, fn) => { (listeners[t] ||= new Set()).add(fn); };
  global.dispatchEvent = (ev) => { const set = listeners[ev.type]; if (set) for (const f of set) { try { f(ev); } catch {} } };

  // Ensure HTTPS flag off for cookie secure; not important for test
  global.location = { protocol: 'http:' };

  // Put legacy token in localStorage
  localStorage.setItem('tp_scroll_mode', 'auto');

  // Import built entry to initialize SSOT
  try {
    // Build must have been run before this test.
    await import('../dist/entry.js');
  } catch (e) {
    console.error('Import dist/entry.js failed. Build entry first.', e?.message || e);
    process.exitCode = 1;
    return;
  }

  // Wait briefly for async boot to expose __tpMode
  let api = null;
  for (let i = 0; i < 20; i++) {
    api = global.__tpMode || global.window?.__tpMode;
    if (api && typeof api.getMode === 'function' && typeof api.setMode === 'function') break;
    await new Promise(r => setTimeout(r, 50));
  }
  assert(api && typeof api.getMode === 'function' && typeof api.setMode === 'function', 'SSOT API missing');

  // After init, localStorage had 'auto' → normalized to 'wpm'
  const m0 = api.getMode();
  assert(m0 === 'wpm', `Expected normalized mode 'wpm', got '${m0}'`);

  // Verify event provenance: listen to tp:mode and ensure ssot true
  let saw = null;
  addEventListener('tp:mode', (ev) => { saw = ev.detail; });
  api.setMode('manual');
  assert(saw && saw.ssot === true && saw.mode === 'manual', 'Event did not carry ssot provenance or wrong mode');

  console.log('[test_mode_normalize] OK');
})();
