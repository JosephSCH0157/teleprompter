// Central preroll event hooks: session-driven orchestration only
(function () {
  try {
    if (window.__tpPrerollHooksWired) return; // idempotent guard
    window.__tpPrerollHooksWired = true;

    function hudLog(tag, detail) {
      try {
        if (window.__tpHUD && typeof window.__tpHUD.event === 'function') {
          window.__tpHUD.event(tag, detail || {});
        } else {
          console.log('[tp]', tag, detail || {});
        }
      } catch {}
    }

    function getScrollMode() {
      try {
        const fromStore = window.__tpStore?.get?.('scrollMode') || window.__tpStore?.get?.('mode');
        if (fromStore) return String(fromStore).toLowerCase();
      } catch {}
      return 'auto';
    }

    window.addEventListener('tp:preroll:done', (ev) => {
      hudLog('preroll:done', ev?.detail);
      try { console.log('[PREROLL] done (session orchestrated)'); } catch {}
      try { hudLog('preroll:auto:skip', { mode: getScrollMode() }); } catch {}
    });
  } catch {}
})();
