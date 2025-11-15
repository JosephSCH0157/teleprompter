// boot-loader.js — singleton guard + clean dev/prod import
(function (g) {
  if (g.__TP_LOADER_RAN__) { try { (g.__TP_BOOT_TRACE = g.__TP_BOOT_TRACE || []).push({ ts: performance.now(), tag: 'boot-loader', msg: 'dup-loader' }); } catch {} throw 'dup-loader'; }
  g.__TP_LOADER_RAN__ = true;

  const push = (e) => (g.__TP_BOOT_TRACE = g.__TP_BOOT_TRACE || []).push({ ts: performance.now(), ...e });

  const isLocalHost = (() => { try { return ['localhost','127.0.0.1'].includes(location.hostname); } catch { return false; } })();
  const isDev = /\bdev=1\b/.test(location.search) || /\bdev\b/.test(location.hash) || isLocalHost ||
                (function(){ try { return localStorage.getItem('tp_dev_mode') === '1'; } catch { return false; } })();
  const forceLegacy = (() => {
    try {
      const qs = new URLSearchParams(location.search || '');
      return qs.has('legacy') || localStorage.getItem('tp_legacy') === '1';
    } catch { return false; }
  })();
  g.__TP_BOOT_INFO = Object.assign(g.__TP_BOOT_INFO || {}, { isDev, path: isDev ? 'dev' : 'prod' });

  push({ tag: 'boot-loader', msg: 'start', isDev });

  (async () => {
    try {
      const v = encodeURIComponent(g.__TP_ADDV || 'dev');
      if (isDev) {
        // We are in /src/boot/boot-loader.js → dev entry is ../index.js
        push({ tag: 'boot-loader', msg: 'import ../index.js → start' });
        await import(`../index.js?v=${v}`);
        push({ tag: 'boot-loader', msg: 'import ../index.js → done', ok: true });
      } else {
        // Prod bundle lives at /dist/index.js → from /src/boot use ../../dist/index.js
        push({ tag: 'boot-loader', msg: 'import ../../dist/index.js → start' });
        await import(`../../dist/index.js?v=${v}`);
        push({ tag: 'boot-loader', msg: 'import ../../dist/index.js → done', ok: true });
      }
      g.__TP_BOOT_INFO.imported = true;
    } catch (err) {
      g.__TP_BOOT_INFO.imported = false;
      push({ tag: 'boot-loader', msg: 'import failed', ok: false, err: String(err), isDev, forceLegacy });
      // Dev safety: avoid silent fallback in regular dev sessions.
      // However, in CI/headless or when uiMock/mockFolder are set, prefer resilience.
      let relaxDevFallback = false;
      try {
        const qs = new URLSearchParams(location.search || '');
        const ci = qs.has('ci');
        const uiMock = qs.has('uiMock');
        const mockFolder = qs.has('mockFolder');
        const isWebDriver = (typeof navigator !== 'undefined') && ((navigator).webdriver === true);
        relaxDevFallback = !!(ci || uiMock || mockFolder || isWebDriver);
      } catch {}
      if (isDev && !forceLegacy && !relaxDevFallback) {
        try { console.error('[boot-loader] TS import failed; not falling back in dev. Set ?legacy=1 to force legacy.'); } catch {}
        return;
      }
      // Prod or forced legacy: inject monolith as a last resort
      try {
        const s = document.createElement('script');
        s.src = './teleprompter_pro.js';
        s.defer = true;
        s.onload = () => push({ tag: 'boot-loader', msg: 'legacy loaded', ok: true });
        s.onerror = () => push({ tag: 'boot-loader', msg: 'legacy failed', ok: false });
        document.head.appendChild(s);
      } catch {}
    }
  })();
})(window);
