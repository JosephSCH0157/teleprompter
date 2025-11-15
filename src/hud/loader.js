// HUD loader — initialize debug HUD only in DEV to avoid any runtime tax in prod
(function () {
  try {
    const devQuery = /([?#]).*dev=1/.test(location.href);
    const devLocal = (() => {
      try { return localStorage.getItem('tp_dev_mode') === '1'; } catch { return false; }
    })();
    if (!devQuery && !devLocal && !(window).__TP_DEV) return;
    // Prefer JS builds; avoid importing .ts in the browser
    const tryImport = async (spec) => {
      try { return await import(spec); } catch { return null; }
    };
    (async () => {
      const candidates = [
        '/dist/hud/debug.js',
        new URL('./debug.js', import.meta.url).href,
      ];
      let mod = null;
      for (const c of candidates) { mod = await tryImport(c); if (mod) break; }
      if (!mod) { try { console.warn('HUD loader failed: no JS module found'); } catch {} ; return; }
      try { mod && typeof mod.default === 'function' && mod.default({ aggressive: devLocal }); } catch {}
    })();
  } catch {}
})();
