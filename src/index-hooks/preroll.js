// Central preroll event hooks: logging, autoscroll start, auto-record start
(function(){
  try {
    if (window.__tpPrerollHooksWired) return; // idempotent guard
    window.__tpPrerollHooksWired = true;

    function hudLog(tag, detail){
      try {
        if (window.__tpHUD && typeof window.__tpHUD.event === 'function') {
          window.__tpHUD.event(tag, detail || {});
        } else {
          console.log('[tp]', tag, detail || {});
        }
      } catch{}
    }

    function isRehearsal(){
      try { return (window.__tpStore?.get?.('scrollMode') || window.__tpStore?.get?.('mode')) === 'rehearsal'; } catch { return false; }
    }

    window.addEventListener('tp:preroll:done', (ev) => {
      hudLog('preroll:done', ev?.detail);
      // Autoscroll start (Hybrid/WPM/Timed) — defer actual movement until preroll completes
      try {
        if (!isRehearsal()) {
          if (!window.__tpScrollRouterStarted && typeof window.scrollRouterStart === 'function') {
            window.scrollRouterStart();
            window.__tpScrollRouterStarted = true;
          }
        }
      } catch{}

      // Auto-record start hook (after preroll, if enabled and not rehearsal)
      try {
        const store = window.__tpStore;
        const auto = window.__tpAutoRecord;
        if (store && auto && typeof auto.start === 'function') {
          const autoEnabled = !!store.get?.('autoRecord');
          const scrollMode = store.get?.('scrollMode');
          if (autoEnabled && scrollMode !== 'rehearsal') {
            try { auto.start(); } catch(err){ console.error('[auto-record] start after preroll failed', err); }
          }
        }
      } catch{}
    });
  } catch{}
})();
