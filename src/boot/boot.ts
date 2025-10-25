// Dev/Calm flags, boot trace, error hooks, early scheduler + core waiter
import { installScrollScheduler } from './scheduler';

declare global {
  interface Window {
    __TP_DEV?: boolean;
    __TP_CALM?: boolean;
    __TP_BOOT_TRACE?: Array<{ t: number; m: string }>;
    __tpBootPush?: (m: string) => void;
    __tpRealCore?: Function & { __tpWaiter?: boolean };
    _initCore?: Function;
  }
}

const DEV = (() => {
  try {
    const u = new URL(location.href);
    if (u.searchParams.get('dev') === '1' || u.hash.includes('dev')) return true;
    if (localStorage.getItem('tp_dev_mode') === '1') return true;
    return !!(window as any).__TP_DEV;
  } catch {}
  return false;
})();

const CALM = (() => {
  try {
    const u = new URL(location.href);
    if (u.searchParams.get('calm') === '1') return true;
    if (localStorage.getItem('tp_calm_mode') === '1') return true;
    return !!(window as any).__TP_CALM;
  } catch {}
  return false;
})();

export function installBoot() {
  try { (window as any).__TP_DEV = DEV; (window as any).__TP_CALM = CALM; } catch {}
  try { document.documentElement.classList.toggle('tp-dev', !!DEV); } catch {}

  // Boot trace + push helper
  try {
    (window as any).__TP_BOOT_TRACE = [];
    (window as any).__tpBootPush = (m: string) => {
      try {
        const rec = { t: Date.now(), m };
        (window as any).__TP_BOOT_TRACE!.push(rec);
        if (DEV) console.log('[TP-TRACE]', rec.m);
      } catch {}
    };
  } catch {}
  window.__tpBootPush?.('boot-start');

  // Error hooks
  try {
    window.addEventListener('error', (e) => {
      (window as any).__tpBootPush?.('onerror:' + ((e as any).error?.message || (e as any).message || ''));
    });
    window.addEventListener('unhandledrejection', (e) => {
      (window as any).__tpBootPush?.('unhandled:' + String((e as any).reason || ''));
    });
  } catch {}

  // Early install of the scroll scheduler
  try { installScrollScheduler(); } catch {}

  // Core waiter: publishes a safe _initCore that resolves to the real core when ready
  try {
    const waiter = async function _waitForCore() {
      (window as any).__tpBootPush?.('waiter-start');
      return new Promise<Function | null>((res) => {
        let tries = 0;
        const id = setInterval(() => {
          if (typeof (window as any).__tpRealCore === 'function' && !(window as any).__tpRealCore.__tpWaiter) {
            clearInterval(id); return res((window as any).__tpRealCore!);
          }
          if (typeof (window as any)._initCore === 'function' && (window as any)._initCore !== waiter) {
            clearInterval(id); return res((window as any)._initCore!);
          }
          if (++tries > 2000) { clearInterval(id); return res(null); } // ~20s
        }, 10);
      });
    };
    (waiter as any).__tpWaiter = true;
    (window as any)._initCore = waiter;
    (window as any).__tpBootPush?.('after-_initCore-def');
  } catch {}
}

export default installBoot;
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

// Public bootstrap entry used by the legacy monolith and new module loader.
// It performs the minimal install steps (trace, error hooks, scheduler and
// publishes a safe _initCore waiter). The function is async so callers can
// await deterministic initialization during migration.
export async function bootstrap(): Promise<void> {
  try {
    installBoot();
    initBoot();
    try { (window as any).__tpBootPush?.('bootstrap-done'); } catch {}
  } catch (err) {
    try { (window as any).__tpBootPush?.('bootstrap-failed'); } catch {}
    throw err;
  }
}
