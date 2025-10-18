// index.js - minimal browser loader to preserve legacy behavior
// This script injects the legacy scripts in order so existing HTML can keep working
// while the codebase is incrementally migrated into `src/`.

(function() {
  var scripts = [
    'eggs.js',
    'adapters/bridge.js',
    'adapters/obs.js',
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

      // Also attempt to load the new ES module bootstrap (non-blocking, best-effort).
      // This keeps the legacy loading mechanism intact while letting the new `src/`
      // bootstrap run when the browser supports modules.
      try {
        var m = document.createElement('script');
        m.type = 'module';
        m.src = 'src/index.js';
        document.head.appendChild(m);
        console.log('[index.js] loaded src/index.js as module');
      } catch (err) {
        console.warn('[index.js] failed to load src/index.js module', err);
      }
    })();
