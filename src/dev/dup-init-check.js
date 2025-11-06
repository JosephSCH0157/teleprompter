// src/dev/dup-init-check.js
// Dev-only: track duplicate calls to common init/boot points.
(function(){
  try {
    const isDev = (function(){
      try {
        const url = String(location && location.href || '');
        const q = new URL(url).searchParams;
        if (q.has('ci') || q.has('dev')) return true;
      } catch {}
      try { if (window && window.__TP_DEV) return true; } catch {}
      try { if (localStorage && localStorage.getItem('tp_ci') === '1') return true; } catch {}
      return false;
    })();
    if (!isDev) return;

    const COUNTS = (window.__TP_INIT_COUNTS = window.__TP_INIT_COUNTS || Object.create(null));
    const LOGS = (window.__TP_INIT_LOGS = window.__TP_INIT_LOGS || []);

    function register(name, data) {
      try {
        COUNTS[name] = (COUNTS[name] || 0) + 1;
        const n = COUNTS[name];
        LOGS.push({ t: Date.now(), name, count: n, data: data || null });
        if (n > 1) {
          console.warn('[dup-init]', name, 'called', n, 'times');
        } else {
          console.debug('[init]', name);
        }
      } catch {}
    }

    window.__tpRegisterInit = register;

    // Emit a summary a little after load
    const emit = () => {
      try {
        const dups = Object.keys(COUNTS).filter(k => COUNTS[k] > 1).map(k => ({ name: k, count: COUNTS[k] }));
        console.table(dups);
        console.log('[dup-init:summary]', JSON.stringify({ dups, total: Object.keys(COUNTS).length }));
      } catch {}
    };
    try { window.addEventListener('load', () => setTimeout(emit, 500)); } catch {}
    setTimeout(emit, 2500);
  } catch {}
})();
