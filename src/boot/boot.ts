// Lightweight boot initializer stub for migration
// This module is intentionally minimal: it reads common flags and publishes
// a small set of window globals used by the legacy runtime. It is a safe
// starting point for moving more boot logic into TypeScript.

export interface AppBootOptions {
  DEV: boolean;
  CALM: boolean;
  QUIET: boolean;
  ADDV: string; // cache-buster suffix for dynamic imports
}

export interface BootTraceEntry {
  t: number;
  m: string;
}

export function initBoot(): AppBootOptions {
  // Defensive: run in browser environments only
  try {
    const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    const DEV = !!(Q.has('dev') || (typeof localStorage !== 'undefined' && localStorage.getItem('tp_dev_mode') === '1'));
    const CALM = !!(Q.has('calm') || (typeof localStorage !== 'undefined' && localStorage.getItem('tp_calm') === '1'));
    const QUIET = DEV && !(Q.has('loud') || (typeof localStorage !== 'undefined' && localStorage.getItem('tp_dev_loud') === '1'));
    const ADDV = (typeof window !== 'undefined' && (window as any).__TP_DEV_VERSION) || (DEV ? `dev-${Date.now().toString(36)}` : '');

    // Publish light-weight globals expected by legacy code
    try { (window as any).__TP_DEV = DEV; } catch {}
    try { (window as any).__TP_ADDV = (p: string) => (ADDV ? `${p}?v=${ADDV}` : p); } catch {}
    try { (window as any).__TP_QUIET = QUIET; } catch {}

    // Install minimal boot trace container
    try { if (!(window as any).__TP_BOOT_TRACE) (window as any).__TP_BOOT_TRACE = []; } catch {}

    // Init markers used by legacy runners/tests
    try {
      if (!window.tpMarkInitDone) {
        window.tpMarkInitDone = function (reason = 'unspecified') {
          try {
            if ((window as any).__tp_init_done) return;
            (window as any).__tp_init_done = true;
            try { console.log('[TP-INIT]', JSON.stringify({ tp_init_done: true, reason })); } catch {}
            try { window.dispatchEvent(new CustomEvent('tp:init:done', { detail: { reason } })); } catch {}
          } catch {}
        };
      }
      if (!window.tpMarkInitRunning) {
        window.tpMarkInitRunning = function () {
          try {
            if ((window as any).__tp_init_running) return;
            (window as any).__tp_init_running = true;
          } catch {}
        };
      }
    } catch {}

    // Return the options for further wiring/tests
    return { DEV, CALM, QUIET, ADDV };
  } catch (err) {
    // Non-fatal: return defaults
    return { DEV: false, CALM: false, QUIET: false, ADDV: '' };
  }
}
