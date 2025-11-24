export interface BootLoaderOptions {
  entryUrl?: string;
  dev?: boolean;
  allowLegacyFallback?: boolean;
}

type BootTrace = { ts: number; tag: string; msg?: string; ok?: boolean; isDev?: boolean; [k: string]: unknown };

function pushTrace(g: any, e: BootTrace) {
  try {
    const arr = (g.__TP_BOOT_TRACE = g.__TP_BOOT_TRACE || []);
    arr.push(e);
  } catch {
    /* ignore */
  }
}

function ensureDevErrorHooks(g: any) {
  try {
    if (g.__TP_DEV_ERROR_HOOKS) return;
    g.__TP_DEV_ERROR_HOOKS = true;
    g.addEventListener(
      'error',
      (ev: ErrorEvent) => {
        try {
          const fn = (ev && (ev.filename || (ev.target as any)?.src)) || '';
          const ln = ev?.lineno || 0;
          const cn = ev?.colno || 0;
          const msg = ev?.message || '';
          console.error(`[boot-loader] window.error filename=${fn} lineno=${ln} colno=${cn} message=${msg}`);
        } catch {
          /* ignore */
        }
      },
      { capture: true },
    );
    g.addEventListener(
      'unhandledrejection',
      (ev: PromiseRejectionEvent) => {
        try {
          const r = ev?.reason;
          console.error('[boot-loader] unhandledrejection', r && (r.stack || r.message || String(r)));
        } catch {
          /* ignore */
        }
      },
      { capture: true },
    );
  } catch {
    /* ignore */
  }
}

function buildEntryUrl(base: string | undefined, g: any): string {
  const raw = base || '../../dist/index.js';
  const addv = (() => {
    try {
      const v = g.__TP_ADDV;
      if (typeof v === 'function') return v(raw);
      if (v) return `${raw}?v=${encodeURIComponent(v)}`;
    } catch {
      /* ignore */
    }
    return `${raw}${raw.includes('?') ? '&' : '?'}v=dev`;
  })();
  return addv;
}

export async function startBootLoader(opts: BootLoaderOptions = {}): Promise<void> {
  if (typeof window === 'undefined') return;
  const g: any = window;

  if (g.__TP_LOADER_RAN__) {
    pushTrace(g, { ts: performance.now(), tag: 'boot-loader', msg: 'dup-loader' });
    throw new Error('dup-loader');
  }
  g.__TP_LOADER_RAN__ = true;

  const isLocalHost = (() => {
    try {
      return ['localhost', '127.0.0.1'].includes(location.hostname);
    } catch {
      return false;
    }
  })();
  const isDev =
    typeof opts.dev === 'boolean'
      ? opts.dev
      : /\bdev=1\b/.test(location.search) ||
        /\bdev\b/.test(location.hash) ||
        isLocalHost ||
        (() => {
          try {
            return localStorage.getItem('tp_dev_mode') === '1';
          } catch {
            return false;
          }
        })();
  const forceLegacy = (() => {
    try {
      const qs = new URLSearchParams(location.search || '');
      return qs.has('legacy') || localStorage.getItem('tp_legacy') === '1';
    } catch {
      return false;
    }
  })();

  g.__TP_BOOT_INFO = Object.assign(g.__TP_BOOT_INFO || {}, { isDev, path: isDev ? 'dev' : 'prod' });
  pushTrace(g, { ts: performance.now(), tag: 'boot-loader', msg: 'start', isDev });

  const entryUrl = buildEntryUrl(opts.entryUrl, g);

  if (isDev) ensureDevErrorHooks(g);

  try {
    pushTrace(g, { ts: performance.now(), tag: 'boot-loader', msg: `import ${entryUrl} start`, isDev });
    await import(entryUrl);
    g.__TP_BOOT_INFO.imported = true;
    pushTrace(g, { ts: performance.now(), tag: 'boot-loader', msg: `import ${entryUrl} done`, ok: true, isDev });
  } catch (err) {
    g.__TP_BOOT_INFO.imported = false;
    pushTrace(g, {
      ts: performance.now(),
      tag: 'boot-loader',
      msg: 'import failed',
      ok: false,
      err: String(err),
      isDev,
      forceLegacy,
    });
    try {
      console.error('[boot-loader] dist import failed', err && ((err as any).stack || (err as any).message || String(err)));
    } catch {
      /* ignore */
    }

    let relaxDevFallback = false;
    try {
      const qs = new URLSearchParams(location.search || '');
      const noRelax =
        qs.has('noRelax') ||
        (() => {
          try {
            return localStorage.getItem('tp_noRelax') === '1';
          } catch {
            return false;
          }
        })();
      const ci = qs.has('ci');
      const uiMock = qs.has('uiMock');
      const mockFolder = qs.has('mockFolder');
      const isWebDriver = typeof navigator !== 'undefined' && (navigator as any).webdriver === true;
      relaxDevFallback = !!(ci || uiMock || mockFolder || isWebDriver) && !noRelax;
    } catch {
      /* ignore */
    }

    if (isDev && !forceLegacy && !relaxDevFallback) {
      try {
        console.error('[boot-loader] TS import failed; not falling back in dev. Set ?legacy=1 to force legacy.');
      } catch {
        /* ignore */
      }
      return;
    }

    if (opts.allowLegacyFallback && (forceLegacy || relaxDevFallback)) {
      try {
        console.warn('[boot-loader] legacy fallback requested but not implemented in TS path');
      } catch {
        /* ignore */
      }
    }
  }
}

// Auto-run when loaded directly as a script/module
try {
  if (typeof window !== 'undefined' && !(window as any).__TP_BOOT_LOADER_MANUAL__) {
    startBootLoader().catch(() => {});
  }
} catch {
  /* ignore */
}
