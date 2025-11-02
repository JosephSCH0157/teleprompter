
// index.js  — single source of truth for boot
(async () => {
  try {
    window.__TP_BOOT_TRACE = window.__TP_BOOT_TRACE || [];
    window.__TP_BOOT_TRACE.push({ t: Date.now(), tag: 'index', msg: 'trying src/index.js' });

    await import('./src/index.js');
    console.log('[index.js] loaded src/index.js as module');
    window.__TP_BOOT_MODE = 'module';
  } catch (err) {
    console.warn('[index.js] module import failed, falling back to legacy teleprompter_pro.js', err);
    window.__TP_BOOT_MODE = 'legacy';
    const s = document.createElement('script');
    s.src = './teleprompter_pro.js';      // legacy bundle only
    s.defer = false;                      // run immediately
    document.head.appendChild(s);
  }
})();

