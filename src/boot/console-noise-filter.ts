// Early console noise filter for benign extension/bridge errors in dev.
// Install asap (top of index.ts) to suppress noisy, non-actionable errors.

const BENIGN_PATTERNS = [
  'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received',
  'Could not establish connection. Receiving end does not exist.'
];

export function installConsoleNoiseFilter(opts: { debug?: boolean } = {}) {
  const { debug = false } = opts;
  try {
    const origError = console.error.bind(console);
    console.error = (...args: any[]) => {
      try {
        const first = args && args[0];
        const msg = first != null ? String(first) : '';
        if (msg && BENIGN_PATTERNS.some(p => msg.includes(p))) {
          if (debug) origError('[filtered]', ...args);
          return; // swallow benign noise
        }
      } catch {}
      origError(...args);
    };
  } catch {}

  try {
    window.addEventListener('unhandledrejection', (ev: any) => {
      try {
        const msg = String(ev?.reason?.message || ev?.reason || '');
        if (msg && BENIGN_PATTERNS.some(p => msg.includes(p))) {
          ev.preventDefault?.();
          if (debug) console.debug('[filtered:unhandledrejection]', msg);
        }
      } catch {}
    }, { capture: true });
  } catch {}
}

// Auto-install in dev mode when imported directly (optional convenience)
try {
  const DEV = (window as any).__TP_DEV || /[?&#]dev=1\b/.test(String(location && location.href || ''));
  if (DEV) installConsoleNoiseFilter({ debug: false });
} catch {}
