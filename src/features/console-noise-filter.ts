// Dev-only console noise filter for benign extension errors and similar chatter.
// Silences specific unhandledrejection + error messages while preserving real issues.
// Usage: import installConsoleNoiseFilter from './features/console-noise-filter'; installConsoleNoiseFilter();

export type NoiseFilterOpts = {
  hudTag?: string;
  patterns?: RegExp[]; // Additional patterns to treat as noise
  debug?: boolean;     // Echo filtered messages to console.debug as breadcrumbs
};

function isDev(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const s = String(window.location.search || '');
    const h = String(window.location.hash || '');
    const ls = String(localStorage.getItem('tp_dev_mode') || '');
    return /(?:^|[?&])dev=1\b/.test(s) || /(^|#)dev\b/.test(h) || ls === '1';
  } catch {
    return false;
  }
}

function getTextReason(r: unknown): string {
  if (!r) return '';
  try {
    // Normalize common Error/Promise shapes without using any
    const anyR = r as { message?: unknown; toString?: () => unknown };
    return String(anyR?.message ?? anyR?.toString?.() ?? r);
  } catch {
    return String(r);
  }
}

export function installConsoleNoiseFilter(opts: NoiseFilterOpts = {}): void {
  if (!isDev()) return; // dev-only guard
  try {
    const hudTag = opts.hudTag ?? 'noise:filter';
    const patterns = opts.patterns ?? [
      /listener indicated an asynchronous response.*message channel closed/i,
      // Addable optional noise examples (left commented until requested):
      // /ResizeObserver loop limit exceeded/i,
    ];
    const debugEcho = !!opts.debug;

    const isNoise = (text: string): boolean => patterns.some((rx) => rx.test(text));

    // Handle unhandled promise rejections.
    window.addEventListener('unhandledrejection', (evt: PromiseRejectionEvent) => {
      try {
        const text = getTextReason(evt.reason);
        if (text && isNoise(text)) {
          if (debugEcho) console.debug('[silenced]', text);
          // @ts-ignore HUD dynamic presence (optional dev HUD)
          window.HUD?.log?.(hudTag, { type: 'unhandledrejection', text });
        }
      } catch {}
    });

    // Error events (less common for the extension case, but cheap to annotate)
    window.addEventListener('error', (evt: ErrorEvent) => {
      try {
        const text = getTextReason((evt.error || evt.message) as unknown);
        if (text && isNoise(text)) {
          if (debugEcho) console.debug('[silenced:error]', text);
          // @ts-ignore HUD dynamic presence (optional dev HUD)
          window.HUD?.log?.(hudTag, { type: 'error', text, src: evt.filename, line: evt.lineno, col: evt.colno });
        }
      } catch {}
    });

    // Breadcrumb: announce activation and pattern list
    try {
  // @ts-ignore HUD dynamic presence (optional dev HUD)
      window.HUD?.log?.(hudTag, { armed: true, patterns: patterns.map((p) => String(p)) });
      if (debugEcho) console.debug('[console-noise-filter] armed');
    } catch {}
  } catch {}
}

export default installConsoleNoiseFilter;
