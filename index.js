// index.js - minimal browser loader to preserve legacy behavior
// This script injects the legacy scripts in order so existing HTML can keep working
// while the codebase is incrementally migrated into `src/`.

(function() {
  var scripts = [
    'eggs.js',
    'adapters/bridge.js',
    'adapters/obs.js',
    'recorders.js',
    'debug-tools.js',
    'debug-seed.js',
    'io-anchor.js',
    'help.js',
    'scroll-helpers.js',
    'scroll-control.js',
    'display.html', // kept for reference; not a JS file
    'teleprompter_pro.js'
  ];

  function inject(src) {
    var s = document.createElement('script');
    s.src = src;
    s.defer = false;
    s.async = false;
    document.head.appendChild(s);
  }

  // Inject sequentially to preserve global initialization order
  scripts.forEach(function(p) {
    if (!p.endsWith('.js')) return;
    try {
      inject(p);
      console.log('[index.js] injected', p);
    } catch (err) {
      console.warn('[index.js] failed to inject', p, err);
    }
  });
})();
