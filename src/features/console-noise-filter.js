// Dev-only console noise filter (plain JS version)
// Silences benign extension async messaging errors so dev console stays focused.
// Usage (module path): import { installConsoleNoiseFilter } from './features/console-noise-filter.js'; installConsoleNoiseFilter();
// Usage (legacy path): window.installConsoleNoiseFilter && window.installConsoleNoiseFilter();

export function installConsoleNoiseFilter(opts = {}) {
  const hudTag = opts.hudTag || 'noise:filter';
  const patterns = opts.patterns || [
    /listener indicated an asynchronous response.*message channel closed/i,
    // Add more regex patterns here if needed
  ];
  const debug = !!opts.debug;

  function isDev() {
    try {
      const s = String(location.search || '');
      const h = String(location.hash || '');
      const ls = String(localStorage.getItem('tp_dev_mode') || '');
      return /(?:^|[?&])dev=1\b/.test(s) || /(^|#)dev\b/.test(h) || ls === '1';
    } catch { return false; }
  }
  if (!isDev()) return; // Only active in dev sessions

  const toText = (r) => {
    try { return r && (r.message || (r.toString && r.toString()) || String(r)) || ''; } catch { return ''; }
  };
  const isNoise = (text) => patterns.some((rx) => rx.test(text));

    window.addEventListener('unhandledrejection', (evt) => {
      try {
        const text = toText(evt.reason);
        if (text && isNoise(text)) {
          // Avoid preventDefault unless absolutely necessary (lint rule)
          if (debug) console.debug('[silenced]', text);
          window.HUD?.log?.(hudTag, { type: 'unhandledrejection', text });
        }
      } catch {}
    });

  window.addEventListener('error', (evt) => {
    try {
      const text = toText(evt.error || evt.message);
      if (text && isNoise(text)) {
        if (debug) console.debug('[silenced:error]', text);
        window.HUD?.log?.(hudTag, { type: 'error', text, src: evt.filename, line: evt.lineno, col: evt.colno });
      }
    } catch {}
  });

  try {
    window.HUD?.log?.(hudTag, { armed: true, patterns: patterns.map(String) });
    if (debug) console.debug('[console-noise-filter] armed');
  } catch {}
}
