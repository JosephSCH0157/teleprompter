// HUD loader — initialize debug HUD only in DEV to avoid any runtime tax in prod
(function () {
  try {
    const devQuery = /([?#]).*dev=1/.test(location.href);
    const devLocal = (() => {
      try { return localStorage.getItem('tp_dev_mode') === '1'; } catch { return false; }
    })();
    if (!devQuery && !devLocal && !(window).__TP_DEV) return;
    // Dynamically import the TS module (build may compile this to JS)
    import('./debug.ts')
      .then((m) => {
        try { m && typeof m.default === 'function' && m.default({ aggressive: devLocal }); } catch {}
      })
      .catch((e) => {
        try { console.warn('HUD loader failed', e); } catch {}
      });
  } catch {}
})();
