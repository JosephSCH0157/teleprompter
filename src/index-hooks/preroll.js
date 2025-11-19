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

    function getScrollMode(){
      try {
        const fromStore = window.__tpStore?.get?.('scrollMode') || window.__tpStore?.get?.('mode');
        if (fromStore) return String(fromStore).toLowerCase();
      } catch {}
      try {
        const sel = document.getElementById('scrollMode');
        if (sel && typeof sel.value === 'string') return String(sel.value).toLowerCase();
      } catch {}
      return 'auto';
    }

    function isRehearsal(){
      try { return getScrollMode() === 'rehearsal'; } catch { return false; }
    }

    function isAutoCapable(mode){
      const m = (mode || getScrollMode() || '').toLowerCase();
      return m === 'auto' || m === 'timed' || m === 'hybrid' || m === 'asr' || m === 'wpm' || m === 'assist';
    }

    window.addEventListener('tp:preroll:done', (ev) => {
      hudLog('preroll:done', ev?.detail);
      // Autoscroll start (Hybrid/WPM/Timed) — defer actual movement until preroll completes
      try {
        const mode = getScrollMode();
        if (!isRehearsal() && isAutoCapable(mode)) {
          try { if (window.Auto && typeof window.Auto.setEnabled === 'function') window.Auto.setEnabled(true); } catch{}
          if (!window.__tpScrollRouterStarted && typeof window.scrollRouterStart === 'function') {
            window.scrollRouterStart();
            window.__tpScrollRouterStarted = true;
          }
          hudLog('preroll:auto:start', { mode });
        } else {
          hudLog('preroll:auto:skip', { mode });
        }
      } catch{}

      // Auto-record start hook (after preroll, if enabled and not rehearsal)
      try {
        const store = window.__tpStore;
        const auto = window.__tpAutoRecord;
        if (store && auto && typeof auto.start === 'function') {
          const autoEnabled = !!store.get?.('autoRecord');
          const scrollMode = store.get?.('scrollMode');
          const src = ev && ev.detail && ev.detail.source;
          // Only start auto-record when preroll is from Speech start, not mode-switch
          if (autoEnabled && scrollMode !== 'rehearsal' && src === 'speech') {
            try { auto.start(); } catch(err){ console.error('[auto-record] start after preroll failed', err); }
          }
        }
      } catch{}
    });
  } catch{}
})();
