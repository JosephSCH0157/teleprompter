// boot-loader.js — singleton guard + clean dev/prod import
(function (g) {
  if (g.__TP_LOADER_RAN__) return; // singleton guard so it never boots twice
  g.__TP_LOADER_RAN__ = true;

  const push = (e) => (g.__TP_BOOT_TRACE = g.__TP_BOOT_TRACE || []).push({ ts: performance.now(), ...e });

  const isDev = /\bdev=1\b/.test(location.search) || /\bdev\b/.test(location.hash) ||
                (function(){ try { return localStorage.getItem('tp_dev_mode') === '1'; } catch { return false; } })();
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
      push({ tag: 'boot-loader', msg: 'import failed', ok: false, err: String(err) });
      // Optional: legacy fallback
      try {
        const s = document.createElement('script');
        s.src = './teleprompter_pro.js';
        s.onload = () => push({ tag: 'boot-loader', msg: 'legacy loaded', ok: true });
        s.onerror = () => push({ tag: 'boot-loader', msg: 'legacy failed', ok: false });
        document.head.appendChild(s);
      } catch {}
    }
  })();
})(window);
