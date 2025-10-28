// Boot loader for legacy pages: try to run the compiled TS boot initializer if present.
// If `window.__tpBootLoaded` is set, skip.
(() => {
  // Minimal boot trace breadcrumbs for DevTools diagnostics
  try {
    window.__TP_BOOT_TRACE = window.__TP_BOOT_TRACE || [];
    window.__TP_BOOT_TRACE.push({ t: Date.now(), tag: 'boot-loader', msg: 'start' });
  } catch {}

  const q = new URLSearchParams(location.search);
  const isCI = q.has('ci') || (() => { try { return localStorage.getItem('tp_ci') === '1'; } catch { return false; } })();
  const isDev = (q.has('dev') || (() => { try { return localStorage.getItem('tp_dev_mode') === '1'; } catch { return false; } })() || (window.__TP_DEV === true)) && !isCI;
  // Expose a CI boot guard so in-page code can short-circuit probing during CI/smoke runs
  try { window.__TP_SKIP_BOOT_FOR_TESTS = !!isCI; } catch {};
  try { window.__TP_BOOT_TRACE.push({ t: Date.now(), tag: 'boot-loader', msg: 'env', isCI, isDev }); } catch {}

  const tryImport = async (path) => {
    try { await import(path); return true; }
    catch (e) { if (isDev) try { console.warn('[boot-loader] import failed:', path, e); } catch {} return false; }
  };

  (async () => {
    if (isDev) {
      // DEV: Prefer running the source module entry directly (no build required)
      // src/index.js auto-runs boot() when imported as a module
      try { window.__TP_BOOT_TRACE.push({ t: Date.now(), tag: 'boot-loader', msg: 'import /src/index.js (dev) → start' }); } catch {}
      const ok = await tryImport('/src/index.js');
      try {
        window.__TP_BOOT_TRACE.push({ t: Date.now(), tag: 'boot-loader', msg: 'import /src/index.js (dev) → done', ok });
        window.__TP_BOOT_INFO = { path: 'dev', isCI, isDev, imported: ok };
      } catch {}
      // If source import fails, allow page-level fallback to load the legacy bundle
    } else {
      // PROD: try dist; if missing, fall back to legacy bundle handled by the page
      try { window.__TP_BOOT_TRACE.push({ t: Date.now(), tag: 'boot-loader', msg: 'import /dist/index.js (prod) → start' }); } catch {}
      const ok = await tryImport('/dist/index.js');
      try {
        window.__TP_BOOT_TRACE.push({ t: Date.now(), tag: 'boot-loader', msg: 'import /dist/index.js (prod) → done', ok });
        window.__TP_BOOT_INFO = { path: 'prod', isCI, isDev, imported: ok };
      } catch {}
      // No further import attempts here; allow page-level fallback to load the legacy bundle.
    }
  })();
})();
