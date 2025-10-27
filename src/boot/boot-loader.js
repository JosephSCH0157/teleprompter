// Boot loader for legacy pages: try to run the compiled TS boot initializer if present.
// If `window.__tpBootLoaded` is set, skip.
(() => {
  const q = new URLSearchParams(location.search);
  const isCI = q.has('ci') || (() => { try { return localStorage.getItem('tp_ci') === '1'; } catch { return false; } })();
  const isDev = (q.has('dev') || (() => { try { return localStorage.getItem('tp_dev_mode') === '1'; } catch { return false; } })() || (window.__TP_DEV === true)) && !isCI;

  const tryImport = async (path) => {
    try { await import(path); return true; }
    catch (e) { if (isDev) try { console.warn('[boot-loader] import failed:', path, e); } catch {} return false; }
  };

  (async () => {
    if (isDev) {
      // DEV: import sources directly, no double-prefixing, no dist attempt
      await tryImport('/src/boot/boot.js');
      return;
    }
    // PROD: try dist, fall back to source if dist isn’t present
    if (await tryImport('/dist/index.js')) return;
    await tryImport('/src/boot/boot.js');
  })();
})();
