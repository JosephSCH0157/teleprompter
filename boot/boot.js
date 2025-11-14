// Dev/Calm flags, boot trace, error hooks, early scheduler + core waiter
import { installScrollScheduler } from './scheduler';
const DEV = (() => {
    try {
        const u = new URL(location.href);
        if (u.searchParams.get('dev') === '1' || u.hash.includes('dev'))
            return true;
        if (localStorage.getItem('tp_dev_mode') === '1')
            return true;
        return !!window.__TP_DEV;
    }
    catch { }
    return false;
})();
const CALM = (() => {
    try {
        const u = new URL(location.href);
        if (u.searchParams.get('calm') === '1')
            return true;
        if (localStorage.getItem('tp_calm_mode') === '1')
            return true;
        return !!window.__TP_CALM;
    }
    catch { }
    return false;
})();
export function installBoot() {
    try {
        window.__TP_DEV = DEV;
        window.__TP_CALM = CALM;
    }
    catch { }
    try {
        document.documentElement.classList.toggle('tp-dev', !!DEV);
    }
    catch { }
    // Boot trace + push helper
    try {
        window.__TP_BOOT_TRACE = [];
        window.__tpBootPush = (m) => {
            try {
                const rec = { t: Date.now(), m };
                window.__TP_BOOT_TRACE.push(rec);
                if (DEV)
                    console.log('[TP-TRACE]', rec.m);
            }
            catch { }
        };
    }
    catch { }
    window.__tpBootPush?.('boot-start');
    // Error hooks
    try {
        window.addEventListener('error', (e) => {
            window.__tpBootPush?.('onerror:' + (e.error?.message || e.message || ''));
        });
        window.addEventListener('unhandledrejection', (e) => {
            window.__tpBootPush?.('unhandled:' + String(e.reason || ''));
        });
    }
    catch { }
    // Early install of the scroll scheduler
    try {
        installScrollScheduler();
    }
    catch { }
    // Core waiter: publishes a safe _initCore that resolves to the real core when ready
    try {
        const waiter = async function _waitForCore() {
            window.__tpBootPush?.('waiter-start');
            return new Promise((res) => {
                let tries = 0;
                const id = setInterval(() => {
                    if (typeof window.__tpRealCore === 'function' && !window.__tpRealCore.__tpWaiter) {
                        clearInterval(id);
                        return res(window.__tpRealCore);
                    }
                    if (typeof window._initCore === 'function' && window._initCore !== waiter) {
                        clearInterval(id);
                        return res(window._initCore);
                    }
                    if (++tries > 2000) {
                        clearInterval(id);
                        return res(null);
                    } // ~20s
                }, 10);
            });
        };
        waiter.__tpWaiter = true;
        window._initCore = waiter;
        window.__tpBootPush?.('after-_initCore-def');
    }
    catch { }
}
export default installBoot;
export function initBoot() {
    // Defensive: run in browser environments only
    try {
        const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
        const DEV = !!(Q.has('dev') || (typeof localStorage !== 'undefined' && localStorage.getItem('tp_dev_mode') === '1'));
        const CALM = !!(Q.has('calm') || (typeof localStorage !== 'undefined' && localStorage.getItem('tp_calm') === '1'));
        const QUIET = DEV && !(Q.has('loud') || (typeof localStorage !== 'undefined' && localStorage.getItem('tp_dev_loud') === '1'));
        const ADDV = (typeof window !== 'undefined' && window.__TP_DEV_VERSION) || (DEV ? `dev-${Date.now().toString(36)}` : '');
        // Publish light-weight globals expected by legacy code
        try {
            window.__TP_DEV = DEV;
        }
        catch { }
        try {
            window.__TP_ADDV = (p) => (ADDV ? `${p}?v=${ADDV}` : p);
        }
        catch { }
        try {
            window.__TP_QUIET = QUIET;
        }
        catch { }
        // Install minimal boot trace container
        try {
            if (!window.__TP_BOOT_TRACE)
                window.__TP_BOOT_TRACE = [];
        }
        catch { }
        // Init markers used by legacy runners/tests
        try {
            if (!window.tpMarkInitDone) {
                window.tpMarkInitDone = function (reason = 'unspecified') {
                    try {
                        if (window.__tp_init_done)
                            return;
                        window.__tp_init_done = true;
                        try {
                            console.log('[TP-INIT]', JSON.stringify({ tp_init_done: true, reason }));
                        }
                        catch { }
                        try {
                            window.dispatchEvent(new CustomEvent('tp:init:done', { detail: { reason } }));
                        }
                        catch { }
                    }
                    catch { }
                };
            }
            if (!window.tpMarkInitRunning) {
                window.tpMarkInitRunning = function () {
                    try {
                        if (window.__tp_init_running)
                            return;
                        window.__tp_init_running = true;
                    }
                    catch { }
                };
            }
        }
        catch { }
        // Return the options for further wiring/tests
        return { DEV, CALM, QUIET, ADDV };
    }
    catch {
        // Non-fatal: return defaults
        return { DEV: false, CALM: false, QUIET: false, ADDV: '' };
    }
}
// Public bootstrap entry used by the legacy monolith and new module loader.
// It performs the minimal install steps (trace, error hooks, scheduler and
// publishes a safe _initCore waiter). The function is async so callers can
// await deterministic initialization during migration.
export async function bootstrap() {
    try {
        installBoot();
        initBoot();
        try {
            window.__tpBootPush?.('bootstrap-done');
        }
        catch { }
    }
    catch (err) {
        try {
            window.__tpBootPush?.('bootstrap-failed');
        }
        catch { }
        throw err;
    }
}
