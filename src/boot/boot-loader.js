// Boot loader for legacy pages: try to run the compiled TS boot initializer if present.
// If `window.__tpBootLoaded` is set, skip.
(function () {
  try {
    if (window.__tpBootLoaded) return;
    window.__tpBootLoaded = true;
    // If a compiled ES module exists at ./src/boot/boot.js, try to import and run initBoot().
    // This is a no-op when the file isn't present. Use dynamic import to avoid errors.
    (async function () {
      try {
        // In dev, the file may be present at /src/boot/boot.ts compiled to /src/boot/boot.js
        const maybe = './src/boot/boot.js';
        const mod = await import(maybe).catch(() => null);
        if (mod && typeof mod.initBoot === 'function') {
          try {
            const opts = mod.initBoot();
            // Expose on window for legacy code
            try { window.__tpBootOpts = opts; } catch {}
          } catch {}
        }
      } catch {}
    })();
  } catch {}
})();
