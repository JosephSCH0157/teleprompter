// Boot loader for legacy pages: try to run the compiled TS boot initializer if present.
// If `window.__tpBootLoaded` is set, skip.
(() => {
  try {
    if (window.__tpBootLoaded) return;
    window.__tpBootLoaded = true;

    const q = new URLSearchParams(location.search);
    const isCI = q.has('ci') || (() => { try { return localStorage.getItem('tp_ci') === '1'; } catch { return false; } })();
    const isDev = ((q.has('dev') || (() => { try { return localStorage.getItem('tp_dev_mode') === '1'; } catch { return false; } })() || (window.__TP_DEV === true)) && !isCI);

    const tryImport = async (path) => {
      try {
        const m = await import(path);
        return m || null;
      } catch (e) {
        if (isDev) try { console.warn('[boot-loader] import failed:', path, e); } catch {}
        return null;
      }
    };

    (async () => {
      // In dev mode, prefer loading the source module directly from a single absolute path.
      if (isDev) {
        const srcPath = '/src/boot/boot.js';
        const mod = await tryImport(srcPath);
        if (mod && typeof mod.initBoot === 'function') {
          try { const opts = mod.initBoot(); try { window.__tpBootOpts = opts; } catch {} } catch {}
        }
        return;
      }

      // Production: prefer bundled dist entry then a common dist boot path, then fall back to source.
      const prodPaths = ['/dist/index.js', '/dist/boot/boot.js', '/src/boot/boot.js'];
      for (const p of prodPaths) {
        const mod = await tryImport(p);
        if (mod && typeof mod.initBoot === 'function') {
          try { const opts = mod.initBoot(); try { window.__tpBootOpts = opts; } catch {} } catch {}
          return;
        }
      }
    })();
  } catch (e) {
    try { console.warn('[boot-loader] unexpected error', e); } catch {}
  }
})();
