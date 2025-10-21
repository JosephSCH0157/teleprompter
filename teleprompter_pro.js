/* Teleprompter Pro — JS CLEAN (v1.5.8) */

// Module-aware toast proxy: prefer the module export, then fall back to window._toast, then to a minimal console fallback.
let _toast = function (msg, opts) {
  try {
    if (typeof moduleToast === 'function') return moduleToast(msg, opts);
  } catch {
    try {
      console.debug('module toast access failed', e);
    } catch {
      void e;
    }
  }
  try {
    if (typeof window !== 'undefined' && typeof window._toast === 'function')
      return window._toast(msg, opts);
  } catch {
    void 0;
  }
  try {
    console.debug('[toast]', msg, opts || '');
  } catch {}
};

(function () {
  'use strict';
  // Prevent double-loading in the same window/context
  try {
    // dev flag early so we can silence noisy warnings in production
    const __dev = (function(){ try { const Q=new URLSearchParams(location.search); return Q.has('dev') || localStorage.getItem('tp_dev_mode')==='1'; } catch { return false; } })();
    // idle flag — don't start heavy subsystems until a script exists
    if (typeof window.__tp_has_script === 'undefined') window.__tp_has_script = false;
    if (window.__TP_ALREADY_BOOTED__) {
      if (__dev) console.warn('[TP-BOOT] duplicate load blocked');
      return;
    }
    window.__TP_ALREADY_BOOTED__ = true;
  } catch {}
  // --- Init-done marker (for smoke/CI) ---
  (function ensureInitMarker(){
    if (window.__tp_init_done == null) window.__tp_init_done = false;
    if (!window.tpMarkInitDone) {
      window.tpMarkInitDone = function(reason = 'unspecified'){
        if (window.__tp_init_done) return;
        window.__tp_init_done = true;
        try {
          // Cancel any pending late-init fallback timer when init completes
          try { if (typeof _lateInitTimer !== 'undefined' && _lateInitTimer) { clearTimeout(_lateInitTimer); _lateInitTimer = null; } } catch {}
          const ctx = window.opener ? 'Display' : (window.name || 'Main');
          const v = (window.App && (window.App.version || window.App.appVersion)) || null;
          // JSON pulse for runners
          console.log('[TP-INIT]', JSON.stringify({ tp_init_done: true, ctx, appVersion: v, reason }));
          // Optional: event for listeners
          window.dispatchEvent(new CustomEvent('tp:init:done', { detail: { ctx, appVersion: v, reason } }));
  } catch {}
      };
    }
    if (!window.tpMarkInitRunning) {
      window.tpMarkInitRunning = function() {
        try {
          if (window.__tp_init_running) return;
          window.__tp_init_running = true;
          try { if (typeof _lateInitTimer !== 'undefined' && _lateInitTimer) { clearTimeout(_lateInitTimer); _lateInitTimer = null; } } catch {}
        } catch {}
      };
    }
  })();
  // Gate heavy subsystems until a real script is present
  try {
    if (typeof window.__tp_has_script === 'undefined') window.__tp_has_script = false;
    if (!window.tpSetHasScript) {
      window.tpSetHasScript = function (has) {
        try {
          // Only set the 'has script' flag once and only when true.
          // This centralizes the decision and avoids flip-flopping during wiring.
          if (!has) return; // ignore false/disarm calls
          if (window.__tp_has_script) return; // already armed
          window.__tp_has_script = true;
          // Emit event for test harnesses / debug tools
          try {
            window.dispatchEvent(new CustomEvent('tp:script:presence', { detail: { has: window.__tp_has_script } }));
          } catch {}
          // Light control hooks: start optional subsystems
          try {
            window.__pll_running = true;
            window.__hud_running = true;
          } catch {}
          // Dev-only trace to indicate the script presence was set
          try { if (window.__TP_DEV) console.debug('[TP-TRACE] tpSetHasScript -> true'); } catch {}
        } catch {}
      };
    }
  } catch {}
  // Derive a short context tag for logs (Main vs Display)
  const TP_CTX = (function () {
    try {
      if (window.opener) return 'Display';
      if (window.name) return window.name;
    } catch {}
    return 'Main';
  })();
  // Flags (URL or localStorage): ?calm=1&dev=1
  try {
    const Q = new URLSearchParams(location.search);
    const DEV = Q.has('dev') || localStorage.getItem('tp_dev_mode') === '1';
    const CALM = Q.has('calm') || localStorage.getItem('tp_calm') === '1';

    // Default dev mode to quiet unless explicitly "loud"
    const loudDev = Q.has('loud') || localStorage.getItem('tp_dev_loud') === '1';
    window.__TP_QUIET = DEV && !loudDev; // dev by default is QUIET

    // Dev-time cache buster for dynamic imports
    try {
      const V =
        (typeof window !== 'undefined' && window.__TP_DEV && window.__TP_DEV_VERSION) ||
        (DEV ? 'dev-' + Date.now().toString(36) : '');
      window.__TP_DEV_VERSION = V;
      window.__TP_ADDV = function addV(p) {
        try {
          if (!V) return p;
          return p + (p.indexOf('?') >= 0 ? '&' : '?') + 'v=' + V;
        } catch {
          return p;
        }
      };
    } catch {
      void e;
    }
    // Dev-only cache bust handled via __TP_ADDV and HTML loader; no top-level await here
    try {
      window.__TP_DEV = DEV;
      window.__TP_CALM = CALM;
    } catch {}
    // Ensure DEV-only UI (like build label) is gated by a class on <html>
    try {
      document.documentElement.classList.toggle('tp-dev', !!DEV);
    } catch {}
    try {
      if (CALM) {
        window.__TP_DISABLE_NUDGES = true;
      }
    } catch {}
    try {
      if (DEV) console.info('[TP-Pro] DEV mode enabled');
    } catch {}
    try {
      if (CALM) console.info('[TP-Pro] Calm Mode enabled');
    } catch {}
  } catch {
    void e;
  }
  // Boot instrumentation (added)
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      try { performance.mark('app-init-start'); } catch { }
    }
  } catch {}
  try {
    window.__TP_BOOT_TRACE = [];
    const _origLog = console.log.bind(console);
  const tag = (m) => `[${TP_CTX}] [TP-BOOT ${Date.now() % 100000}] ${m}`;
    // Publish build version for About panel and diagnostics
    try {
      window.APP_VERSION = '1.6.1';
    } catch {}
    window.__tpBootPush = (m) => {
      try {
        const rec = { t: Date.now(), m };
        window.__TP_BOOT_TRACE.push(rec);
        try {
          console.log(`[${TP_CTX}] [TP-TRACE]`, rec.m);
        } catch {
          console.log('[TP-TRACE]', rec.m);
        }
      } catch {
        try {
          console.warn('[TP-TRACE-FAIL]', err);
        } catch {}
        // Long-running low-cost poll: keep checking every 5s so that
        // bridge/recorder instances created later than the initial poll
        // will still update the status chip. This is intentionally light.
        try {
          setInterval(() => {
            try {
              if (typeof window.__TP_DEV !== 'undefined' && window.__TP_DEV) console.debug('[OBS] long-poll tick');
              updateStatus();
            } catch {}
          }, 5000);
        } catch {}
      }
    };
    // Ensure handshake log exists early so the Debug Dump can read it even before adapters run
    try {
      window.__obsHandshakeLog = window.__obsHandshakeLog || [];
    } catch {}
  __tpBootPush('script-enter');
  _origLog(tag('entered main IIFE'));
  // Late-init timer handle: used to avoid scheduling fallback when init starts later
  let _lateInitTimer = null;
    window.addEventListener('DOMContentLoaded', () => {
      __tpBootPush('dom-content-loaded');
    });
    document.addEventListener('readystatechange', () => {
      __tpBootPush('rs:' + document.readyState);
    });
    // Global error hooks (diagnostic): capture earliest uncaught issues
    window.addEventListener('error', (ev) => {
      try {
        (__TP_BOOT_TRACE || []).push({
          t: Date.now(),
          m: 'onerror:' + (ev?.error?.message || ev?.message),
        });
      } catch {
        void e;
      }
      try {
        console.error('[TP-BOOT onerror]', ev?.error || ev?.message || ev);
      } catch {}
    });
    window.addEventListener('unhandledrejection', (ev) => {
      try {
        (__TP_BOOT_TRACE || []).push({
          t: Date.now(),
          m: 'unhandled:' + (ev?.reason?.message || ev?.reason),
        });
      } catch {}
      try {
        console.error('[TP-BOOT unhandled]', ev?.reason);
      } catch {}
    });
    _origLog(tag('installed global error hooks'));
      try {
        if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
          try { performance.mark('boot-global-hooks-installed'); } catch {}
        }
      } catch {}
  } catch {
    void e;
  }
  // HUD counters for quick tuning telemetry
  try {
    if (!window.__hudCounters) {
      window.__hudCounters = {
        drops: { command: 0, oov: 0, meta: 0 },
        softAdv: { allowed: 0, blockedLost: 0, frozen: 0 },
        rescue: { count: 0 },
      };
      // Watchdog arm state: only report HUD and run watchdog when armed
      window.__tp_wd_armed = false;
      window.tpArmWatchdog = function (on) {
        try {
          const prev = !!window.__tp_wd_armed;
          window.__tp_wd_armed = !!on;
          if (prev === window.__tp_wd_armed) return;
          // Reset counters/state when disarming
          if (!window.__tp_wd_armed) {
            try {
              window.__tpMetrics = { ticks: 0, stalls: 0, rescues: 0, lastSample: 0, samples: [] };
              window.__tpWatchdogState = 'OK';
            } catch {}
          }
          try {
            if (window.__TP_DEV) console.debug('[TP-TRACE] watchdog', window.__tp_wd_armed ? 'ARM' : 'DISARM');
          } catch {}
        } catch {}
      };
      setInterval(() => {
        try {
          // Only emit HUD counters when a real script exists and the watchdog is explicitly armed.
          if (!window.__tp_has_script || !window.__tp_wd_armed) return; // idle
          // Quiet the HUD output unless the watchdog is armed (avoids noisy logs in CI/idle)
          try {
            if (!window.__tp_wd_armed) return;
            console.log('[HUD:counts]', JSON.stringify(window.__hudCounters || {}));
          } catch {}
        } catch {}
      }, 1000);
    }
  } catch {}

  // Freeze soft-advance by batches (decremented per match cycle)
  try {
    if (typeof window.__freezeBatches === 'undefined') window.__freezeBatches = 0;
  } catch {}
    // Expose a small perf helper to measure sections during runtime
    try {
      window.__tpPerf = {
        mark: (n) => { try { performance && performance.mark && performance.mark(n); } catch {} },
        measure: (name, start, end) => { try { performance && performance.measure && performance.measure(name, start, end); } catch {} },
        report: () => { try { const m = performance.getEntriesByType('measure'); console.table(m.map(x=>({name:x.name,duration:Math.round(x.duration)}))); } catch {} }
      };
    } catch {}
    // Dev-only paint vitals: capture LCP and CLS when available to pair with perf marks
    try {
      if (window.__TP_DEV && typeof PerformanceObserver !== 'undefined') {
        try {
          const po = new PerformanceObserver((list) => {
            try {
              for (const e of list.getEntries()) {
                try {
                  if (e.entryType === 'largest-contentful-paint') {
                    console.info('[TP-Pro] LCP', Math.round(e.startTime));
                  } else if (e.entryType === 'layout-shift' && !e.hadRecentInput) {
                    window.__tpCLS = (window.__tpCLS || 0) + (e.value || 0);
                    try {
                      console.info('[TP-Pro] CLS+', (e.value || 0).toFixed(4), 'total=', (window.__tpCLS || 0).toFixed(4));
                    } catch {}
                  }
                } catch {}
              }
            } catch {}
          });
          try { po.observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
          try { po.observe({ type: 'layout-shift', buffered: true }); } catch {}
        } catch {}
      }
    } catch {}
  try {
    __tpBootPush('after-boot-block');
  } catch {}

  // Listen for endgame completion
  window.addEventListener('end:reached', async (ev) => {
    console.log('[ENDGAME] Script completed!', ev.detail);
    // Stop recording if auto-record enabled
    try {
      if (window.getAutoRecordEnabled && window.getAutoRecordEnabled()) {
        try {
          if (typeof ensureStopped === 'function') await ensureStopped();
          else
            window.obsCommand({ op: 6, d: { requestType: 'StopRecord', requestId: 'anvil-stop' } });
        } catch {
          try {
            window.obsCommand({ op: 6, d: { requestType: 'StopRecord', requestId: 'anvil-stop' } });
          } catch {
            void e;
          }
        }
      }
    } catch {
      void e;
    }
  });

  // Calm Mode geometry helpers: unified target math and clamped scroll writes
  // These are safe to define always; callers should only use them when CALM is enabled.
  function getYForElInScroller(
    el,
    sc = window.__TP_SCROLLER ||
      document.getElementById('viewer') ||
      document.scrollingElement ||
      document.documentElement ||
      document.body,
    pct = typeof window !== 'undefined' && typeof window.__TP_MARKER_PCT === 'number'
      ? window.__TP_MARKER_PCT
      : 0.4
  ) {
    try {
      if (!el || !sc) return 0;
      const elR = el.getBoundingClientRect();
      const scR =
        typeof sc.getBoundingClientRect === 'function' ? sc.getBoundingClientRect() : { top: 0 };
      const base =
        typeof window.__TP_VIEWER_HEIGHT_BASE === 'number' && window.__TP_VIEWER_HEIGHT_BASE > 0
          ? window.__TP_VIEWER_HEIGHT_BASE
          : sc.clientHeight || 0;
      const raw = (sc.scrollTop || 0) + (elR.top - scR.top) - Math.round(base * pct);
      const max = Math.max(0, (sc.scrollHeight || 0) - (sc.clientHeight || 0));
      return Math.max(0, Math.min(raw | 0, max));
    } catch {
      return 0;
    }
  }
  function tpScrollTo(
    y,
    sc = window.__TP_SCROLLER ||
      document.getElementById('viewer') ||
      document.scrollingElement ||
      document.documentElement ||
      document.body
  ) {
    try {
      const max = Math.max(0, (sc.scrollHeight || 0) - (sc.clientHeight || 0));
      const target = Math.min(Math.max(0, y | 0), max);
      try {
        if (typeof window.__tpClampGuard === 'function') {
          const ok = window.__tpClampGuard(target, max);
          if (!ok) return; // skip micro re-clamp
        }
      } catch {}
      sc.scrollTop = target;
      if (window.__TP_DEV) {
        try {
          console.debug('[TP-Pro Calm] tpScrollTo', {
            y,
            target,
            max,
            scroller: sc.id || sc.tagName,
          });
        } catch {}
      }
    } catch {
      void e;
    }
  }

  // Early real-core waiter: provides a stable entry that will call the real core once it appears
  try {
    if (typeof window.__tpRealCore !== 'function') {
      window.__tpRealCore = async function __coreWaiter() {
        const self = window.__tpRealCore;
        for (let i = 0; i < 2000; i++) {
          // ~20s
          try {
            if (
              typeof _initCore === 'function' &&
              _initCore !== self &&
              _initCore !== window._initCore
            ) {
              return _initCore();
            }
          } catch {
            void e;
          }
          if (typeof window._initCore === 'function' && window._initCore !== self) {
            return window._initCore();
          }
          await new Promise((r) => setTimeout(r, 10));
        }
        throw new Error('Core waiter timeout');
      };
      try {
        window.__tpRealCore.__tpWaiter = true;
      } catch {}
    }
  } catch {}
  // Install an early stub for core init that queues until the real core is defined
  try {
    if (typeof window._initCore !== 'function') {
      window._initCore = async function __initCoreStub() {
        try {
          __tpBootPush('initCore-stub-wait');
        } catch {}
        const self = window._initCore;
        // If the hoisted function exists and is not this stub, call it immediately
        try {
          if (
            typeof _initCore === 'function' &&
            _initCore !== self &&
            _initCore !== window._initCore
          ) {
            try {
              __tpBootPush('initCore-stub-direct-call');
            } catch {}
            return _initCore();
          }
        } catch {}
        const core = await new Promise((res) => {
          let tries = 0;
          const id = setInterval(() => {
            // Tiny global commit/scroll scheduler to centralize writes and make metrics easier
            (function installTinyScheduler() {
              try {
                if (window.__tpTinySchedulerInstalled) return;
                window.__tpTinySchedulerInstalled = true;
                let _pendingTop = null,
                  _rafId = 0;
                const getScroller = () =>
                  window.__TP_SCROLLER ||
                  document.getElementById('viewer') ||
                  document.scrollingElement ||
                  document.documentElement ||
                  document.body;
                function clamp(y) {
                  const sc = getScroller();
                  if (!sc) return 0;
                  const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
                  return Math.max(0, Math.min(Number(y) || 0, max));
                }
                function requestScrollTop(y) {
                  const sc = getScroller();
                  if (!sc) return;
                  _pendingTop = clamp(y);
                  try {
                    window.__lastScrollTarget = _pendingTop;
                  } catch {}
                  if (_rafId) return;
                  _rafId = requestAnimationFrame(() => {
                    const t = _pendingTop;
                    _pendingTop = null;
                    _rafId = 0;
                    try {
                      sc.scrollTo({ top: t, behavior: 'auto' });
                    } catch {
                      sc.scrollTop = t;
                    }
                    try {
                      window.__lastScrollTarget = null;
                    } catch {}
                  });
                }
                // publish minimal API
                window.__tpScrollWrite = requestScrollTop;
                // optional: wrap viewer.scrollTop writes
                const sc = getScroller();
                if (sc && !sc.__tpWriteWrapped) {
                  sc.__tpWriteWrapped = true;
                  try {
                    const origSet = Object.getOwnPropertyDescriptor(
                      Object.getPrototypeOf(sc),
                      'scrollTop'
                    )?.set;
                    if (origSet) {
                      Object.defineProperty(sc, 'scrollTop', {
                        configurable: true,
                        set(v) {
                          requestScrollTop(v);
                        },
                      });
                    }
                  } catch {}
                }
              } catch {}
            })();
            // Prefer explicitly published real core ONLY if it's not just the early waiter
            if (typeof window.__tpRealCore === 'function' && !window.__tpRealCore.__tpWaiter) {
              clearInterval(id);
              return res(window.__tpRealCore);
            }
            // Or if window._initCore has been swapped to a different function, use that
            if (typeof window._initCore === 'function' && window._initCore !== self) {
              clearInterval(id);
              return res(window._initCore);
            }
            // Or if the hoisted real function has appeared, use it directly
            try {
              if (typeof _initCore === 'function' && _initCore !== self) {
                clearInterval(id);
                return res(_initCore);
              }
            } catch {}
            if (++tries > 2000) {
              clearInterval(id);
              return res(null);
            } // ~20s
          }, 10);
        });
        if (typeof core === 'function') return core();
        throw new Error('Core not ready after stub wait');
      };
    }
  } catch {}
  // Watchdog: if the real core is not defined soon, dump boot trace for diagnosis
  try {
    setTimeout(() => {
      try {
        const trace = window.__TP_BOOT_TRACE || [];
        const hasCoreDef = trace.some((r) => r && r.m === 'after-_initCore-def');
        if (!hasCoreDef) {
          console.warn('[TP-Pro] Core definition not reached yet; dumping boot trace tail…');
          const tail = trace.slice(-50).map((x) => x && x.m);
          console.log('[TP-Pro] Boot tail:', tail);
        }
      } catch {}
    }, 3000);
  } catch {}
  // Establish a stable core runner that waits until core is ready
  try {
    if (!window._initCoreRunner) {
      let __resolveCoreRunner;
      const __coreRunnerReady = new Promise((r) => {
        __resolveCoreRunner = r;
      });
      window._initCoreRunner = async function () {
        try {
          await __coreRunnerReady;
        } catch {}
        if (typeof window._initCore === 'function') return window._initCore();
        if (typeof _initCore === 'function') return _initCore();
        throw new Error('Core not ready');
      };
      window.__tpSetCoreRunnerReady = () => {
        try {
          __resolveCoreRunner && __resolveCoreRunner();
        } catch {}
      };
    }
  } catch {}
  // Provide a safe early init proxy on window that forwards to core when available
  try {
    // Promise that resolves when core initializer becomes available
    if (!window.__tpCoreReady) {
      window.__tpCoreReady = new Promise((resolve) => {
        window.__tpResolveCoreReady = resolve;
      });
    }
    if (typeof window.init !== 'function') {
      window.init = async function () {
        try {
          // Prevent concurrent or duplicate init runs
          if (window.__tp_init_running || window.__tp_init_done) return;
          window.__tp_init_running = true;
          try { if (typeof lateInitTimer !== 'undefined' && lateInitTimer) { clearTimeout(lateInitTimer); lateInitTimer = null; } } catch {}
          // If core is already available, run immediately
          if (typeof _initCore === 'function' || typeof window._initCore === 'function') {
            try {
              const res = await (window._initCore || _initCore)();
              window.__tp_init_done = true;
              return res;
            } finally {
              window.__tp_init_running = false;
            }
          }
          try {
            __tpBootPush('window-init-proxy-waiting-core');
          } catch {
            void e;
          }
          // Wait briefly for core to appear (either via assignment or resolve hook)
          const core = await Promise.race([
            new Promise((res) => {
              let tries = 0;
              const id = setInterval(() => {
                if (typeof _initCore === 'function' || typeof window._initCore === 'function') {
                  clearInterval(id);
                  res(window._initCore || _initCore);
                } else if (++tries > 300) {
                  clearInterval(id);
                  res(null);
                }
              }, 10);
            }),
            window.__tpCoreReady?.then(() => window._initCore || _initCore).catch(() => null),
          ]);
          if (typeof core === 'function') {
            try {
              const res = await core();
              window.__tp_init_done = true;
              return res;
            } finally {
              window.__tp_init_running = false;
            }
          }
          console.warn('[TP-Pro] window.init proxy: core not ready after wait');
          // Use the stable runner which waits until core is ready
          try {
            __tpBootPush('window-init-proxy-waiting-core');
          } catch {}
          try {
            const res = await window._initCoreRunner();
            window.__tp_init_done = true;
            return res;
          } finally {
            window.__tp_init_running = false;
          }
        } catch {
          window.__tp_init_running = false;
          throw e;
        }
      };
      __tpBootPush('window-init-proxy-installed');
    }
  } catch {}
  // Early minimal init safety net: builds placeholder + dB meter if deep init stalls.
  (function earlyInitFallback() {
    try {
      if (window.__tpInitSuccess || window.__tpEarlyInitRan) return;
      // Defer a tick so DOM is definitely present
      requestAnimationFrame(() => {
        try {
          if (window.__tpInitSuccess || window.__tpEarlyInitRan) return;
          const scriptEl = document.getElementById('script');
          const _editorEl = document.getElementById('editor');
          if (scriptEl && !scriptEl.innerHTML) {
            scriptEl.innerHTML = '<p><em>Paste text in the editor to begin… (early)</em></p>';
          }
          // Build minimal dB meter bars if missing
          const meter = document.getElementById('dbMeterTop');
          if (meter && !meter.querySelector('.bar')) {
            try {
              typeof buildDbBars === 'function'
                ? buildDbBars(meter)
                : (function (m) {
                    for (let i = 0; i < 10; i++) {
                      const b = document.createElement('div');
                      b.className = 'bar';
                      m.appendChild(b);
                    }
                  })(meter);
            } catch {}
          }
          window.__tpEarlyInitRan = true;
          try {
            __tpBootPush && __tpBootPush('early-init-fallback');
          } catch {
            void e;
          }
        } catch {
          void e;
        }
      });
    } catch {
      void e;
    }
  })();

  // Absolute minimal boot (independent of full init) to restore placeholder + meter if script aborts early.
  function minimalBoot() {
    try {
      if (window.__tpInitSuccess || window.__tpMinimalBootRan) return;
      window.__tpMinimalBootRan = true;
      const scriptEl = document.getElementById('script');
      const _editorEl2 = document.getElementById('editor');
      if (scriptEl && (!scriptEl.textContent || !scriptEl.textContent.trim())) {
        scriptEl.innerHTML = '<p><em>Paste text in the editor to begin…</em></p>';
      }
      // Build meter bars (lightweight fallback if buildDbBars not yet defined)
      const meter = document.getElementById('dbMeterTop');
      if (meter && !meter.querySelector('.bar')) {
        if (typeof buildDbBars === 'function') {
          try {
            buildDbBars(meter);
          } catch {}
        } else {
          for (let i = 0; i < 12; i++) {
            const b = document.createElement('div');
            b.className = 'bar';
            meter.appendChild(b);
          }
        }
      }
      // Wire top normalize button minimally (may be overwritten by full init later)
      const nbtn = document.getElementById('normalizeTopBtn');
      if (nbtn && !nbtn.__mini) {
        nbtn.__mini = true;
        nbtn.addEventListener('click', () => {
          try {
            if (typeof window.normalizeToStandard === 'function') window.normalizeToStandard();
            else if (typeof window.fallbackNormalize === 'function') window.fallbackNormalize();
          } catch {
              console.warn('Mini normalize failed', e);
            }
        });
      }
      try {
        __tpBootPush('minimal-boot');
      } catch {}
    } catch {
      console.warn('[TP-Pro] minimalBoot error', e);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', minimalBoot);
  else minimalBoot();
  try {
    __tpBootPush('post-minimalBoot');
  } catch {}
  // Ultra-early safety init attempt (will run before normal scheduler if nothing else fires)
  setTimeout(() => {
    try {
      if (!window.__tpInitSuccess && !window.__tpInitCalled && typeof init === 'function') {
        if (window.__TP_DEV) {
          try {
            console.info('[TP-Pro] Early zero-time force init attempt');
          } catch {}
        }
        window.__tpInitCalled = true;
        init();
      }
        } catch {
      console.error('[TP-Pro] early force init error', e);
    }
  }, 0);
  try {
    __tpBootPush('after-zero-time-init-attempt-scheduled');
  } catch {}
  // cSpell:ignore playsinline webkit-playsinline recog chrono preroll topbar labelledby uppercased Tunables tunables Menlo Consolas docx openxmlformats officedocument wordprocessingml arrayBuffer FileReader unpkg mammoth

  // Early redundant init scheduling (safety net): wait for init to be defined, then call once
  try {
    __tpBootPush('pre-init-scheduling-early');
  } catch {}
  try {
    const callInitOnce = () => {
      if (window.__tpInitCalled) return;
      if (typeof init === 'function') {
        window.__tpInitCalled = true;
        try {
          try { window.tpMarkInitRunning && window.tpMarkInitRunning(); } catch {}
          try { __tpBootPush('early-init-invoking'); } catch {}
          try { init(); } catch (e) { console.error('init failed (early)', e); }
        } catch {}
      } else if (typeof window._initCore === 'function') {
        window.__tpInitCalled = true;
        try {
          try { window.tpMarkInitRunning && window.tpMarkInitRunning(); } catch {}
          try { __tpBootPush('early-core-invoking'); } catch {}
          (async () => {
            try {
              await window._initCore();
              console.log('[TP-Pro] _initCore early path end (success)');
            } catch (e) {
              console.error('[TP-Pro] _initCore failed (early path):', e);
            }
          })();
        } catch {}
      } else {
        // Shouldn’t happen due to guard, but reset flag to allow later retry
        window.__tpInitCalled = false;
      }
    };
    const whenInitReady = () => {
      if (typeof init === 'function') {
        callInitOnce();
        return;
      }
      try {
        __tpBootPush('early-waiting-for-init');
      } catch {}
      let tries = 0;
      const id = setInterval(() => {
        if (typeof init === 'function' || typeof window._initCore === 'function') {
          clearInterval(id);
          callInitOnce();
        } else if (++tries > 300) {
          clearInterval(id);
          console.warn('[TP-Pro] init not defined after wait');
        }
      }, 10);
    };
    if (!window.__tpInitScheduled) {
      window.__tpInitScheduled = true;
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', whenInitReady, { once: true });
      } else {
        Promise.resolve().then(whenInitReady);
      }
    }
    } catch {
    console.warn('early init scheduling error', e);
  }
  try {
    __tpBootPush('init-scheduling-early-exited');
  } catch {}
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      try { performance.mark('app-init-end'); } catch {}
      try { performance.measure('app-init', 'app-init-start', 'app-init-end'); } catch {}
    }
  } catch {}

  /* ──────────────────────────────────────────────────────────────
   * Boot diagnostics
   * ────────────────────────────────────────────────────────────── */
  const log = (...a) => console.log('[TP-Pro]', ...a);
  const warn = (...a) => console.warn('[TP-Pro]', ...a);
  const _err = (...a) => console.error('[TP-Pro]', ...a);
  try { window.err = _err; } catch {}

  // Missing constants / safe fallbacks (restored)
  const DEVICE_KEY = 'tp_mic_device_v1';
  // Define globals used later to avoid early ReferenceErrors halting script
  let dbAnim = null; // requestAnimationFrame id for dB meter
  let audioStream = null; // MediaStream for mic
  let analyser = null; // AnalyserNode
  let audioCtx = null; // AudioContext
  // Display & camera/session globals (avoid ReferenceErrors during early handlers)
  let displayReady = false; // display window handshake state
  let displayHelloTimer = null; // hello ping interval id
  let displayHelloDeadline = 0; // cutoff for hello pings
  let camStream = null; // active camera MediaStream
  let wantCamRTC = false; // user intent to mirror cam to display
  let camPC = null; // RTCPeerConnection for camera
  let recog = null; // SpeechRecognition instance
  let camAwaitingAnswer = false; // negotiation flag to gate remote answers
  // Peak hold state for dB meter
  const peakHold = { value: 0, lastUpdate: 0, decay: 0.9 };
  // Default for recAutoRestart until init wires it; exposed via defineProperty later
  let recAutoRestart = false;
  let lineIndex = null; // line index for viewport estimation
  // Mic is opt-in via explicit user request now; no auto-start
  // Simple toast system: creates a floating container and places up to 3 toasts.
  (function () {
    const CONTAINER_ID = 'tp_toast_container';
    const MAX_VISIBLE = 3;
    const AUTO_FADE_MS = 4000;
    function ensureContainer() {
      let c = document.getElementById(CONTAINER_ID);
      if (c) return c;
      c = document.createElement('div');
      c.id = CONTAINER_ID;
      c.className = 'tp-toast-container';
      document.body.appendChild(c);
      return c;
    }
    function prune(container) {
      const children = Array.from(container.children || []);
      while (children.length > MAX_VISIBLE) {
        const first = children.shift();
        if (first && first.remove) first.remove();
      }
    }
    window._toast = function (msg, opts) {
      try {
        const container = ensureContainer();
        prune(container);
        const t = document.createElement('div');
        t.className = 'tp-toast show ' + (opts && opts.type ? String(opts.type) : '');
        t.textContent = String(msg || '');
        t.addEventListener('click', () => {
          t.classList.remove('show');
          setTimeout(() => t.remove(), 120);
        });
        container.appendChild(t);
        // ensure max visible
        prune(container);
        // auto-fade
        setTimeout(() => {
          t.classList.remove('show');
          setTimeout(() => t.remove(), 120);
        }, AUTO_FADE_MS);
      } catch {
        try {
          console.debug('[toast]', msg, opts || '');
        } catch {}
      }
    };
    // Ensure a global `_toast` alias (so calls to `_toast(...)` work reliably)
    try {
      if (typeof _toast === 'undefined') {
        // define non-configurable global alias in a safe way
        try {
          self._toast = window._toast;
        } catch {}
        try {
          // also create a var in current scope if allowed
          _toast = window._toast;
        } catch {}
      } else {
        _toast = window._toast;
      }
    } catch {
      void e;
    }

    // Try to dynamically import the module-based toast and prefer it when available.
    (async function () {
      try {
        const m = await import('./ui/toasts.js');
        if (m && typeof m.toast === 'function') {
          try {
            window._toast = m.toast;
          } catch {}
          try {
            self._toast = m.toast;
          } catch {}
          try {
            _toast = m.toast;
          } catch {}
        }
      } catch {
        // module not available yet or import failed; keep fallback
        try {
          console.debug('toast module import failed', e);
        } catch {}
      }
    })();
  })();

  window.addEventListener('error', (e) => setStatus('Boot error: ' + (e?.message || e)));
  window.addEventListener('unhandledrejection', (e) =>
    setStatus('Promise rejection: ' + (e?.reason?.message || e?.reason || e))
  );

  // CSS rule '.hidden { display: none !important; }' removed. Add this to your CSS file instead.

  // TP: zoom-guard (main)
  // Prevent browser-level zoom (Ctrl/Meta + wheel or +/-/0) so each window keeps its own in-app typography zoom.
  try {
    window.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
        }
      },
      { passive: false }
    );
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.ctrlKey || e.metaKey) {
          const k = e.key || '';
          if (k === '+' || k === '=' || k === '-' || k === '_' || k === '0') {
            e.preventDefault();
          }
        }
      },
      { capture: true }
    );
  } catch {}
  try {
    __tpBootPush('after-zoom-guard');
  } catch {}

  function setStatus(msg) {
    try {
      const s =
        document.getElementById('status') ||
        (() => {
          const p = document.createElement('p');
          p.id = 'status';
          (document.body || document.documentElement).appendChild(p);
          return p;
        })();
      s.textContent = String(msg);
    } catch {
      // ignore
    }
  }

  // Shared Normalize wiring helper
  function wireNormalizeButton(btn) {
    try {
      if (!btn || btn.dataset.wired) return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', () => {
        try {
          if (typeof window.normalizeToStandard === 'function') window.normalizeToStandard();
          else if (typeof window.fallbackNormalize === 'function') window.fallbackNormalize();
        } catch {
          try {
            alert('Normalize error: ' + (e?.message || e));
          } catch {
            console.debug('alert failed', innerErr);
          }
        }
      });
    } catch {
      void e;
    }
  }
  try {
    __tpBootPush('after-wireNormalizeButton');
  } catch {}

  // Tiny toast utility (optional) for subtle pings
  // Incremental build only once; subsequent opens just sync values
  let _settingsBuilt = false;

  // Dynamic wiring helper must exist before buildSettingsContent uses it
  // (Removed duplicate wireSettingsDynamic definition; primary is declared near top.)

  function buildSettingsContent() {
    const body = document.getElementById('settingsBody');
    if (!body) return;
    // Idempotency guard: if cards already exist, treat as already-built and sync values.
    try {
      if (body.querySelector('.settings-card')) {
        _settingsBuilt = true;
        try { syncSettingsValues(); } catch {}
        try { setupSettingsTabs(); } catch {}
        return;
      }
    } catch {}
    if (_settingsBuilt) {
      if (!body.querySelector('.settings-card')) {
        _settingsBuilt = false;
      } else {
        syncSettingsValues();
        return;
      }
    }
    const getVal = (id, fallback = '') => {
      try {
        const el = document.getElementById(id);
        return el && 'value' in el && el.value !== undefined ? el.value : fallback;
      } catch {
        return fallback;
      }
    };
    const isChecked = (id) => {
      try {
        const el = document.getElementById(id);
        return !!el?.checked;
      } catch {
        return false;
      }
    };
    const speakersHidden = !!document.getElementById('speakersBody')?.classList.contains('hidden');

    const frag = document.createDocumentFragment();
    const card = (id, title, tab, innerHtml) => {
      const d = document.createElement('div');
      d.className = 'settings-card';
      d.dataset.tab = tab;
      d.id = id;
      d.innerHTML = `<h4>${title}</h4><div class="settings-card-body">${innerHtml}</div>`;
      return d;
    };
    frag.appendChild(
      card(
        'cardMic',
        'Microphone',
        'media',
        `
        <div class="settings-inline-row">
          <button id="settingsReqMic" class="btn-chip">Request mic</button>
          <select id="settingsMicSel" class="select-md"></select>
        </div>
        <div class="settings-small">Select input and grant permission for speech sync & dB meter.</div>`
      )
    );
    frag.appendChild(
      card(
        'cardCam',
        'Camera',
        'media',
        `
        <div class="settings-inline-row">
          <button id="settingsStartCam" class="btn-chip">Start</button>
          <button id="settingsStopCam" class="btn-chip">Stop</button>
          <select id="settingsCamSel" class="select-md"></select>
        </div>
        <div class="settings-inline-row">
          <label>Size <input id="settingsCamSize" type="number" min="15" max="60" value="${getVal('camSize', 28)}" style="width:70px"></label>
          <label>Opacity <input id="settingsCamOpacity" type="number" min="20" max="100" value="${getVal('camOpacity', 100)}" style="width:80px"></label>
          <label><input id="settingsCamMirror" type="checkbox" ${isChecked('camMirror') ? 'checked' : ''}/> Mirror</label>
        </div>
        <div class="settings-small">Camera overlay floats over the script.</div>`
      )
    );
    frag.appendChild(
      card(
        'cardSpeakers',
        'Speakers',
        'general',
        `
        <div class="settings-inline-row">
          <button id="settingsShowSpeakers" class="btn-chip">${speakersHidden ? 'Show' : 'Hide'} List</button>
          <button id="settingsNormalize" class="btn-chip">Normalize Script</button>
        </div>
        <div class="settings-small">Manage speaker tags & quick normalization.</div>`
      )
    );
    frag.appendChild(
      card(
        'cardRecording',
        'Recording',
        'recording',
        `
        <form id="obsSettingsForm" class="settings-inline-row" autocomplete="off" role="region" aria-labelledby="cardRecordingLabel">
          <h4 id="cardRecordingLabel" class="visually-hidden">Recording settings</h4>
          <label><input type="checkbox" id="settingsEnableObs" ${isChecked('enableObs') ? 'checked' : ''} aria-checked="${isChecked('enableObs') ? 'true' : 'false'}/> Enable OBS</label>
          <label style="margin-left:12px"><input type="checkbox" id="autoRecordToggle"/> Auto-record with Pre-Roll</label>
          <span id="obsConnStatus" class="chip" style="margin-left:8px" role="status" aria-live="polite" aria-atomic="true">OBS: unknown</span>
          <label style="margin-left:12px">Default scene <input id="settingsObsScene" type="text" class="select-md" placeholder="Scene name" value="${getVal('obsScene', '')}" style="width:160px" aria-label="Default OBS scene" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" enterkeyhint="done"></label>
          <label style="margin-left:6px"><input type="checkbox" id="settingsObsReconnect" ${isChecked('obsReconnect') ? 'checked' : ''} aria-checked="${isChecked('obsReconnect') ? 'true' : 'false'}/> Auto-reconnect</label>
          <input id="settingsObsUrl" class="obs-url" type="text" name="obsUrl" autocomplete="url" value="${getVal('obsUrl', 'ws://192.168.1.200:4455')}" placeholder="ws://host:port" aria-label="OBS websocket URL" />
          <input id="settingsObsPass" class="obs-pass" type="password" name="obsPassword" autocomplete="current-password" value="${getVal('obsPassword', '')}" placeholder="password" aria-label="OBS password" />
          <label style="margin-left:6px"><input type="checkbox" id="settingsObsRemember" ${isChecked('obsRemember') ? 'checked' : ''}/> Remember password</label>
          <button id="settingsObsTest" type="button" class="btn-chip" aria-label="Test OBS connection">Test</button>
          <button id="settingsObsSyncTest" type="button" class="btn-chip" style="margin-left:6px" aria-label="Sync and Test OBS">Sync & Test</button>
          <button id="settingsObsPoke" type="button" class="btn-chip" style="margin-left:6px" aria-label="Poke OBS">Poke</button>
        </form>
        <div id="settingsObsTestMsg" class="settings-small obs-test-msg" aria-live="polite" aria-atomic="true" style="margin-top:8px"></div>
  <div class="settings-small">Controls global recorder settings (mirrors panel options).</div>
  <div class="settings-small" style="margin-top:6px; font-size:0.9em; color:#444">Recommended OBS settings: set Recording Filename to <code>Anvil-{date}-{time}</code> (optionally include <code>{scene}</code> or <code>{profile}</code>), and set Container to <strong>mp4</strong> (or use <strong>mkv</strong> with auto-remux on stop for crash-safe recordings).</div>`
      )
    );
    frag.appendChild(
      card(
        'cardPLL',
        'Hybrid Lock (Auto + Speech)',
        'advanced',
        `
        <div class="settings-inline-row">
          <label><input type="checkbox" id="settingsHybridLock" ${isChecked('hybridLock') ? 'checked' : ''}/> Enable hybrid lock</label>
        </div>
        <div class="settings-inline-row">
          <label>Responsiveness <input id="settingsKp" type="number" min="0" max="0.1" step="0.001" value="${getVal('Kp', 0.022)}" style="width:80px"></label>
          <label>Stability <input id="settingsKd" type="number" min="0" max="0.01" step="0.0001" value="${getVal('Kd', 0.0025)}" style="width:80px"></label>
          <label>Max bias <input id="settingsMaxBiasPct" type="number" min="0" max="0.5" step="0.01" value="${getVal('maxBiasPct', 0.12)}" style="width:80px"></label>
        </div>
        <div class="settings-inline-row">
          <label>Min conf <input id="settingsConfMin" type="number" min="0" max="1" step="0.01" value="${getVal('confMin', 0.6)}" style="width:80px"></label>
          <label>Decay ms <input id="settingsDecayMs" type="number" min="100" max="5000" step="100" value="${getVal('decayMs', 550)}" style="width:80px"></label>
        </div>
        <div id="pllReadout" class="settings-small" style="font-family:monospace; margin-top:8px;">
          Lead/Lag: --px | Bias: --% | State: --
        </div>
        <div class="settings-small">Keeps steady auto-scroll and gently trims speed to your voice. If recognition drops, it coasts.</div>`
      )
    );
    try {
      body.appendChild(frag);
      wireSettingsDynamic();
      syncSettingsValues();
      setupSettingsTabs();
      if (body.querySelector('.settings-card')) _settingsBuilt = true;
    } catch {
      console.warn('Settings build failed, will retry', e);
      _settingsBuilt = false;
    }
  }
  try {
    __tpBootPush('after-buildSettingsContent-def');
  } catch {}

  function syncSettingsValues() {
    // Ensure OBS fields are hydrated from storage and persistence is wired before we mirror values
    try {
      hydrateObsFieldsFromStore();
    } catch {
      void e;
    }
    try {
      wireObsPersistence();
    } catch {
      void e;
    }
    // Mic devices now source-of-truth is settingsMicSel itself; nothing to sync.
    const micSel = document.getElementById('settingsMicSel');
    if (micSel && !micSel.options.length) {
      // If not yet populated, attempt populateDevices (async, fire and forget)
      try {
        populateDevices();
      } catch {}
    }
    const camSelS = document.getElementById('settingsCamSel');
    if (camSelS && camDeviceSel) {
      if (camSelS) {
        camSelS.addEventListener('change', async () => {
          try {
            if (typeof camDeviceSel !== 'undefined' && camDeviceSel)
              camDeviceSel.value = camSelS.value;
          } catch {}
          if (camVideo?.srcObject && camSelS.value) {
            try {
              await switchCamera(camSelS.value);
              _toast('Camera switched', { type: 'ok' });
            } catch {
              warn('Camera switch failed', e);
              _toast('Camera switch failed');
            }
          }
        });
      }
    }
    const showSpk = document.getElementById('settingsShowSpeakers');
    if (showSpk)
      showSpk.textContent = speakersBody?.classList.contains('hidden') ? 'Show List' : 'Hide List';
    // Mirror OBS fields from main panel to Settings overlay (query directly; avoid non-global vars)
    try {
      const obsEnable = document.getElementById('settingsEnableObs');
      const mainEnable = document.getElementById('enableObs');
      if (obsEnable && mainEnable) obsEnable.checked = !!mainEnable.checked;
    } catch {
      void e;
    }
    try {
      const autoRec = document.getElementById('autoRecordToggle');
      if (autoRec) {
        try {
          autoRec.checked = localStorage.getItem('tp_auto_record') === '1';
        } catch {
          void e;
        }
        autoRec.addEventListener('change', () => {
          try {
            localStorage.setItem('tp_auto_record', autoRec.checked ? '1' : '0');
            // refresh obs status when toggling
            try {
              window.refreshObsStatus && window.refreshObsStatus();
            } catch {}
          } catch {}
        });
      }
    } catch {}
    try {
      const obsUrlS = document.getElementById('settingsObsUrl');
      const mainUrl = document.getElementById('obsUrl');
      const obsPassS = document.getElementById('settingsObsPass');
      const mainPass = document.getElementById('obsPassword');
      // Only mirror non-empty -> empty, never empty -> non-empty
      try {
        if (obsUrlS && mainUrl && !obsUrlS.value && mainUrl.value) obsUrlS.value = mainUrl.value;
        if (mainUrl && obsUrlS && !mainUrl.value && obsUrlS.value) mainUrl.value = obsUrlS.value;
      } catch {}
      try {
        if (obsPassS && mainPass && !obsPassS.value && mainPass.value)
          obsPassS.value = mainPass.value;
        if (mainPass && obsPassS && !mainPass.value && obsPassS.value)
          mainPass.value = obsPassS.value;
      } catch {}
    } catch {}

    // restore the 'remember password' checkbox from persisted preference
    try {
      const rem = document.getElementById('settingsObsRemember');
      if (rem) {
        try {
          // Do not auto-set from storage while diagnosing auth issues; keep unchecked.
          rem.checked = false;
        } catch {
          void e;
        }
        // Keep "Remember password" inert for now; notify user when toggled.
        rem.addEventListener('change', () => {
          try {
            _toast && _toast('Remember password disabled for diagnostics', { type: 'info' });
          } catch {}
        });
      }
    } catch {}
  }
  try {
    __tpBootPush('after-syncSettingsValues-def');
  } catch {
    void e;
  }

  // Getter for auto-record preference
  window.getAutoRecordEnabled = function () {
    try {
      return localStorage.getItem('tp_auto_record') === '1';
    } catch {
      return false;
    }
  };

  // Getter for stored OBS password (if any). Use sparingly; storing passwords in localStorage is insecure.
  window.getObsPassword = function () {
    // For diagnostics, only consult the live DOM inputs; do not use persisted storage.
    try {
      const set = document.getElementById('settingsObsPass');
      if (set && set.value) return set.value;
    } catch {}
    try {
      const main = document.getElementById('obsPassword');
      if (main && main.value) return main.value;
    } catch {}
    return '';
  };

  function setupSettingsTabs() {
    const tabs = Array.from(document.querySelectorAll('#settingsTabs .settings-tab'));
    // Query cards from the DOM directly; do not rely on a non-global settingsBody variable
    const sb = document.getElementById('settingsBody');
    const cards = sb ? Array.from(sb.querySelectorAll('.settings-card')) : [];
    // Hide tabs with no cards lazily
    tabs.forEach((tab) => {
      const tabName = tab.dataset.tab;
      const hasCard = cards.some((c) => c.dataset.tab === tabName);
      if (!hasCard) tab.style.display = 'none';
    });

    // Animation helpers
    const ANIM_IN = 'anim-in';
    const ANIM_OUT = 'anim-out';
    function showCard(c) {
      if (c._visible) return; // already visible
      c._visible = true;
      c.style.display = 'flex';
      c.classList.remove(ANIM_OUT);
      // force reflow for animation restart
      void c.offsetWidth;
      c.classList.add(ANIM_IN);
      c.addEventListener(
        'animationend',
        (e) => {
          if (e.animationName === 'cardFadeIn') c.classList.remove(ANIM_IN);
        },
        { once: true }
      );
    }
    function hideCard(c) {
      if (!c._visible) return; // already hidden
      c._visible = false;
      c.classList.remove(ANIM_IN);
      c.classList.add(ANIM_OUT);
      c.addEventListener(
        'animationend',
        (e) => {
          if (e.animationName === 'cardFadeOut') {
            c.classList.remove(ANIM_OUT);
            c.style.display = 'none';
          }
        },
        { once: true }
      );
    }

    const apply = (name) => {
      const sel = name || 'general';
      // Preserve current scroll position so switching tabs doesn't jump the sheet
      const prevScroll = sb ? sb.scrollTop : 0;
      try {
        localStorage.setItem('tp_settings_tab', sel);
      } catch {}
      tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === sel));
      cards.forEach((c) => {
        const show = c.dataset.tab === sel;
        if (show) showCard(c);
        else hideCard(c);
      });
      // Restore scroll after layout/animation frame
      try {
        if (sb) requestAnimationFrame(() => {
          try { sb.scrollTop = prevScroll; } catch {}
        });
      } catch {}
    };
    tabs.forEach((t) => {
      t.addEventListener('click', (ev) => {
        try {
          apply(t.dataset.tab);
          // Blur the button to avoid focus-induced scrolling in some browsers
          try { ev.currentTarget && ev.currentTarget.blur && ev.currentTarget.blur(); } catch {}
        } catch {}
      });
    });
    let last = 'general';
    try {
      last = localStorage.getItem('tp_settings_tab') || 'general';
    } catch {}
    // Initialize visibility (no animation on first render)
    cards.forEach((c) => {
      c._visible = false;
      c.style.display = 'none';
    });
    apply(last);
  }
  try {
    __tpBootPush('after-setupSettingsTabs-def');
  } catch {}
  // (Removed stray recorder settings snippet accidentally injected here)
  // Kick self-checks if available (guard so we only run once)
  try {
    if (typeof runSelfChecks === 'function' && !window.__selfChecksRan) {
      window.__selfChecksRan = true;
      setTimeout(() => {
        try {
          runSelfChecks();
        } catch {
          void e;
        }
      }, 120);
    }
  } catch {}

  // NOTE: wireSettingsDynamic previously lived inside init(), making it inaccessible
  // to buildSettingsContent() (which resides at top scope) and causing a ReferenceError
  // when settings were first opened. We hoist it to top-level scope so the call inside
  // buildSettingsContent() succeeds. (See removal of inner duplicate later in init()).
  function wireSettingsDynamic() {
    // Mic
    const reqMicBtn = document.getElementById('settingsReqMic');
    const micSel = document.getElementById('settingsMicSel');
    if (micSel) {
      micSel.addEventListener('change', () => {
        try {
          localStorage.setItem(DEVICE_KEY, micSel.value);
        } catch {
          void e;
        }
      });
    }
    reqMicBtn?.addEventListener('click', async () => {
      try {
        if (typeof requestMic === 'function') {
          await requestMic();
          _toast('Mic requested', { type: 'ok' });
          return;
        }
      } catch {
        try { console.warn('requestMic() failed'); } catch {}
      }
      try {
        // Fallback to clicking main button if requestMic isn't available
        await micBtn?.click();
        _toast('Mic requested', { type: 'ok' });
      } catch {
        _toast('Mic request failed', { type: 'error' });
      }
    });
    // Camera
    const startCamS = document.getElementById('settingsStartCam');
    const stopCamS = document.getElementById('settingsStopCam');
    const camSelS = document.getElementById('settingsCamSel');
    const camSizeS = document.getElementById('settingsCamSize');
    const camOpacityS = document.getElementById('settingsCamOpacity');
    const camMirrorS = document.getElementById('settingsCamMirror');
    if (camSelS && camDeviceSel) {
      camSelS.addEventListener('change', async () => {
        camDeviceSel.value = camSelS.value;
        if (camVideo?.srcObject && camSelS.value) {
          try {
            await switchCamera(camSelS.value);
            _toast('Camera switched', { type: 'ok' });
          } catch {
            warn('Camera switch failed', e);
            _toast('Camera switch failed');
          }
        }
      });
    }
    startCamS?.addEventListener('click', () => {
      startCamBtn?.click();
      _toast('Camera starting…');
    });
    stopCamS?.addEventListener('click', () => {
      stopCamBtn?.click();
      _toast('Camera stopped', { type: 'ok' });
    });
    camSizeS?.addEventListener('change', () => {
      if (camSize) {
        camSize.value = camSizeS.value;
        camSize.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    camOpacityS?.addEventListener('change', () => {
      if (camOpacity) {
        camOpacity.value = camOpacityS.value;
        camOpacity.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    camMirrorS?.addEventListener('change', () => {
      if (camMirror) {
        camMirror.checked = camMirrorS.checked;
        camMirror.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    // Speakers
    const showSpk = document.getElementById('settingsShowSpeakers');
    showSpk?.addEventListener('click', () => {
      toggleSpeakersBtn?.click();
      buildSettingsContent();
    });
    document
      .getElementById('settingsNormalize')
      ?.addEventListener('click', () => normalizeTopBtn?.click());
    // Recording / OBS
    const obsForm = document.getElementById('obsSettingsForm');
    const obsEnable = document.getElementById('settingsEnableObs');
    const obsUrlS = document.getElementById('settingsObsUrl');
    const obsPassS = document.getElementById('settingsObsPass');
    const obsTestS = document.getElementById('settingsObsTest');
    // Prevent accidental submit/reload of settings form (Enter key)
    obsForm?.addEventListener('submit', (ev) => {
      ev.preventDefault();
    });
    // When Settings overlay toggles OBS, mirror to main toggle (query main DOM each time)
    obsEnable?.addEventListener('change', async () => {
      const mainEnable = document.getElementById('enableObs');
      if (mainEnable) {
        mainEnable.checked = !!obsEnable.checked;
        mainEnable.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }

      // If main toggle not present, update recorder settings directly
      try {
        if (__recorder?.getSettings && __recorder?.setSettings) {
          const s = __recorder.getSettings();
          let sel = (s.selected || []).filter((id) => id !== 'obs');
          if (obsEnable.checked) sel.push('obs');
          __recorder.setSettings({ selected: sel });
        }
        _toast(obsEnable.checked ? 'OBS: enabled' : 'OBS: disabled', { type: 'ok' });
      } catch {}
    });
    // Mirror URL
    obsUrlS?.addEventListener('change', () => {
      const mainUrl = document.getElementById('obsUrl');
      if (mainUrl && typeof obsUrlS.value === 'string') {
        mainUrl.value = obsUrlS.value;
        mainUrl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    // Mirror password
    obsPassS?.addEventListener('change', async () => {
      try {
        const mainPass = document.getElementById('obsPassword');
        if (mainPass && typeof obsPassS.value === 'string') {
          mainPass.value = obsPassS.value;
          mainPass.dispatchEvent(new Event('input', { bubbles: true }));
          mainPass.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch {
        void e;
      }

      // Do NOT persist OBS password to storage during diagnostics - use live DOM only.

      try {
        const recModule = await loadRecorder();
        const rec = recModule && typeof recModule.get === 'function' ? recModule.get('obs') : null;
        try {
          rec?.reconfigure?.();
        } catch {
          void e;
        }
      } catch {
        void e;
      }
    });
    // Proxy test button and surface result via toast
    obsTestS?.addEventListener('click', async () => {
      const mainTest = document.getElementById('obsTestBtn');
      if (mainTest) {
        mainTest.click();
        setTimeout(() => {
          const statusEl = document.getElementById('obsStatus');
          const txt = statusEl?.textContent || 'OBS test';
          _toast(txt, { type: (txt || '').toLowerCase().includes('ok') ? 'ok' : 'error' });
        }, 600);
        return;
      }

      // Fallback: lazy-load bridge or recorder adapter and run test
      try {
        saveObsConfig();
      } catch {}
      try {
        const bridge = await ensureObsBridge();
        if (bridge && typeof bridge.getRecordStatus === 'function') {
          try {
            await bridge.getRecordStatus();
            _toast('OBS: ok', { type: 'ok' });
            return;
          } catch {
            // continue to recorder fallback
          }
        }
      } catch {}
      try {
        const recModule = await loadRecorder();
        const rec = recModule && typeof recModule.get === 'function' ? recModule.get('obs') : null;
        if (!rec || typeof rec.test !== 'function') {
          _toast('OBS: adapter missing');
          return;
        }
        _toast('OBS: testing…');
        try {
          const ok = await rec.test();
          _toast(ok ? 'OBS: ok' : 'OBS: failed', { type: ok ? 'ok' : 'error' });
        } catch {
          _toast('OBS: failed', { type: 'error' });
        }
      } catch (e) {
        console.warn('[TP-Pro] settings obs test failed', e);
        _toast('OBS: failed');
      }
    });

    // One-click helper: sync Settings -> main and run the in-page OBS test helper
    const obsSyncTestS = document.getElementById('settingsObsSyncTest');
    obsSyncTestS?.addEventListener('click', async () => {
      try {
        const mainUrl = document.getElementById('obsUrl');
        const mainPass = document.getElementById('obsPassword');
        if (obsUrlS?.value && mainUrl) mainUrl.value = obsUrlS.value;
        if (obsPassS?.value && mainPass) mainPass.value = obsPassS.value;
        mainUrl?.dispatchEvent(new Event('change', { bubbles: true }));
        mainPass?.dispatchEvent(new Event('change', { bubbles: true }));
        try {
          // trigger recorder reconfigure if available
          const rec = await (window.__recorder && window.__recorder.get
            ? window.__recorder.get('obs')
            : null);
          try {
            rec?.reconfigure?.();
          } catch {}
        } catch {
          void e;
        }
        // Run the in-page test if provided
        try {
          if (typeof window.__tpRunObsTest === 'function') {
            await window.__tpRunObsTest();
          } else {
            // fallback: click existing test button if present
            document.getElementById('obsTestBtn')?.click();
          }
        } catch {
          console.warn('[TP-Pro] Sync & Test failed', e);
        }
      } catch {}
    });

    // Optional: mirror as you type so both fields stay in sync
    obsUrlS?.addEventListener('input', () => {
      const m = document.getElementById('obsUrl');
      if (m) m.value = obsUrlS.value;
    });
    obsPassS?.addEventListener('input', () => {
      const m = document.getElementById('obsPassword');
      if (m) m.value = obsPassS.value;
    });
    // PLL Controller
    const hybridLockS = document.getElementById('settingsHybridLock');
    const maxBiasPctS = document.getElementById('settingsMaxBiasPct');
    const kpS = document.getElementById('settingsKp');
    const kdS = document.getElementById('settingsKd');
    const confMinS = document.getElementById('settingsConfMin');
    const decayMsS = document.getElementById('settingsDecayMs');

    const updatePLLSettings = () => {
      try {
        PLL.tune({
          maxBias: parseFloat(maxBiasPctS?.value || 0.12),
          Kp: parseFloat(kpS?.value || 0.022),
          Kd: parseFloat(kdS?.value || 0.0025),
          confMin: parseFloat(confMinS?.value || 0.6),
          decayMs: parseFloat(decayMsS?.value || 550),
        });
      } catch {}
    };

    // Live PLL readout
    const updatePLLReadout = () => {
      const readout = document.getElementById('pllReadout');
      if (readout && isHybrid()) {
        const err = PLL.errF.toFixed(0);
        const bias = (PLL.biasPct * 100).toFixed(1);
        const state = PLL.state;
        readout.textContent = `Lead/Lag: ${err}px | Bias: ${bias}% | State: ${state}`;
      }
    };
    setInterval(() => {
      try {
        if (!window.__tp_has_script || !window.__tp_wd_armed) return;
        updatePLLReadout();
      } catch {}
    }, 200); // Update 5x per second

    hybridLockS?.addEventListener('change', () => {
      try {
        setHybrid(hybridLockS.checked);
      } catch {}
    });
    maxBiasPctS?.addEventListener('change', updatePLLSettings);
    kpS?.addEventListener('change', updatePLLSettings);
    kdS?.addEventListener('change', updatePLLSettings);
    confMinS?.addEventListener('change', updatePLLSettings);
    decayMsS?.addEventListener('change', updatePLLSettings);

    // Initialize PLL settings
    updatePLLSettings();
    // Initialize hybrid state
    setHybrid(localStorage.getItem('hybridLock') === '1');
  }

  // TP: normalize-fallback
  // Shared, safe fallback normalizer used when normalizeToStandard() is not provided
  function fallbackNormalize() {
    try {
      const ta = document.getElementById('editor');
      if (!ta) return;
      let txt = String(ta.value || '');
      // Normalize newlines & spaces; convert smart quotes; trim trailing spaces per-line
      txt = txt.replace(/\r\n?/g, '\n').replace(/ +\n/g, '\n').replace(/[’]/g, "'");
      // Ensure closing tags aren't accidentally uppercased/spaced
      txt = txt
        .replace(/\[\/\s*s1\s*\]/gi, '[/s1]')
        .replace(/\[\/\s*s2\s*\]/gi, '[/s2]')
        .replace(/\[\/\s*note\s*\]/gi, '[/note]');
      ta.value = txt;
      // Re-render via input event to keep everything in sync
      const ev = new Event('input');
      ta.dispatchEvent(ev);
      alert('Basic normalization applied.');
    } catch {
      alert('Normalize fallback failed: ' + (e && e.message));
    }
  }
  try {
    __tpBootPush('after-fallbackNormalize-def');
  } catch {
    void e;
  }

  // TP: normalize-strict
  // Strict normalizer (single source of truth)
  window.normalizeToStandard = function normalizeToStandard() {
    const ta = document.getElementById('editor');
    if (!ta) return;
    let txt = String(ta.value || '');

    // Canonicalize whitespace/quotes/case
    txt = txt
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[’]/g, "'")
      .replace(/\[\s*(s1|s2|note)\s*\]/gi, (_, x) => `[${x.toLowerCase()}]`)
      .replace(/\[\s*\/\s*(s1|s2|note)\s*\]/gi, (_, x) => `[/${x.toLowerCase()}]`);

    // Move inline notes out of speaker paragraphs
    txt = txt.replace(
      /\[(s1|s2)\]([\s\S]*?)\[note\]([\s\S]*?)\[\/note\]([\s\S]*?)\[\/\1\]/gi,
      (_, r, pre, note, post) =>
        `[note]${note.trim()}[/note]\n[${r}]${(pre + ' ' + post).trim()}[/${r}]`
    );

    // Ensure speaker/close tags are on their own lines
    txt = txt
      .replace(/\[(s1|s2)\]\s*(?=\S)/gi, (_, r) => `[${r}]\n`)
      .replace(/([^\n])\s*\[\/s(1|2)\](?=\s*$)/gim, (_, ch, sp) => `${ch}\n[/s${sp}]`);

    // Notes must be standalone blocks
    txt = txt.replace(/\n?(\[note\][\s\S]*?\[\/note\])\n?/gi, '\n$1\n');

    // Collapse excess blank lines
    txt = txt.replace(/\n{3,}/g, '\n\n').trim() + '\n';

    // Wrap untagged blocks with current (default s1); ensure missing closers
    const blocks = txt.split(/\n{2,}/);
    let current = 's1';
    const out = [];
    for (let b of blocks) {
      const first = b.match(/^\s*\[(s1|s2|note)\]/i)?.[1]?.toLowerCase();
      if (first === 'note') {
        out.push(b);
        continue;
      }
      if (first === 's1' || first === 's2') {
        current = first;
        if (!/\[\/s[12]\]/i.test(b)) b = b + `\n[/${current}]`;
        out.push(b);
      } else {
        // untagged → wrap under current speaker
        out.push(`[${current}]\n${b}\n[/${current}]`);
      }
    }
    ta.value = out.join('\n\n') + '\n';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof saveDraft === 'function') saveDraft();
    if (typeof setStatus === 'function') setStatus('Normalized to standard.');
  };
  try {
    __tpBootPush('after-normalizeToStandard-def');
  } catch {}

  // Validator (quick “am I standard?” check)
  function showCopyDialog(text, title = 'Validation Results') {
    if (window.__help?.showCopyDialog) return window.__help.showCopyDialog(text, title);
    // fallback: simple alert
    alert(String(title) + '\n\n' + String(text || ''));
  }

  // Global helper: show validation output in the Help overlay's panel with copy support
  window.showValidation = function showValidation(text) {
    if (window.__help?.showValidation) return window.__help.showValidation(text);
    return showCopyDialog(text, 'Validation');
  };

  window.validateStandardTags = function validateStandardTags(silent = false) {
    if (window.__help?.validateStandardTags) return window.__help.validateStandardTags(silent);
    const ta = document.getElementById('editor');
    const src = String(ta?.value || '');
    const lines = src.split(/\r?\n/);
    // Configurable tag set
    if (!window.validatorConfig)
      window.validatorConfig = { allowedTags: new Set(['s1', 's2', 'note']) };
    const allowed = window.validatorConfig.allowedTags;
    const speakerTags = new Set(['s1', 's2']);
    const stack = []; // {tag,line}
    let s1Blocks = 0,
      s2Blocks = 0,
      noteBlocks = 0;
    let unknownCount = 0;
    const issues = [];
    const issueObjs = [];
    function addIssue(line, msg, type = 'issue', detail) {
      issues.push(`line ${line}: ${msg}`);
      issueObjs.push({ line, message: msg, type, detail });
    }
    const tagRe = /\[(\/)?([a-z0-9]+)(?:=[^\]]+)?\]/gi;
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const lineNum = i + 1;
      let m;
      tagRe.lastIndex = 0;
      while ((m = tagRe.exec(rawLine))) {
        const closing = !!m[1];
        const nameRaw = m[2];
        const name = nameRaw.toLowerCase();
        if (!allowed.has(name)) {
          unknownCount++;
          addIssue(lineNum, `unsupported tag [${closing ? '\/' : ''}${nameRaw}]`, 'unsupported', {
            tag: name,
          });
          continue;
        }
        if (!closing) {
          if (name === 'note') {
            if (stack.length) {
              addIssue(
                lineNum,
                `[note] must not appear inside [${stack[stack.length - 1].tag}] (opened line ${stack[stack.length - 1].line})`,
                'nested-note',
                { parent: stack[stack.length - 1].tag }
              );
            }
            stack.push({ tag: name, line: lineNum });
          } else if (speakerTags.has(name)) {
            if (stack.length && speakerTags.has(stack[stack.length - 1].tag))
              addIssue(
                lineNum,
                `[${name}] opened before closing previous [${stack[stack.length - 1].tag}] (opened line ${stack[stack.length - 1].line})`,
                'nested-speaker',
                { prev: stack[stack.length - 1].tag, prevLine: stack[stack.length - 1].line }
              );
            stack.push({ tag: name, line: lineNum });
          } else {
            stack.push({ tag: name, line: lineNum });
          }
        } else {
          if (!stack.length) {
            addIssue(lineNum, `stray closing tag [\/${name}]`, 'stray-close', { tag: name });
            continue;
          }
          const top = stack[stack.length - 1];
          if (top.tag === name) {
            stack.pop();
            if (name === 's1') s1Blocks++;
            else if (name === 's2') s2Blocks++;
            else if (name === 'note') noteBlocks++;
          } else {
            addIssue(
              lineNum,
              `mismatched closing [\/${name}] – expected [\/${top.tag}] for opening on line ${top.line}`,
              'mismatch',
              { expected: top.tag, openLine: top.line, found: name }
            );
            let poppedAny = false;
            while (stack.length && stack[stack.length - 1].tag !== name) {
              stack.pop();
              poppedAny = true;
            }
            if (stack.length && stack[stack.length - 1].tag === name) {
              const opener = stack.pop();
              if (name === 's1') s1Blocks++;
              else if (name === 's2') s2Blocks++;
              else if (name === 'note') noteBlocks++;
              if (poppedAny)
                addIssue(
                  lineNum,
                  `auto-recovered by closing [\/${name}] (opened line ${opener.line}) after mismatches`,
                  'auto-recover',
                  { tag: name, openLine: opener.line }
                );
            } else
              addIssue(lineNum, `no matching open tag for [\/${name}]`, 'no-match', { tag: name });
          }
        }
      }
    }
    for (const open of stack)
      addIssue(open.line, `unclosed [${open.tag}] opened here`, 'unclosed', { tag: open.tag });
    const summaryParts = [
      `s1 blocks: ${s1Blocks}`,
      `s2 blocks: ${s2Blocks}`,
      `notes: ${noteBlocks}`,
    ];
    if (unknownCount) summaryParts.push(`unsupported tags: ${unknownCount}`);
    // Quick fixes
    const fixes = [];
    for (const iss of issueObjs) {
      if (iss.type === 'unclosed' && /(s1|s2)/i.test(iss.message)) {
        const tag = iss.message.match(/\[(s1|s2)\]/i)?.[1];
        if (tag)
          fixes.push({
            type: 'append-close',
            tag,
            label: `Append closing [\/${tag}] at end`,
            apply: (text) => text + (text.endsWith('\n') ? '' : '\n') + `[\/${tag}]\n`,
          });
      } else if (iss.type === 'stray-close') {
        fixes.push({
          type: 'remove-line',
          line: iss.line,
          label: `Remove stray closing tag on line ${iss.line}`,
          apply: (text) =>
            text
              .split(/\r?\n/)
              .filter((_, i) => i !== iss.line - 1)
              .join('\n'),
        });
      } else if (iss.type === 'mismatch') {
        const found = iss.message.match(/mismatched closing \[\/(\w+)\]/i)?.[1];
        const expected = iss.message.match(/expected \[\/(\w+)\]/i)?.[1];
        if (found && expected && found !== expected)
          fixes.push({
            type: 'replace-tag',
            line: iss.line,
            from: found,
            to: expected,
            label: `Replace [\/${found}] with [\/${expected}] on line ${iss.line}`,
            apply: (text) => {
              const arr = text.split(/\r?\n/);
              const ln = arr[iss.line - 1];
              if (ln)
                arr[iss.line - 1] = ln.replace(
                  new RegExp(`\[\/${found}\]`, 'i'),
                  `[\/${expected}]`
                );
              return arr.join('\n');
            },
          });
      }
    }
    let msg = !issues.length
      ? `No issues found. (${summaryParts.join(', ')})`
      : `Validation issues (${issues.length}):\n- ${issues.join('\n- ')}\n\nSummary: ${summaryParts.join(', ')}`;
    window.__lastValidation = { issues: issueObjs, summary: summaryParts, fixes };
    // Inline highlighting
    try {
      const existing = document.getElementById('validatorLineOverlay');
      if (existing) existing.remove();
      if (issueObjs.length && ta) {
        const overlay = document.createElement('div');
        overlay.id = 'validatorLineOverlay';
        overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;font:inherit;';
        // Positioning container wrapper if not already relative
        const wrap = ta.parentElement;
        if (wrap && getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
        // Map: line -> severity color
        const colors = {
          unclosed: '#d33',
          mismatch: '#d33',
          'nested-speaker': '#d33',
          'nested-note': '#d33',
          'stray-close': '#d55',
          unsupported: '#b46',
          'auto-recover': '#c80',
          'no-match': '#d33',
          issue: '#c30',
        };
        const badLines = new Set(issueObjs.map((i) => i.line));
        // Build spans aligned via line height approximation
        const style = getComputedStyle(ta);
        const lh = parseFloat(style.lineHeight) || 16;
        const _padTop = ta.scrollTop; // will adjust on scroll
        function rebuild() {
          try {
            overlay.innerHTML = '';
            const scrollTop = ta.scrollTop;
            const firstVisible = Math.floor(scrollTop / lh) - 1;
            const linesVisible = Math.ceil(ta.clientHeight / lh) + 2;
            for (let i = 0; i < linesVisible; i++) {
              const lineIdx = firstVisible + i;
              if (lineIdx < 0) continue;
              const lineNumber = lineIdx + 1;
              if (!badLines.has(lineNumber)) continue;
              const issue = issueObjs.find((o) => o.line === lineNumber);
              const bar = document.createElement('div');
              bar.title = issue.message;
              bar.style.cssText = `position:absolute;left:0;right:0;top:${lineIdx * lh}px;height:${lh}px;background:linear-gradient(90deg,${colors[issue.type] || '#c30'}22,transparent 80%);pointer-events:none;`;
              overlay.appendChild(bar);
            }
          } catch {}
        }
        rebuild();
        ta.addEventListener('scroll', rebuild, { passive: true });
        wrap.appendChild(overlay);
      }
    } catch {
      void e;
    }

    // Return the textual report for callers (e.g., Help overlay validate button)
    return msg;
    // Expose a live getter/setter for Help → Advanced to toggle at runtime
  }; // <-- end validateStandardTags

  // Expose a live getter/setter for Help → Advanced to toggle at runtime (top-level)
  try {
    Object.defineProperty(window, 'recAutoRestart', {
      configurable: true,
      get() {
        return recAutoRestart;
      },
      set(v) {
        recAutoRestart = !!v;
        try {
          localStorage.setItem('tp_rec_autorestart_v1', recAutoRestart ? '1' : '0');
        } catch {
          void e;
        }
      },
    });
  } catch {}
  try {
    __tpBootPush('after-validateStandardTags-def');
  } catch {}
  let recBackoffMs = 300; // grows on repeated failures
  const _MATCH_WINDOW = 6; // how far ahead we’ll look for the next word
  // Safe placeholders for optional modules to prevent ReferenceError when dynamic import fails
  let __scrollHelpers = null; // set after scroll-helpers.js loads
  let __anchorObs = null; // set after io-anchor.js loads
  let __scrollCtl = null; // set after scroll-control.js loads
  // Small helper: add version/cache-buster if provided by the host (kept local)
  const addV = (p) => (window.__TP_ADDV ? window.__TP_ADDV(p) : p);
  // Recorder lazy loader
  let __rec = null;
  async function loadRecorder() {
    if (__rec) return __rec;
    try {
      const addV = window.__TP_ADDV || ((p) => p);
      const m = await import(addV('./recorders.js'));
      try {
        const modKeys = m && typeof m === 'object' ? Object.keys(m) : [];
        const defaultKeys = m && m.default && typeof m.default === 'object' ? Object.keys(m.default) : [];
        console.debug('[TP-Pro] recorder module keys:', modKeys.length, modKeys, defaultKeys.length, defaultKeys);
      } catch {
        try { console.debug('[TP-Pro] recorder module keys: <uninspectable module>'); } catch {}
      }
      __rec = m;
      if (!__rec || typeof __rec.init !== 'function') {
        console.warn('[TP-Pro] recorders.js loaded but no init() export found');
      }
      return __rec;
    } catch (e) {
      console.error('[TP-Pro] Failed to import recorders.js', e);
      return null;
    }
  }

  // Lazy-load the OBS bridge module on-demand. Returns window.__obsBridge when available.
  let __obsBridgeLoaded = null;
  async function ensureObsBridge() {
    try {
      if (typeof window !== 'undefined' && window.__obsBridge) return window.__obsBridge;
      if (__obsBridgeLoaded) return __obsBridgeLoaded;
      const path = addV('./adapters/obsBridge.js');
      await import(path);
      __obsBridgeLoaded = typeof window !== 'undefined' ? window.__obsBridge || null : null;
      return __obsBridgeLoaded;
    } catch (err) {
      try { console.warn('[TP-Pro] ensureObsBridge failed', err); } catch {}
      return null;
    }
  }

  // Note: camera recorder is lazy-loaded via loadRecorder(); DOCX/mammoth is handled by
  // ui/upload.js and exposed via window.ensureMammoth/_ensureMammoth later in this file.
  // ==================================================
  // OBS adapter helper: ensure adapter availability + wrapper
  // ==================================================
  let __obsAdapterWrapper = null;
  async function ensureObsAdapter({ timeoutMs = 5000, pollInterval = 200 } = {}) {
    try {
      if (__obsAdapterWrapper) return __obsAdapterWrapper;
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try {
          const reg = await loadRecorder();
          if (reg && typeof reg.get === 'function') {
            const a = reg.get('obs');
            if (a) {
              // Wrap once and return
              __obsAdapterWrapper = wrapObsAdapter(a);
              return __obsAdapterWrapper;
            }
          }
        } catch {
          void e;
        }
        // brief pause
        await new Promise((res) => setTimeout(res, pollInterval));
      }
      return null;
    } catch {
      void e;
      return null;
    }
  }

  function appendObsLogLine(msg) {
    try {
      console.debug('[OBS-DBG]', msg);
      let el = document.getElementById('obsAdapterLog');
      if (!el) {
        el = document.createElement('div');
        el.id = 'obsAdapterLog';
        el.style.cssText =
          'position:fixed;right:8px;bottom:8px;max-width:320px;max-height:200px;overflow:auto;background:rgba(0,0,0,0.6);color:#fff;font-size:12px;padding:6px;border-radius:6px;z-index:99999';
        try {
          document.body.appendChild(el);
        } catch {
          void e;
        }
      }
      const line = document.createElement('div');
      line.textContent = `${new Date().toLocaleTimeString()} ${msg}`;
      el.appendChild(line);
      // Trim to last 40 lines
      while (el.childNodes.length > 40) el.removeChild(el.firstChild);
    } catch {
      void e;
    }
  }

  function wrapObsAdapter(adapter) {
    try {
      if (!adapter || adapter.__wrapped) return adapter;
      const methods = [
        'connect',
        'disconnect',
        'test',
        'isAvailable',
        'setEnabled',
        'reconfigure',
        'configure',
      ];
      for (const m of methods) {
        try {
          if (typeof adapter[m] === 'function') {
            const orig = adapter[m].bind(adapter);
            adapter[`__orig_${m}`] = orig;
            adapter[m] = async function (...args) {
              try {
                appendObsLogLine(
                  `adapter.${m}(${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(',')})`
                );
              } catch {
                void e;
              }
              try {
                const res = await orig(...args);
                try {
                  appendObsLogLine(`adapter.${m} -> ok`);
                } catch {
                  void e;
                }
                return res;
              } catch {
                try {
                  appendObsLogLine(
                    `adapter.${m} -> error ${err && err.message ? err.message : String(err)}`
                  );
                } catch {
                  void e;
                }
                throw err;
              }
            };
          }
        } catch {
          void e;
        }
      }
      try {
        adapter.__wrapped = true;
      } catch {
        void e;
      }
      appendObsLogLine('adapter wrapped');
      return adapter;
    } catch {
      void e;
      return adapter;
    }
  }
  // Dynamic threshold tracking
  let lastAnchorConfidence = 0;
  let lastAnchorAt = 0;
  let viterbiConsistencyCount = 0;
  let lastViterbiIdx = -1;
  // Mic selector single source of truth (settings overlay)
  const getMicSel = () => document.getElementById('settingsMicSel');
  let autoTimer = null,
    chrono = null,
    chronoStart = 0;
  let scriptWords = [],
    paraIndex = [],
    currentIndex = 0;
  window.currentIndex = currentIndex;
  // Paragraph token stats for rarity gating (computed on render)
  let __paraTokens = []; // Array<Array<string>> per paragraph
  let __dfMap = new Map(); // token -> in how many paragraphs it appears
  let __dfN = 0; // number of paragraphs
  function __idf(t) {
    try {
      return Math.log(1 + (__dfN || 1) / (__dfMap.get(t) || 0 || 1));
    } catch {
      return 0;
    }
  }
  // Duplicate-line disambiguation
  let __lineFreq = new Map(); // original paragraph line frequencies (by key)
  // Virtual lines (merge short runts so matcher scores over real phrases)
  let __vParaIndex = []; // merged paragraph index
  let __vLineFreq = new Map(); // virtual line frequencies (by merged key)
  let __vSigCount = new Map(); // prefix signature counts (first 4 tokens) for virtual lines
  let __ngramIndex = new Map(); // ngram -> Set of paragraph indices
  // Hybrid lock state
  let HYBRID_ON = false; // in-mem truth
  function setHybrid(on) {
    HYBRID_ON = !!on;
    localStorage.setItem('hybridLock', on ? '1' : '0');
    // Only here do we wire speed biasing:
    // e.g., ScrollIntegrator.setBiasSupplier(on ? () => PLL.biasPct : null);
  }
  function isHybrid() {
    return HYBRID_ON;
  }
  // Auto-nudge gating for soft-advance
  let autoBumpUntil = 0;
  function onUserAutoNudge() {
    autoBumpUntil = performance.now() + 800;
  }
  // Speech sync state machine
  let mode = 'OFF'; // OFF | AUTO_ONLY | HYBRID
  let driver = 'auto'; // auto | speech

  // Restore persisted state
  try {
    const savedMode = localStorage.getItem('teleprompter_mode');
    const savedDriver = localStorage.getItem('teleprompter_driver');
    if (savedMode && ['OFF', 'AUTO_ONLY', 'HYBRID'].includes(savedMode)) {
      mode = savedMode;
    }
    if (savedDriver && ['auto', 'speech'].includes(savedDriver)) {
      driver = savedDriver;
    }
  } catch {}

  // Restore UI state on load
  document.addEventListener('DOMContentLoaded', () => {
    try {
      if (mode === 'HYBRID') {
        document.body.classList.add('listening');
        recChip.textContent = 'Speech: listening…';
        recBtn.textContent = 'Stop speech sync';
        recBtn.classList.remove('btn-start');
        recBtn.classList.add('btn-primary', 'btn-stop');
        recBtn.title = 'Stop speech sync';
      } else if (mode === 'AUTO_ONLY') {
        document.body.classList.remove('listening');
        recChip.textContent = 'Speech: unavailable';
        recBtn.textContent = 'Start speech sync';
        recBtn.classList.remove('btn-stop');
        recBtn.classList.add('btn-primary', 'btn-start');
        recBtn.title = 'Start speech sync';
      } else {
        // OFF
        document.body.classList.remove('listening');
        recChip.textContent = 'Speech: idle';
        recBtn.textContent = 'Start speech sync';
        recBtn.classList.remove('btn-stop');
        recBtn.classList.add('btn-primary', 'btn-start');
        recBtn.title = 'Start speech sync';
      }
    } catch {}
  });

  function normLineKey(text) {
    // Build line keys from fully normalized tokens to ensure duplicate detection
    // matches what the matcher “hears” (contractions, unicode punctuation, numerals → words, etc.)
    try {
      const toks = normTokens(text || '');
      return toks.join(' ');
    } catch {
      return '';
    }
  }
  // Lost-mode state
  let __tpLost = false;
  let __tpLowSimCount = 0;
  const __STOP = new Set([
    'the',
    'and',
    'a',
    'an',
    'to',
    'of',
    'in',
    'on',
    'for',
    'with',
    'as',
    'at',
    'by',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'or',
    'but',
    'if',
    'then',
    'that',
    'this',
    'these',
    'those',
    'you',
    'your',
    'yours',
    'we',
    'our',
    'ours',
    'they',
    'their',
    'them',
    'it',
    'its',
    'he',
    'she',
    'his',
    'her',
    'hers',
    'do',
    'did',
    'does',
    'done',
    'have',
    'has',
    'had',
  ]);
  // Junk-anchor set: tokens that should not drive medium/long jumps on their own
  const __JUNK = new Set([
    'so',
    'and',
    'but',
    'the',
    'a',
    'an',
    'to',
    'of',
    'in',
    'on',
    'for',
    'with',
    'or',
    'is',
    'are',
  ]);
  function extractHighIDFPhrases(tokens, n = 3, topK = 10) {
    const out = [];
    if (!Array.isArray(tokens) || tokens.length < n) return out;
    for (let i = 0; i <= tokens.length - n; i++) {
      const gram = tokens.slice(i, i + n);
      if (gram.some((t) => __STOP.has(t))) continue; // never on a stop-word
      const rarity = gram.reduce((s, t) => s + __idf(t), 0);
      out.push({ gram, rarity });
    }
    out.sort((a, b) => b.rarity - a.rarity);
    return out.slice(0, topK);
  }
  function searchBand(anchors, startIdx, endIdx, spoken) {
    const hits = [];
    if (!anchors?.length) return hits;
    const n = anchors[0]?.gram?.length || 3;
    const s = Math.max(0, startIdx | 0),
      e = Math.min(scriptWords.length, endIdx | 0);
    for (let i = s; i <= e - n; i++) {
      const win = scriptWords.slice(i, i + n);
      for (const a of anchors) {
        let match = true;
        for (let k = 0; k < n; k++) {
          if (win[k] !== a.gram[k]) {
            match = false;
            break;
          }
        }
        if (match) {
          // Compute an overall score using the full spoken window similarity
          const windowTokens = normTokens(scriptWords.slice(i, i + spoken.length).join(' '));
          const sim = _sim(spoken, windowTokens);
          const score = sim; // rarity was used to gate anchors; keep sim as score
          hits.push({ idx: i, score });
          break;
        }
      }
    }
    return hits;
  }
  // Anchor search band helper: return surrounding token radius depending on PLL state
  function getAnchorBand() {
    try {
      const LOST = PLL.state === 'LOST' || __tpLost;
      const LOCKED = PLL.state === 'LOCKED' || false;
      if (LOST) return 300;
      if (LOCKED) return 200;
      return 50;
    } catch {
      return 50;
    }
  }
  // Helper: compute in-vocab token ratio for spoken overlap gating
  function inVocabRatio(tokens, vocabSet) {
    try {
      if (!Array.isArray(tokens) || tokens.length === 0) return 0;
      let n = 0;
      for (const t of tokens) if (vocabSet.has(t)) n++;
      return n / tokens.length;
    } catch {
      return 0;
    }
  }

  const COMMAND_TOKENS = new Set(['scroll', 'ok', 'okay', 'test', 'testing', 'uh', 'um', 'you', 'need', 'to']);
  function looksLikeCommand(tokens) {
    try {
      if (!Array.isArray(tokens) || tokens.length === 0) return false;
      let c = 0;
      for (const t of tokens) if (COMMAND_TOKENS.has(t)) c++;
      return c / Math.max(1, tokens.length) > 0.4;
    } catch {
      return false;
    }
  }
  // Hard-bound current line tracking
  let currentEl = null; // currently active <p> element
  let lineEls = []; // array of <p> elements in script order
  // Recording / speech state flags
  let recActive = false; // true when speech recognition session is active
  // Central gate so toggling Speech Sync truly quiets aligner and scroller
  let speechOn = false;
  // Display window handle
  let displayWin = null; // popup window reference for mirrored display
  let shortcutsBtn, shortcutsOverlay, shortcutsClose;

  const ROLE_KEYS = ['s1', 's2', 'g1', 'g2'];
  const ROLES_KEY = 'tp_roles_v2';
  const ROLE_DEFAULTS = {
    s1: { name: 'Speaker 1', color: '#60a5fa' },
    s2: { name: 'Speaker 2', color: '#facc15' },
    g1: { name: 'Guest 1', color: '#34d399' },
    g2: { name: 'Guest 2', color: '#f472b6' },
  };
  let ROLES = loadRoles();
  // Broadcast channel to keep display colors in sync with Settings
  let bc = null;
  try {
    bc = new BroadcastChannel('prompter');
  } catch {}
  function applyRoleCssVars() {
    try {
      const r = document.documentElement;
      if (ROLES?.s1?.color) r.style.setProperty('--s1-color', ROLES.s1.color);
      if (ROLES?.s2?.color) r.style.setProperty('--s2-color', ROLES.s2.color);
    } catch {}
  }
  function broadcastSpeakerColors() {
    try {
      bc && bc.postMessage({ type: 'SPEAKER_COLORS', s1: ROLES?.s1?.color, s2: ROLES?.s2?.color });
    } catch {}
  }
  function broadcastSpeakerNames() {
    try {
      bc &&
        bc.postMessage({ type: 'SPEAKER_NAMES', s1Name: ROLES?.s1?.name, s2Name: ROLES?.s2?.name });
    } catch {}
  }

  // DOM (late‑bound during init)
  let editor,
    scriptEl,
    viewer,
    legendEl,
    permChip,
    displayChip,
    recChip,
    scrollChip,
    camRtcChip,
    debugPosChip,
    openDisplayBtn,
    closeDisplayBtn,
    presentBtn,
    micBtn,
    recBtn,
    refreshDevicesBtn,
    fontSizeInput,
    lineHeightInput,
    autoToggle,
    autoSpeed,
    timerEl,
    resetBtn,
    loadSample,
    clearText,
    _saveLocalBtn,
    _loadLocalBtn,
    _downloadFileBtn,
    _uploadFileBtn,
    _uploadFileInput,
    wrapBold,
    wrapItalic,
    wrapUnderline,
    wrapNote,
    wrapColor,
    wrapBg,
    autoTagBtn,
    nameS1,
    colorS1,
    wrapS1,
    nameS2,
    colorS2,
    wrapS2,
    nameG1,
    colorG1,
    wrapG1,
    nameG2,
    colorG2,
    wrapG2,
    camWrap,
    camVideo,
    startCamBtn,
    stopCamBtn,
    camDeviceSel,
    camSize,
    camOpacity,
    camMirror,
    camPiP,
    prerollInput,
    countOverlay,
    countNum,
    dbMeterTop,
    toggleSpeakersBtn,
    speakersBody;

  // TP: meter-audio
  // ───────────────────────────────────────────────────────────────
  // dB meter utilities (single source of truth: top bar only)
  // ───────────────────────────────────────────────────────────────
  function buildDbBars(target) {
    if (!target) return [];
    target.classList.add('db-bars');
    // If already has bars, reuse
    let bars = Array.from(target.querySelectorAll('.bar'));
    if (bars.length >= 16) return bars;
    target.innerHTML = '';
    const total = 20;
    for (let i = 0; i < total; i++) {
      const b = document.createElement('div');
      b.className = 'bar';
      const ratio = i / (total - 1); // 0 (left) -> 1 (right)
      // Interpolate hue 120 (green) -> 0 (red)
      const hue = 120 - 120 * ratio;
      const sat = 70; // percent
      const light = 30 + ratio * 25; // brighten a bit toward red end
      b.style.setProperty('--bar-color', `hsl(${hue}deg ${sat}% ${light}%)`);
      target.appendChild(b);
    }
    // Peak marker
    const peak = document.createElement('div');
    peak.className = 'peak-marker';
    peak.style.transform = 'translateX(0)';
    target.appendChild(peak);
    // Scale ticks (every 5 bars) – positioned absolutely
    const ticks = document.createElement('div');
    ticks.style.cssText =
      'position:absolute;inset:0;pointer-events:none;font:8px/1 ui-monospace,monospace;color:#fff5;display:flex;';
    for (let i = 0; i < 20; i++) {
      if (i % 5 === 0) {
        const t = document.createElement('div');
        t.style.cssText = 'flex:1;position:relative;';
        const line = document.createElement('div');
        line.style.cssText =
          'position:absolute;top:0;bottom:0;left:0;width:1px;background:#ffffff22';
        const lbl = document.createElement('div');
        lbl.textContent = (i === 0 ? '-∞' : `-${20 - i}dB`).replace('--', '-');
        lbl.style.cssText =
          'position:absolute;bottom:100%;left:0;transform:translate(-2px,-2px);white-space:nowrap;';
        t.appendChild(line);
        t.appendChild(lbl);
        ticks.appendChild(t);
      } else {
        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        ticks.appendChild(spacer);
      }
    }
    target.appendChild(ticks);
    return Array.from(target.querySelectorAll('.bar'));
  }

  function clearBars(el) {
    if (!el) return;
    el.querySelectorAll('.bar.on').forEach((b) => b.classList.remove('on'));
  }

  function _stopDbMeter() {
    if (dbAnim) cancelAnimationFrame(dbAnim);
    dbAnim = null;
    try {
      if (audioStream) audioStream.getTracks().forEach((t) => t.stop());
    } catch {}
    audioStream = null;
    analyser = null;
    try {
      clearBars(dbMeterTop);
    } catch {}
  }

  async function startDbMeter(stream) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      warn('AudioContext unavailable');
      return;
    }
    const ctx = new AC();
    audioCtx = ctx; // retain for suspend/resume when tab visibility changes
    try {
      if (typeof ctx.resume === 'function' && ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {}
      }
    } catch {}
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const topBars = buildDbBars(dbMeterTop);
    const peakEl = dbMeterTop?.querySelector('.peak-marker');
    peakHold.value = 0;
    peakHold.lastUpdate = performance.now();
    // Log scaling configuration
    const dBFloor = -60; // anything quieter treated as silence
    const attack = 0.55; // 0..1 (higher = faster rise)
    const release = 0.15; // 0..1 (higher = faster fall)
    let levelSmooth = 0; // smoothed 0..1 level after log mapping
    const draw = () => {
      // If analyser was torn down (e.g., mic released), stop the loop gracefully
      if (!analyser || !data) {
        dbAnim = null;
        return;
      }
      analyser.getByteFrequencyData(data);
      // Root-mean-square amplitude 0..1
      const rms = Math.sqrt(data.reduce((a, b) => a + b * b, 0) / data.length) / 255;
      // Convert to approximate dBFS
      const dbfs = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
      // Clamp & normalize to 0..1 based on floor
      const dB = dbfs === -Infinity ? dBFloor : Math.max(dBFloor, Math.min(0, dbfs));
      let level = (dB - dBFloor) / (0 - dBFloor); // linear 0..1 after log compress
      if (!isFinite(level) || level < 0) level = 0;
      else if (level > 1) level = 1;
      // Smooth (different attack/release)
      if (level > levelSmooth) levelSmooth = levelSmooth + (level - levelSmooth) * attack;
      else levelSmooth = levelSmooth + (level - levelSmooth) * release;
      const bars = Math.max(0, Math.min(topBars.length, Math.round(levelSmooth * topBars.length)));
      for (let i = 0; i < topBars.length; i++) topBars[i].classList.toggle('on', i < bars);
      // Peak hold: keep highest bar for a short decay
      const now = performance.now();
      if (bars > peakHold.value) {
        peakHold.value = bars;
        peakHold.lastUpdate = now;
      } else if (now - peakHold.lastUpdate > 350) {
        // start decay after hold period
        peakHold.value = Math.max(
          0,
          peakHold.value - peakHold.decay * ((now - peakHold.lastUpdate) / 16)
        );
      }
      const peakIndex = Math.max(0, Math.min(topBars.length - 1, Math.floor(peakHold.value - 1)));
      if (peakEl) {
        const bar = topBars[peakIndex];
        if (bar) {
          const x = bar.offsetLeft;
          peakEl.style.transform = `translateX(${x}px)`;
          peakEl.style.opacity = peakHold.value > 0 ? '.9' : '0';
          // Color shift based on level percentage
          const pct = levelSmooth; // use smoothed 0..1 level for color classification
          let color = '#2eff7d'; // green
          if (pct > 0.85) color = '#ff3131';
          else if (pct > 0.65) color = '#ffb347';
          peakEl.style.backgroundColor = color;
          peakEl.style.boxShadow = `0 0 4px ${color}aa`;
        }
        // Tooltip stats (rounded)
        peakEl.title = `Approx RMS: ${(rms * 100).toFixed(0)}%\nApprox dBFS: ${dbfs === -Infinity ? '–∞' : dbfs.toFixed(1)} dB`;
      }
  // Guard dB meter animation: skip when no script or watchdog unarmed
  try { if (!window.__tp_has_script || !window.__tp_wd_armed) return; } catch {}
  dbAnim = requestAnimationFrame(draw);
    };
    draw();
  }

  async function requestMic() {
    try {
      const chosenId = getMicSel()?.value || undefined;
      const constraints = { audio: { deviceId: chosenId ? { exact: chosenId } : undefined } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      audioStream = stream;
      try {
        permChip && (permChip.textContent = 'Mic: allowed');
      } catch {
        void e;
      }
      startDbMeter(stream);
      // Persist chosen device
      try {
        if (chosenId) localStorage.setItem(DEVICE_KEY, chosenId);
      } catch {
        void e;
      }
    } catch {
      warn('Mic denied or failed', e);
      try {
        permChip && (permChip.textContent = 'Mic: denied');
      } catch {
        void e2;
      }
    }
  }

  function _releaseMic() {
    try {
      if (audioStream) {
        audioStream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
      }
    } catch {
      void e;
    }
    audioStream = null;
    try {
      permChip && (permChip.textContent = 'Mic: released');
    } catch {}
    try {
      _stopDbMeter();
    } catch {}
  }

  async function populateDevices() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devs = await navigator.mediaDevices.enumerateDevices();
      const aud = devs.filter((d) => d.kind === 'audioinput');
      const cams = devs.filter((d) => d.kind === 'videoinput');

      // Populate only the active settings mic selector; leave hidden legacy stub inert
      const micSelB = document.getElementById('settingsMicSel');
      if (micSelB) {
        try {
          const cur = micSelB.value;
          micSelB.innerHTML = '';
          aud.forEach((d) => {
            const o = document.createElement('option');
            o.value = d.deviceId;
            o.textContent = d.label || 'Microphone';
            micSelB.appendChild(o);
          });
          if (cur && Array.from(micSelB.options).some((o) => o.value === cur)) micSelB.value = cur;
        } catch {
          void e;
        }
      }

      const camSelA = typeof camDeviceSel !== 'undefined' ? camDeviceSel : null;
      const camSelB = document.getElementById('settingsCamSel');
      [camSelA, camSelB].filter(Boolean).forEach((sel) => {
        try {
          const cur = sel.value;
          sel.innerHTML = '';
          cams.forEach((d) => {
            const o = document.createElement('option');
            o.value = d.deviceId;
            o.textContent = d.label || 'Camera';
            sel.appendChild(o);
          });
          if (cur && Array.from(sel.options).some((o) => o.value === cur)) sel.value = cur;
        } catch {}
      });
      // Auto-select preferred camera (OBS Virtual Camera if present)
      try {
        function choosePreferredCamId(list) {
          const obs = list.find((d) => /obs.*virtual.*camera/i.test(d.label));
          if (obs) return obs.deviceId;
          const hw = list.find((d) => d.label && !/droidcam|iriun|camo|epoccam/i.test(d.label));
          if (hw) return hw.deviceId;
          return list[0]?.deviceId || null;
        }
        const prefer = choosePreferredCamId(cams);
        const sel = document.getElementById('settingsCamSel');
        if (prefer && sel && Array.from(sel.options).some((o) => o.value === prefer)) {
          sel.value = prefer;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch {
        void e;
      }
    } catch {
      /* ignore */
    }
  }

  // Hydrate OBS fields from persistent store (do this early, before settings sync)
  function hydrateObsFieldsFromStore() {
    try {
      const loadObsCreds = function () {
        try {
          const url = localStorage.getItem('tp_obs_url') || '';
          const pass =
            sessionStorage.getItem('tp_obs_password') ||
            localStorage.getItem('tp_obs_password') ||
            '';
          const remember = localStorage.getItem('tp_obs_remember') === '1';
          return { url, pass, remember };
        } catch {
          return { url: '', pass: '', remember: false };
        }
      };
      const { url, pass, remember } = loadObsCreds();
      const urlMain = document.getElementById('obsUrl');
      const passMain = document.getElementById('obsPassword');
      const urlSet = document.getElementById('settingsObsUrl');
      const passSet = document.getElementById('settingsObsPass');
      const chkMain = document.getElementById('rememberObs');
      const chkSet = document.getElementById('settingsObsRemember');

      // If no stored URL, prefer the DEFAULT_OBS_URL for hydration (prevents 127.0.0.1 fallback)
      const hydratedUrl = (url && url.trim()) || DEFAULT_OBS_URL;
      if (hydratedUrl && urlMain && !urlMain.value) urlMain.value = hydratedUrl;
      if (url && urlSet && !urlSet.value) urlSet.value = url;
      if (pass && passMain && !passMain.value) passMain.value = pass;
      if (pass && passSet && !passSet.value) passSet.value = pass;

      if (chkMain) chkMain.checked = !!remember;
      if (chkSet) chkSet.checked = !!remember;
    } catch {
      void e;
    }
  }

  // Simple on-page debug panel for OBS events (only shown when __TP_DEV)
  function ensureObsDebugPanel() {
    try {
      if (!window.__TP_DEV) return null;
      let p = document.getElementById('obsDebugPanel');
      if (p) return p;
      p = document.createElement('div');
      p.id = 'obsDebugPanel';
      p.style.position = 'fixed';
      p.style.right = '12px';
      p.style.bottom = '12px';
      p.style.width = '320px';
      p.style.maxHeight = '40vh';
      p.style.overflow = 'auto';
      p.style.background = 'rgba(10,12,15,0.95)';
      p.style.color = '#cfe';
      p.style.fontSize = '12px';
      p.style.border = '1px solid #334';
      p.style.padding = '8px';
      p.style.zIndex = '99999';
      p.style.borderRadius = '8px';
      p.innerHTML =
        '<div style="font-weight:bold;margin-bottom:6px">OBS Debug</div><div id="obsDebugMsgs"></div><div style="margin-top:6px;text-align:right"><button id="obsDebugDump">Dump handshake</button> <button id="obsDebugClear">Clear</button></div>';
      document.body.appendChild(p);
      const clearBtn = document.getElementById('obsDebugClear');
      clearBtn?.addEventListener('click', () => {
        const msgs = document.getElementById('obsDebugMsgs');
        if (msgs) msgs.innerHTML = '';
      });
      const dumpBtn = document.getElementById('obsDebugDump');
      dumpBtn?.addEventListener('click', () => {
        try {
          const msgs = document.getElementById('obsDebugMsgs');
          if (!msgs) return;
          msgs.innerHTML = '';
          const arr =
            window.__obsHandshakeLog && Array.isArray(window.__obsHandshakeLog)
              ? window.__obsHandshakeLog
              : [];
          if (!arr.length) {
            const el = document.createElement('div');
            el.textContent =
              'No handshake log available — try enabling dev mode (add ?dev=1 or set window.__TP_DEV = true) and re-run the in-page test (window.__tpRunObsTest()) or click Settings → Test.';
            msgs.appendChild(el);
            return;
          }
          arr.forEach((it) => {
            const el = document.createElement('div');
            try {
              el.textContent = JSON.stringify(it);
            } catch {
              el.textContent = String(it);
            }
            msgs.appendChild(el);
          });
          msgs.scrollTop = msgs.scrollHeight;
        } catch {
          void e;
        }
      });
      return p;
    } catch {
      return null;
    }
  }

  function obsDebugLog(msg) {
    try {
      if (!window.__TP_DEV) return;
      const p = ensureObsDebugPanel();
      if (!p) return;
      const msgs = document.getElementById('obsDebugMsgs');
      if (!msgs) return;
      const el = document.createElement('div');
      el.textContent = `${new Date().toLocaleTimeString()}: ${msg}`;
      msgs.appendChild(el);
      // keep scroll at bottom
      msgs.scrollTop = msgs.scrollHeight;
    } catch {}
  }

  function wireObsPersistence() {
    try {
      const urlMain = document.getElementById('obsUrl');
      const passMain = document.getElementById('obsPassword');
      const chkMain = document.getElementById('rememberObs');
      const getVals = () => ({
        url: urlMain?.value?.trim() || '',
        pass: passMain?.value || '',
        remember: !!chkMain?.checked,
      });
      const commit = () => {
        try {
          const v = getVals();
          if (!v.url && !v.pass) return;
          try {
            sessionStorage.setItem('tp_obs_password', v.pass);
          } catch {}
          try {
            localStorage.setItem('tp_obs_url', v.url);
          } catch {}
          try {
            localStorage.setItem('tp_obs_remember', v.remember ? '1' : '0');
          } catch {}
          if (!v.remember) {
            try {
              localStorage.removeItem('tp_obs_password');
            } catch {}
          } else {
            try {
              localStorage.setItem('tp_obs_password', v.pass);
            } catch {}
          }
        } catch {
          void e;
        }
      };
      urlMain?.addEventListener('change', commit);
      passMain?.addEventListener('change', commit);
      chkMain?.addEventListener('change', commit);
    } catch {}
  }

  // TP: init-minimal
  // Minimal init to wire the meter pieces and help overlay (internal helper)
  async function __initMinimal() {
    try {
      // NOTE: previously we eagerly imported obsBridge here which forced the OBS adapter
      // to initialize during page load. To reduce startup work and make the app
      // deterministic for CI, we now lazy-load the OBS bridge on-demand via
      // ensureObsBridge() when the user interacts with OBS controls.

      loadRecorder().then((rec) => {
        try {
          if (rec && typeof rec.init === 'function') {
            rec.init({
              getUrl: () =>
                document.getElementById('settingsObsUrl')?.value?.trim() ||
                document.getElementById('obsUrl')?.value?.trim() ||
                DEFAULT_OBS_URL,
              getPass: () =>
                document.getElementById('settingsObsPass')?.value ??
                document.getElementById('obsPassword')?.value ??
                '',
              isEnabled: () => !!document.getElementById('enableObs')?.checked,
              onStatus: (txt, ok) => {
                try {
                  const via = document.getElementById('obsUrl')?.value || DEFAULT_OBS_URL;
                  console.debug('[OBS] status via', via, txt);
                  const chip = document.getElementById('obsStatus');
                  if (chip) chip.textContent = `OBS: ${txt || ''}`;
                  obsDebugLog(`status: ${txt || '(empty)'} (via ${via})`);
                } catch {}
                try {
                  _toast && _toast(txt, { type: ok ? 'ok' : 'error' });
                } catch {}
              },
              onRecordState: (state) => {
                try {
                  const chip = document.getElementById('recChip');
                  if (chip) chip.textContent = `Speech: ${state}`;
                  obsDebugLog(`record-state: ${state}`);
                } catch {}
              },
            });
          }
        } catch {}
      });
    } catch {}

    // TP: normalize-top-btn
    // Wire Top-bar Normalize button
    wireNormalizeButton(normalizeTopBtn);
  }

  /* ────────────────────────────────────────────────────────────── */
  // Speakers section show/hide with persistence (robust)
  (function setupSpeakersToggle() {
    const KEY = 'tp_speakers_hidden';
    const btn = document.getElementById('toggleSpeakers');
    let body = document.getElementById('speakersBody');

    // Fallback: if no wrapper, find the key rows and hide those
    const rows = body
      ? []
      : ['#wrap-s1', '#wrap-s2', '#wrap-g1', '#wrap-g2', '#wrap-bold']
          .map((sel) => document.querySelector(sel)?.closest('.row'))
          .filter(Boolean);

    const isHidden = () =>
      body
        ? body.classList.contains('hidden')
        : rows[0]
          ? rows[0].classList.contains('hidden')
          : false;

    const apply = (hidden) => {
      if (body) body.classList.toggle('hidden', !!hidden);
      else rows.forEach((r) => r.classList.toggle('hidden', !!hidden));
      if (btn) {
        btn.textContent = hidden ? 'Show Speakers' : 'Hide';
        btn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
      }
    };

    const saved = localStorage.getItem(KEY) === '1';
    apply(saved);

    btn?.addEventListener('click', () => {
      const next = !isHidden();
      localStorage.setItem(KEY, next ? '1' : '0');
      apply(next);
    });
  })();

  // ---- Help / Tag Guide injection ----
  function ensureHelpUI() {
    if (window.__help?.ensureHelpUI) return window.__help.ensureHelpUI();
    // --- minimal CSS (only if missing) ---
    if (!document.getElementById('helpStyles')) {
      const css = `
      .hidden{display:none!important}
      .overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);
        backdrop-filter:saturate(1.2) blur(2px);z-index:9999;
        display:flex;align-items:center;justify-content:center}
      .sheet{width:min(820px,92vw);max-height:85vh;overflow:auto;
        background:#0e141b;border:1px solid var(--edge);border-radius:16px;padding:20px}
      .sheet header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
      .hr{border:0;border-top:1px solid var(--edge);margin:12px 0}
      .shortcuts-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .btn-chip{background:#0e141b;border:1px solid var(--edge);padding:8px 10px;border-radius:10px;cursor:pointer}
    `;
      const st = document.createElement('style');
      st.id = 'helpStyles';
      st.textContent = css;
      document.head.appendChild(st);
    }

    // --- ensure Help button exists in the top bar ---
    const topBarEl = document.querySelector('.topbar');
    let helpBtn = document.getElementById('shortcutsBtn');
    if (!helpBtn) {
      helpBtn = Object.assign(document.createElement('button'), {
        id: 'shortcutsBtn',
        className: 'chip',
        textContent: 'Help',
        ariaHasPopup: 'dialog',
        ariaExpanded: 'false',
      });
      topBarEl && topBarEl.appendChild(helpBtn);
    } else {
      helpBtn.textContent = 'Help';
    }

    // --- ensure overlay exists ---
    let overlay = document.getElementById('shortcutsOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'shortcutsOverlay';
      overlay.className = 'overlay hidden';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'shortcutsTitle');
      overlay.innerHTML = `
      <div class="sheet">
        <header>
          <h3 id="shortcutsTitle">Help</h3>
          <button id="shortcutsClose" class="btn-chip">Close</button>
        </header>

        <div class="shortcuts-grid" style="margin-bottom:8px">
          <div><strong>Space</strong></div><div>Toggle Auto-scroll</div>
          <div><strong>↑ / ↓</strong></div><div>Adjust Auto-scroll speed</div>
          <div><strong>Shift + ?</strong></div><div>Open Help</div>
          <div><strong>Ctrl/Cmd + S</strong></div><div>Save to browser</div>
          <div><strong>~</strong></div><div>Debug HUD</div>
          <div><strong>?v=clear</strong></div><div>Force refresh</div>
        </div>

        <hr class="hr" />
        <div>
          <h4 style="margin:8px 0 6px">Official Teleprompter Tags</h4>
          <p style="margin:0 0 8px; color:#96a0aa">Speakers: <code>[s1] ... [/s1]</code>, <code>[s2] ... [/s2]</code>. Notes: <code>[note] ... [/note]</code>.</p>
          <!-- Tag guide will be augmented below if missing Normalize/Validate -->
          </div>
        </div>
      </div>
    `;
      document.body.appendChild(overlay);
    }

    // If we reused an existing overlay, inject Tag Guide only if a Tags heading is NOT already present
    if (
      overlay &&
      !overlay.querySelector('#normalizeBtn') &&
      !overlay.querySelector('#guideNormalize')
    ) {
      const sheet = overlay.querySelector('.sheet') || overlay;
      const hasTagsHeading =
        !!sheet.querySelector('h4') &&
        Array.from(sheet.querySelectorAll('h4')).some((h) =>
          /Official\s+Teleprompter\s+Tags/i.test(h.textContent || '')
        );
      if (!hasTagsHeading) {
        const container = document.createElement('div');
        container.innerHTML = `
        <hr class="hr" />
        <div class="tp-tags-block">
          <h4 style="margin:8px 0 6px">Official Teleprompter Tags</h4>
          <p style="margin:0 0 8px; color:#96a0aa">
            Speakers: <code>[s1] ... [/s1]</code>, <code>[s2] ... [/s2]</code>. Notes: <code>[note] ... [/note]</code>.
          </p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
            <button id="normalizeBtn" class="btn-chip">Normalize current script</button>
            <button id="validateBtn" class="btn-chip">Validate markup</button>
          </div>
        </div>`;
        sheet.appendChild(container);
      }
    }

    // If missing, append the optional Advanced section (hidden by default)
    if (overlay && !overlay.querySelector('#helpAdvanced')) {
      const sheet = overlay.querySelector('.sheet') || overlay;
      const adv = document.createElement('div');
      adv.innerHTML = `
<div id="helpAdvanced" class="hidden" style="margin-top:12px">
  <h4 style="margin:0 0 6px">Advanced</h4>
  <div class="shortcuts-grid">
    <div><strong>Alt-click title</strong></div><div>Toggle this section</div>
    <div><strong>~</strong></div><div>Debug HUD</div>
    <div><strong>?v=clear</strong></div><div>Force refresh</div>
  </div>
</div>`;
      sheet.appendChild(adv.firstElementChild);
    }

    // --- wire open/close ---
    const closeBtn = overlay.querySelector('#shortcutsClose');
    function openHelp() {
      overlay.classList.remove('hidden');
      helpBtn.setAttribute('aria-expanded', 'true');
    }
    function closeHelp() {
      overlay.classList.add('hidden');
      helpBtn.setAttribute('aria-expanded', 'false');
    }
    if (helpBtn) helpBtn.onclick = openHelp;
    if (closeBtn) closeBtn.onclick = closeHelp;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeHelp();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === '?' && (e.shiftKey || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openHelp();
      }
    });

    // --- Normalize button wiring ---
    wireNormalizeButton(overlay.querySelector('#normalizeBtn'));

    // --- Validate tags quickly ---
    const validateBtn = overlay.querySelector('#validateBtn');
    if (validateBtn) {
      const _showValidation = (text) => {
        const sheet = overlay.querySelector('.sheet') || overlay;
        let panel = sheet.querySelector('#validatePanel');
        if (!panel) {
          const frag = document.createElement('div');
          frag.innerHTML = `
<div id="validatePanel" class="sheet-section hidden">
  <header style="display:flex;justify-content:space-between;align-items:center;gap:8px">
    <h4 style="margin:0">Validation results</h4>
    <button id="copyValidateBtn" class="btn-chip">Copy</button>
  </header>
  <pre id="validateOut" tabindex="0" style="white-space:pre-wrap; user-select:text; margin-top:8px"></pre>
</div>`;
          panel = frag.firstElementChild;
          sheet.appendChild(panel);
          const copyBtn = panel.querySelector('#copyValidateBtn');
          if (copyBtn && !copyBtn.dataset.wired) {
            copyBtn.dataset.wired = '1';
            copyBtn.addEventListener('click', async () => {
              const pre = panel.querySelector('#validateOut');
              const txt = pre?.textContent || '';
              try {
                await navigator.clipboard.writeText(txt);
                try {
                  setStatus && setStatus('Validation copied ✓');
                } catch {}
              } catch {
                // fallback if clipboard API blocked
                try {
                  const sel = window.getSelection();
                  const r = document.createRange();
                  r.selectNodeContents(pre);
                  sel.removeAllRanges();
                  sel.addRange(r);
                  document.execCommand('copy');
                  try {
                    setStatus && setStatus('Validation copied ✓');
                  } catch {}
                } catch {
                  try {
                    setStatus && setStatus('Copy failed: ' + (e?.message || e));
                  } catch {}
                }
              }
            });
          }
        }
        const pre = panel.querySelector('#validateOut');
        pre.textContent = String(text || '').trim() || 'No issues found.';
        panel.classList.remove('hidden');
        // focus so Ctrl/Cmd+C works immediately
        pre.focus();
        // auto-select all for instant copy
        try {
          const sel = window.getSelection();
          const r = document.createRange();
          r.selectNodeContents(pre);
          sel.removeAllRanges();
          sel.addRange(r);
        } catch {}
      };

      validateBtn.onclick = () => {
        let msg;
        try {
          msg = window.validateStandardTags
            ? window.validateStandardTags(true)
            : 'Validator missing.';
        } catch {
          msg = 'Validation error: ' + (_e?.message || _e);
        }
        try {
          window.showValidation(msg);
        } catch {
          showCopyDialog(msg, 'Validator');
        }
      };
    }
  }
  try {
    __tpBootPush('after-ensureHelpUI-def');
  } catch {
    void e;
  }

  function _injectHelpPanel() {
    try {
      const btn = document.getElementById('shortcutsBtn');
      const modal = document.getElementById('shortcutsOverlay');
      const title = document.getElementById('shortcutsTitle');
      const _close = document.getElementById('shortcutsClose');
      if (!modal) return;

      // Rename button + title
      if (btn) {
        btn.textContent = 'Help';
        btn.setAttribute('aria-label', 'Help and shortcuts');
      }
      if (title) {
        title.textContent = 'Help';
      }

      // Find the sheet body
      const sheet = modal.querySelector('.sheet');
      if (!sheet) return;

      // Prevent duplicate insertion
      if (sheet.querySelector('#tagGuide')) return;

      const guide = document.createElement('div');
      guide.id = 'tagGuide';
      guide.innerHTML = `
      <hr class="hr" />
      <details open>
        <summary><strong>Script Tag Guide</strong></summary>
        <div class="tag-guide">
          <p class="dim">Official tags for podcast scripts — consistent and scroll‑ready.</p>
          <h4>Speaker Tags</h4>
          <ul>
            <li><code>[s1] ... [/s1]</code> → Joe</li>
            <li><code>[s2] ... [/s2]</code> → Brad</li>
          </ul>
          <p><em>Always close the tag. Never add <code>: Name</code> after the tag.</em></p>

          <h4>Notes / Cues</h4>
          <ul>
            <li><code>[note] ... [/note]</code> — stage direction, tone, pacing, delivery, music cues, etc.</li>
            <li><strong>Notes must be on their own line</strong> (not inside speaker tags).</li>
          </ul>

          <h4>Inline Styles</h4>
          <ul>
            <li>No inline color, italics, or extra formatting.</li>
            <li>If emphasis is needed, describe it in a <code>[note]</code> block instead.</li>
          </ul>

          <h4>Rules</h4>
          <ul>
            <li>Every spoken paragraph starts with <code>[s1]</code> or <code>[s2]</code>.</li>
            <li>Every note uses <code>[note]...[/note]</code> on its own paragraph.</li>
            <li>No duplicate or stray tags.</li>
            <li>Keep scripts human‑readable and teleprompter‑friendly.</li>
          </ul>

          <div class="row" style="margin-top:.6rem">
            <button id="guideNormalize" class="btn-chip">Normalize current script</button>
            <button id="guideValidate" class="btn-chip">Validate</button>
          </div>
        </div>
      </details>
    `;

      // Insert guide after the shortcuts grid
      const grid = sheet.querySelector('.shortcuts-grid');
      if (grid && grid.parentElement) {
        grid.parentElement.appendChild(guide);
      } else {
        sheet.appendChild(guide);
      }

      // Wire quick actions (reuse existing functions if present)
      document.getElementById('guideNormalize')?.addEventListener('click', () => {
        try {
          const src = typeof editor !== 'undefined' && editor ? editor.value : '';
          if (typeof normalizeScriptStrict === 'function') {
            const out = normalizeScriptStrict(src);
            if (editor) editor.value = out;
            if (typeof renderScript === 'function') renderScript(out);
            setStatus && setStatus('Normalized to standard tags.');
          } else if (typeof normalizeScript === 'function') {
            const out = normalizeScript(src).text || normalizeScript(src); // backward compat
            if (editor) editor.value = out;
            if (typeof renderScript === 'function') renderScript(out);
            setStatus && setStatus('Normalized.');
          }
        } catch {
          void err;
        }
      });

      document.getElementById('guideValidate')?.addEventListener('click', () => {
        try {
          const src = typeof editor !== 'undefined' && editor ? editor.value : '';
          if (typeof validateScriptStrict === 'function') {
            const issues = validateScriptStrict(src);
            if (!issues.length) alert('✅ Script passes the standard.');
            else alert('⚠️ Issues:\\n- ' + issues.join('\\n- '));
          } else {
            alert('Validation is not available in this build.');
          }
        } catch {
          console.error(err);
        }
      });
    } catch {
      console.error('Help injection failed', err);
    }
  }

  // Wrap the original init logic so we can capture early failures.
  async function _initCore() {
    // Make the real core visible to the stub/runner and resolve any waiters
    try {
      // publish the real core so window.init and the stub can find it
      window._initCore = _initCore;

      // wake the stable runner promise (defined earlier)
      if (typeof window.__tpSetCoreRunnerReady === 'function') {
        window.__tpSetCoreRunnerReady();
      }

      // also resolve the simple "core ready" latch, if present
      if (typeof window.__tpResolveCoreReady === 'function') {
        window.__tpResolveCoreReady();
      }
    } catch {}
    console.log('[TP-Pro] _initCore start');
    // Calm Mode: lock scroller and freeze base viewport height early
    try {
      if (window.__TP_CALM) {
        function chooseScroller() {
          const v = document.getElementById('viewer');
          if (v && v.scrollHeight - v.clientHeight > 1) return v;
          return document.scrollingElement || document.documentElement || document.body;
        }
        const SCROLLER = chooseScroller();
        const VIEWER_HEIGHT_BASE = SCROLLER?.clientHeight || 0;
        // publish for other modules that may consult these
        try {
          window.__TP_SCROLLER = SCROLLER;
        } catch {}
        try {
          window.__TP_VIEWER_HEIGHT_BASE = VIEWER_HEIGHT_BASE;
        } catch {}
        console.info(
          '[TP-Pro Calm] Scroller locked:',
          SCROLLER?.id || SCROLLER?.tagName,
          'vh_base=',
          VIEWER_HEIGHT_BASE
        );
      }
    } catch {
      console.warn('[TP-Pro Calm] scroller lock failed', e);
    }
    // Run minimal wiring first (meters, help overlay, normalize button)
    try {
      __initMinimal();
    } catch {
      console.warn('Minimal init failed', e);
    }
    // ⬇️ grab these *first*
    shortcutsBtn = document.getElementById('shortcutsBtn');
    shortcutsOverlay = document.getElementById('shortcutsOverlay');
    shortcutsClose = document.getElementById('shortcutsClose');

    // Shortcuts overlay open/close logic (now safe)
    function openShortcuts() {
      if (!shortcutsOverlay) return;
      shortcutsOverlay.classList.remove('hidden');
      shortcutsBtn?.setAttribute('aria-expanded', 'true');
      setTimeout(() => shortcutsClose?.focus(), 0);
    }
    // (rest of init logic continues below ... existing code ...)
    function closeShortcuts() {
      if (!shortcutsOverlay) return;
      shortcutsOverlay.classList.add('hidden');
      shortcutsBtn?.setAttribute('aria-expanded', 'false');
      shortcutsBtn?.focus();
    }

    // Now bind listeners
    shortcutsBtn?.addEventListener('click', openShortcuts);
    shortcutsClose?.addEventListener('click', closeShortcuts);
    shortcutsOverlay?.addEventListener('click', (e) => {
      if (e.target === shortcutsOverlay) closeShortcuts();
    });
    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
      if (typing) return; // don't steal keys when user is typing

      switch (e.key) {
        case ' ': // Space
          e.preventDefault();
          if (autoTimer) stopAutoScroll();
          else startAutoScroll();
          break;
        case 'ArrowUp':
          e.preventDefault();
          tweakSpeed(+2); // +2 px/s (finer control)
          break;
        case 'ArrowDown':
          e.preventDefault();
          tweakSpeed(-2); // -2 px/s (finer control)
          break;
        case '1':
          wrapSelection('[s1]', '[/s1]');
          break;
        case '2':
          wrapSelection('[s2]', '[/s2]');
          break;
        case '3':
          wrapSelection('[g1]', '[/g1]');
          break;
        case '4':
          wrapSelection('[g2]', '[/g2]');
          break;
        case '?':
        case '/':
          if (e.shiftKey) {
            e.preventDefault();
            openShortcuts();
          }
          break;
      }
    });

    // ===== Progressive Fallback Nudge =====
    (function () {
      const F = {
        stepPx: 12, // small push
        maxSmallPushes: 3, // after this, try mini-seek
        miniSeekIdxSpan: 6, // try ±6 indices around bestIdx
        coolDownMs: 1500, // don’t spam nudges
      };
      const S = { lastAt: 0, smallPushes: 0 };
      let fbDelay = 250,
        fbTimer = 0;
      window.__tpScheduleFallback = function (fn) {
        if (fbTimer) return;
        fbTimer = setTimeout(async () => {
          fbTimer = 0;
          let didSomething = false;
          try {
            didSomething = !!(await fn());
          } catch {}
          fbDelay = didSomething ? 250 : Math.min(fbDelay * 2, 2000);
        }, fbDelay);
      };

      function syncDisplay() {
        try {
          const viewer = document.getElementById('viewer');
          if (!viewer) return;
          const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
          const ratio = max ? viewer.scrollTop / max : 0;
          sendToDisplay && sendToDisplay({ type: 'scroll', top: viewer.scrollTop, ratio });
        } catch {}
      }

      window.__tpFallbackNudge = function (bestIdx) {
        onUserAutoNudge(); // Gate soft-advance during active catching up
        const now = performance.now();
        if (now - S.lastAt < F.coolDownMs) {
          try {
            if (typeof debug === 'function') debug({ tag: 'fallback-nudge:cooldown' });
          } catch {}
          return false;
        }
        S.lastAt = now;

        const viewer = document.getElementById('viewer');
        if (!viewer) return false;

        // 1) small push phase
        if (S.smallPushes < F.maxSmallPushes) {
          const to = viewer.scrollTop + F.stepPx;
          try {
            if (typeof debug === 'function')
              debug({ tag: 'fallback-nudge', top: to, idx: bestIdx, phase: 'small' });
          } catch {}
          try {
            viewer.scrollTo({ top: to, behavior: 'instant' });
          } catch {
            viewer.scrollTop = to;
          }
          syncDisplay();
          S.smallPushes++;
          return true;
        }

        // 2) mini-seek: try to locate an element around bestIdx
        const tryIdxs = [];
        for (let k = -F.miniSeekIdxSpan; k <= F.miniSeekIdxSpan; k++) tryIdxs.push(bestIdx + k);
        const el = tryIdxs
          .map((i) =>
            document.querySelector(`[data-idx="${i}"],[data-token-idx="${i}"],.line[data-i="${i}"]`)
          )
          .find(Boolean);

        if (el) {
          const y = (el.offsetTop || 0) - Math.floor((viewer.clientHeight || 0) * 0.33);
          // Only scroll forward, never backward
          const targetY = Math.max(y, viewer.scrollTop + 10);
          try {
            if (typeof debug === 'function')
              debug({ tag: 'fallback-nudge', top: targetY, idx: bestIdx, phase: 'mini-seek' });
          } catch {}
          try {
            viewer.scrollTo({ top: targetY, behavior: 'instant' });
          } catch {
            viewer.scrollTop = targetY;
          }
          syncDisplay();
          S.smallPushes = 0; // reset after successful mini-seek
          return true;
        }

        // 3) anchor jump (last resort)
        if (typeof window.scrollToCurrentIndex === 'function' && PLL.allowAnchor()) {
          try {
            if (typeof debug === 'function')
              debug({ tag: 'fallback-nudge', idx: bestIdx, phase: 'anchor-jump' });
          } catch {}
          const prev = window.currentIndex;
          window.currentIndex = bestIdx;
          try {
            window.scrollToCurrentIndex();
          } finally {
            window.currentIndex = prev;
          }
          S.smallPushes = 0;
          syncDisplay();
          return true;
        }

        // If nothing else, log and bail
        try {
          if (typeof debug === 'function')
            debug({ tag: 'fallback-nudge', idx: bestIdx, phase: 'noop' });
        } catch {}
        return false;
      };
    })();

    // Stall-recovery watchdog + Stall detector (Phase 1: telemetry, Phase 2: gentle catch-up burst)
    (function installStallWatchdogs() {
      const TICK_MS = 250;
      const STALL_MS = typeof window.__tpStallMs === 'number' ? window.__tpStallMs : 1400;
      const LOW_PROGRESS_SEC =
        typeof window.__tpLowProgSec === 'number' ? window.__tpLowProgSec : 2.0;
      const BOTTOM_RATIO =
        typeof window.__tpBottomRatio === 'number' ? window.__tpBottomRatio : 0.7;
      const CATCHUP_BURST_MS =
        typeof window.__tpCatchupBurstMs === 'number' ? window.__tpCatchupBurstMs : 1500;
      const COOLDOWN_MS =
        typeof window.__tpStallCooldownMs === 'number' ? window.__tpStallCooldownMs : 1200;
      const MID_COOLDOWN_MS =
        typeof window.__tpMidStallCooldownMs === 'number' ? window.__tpMidStallCooldownMs : 1000;
      let _lastRescueAt = 0;
      let _lastMidRescueAt = 0;
      // Similarity tracking for stall detection - now uses global simHistory
      const LOW_SIM_THRESHOLD = 0.65; // sim_mean threshold for stall

      // Initialize commit broker state if not already set
      window.__tpCommit = window.__tpCommit || { idx: 0, ts: 0 };

      // Ring buffer logging system with severity filter
      const LOG_BUFFER_SIZE = 100;
      const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
      const MIN_LOG_LEVEL = window.__TP_LOG_LEVEL ?? 2; // Default to info level

      // Initialize ring buffer and state tracking
      window.__tpLogBuffer = window.__tpLogBuffer || [];
      window.__tpWatchdogState = window.__tpWatchdogState || 'OK';
      window.__tpLastWatchdogLog = 0;
      window.__tpMetrics = window.__tpMetrics || {
        ticks: 0,
        stalls: 0,
        rescues: 0,
        lastSample: 0,
        samples: [],
      };

      function tpLog(level, ...args) {
        const levelNum = LOG_LEVELS[level] ?? LOG_LEVELS.debug;
        if (levelNum > MIN_LOG_LEVEL) return; // Filter by severity

        const entry = {
          ts: performance.now(),
          level,
          args: args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))),
        };

        // Add to ring buffer
        window.__tpLogBuffer.push(entry);
        if (window.__tpLogBuffer.length > LOG_BUFFER_SIZE) {
          window.__tpLogBuffer.shift();
        }

        // Console output only for important messages or when not in quiet mode
        if (!window.__TP_QUIET || level === 'error') {
          const now = performance.now();
          // Rate limit console output to once per second
          if (now - window.__tpLastWatchdogLog > 1000) {
            window.__tpLastWatchdogLog = now;
            if (level === 'error') console.error(...args);
            else if (level === 'warn') console.warn(...args);
            else if (level === 'info') console.info(...args);
            else console.debug(...args);
          }
        }
      }

      // State-aware watchdog logging (only on state changes)
      function logWatchdogState(newState, details = {}) {
        const oldState = window.__tpWatchdogState;
        if (newState !== oldState) {
          window.__tpWatchdogState = newState;
          tpLog('info', `WATCHDOG STATE: ${oldState} → ${newState}`, details);
        }
      }

      // High-rate metrics counter (sampled by UI every 250-500ms)
      function incrementMetric(name) {
        if (!window.__tpMetrics[name]) window.__tpMetrics[name] = 0;
        window.__tpMetrics[name]++;
      }

      // Get metrics sample for UI
      window.__tpGetMetricsSample = function () {
        const now = performance.now();
        const sample = { ...window.__tpMetrics, ts: now };
        window.__tpMetrics.ticks = 0; // Reset counters after sampling
        window.__tpMetrics.stalls = 0;
        window.__tpMetrics.rescues = 0;
        window.__tpMetrics.lastSample = now;
        return sample;
      };

      // Get recent logs for UI debugging
      window.__tpGetLogBuffer = function (maxEntries = 50) {
        return window.__tpLogBuffer.slice(-maxEntries);
      };

      const debug = (x) => {
        try {
          if (typeof window.__tpDebug === 'function') window.__tpDebug(x);
          // default: no-op to avoid console spam
        } catch {}
      };

      function getAnchorRatio() {
        try {
          const v = viewer;
          const h = Math.max(1, v?.clientHeight || 1);
          const vis =
            window.__anchorObs && typeof window.__anchorObs.mostVisibleEl === 'function'
              ? window.__anchorObs.mostVisibleEl()
              : null;
          const el = vis || document.querySelector('#script p.active') || null;
          if (!el || !v) return null;
          const er = el.getBoundingClientRect();
          const vr = v.getBoundingClientRect ? v.getBoundingClientRect() : { top: 0 };
          const y = er.top - vr.top;
          return Math.max(0, Math.min(1, y / h));
        } catch {
          return null;
        }
      }

      function progressRate() {
        try {
          const dt = Math.max(0.001, (performance.now() - (window.__tpCommit.ts || 0)) / 1000);
          const di = Math.max(
            0,
            (typeof currentIndex === 'number' ? currentIndex : 0) - (window.__tpCommit.idx || 0)
          );
          return di / dt;
        } catch {
          return null;
        }
      }

      setInterval(() => {
        // If there is no script loaded or watchdog is not armed, skip watchdog activity entirely
        try {
          if (!window.__tp_has_script || !window.__tp_wd_armed) return;
        } catch {}
        // Increment tick counter for UI sampling
        incrementMetric('ticks');

        // Only log watchdog state changes, not every tick
        const now = performance.now();
        const timeSinceCommit = now - (window.__tpCommit.ts || 0);
        const progressRateVal = progressRate();
        const isStalled = timeSinceCommit > (window.__tpStallMs || 2000);

        if (isStalled) {
          logWatchdogState('STALL', {
            noCommitFor: Math.floor(timeSinceCommit),
            progressRate: progressRateVal,
            committedIdx: window.__tpCommit.idx,
            currentIndex: window.currentIndex,
          });
          incrementMetric('stalls');
        } else {
          logWatchdogState('OK');
        }

        if (!recActive) return; // only when speech sync is active
        if (typeof autoTimer !== 'undefined' && autoTimer) return; // don't fight auto-scroll

        // Existing: fallback nudge if no advance recently and not in mid-sim window
        // Keep this disabled in Calm Mode, but allow stall detection/rescue to still run.
        if (!window.__TP_DISABLE_NUDGES) {
          const MISS_FALLBACK_MS = 1800; // keep original timing
          try {
            const sim = window.__lastSimScore ?? null;
            if (sim !== null && sim >= 0.72 && sim < 0.8) {
              window.__tpLastMidSimAt = now;
            }
          } catch {}
          const recentMid =
            typeof window.__tpLastMidSimAt === 'number' && now - window.__tpLastMidSimAt < 300;
          // Also check for recent match processing
          const recentMatch =
            typeof window.__tpCommit?.ts === 'number' && now - window.__tpCommit.ts < 1000;
          if (now - _lastAdvanceAt > MISS_FALLBACK_MS && !recentMatch) {
            if (!recentMid) {
              try {
                window.__tpScheduleFallback?.(() => window.__tpFallbackNudge?.(currentIndex || 0));
              } catch {}
              _lastAdvanceAt = now;
              try {
                deadmanWatchdog(currentIndex);
              } catch {}
            }
          }
        }

        // Phase 1: telemetry-only stall detector + forced commit after repeated stalls
        const noCommitFor = now - (window.__tpCommit.ts || 0);
        const pr = progressRate();
        // Update sim history for rolling average
        const currentSim = window.__lastSimScore ?? 0;
        if (!Array.isArray(window.simHistory)) {
          window.simHistory = [];
        }
        window.simHistory.push(currentSim);
        if (window.simHistory.length > 10) window.simHistory.shift();
        const simMean =
          window.simHistory.length > 0
            ? window.simHistory.reduce((a, b) => a + b, 0) / window.simHistory.length
            : 0;

        const aRatio = getAnchorRatio();
        const inJitterSpike = !!(
          window.__tpJitter &&
          typeof window.__tpJitter.spikeUntil === 'number' &&
          now < window.__tpJitter.spikeUntil
        );
        const stallMsAdj = inJitterSpike ? STALL_MS + 400 : STALL_MS;
        const stalled = noCommitFor > stallMsAdj && simMean < LOW_SIM_THRESHOLD;
        if (stalled) {
          tpLog(
            'debug',
            JSON.stringify({
              tag: 'watchdog-stalled',
              committedIdx: window.__tpCommit.idx,
              currentIndex: window.currentIndex,
              noCommitFor,
              streak: window.__tpStallStreak,
            })
          );
          try {
            debug?.({
              tag: 'match:stall-watchdog',
              noCommitFor: Math.floor(noCommitFor),
              committedIdx: window.__tpCommit.idx,
              currentIndex: window.currentIndex,
              streak: window.__tpStallStreak,
            });
          } catch {}
        }
        // Forced commit after repeated stalls
        window.__tpStallStreak = window.__tpStallStreak || 0;
        if (stalled) {
          window.__tpStallStreak++;
        } else {
          window.__tpStallStreak = 0;
        }
        // Reset stall timer and streak if stalled without index advancement (speaker pause)
        tpLog(
          'debug',
          JSON.stringify({
            tag: 'check-reset-condition',
            stalled,
            currentIndex: window.currentIndex,
            committedIdx: window.__tpCommit.idx,
            equal:
              stalled &&
              (typeof window.currentIndex !== 'number' ||
                window.currentIndex === window.__tpCommit.idx),
          })
        );
        if (
          stalled &&
          (typeof window.currentIndex !== 'number' || window.currentIndex === window.__tpCommit.idx)
        ) {
          window.__tpCommit.ts = now;
          window.__tpStallStreak = 0;
          tpLog(
            'debug',
            JSON.stringify({
              tag: 'stall-reset',
              idx: window.currentIndex,
              committedIdx: window.__tpCommit.idx,
            })
          );
          try {
            debug?.({
              tag: 'match:stall-reset',
              idx: window.currentIndex,
              committedIdx: window.__tpCommit.idx,
            });
          } catch {}
        }
        if (stalled || (pr !== null && pr < 0.3 && noCommitFor > LOW_PROGRESS_SEC * 1000)) {
          try {
            debug?.({
              tag: 'stall:detected',
              noCommitFor: Math.floor(noCommitFor),
              pr,
              anchorRatio: aRatio,
              jitterSpike: inJitterSpike,
              committedIdx: window.__tpCommit.idx,
              currentIndex: window.currentIndex,
              stallStreak: window.__tpStallStreak,
            });
          } catch {}
          try {
            window.__tpMarkRecoverySpot?.('stall', {
              noCommitFor: Math.floor(noCommitFor),
              pr,
              anchorRatio: aRatio,
            });
          } catch {}
          // If we've stalled 6+ times in a row and not at end, force a commit to break out
          if (window.__tpStallStreak >= 6 && typeof window.currentIndex === 'number') {
            try {
              const idx = window.currentIndex;
              if (typeof window.__tpForceCommit === 'function' && idx > window.__tpCommit.idx) {
                const didForce = window.__tpForceCommit(idx, { scroll: true });
                debug?.({
                  tag: didForce ? 'forced-commit:override' : 'forced-commit:direct',
                  idx,
                  committedIdx: idx,
                });
                // Update commit state
                window.__tpCommit.idx = idx;
                window.__tpCommit.ts = now;
                if (didForce) window.__tpStallStreak = 0;
              } else {
                // If no force commit function or idx not greater, still reset stall by updating ts
                window.__tpCommit.ts = now;
                window.__tpStallStreak = 0;
                debug?.({
                  tag: 'stall:reset-timer',
                  idx,
                  committedIdx: window.__tpCommit.idx,
                });
              }
            } catch {}
          }
        }

        // Phase 2: gentle catch-up burst if we appear bottom-hovered and not within cooldown
        const cooldownOk = !_lastRescueAt || now - _lastRescueAt > COOLDOWN_MS;
        const bottomish = aRatio !== null && aRatio > BOTTOM_RATIO;
        // Alternate bottomness via document scroll ratio so rescue can trigger even when anchor IO misses
        let docBottomish = false,
          docRatio = null;
        try {
          const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
          const top = Math.max(0, viewer.scrollTop || 0);
          docRatio = max ? top / max : 0;
          const DOC_THR =
            typeof window.__tpDocBottomRatio === 'number' ? window.__tpDocBottomRatio : 0.72;
          docBottomish = docRatio > DOC_THR;
        } catch {}
        const catchupAvailable = !!(
          __scrollCtl &&
          __scrollCtl.startAutoCatchup &&
          __scrollCtl.stopAutoCatchup
        );
        const catchupActive = !!(__scrollCtl && __scrollCtl.isActive && __scrollCtl.isActive());
        if (
          stalled &&
          (bottomish || docBottomish) &&
          cooldownOk &&
          catchupAvailable &&
          !catchupActive
        ) {
          // Start a short catch-up burst to re-center
          try {
            incrementMetric('rescues');
            debug?.({
              tag: 'stall:rescue:start',
              method: 'catchup-burst',
              aRatio,
              docRatio,
              noCommitFor: Math.floor(noCommitFor),
            });
          } catch {}
          _lastRescueAt = now;
          try {
            // Build closures consistent with tryStartCatchup()
            const markerTop = () => {
              const pct = typeof window.__TP_MARKER_PCT === 'number' ? window.__TP_MARKER_PCT : 0.4;
              return (viewer?.clientHeight || 0) * pct;
            };
            const getTargetY = () => markerTop();
            const getAnchorY = () => {
              const vis =
                window.__anchorObs && typeof window.__anchorObs.mostVisibleEl === 'function'
                  ? window.__anchorObs.mostVisibleEl()
                  : null;
              if (vis && viewer) {
                const rect = vis.getBoundingClientRect();
                const vRect = viewer.getBoundingClientRect();
                return rect.top - vRect.top;
              }
              const activeP = (scriptEl || viewer)?.querySelector('p.active') || null;
              if (activeP && viewer) {
                const rect = activeP.getBoundingClientRect();
                const vRect = viewer.getBoundingClientRect();
                return rect.top - vRect.top;
              }
              return markerTop();
            };
            const scrollBy = (dy) => {
              try {
                const next = Math.max(0, Math.min(viewer.scrollTop + dy, viewer.scrollHeight));
                if (typeof requestScroll === 'function') requestScroll(next);
                else viewer.scrollTop = next;
                const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
                const ratio = max
                  ? (typeof window.__lastScrollTarget === 'number'
                      ? window.__lastScrollTarget
                      : viewer.scrollTop) / max
                  : 0;
                sendToDisplay({
                  type: 'scroll',
                  top:
                    typeof window.__lastScrollTarget === 'number'
                      ? window.__lastScrollTarget
                      : viewer.scrollTop,
                  ratio,
                });
              } catch {}
            };
            // During the burst, relax clamp guard stickiness/min-delta for a short window
            try {
              window.__tpStallRelaxUntil = now + Math.max(400, Math.min(CATCHUP_BURST_MS, 1000));
            } catch {}
            __scrollCtl.startAutoCatchup(getAnchorY, getTargetY, scrollBy);
            setTimeout(() => {
              try {
                __scrollCtl.stopAutoCatchup();
                try {
                  window.__tpStallRelaxUntil = 0;
                } catch {}
                debug?.({ tag: 'stall:rescue:done', method: 'catchup-burst' });
              } catch {}
            }, CATCHUP_BURST_MS);
          } catch {}
        }

        // Phase 2.5: mid-viewport catch-up burst if stalled mid-viewport
        const midCooldownOk = !_lastMidRescueAt || now - _lastMidRescueAt > MID_COOLDOWN_MS;
        if (
          stalled &&
          !(bottomish || docBottomish) &&
          midCooldownOk &&
          catchupAvailable &&
          !catchupActive
        ) {
          // Start a short catch-up burst for mid-viewport
          try {
            incrementMetric('rescues');
            debug?.({
              tag: 'stall:rescue:start',
              method: 'mid-catchup-burst',
              aRatio,
              docRatio,
              noCommitFor: Math.floor(noCommitFor),
            });
          } catch {}
          _lastMidRescueAt = now;
          try {
            // Build closures consistent with tryStartCatchup()
            const markerTop = () => {
              const pct = typeof window.__TP_MARKER_PCT === 'number' ? window.__TP_MARKER_PCT : 0.4;
              return (viewer?.clientHeight || 0) * pct;
            };
            const getTargetY = () => markerTop();
            const getAnchorY = () => {
              const vis =
                window.__anchorObs && typeof window.__anchorObs.mostVisibleEl === 'function'
                  ? window.__anchorObs.mostVisibleEl()
                  : null;
              if (vis && viewer) {
                const rect = vis.getBoundingClientRect();
                const vRect = viewer.getBoundingClientRect();
                return rect.top - vRect.top;
              }
              const activeP = (scriptEl || viewer)?.querySelector('p.active') || null;
              if (activeP && viewer) {
                const rect = activeP.getBoundingClientRect();
                const vRect = viewer.getBoundingClientRect();
                return rect.top - vRect.top;
              }
              return markerTop();
            };
            const scrollBy = (dy) => {
              try {
                const next = Math.max(0, Math.min(viewer.scrollTop + dy, viewer.scrollHeight));
                if (typeof requestScroll === 'function') requestScroll(next);
                else viewer.scrollTop = next;
                const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
                const ratio = max
                  ? (typeof window.__lastScrollTarget === 'number'
                      ? window.__lastScrollTarget
                      : viewer.scrollTop) / max
                  : 0;
                sendToDisplay({
                  type: 'scroll',
                  top:
                    typeof window.__lastScrollTarget === 'number'
                      ? window.__lastScrollTarget
                      : viewer.scrollTop,
                  ratio,
                });
              } catch {}
            };
            // During the burst, relax clamp guard stickiness/min-delta for a short window
            try {
              window.__tpStallRelaxUntil = now + Math.max(400, Math.min(CATCHUP_BURST_MS, 1000));
            } catch {}
            __scrollCtl.startAutoCatchup(getAnchorY, getTargetY, scrollBy);
            setTimeout(() => {
              try {
                __scrollCtl.stopAutoCatchup();
                try {
                  window.__tpStallRelaxUntil = 0;
                } catch {}
                debug?.({ tag: 'stall:rescue:done', method: 'mid-catchup-burst' });
              } catch {}
            }, CATCHUP_BURST_MS);
          } catch {}
        }

        // Mid-script micro-nudge: if stalled but not bottomish, gently poke the scroller forward
        // to break sticky/min-delta traps. Keep rare and small to avoid visible jumps.
        if (
          stalled &&
          !(bottomish || docBottomish) &&
          cooldownOk &&
          !catchupActive &&
          window.currentIndex !== window.__tpCommit.idx
        ) {
          onUserAutoNudge(); // Gate soft-advance during mid-script micro-nudge
          try {
            debug?.({ tag: 'stall:nudge', reason: 'mid-script' });
          } catch {}
          _lastRescueAt = now;
          try {
            // Temporarily relax clamp guard and apply a tiny nudge
            window.__tpStallRelaxUntil = now + 350;
          } catch {}
          try {
            const step = 48; // px
            const next = Math.max(0, Math.min(viewer.scrollTop + step, viewer.scrollHeight));
            if (typeof requestScroll === 'function') requestScroll(next);
            else viewer.scrollTop = next;
            const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
            const ratio = max
              ? (typeof window.__lastScrollTarget === 'number'
                  ? window.__lastScrollTarget
                  : viewer.scrollTop) / max
              : 0;
            sendToDisplay({
              type: 'scroll',
              top:
                typeof window.__lastScrollTarget === 'number'
                  ? window.__lastScrollTarget
                  : viewer.scrollTop,
              ratio,
            });
          } catch {}
          setTimeout(() => {
            try {
              window.__tpStallRelaxUntil = 0;
            } catch {}
          }, 375);
        }
      }, TICK_MS);
    })();

    // After wiring open/close for the overlay:
    (window.__help?.ensureHelpUI || ensureHelpUI)(); // <- renames “Shortcuts” to “Help” and injects Normalize + Validate

    // Query all elements once
    shortcutsBtn = document.getElementById('shortcutsBtn');
    shortcutsOverlay = document.getElementById('shortcutsOverlay');
    shortcutsClose = document.getElementById('shortcutsClose');

    editor = document.getElementById('editor');
    scriptEl = document.getElementById('script');
    viewer = document.getElementById('viewer');
    legendEl = document.getElementById('legend');
    debugPosChip = document.getElementById('debugPosChip');

    // --- Scripts Store UI wiring (dynamic import to keep boot small) ---
    let ScriptsModule = null;
    let currentScriptId = null;
    const scriptSlots = document.getElementById('scriptSlots');
    const scriptTitle = document.getElementById('scriptTitle');
    const scriptSaveBtn = document.getElementById('scriptSaveBtn');
    const scriptSaveAsBtn = document.getElementById('scriptSaveAsBtn');
    const scriptLoadBtn = document.getElementById('scriptLoadBtn');
    const scriptDeleteBtn = document.getElementById('scriptDeleteBtn');
    const scriptRenameBtn = document.getElementById('scriptRenameBtn');

    function getEditorContent() {
      return editor ? editor.value : '';
    }
    function setEditorContent(txt) {
      if (editor) editor.value = String(txt || '');
    }

    async function initScriptsUI() {
      try {
  if (!ScriptsModule) {
          try {
            ScriptsModule = await import('./scriptsStore_fixed.js');
          } catch {
            try {
              console.error('[ScriptsModule] import ./scriptsStore_fixed.js failed', impErr);
            } catch {}
            // Try to recover by using a global window.Scripts if present
            if (typeof window !== 'undefined' && window.Scripts) {
              ScriptsModule = { Scripts: window.Scripts };
            } else {
              // final fallback: try the legacy path
              try {
                ScriptsModule = await import('./scriptsStore.js');
              } catch {
                try {
                  console.error('[ScriptsModule] fallback import ./scriptsStore.js failed', legacyErr);
                } catch {}
                ScriptsModule = null;
              }
            }
          }
        }
        if (!ScriptsModule || !ScriptsModule.Scripts) throw new Error('Scripts module not available');
        ScriptsModule.Scripts.init();
        refreshScriptsDropdown();
      } catch {
        console.error('initScriptsUI failed', e);
      }
    }

    function refreshScriptsDropdown() {
      try {
        if (!ScriptsModule) return;
        const list = ScriptsModule.Scripts.list().sort((a, b) =>
          b.updated.localeCompare(a.updated)
        );
        if (!scriptSlots) return;
        scriptSlots.innerHTML = list
          .map((s) => `<option value="${s.id}">${s.title}</option>`)
          .join('');
        if (currentScriptId) scriptSlots.value = currentScriptId;
      } catch {
        void e;
      }
    }

    async function onScriptSave() {
      try {
  if (!ScriptsModule) {
          try {
            ScriptsModule = await import('./scriptsStore_fixed.js');
          } catch {
            try {
              console.error('[ScriptsModule] import failed in onScriptSave', impErr);
            } catch {}
            if (typeof window !== 'undefined' && window.Scripts) ScriptsModule = { Scripts: window.Scripts };
          }
        }
        const title = scriptTitle && scriptTitle.value ? scriptTitle.value : 'Untitled';
        if (!ScriptsModule || !ScriptsModule.Scripts || typeof ScriptsModule.Scripts.save !== 'function') {
          throw new Error('Scripts.save not available');
        }
        currentScriptId = ScriptsModule.Scripts.save({ id: currentScriptId, title, content: getEditorContent() });
        refreshScriptsDropdown();
        _toast('Script saved', { type: 'ok' });
      } catch {
        try {
          console.error('[Scripts.save] error', e);
        } catch {
          void err;
        }
        // expose last save error for diagnostics and attach a session fallback
        try {
          window.__lastScriptSaveError = { message: e && e.message, stack: e && e.stack };
          const _fallback = { title: scriptTitle && scriptTitle.value ? scriptTitle.value : 'Untitled', content: getEditorContent(), at: Date.now() };
          try {
            sessionStorage.setItem('tp_last_unsaved_script', JSON.stringify(_fallback));
            _toast('Save failed — content saved to session storage', { type: 'error' });
          } catch {
            _toast('Save failed', { type: 'error' });
          }
        } catch {
          _toast('Save failed', { type: 'error' });
        }
      }
    }

    async function onScriptSaveAs() {
      currentScriptId = null;
      await onScriptSave();
    }

    function onScriptLoad() {
      try {
        if (!ScriptsModule) return;
        const id = scriptSlots && scriptSlots.value;
        if (!id) return;
        const s = ScriptsModule.Scripts.get(id);
        if (!s) return;
        currentScriptId = s.id;
        if (scriptTitle) scriptTitle.value = s.title || 'Untitled';
        setEditorContent(s.content || '');
        _toast('Script loaded', { type: 'ok' });
      } catch {
        console.debug('Scripts.load error', e);
        _toast('Load failed', { type: 'error' });
      }
    }

    function onScriptDelete() {
      try {
        if (!ScriptsModule || !currentScriptId) return;
        ScriptsModule.Scripts.remove(currentScriptId);
        currentScriptId = null;
        scriptTitle && (scriptTitle.value = '');
        refreshScriptsDropdown();
        _toast('Script deleted', {});
      } catch {
        console.debug('Scripts.delete error', e);
        _toast('Delete failed', { type: 'error' });
      }
    }

    function onScriptRename() {
      try {
        if (!ScriptsModule || !currentScriptId) return;
        const t = prompt(
          'Rename script to:',
          scriptTitle ? scriptTitle.value || 'Untitled' : 'Untitled'
        );
        if (t) {
          ScriptsModule.Scripts.rename(currentScriptId, t);
          scriptTitle && (scriptTitle.value = t);
          refreshScriptsDropdown();
        }
      } catch {
        console.debug('Scripts.rename error', e);
      }
    }

    // wire buttons if present
    try {
      scriptSaveBtn && scriptSaveBtn.addEventListener('click', onScriptSave);
      scriptSaveAsBtn && scriptSaveAsBtn.addEventListener('click', onScriptSaveAs);
      scriptLoadBtn && scriptLoadBtn.addEventListener('click', onScriptLoad);
      scriptDeleteBtn && scriptDeleteBtn.addEventListener('click', onScriptDelete);
      scriptRenameBtn && scriptRenameBtn.addEventListener('click', onScriptRename);
      if (scriptSlots)
        scriptSlots.addEventListener('change', () => {
          /* no-op: load via Load button */
        });
    } catch {}

    // autosave debounce (optional)
    let _autosaveTimer = null;
    if (editor) {
      editor.addEventListener('input', () => {
        clearTimeout(_autosaveTimer);
        _autosaveTimer = setTimeout(() => {
          if (currentScriptId) onScriptSave();
        }, 1000);
      });
    }

    // initialize scripts UI after boot
    setTimeout(initScriptsUI, 200);

    permChip = document.getElementById('permChip');
    displayChip = document.getElementById('displayChip');
    recChip = document.getElementById('recChip');
    scrollChip = document.getElementById('scrollChip');
    // Rec chip UI helper — accessible API
    // Usage:
    // window.setRecChip('recording') // backward-compatible
    // window.setRecChip({ text: 'Speech: listening…', tone: 'ok', assertive: false, busy: true })
    window.setRecChip = function (state) {
      try {
        const el = document.getElementById('recChip');
        if (!el) return;

        // Helper to actually set the text and attributes
        const apply = ({ text = '', tone = 'neutral', assertive = false, busy = false } = {}) => {
          try {
            // set aria-live depending on severity
            el.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
            el.setAttribute('aria-atomic', 'true');
            if (busy) el.setAttribute('aria-busy', 'true');
            else el.removeAttribute('aria-busy');

            // optional styling hook
            try {
              el.dataset.tone = tone;
            } catch {}

            // update classes for visual state mapping
            el.classList.remove('rec-recording', 'idle');
            const txt = String(text || '');
            if (/record/i.test(txt)) el.classList.add('rec-recording');
            else el.classList.add('idle');

            // update content last so screen readers pick up changes
            el.textContent = txt || 'Idle';
          } catch {
            // noop
          }
        };

        // Backwards-compatible simple string handling
        if (typeof state === 'string' || typeof state === 'number') {
          const s = String(state || '').toLowerCase();
          if (s === 'recording' || s === 'record') {
            apply({ text: 'Recording...', tone: 'ok', assertive: false, busy: true });
          } else if (/listening|listening\u2026|preparing/i.test(s)) {
            apply({ text: 'Speech: listening…', tone: 'ok', assertive: false, busy: true });
          } else if (/unavailable|unsupported|error/i.test(s)) {
            apply({ text: 'Speech: unavailable', tone: 'error', assertive: true, busy: false });
          } else {
            apply({ text: 'Idle', tone: 'neutral', assertive: false, busy: false });
          }
          return;
        }

        // If an object is passed, accept keys: text, tone, assertive, busy
        if (state && typeof state === 'object') {
          apply(state);
          return;
        }

        // fallback
        apply({ text: 'Idle', tone: 'neutral', assertive: false, busy: false });
      } catch {
        void 0;
      }
    };
    // OBS runtime flags (safe defaults)
    window.__obsConnected = false;
    window.__obsRecArmed = false;
    window.__obsLastRecEventAt = 0;
    // Unified OBS command helper: use recorder adapter exclusively (preferred)
    window.obsCommand = function (cmd) {
      try {
        if (window.__recorder && typeof window.__recorder.get === 'function') {
          const a = window.__recorder.get('obs');
          const t = cmd && cmd.d && cmd.d.requestType;
          if (t === 'StartRecord' && a && typeof a.start === 'function') {
            try {
              a.start();
              return true;
            } catch {}
          }
          if (t === 'StopRecord' && a && typeof a.stop === 'function') {
            try {
              a.stop();
              return true;
            } catch {}
          }
        }
      } catch {
        void e;
      }
      return false;
    };

    // Live OBS connection status: probe adapter and listen to raw socket open/close if present
    (function setupObsStatus() {
      try {
        const statusEl = document.getElementById('obsConnStatus');
        const updateStatus = async () => {
          try {
            let text = 'OBS: unknown';
            let cls = '';
            // Prefer the new obsBridge if available
            if (typeof window !== 'undefined' && window.__obsBridge) {
              try {
                // support sync or async isConnected() implementations
                let ok = window.__obsBridge.isConnected();
                if (ok && typeof ok.then === 'function') ok = await ok;
                text = ok ? 'OBS: ready' : 'OBS: offline';
                cls = ok ? 'ok' : 'error';
              } catch {
                text = 'OBS: offline';
                cls = 'error';
              }
            } else if (window.__recorder && typeof window.__recorder.get === 'function') {
              const a = window.__recorder.get('obs');
              if (a && typeof a.isAvailable === 'function') {
                try {
                  const ok = await a.isAvailable();
                  text = ok ? 'OBS: ready' : 'OBS: offline';
                  cls = ok ? 'ok' : 'error';
                } catch {
                  text = 'OBS: offline';
                  cls = 'error';
                }
              }
            }
            if (statusEl) {
              statusEl.textContent = text;
              // map to semantic chip classes
              statusEl.classList.remove('obs-connected', 'obs-reconnecting', 'idle');
              if (cls === 'ok') statusEl.classList.add('obs-connected');
              else if (/offline|error|disconnect/i.test(text || ''))
                statusEl.classList.add('obs-reconnecting');
              else statusEl.classList.add('idle');
            }
          } catch {}
        };
        // Initial probe
        setTimeout(updateStatus, 120);
        // Poll for status updates for a short period so that late-loading recorder/bridge
        // will replace the initial 'unknown' state. Poll every 2s up to ~30s.
        try {
          let tries = 0;
          const maxTries = 15;
          const pollId = setInterval(async () => {
            try {
              await updateStatus();
              tries++;
              // stop polling once status is no longer 'unknown' or max tries reached
              try {
                if (statusEl) {
                  const t = (statusEl.textContent || '').toLowerCase();
                  if (t.indexOf('unknown') < 0 || tries >= maxTries) clearInterval(pollId);
                } else if (tries >= maxTries) {
                  clearInterval(pollId);
                }
              } catch {
                if (tries >= maxTries) clearInterval(pollId);
              }
            } catch {
              tries++;
              if (tries >= maxTries) clearInterval(pollId);
            }
          }, 2000);
        } catch {}
        // If obsBridge exists, subscribe to its events for immediate updates
        try {
          if (typeof window !== 'undefined' && window.__obsBridge) {
            try {
              window.__obsBridge.on('connect', () => {
                try {
                  if (window.__TP_DEV) console.info('[OBS Bridge] connect');
                } catch {}
                setTimeout(updateStatus, 50);
              });
              window.__obsBridge.on('disconnect', () => {
                try {
                  if (window.__TP_DEV) console.info('[OBS Bridge] disconnect');
                } catch {}
                setTimeout(updateStatus, 50);
              });
              window.__obsBridge.on('recordstate', (active) => {
                try {
                  window.setRecChip(active ? 'recording' : 'idle');
                } catch {}
                try {
                  if (window.__TP_DEV) console.debug('[OBS Bridge] recordstate', active);
                } catch {}
              });
            } catch {}
          } else if (window.obsSocket && typeof window.obsSocket.addEventListener === 'function') {
            try {
              window.obsSocket.addEventListener('open', () => setTimeout(updateStatus, 50));
              window.obsSocket.addEventListener('close', () => setTimeout(updateStatus, 50));
            } catch {}
          }
        } catch {}
        // Expose manual refresh
        window.refreshObsStatus = updateStatus;
      } catch {}
    })();
    if (scrollChip) scrollChip.textContent = 'Scroll: idle';
    camRtcChip = document.getElementById('camRtcChip');

    openDisplayBtn = document.getElementById('openDisplayBtn');
    closeDisplayBtn = document.getElementById('closeDisplayBtn');
    presentBtn = document.getElementById('presentBtn');

    micBtn = document.getElementById('micBtn');
    recBtn = document.getElementById('recBtn');
    // (Legacy hidden micDeviceSel retained but not bound; use getMicSel())
    refreshDevicesBtn = document.getElementById('refreshDevicesBtn');

    fontSizeInput = document.getElementById('fontSize');
    lineHeightInput = document.getElementById('lineHeight');
    autoToggle = document.getElementById('autoToggle');
    autoSpeed = document.getElementById('autoSpeed');
    const catchUpBtn = document.getElementById('catchUpBtn');
    const matchAggroSel = document.getElementById('matchAggro');
    const motionSmoothSel = document.getElementById('motionSmooth');

    timerEl = document.getElementById('timer');
    resetBtn = document.getElementById('resetBtn');
    loadSample = document.getElementById('loadSample');
    clearText = document.getElementById('clearText');

    _downloadFileBtn = document.getElementById('downloadFile');
    _uploadFileBtn = document.getElementById('uploadFileBtn');
    _uploadFileInput = document.getElementById('uploadFile');
    // ensure we have a reference to the top dB meter container
    try {
      dbMeterTop = document.getElementById('dbMeterTop');
    } catch {}
    // Wire upload button to hidden file input and handle file change
    try {
      if (_uploadFileBtn && _uploadFileInput && !_uploadFileBtn.__wired) {
        _uploadFileBtn.__wired = true;
        _uploadFileBtn.addEventListener('click', function () {
          try {
            _uploadFileInput.click();
          } catch {}
        });
        _uploadFileInput.addEventListener('change', async function () {
          try {
            const f = _uploadFileInput.files && _uploadFileInput.files[0];
            if (!f) return;
            try {
              await _uploadFromFile(f);
            } catch {
              try { console.warn('uploadFromFile failed', err); } catch {}
            }
          } finally {
            try { _uploadFileInput.value = ''; } catch {}
          }
        });
      }
    } catch {}
    const scriptSelect = document.getElementById('scriptSelect');
    const _saveAsBtn = document.getElementById('saveAsBtn');
    const _loadBtn = document.getElementById('loadBtn');
    const _deleteBtn = document.getElementById('deleteBtn');
    const resetScriptBtn = document.getElementById('resetScriptBtn');

    wrapBold = document.getElementById('wrap-bold');
    wrapItalic = document.getElementById('wrap-italic');
    wrapUnderline = document.getElementById('wrap-underline');
    wrapNote = document.getElementById('wrap-note');
    wrapColor = document.getElementById('wrap-color');
    wrapBg = document.getElementById('wrap-bg');
    autoTagBtn = document.getElementById('autoTagBtn');

    nameS1 = document.getElementById('name-s1');
    colorS1 = document.getElementById('color-s1');
    wrapS1 = document.getElementById('wrap-s1');

    nameS2 = document.getElementById('name-s2');
    colorS2 = document.getElementById('color-s2');
    wrapS2 = document.getElementById('wrap-s2');

    nameG1 = document.getElementById('name-g1');
    colorG1 = document.getElementById('color-g1');
    wrapG1 = document.getElementById('wrap-g1');

    nameG2 = document.getElementById('name-g2');
    colorG2 = document.getElementById('color-g2');
    wrapG2 = document.getElementById('wrap-g2');

    camWrap = document.getElementById('camWrap');
    camVideo = document.getElementById('camVideo');
    // Ensure inline playback on mobile Safari without using unsupported HTML attribute in some browsers
    if (camVideo) {
      try {
        // Set properties first (best practice for autoplay/inline)
        camVideo.muted = true; // required for mobile autoplay
        camVideo.autoplay = true;
        camVideo.playsInline = true;
        // Hide native controls
        camVideo.controls = false;
        camVideo.removeAttribute('controls');
        camVideo.removeAttribute('controlsList');
        camVideo.disablePictureInPicture = true;
        camVideo.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback');
        // Then mirror as attributes for broader compatibility
        camVideo.setAttribute('playsinline', '');
        camVideo.setAttribute('webkit-playsinline', '');
      } catch {}
    }
    startCamBtn = document.getElementById('startCam');
    stopCamBtn = document.getElementById('stopCam');
    camDeviceSel = document.getElementById('camDevice');
    camSize = document.getElementById('camSize');
    camOpacity = document.getElementById('camOpacity');
    camMirror = document.getElementById('camMirror');
    camPiP = document.getElementById('camPiP');

    prerollInput = document.getElementById('preroll');
    countOverlay = document.getElementById('countOverlay');
    countNum = document.getElementById('countNum');
    // OBS toggle UI
    const enableObsChk = document.getElementById('enableObs');
    const obsStatus = document.getElementById('obsStatus');
    const obsUrlInput = document.getElementById('obsUrl');
    const obsPassInput = document.getElementById('obsPassword');
    const obsTestBtn = document.getElementById('obsTestBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsOverlay = document.getElementById('settingsOverlay');
    const settingsClose = document.getElementById('settingsClose');
    const settingsBody = document.getElementById('settingsBody');

    // Speakers toggle bits
    toggleSpeakersBtn = document.getElementById('toggleSpeakers');
    speakersBody = document.getElementById('speakersBody');

    if (!openDisplayBtn) {
      setStatus('Boot: DOM not ready / IDs missing');
      return;
    }
    // Initialize modular helpers now that viewer exists
    try {
      const shMod = await import((window.__TP_ADDV || ((p) => p))('./scroll-helpers.js'));
      const sh = shMod.createScrollerHelpers(() => viewer);
      __scrollHelpers = sh;
      _clampScrollTop = sh.clampScrollTop;
      scrollByPx = (px) => {
        sh.scrollByPx(px);
        try {
          updateDebugPosChip();
        } catch {}
      };
      _scrollToY = (y) => {
        sh.scrollToY(y);
        try {
          updateDebugPosChip();
        } catch {}
      };
      scrollToEl = (el, off = 0) => {
        sh.scrollToEl(el, off);
        try {
          updateDebugPosChip();
        } catch {}
      };
      requestScroll = (targetTop) => {
        // Forward-only scroll while HYBRID is on, with epsilon for floating math
        const now = __scrollCtl?.getViewerTop?.() || 0;
        const EPS = 0.75; // px
        if (isHybrid() && targetTop < now - EPS) return; // block back
        try {
          sh.requestScroll(targetTop);
        } catch {
          try {
            (
              window.requestScroll ||
              ((a) => window.scrollTo(0, (typeof a === 'object' ? a.top : a) || 0))
            )({ top: y });
          } catch {}
        }
        try {
          updateDebugPosChip();
        } catch {}
      };
    } catch {
      console.warn('scroll-helpers load failed', e);
    }

    try {
      const ioMod = await import((window.__TP_ADDV || ((p) => p))('./io-anchor.js'));
      __anchorObs = ioMod.createAnchorObserver(
        () => viewer,
        () => {
          try {
            updateDebugPosChip();
          } catch {}
        }
      );
    } catch {
      console.warn('io-anchor load failed', e);
    }
    try {
      const scMod = await import((window.__TP_ADDV || ((p) => p))('./scroll-control.js'));
      __scrollCtl = new scMod.default({
        getViewerTop: () => viewer.scrollTop,
        requestScroll: (top) => {
          viewer.scrollTop = top;
        },
        getViewportHeight: () => viewer.clientHeight,
        getViewerElement: () => viewer,
      });
    } catch {
      console.warn('scroll-control load failed', e);
    }
    try {
      const liMod = await import((window.__TP_ADDV || ((p) => p))('./line-index.js'));
      window.buildLineIndex = liMod.buildLineIndex;
    } catch {
      console.warn('line-index load failed', e);
    }
    // Dev-only: fixture loader (?fixture=name or ?fixtureUrl=encodedURL)
    try {
      const Q = new URLSearchParams(location.search);
      const fxName = Q.get('fixture');
      const fxUrl = Q.get('fixtureUrl');
      if ((window.__TP_DEV || Q.has('dev')) && (fxName || fxUrl)) {
        const url = fxUrl || `./fixtures/${fxName.replace(/[^a-z0-9._-]/gi, '')}.txt`;
        const resp = await fetch((window.__TP_ADDV || ((p) => p))(url));
        const txt = await resp.text();
        if (editor) editor.value = txt;
        renderScript(txt);
        console.info('[TP-Pro] Loaded fixture:', url);
      }
    } catch {
      void e;
    }
    // …keep the rest of your init() as-is…

    // Wire UI
    openDisplayBtn.addEventListener('click', openDisplay);
    closeDisplayBtn.addEventListener('click', closeDisplay);
    presentBtn.addEventListener('click', openDisplay);
    // Mark that core buttons have direct listeners (used by delegation heuristic)
    try {
      openDisplayBtn.__listenerAttached = true;
      closeDisplayBtn.__listenerAttached = true;
      presentBtn.__listenerAttached = true;
    } catch {
      void e;
    }
    window.__tpInitSuccess = true;
    console.log('[TP-Pro] _initCore mid (core UI wired)');

    // Kick recorder init (don't await; let it initialize in background)
    try {
      loadRecorder().then((rec) => {
        try {
          if (rec && typeof rec.init === 'function') {
            rec.init({
              getUrl: () =>
                document.getElementById('settingsObsUrl')?.value?.trim() ||
                obsUrlInput?.value?.trim() ||
                DEFAULT_OBS_URL,
              getPass: () =>
                document.getElementById('settingsObsPass')?.value ?? obsPassInput?.value ?? '',
              isEnabled: () => !!enableObsChk?.checked,
              onStatus: (txt, ok) => {
                try {
                  const via = document.getElementById('obsUrl')?.value || DEFAULT_OBS_URL;
                  const chip = document.getElementById('obsStatus') || document.getElementById('recChip');
                  if (chip) chip.textContent = `OBS: ${txt || ''}`;
                  // also mirror status into the settings-level connection chip (obsConnStatus)
                  try {
                    const connChip = document.getElementById('obsConnStatus');
                    if (connChip) {
                      connChip.textContent = txt ? `OBS: ${txt}` : 'OBS: unknown';
                      connChip.classList.remove('obs-connected', 'obs-reconnecting', 'idle');
                      if (ok) connChip.classList.add('obs-connected');
                      else if (/offline|error|disconnect/i.test(String(txt || ''))) connChip.classList.add('obs-reconnecting');
                      else connChip.classList.add('idle');
                    }
                  } catch {}
                  obsDebugLog(`status: ${txt || '(empty)'} (via ${via})`);
                } catch {}
                try {
                  _toast && _toast(txt, { type: ok ? 'ok' : 'error' });
                } catch {}
              },
              onRecordState: (state) => {
                try {
                  const chip = document.getElementById('recChip');
                  if (chip) chip.textContent = `Speech: ${state}`;
                  obsDebugLog(`record-state: ${state}`);
                } catch {}
              },
            });
          }
        } catch {
          console.warn('[TP-Pro] recorder.init() threw', e);
        }
      });
    } catch {
      void e;
    }

    fontSizeInput.addEventListener('input', applyTypography);
    lineHeightInput.addEventListener('input', applyTypography);

    autoToggle.addEventListener('click', () => {
      if (autoTimer) return stopAutoScroll();
      if (!parseFloat(autoSpeed.value)) {
        autoSpeed.value = localStorage.getItem('autoPxSpeed') || '25';
      }
      startAutoScroll();
    });

    autoSpeed.addEventListener('input', () => {
      const v = parseFloat(autoSpeed.value) || 0;
      localStorage.setItem('autoPxSpeed', String(v));
      if (!autoTimer) {
        autoToggle.textContent = v > 0 ? `Auto-scroll: ${v}px/s` : 'Auto-scroll: Off';
      }
    });

    // OBS enable toggle wiring (after recorder module possibly loaded)
    if (enableObsChk) {
      const applyFromSettings = () => {
        try {
          if (!__recorder?.getSettings) return;
          const s = __recorder.getSettings();
          const has = s.selected.includes('obs');
          enableObsChk.checked = has;
          if (obsStatus) obsStatus.textContent = has ? 'OBS: enabled' : 'OBS: disabled';
          // Prefill URL/password
          try {
            if (obsUrlInput && s.configs?.obs?.url) obsUrlInput.value = s.configs.obs.url;
            if (obsPassInput) {
              if (typeof s.configs?.obs?.password === 'string' && s.configs.obs.password) {
                obsPassInput.value = s.configs.obs.password;
              } else {
                // Prefer sessionStorage (secure-by-default), then localStorage if Remember checked
                try {
                  const pSess = sessionStorage.getItem('tp_obs_password');
                  if (pSess) {
                    obsPassInput.value = pSess;
                  } else {
                    try {
                      const rem = document.getElementById('settingsObsRemember');
                      const pLocal = localStorage.getItem('tp_obs_password');
                      if (rem && rem.checked && pLocal) obsPassInput.value = pLocal;
                    } catch {}
                  }
                } catch {}
              }
            }
          } catch {}
          // load default scene and reconnect preference
          try {
            const sceneEl = document.getElementById('settingsObsScene');
            if (sceneEl)
              sceneEl.value = s.configs?.obs?.scene || localStorage.getItem('tp_obs_scene') || '';
            const recEl = document.getElementById('settingsObsReconnect');
            if (recEl)
              recEl.checked =
                typeof s.configs?.obs?.reconnect === 'boolean'
                  ? s.configs.obs.reconnect
                  : localStorage.getItem('tp_obs_reconnect') === '1';
            // If bridge exists, configure it
            if (typeof window !== 'undefined' && window.__obsBridge) {
              try {
                window.__obsBridge.configure({
                  url: obsUrlInput?.value || s.configs?.obs?.url,
                  password: obsPassInput?.value || s.configs?.obs?.password || '',
                });
                window.__obsBridge.enableAutoReconnect(!!recEl?.checked);
              } catch {}
            }
          } catch {}
        } catch {}
      };
      applyFromSettings();
      enableObsChk.addEventListener('change', async () => {
        try {
          if (!__recorder?.getSettings || !__recorder?.setSettings) return;
          const s = __recorder.getSettings();
          let sel = s.selected.filter((id) => id !== 'obs');
          if (enableObsChk.checked) sel.push('obs');
          const cfgs = { ...(s.configs || {}) };
          if (!cfgs.obs)
            cfgs.obs = {
              url: obsUrlInput?.value || 'ws://192.168.1.200:4455',
              password: obsPassInput?.value || '',
            };
          __recorder.setSettings({ selected: sel, configs: cfgs });
          if (obsStatus)
            obsStatus.textContent = enableObsChk.checked ? 'OBS: enabled' : 'OBS: disabled';
          // Optionally check availability quickly
          if (enableObsChk.checked && __recorder.get('obs')?.isAvailable) {
            try {
              const ok = await __recorder.get('obs').isAvailable();
              if (obsStatus) obsStatus.textContent = ok ? 'OBS: ready' : 'OBS: offline';
            } catch {
              if (obsStatus) obsStatus.textContent = 'OBS: offline';
            }
          }
        } catch {}
      });

      // Also wire module-backed controls to the dynamic recorder (if present)
      try {
        // Toggle “Enable OBS” — update module enabled state and attempt connect/disconnect
        document.getElementById('enableObs')?.addEventListener('change', async (e) => {
          try {
            const reg = await loadRecorder();
            const rec = reg && typeof reg.get === 'function' ? reg.get('obs') : null;
            if (!rec) return;
            try {
              if (typeof rec.setEnabled === 'function') rec.setEnabled(!!e.target.checked);
            } catch {
              void err;
            }
            try {
              if (e.target.checked) await (rec.connect ? rec.connect() : Promise.resolve());
              else await (rec.disconnect ? rec.disconnect() : Promise.resolve());
            } catch {
              void err;
            }
          } catch {}
        });

        // URL / Password change ⇒ nudge reconnect (module may debounce)
        document.getElementById('obsUrl')?.addEventListener('change', async () => {
          try {
            const rec = await ensureObsAdapter();
            if (rec?.reconfigure) await rec.reconfigure();
          } catch {}
        });
        document.getElementById('obsPassword')?.addEventListener('change', async () => {
          try {
            const rec = await ensureObsAdapter();
            if (rec?.reconfigure) await rec.reconfigure();
          } catch {}
        });

        // Test button
        document.getElementById('obsTestBtn')?.addEventListener('click', async () => {
          try {
            const rec = await ensureObsAdapter();
            const ok = await (rec?.test ? rec.test() : Promise.resolve(false));
            const el = document.getElementById('obsStatus');
            if (el) el.textContent = ok ? 'OBS test: ok' : 'OBS test: failed';
          } catch {
            void e;
            try {
              const el = document.getElementById('obsStatus');
              if (el) el.textContent = 'OBS test: error';
            } catch {
              void e;
            }
          }
        });
        // Friendly hint: recommend OBS Virtual Camera when OBS is enabled
        try {
          const enableObs = document.getElementById('enableObs');
          enableObs?.addEventListener('change', () => {
            try {
              const on = !!enableObs.checked;
              const hint = document.getElementById('sidebarMediaHint');
              if (on && hint)
                hint.querySelector('.chip').textContent =
                  'OBS enabled — select “OBS Virtual Camera” above for Anvil view.';
              try {
                const obsAdapter = __recorder?.get && __recorder.get('obs');
                if (on) {
                  const s = document.getElementById('obsStatus');
                  if (s) s.textContent = 'OBS: connecting…';
                  obsAdapter?.connect?.();
                } else {
                  obsAdapter?.stop?.();
                  const s = document.getElementById('obsStatus');
                  if (s) s.textContent = 'OBS: disabled';
                }
              } catch {
                void ex;
              }
            } catch {
              void e;
            }
          });
        } catch {}
      } catch {}
    }

    // If an OBS raw websocket is exposed, listen for record state events to update UI
    try {
      if (window.obsSocket && typeof window.obsSocket.addEventListener === 'function') {
        window.obsSocket.addEventListener('message', (e) => {
          try {
            // Dev: raw message dump when TP_DEV enabled
            try {
              if (window.__TP_DEV) console.debug('[OBS WS] raw message', e.data);
            } catch {}
            const msg = JSON.parse(e.data || '{}');
            if (msg && msg.op === 5 && msg.d && msg.d.eventType === 'RecordStateChanged') {
              const active = !!(msg.d.eventData && msg.d.eventData.outputActive);
              window.__obsLastRecEventAt = Date.now();
              window.setRecChip(active ? 'recording' : 'idle');
              // clear armed flag when we see recording
              if (active) window.__obsRecArmed = false;
            }
          } catch {
            try {
              if (window.__TP_DEV) console.warn('[OBS WS] message parse failed', err);
            } catch {}
          }
        });
        // reflect socket open/close on UI chip
        try {
          window.obsSocket.addEventListener('open', () => {
            window.__obsConnected = true;
            try {
              if (window.__TP_DEV)
                console.info('[OBS WS] opened', obsUrlInput?.value || '<unknown>');
            } catch {}
            window.refreshObsStatus && window.refreshObsStatus();
          });
          window.obsSocket.addEventListener('close', (e) => {
            window.__obsConnected = false;
            try {
              if (window.__TP_DEV) console.info('[OBS WS] closed', e && e.code ? e.code : 'close');
            } catch {}
            window.refreshObsStatus && window.refreshObsStatus();
          });
          // Extra: surface low-level errors when available
          try {
            window.obsSocket.addEventListener('error', (err) => {
              try {
                if (window.__TP_DEV) console.warn('[OBS WS] error', err);
              } catch {}
            });
          } catch {}
        } catch {}
      }
    } catch {
      void e;
    }

    // Settings overlay wiring
      if (settingsBtn && settingsOverlay && settingsClose && settingsBody) {
        // Avoid wiring multiple times if script executed twice for any reason
        if (settingsBtn.dataset && settingsBtn.dataset.wired) return;
        try { settingsBtn.dataset.wired = '1'; } catch {}
      const openSettings = () => {
        try {
          buildSettingsContent();
        } catch {}
        // Auto-sync OBS fields from Settings -> main so adapters see values immediately
        try {
          const setUrl = document.getElementById('settingsObsUrl');
          const setPass = document.getElementById('settingsObsPass');
          const setRem = document.getElementById('settingsObsRemember');
          const mainUrl = document.getElementById('obsUrl');
          const mainPass = document.getElementById('obsPassword');
          if (setUrl && mainUrl && setUrl.value && setUrl.value.trim()) {
            mainUrl.value = setUrl.value.trim();
            try {
              mainUrl.dispatchEvent(new Event('change', { bubbles: true }));
            } catch {}
          }
          if (setPass && mainPass && setPass.value && setPass.value.trim()) {
            mainPass.value = setPass.value;
            try {
              // Fire both input and change so any listeners update
              mainPass.dispatchEvent(new Event('input', { bubbles: true }));
              mainPass.dispatchEvent(new Event('change', { bubbles: true }));
            } catch {}
          }
          // Mirror remember checkbox into main UI if present (no main checkbox exists, but persist preference)
          try {
            if (setRem) {
              localStorage.setItem('tp_obs_remember', setRem.checked ? '1' : '0');
            }
          } catch {}
          try {
            if (window.__TP_DEV) console.debug('[TP-Pro] synced Settings -> main (obs url/pass)');
          } catch {}
        } catch {}
        settingsOverlay.classList.remove('hidden');
        settingsBtn.setAttribute('aria-expanded', 'true');
      };
      // Prebuild asynchronously after main init so first open isn't empty if user opens quickly
      setTimeout(() => {
        try {
          buildSettingsContent();
        } catch {}
      }, 0);
      // Dev-only: render a compact OBS handshake log into #obsDevPane when present
      try {
        if (window && window._TP_DEV) {
          setInterval(() => {
            try {
              const pane = document.getElementById('obsDevPane');
              if (!pane) return;
              const logs = window.__obsLog || [];
              const tail = logs
                .slice(-20)
                .map((x) => ({ t: new Date(x.t).toLocaleTimeString(), ev: x.ev, data: x.data }));
              pane.textContent = tail.map((l) => JSON.stringify(l)).join('\n');
            } catch {
              void ex;
            }
          }, 500);
        }
      } catch {
        void ex;
      }
      const closeSettings = () => {
        settingsOverlay.classList.add('hidden');
        settingsBtn.setAttribute('aria-expanded', 'false');
      };
      settingsBtn.addEventListener('click', openSettings);
      settingsClose.addEventListener('click', closeSettings);
      settingsOverlay.addEventListener('click', (e) => {
        if (e.target === settingsOverlay) closeSettings();
      });
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !settingsOverlay.classList.contains('hidden')) closeSettings();
      });
    }

    // (Removed duplicate simple buildSettingsContent; using tabbed version defined earlier.)

    // wireSettingsDynamic moved to top-level (see earlier definition)

    // OBS URL/password change persistence (debounced lightweight)
    const saveObsConfig = () => {
      try {
        if (!__recorder?.getSettings || !__recorder?.setSettings) return;
        const s = __recorder.getSettings();
        const cfgs = { ...(s.configs || {}) };
        const prev = cfgs.obs || {};
        // Prefer main panel inputs when present; otherwise fall back to Settings inputs
        const urlEl = obsUrlInput || document.getElementById('settingsObsUrl');
        const passEl = obsPassInput || document.getElementById('settingsObsPass');
  const url = urlEl?.value || prev.url || 'ws://192.168.1.200:4455';
        const password = passEl?.value ?? prev.password ?? '';
        cfgs.obs = { ...prev, url, password };
        __recorder.setSettings({ configs: cfgs });
        // Persist password to sessionStorage by default; optionally to localStorage when 'remember' is checked
        try {
          if (typeof obsPassInput?.value === 'string') {
            try {
              sessionStorage.setItem('tp_obs_password', obsPassInput.value);
            } catch {}
            try {
              const rem = document.getElementById('settingsObsRemember');
              // persist the user's remember preference so the checkbox is stable across reloads
              try {
                localStorage.setItem('tp_obs_remember', rem && rem.checked ? '1' : '0');
              } catch {}
              if (rem && rem.checked) {
                localStorage.setItem('tp_obs_password', obsPassInput.value);
              } else {
                // If not remembering, remove any long-lived stored password
                try {
                  localStorage.removeItem('tp_obs_password');
                } catch {}
              }
            } catch {}
          }
        } catch {}
        // Save scene and reconnect preference
        try {
          const sceneEl = document.getElementById('settingsObsScene');
          if (sceneEl && typeof sceneEl.value === 'string') {
            try {
              localStorage.setItem('tp_obs_scene', sceneEl.value);
            } catch {}
          }
          const recEl = document.getElementById('settingsObsReconnect');
          if (recEl) {
            try {
              localStorage.setItem('tp_obs_reconnect', recEl.checked ? '1' : '0');
            } catch {}
            try {
              if (typeof window !== 'undefined' && window.__obsBridge)
                window.__obsBridge.enableAutoReconnect(!!recEl.checked);
            } catch {}
          }
        } catch {}
        if (obsStatus && enableObsChk?.checked) obsStatus.textContent = 'OBS: updated';
      } catch {}
    };
  obsUrlInput?.addEventListener('change', saveObsConfig);
  obsPassInput?.addEventListener('change', saveObsConfig);

    // When OBS fields change, reconfigure adapter immediately so it has latest values
    try {
      ['settingsObsUrl', 'obsUrl', 'settingsObsPass', 'obsPassword'].forEach((id) => {
        try {
          const el = document.getElementById(id);
          if (!el) return;
          el.addEventListener('change', () => {
            try {
              const obsAdapter = __recorder?.get && __recorder.get('obs');
              if (obsAdapter && typeof obsAdapter.configure === 'function') {
                const url =
                  (document.getElementById('obsUrl') || document.getElementById('settingsObsUrl'))
                    ?.value || '';
                const password =
                  (
                    document.getElementById('obsPassword') ||
                    document.getElementById('settingsObsPass')
                  )?.value || '';
                try {
                  obsAdapter.configure({
                    url: url,
                    password: password,
                    isEnabled: () => !!document.getElementById('enableObs')?.checked,
                    onStatus: (s, ok, meta) => {
                      try {
                        const st = document.getElementById('obsStatus');
                        if (st) {
                          // If meta contains attempt/backoffMs, include them for richer feedback
                          let suffix = '';
                          try {
                            if (meta && typeof meta === 'object') {
                              const a = meta.attempt || meta.attempt === 0 ? meta.attempt : null;
                              const b =
                                meta.backoffMs || meta.backoffMs === 0 ? meta.backoffMs : null;
                              if (a !== null && b !== null)
                                suffix = ` (attempt ${a}; retry ${b}ms)`;
                              else if (a !== null) suffix = ` (attempt ${a})`;
                              else if (b !== null) suffix = ` (retry ${b}ms)`;
                            }
                          } catch {
                            void ex;
                          }
                          st.textContent =
                            'OBS: ' + (ok ? 'connected' : String(s || 'failed')) + suffix;
                          // Keep full string in title for hover
                          try {
                            st.title = String(s || '') + (suffix ? ' ' + suffix : '');
                          } catch {
                            void e;
                          }
                        }
                      } catch {
                        void e;
                      }
                    },
                  });
                } catch {
                  void e;
                }
              }
            } catch {
              void ex;
            }
          });
        } catch {
          void ex;
        }
      });
    } catch {
      void ex;
    }

    // Test button (lazy-load bridge/recorder as needed)
    obsTestBtn?.addEventListener('click', async () => {
      if (obsStatus) obsStatus.textContent = 'OBS: testing…';
      try {
        saveObsConfig();
        // Try bridge first (lazy-import)
        const bridge = await ensureObsBridge();
        if (bridge && typeof bridge.getRecordStatus === 'function') {
          await bridge.getRecordStatus();
          if (obsStatus) obsStatus.textContent = 'OBS: ok';
          return;
        }
        // Fallback: ensure recorder module and call adapter test
        const recModule = await loadRecorder();
        const rec = recModule && typeof recModule.get === 'function' ? recModule.get('obs') : null;
        if (rec && typeof rec.test === 'function') {
          const ok = await rec.test();
          if (obsStatus) obsStatus.textContent = ok ? 'OBS: ok' : 'OBS: failed';
        } else {
          if (obsStatus) obsStatus.textContent = 'OBS: missing';
        }
      } catch (e) {
        if (obsStatus) {
          obsStatus.textContent = 'OBS: failed';
          try {
            const errMsg = (e && e.message) || String(e || '');
            obsStatus.title = errMsg;
            try {
              _toast('OBS test failed: ' + (errMsg || 'unknown error'), { type: 'error' });
            } catch {}
            try {
              console.warn('[OBS TEST] failed', { err: e, derived: errMsg, url: obsUrlInput?.value });
            } catch {}
          } catch {}
        }
      }
    });

    resetBtn.addEventListener('click', resetTimer);

    loadSample.addEventListener('click', () => {
      editor.value =
        'Welcome to [b]Teleprompter Pro[/b].\n\nUse [s1]roles[/s1], [note]notes[/note], and colors like [color=#ff0]this[/color].';
      renderScript(editor.value);
    });
    clearText.addEventListener('click', () => {
      editor.value = '';
      renderScript('');
    });

    // Top-bar Normalize button (near Load sample)
    const normalizeTopBtn = document.getElementById('normalizeTopBtn');
    if (normalizeTopBtn && !normalizeTopBtn.dataset.wired) {
      normalizeTopBtn.dataset.wired = '1';
      normalizeTopBtn.addEventListener('click', () => {
        if (typeof window.normalizeToStandard === 'function') {
          try {
            window.normalizeToStandard();
          } catch {
            alert('Normalize error: ' + e.message);
          }
          return;
        }
        // Shared fallback
        fallbackNormalize();
      });
    }

    // Populate dropdown from browser storage (single draft for now)
    function refreshScriptSelect() {
      if (!scriptSelect) return;
      const opts = [];
      try {
        if (localStorage.getItem(LS_KEY)) opts.push({ key: LS_KEY, name: 'Draft (browser)' });
      } catch {}
      scriptSelect.innerHTML = '';
      if (opts.length === 0) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = '— No saved draft —';
        scriptSelect.appendChild(o);
      } else {
        for (const it of opts) {
          const o = document.createElement('option');
          o.value = it.key;
          o.textContent = it.name;
          scriptSelect.appendChild(o);
        }
      }
    }
    refreshScriptSelect();

    // Save As -> writes to browser draft and refreshes dropdown
    obsTestBtn?.addEventListener('click', async () => {
      const msgEl = document.getElementById('settingsObsTestMsg');
      if (msgEl) {
        msgEl.textContent = '';
        msgEl.classList.remove('obs-test-ok', 'obs-test-error');
      }
      if (obsStatus) obsStatus.textContent = 'OBS: testing…';
      try {
        saveObsConfig();
        if (typeof window !== 'undefined' && window.__obsBridge) {
          await window.__obsBridge.getRecordStatus();
          if (obsStatus) obsStatus.textContent = 'OBS: ok';
          if (msgEl) {
            msgEl.textContent = 'OBS test: OK';
            msgEl.classList.add('obs-test-ok');
          }
        } else if (__recorder?.get && __recorder.get('obs')?.test) {
          await __recorder.get('obs').test();
          if (obsStatus) obsStatus.textContent = 'OBS: ok';
          if (msgEl) {
            msgEl.textContent = 'OBS test: OK';
            msgEl.classList.add('obs-test-ok');
          }
        } else {
          if (obsStatus) obsStatus.textContent = 'OBS: missing';
          if (msgEl) {
            msgEl.textContent = 'OBS test: adapter missing';
            msgEl.classList.add('obs-test-error');
          }
        }
      } catch {
        let errMsg = '';
        try {
          errMsg =
            (typeof window !== 'undefined' && window.__obsBridge && e?.message) ||
            __recorder.get('obs')?.getLastError?.() ||
            e?.message ||
            String(e);
        } catch {
          errMsg = String(e);
        }
        if (obsStatus) {
          obsStatus.textContent = 'OBS: failed';
          obsStatus.title = errMsg;
        }
        if (msgEl) {
          msgEl.textContent = 'OBS test failed: ' + (errMsg || 'unknown error');
          msgEl.classList.add('obs-test-error');
        }
        try {
          _toast('OBS test failed: ' + (errMsg || 'unknown error'), { type: 'error' });
        } catch {}
        try {
          console.warn('[OBS TEST] failed', { err: e, derived: errMsg, url: obsUrlInput?.value });
        } catch {}
      }
    });

    editor.addEventListener('input', () => renderScript(editor.value));
    editor.addEventListener('paste', (ev) => {
      const dt = ev.clipboardData;
      if (!dt) return;
      const text = dt.getData('text/plain');
      if (!text) return;

      ev.preventDefault();
      const alreadyTagged = /\[(s1|s2|g1|g2)\]/i.test(text);
      const normalized = normalizeSimpleTagTypos(text);
      const converted = alreadyTagged ? normalized : smartTag(normalized);
      const start = editor.selectionStart,
        end = editor.selectionEnd;
      const v = editor.value;
      editor.value = v.slice(0, start) + converted + v.slice(end);
      editor.selectionStart = editor.selectionEnd = start + converted.length;
      renderScript(editor.value);
    });

    // Role inputs -> live update
    syncRoleInputs();
    [nameS1, colorS1, nameS2, colorS2, nameG1, colorG1, nameG2, colorG2].forEach((el) =>
      el?.addEventListener('input', onRoleChange)
    );
    updateLegend();

    wrapS1?.addEventListener('click', () => wrapSelection('[s1]', '[/s1]'));
    wrapS2?.addEventListener('click', () => wrapSelection('[s2]', '[/s2]'));
    wrapG1?.addEventListener('click', () => wrapSelection('[g1]', '[/g1]'));
    wrapG2?.addEventListener('click', () => wrapSelection('[g2]', '[/g2]'));

    wrapBold?.addEventListener('click', () => wrapSelection('[b]', '[/b]'));
    wrapItalic?.addEventListener('click', () => wrapSelection('[i]', '[/i]'));
    wrapUnderline?.addEventListener('click', () => wrapSelection('[u]', '[/u]'));
    wrapNote?.addEventListener('click', () => wrapSelection('[note]', '[/note]'));
    wrapColor?.addEventListener('click', () => {
      const c = prompt('Color (name or #hex):', '#ff0');
      if (!c) return;
      wrapSelection(`[color=${c}]`, '[/color]');
    });
    wrapBg?.addEventListener('click', () => {
      const c = prompt('Background (name or #hex):', '#112233');
      if (!c) return;
      wrapSelection(`[bg=${c}]`, '[/bg]');
    });

    autoTagBtn?.addEventListener('click', () => {
      editor.value = smartTag(editor.value);
      renderScript(editor.value);
    });

    // Reset Script -> clear draft, clear editor, reset view and sync
    resetScriptBtn?.addEventListener('click', resetScript);

    // Catch Up button: snap immediately to current line at 40% viewport height
    if (catchUpBtn && !catchUpBtn.dataset.wired) {
      catchUpBtn.dataset.wired = '1';
      catchUpBtn.addEventListener('click', () => {
        try {
          // Stop auto-catchup momentarily to avoid contention
          __scrollCtl?.stopAutoCatchup?.();
          const sc = getScroller();
          const offset = Math.round(sc.clientHeight * 0.4);
          // Prefer currentEl, else the paragraph for currentIndex, else most-visible
          const vis = __anchorObs?.mostVisibleEl?.() || null;
          let el =
            currentEl ||
            paraIndex.find((p) => currentIndex >= p.start && currentIndex <= p.end)?.el ||
            vis ||
            null;
          if (!el && Array.isArray(lineEls)) el = lineEls[0] || null;
          if (el) {
            scrollToEl(el, offset);
            const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
            const ratio = max ? sc.scrollTop / max : 0;
            sendToDisplay({ type: 'scroll', top: sc.scrollTop, ratio });
          }
        } catch {}
      });
    }

    // Mic and devices
    micBtn?.addEventListener('click', requestMic);
    refreshDevicesBtn?.addEventListener('click', populateDevices);

    // Recognition on/off (placeholder toggle)
    recBtn?.addEventListener('click', () => {
      const isOn = mode !== 'OFF';
      toggleSpeechSync(!isOn);
    });

    // Speech availability hint: disable if unsupported
    try {
      const SRAvail = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SRAvail) {
        if (recBtn) {
          recBtn.disabled = true;
          recBtn.title = 'Speech recognition not supported in this browser';
        }
        if (recChip) {
          recChip.textContent = 'Speech: unsupported';
        }
      } else {
        // Supported → ensure the button is enabled (HTML defaults to disabled)
        if (recBtn) {
          recBtn.disabled = false;
          try {
            recBtn.removeAttribute('title');
            recBtn.classList.add('btn-primary', 'btn-start');
            recBtn.title = 'Start speech sync';
          } catch {}
        }
      }
    } catch {}

    // dB meter power save: suspend AudioContext when tab hidden, resume on return
    document.addEventListener('visibilitychange', () => {
      try {
        if (!audioCtx) return;
        if (document.hidden) {
          if (audioCtx.state === 'running') audioCtx.suspend();
        } else {
          if (audioCtx.state === 'suspended') audioCtx.resume();
        }
      } catch {}
    });
    // Extra safety: some browsers fire blur/focus without visibilitychange (e.g., alt-tab quickly)
    window.addEventListener('focus', () => {
      try {
        if (audioCtx?.state === 'suspended') audioCtx.resume();
      } catch {}
    });
    window.addEventListener('blur', () => {
      try {
        if (audioCtx?.state === 'running' && document.hidden) audioCtx.suspend();
      } catch {}
    });

    // Tiny wink: Shift+click Rec to hint at future calibration
    if (recBtn) {
      recBtn.addEventListener(
        'click',
        (e) => {
          if (e.shiftKey) {
            try {
              setStatus && setStatus('Calibration read: listen for pace… (coming soon)');
            } catch {}
            // future: sample speech rate and tune MATCH_WINDOW_AHEAD, thresholds, etc.
          }
        },
        { capture: true }
      ); // capture so it runs before the normal handler
    }

    // Camera
    startCamBtn?.addEventListener('click', startCamera);
    stopCamBtn?.addEventListener('click', stopCamera);
    camDeviceSel?.addEventListener('change', () => {
      if (camVideo?.srcObject) startCamera();
    });
    camSize?.addEventListener('input', applyCamSizing);
    camOpacity?.addEventListener('input', applyCamOpacity);
    camMirror?.addEventListener('change', applyCamMirror);
    camPiP?.addEventListener('click', togglePiP);

    // TP: display-handshake
    // Display handshake: accept either a string ping or a typed object
    window.addEventListener('message', async (e) => {
      if (!displayWin || e.source !== displayWin) return;
      if (e.data === 'DISPLAY_READY' || e.data?.type === 'display-ready') {
        displayReady = true;
        // Stop any outstanding hello ping loop
        if (displayHelloTimer) {
          clearInterval(displayHelloTimer);
          displayHelloTimer = null;
        }
        displayChip.textContent = 'Display: ready';
        // push initial state
        sendToDisplay({
          type: 'render',
          html: scriptEl.innerHTML,
          fontSize: fontSizeInput.value,
          lineHeight: lineHeightInput.value,
        });
        // also push explicit typography in case display needs to apply restored prefs
        sendToDisplay({
          type: 'typography',
          fontSize: fontSizeInput.value,
          lineHeight: lineHeightInput.value,
        });
        {
          const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
          const ratio = max ? viewer.scrollTop / max : 0;
          sendToDisplay({ type: 'scroll', top: viewer.scrollTop, ratio });
        }
        closeDisplayBtn.disabled = false;
        // If user intended camera mirroring, (re)establish
        try {
          if (wantCamRTC && camStream) ensureCamPeer();
        } catch {}
      } else if (e.data?.type === 'cam-answer' && camPC) {
        try {
          const st = camPC.signalingState;
          if (st !== 'have-local-offer') {
            // Ignore late/duplicate answers; we're either already stable or in an unexpected state
            camAwaitingAnswer = false;
            return;
          }
          const desc = { type: 'answer', sdp: e.data.sdp };
          await camPC.setRemoteDescription(desc);
          camAwaitingAnswer = false;
        } catch {}
      } else if (e.data?.type === 'cam-ice' && camPC) {
        try {
          // Only add ICE candidates once we have a remote description, else some browsers throw
          if (camPC.remoteDescription && camPC.remoteDescription.type) {
            await camPC.addIceCandidate(e.data.candidate);
          } else {
            // Buffer or drop silently; for simplicity, drop to avoid complex buffering here
          }
        } catch {}
      }
    });

    // (Removed stray buildDbBars() call without target; meter already built earlier.)

    // Restore UI prefs from localStorage (if any)
    const FONT_KEY = 'tp_font_size_v1';
    const LINE_KEY = 'tp_line_height_v1';
    try {
      const savedFont = localStorage.getItem(FONT_KEY);
      if (savedFont && fontSizeInput) fontSizeInput.value = savedFont;
    } catch {}
    try {
      const savedLH = localStorage.getItem(LINE_KEY);
      if (savedLH && lineHeightInput) lineHeightInput.value = savedLH;
    } catch {}
    const AGGRO_KEY = 'tp_match_aggro_v1';
    // Dev tuning persistence keys
    const TUNE_KEY = 'tp_match_tuning_v1';
    const TUNE_ENABLE_KEY = 'tp_match_tuning_enabled_v1';
    let _tunePanelEl = null;
    let _tuneInputs = {};
    const DEV_MODE =
      /[?&]dev=1/.test(location.search) ||
      location.hash.includes('dev') ||
      (() => {
        try {
          return localStorage.getItem('tp_dev_mode') === '1';
        } catch {
          return false;
        }
      })();
    try {
      const savedAggro = localStorage.getItem(AGGRO_KEY);
      // If Calm mode is requested (e.g. ?calm=1) force conservative behavior for tests.
      if (typeof CALM !== 'undefined' && CALM && matchAggroSel) {
        matchAggroSel.value = '1';
      } else if (savedAggro && matchAggroSel) {
        matchAggroSel.value = savedAggro;
      } else if (matchAggroSel) {
        // No saved preference: default to Conservative for deterministic runs
        matchAggroSel.value = '1';
      }
    } catch {}
    const SMOOTH_KEY = 'tp_motion_smooth_v1';
    try {
      const savedSmooth = localStorage.getItem(SMOOTH_KEY);
      // Calm mode prefers the calm/stable motion profile
      if (typeof CALM !== 'undefined' && CALM && motionSmoothSel) {
        motionSmoothSel.value = 'stable';
      } else if (savedSmooth && motionSmoothSel) {
        motionSmoothSel.value = savedSmooth;
      } else if (motionSmoothSel) {
        // Default to Stable for deterministic runs
        motionSmoothSel.value = 'stable';
      }
    } catch {}

    // TP: initial-render
    // Initial render
    renderScript(editor.value || '');
    // Apply aggressiveness mapping now and on change
    // TP: matcher-tunables
    function applyAggro() {
      const v = matchAggroSel?.value || '2';
      if (v === '1') {
        // Conservative: require higher similarity, smaller search windows, stricter forward jumping
        SIM_THRESHOLD = 0.62;
        MATCH_WINDOW_AHEAD = 140;
        MATCH_WINDOW_BACK = 20;
        STRICT_FORWARD_SIM = 0.82;
        MAX_JUMP_AHEAD_WORDS = 8;
      } else if (v === '4') {
        // Aggressive live-read: fastest catch for rapid speakers; very permissive similarity, broad forward window
        // Intent: minimize lag when reader sprints ahead; accept earlier fuzzy alignment
        SIM_THRESHOLD = 0.46; // slightly below preset 3 to allow earlier partial matches
        MATCH_WINDOW_AHEAD = 240; // wide look-ahead similar to '3'
        MATCH_WINDOW_BACK = 40; // allow some recovery if we overshoot
        STRICT_FORWARD_SIM = 0.62; // relax strict forward gate further
        MAX_JUMP_AHEAD_WORDS = 22; // permit larger forward corrections in one step
      } else if (v === '3') {
        // Aggressive: lower similarity bar, broader windows, allow larger forward nudges
        SIM_THRESHOLD = 0.48;
        MATCH_WINDOW_AHEAD = 240;
        MATCH_WINDOW_BACK = 40;
        STRICT_FORWARD_SIM = 0.65;
        MAX_JUMP_AHEAD_WORDS = 18;
      } else {
        // Normal/balanced defaults
        SIM_THRESHOLD = 0.42; // Raised from 0.35 to reduce false matches
        MATCH_WINDOW_AHEAD = 250; // Reduced from 400 to prevent false matches
        MATCH_WINDOW_BACK = 30;
        STRICT_FORWARD_SIM = 0.72;
        MAX_JUMP_AHEAD_WORDS = 12;
      }
      // Also map aggressiveness to scroll commit gate thresholds (consumed by scroll-control.js)
      try {
        // Defaults mirror scroll-control constants: FWD_SIM=0.82, BACK_SIM=0.86
        const gates = {
          1: { fwd: 0.85, back: 0.88 }, // Conservative
          2: { fwd: 0.82, back: 0.86 }, // Normal
          3: { fwd: 0.78, back: 0.84 }, // Aggressive
          4: { fwd: 0.75, back: 0.83 }, // Aggressive live-read
        };
        const g = gates[v] || gates['2'];
        window.__tpGateFwdSim = g.fwd;
        window.__tpGateBackSim = g.back;
        // Optionally expose for HUD/diagnostics
        window.__tpGate = { fwd: g.fwd, back: g.back, updatedAt: Date.now() };
      } catch {}
      // After applying preset, optionally override with custom tuning profile if enabled
      try {
        if (localStorage.getItem(TUNE_ENABLE_KEY) === '1') {
          const raw = localStorage.getItem(TUNE_KEY);
          if (raw) {
            const cfg = JSON.parse(raw);
            if (cfg && typeof cfg === 'object') {
              const n = (x) => typeof x === 'number' && !isNaN(x);
              if (n(cfg.SIM_THRESHOLD)) SIM_THRESHOLD = cfg.SIM_THRESHOLD;
              if (n(cfg.MATCH_WINDOW_AHEAD)) MATCH_WINDOW_AHEAD = cfg.MATCH_WINDOW_AHEAD;
              if (n(cfg.MATCH_WINDOW_BACK)) MATCH_WINDOW_BACK = cfg.MATCH_WINDOW_BACK;
              if (n(cfg.STRICT_FORWARD_SIM)) STRICT_FORWARD_SIM = cfg.STRICT_FORWARD_SIM;
              if (n(cfg.MAX_JUMP_AHEAD_WORDS)) MAX_JUMP_AHEAD_WORDS = cfg.MAX_JUMP_AHEAD_WORDS;
            }
          }
        }
      } catch {}
      // Reflect live constants in panel if open
      if (_tunePanelEl) populateTuningInputs();
    }
    applyAggro();
    matchAggroSel?.addEventListener('change', (_e) => {
      applyAggro();
      try {
        localStorage.setItem(AGGRO_KEY, matchAggroSel.value || '2');
      } catch {}
    });

    // --- Dev-only tuning panel -------------------------------------------------
    function populateTuningInputs() {
      if (!_tuneInputs) return;
      const setV = (k, v) => {
        if (_tuneInputs[k]) _tuneInputs[k].value = String(v);
      };
      setV('SIM_THRESHOLD', SIM_THRESHOLD);
      setV('MATCH_WINDOW_AHEAD', MATCH_WINDOW_AHEAD);
      setV('MATCH_WINDOW_BACK', MATCH_WINDOW_BACK);
      setV('STRICT_FORWARD_SIM', STRICT_FORWARD_SIM);
      setV('MAX_JUMP_AHEAD_WORDS', MAX_JUMP_AHEAD_WORDS);
    }
    function applyFromInputs() {
      const getNum = (k) => {
        const v = parseFloat(_tuneInputs[k]?.value);
        return isFinite(v) ? v : undefined;
      };
      const newVals = {
        SIM_THRESHOLD: getNum('SIM_THRESHOLD'),
        MATCH_WINDOW_AHEAD: getNum('MATCH_WINDOW_AHEAD'),
        MATCH_WINDOW_BACK: getNum('MATCH_WINDOW_BACK'),
        STRICT_FORWARD_SIM: getNum('STRICT_FORWARD_SIM'),
        MAX_JUMP_AHEAD_WORDS: getNum('MAX_JUMP_AHEAD_WORDS'),
      };
      if (typeof newVals.SIM_THRESHOLD === 'number') SIM_THRESHOLD = newVals.SIM_THRESHOLD;
      if (typeof newVals.MATCH_WINDOW_AHEAD === 'number')
        MATCH_WINDOW_AHEAD = newVals.MATCH_WINDOW_AHEAD;
      if (typeof newVals.MATCH_WINDOW_BACK === 'number')
        MATCH_WINDOW_BACK = newVals.MATCH_WINDOW_BACK;
      if (typeof newVals.STRICT_FORWARD_SIM === 'number')
        STRICT_FORWARD_SIM = newVals.STRICT_FORWARD_SIM;
      if (typeof newVals.MAX_JUMP_AHEAD_WORDS === 'number')
        MAX_JUMP_AHEAD_WORDS = newVals.MAX_JUMP_AHEAD_WORDS;
    }
    function saveTuningProfile() {
      try {
        const payload = {
          SIM_THRESHOLD,
          MATCH_WINDOW_AHEAD,
          MATCH_WINDOW_BACK,
          STRICT_FORWARD_SIM,
          MAX_JUMP_AHEAD_WORDS,
          savedAt: Date.now(),
        };
        localStorage.setItem(TUNE_KEY, JSON.stringify(payload));
        const stamp = _tunePanelEl?.querySelector('[data-tune-status]');
        if (stamp) {
          stamp.textContent = 'Saved';
          setTimeout(() => {
            if (stamp.textContent === 'Saved') stamp.textContent = '';
          }, 1500);
        }
      } catch {}
    }
    function loadTuningProfile() {
      try {
        const raw = localStorage.getItem(TUNE_KEY);
        if (!raw) return false;
        const cfg = JSON.parse(raw);
        if (cfg && typeof cfg === 'object') {
          const n = (x) => typeof x === 'number' && !isNaN(x);
          if (n(cfg.SIM_THRESHOLD)) SIM_THRESHOLD = cfg.SIM_THRESHOLD;
          if (n(cfg.MATCH_WINDOW_AHEAD)) MATCH_WINDOW_AHEAD = cfg.MATCH_WINDOW_AHEAD;
          if (n(cfg.MATCH_WINDOW_BACK)) MATCH_WINDOW_BACK = cfg.MATCH_WINDOW_BACK;
          if (n(cfg.STRICT_FORWARD_SIM)) STRICT_FORWARD_SIM = cfg.STRICT_FORWARD_SIM;
          if (n(cfg.MAX_JUMP_AHEAD_WORDS)) MAX_JUMP_AHEAD_WORDS = cfg.MAX_JUMP_AHEAD_WORDS;
          return true;
        }
      } catch {}
      return false;
    }
    function toggleCustomEnabled(on) {
      try {
        localStorage.setItem(TUNE_ENABLE_KEY, on ? '1' : '0');
      } catch {}
      if (on) {
        if (!loadTuningProfile()) saveTuningProfile();
      } else {
        // Reapply preset to revert
        applyAggro();
      }
    }
    function ensureTuningPanel() {
      if (!DEV_MODE) return;
      if (_tunePanelEl) {
        _tunePanelEl.style.display = 'block';
        populateTuningInputs();
        return;
      }
      const div = document.createElement('div');
      div.id = 'tuningPanel';
      div.style.cssText =
        'position:fixed;bottom:8px;right:8px;z-index:9999;background:#111c;border:1px solid #444;padding:8px 10px;font:12px system-ui;color:#eee;box-shadow:0 2px 8px #0009;backdrop-filter:blur(4px);max-width:240px;line-height:1.3;border-radius:6px;';
      div.innerHTML = `\n        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">\n          <strong style="font-size:12px;">Matcher Tuning</strong>\n          <button data-close style="background:none;border:0;color:#ccc;cursor:pointer;font-size:14px;">✕</button>\n        </div>\n        <div style="display:grid;grid-template-columns:1fr 60px;gap:4px;">\n          <label style="display:contents;">SIM<th style="display:none"></th><input data-k="SIM_THRESHOLD" type="number" step="0.01" min="0" max="1"></label>\n          <label style="display:contents;">Win+<input data-k="MATCH_WINDOW_AHEAD" type="number" step="10" min="10" max="1000"></label>\n          <label style="display:contents;">Win-<input data-k="MATCH_WINDOW_BACK" type="number" step="1" min="0" max="200"></label>\n          <label style="display:contents;">Strict<input data-k="STRICT_FORWARD_SIM" type="number" step="0.01" min="0" max="1"></label>\n          <label style="display:contents;">Jump<input data-k="MAX_JUMP_AHEAD_WORDS" type="number" step="1" min="1" max="120"></label>\n        </div>\n        <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">\n          <button data-apply style="flex:1 1 auto;">Apply</button>\n          <button data-save style="flex:1 1 auto;">Save</button>\n        </div>\n        <label style="display:flex;align-items:center;gap:4px;margin-top:4px;">\n          <input data-enable type="checkbox"> Override presets\n        </label>\n        <div data-tune-status style="font-size:11px;color:#8ec;margin-top:2px;height:14px;"></div>\n        <div style="font-size:10px;color:#999;margin-top:4px;">Ctrl+Alt+T to re-open</div>\n      `;
      document.body.appendChild(div);
      _tunePanelEl = div;
      _tuneInputs = {};
      Array.from(div.querySelectorAll('input[data-k]')).forEach((inp) => {
        _tuneInputs[inp.getAttribute('data-k')] = inp;
      });
      populateTuningInputs();
      // Load existing saved (but don't auto-enable)
      try {
        const raw = localStorage.getItem(TUNE_KEY);
        if (raw) {
          const cfg = JSON.parse(raw);
          if (cfg && typeof cfg === 'object') {
            for (const k of Object.keys(_tuneInputs))
              if (k in cfg && typeof cfg[k] === 'number') _tuneInputs[k].value = cfg[k];
          }
        }
      } catch {}
      // Reflect enabled
      try {
        const en = localStorage.getItem(TUNE_ENABLE_KEY) === '1';
        const cb = div.querySelector('input[data-enable]');
        if (cb) cb.checked = en;
      } catch {}
      div.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
        if (t.matches('[data-close]')) {
          div.style.display = 'none';
        } else if (t.matches('[data-apply]')) {
          applyFromInputs();
          populateTuningInputs();
        } else if (t.matches('[data-save]')) {
          applyFromInputs();
          saveTuningProfile();
        }
      });
      const enableCb = div.querySelector('input[data-enable]');
      if (enableCb)
        enableCb.addEventListener('change', () => {
          toggleCustomEnabled(enableCb.checked);
          if (enableCb.checked) {
            applyFromInputs();
            saveTuningProfile();
          }
        });
      // Live update on input (without saving)
      div.querySelectorAll('input[data-k]').forEach((inp) => {
        inp.addEventListener('input', () => {
          applyFromInputs();
        });
      });
    }
    // Keybinding to toggle panel (dev mode only)
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 't') {
        if (DEV_MODE) {
          ensureTuningPanel();

          e.preventDefault();
        }
      }
    });
    // Auto-create if dev hash present
    if (DEV_MODE && (location.hash.includes('devtune') || location.search.includes('devtune=1')))
      setTimeout(() => ensureTuningPanel(), 300);

    // If override enabled on load, ensure it applies AFTER initial preset
    setTimeout(() => {
      try {
        if (localStorage.getItem(TUNE_ENABLE_KEY) === '1') {
          // Re-run applyAggro to force preset then override
          applyAggro();
        }
      } catch {}
    }, 50);

    // Apply motion smoothness mapping now and on change
    // TP: motion-smoothness
    function applySmooth() {
      const v = motionSmoothSel?.value || 'balanced';
      // adjust soft scroll tunables used in advanceByTranscript and scrollToCurrentIndex
      if (v === 'stable') {
        window.__TP_SCROLL = {
          DEAD: 22,
          THROTTLE: 280,
          FWD: 80,
          BACK: 30,
          EASE_STEP: 48,
          EASE_MIN: 12,
          BOOST: false,
        };
        // Commit gate: smaller index steps and stricter stability for ultra-smooth motion
        try {
          window.__tpMaxCommitStep = 2; // per-commit index cap (smaller steps)
          window.__tpStableHits = 2; // keep hysteresis as-is for stability
        } catch {}
      } else if (v === 'responsive') {
        // less jitter: higher deadband/throttle, smaller back steps
        window.__TP_SCROLL = {
          DEAD: 20,
          THROTTLE: 240,
          FWD: 110,
          BACK: 50,
          EASE_STEP: 96,
          EASE_MIN: 6,
          BOOST: true,
        };
        try {
          window.__tpMaxCommitStep = 5; // faster catch-up but still bounded
          window.__tpStableHits = 1; // commit with fewer stable frames for responsiveness
        } catch {}
      } else {
        // balanced
        window.__TP_SCROLL = {
          DEAD: 22,
          THROTTLE: 260,
          FWD: 96,
          BACK: 40,
          EASE_STEP: 64,
          EASE_MIN: 10,
          BOOST: false,
        };
        try {
          window.__tpMaxCommitStep = 3;
          window.__tpStableHits = 2;
        } catch {}
      }
    }
    applySmooth();
    motionSmoothSel?.addEventListener('change', () => {
      applySmooth();
      try {
        localStorage.setItem(SMOOTH_KEY, motionSmoothSel.value || 'balanced');
      } catch {}
    });

    // Try to list devices
    populateDevices();
    setStatus('Ready.');
    // Fun extras (Konami theme, meter party, advanced tools, :roar) — call once at the very end
    try {
      (window.__eggs?.installEasterEggs || installEasterEggs)();
    } catch {}
    // CK watermark egg (toggleable)
    try {
      (window.__eggs?.installCKEgg || installCKEgg)();
    } catch {}

    // Run tiny self-checks to catch regressions fast
    try {
      setTimeout(runSelfChecks, 0);
    } catch {}

    // Keep bottom padding responsive to viewport changes
    try {
      window.addEventListener('resize', applyBottomPad, { passive: true });
    } catch {}
    // Update debug chip on scroll
    try {
      viewer?.addEventListener(
        'scroll',
        () => {
          updateDebugPosChip();
        },
        { passive: true }
      );
    } catch {}
    // Initial debug chip paint
    try {
      updateDebugPosChip();
    } catch {}
  }
  // Ensure placeholder render if script empty
  try {
    if (scriptEl && !scriptEl.innerHTML) {
      renderScript(editor?.value || '');
    }
  } catch {}
  console.log('[TP-Pro] _initCore end');

  // Calm Mode: CSS + guardrails to stabilize geometry and suppress external scrolls
  try {
    if (window.__TP_CALM && !window.__TP_CALM_CSS_INJECTED) {
      window.__TP_CALM_CSS_INJECTED = true;
      try {
        const st = document.createElement('style');
        st.setAttribute('data-tp-calm', '1');
        st.textContent = `
          #viewer, html, body { scroll-behavior: auto !important; overscroll-behavior: contain; }
          #viewer, #viewer * { scroll-snap-type: none !important; scroll-snap-align: none !important; }
        `;
        document.head.appendChild(st);
      } catch {}

      // Keep overlays from perturbing geometry
      try {
        ['#hud', '#help', '#debug', '#devpanel', '[data-tp-hud]'].forEach((sel) => {
          document.querySelectorAll(sel).forEach((n) => {
            try {
              n.style.position = 'fixed';
            } catch {}
          });
        });
      } catch {}

      // Optional: neutralize external scrollIntoView while CALM
      try {
        if (
          !window.__TP_SCROLL_INTO_VIEW_ORIG &&
          Element &&
          Element.prototype &&
          Element.prototype.scrollIntoView
        ) {
          window.__TP_SCROLL_INTO_VIEW_ORIG = Element.prototype.scrollIntoView;
          Element.prototype.scrollIntoView = function (...args) {
            try {
              if (!window.__TP_CALM) return window.__TP_SCROLL_INTO_VIEW_ORIG.apply(this, args);
              if (window.__TP_DEV)
                console.debug('[TP-Pro Calm] scrollIntoView suppressed for', this);
            } catch {}
          };
        }
      } catch {}
    }
  } catch {}

  // Calm Mode: highlight observer as a second trigger for smooth anchoring
  try {
    if (window.__TP_CALM) {
      const root =
        document.getElementById('script') ||
        document.querySelector('#viewer .script') ||
        document.getElementById('viewer') ||
        document.body;
      const sc =
        window.__TP_SCROLLER ||
        document.getElementById('viewer') ||
        document.scrollingElement ||
        document.documentElement ||
        document.body;

      const _isActive = (el) =>
        !!(
          el &&
          el.classList &&
          (el.classList.contains('current') || el.classList.contains('active'))
        ) ||
        (el &&
          typeof el.getAttribute === 'function' &&
          (el.getAttribute('data-active') === '1' || el.getAttribute('aria-current') === 'true'));
      const getActive = () =>
        root &&
        root.querySelector &&
        root.querySelector(
          '.current, .active, [data-active="1"], .tp-active, .spoken, [aria-current="true"]'
        );
      const anchor = (el) => {
        if (!el) return;
        try {
          const y = getYForElInScroller(el, sc, 0.38);
          tpScrollTo(y, sc);
        } catch {}
      };

      try {
        anchor(getActive());
      } catch {}
      try {
        new MutationObserver(() => {
          try {
            const cand = getActive();
            if (cand) anchor(cand);
          } catch {}
        }).observe(root, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['class', 'data-active', 'aria-current'],
        });
      } catch {}
    }
  } catch {
    try {
      console.warn('[TP-Pro Calm] highlight observer failed', e);
    } catch {}
  }

  /* ──────────────────────────────────────────────────────────────
   * Roles + Legend
   * ────────────────────────────────────────────────────────────── */
  function loadRoles() {
    try {
      return Object.assign({}, ROLE_DEFAULTS, JSON.parse(localStorage.getItem(ROLES_KEY) || '{}'));
    } catch {
      return { ...ROLE_DEFAULTS };
    }
  }
  function saveRoles(map) {
    localStorage.setItem(ROLES_KEY, JSON.stringify(map));
  }

  function syncRoleInputs() {
    if (nameS1) nameS1.value = ROLES.s1.name;
    if (colorS1) colorS1.value = ROLES.s1.color;
    if (nameS2) nameS2.value = ROLES.s2.name;
    if (colorS2) colorS2.value = ROLES.s2.color;
    if (nameG1) nameG1.value = ROLES.g1.name;
    if (colorG1) colorG1.value = ROLES.g1.color;
    if (nameG2) nameG2.value = ROLES.g2.name;
    if (colorG2) colorG2.value = ROLES.g2.color;
    applyRoleCssVars();
    broadcastSpeakerColors();
    broadcastSpeakerNames();
  }
  function onRoleChange() {
    ROLES.s1.name = nameS1?.value || ROLES.s1.name;
    ROLES.s1.color = colorS1?.value || ROLES.s1.color;
    ROLES.s2.name = nameS2?.value || ROLES.s2.name;
    ROLES.s2.color = colorS2?.value || ROLES.s2.color;
    ROLES.g1.name = nameG1?.value || ROLES.g1.name;
    ROLES.g1.color = colorG1?.value || ROLES.g1.color;
    ROLES.g2.name = nameG2?.value || ROLES.g2.name;
    ROLES.g2.color = colorG2?.value || ROLES.g2.color;
    saveRoles(ROLES);
    updateLegend();
    renderScript(editor.value);
    applyRoleCssVars();
    broadcastSpeakerColors();
    broadcastSpeakerNames();
  }
  function updateLegend() {
    if (!legendEl) return;
    legendEl.innerHTML = '';
    for (const key of ROLE_KEYS) {
      const item = ROLES[key];
      const tag = document.createElement('span');
      tag.className = 'tag';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = item.color;
      const name = document.createElement('span');
      name.textContent = item.name;
      tag.appendChild(dot);
      tag.appendChild(name);
      legendEl.appendChild(tag);
    }
  }
  function safeColor(c) {
    c = String(c || '').trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
    if (/^rgba?\(/i.test(c)) return c;
    if (/^[a-z]{3,20}$/i.test(c)) return c; // simple keyword
    return '';
  }
  function roleStyle(key) {
    const item = ROLES[key] || ROLES.s1;
    return `color:${item.color}; font-size:inherit; line-height:inherit;`;
  }

  /* ──────────────────────────────────────────────────────────────
   * Markup + Render
   * ────────────────────────────────────────────────────────────── */
  function normWord(w) {
    return String(w)
      .toLowerCase()
      .replace(/[^a-z0-9']/g, '');
  }
  function _splitWords(_t) {
    return String(_t).toLowerCase().split(/\s+/).map(normWord).filter(Boolean);
  }

  // TP: scroll-current-index
  function scrollToCurrentIndex() {
    if (!paraIndex.length) return;
    // End-of-script guard: stop further scrolling when at bottom
    try {
      if (atBottom(viewer)) return;
    } catch {}
    const p =
      paraIndex.find((p) => currentIndex >= p.start && currentIndex <= p.end) ||
      paraIndex[paraIndex.length - 1];

    // Zero scroll gravity for non-spoken lines: find next spoken paragraph
    let scrollTarget = p;
    if (p.isNonSpoken) {
      // Find the next spoken paragraph after current position
      const currentParaIndex = paraIndex.indexOf(p);
      for (let i = currentParaIndex + 1; i < paraIndex.length; i++) {
        if (!paraIndex[i].isNonSpoken) {
          scrollTarget = paraIndex[i];
          break;
        }
      }
      // If no spoken paragraph found after, use the current non-spoken one
      if (scrollTarget === p) {
        scrollTarget = p;
      }
    }
    // Highlight active paragraph (optional)
    paraIndex.forEach((pi) => pi.el.classList.toggle('active', pi === p));
    // Center-ish scroll (use scrollTarget for non-spoken lines)
    let target = Math.max(0, scrollTarget.el.offsetTop - viewer.clientHeight * 0.4);
    // Anti-backscroll near bottom: avoid moving upward more than a tiny epsilon when bottomish
    try {
      const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
      const ratio = max ? viewer.scrollTop / max : 0;
      const DOC_THR =
        typeof window.__tpDocBottomRatio === 'number' ? window.__tpDocBottomRatio : 0.72;
      if (ratio > DOC_THR && target < viewer.scrollTop) {
        const EPS = typeof window.__tpEndEpsilonPx === 'number' ? window.__tpEndEpsilonPx : 2;
        target = Math.max(viewer.scrollTop - EPS, target);
      }
    } catch {}
    // gentle ease towards target (use smoothness prefs if present)
    const S = window.__TP_SCROLL || { EASE_STEP: 80, EASE_MIN: 10 };
    const dy = target - viewer.scrollTop;
    if (Math.abs(dy) > S.EASE_MIN) {
      // Dynamic ease step: speed up when far or near the end to avoid perceived slowdown
      let step = S.EASE_STEP;
      const absdy = Math.abs(dy);
      if (absdy > 400) step = Math.max(step, Math.min(160, Math.floor(absdy * 0.4)));
      try {
        const maxScroll = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
        const ratio = maxScroll ? viewer.scrollTop / maxScroll : 0;
        const boost = (window.__TP_SCROLL && window.__TP_SCROLL.BOOST) === true;
        if (boost) {
          if (ratio >= 0.75) step = Math.floor(step * 1.5);
          else if (ratio >= 0.6) step = Math.floor(step * 1.25);
        }
      } catch {}
      viewer.scrollTop += Math.sign(dy) * Math.min(absdy, step);
    } else {
      viewer.scrollTop = target;
    }
    if (typeof markAdvance === 'function') markAdvance();
    else _lastAdvanceAt = performance.now();
    if (typeof debug === 'function') debug({ tag: 'scroll', top: viewer.scrollTop });
    {
      const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
      const ratio = max ? viewer.scrollTop / max : 0;
      sendToDisplay({ type: 'scroll', top: viewer.scrollTop, ratio });
    }
  }
  // Expose for other modules (e.g., scroll-control.js)
  try {
    window.scrollToCurrentIndex = scrollToCurrentIndex;
    // If scroll-control loaded, let it install commit gating wrapper now
    if (typeof window.__tpInstallCommitGate === 'function') {
      window.__tpInstallCommitGate(scrollToCurrentIndex);
    }
  } catch {}
  // Install HUD (tilde to toggle). Safe if file missing.
  try {
    window.__tpHud = window.__tpInstallHUD && window.__tpInstallHUD({ hotkey: '~' });
  } catch {}
  // Signal that core init function is now defined; publish to a temp handle, then swap stub
  try {
    window.__tpRealCore = _initCore;
    __tpBootPush('after-_initCore-def');
    window.__tpResolveCoreReady && window.__tpResolveCoreReady();
    window.__tpSetCoreRunnerReady && window.__tpSetCoreRunnerReady();
    // Replace stub with the real core
    window._initCore = _initCore;
  } catch {}

  // Ensure init runs (was previously implicit). Guard against double-run.
  try {
    __tpBootPush('pre-init-scheduling');
  } catch {}
  try {
    if (!window.__tpInitScheduled) {
      window.__tpInitScheduled = true;
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          try {
            // mark running early and cancel any late-init timer
            try { window.__tp_init_running = true; if (_lateInitTimer) { clearTimeout(_lateInitTimer); _lateInitTimer = null; } } catch {}
            init();
          } catch {
            console.error('init failed', e);
            try { window.__tp_init_running = false; } catch {}
          }
        });
      } else {
        Promise.resolve().then(() => {
          try {
            try { window.__tp_init_running = true; if (_lateInitTimer) { clearTimeout(_lateInitTimer); _lateInitTimer = null; } } catch {}
            init();
          } catch {
            console.error('init failed', e);
            try { window.__tp_init_running = false; } catch {}
          }
        });
      }
    }
  } catch {}
  try {
    __tpBootPush('init-scheduling-exited');
  } catch {}

  // Remove hard late-init fallback scheduling entirely — we cancel and avoid scheduling when real init runs.

  // Dump boot trace if user presses Ctrl+Alt+B (debug aid)
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'b') {
      try {
        console.log(
          '[TP-Pro] Boot trace:',
          (window.__TP_BOOT_TRACE || []).map((x) => x.m)
        );
      } catch {}
    }
  });

  // Conditionally install last‑resort delegation ONLY if core buttons appear unwired after init grace period.
  setTimeout(() => {
    try {
      if (window.__tpInitSuccess) return; // direct wiring succeeded, skip fallback
      // Heuristic: if openDisplayBtn exists and has no inline onclick AND we haven't flagged init success
      const btn = document.getElementById('openDisplayBtn');
      if (!btn) return; // no need
      const already = btn.__listenerAttached; // we can mark in init later if desired
      if (already) return; // direct wiring succeeded
      // Light probe: synthesize a custom event property after adding direct listener (future refactor)
      let delegated = false;
      const fallback = (e) => {
        const id = e.target?.id;
        try {
          if (id === 'openDisplayBtn' && typeof openDisplay === 'function') {
            openDisplay();
          } else if (id === 'closeDisplayBtn' && typeof closeDisplay === 'function') {
            closeDisplay();
          } else if (id === 'presentBtn' && typeof openDisplay === 'function') {
            openDisplay();
          } else if (id === 'settingsBtn') {
            const overlay = document.getElementById('settingsOverlay');
            if (overlay) {
              try {
                if (typeof buildSettingsContent === 'function') buildSettingsContent();
              } catch {}
              overlay.classList.remove('hidden');
              try {
                e.target.setAttribute('aria-expanded', 'true');
              } catch {}
            }
          } else if (id === 'micBtn') {
            requestMic();
          }
        } catch {
          console.warn('Delegated handler error', err);
        }
      };
      document.addEventListener('click', fallback, { capture: true });
      delegated = true;
      if (delegated)
        console.warn('[TP-Pro] Fallback delegation installed (direct button wiring not detected).');
    } catch {}
  }, 800);

  // Gentle PID-like catch-up controller
  function tryStartCatchup() {
    if (!speechOn) {
      try {
        __scrollCtl?.stopAutoCatchup?.();
        if (scrollChip) scrollChip.textContent = 'Scroll: idle';
      } catch {}
      return;
    }
    if (!__scrollCtl?.startAutoCatchup || !viewer) return;
    // If auto-scroll is running, skip catch-up to avoid conflicts
    if (autoTimer) return;
    const markerTop = () => {
      const pct =
        typeof window.__TP_MARKER_PCT === 'number'
          ? window.__TP_MARKER_PCT
          : typeof MARKER_PCT === 'number'
            ? MARKER_PCT
            : 0.4;
      return (viewer?.clientHeight || 0) * pct;
    };
    const getTargetY = () => markerTop();
    const getAnchorY = () => {
      try {
        // Prefer most-visible paragraph from IntersectionObserver
        const vis = __anchorObs?.mostVisibleEl?.() || null;
        if (vis) {
          const rect = vis.getBoundingClientRect();
          const vRect = viewer.getBoundingClientRect();
          return rect.top - vRect.top; // Y relative to viewer
        }
        // Otherwise, find active paragraph (as set in scrollToCurrentIndex)
        const activeP = (scriptEl || viewer)?.querySelector('p.active') || null;
        if (activeP) {
          const rect = activeP.getBoundingClientRect();
          const vRect = viewer.getBoundingClientRect();
          return rect.top - vRect.top; // Y relative to viewer
        }
        // Fallback: approximate using currentIndex paragraph element if available
        const p =
          (paraIndex || []).find((p) => currentIndex >= p.start && currentIndex <= p.end) ||
          (paraIndex || [])[0];
        if (p?.el) {
          const rect = p.el.getBoundingClientRect();
          const vRect = viewer.getBoundingClientRect();
          return rect.top - vRect.top;
        }
      } catch {}
      return markerTop();
    };
    const scrollBy = (dy) => {
      try {
        const next = Math.max(0, Math.min(viewer.scrollTop + dy, viewer.scrollHeight));
        if (typeof requestScroll === 'function') requestScroll(next);
        else viewer.scrollTop = next;
        const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
        const ratio = max
          ? (typeof window.__lastScrollTarget === 'number'
              ? window.__lastScrollTarget
              : viewer.scrollTop) / max
          : 0;
        sendToDisplay({
          type: 'scroll',
          top:
            typeof window.__lastScrollTarget === 'number'
              ? window.__lastScrollTarget
              : viewer.scrollTop,
          ratio,
        });
      } catch {}
    };
    try {
      __scrollCtl.stopAutoCatchup();
    } catch {}
    if (scrollChip) scrollChip.textContent = 'Scroll: active';
    __scrollCtl.startAutoCatchup(getAnchorY, getTargetY, scrollBy);
  }

  // Heuristic gate: only run catch-up if the anchor (current line) sits low in the viewport
  let _lowStartTs = 0;
  function maybeCatchupByAnchor(anchorY, viewportH) {
    try {
      if (!speechOn) {
        _lowStartTs = 0;
        try {
          __scrollCtl?.stopAutoCatchup?.();
          if (scrollChip) scrollChip.textContent = 'Scroll: idle';
        } catch {}
        return;
      }
      if (!__scrollCtl?.startAutoCatchup || !viewer) return;
      // Don't start while auto-scroll is active
      if (autoTimer) {
        _lowStartTs = 0;
        try {
          __scrollCtl.stopAutoCatchup();
        } catch {}
        return;
      }
      const h = Math.max(1, Number(viewportH) || viewer.clientHeight || 1);
      const ratio = anchorY / h; // 0=top, 1=bottom
      const THR = typeof window.__TP_ANCHOR_THR === 'number' ? window.__TP_ANCHOR_THR : 0.58; // was 0.65
      const WAIT =
        typeof window.__TP_ANCHOR_WAIT_MS === 'number' ? window.__TP_ANCHOR_WAIT_MS : 250; // was 500

      if (ratio > THR) {
        if (!_lowStartTs) _lowStartTs = performance.now();
        if (performance.now() - _lowStartTs > WAIT) {
          tryStartCatchup();
        }
      } else {
        _lowStartTs = 0;
        try {
          __scrollCtl.stopAutoCatchup?.();
        } catch {}
      }
    } catch {}
  }

  // Matcher constants and helpers (single source of truth)
  let _lastMatchAt = 0;
  let _lastCorrectionAt = 0;
  let _lastAdvanceAt = performance.now(); // stall-recovery timestamp
  let fallbackStreak = 0; // count consecutive batches with no n-gram hits
  // Throttle interim matches; how many recent spoken tokens to consider
  const MATCH_INTERVAL_MS = 120;
  const SPOKEN_N = 8;
  // Window relative to currentIndex to search
  // Tunables (let so we can adjust via the “Match aggressiveness” select)
  let MATCH_WINDOW_BACK = 30; // how far back we search around the current index
  let MATCH_WINDOW_AHEAD = 450; // how far forward we search (normal: 450, rescue: 900)
  let SIM_THRESHOLD = 0.55; // minimum similarity to accept a match (0..1)
  // Similarity thresholds and motion clamps
  let STRICT_FORWARD_SIM = 0.72; // extra gate when skipping forward a lot
  let MAX_JUMP_AHEAD_WORDS = 12; // max words to bump when pushing forward
  // Viterbi algorithm penalties for sequence alignment
  const VITERBI_ALPHA = 0.15; // transition penalty between states
  const VITERBI_BETA = 0.08; // emission penalty
  const VITERBI_LOOP_PENALTY = 0.25; // penalty for staying in same state
  // Viterbi state for temporal path consistency
  let __viterbiPath = []; // sequence of positions through time
  let __viterbiIPred = 0; // predicted position from previous Viterbi step
  // Scroll correction tuning
  // TP: marker-percent — forward bias the reading line slightly to reduce lag
  const MARKER_PCT = 0.35;
  // Gentler motion to avoid jumpiness
  let DEAD_BAND_PX = 18; // ignore small errors
  // NOTE: Historical naming mismatch: some earlier code / docs referenced CORRECTION_MIN_INTERVAL_MS.
  // We keep the original internal name CORRECTION_MIN_MS and provide an alias to avoid ReferenceErrors.
  let CORRECTION_MIN_MS = 240; // throttle corrections
  // Backwards-compatible alias (do NOT reassign directly elsewhere)
  try {
    Object.defineProperty(window, 'CORRECTION_MIN_INTERVAL_MS', {
      get() {
        return CORRECTION_MIN_MS;
      },
      set(v) {
        CORRECTION_MIN_MS = Number(v) || CORRECTION_MIN_MS;
      },
    });
  } catch {}
  let MAX_FWD_STEP_PX = 96; // clamp forward step size
  let MAX_BACK_STEP_PX = 140; // clamp backward step size
  // Anti-jitter: remember last move direction (+1 fwd, -1 back, 0 none)
  let _lastMoveDir = 0;

  // Bottom guard helper: true if scroller is at/near bottom
  function atBottom(container) {
    try {
      if (!container) return false;
      return container.scrollTop + container.clientHeight >= container.scrollHeight - 4;
    } catch {
      return false;
    }
  }

  // End-game easing: slightly more permissive near the end of script
  function endGameAdjust(idx, sim) {
    try {
      const nearEnd = (scriptWords?.length || 0) - (idx || 0) < 30;
      return nearEnd ? Math.min(1, sim + 0.03) : sim;
    } catch {
      return sim;
    }
  }

  // Coverage-based soft advance to avoid stalls when a short line is consumed
  let __tpStag = { vIdx: -1, since: performance.now() };
  let softAdvanceStreak = 0; // count consecutive soft-advances
  const STALL_MS = 1200; // ~1.2s feels good in speech
  const COV_THRESH = 0.88; // Raised from 0.82 to require higher coverage before soft-advancing
  const SOFT_ADV_MIN_SIM = 0.54; // avoid treadmill on flimsy evidence
  const SOFT_ADV_MAX_STREAK = 2; // after 2 soft nudges, demand anchor or stronger sim
  // Stall instrumentation state
  let __tpStall = { reported: false };

  // --- PLL Bias Controller for Hybrid Auto-Scroll ---
  const PLL = (() => {
    let biasPct = 0,
      errF = 0,
      lastErrF = 0,
      lastT = performance.now(),
      lastGood = performance.now(),
      lastAnchorTs = 0,
      state = 'LOST'; // Initialize state
    const S = { Kp: 0.022, Kd: 0.0025, maxBias: 0.12, confMin: 0.6, decayMs: 550, lostMs: 1800 };

    // Telemetry counters
    const telemetry = {
      timeLocked: 0,
      timeCoast: 0,
      timeLost: 0,
      avgLeadLag: 0,
      samples: 0,
      nearClampCount: 0,
      anchorCount: 0,
      lastSample: performance.now(),
    };

    function scriptProgress() {
      try {
        const total = paraIndex.length;
        if (!total) return 0;
        return Math.min(1, currentIndex / total);
      } catch {
        return 0;
      }
    }

    function update({ yMatch, yTarget, conf, dt }) {
      const now = performance.now();
      const dts = (dt ?? now - lastT) / 1000;
      lastT = now;
      const err = yMatch - yTarget; // sign convention: positive = behind
      errF = 0.8 * errF + 0.2 * err;

      // End-game taper (soften in last 20%)
      const p = scriptProgress();
      const endTaper = p > 0.8 ? 0.6 : 1.0;

      if (conf >= S.confMin) {
        lastGood = now;
        const dErr = (errF - lastErrF) / Math.max(dts, 0.016);
        let bias = S.Kp * errF + S.Kd * dErr;
        const clamp = (state === 'LOCK_SEEK' ? S.maxBias : S.maxBias * 0.8) * endTaper;
        biasPct = Math.max(-clamp, Math.min(clamp, biasPct + bias));
        state = Math.abs(errF) < 12 ? 'LOCKED' : 'LOCK_SEEK';
      } else {
        // Forward-only bias at low conf (no accidental slow-downs)
        if (conf < S.confMin) {
          biasPct = Math.max(0, biasPct * Math.exp(-dts / (S.decayMs / 1000)));
        } else {
          biasPct = biasPct * Math.exp(-dts / (S.decayMs / 1000));
        }
        state = now - lastGood > S.lostMs ? 'LOST' : 'COAST';
      }
      lastErrF = errF;

      // Update telemetry after state is determined
      const dtSample = now - telemetry.lastSample;
      if (state === 'LOCKED') telemetry.timeLocked += dtSample;
      else if (state === 'COAST') telemetry.timeCoast += dtSample;
      else if (state === 'LOST') telemetry.timeLost += dtSample;
      telemetry.avgLeadLag =
        (telemetry.avgLeadLag * telemetry.samples + Math.abs(errF)) / (telemetry.samples + 1);
      telemetry.samples++;
      if (Math.abs(biasPct) > S.maxBias * 0.8) telemetry.nearClampCount++;
      telemetry.lastSample = now;
    }

    function allowAnchor() {
      const now = performance.now();
      if (now - lastAnchorTs < 1200) return false; // Anchor rate-limit
      lastAnchorTs = now;
      telemetry.anchorCount++;
      return true;
    }

    // Pause breathing (feels natural)
    function onPause() {
      PLL.tune({ decayMs: 400 });
      setTimeout(() => PLL.tune({ decayMs: 550 }), 2000); // Reset after 2s
    }

    return {
      update,
      allowAnchor,
      onPause,
      get biasPct() {
        return biasPct;
      },
      get state() {
        return state;
      },
      get errF() {
        return errF;
      },
      get telemetry() {
        return { ...telemetry };
      },
      tune(p) {
        Object.assign(S, p);
      },
    };
  })();

  function tokenCoverage(lineTokens, tailTokens) {
    try {
      if (!Array.isArray(lineTokens) || !lineTokens.length) return 0;
      if (!Array.isArray(tailTokens) || !tailTokens.length) return 0;
      let i = 0,
        hit = 0;
      for (const tok of lineTokens) {
        while (i < tailTokens.length && tailTokens[i] !== tok) i++;
        if (i < tailTokens.length) {
          hit++;
          i++;
        }
      }
      return hit / Math.max(1, lineTokens.length);
    } catch {
      return 0;
    }
  }

  function maybeSoftAdvance(bestIdx, bestSim, spoken) {
    try {
      // Respect batch-based freeze if set by rescue logic
      try {
        if ((window.__freezeBatches || 0) > 0) {
          window.__freezeBatches = Math.max(0, (window.__freezeBatches || 0) - 1);
          try { window.__tpHudInc && window.__tpHudInc('softAdv', 'frozen', 1); } catch {}
          return { idx: bestIdx, sim: bestSim, soft: false };
        }
      } catch {}
      // Find current virtual line context
      const vList = __vParaIndex && __vParaIndex.length ? __vParaIndex : null;
      if (!vList) return { idx: bestIdx, sim: bestSim, soft: false };
      const vIdx = vList.findIndex((v) => bestIdx >= v.start && bestIdx <= v.end);
      if (vIdx < 0) return { idx: bestIdx, sim: bestSim, soft: false };

      // Update stagnation tracker (stagnant if staying within same virtual line)
      const now = performance.now();
      if (vIdx !== __tpStag.vIdx) {
        __tpStag = { vIdx, since: now };
      }
      const stagnantMs = now - __tpStag.since;

      // Compute coverage of current virtual line by spoken tail
      const lineTokens = scriptWords.slice(vList[vIdx].start, vList[vIdx].end + 1);
  const cov = tokenCoverage(lineTokens, spoken);
  const SCRIPT_VOCAB = window.__SCRIPT_VOCAB || new Set();
  const oovRatio = 1 - inVocabRatio(spoken, SCRIPT_VOCAB);
  if (oovRatio > 0.5) {
    try { window.__tpHudInc && window.__tpHudInc('drops', 'oov', 1); } catch {}
    return { idx: bestIdx, sim: bestSim, soft: false }; // too many OOVs
  }
  if (looksLikeCommand(spoken)) {
    try { window.__tpHudInc && window.__tpHudInc('drops', 'command', 1); } catch {}
    return { idx: bestIdx, sim: bestSim, soft: false };
  }

      if (stagnantMs >= STALL_MS && cov >= COV_THRESH) {
        // Probe the next few virtual lines for a prefix match
        const maxProbe = Math.min(vList.length - 1, vIdx + 4);
        for (let j = vIdx + 1; j <= maxProbe; j++) {
          const v = vList[j];
          const win = scriptWords.slice(v.start, Math.min(v.start + spoken.length, v.end + 1));
          const sim = _sim(spoken, win);
          // LOST-mode stricter gating (jitter-aware)
          const LOST = PLL.state === 'LOST' || __tpLost;
          const jitterStd = (window.__tpJitter && window.__tpJitter.std) || 0;
          let LOST_MIN = 0.62;
          if (LOST && jitterStd > 25) LOST_MIN += 0.04; // raise when noisy
          const minSim = LOST ? LOST_MIN : SOFT_ADV_MIN_SIM;
          const streakCap = LOST ? 1 : SOFT_ADV_MAX_STREAK;
          // require at least an n-gram hit or an anchor nearby when LOST
          const ngramHitsNear = (() => {
            try {
              const g = getNgrams(spoken, 3);
              for (const gk of g) if (__ngramIndex.has(gk)) return 1;
            } catch {}
            return 0;
          })();
          const anchorsNear = (() => {
            try {
              const anchors = extractHighIDFPhrases(spoken, 3);
              if (!anchors.length) return 0;
              const band = getAnchorBand();
              const hits = searchBand(anchors, v.start - band, v.end + band, spoken);
              return hits.length;
            } catch {
              return 0;
            }
          })();
          if (
            sim >= minSim &&
            fallbackStreak < 3 &&
            softAdvanceStreak < streakCap &&
            (LOST ? (ngramHitsNear > 0 || anchorsNear > 0) : true)
          ) {
            try {
              if (typeof debug === 'function')
                debug({
                  tag: 'match:soft-advance',
                  from: bestIdx,
                  to: v.start,
                  cov: +cov.toFixed(2),
                  sim: +sim.toFixed(3),
                  stagnantMs: Math.floor(stagnantMs),
                });
            } catch {}
            // reset stagnation to the new virtual line
            try { window.__tpHudInc && window.__tpHudInc('softAdv', 'allowed', 1); } catch {}
            __tpStag = { vIdx: j, since: now };
            return { idx: v.start, sim, soft: true };
          } else {
            // LOST gating prevented soft-advance due to missing anchors/ngrams
            try {
              if (LOST) window.__tpHudInc && window.__tpHudInc('softAdv', 'blockedLost', 1);
            } catch {}
          }
        }
      }
      return { idx: bestIdx, sim: bestSim, soft: false };
    } catch {
      return { idx: bestIdx, sim: bestSim, soft: false };
    }
  }

  // Quick fuzzy contain check (Unicode-aware normalization)
  function _normQuick(s) {
    try {
      return String(s || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      // fallback for engines lacking Unicode property escapes
      return String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
  function fuzzyAdvance(textSlice, spoken) {
    const A = _normQuick(textSlice);
    const rawB = _normQuick(spoken);
    const B = rawB.length > 80 ? rawB.slice(-80) : rawB; // focus on tail
    return A.indexOf(B); // >= 0 if found
  }
  function getUpcomingTextSlice(maxWords = 120) {
    try {
      const end = Math.min(scriptWords.length, currentIndex + Math.max(1, maxWords));
      return (scriptWords.slice(currentIndex, end) || []).join(' ');
    } catch {
      return '';
    }
  }
  // expose for quick experiments in console/debug tools
  try {
    Object.assign(window, { fuzzyAdvance, getUpcomingTextSlice });
  } catch {}

  // Fast overlap score: count of shared tokens (case-normalized by normTokens already)
  function _overlap(a, b) {
    if (!a?.length || !b?.length) return 0;
    const set = new Set(b);
    let n = 0;
    for (const w of a) if (set.has(w)) n++;
    return n;
  }

  // Token similarity in 0..1 using Dice coefficient (robust and cheap)
  function _sim(a, b) {
    if (!a?.length || !b?.length) return 0;
    const overlap = _overlap(a, b);
    return (2 * overlap) / (a.length + b.length);
  }

  // Speech commit hook: use geometry-based targeting only in Calm Mode
  function legacyOnSpeechCommit(_activeEl) {
    // No-op by default: non-Calm keeps existing behavior already executed in advanceByTranscript
  }
  function onSpeechCommit(activeEl) {
    try {
      if (!window.__TP_CALM) return legacyOnSpeechCommit(activeEl);
      const sc =
        window.__TP_SCROLLER ||
        document.getElementById('viewer') ||
        document.scrollingElement ||
        document.documentElement ||
        document.body;
      const y = getYForElInScroller(activeEl, sc, 0.38);
      tpScrollTo(y, sc);
    } catch {}
  }

  // Advance currentIndex by trying to align recognized words to the upcoming script words
  // TP: advance-by-transcript
  function advanceByTranscript(transcript, isFinal) {
    // Hard gate: no matching when speech sync is off
    if (!speechOn) {
      try {
        if (typeof debug === 'function') debug({ tag: 'match:gate', reason: 'speech-off' });
      } catch {}
      return;
    }
    // Adopt current smoothness settings if provided
    const SC = window.__TP_SCROLL || {
      DEAD: DEAD_BAND_PX,
      THROTTLE: CORRECTION_MIN_MS,
      FWD: MAX_FWD_STEP_PX,
      BACK: MAX_BACK_STEP_PX,
    };
    DEAD_BAND_PX = SC.DEAD;
    CORRECTION_MIN_MS = SC.THROTTLE;
    MAX_FWD_STEP_PX = SC.FWD;
    MAX_BACK_STEP_PX = SC.BACK;
    if (!scriptWords.length) return;
    const now = performance.now();
    if (now - _lastMatchAt < MATCH_INTERVAL_MS && !isFinal) return;
    _lastMatchAt = now;

    // Process each transcript individually (as per pseudocode)
    const spokenAll = normTokens(transcript);
    const spoken = spokenAll.slice(-SPOKEN_N);
    if (!spoken.length) return;

    // Skip batching - process each transcript immediately
    const batchTokens = spoken;

    // Never score empty batches - require minimum 3 tokens
    const MIN_BATCH_TOKENS = 3;
    if (batchTokens.length < MIN_BATCH_TOKENS) {
      try {
        if (typeof debug === 'function')
          debug({
            tag: 'transcript:skip',
            reason: 'insufficient-tokens',
            tokens: batchTokens.length,
            minRequired: MIN_BATCH_TOKENS,
            isFinal,
          });
      } catch {}
      return; // Buffer until we have enough tokens
    }

    // Debounce partials: only score finals or partials with significant new content
    if (!isFinal) {
      // For now, skip all partials - only process finals
      // TODO: Implement smart partial processing based on content changes
      try {
        if (typeof debug === 'function')
          debug({
            tag: 'transcript:skip',
            reason: 'partial-debounced',
            tokens: batchTokens.length,
            isFinal,
          });
      } catch {}
      return;
    }

    try {
      if (typeof debug === 'function')
        debug({
          tag: 'transcript:process',
          tokens: batchTokens.length,
          isFinal,
        });
    } catch {}

    // Line-level similarity scoring function
    function computeLineSimilarity(spokenTokens, scriptText) {
      const scriptTokens = normTokens(scriptText);

      // Component 1: 0.5 · cosine(TF-IDF bi/tri-grams)
      const tfidfScore = computeTFIDFSimilarity(spokenTokens, scriptTokens);

      // Component 2: 0.3 · character F1 (normalized Levenshtein)
      const charF1 = computeCharacterF1(spokenTokens.join(' '), scriptTokens.join(' '));

      // Component 3: 0.2 · Jaccard on stemmed tokens
      const jaccardScore = computeJaccardSimilarity(spokenTokens, scriptTokens);

      // Component 4: +δ for entity matches (numbers, names, toponyms)
      const entityBonus = computeEntityBonus(spokenTokens, scriptTokens);

      let finalScore = 0.5 * tfidfScore + 0.3 * charF1 + 0.2 * jaccardScore + entityBonus;

      // Short-line penalty: -0.12 for lines <5 tokens
      if (scriptTokens.length < 5) {
        finalScore -= 0.12;
      }

      return finalScore;
    }

    // TF-IDF cosine similarity for bi/tri-grams
    function computeTFIDFSimilarity(tokens1, tokens2) {
      const ngrams1 = getNgrams(tokens1, 2).concat(getNgrams(tokens1, 3));
      const ngrams2 = getNgrams(tokens2, 2).concat(getNgrams(tokens2, 3));

      const allNgrams = new Set([...ngrams1, ...ngrams2]);
      const vec1 = [];
      const vec2 = [];

      for (const ngram of allNgrams) {
        vec1.push(ngrams1.filter((n) => n === ngram).length);
        vec2.push(ngrams2.filter((n) => n === ngram).length);
      }

      return cosineSimilarity(vec1, vec2);
    }

    // Character-level F1 score using normalized Levenshtein
    function computeCharacterF1(text1, text2) {
      try { if (window && typeof window.computeCharacterF1 === 'function') return window.computeCharacterF1(text1, text2); } catch {};
      const chars1 = text1.split('');
      const chars2 = text2.split('');

      // Simple character overlap for F1
      const set1 = new Set(chars1);
      const set2 = new Set(chars2);

      const intersection = new Set([...set1].filter((x) => set2.has(x)));
      const precision = set1.size ? intersection.size / set1.size : 0;
      const recall = set2.size ? intersection.size / set2.size : 0;

      return precision + recall > 0 ? (2 * (precision * recall)) / (precision + recall) : 0;
    }

    // Jaccard similarity on stemmed tokens
    function computeJaccardSimilarity(tokens1, tokens2) {
      try { if (window && typeof window.computeJaccardSimilarity === 'function') return window.computeJaccardSimilarity(tokens1, tokens2); } catch {};
      const stem1 = new Set(tokens1.map(stemToken));
      const stem2 = new Set(tokens2.map(stemToken));

      const intersection = new Set([...stem1].filter((x) => stem2.has(x)));
      const union = new Set([...stem1, ...stem2]);

      return union.size ? intersection.size / union.size : 0;
    }

    // Entity bonus for numbers, names, toponyms
    function computeEntityBonus(tokens1, tokens2) {
      try { if (window && typeof window.computeEntityBonus === 'function') return window.computeEntityBonus(tokens1, tokens2); } catch {};
      let bonus = 0;

      // Number matches
      const nums1 = tokens1.filter((t) => /^\d+(\.\d+)?$/.test(t));
      const nums2 = tokens2.filter((t) => /^\d+(\.\d+)?$/.test(t));
      if (nums1.length > 0 && nums2.length > 0) {
        const numMatch = nums1.some((n1) => nums2.includes(n1)) ? 1 : 0;
        bonus += 0.1 * numMatch;
      }

      // Name/toponym matches (capitalized words)
      const names1 = tokens1.filter((t) => /^[A-Z][a-z]+$/.test(t));
      const names2 = tokens2.filter((t) => /^[A-Z][a-z]+$/.test(t));
      if (names1.length > 0 && names2.length > 0) {
        const nameMatch = names1.some((n1) => names2.includes(n1)) ? 1 : 0;
        bonus += 0.15 * nameMatch;
      }

      return bonus;
    }

    // Helper functions
    function getNgrams(tokens, n) {
      try {
        if (window && typeof window.getNgrams === 'function') return window.getNgrams(tokens, n);
      } catch { }
      const ngrams = [];
      for (let i = 0; i <= tokens.length - n; i++) {
        ngrams.push(tokens.slice(i, i + n).join(' '));
      }
      return ngrams;
    }

    function cosineSimilarity(vec1, vec2) {
      try { if (window && typeof window.cosineSimilarity === 'function') return window.cosineSimilarity(vec1, vec2); } catch {};
      let dot = 0,
        norm1 = 0,
        norm2 = 0;
      for (let i = 0; i < vec1.length; i++) {
        dot += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
      }
      return norm1 && norm2 ? dot / (Math.sqrt(norm1) * Math.sqrt(norm2)) : 0;
    }

    function stemToken(token) {
      // Simple stemming: remove common suffixes
      return token.toLowerCase().replace(/ing$|ed$|er$|est$|ly$|s$/, '');
    }

    // Viterbi step: find best path through time given previous path and current scores
    function viterbiStep(prevPath, scores, alpha, beta, loopPenalty) {
      const candidates = Object.keys(scores)
        .map(Number)
        .sort((a, b) => a - b);
      if (candidates.length === 0) return { idx: __viterbiIPred, path: prevPath };

      let bestIdx = candidates[0];
      let bestScore = -Infinity;

      for (const j of candidates) {
        let score = scores[j];

        // Apply emission penalty (β)
        score *= 1 - beta;

        // Apply transition penalties from previous position
        const prevIdx = prevPath.length > 0 ? prevPath[prevPath.length - 1] : __viterbiIPred;
        const delta = Math.abs(j - prevIdx);

        // α penalty for transitions between different states
        if (delta > 0) {
          score *= 1 - alpha * Math.min(delta / 20, 1);
        }

        // Loop penalty bonus for staying in same state
        if (delta === 0) {
          score *= 1 + loopPenalty;
        }

        if (score > bestScore) {
          bestScore = score;
          bestIdx = j;
        }
      }

      const newPath = [...prevPath, bestIdx];
      return { idx: bestIdx, path: newPath };
    }

    // Line-level matching: score against concatenated line windows [i..i+2]
    let windowAhead = MATCH_WINDOW_AHEAD;
    try {
      const TAIL_N = 3; // examine last 3 tokens for duplication nearby
      if (spoken.length >= TAIL_N) {
        const tail = spoken.slice(-TAIL_N);
        const bStart = Math.max(0, currentIndex - 80);
        const bEnd = Math.min(scriptWords.length, currentIndex + Math.min(MATCH_WINDOW_AHEAD, 160));
        let occ = 0;
        let lastPos = -9999;
        let tightSpan = 0;
        for (let i = bStart; i <= bEnd - TAIL_N; i++) {
          if (
            scriptWords[i] === tail[0] &&
            scriptWords[i + 1] === tail[1] &&
            scriptWords[i + 2] === tail[2]
          ) {
            occ++;
            if (lastPos > 0) tightSpan += Math.min(200, i - lastPos);
            lastPos = i;
            if (occ >= 4) break; // enough evidence
          }
        }
        if (occ >= 3) {
          const avgGap = occ > 1 ? tightSpan / (occ - 1) : 9999;
          // Consider it “common nearby” if appears ≥3x and average gap is small
          if (avgGap < 60) {
            const prev = windowAhead;
            // Improved tail-common tuning: be more conservative with narrowing
            // Only narrow if we have good similarity and no jitter issues
            const safeToNarrow =
              (typeof bestSim === 'number' ? bestSim >= 0.6 : true) &&
              !(window.jitter && window.jitter.elevated);
            windowAhead = safeToNarrow ? Math.max(120, Math.min(windowAhead, 40)) : 250;
            try {
              if (typeof debug === 'function')
                debug({
                  tag: 'match:window-tune',
                  reason: 'tail-common',
                  tail: tail.join(' '),
                  occ,
                  avgGap,
                  windowAheadPrev: prev,
                  windowAhead,
                  safeToNarrow,
                  bestSim: typeof bestSim === 'number' ? Number(bestSim.toFixed(3)) : 'unknown',
                });
            } catch {}
          }
        }
      }
    } catch {}

    // LOST watchdog: widen window if similarity stays low for multiple cycles
    try {
      if (typeof bestSim === 'number' && bestSim < 0.5) {
        window.__lostWatchdogCount = (window.__lostWatchdogCount || 0) + 1;
        if (window.__lostWatchdogCount >= 3) {
          const prev = windowAhead;
          windowAhead = Math.max(windowAhead, 900); // widen window significantly
          try {
            if (typeof debug === 'function')
              debug({
                tag: 'match:lost-watchdog',
                reason: 'low-sim-watchdog',
                watchdogCount: window.__lostWatchdogCount,
                windowAheadPrev: prev,
                windowAhead,
                bestSim: Number(bestSim.toFixed(3)),
              });
          } catch {}
        }
      } else {
        window.__lostWatchdogCount = 0; // reset on good similarity
      }
    } catch {}

    // Core loop: score candidates seeded by n-grams or window fallback
    let i_pred = __viterbiIPred || currentIndex; // Use Viterbi prediction or fallback to current
    const candidates = new Set(); // Use Set to avoid duplicates

    try {
      if (typeof debug === 'function')
        debug({
          tag: 'match:setup',
          scriptWords: scriptWords.length,
          paraIndex: paraIndex.length,
          currentIndex,
          i_pred,
          batchTokens: batchTokens.slice(0, 5), // first 5 tokens
        });
    } catch {}

    // N-gram candidate seeding: find positions containing n-grams from batchTokens
    const batchNgrams = new Set([...getNgrams(batchTokens, 3), ...getNgrams(batchTokens, 4)]);

    let ngramHits = 0;
    for (const ngram of batchNgrams) {
      const positions = __ngramIndex.get(ngram);
      if (positions) {
        for (const pos of positions) {
          candidates.add(pos);
          ngramHits++;
        }
      }
    }

    // If no n-gram hits, fall back to window-based candidates
    if (candidates.size === 0) {
      const candidateStart = Math.max(0, Math.floor(currentIndex) - MATCH_WINDOW_BACK);
      const candidateEnd = Math.min(scriptWords.length - 1, Math.floor(i_pred) + windowAhead);

      for (let j = candidateStart; j <= candidateEnd; j++) {
        candidates.add(j);
      }

      try {
        if (typeof debug === 'function')
          debug({
            tag: 'match:candidates-fallback',
            reason: 'no-ngram-hits',
            windowStart: candidateStart,
            windowEnd: candidateEnd,
            candidates: candidates.size,
          });
      } catch {}
    } else {
      try {
        if (typeof debug === 'function')
          debug({
            tag: 'match:candidates-ngram',
            ngramHits,
            uniqueCandidates: candidates.size,
            batchNgrams: batchNgrams.size,
          });
      } catch {}
    }

    // Instrumentation for verification
    try {
      if (typeof debug === 'function') {
        const normBatch = batchTokens.join(' ');
        const scriptSampleStart = Math.max(0, Math.floor(i_pred) - 5);
        const scriptSampleEnd = Math.min(scriptWords.length, Math.floor(i_pred) + 5);
        const scriptSampleTokens = scriptWords.slice(scriptSampleStart, scriptSampleEnd);
        const normScriptSample = normTokens(scriptSampleTokens.join(' ')).join(' ');
        const examplePositions = Array.from(candidates).slice(0, 3); // first 3 positions
        const windowBounds =
          candidates.size === 0 ? { start: candidateStart, end: candidateEnd } : null; // only if fallback
        const minTokensGateTriggered = batchTokens.length < MIN_BATCH_TOKENS;
        const backtrackEnabled = MATCH_WINDOW_BACK > 0;
        const backtrackDistance = MATCH_WINDOW_BACK;

        debug({
          tag: 'instrumentation:batch',
          normBatch,
          normScriptSample,
          nGramHits: ngramHits,
          examplePositions,
          windowBounds,
          minTokensGateTriggered,
          backtrackEnabled,
          backtrackDistance,
          ngramIndexSize: __ngramIndex.size,
        });
      }
    } catch {}

    const candidateArray = Array.from(candidates).sort((a, b) => a - b);
    const scores = {};

    // Score each candidate
    for (const j of candidateArray) {
      const para = __vParaIndex ? __vParaIndex[j] : paraIndex[j];
      if (!para) continue;

      const vis = para.key; // canonicalized script text
      const score = computeLineSimilarity(batchTokens, vis);

      // Apply header penalty (skip_prior)
      // Devalue/ignore meta/branding lines
      try {
        if (para.isMeta) {
          // apply heavy penalty so these lines don't win soft-advance
          scores[j] = score * 0.5 - 0.2;
        } else if (para.isNonSpoken) {
          scores[j] = score - 0.6; // header_prior = -0.6
        } else {
          scores[j] = score;
        }
      } catch {
        scores[j] = score;
      }
    }

    // Debug: log top scores
    const topScores = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([idx, score]) => ({ idx: Number(idx), score: Number(score.toFixed(3)) }));
    try {
      if (typeof debug === 'function')
        debug({
          tag: 'match:scores',
          candidates: candidateArray.length,
          topScores,
          batchTokens: batchTokens.length,
        });
    } catch {}

    // Reset prediction seed when window is empty
    const markerTop = () =>
      Math.round(
        viewer.clientHeight *
          (typeof window.__TP_MARKER_PCT === 'number'
            ? window.__TP_MARKER_PCT
            : typeof MARKER_PCT === 'number'
              ? MARKER_PCT
              : 0.4)
      );
    function estimateIdxFromViewport() {
      const y = viewer.scrollTop + markerTop();
      const idx = lineIndex.nearestIdxAtY(y); // use virtual lines map
      return Math.max(0, idx | 0);
    }
    if (!topScores || topScores.length === 0) {
      i_pred = estimateIdxFromViewport(); // nearest virtual line under yTarget
    }

    // Update fallback streak: require real evidence when n-gram misses
    const hadHits = ngramHits > 0 || (topScores && topScores.length > 0);
    fallbackStreak = hadHits ? 0 : fallbackStreak + 1;

    // Viterbi step to find best temporal path (with rescue-adjusted parameters)
    const effectiveBeta = window.__tpRescueMode?.active ? VITERBI_BETA * 0.5 : VITERBI_BETA;
    const viterbiResult = viterbiStep(
      __viterbiPath,
      scores,
      VITERBI_ALPHA,
      effectiveBeta,
      VITERBI_LOOP_PENALTY
    );
    const i_viterbi = viterbiResult.idx;

    // Track Viterbi consistency for soft advance
    if (i_viterbi === lastViterbiIdx) {
      viterbiConsistencyCount++;
    } else {
      viterbiConsistencyCount = 1;
      lastViterbiIdx = i_viterbi;
    }

    // Update Viterbi state
    __viterbiPath = viterbiResult.path;
    __viterbiIPred = i_viterbi;

    // Use Viterbi result as best match
    let bestIdx = i_viterbi;
    let bestSim = scores[i_viterbi] || 0;

    // Stall detection and rescue mode
    const stallDetected = (function () {
      const now = performance.now();
      const timeSinceLastAdvance = now - (_lastAdvanceAt || 0);
      if (!Array.isArray(window.simHistory)) {
        return false; // No history available, assume no stall
      }
      const simMean =
        window.simHistory.length > 0
          ? window.simHistory.reduce((a, b) => a + b, 0) / window.simHistory.length
          : 1.0;

      return timeSinceLastAdvance > 1400 && simMean < 0.65;
    })();

    // Rescue mode state
    if (!window.__tpRescueMode) window.__tpRescueMode = { active: false, enteredAt: 0 };
    // Soft-advance freeze after anchor rescue
    if (typeof window.__tpSoftAdvanceFreeze === 'undefined') window.__tpSoftAdvanceFreeze = { until: 0 };

    if (stallDetected) {
      // Enter rescue mode: widen window, relax β, try anchor scan
      window.__tpRescueMode.active = true;
      window.__tpRescueMode.enteredAt = performance.now();
      windowAhead = Math.max(windowAhead, 900); // widen window
      // β penalty is relaxed in the Viterbi step call above

      // Try anchor scan for distinctive phrases
      const anchors = extractHighIDFPhrases(batchTokens, 3);
      if (anchors.length > 0) {
  const band = getAnchorBand();
  const anchorHits = searchBand(anchors, i_pred - band, i_pred + windowAhead, batchTokens);
        const bestAnchor = anchorHits.sort((a, b) => b.score - a.score)[0];
        // Cap anchor jumps: prefer within +60 tokens unless confidence >0.9
        if (bestAnchor) {
          // Find the para index containing the anchor word index
          let paraIdx = -1;
          for (let p = 0; p < paraIndex.length; p++) {
            if (bestAnchor.idx >= paraIndex[p].start && bestAnchor.idx <= paraIndex[p].end) {
              paraIdx = p;
              break;
            }
          }
          if (paraIdx >= 0) {
            const anchorDistance = Math.abs(bestAnchor.idx - currentIndex); // Word distance, not paragraph distance
            const allowJump = bestAnchor.score > 0.9 || anchorDistance <= 60;
            if (bestAnchor.score > 0.75 && allowJump) {
              try { window.__tpHudInc && window.__tpHudInc('rescue', 'count', 1); } catch {}
              bestIdx = paraIndex[paraIdx].start; // Use paragraph start word index, not paragraph array index
              bestSim = bestAnchor.score;
              // Update tracking for dynamic threshold
              lastAnchorConfidence = bestAnchor.score;
              lastAnchorAt = performance.now();
              // Update Viterbi path to include the anchor position
              __viterbiPath = [...__viterbiPath, paraIdx];
              __viterbiIPred = paraIdx;
              // Update currentIndex to the anchor word position
              currentIndex = Math.max(currentIndex, bestAnchor.idx);
              try {
                if (typeof debug === 'function')
                  debug({
                    tag: 'rescue:anchor',
                    idx: bestIdx,
                    wordIdx: bestAnchor.idx,
                    score: bestSim,
                    distance: anchorDistance,
                    allowed: allowJump,
                  });
              } catch {}
              // Freeze soft-advance for next ~2 batches and issue a catch-up to marker
              try {
                window.__freezeBatches = 2; // freeze next 2 match cycles
                softAdvanceStreak = 0;
                try { window.__tpHudInc && window.__tpHudInc('softAdv', 'frozen', 1); } catch {}
                const el = lineEls && lineEls[Math.max(0, bestIdx)] ? lineEls[Math.max(0, bestIdx)] : null;
                if (el) {
                  try {
                    const y = getYForElInScroller(el);
                    tpScrollTo(y);
                  } catch {}
                }
              } catch {}
            }
          }
        }
      }

      try {
        if (typeof debug === 'function') debug({ tag: 'rescue:enter', windowAhead, simMean });
      } catch {}
    } else if (window.__tpRescueMode.active) {
      // Check if we can exit rescue mode (progress detected)
      const timeInRescue = performance.now() - window.__tpRescueMode.enteredAt;
      const recentProgress = Math.abs(bestIdx - i_pred) > 2; // moved more than 2 lines

      if (timeInRescue > 3000 || (recentProgress && bestSim > 0.7)) {
        // Decay to normal mode
        window.__tpRescueMode.active = false;
        try {
          if (typeof debug === 'function')
            debug({ tag: 'rescue:exit', reason: recentProgress ? 'progress' : 'timeout' });
        } catch {}
      }
    }

    // Update similarity history AFTER rescue mode has potentially improved bestSim
    if (!Array.isArray(window.simHistory)) {
      window.simHistory = [];
    }
    window.simHistory.push(bestSim);
    if (window.simHistory.length > 10) window.simHistory.shift();
    window.__tpSimHistory = window.simHistory;

    // Smooth scroll: maintain EMA of Viterbi index to decouple from jittery matches
    const SMOOTH_GAMMA = 0.2; // EMA smoothing factor
    if (!window.__tpSmoothState) {
      window.__tpSmoothState = {
        i_smooth: bestIdx,
        last_marker_idx: Math.floor(bestIdx),
        marker_moved_at: performance.now(),
      };
    }

    const smooth = window.__tpSmoothState;
    // Update smoothed index with EMA
    smooth.i_smooth = SMOOTH_GAMMA * bestIdx + (1 - SMOOTH_GAMMA) * smooth.i_smooth;

    // Only move marker when smoothed index advances by ≥0.4 lines
    const markerAdvanceThreshold = 0.4;
    const currentMarkerIdx = Math.floor(smooth.i_smooth);
    const markerDelta = currentMarkerIdx - smooth.last_marker_idx;

    let useSmoothedForScroll = false;
    if (Math.abs(markerDelta) >= markerAdvanceThreshold) {
      smooth.last_marker_idx = currentMarkerIdx;
      smooth.marker_moved_at = performance.now();
      useSmoothedForScroll = true;
    }

    // Use smoothed index for scroll target, but raw index for matching logic
    const scrollTargetIdx = useSmoothedForScroll ? smooth.i_smooth : currentIndex;

    try {
      if (typeof debug === 'function')
        debug({
          tag: 'smooth-scroll',
          bestIdx,
          i_smooth: Number(smooth.i_smooth.toFixed(2)),
          scrollTargetIdx: Number(scrollTargetIdx.toFixed(2)),
          markerDelta: Number(markerDelta.toFixed(2)),
          useSmoothedForScroll,
          scrollMarkerDistance: Math.floor(scrollMarkerDistance),
          outOfBounds,
          velocityMultiplier: Number(velocityMultiplier.toFixed(2)),
        });
    } catch {}

    // Breadcrumb: report similarity outcome for this match step (and stash score for gate)

    // Breadcrumb: report similarity outcome for this match step (and stash score for gate)
    const idxBefore = currentIndex; // for jitter metric
    try {
      window.__lastSimScore = Number(bestSim.toFixed(3));
      if (typeof debug === 'function')
        debug({
          tag: 'match:sim',
          idx: currentIndex,
          bestIdx,
          sim: window.__lastSimScore,
          windowAhead: MATCH_WINDOW_AHEAD,
          viterbi: true,
          pathLength: __viterbiPath.length,
        });
    } catch {}

    // Jitter meter: rolling std-dev of (bestIdx - idx)
    try {
      const J = (window.__tpJitter ||= {
        buf: [],
        max: 30,
        mean: 0,
        std: 0,
        spikeUntil: 0,
        lastLogAt: 0,
      });
      const d = bestIdx - idxBefore;
      J.buf.push(d);
      if (J.buf.length > J.max) J.buf.shift();
      if (J.buf.length >= 5) {
        const m = J.buf.reduce((a, b) => a + b, 0) / J.buf.length;
        const v = J.buf.reduce((a, b) => a + Math.pow(b - m, 2), 0) / J.buf.length;
        J.mean = +m.toFixed(2);
        J.std = +Math.sqrt(v).toFixed(2);
        const nowJ = performance.now();
        const elevated = nowJ < (J.spikeUntil || 0);
        // Emit at most ~3 times/sec
        if (!J.lastLogAt || nowJ - J.lastLogAt > 330) {
          J.lastLogAt = nowJ;
          try {
            if (typeof debug === 'function')
              debug({ tag: 'match:jitter', mean: J.mean, std: J.std, n: J.buf.length, elevated });
          } catch {}
        }
        // Spike detector: if std-dev spikes past 7, raise thresholds for ~8s
        if (J.std >= 7 && !elevated) {
          J.spikeUntil = nowJ + 8000;
          try {
            if (typeof debug === 'function')
              debug({ tag: 'match:jitter:spike', std: J.std, until: J.spikeUntil });
          } catch {}
        }
      }
    } catch {}

    // Early rescue when treadmill detected
    if (fallbackStreak >= 3 && J.std > 90) {
      // Trigger anchor scan for distinctive phrases
      const anchors = extractHighIDFPhrases(batchTokens, 3);
      if (anchors.length > 0) {
  const band = getAnchorBand();
  const anchorHits = searchBand(anchors, i_pred - band, i_pred + windowAhead, batchTokens);
        const bestAnchor = anchorHits.sort((a, b) => b.score - a.score)[0];
        if (bestAnchor) {
          // Find the para index containing the anchor word index
          let anchorParaIdx = -1;
          for (let p = 0; p < paraIndex.length; p++) {
            const para = paraIndex[p];
            if (bestAnchor.idx >= para.start && bestAnchor.idx <= para.end) {
              anchorParaIdx = p;
              break;
            }
          }
          if (anchorParaIdx >= 0) {
            // Allow anchor if not too recent and within rate limit
            const now = performance.now();
            if (now - lastAnchorAt > 2000 && allowAnchor()) {
              bestIdx = anchorParaIdx;
              bestSim = bestAnchor.score;
              lastAnchorAt = now;
              lastAnchorConfidence = bestAnchor.score;
              try {
                if (typeof debug === 'function')
                  debug({
                    tag: 'rescue:anchor',
                    idx: bestAnchor.idx,
                    wordIdx: bestAnchor.wordIdx,
                    score: bestAnchor.score,
                    distance: bestAnchor.distance,
                    allowed: true,
                  });
              } catch {}
            }
          }
        }
      }
    }

    // Apply elevated thresholds during jitter spikes
    const J = window.__tpJitter || {};
    const jitterElevated = typeof J.spikeUntil === 'number' && performance.now() < J.spikeUntil;
    let EFF_SIM_THRESHOLD = SIM_THRESHOLD + (jitterElevated ? 0.08 : 0);
    let EFF_STRICT_FWD_SIM = STRICT_FORWARD_SIM + (jitterElevated ? 0.06 : 0);
    // Dynamic threshold: lower for 1-2 steps after high-confidence anchor
    const nowThresh = performance.now();
    const timeSinceLastAnchor = nowThresh - lastAnchorAt;
    const dynamicLower = lastAnchorConfidence > 0.8 && timeSinceLastAnchor < 3000 ? 0.05 : 0; // lower by 0.05 for 3s after high-confidence anchor
    EFF_SIM_THRESHOLD -= dynamicLower;
    // End-game easing: give bestSim a tiny boost near the end
    const __adj = endGameAdjust(bestIdx, bestSim);
    if (__adj !== bestSim) {
      try {
        if (typeof debug === 'function')
          debug({
            tag: 'match:sim:end-ease',
            bestIdx,
            sim: Number(bestSim.toFixed(3)),
            adj: Number(__adj.toFixed(3)),
          });
      } catch {}
      bestSim = __adj;
    }
    // Soft advance: if below threshold but Viterbi consistent for last 3+ frames, advance by 1-2 tokens
    if (bestSim < EFF_SIM_THRESHOLD && viterbiConsistencyCount >= 2) {
      const delta = Math.min(2, Math.max(1, Math.floor(viterbiConsistencyCount / 2))); // 1-2 tokens
      bestIdx += delta;
      bestIdx = Math.min(bestIdx, scriptWords.length - 1);
      bestSim = EFF_SIM_THRESHOLD + 0.01; // force proceed by setting just above threshold
      try {
        if (typeof debug === 'function')
          debug({
            tag: 'soft-advance',
            originalIdx: i_viterbi,
            newIdx: bestIdx,
            delta,
            consistency: viterbiConsistencyCount,
            sim: Number(bestSim.toFixed(3)),
          });
      } catch {}
    }
    if (bestSim < EFF_SIM_THRESHOLD) {
      try {
        if (typeof debug === 'function')
          debug({
            tag: 'match:below-threshold',
            bestSim: Number(bestSim.toFixed(3)),
            threshold: Number(EFF_SIM_THRESHOLD.toFixed(3)),
            bestIdx,
          });
      } catch {}
      return;
    }

    // Lost-mode tracker: DISABLED - replaced by new rescue mode
    // The old lost mode was causing stalls, especially near end of script
    try {
      // Keep counters for debugging but don't trigger lost mode
      if (bestSim < 0.6) __tpLowSimCount++;
      else __tpLowSimCount = 0;
      // Removed: if ((J.std || 0) > 12 || __tpLowSimCount >= 8) { ... }
    } catch {}

    // If we’re lost, try to recover: DISABLED - replaced by new rescue mode
    // The old lost mode recovery was causing stalls near end of script
    /*
    if (__tpLost) {
      try {
        const BAND_BEFORE = 35,
          BAND_AFTER = 120;
        const anchors = extractHighIDFPhrases(spoken, 3);
        const hits = searchBand(
          anchors,
          currentIndex - BAND_BEFORE,
          currentIndex + BAND_AFTER,
          spoken
        );
        const best = hits.sort((a, b) => b.score - a.score)[0] || null;
        if (best && best.score > 0.78) {
          currentIndex = Math.max(currentIndex, Math.min(best.idx, scriptWords.length - 1));
          window.currentIndex = currentIndex;
          __tpLost = false;
          __tpLowSimCount = 0;
          try {
            if (typeof debug === 'function')
              debug({ tag: 'match:lost:recover', idx: currentIndex, score: best.score });
          } catch {}
        } else {
          // Defer normal motion until we recover
          return;
        }
      } catch {
        return;
      }
    }
    */

    // Coverage-based soft advance probe to prevent stalls
    // Stall instrumentation: if we haven't advanced for >1s, emit a one-line summary
    try {
      const nowS = performance.now();
      const idleMs = nowS - (_lastAdvanceAt || 0);
      if (idleMs > 1000) {
        const v =
          (__vParaIndex || []).find((v) => currentIndex >= v.start && currentIndex <= v.end) ||
          null;
        const lineTokens = v ? scriptWords.slice(v.start, v.end + 1) : [];
        const cov = tokenCoverage(lineTokens, spoken);
        // probe next virtual line similarity (cheap local look-ahead)
        let nextSim = 0;
        try {
          const vList = __vParaIndex || [];
          const vIdx = vList.findIndex((x) => currentIndex >= x.start && currentIndex <= x.end);
          if (vIdx >= 0 && vIdx + 1 < vList.length) {
            const nxt = vList[vIdx + 1];
            const win = scriptWords.slice(
              nxt.start,
              Math.min(nxt.start + spoken.length, nxt.end + 1)
            );
            nextSim = _sim(spoken, win);
          }
        } catch {}
        const nearEnd = scriptWords.length - currentIndex < 30;
        let bottom = false;
        try {
          bottom = atBottom(
            document.getElementById('viewer') ||
              document.scrollingElement ||
              document.documentElement ||
              document.body
          );
        } catch {}
        if (!__tpStall?.reported) {
          try {
            if (typeof debug === 'function')
              debug({
                tag: 'STALL',
                idx: currentIndex,
                cov: +cov.toFixed(2),
                nextSim: +nextSim.toFixed(2),
                time: +(idleMs / 1000).toFixed(1),
                nearEnd,
                atBottom: bottom,
              });
          } catch {}
          try {
            __tpStall.reported = true;
          } catch {}
        }
      } else {
        try {
          __tpStall.reported = false;
        } catch {}
      }
    } catch {}

    try {
      const nowPerf = performance.now();
      const allowSoftAdv = nowPerf > autoBumpUntil && nowPerf > (window.__tpSoftAdvanceFreeze?.until || 0);
      const soft = allowSoftAdv ? maybeSoftAdvance(bestIdx, bestSim, spoken) : null;
      if (soft && soft.soft) {
        bestIdx = soft.idx;
        bestSim = soft.sim;
        softAdvanceStreak++;
      } else {
        softAdvanceStreak = 0;
      }
    } catch {}

    // Soften big forward jumps unless similarity is very strong
    const delta = bestIdx - currentIndex;
    debug({
      tag: 'match:candidate',
      // normalize spoken tail consistently with line keys and matcher
      spokenTail: (function () {
        try {
          return normTokens(spoken.join(' ')).join(' ');
        } catch {
          return spoken.join(' ');
        }
      })(),
      bestIdx,
      bestScore: Number(bestSim.toFixed(3)),
      // Duplicate penalty visibility in HUD
      ...(function () {
        try {
          // Original paragraph key context (for reference)
          const para = paraIndex.find((p) => bestIdx >= p.start && bestIdx <= p.end) || null;
          const key = para?.key || '';
          const count = key ? __lineFreq.get(key) || 0 : 0;
          const dup = count > 1;
          // Virtual merged-line context (used for penalty)
          const v =
            (__vParaIndex || []).find((v) => bestIdx >= v.start && bestIdx <= v.end) || null;
          const vKey = v?.key || '';
          const vCount = vKey ? __vLineFreq.get(vKey) || 0 : 0;
          const vDup = vCount > 1;
          const vSig = v?.sig || '';
          const vSigCount = vSig ? __vSigCount.get(vSig) || 0 : 0;
          const dupPenalty = vDup ? 0.08 : 0;
          const sigPenalty = vSigCount > 1 ? 0.06 : 0;
          return {
            dup,
            dupCount: count,
            lineKey: key?.slice(0, 80),
            vDup,
            vDupCount: vCount,
            vLineKey: vKey?.slice(0, 80),
            vSig: vSig?.slice(0, 80),
            vSigCount,
            dupPenalty,
            sigPenalty,
          };
        } catch {
          return {};
        }
      })(),
      delta,
    });

    // NEW: if bestIdx hasn't moved for ~700ms but sim stays high, apply a tiny scroll nudge
    const SAME_IDX_MS = 700;
    const NUDGE_PX = 36;
    if (bestIdx === window.__lastBestIdx && bestSim > 0.8) {
      if (!window.__sameIdxSince) window.__sameIdxSince = performance.now();
      if (performance.now() - window.__sameIdxSince > SAME_IDX_MS) {
        onUserAutoNudge(); // Gate soft-advance during tiny scroll nudge
        try {
          window.__tpStallRelaxUntil = performance.now() + 300; // relax clamp guard briefly
          const next = Math.max(0, Math.min(viewer.scrollTop + NUDGE_PX, viewer.scrollHeight));
          if (typeof requestScroll === 'function') requestScroll(next);
          else viewer.scrollTop = next;
        } catch {}
        window.__sameIdxSince = performance.now(); // reset timer after nudge
      }
    } else {
      window.__lastBestIdx = bestIdx;
      window.__sameIdxSince = performance.now();
    }

    if (delta > MAX_JUMP_AHEAD_WORDS && bestSim < EFF_STRICT_FWD_SIM) {
      currentIndex += MAX_JUMP_AHEAD_WORDS;
    } else {
      // Soft advance gating: only advance if similarity meets minimum threshold
      const minAdvanceSim = 0.42; // minimum similarity for advance
      if (bestSim >= minAdvanceSim) {
        currentIndex = Math.max(currentIndex, Math.min(bestIdx, scriptWords.length - 1));
      } else {
        try {
          if (typeof debug === 'function')
            debug({
              tag: 'match:advance-gated',
              reason: 'below-min-advance-sim',
              bestSim: Number(bestSim.toFixed(3)),
              minAdvanceSim,
              bestIdx,
              currentIndex,
            });
        } catch {}
        // Don't advance - wait for better match
        return;
      }
    }
    window.currentIndex = currentIndex;
    // Update commit broker
    window.__tpCommit.idx = currentIndex;
    window.__tpCommit.ts = performance.now();

    // Periodic rescue scheduling: trigger rescue if LOST for too long
    try {
      const now = performance.now();
      const timeSinceLastRescue = now - (window.__lastRescueAttempt || 0);
      const rescueIntervalMs = 5000; // try rescue every 5 seconds when LOST

      if (window.__lostWatchdogCount >= 3 && timeSinceLastRescue > rescueIntervalMs) {
        // Trigger a global scan rescue
        window.__lastRescueAttempt = now;
        try {
          if (typeof debug === 'function')
            debug({
              tag: 'match:periodic-rescue',
              reason: 'lost-watchdog-triggered',
              watchdogCount: window.__lostWatchdogCount,
              timeSinceLastRescue: Math.round(timeSinceLastRescue),
            });
        } catch {}

        // Force a rescue by temporarily widening window and triggering search
        const originalWindowAhead = MATCH_WINDOW_AHEAD;
        MATCH_WINDOW_AHEAD = 1200; // very wide for rescue
        setTimeout(() => {
          MATCH_WINDOW_AHEAD = originalWindowAhead; // restore after rescue attempt
        }, 100);
      }
    } catch {}

    // PLL: Update bias controller with match position
    try {
      const yTarget = markerTop();
      const matchedPara = paraIndex.find((p) => bestIdx >= p.start && bestIdx <= p.end);
      let yMatch = yTarget;
      if (matchedPara && viewer) {
        const rect = matchedPara.el?.getBoundingClientRect?.();
        const vRect = viewer.getBoundingClientRect();
        if (rect) yMatch = rect.top - vRect.top;
      }
      PLL.update({
        yMatch,
        yTarget,
        conf: bestSim,
        dt: performance.now() - (window.__lastMatchTime || performance.now()),
      });
      window.__lastMatchTime = performance.now();
      try {
        if (mode === 'HYBRID') {
          window.HUD?.log?.('pll:update', {
            state: PLL.state,
            biasPct: PLL.biasPct.toFixed(3),
            yMatch: yMatch.toFixed(1),
            yTarget: yTarget.toFixed(1),
            error: (yMatch - yTarget).toFixed(1),
            conf: bestSim.toFixed(3),
          });
        }
      } catch {}
    } catch {}

    // Scroll toward the paragraph that contains scrollTargetIdx (smoothed), gently clamped
    if (!paraIndex.length) return;
    const targetPara =
      paraIndex.find((p) => scrollTargetIdx >= p.start && scrollTargetIdx <= p.end) ||
      paraIndex[paraIndex.length - 1];
    // Maintain a persistent pointer to the current line element
    try {
      if (currentEl && currentEl !== targetPara.el) {
        currentEl.classList.remove('active');
        currentEl.classList.remove('current');
      }
    } catch {}
    currentEl = targetPara.el;
    try {
      currentEl.classList.add('active');
      currentEl.classList.add('current');
    } catch {}

    const desiredTop = targetPara.el.offsetTop - markerTop(); // let scheduler clamp

    // Marker distance clamping: |y(active) - y(marker)| ≤ L_max (1.2 viewport lines)
    const L_MAX = 1.2 * (viewer.clientHeight || 800); // 1.2 viewport lines
    const activeY = targetPara.el.offsetTop;
    const markerY = viewer.scrollTop + markerTop();
    const scrollMarkerDistance = Math.abs(activeY - markerY);
    const outOfBounds = scrollMarkerDistance > L_MAX;

    // Apply catch-up velocity boost (1.5-2.0x) when out of bounds
    let velocityMultiplier = 1.0;
    if (outOfBounds) {
      velocityMultiplier = Math.min(2.0, 1.5 + (scrollMarkerDistance - L_MAX) / L_MAX); // 1.5-2.0x based on how far out
    }

    // Base cap to keep motion tame; relax near the end to avoid slowdown perception
    const maxScroll = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
    const progress = maxScroll ? viewer.scrollTop / maxScroll : 0;
    let capPx = Math.floor((viewer.clientHeight || 0) * 0.6 * velocityMultiplier); // Apply velocity boost to cap
    if (progress >= 0.75) capPx = Math.floor((viewer.clientHeight || 0) * 0.9 * velocityMultiplier);

    if (isFinal && window.__TP_CALM) {
      // If similarity isn't very high, cap the jump size to keep motion tame (but relax near end)
      try {
        if (Number.isFinite(bestScore) && bestScore < 0.9) {
          const dTop = desiredTop - viewer.scrollTop;
          const inTail = progress >= 0.85; // last ~15%: no cap
          if (!inTail && Math.abs(dTop) > capPx) {
            const limitedTop = viewer.scrollTop + Math.sign(dTop) * capPx;
            try {
              requestScroll(limitedTop);
              if (typeof debug === 'function')
                debug({ tag: 'scroll', top: limitedTop, mode: 'calm-cap' });
            } catch {}
            // sync display based on intended target (avoid read-after-write)
            try {
              const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
              const ratio = max ? limitedTop / max : 0;
              sendToDisplay({ type: 'scroll', top: limitedTop, ratio });
            } catch {}
            if (typeof markAdvance === 'function') markAdvance();
            else _lastAdvanceAt = performance.now();
            return; // defer full commit until next cycle
          }
        }
      } catch {}
      // Calm Mode: snap using geometry-based targeting at commit time
      try {
        onSpeechCommit(currentEl);
      } catch {}
      // --- HARD ANTI-DRIFT: force align committed line to marker ---
      try {
        if (__scrollCtl && typeof __scrollCtl.forceAlignToMarker === 'function') {
          // markerTop is the Y position of the marker line relative to the viewer
          // currentIndex is the committed line index
          // viewer.getBoundingClientRect().top is the top of the viewer in viewport
          // markerTop is already relative to viewer, so add viewer's top to get viewport Y
          const markerY = viewer.getBoundingClientRect().top + markerTop();
          __scrollCtl.forceAlignToMarker(currentIndex, markerY);
        }
      } catch {
        if (window.__TP_DEV) console.warn('forceAlignToMarker failed', e);
      }
      if (typeof debug === 'function')
        debug({ tag: 'scroll', top: desiredTop, mode: 'calm-commit' });
      {
        const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
        const ratio = max ? desiredTop / max : 0;
        sendToDisplay({ type: 'scroll', top: desiredTop, ratio });
      }
      try {
        const vRect = viewer.getBoundingClientRect();
        const anchorEl =
          __anchorObs?.mostVisibleEl?.() ||
          document.querySelector('#script p.active') ||
          targetPara?.el ||
          null;
        if (anchorEl) {
          const pRect = anchorEl.getBoundingClientRect();
          const anchorY = pRect.top - vRect.top;
          maybeCatchupByAnchor(anchorY, viewer.clientHeight);
        }
      } catch {}
      if (typeof markAdvance === 'function') markAdvance();
      else _lastAdvanceAt = performance.now();
    } else {
      const err = desiredTop - viewer.scrollTop;
      const tNow = performance.now();
      if (Math.abs(err) < DEAD_BAND_PX || tNow - _lastCorrectionAt < CORRECTION_MIN_MS) return;

      // Anti-jitter: for interim results, avoid backward corrections entirely
      const dir = err > 0 ? 1 : err < 0 ? -1 : 0;
      if (!isFinal && dir < 0) return;
      // Hysteresis: don’t change direction on interim unless the error is clearly large
      if (
        !isFinal &&
        _lastMoveDir !== 0 &&
        dir !== 0 &&
        dir !== _lastMoveDir &&
        Math.abs(err) < DEAD_BAND_PX * 2
      )
        return;

      // Scale steps based on whether this came from a final (more confident) match
      const fwdStep = isFinal ? MAX_FWD_STEP_PX : Math.round(MAX_FWD_STEP_PX * 0.6);
      const backStep = isFinal ? MAX_BACK_STEP_PX : Math.round(MAX_BACK_STEP_PX * 0.6);
      // Prefer element-anchored scrolling; apply jump cap unless similarity is very high
      try {
        const dTop = desiredTop - viewer.scrollTop;
        const inTail = progress >= 0.85; // last ~15%: no cap
        if (!inTail && Number.isFinite(bestScore) && bestScore < 0.9 && Math.abs(dTop) > capPx) {
          const limitedTop = viewer.scrollTop + Math.sign(dTop) * capPx;
          requestScroll(limitedTop);
        } else {
          scrollToEl(currentEl, markerTop());
        }
      } catch {
        let next;
        if (err > 0) next = Math.min(viewer.scrollTop + fwdStep, desiredTop);
        else next = Math.max(viewer.scrollTop - backStep, desiredTop);
        try {
          requestScroll(next);
        } catch {
          viewer.scrollTop = next;
        }
      }
      if (typeof debug === 'function') debug({ tag: 'scroll', top: viewer.scrollTop });
      {
        // compute output from intended target if we just scheduled a write
        const tTop = (() => {
          try {
            const last =
              typeof window.__lastScrollTarget === 'number' ? window.__lastScrollTarget : null;
            return last ?? viewer.scrollTop;
          } catch {
            return viewer.scrollTop;
          }
        })();
        const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
        const ratio = max ? tTop / max : 0;
        sendToDisplay({ type: 'scroll', top: tTop, ratio });
      }
      // Evaluate whether to run the gentle catch-up loop based on anchor position
      try {
        const vRect = viewer.getBoundingClientRect();
        // Prefer the most visible element if available; else current paragraph
        const anchorEl = __anchorObs?.mostVisibleEl?.() || null || targetPara.el;
        const pRect = anchorEl.getBoundingClientRect();
        const anchorY = pRect.top - vRect.top; // anchor relative to viewer
        maybeCatchupByAnchor(anchorY, viewer.clientHeight);
      } catch {}
      // mark progress for stall-recovery
      if (typeof markAdvance === 'function') markAdvance();
      else _lastAdvanceAt = performance.now();
      _lastCorrectionAt = tNow;
      if (dir !== 0) _lastMoveDir = dir;
    }
    // Dead-man timer: ensure scroll keeps up with HUD index
    try {
      deadmanWatchdog(currentIndex);
    } catch {}
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  }

  // Delegating stub: prefer window.formatInlineMarkup (ui/format.js or TS build)
  function formatInlineMarkup(text) {
    try {
      if (typeof window.formatInlineMarkup === 'function' && window.formatInlineMarkup !== formatInlineMarkup) {
        return window.formatInlineMarkup(text);
      }
    } catch {}
    // Fallback legacy inline implementation (kept minimal to match previous behavior)
    let s = escapeHtml(text);
    s = s
      .replace(/\[b\]([\s\S]+?)\[\/b\]/gi, '<strong>$1<\/strong>')
      .replace(/\[i\]([\s\S]+?)\[\/i\]/gi, '<em>$1<\/em>')
      .replace(/\[u\]([\s\S]+?)\[\/u\]/gi, '<span class="u">$1<\/span>')
      .replace(/\[note\]([\s\S]+?)\[\/note\]/gi, '<div class="note">$1<\/div>');
    s = s.replace(/\[color=([^\]]+)\]([\s\S]+?)\[\/color\]/gi, (_, col, inner) => {
      const c = safeColor(col);
      return c ? `<span style="color:${c}">${inner}</span>` : inner;
    });
    s = s.replace(/\[bg=([^\]]+)\]([\s\S]+?)\[\/bg\]/gi, (_, col, inner) => {
      const c = safeColor(col);
      return c
        ? `<span style="background:${c};padding:0 .15em;border-radius:.2em">${inner}</span>`
        : inner;
    });
    s = s.replace(/\[s1\]([\s\S]+?)\[\/s1\]/gi, (_, inner) => `<span style="${roleStyle('s1')}">${inner}<\/span>`);
    s = s.replace(/\[s2\]([\s\S]+?)\[\/s2\]/gi, (_, inner) => `<span style="${roleStyle('s2')}">${inner}<\/span>`);
    s = s.replace(/\[(g1|g2)\]([\s\S]+?)\[\/\1\]/gi, '$2');
    s = s.replace(/\[speaker\s*=\s*(1|2)\]([\s\S]+?)\[\/speaker\]/gi, (_, idx, inner) =>
      `<span style="${roleStyle('s' + idx)}">${inner}<\/span>`
    );
    s = s.replace(/\[guest\s*=\s*(1|2)\]([\s\S]+?)\[\/guest\]/gi, '$2');
    s = s.replace(/\[\/?(?:s1|s2|g1|g2)\]/gi, '');
    return s;
  }

  function stripTagsForTokens(text) {
    let s = String(text || '');
    // Notes are not spoken → drop entirely
    s = s.replace(/\[note\][\s\S]*?\[\/note\]/gi, '');
    // Keep spoken content; drop wrappers
    s = s.replace(/\[(?:s1|s2)\]([\s\S]+?)\[\/(?:s1|s2)\]/gi, '$1');
    // Drop g1/g2 and guest wrappers entirely (content kept by previous rules if needed)
    s = s.replace(/\[(?:g1|g2)\][\s\S]*?\[\/(?:g1|g2)\]/gi, '');
    s = s.replace(/\[(?:guest|speaker)\s*=\s*(?:1|2)\]([\s\S]+?)\[\/(?:guest|speaker)\]/gi, '$1');
    s = s.replace(/\[color=[^\]]+\]([\s\S]+?)\[\/color\]/gi, '$1');
    s = s.replace(/\[bg=[^\]]+\]([\s\S]+?)\[\/bg\]/gi, '$1');
    s = s.replace(/\[(?:b|i|u)\]([\s\S]+?)\[\/(?:b|i|u)\]/gi, '$1');
    return s;
  }

  // TP: typography-apply
  function applyTypography() {
    scriptEl.querySelectorAll('p, .note').forEach((el) => {
      el.style.fontSize = String(fontSizeInput.value) + 'px';
      el.style.lineHeight = String(lineHeightInput.value);
    });
    // Persist preferences
    try {
      localStorage.setItem('tp_font_size_v1', String(fontSizeInput.value || ''));
    } catch {}
    try {
      localStorage.setItem('tp_line_height_v1', String(lineHeightInput.value || ''));
    } catch {}
    sendToDisplay({
      type: 'typography',
      fontSize: fontSizeInput.value,
      lineHeight: lineHeightInput.value,
    });
  }

  function renderScript(text) {
    try {
      if (window.__tp_rs_done) return;
      window.__tp_rs_done = true;
    } catch {}
    const t = String(text || '');

    // Tokenize for speech sync (strip tags so only spoken words are matched)
    scriptWords = normTokens(stripTagsForTokens(text));

    // Build paragraphs; preserve single \n as <br>
    // First, split on double newlines into blocks, then further split any block
    // that contains note divs so note blocks always stand alone.
    const blocks = t.split(/\n{2,}/);
    const outParts = [];
    for (const b of blocks) {
      // Convert inline markup first so notes become <div class="note"> blocks
      const html = formatInlineMarkup(b).replace(/\n/g, '<br>');
      // If there are one or more note divs inside, split them out to standalone entries
      if (/<div class=\"note\"[\s\S]*?<\/div>/i.test(html)) {
        const pieces = html.split(/(?=<div class=\"note")|(?<=<\/div>)/i).filter(Boolean);
        for (const piece of pieces) {
          if (/^\s*<div class=\"note\"/i.test(piece)) outParts.push(piece);
          else if (piece.trim()) outParts.push(`<p>${piece}</p>`);
        }
      } else {
        outParts.push(html.trim() ? `<p>${html}</p>` : '');
      }
    }
    const paragraphs = outParts.filter(Boolean).join('');

    scriptEl.innerHTML = paragraphs || '<p><em>Paste text in the editor to begin…</em></p>';
    applyTypography();
    // Ensure enough breathing room at the bottom so the last lines can reach the marker comfortably
    applyBottomPad();
    // currentIndex = 0; // Do not reset index when rendering script for speech sync

    // Build paragraph index
    // Rebuild IntersectionObserver and (re)observe visible paragraphs
    // Rebuild IntersectionObserver via modular anchor observer
    try {
      __anchorObs?.ensure?.();
    } catch {}
  const paras = Array.from(scriptEl.querySelectorAll('p'));
    try {
      __anchorObs?.observeAll?.(paras);
    } catch {}
    lineEls = paras;
    try {
      updateDebugPosChip();
    } catch {}
    paraIndex = [];
    let acc = 0;
    __lineFreq = new Map();
    __vParaIndex = [];
    __vLineFreq = new Map();
    __vSigCount = new Map();
    // Prepare rarity stats structures (IDF recomputation on script changes)
    __paraTokens = [];
    __dfMap = new Map();
    // N-gram to positions index for candidate seeding
    __ngramIndex = new Map(); // ngram -> Set of paragraph indices

    // Function to detect non-spoken lines (headers, scene directions, etc.)
    function isNonSpokenLine(text) {
      const trimmed = text.trim();
      // Regex: ^(act|scene|intro|outro|credits)\b|^\s*—|^\s*[A-Z ]{6,}\s*$|^\[.*\]$
      // Modified to allow common scene heading punctuation, but keep case-sensitive for scene headings
      return (
        /^(act|scene|intro|outro|credits)\b/i.test(trimmed) ||
        /^\s*—/.test(trimmed) ||
        /^\s*[A-Z\s\.\-\:]{6,}\s*$/.test(trimmed) ||
        /^\[.*\]$/.test(trimmed)
      );
    }

    // Two-pass: 1) gather normalized tokens per paragraph and compute signature counts
    const paraTokenList = [];
    for (const el of paras) {
      try {
        const toks = normTokens(el.textContent || '');
        paraTokenList.push(toks);
      } catch {
        paraTokenList.push([]);
      }
    }
    // Build signature counts (first 4 tokens per paragraph)
    try {
      __vSigCount = new Map();
      for (const toks of paraTokenList) {
        try {
          const sig = (Array.isArray(toks) ? toks.slice(0, 4).join(' ') : '') || '';
          if (sig) __vSigCount.set(sig, (__vSigCount.get(sig) || 0) + 1);
        } catch {}
      }
    } catch {}

    // 2) now build paraIndex and related structures using accurate __vSigCount
    for (let idx = 0; idx < paras.length; idx++) {
      const el = paras[idx];
      const toks = paraTokenList[idx] || [];
      const wc = toks.length || 1;
      const key = normLineKey(el.textContent || '');
      const isNonSpoken = isNonSpokenLine(el.textContent || '');
      const paraIdx = paraIndex.length;
      // Mark meta/branding lines: short or repeated headers
      let isMeta = false;
      try {
        const low = key || '';
        if (low && low.startsWith('bs with joe')) isMeta = true;
        const tokCount = (low.split(/\s+/) || []).length;
        if (tokCount <= 5) isMeta = true;
        const sig = toks.slice(0, 4).join(' ');
        const vSigCount = __vSigCount.get(sig) || 0;
        if (vSigCount > 1) isMeta = true;
      } catch {}

      paraIndex.push({ el, start: acc, end: acc + wc - 1, key, isNonSpoken, isMeta });
      el.dataset.words = wc;
      el.dataset.idx = paraIdx;
      el.dataset.lineIdx = paraIdx; // for line-index.js
      acc += wc;
      __paraTokens.push(toks);
      try {
        const uniq = new Set(toks);
        uniq.forEach((t) => __dfMap.set(t, (__dfMap.get(t) || 0) + 1));

        // Index n-grams (3-grams and 4-grams) for candidate seeding
        const trigrams = getNgrams(toks, 3);
        const tetragrams = getNgrams(toks, 4);
        const allNgrams = [...trigrams, ...tetragrams];

        for (const ngram of allNgrams) {
          if (!__ngramIndex.has(ngram)) {
            __ngramIndex.set(ngram, new Set());
          }
          __ngramIndex.get(ngram).add(paraIdx);
        }
      } catch {}
      try {
        if (key) __lineFreq.set(key, (__lineFreq.get(key) || 0) + 1);
      } catch {}
    }
    // Build a script vocab set for quick overlap checks (used by inVocabRatio)
    try {
      const vocab = new Set();
      for (const toks of __paraTokens) for (const t of toks) vocab.add(t);
      window.__SCRIPT_VOCAB = vocab;
    } catch {}

    // Mirror to display AFTER data attributes are set
    try {
      if (displayWin && !displayWin.closed && displayReady) {
        sendToDisplay({
          type: 'render',
          html: scriptEl.innerHTML,
          fontSize: fontSizeInput.value,
          lineHeight: lineHeightInput.value,
        });
      }
    } catch {}
    __dfN = __paraTokens.length;
    // Set line elements for scroll control
    const wordLineEls = new Array(scriptWords.length);
    for (const p of paraIndex) {
      for (let i = p.start; i <= p.end; i++) {
        wordLineEls[i] = p.el;
      }
    }
    try {
      __scrollCtl?.setLineElements(wordLineEls);
      __scrollCtl?.resetEndgame?.(); // Reset endgame state when script changes
    } catch {}
    // Build line index for viewport estimation
    try {
      if (typeof window.buildLineIndex === 'function') {
        lineIndex = window.buildLineIndex(viewer);
      }
    } catch {
      console.warn('line-index build failed', e);
    }
    // Build virtual merged lines for matcher duplicate disambiguation
    try {
      const MIN_LEN = 35,
        MAX_LEN = 120; // characters
      let bufText = '';
      let bufStart = -1;
      let bufEnd = -1;
      let bufEls = [];
      for (const p of paraIndex) {
        const text = String(p.el?.textContent || '').trim();
        const candidate = bufText ? bufText + ' ' + text : text;
        if (candidate.trim().length < MAX_LEN) {
          // absorb
          if (!bufText) {
            bufStart = p.start;
            bufEnd = p.end;
            bufEls = [p.el];
            bufText = text;
          } else {
            bufText = candidate;
            bufEnd = p.end;
            bufEls.push(p.el);
          }
          if (bufText.length >= MIN_LEN) {
            const key = normLineKey(bufText);
            const sig = (function () {
              try {
                return normTokens(bufText).slice(0, 4).join(' ');
              } catch {
                return '';
              }
            })();
            __vParaIndex.push({
              text: bufText,
              start: bufStart,
              end: bufEnd,
              key,
              sig,
              els: bufEls.slice(),
              isNonSpoken: bufEls.some((el) => {
                const p = paraIndex.find((pi) => pi.el === el);
                return p?.isNonSpoken;
              }),
            });
            if (key) __vLineFreq.set(key, (__vLineFreq.get(key) || 0) + 1);
            if (sig) __vSigCount.set(sig, (__vSigCount.get(sig) || 0) + 1);
            bufText = '';
            bufStart = -1;
            bufEnd = -1;
            bufEls = [];
          }
        } else {
          // flush buffer if any
          if (bufText) {
            const key = normLineKey(bufText);
            const sig = (function () {
              try {
                return normTokens(bufText).slice(0, 4).join(' ');
              } catch {
                return '';
              }
            })();
            __vParaIndex.push({
              text: bufText,
              start: bufStart,
              end: bufEnd,
              key,
              sig,
              els: bufEls.slice(),
            });
            if (key) __vLineFreq.set(key, (__vLineFreq.get(key) || 0) + 1);
            if (sig) __vSigCount.set(sig, (__vSigCount.get(sig) || 0) + 1);
            bufText = '';
            bufStart = -1;
            bufEnd = -1;
            bufEls = [];
          }
          // push current as its own
          const key = normLineKey(text);
          const sig = (function () {
            try {
              return normTokens(text).slice(0, 4).join(' ');
            } catch {
              return '';
            }
          })();
          __vParaIndex.push({
            text,
            start: p.start,
            end: p.end,
            key,
            sig,
            els: [p.el],
            isNonSpoken: p.isNonSpoken,
          });
          if (key) __vLineFreq.set(key, (__vLineFreq.get(key) || 0) + 1);
          if (sig) __vSigCount.set(sig, (__vSigCount.get(sig) || 0) + 1);
        }
      }
      if (bufText) {
        const key = normLineKey(bufText);
        const sig = (function () {
          try {
            return normTokens(bufText).slice(0, 4).join(' ');
          } catch {
            return '';
          }
        })();
        __vParaIndex.push({
          text: bufText,
          start: bufStart,
          end: bufEnd,
          key,
          sig,
          els: bufEls.slice(),
          isNonSpoken: bufEls.some((el) => {
            const p = paraIndex.find((pi) => pi.el === el);
            return p?.isNonSpoken;
          }),
        });
        if (key) __vLineFreq.set(key, (__vLineFreq.get(key) || 0) + 1);
        if (sig) __vSigCount.set(sig, (__vSigCount.get(sig) || 0) + 1);
      }
    } catch {}
    // Initialize current element pointer
    try {
      currentEl?.classList.remove('active');
    } catch {}
    currentEl =
      paraIndex.find((p) => currentIndex >= p.start && currentIndex <= p.end)?.el ||
      paraIndex[0]?.el ||
      null;
    if (currentEl) currentEl.classList.add('active');
    // Notify presence of script (hasScript) for gating heavy subsystems
    try {
      const totalLines = (__paraTokens && __paraTokens.length) || 0;
      try {
        // Compute from editor text to avoid arming engines on empty/placeholder pages
        const src = (typeof editor !== 'undefined' && editor ? String(editor.value || '') : '') .trim();
        const tokenCount = src ? src.split(/\s+/).filter(Boolean).length : 0;
        const nonMetaLines = src
          .split(/\r?\n/)
          .map((s) => (s || '').trim())
          .filter((s) => s && !/^\[(?:note|s\d+|guest\d+)\]$/i.test(s) && !/^\[\/(?:note|s\d+|guest\d+)\]$/i.test(s)).length;
        const hasScript = tokenCount >= 20 && nonMetaLines >= 3;
        try { if (hasScript) window.tpSetHasScript && window.tpSetHasScript(true); } catch {}
        try { if (hasScript) console.log('[TP-TRACE]', 'rs:complete'); } catch {}
      } catch {}
      try { window.__tpHudInc && window.__tpHudInc('render', 'lines', totalLines); } catch {}
    } catch {}
  }

  // Dynamic bottom padding so the marker can sit over the final paragraphs
  function applyBottomPad() {
    try {
      // Ensure we can place the last paragraph at the marker line (e.g., ~40% from top)
      const markerPct = typeof window.__TP_MARKER_PCT === 'number' ? window.__TP_MARKER_PCT : 0.4;
      const vh = (viewer && viewer.clientHeight) || window.innerHeight || 800;
      const needForMarker = Math.floor(vh * markerPct) + 80; // add some cushion
      const basePad = Math.max(window.innerHeight * 0.55, 360);
      const pad = Math.max(basePad, needForMarker);
      if (scriptEl) scriptEl.style.paddingBottom = `${pad}px`;
      // Reset endgame on viewport changes that affect marker position
      __scrollCtl?.resetEndgame?.();
    } catch {}
  }

  // call this whenever you actually advance or scroll due to a match
  function markAdvance() {
    _lastAdvanceAt = performance.now();
    try {
      (__tpStall ||= {}).reported = false;
    } catch {}
  }

  // Near-end watchdog: keep drifting the page so the last paragraph can reach the marker line
  (function installEndDriftWatchdog() {
    try {
      if (window.__TP_END_DRIFT_INSTALLED) return;
      window.__TP_END_DRIFT_INSTALLED = true;
      const TICK_MS = 220;
      let tId = 0;
      const loop = () => {
        try {
          // Skip end-drift behavior when there is no script loaded or watchdog not armed
          try { if (!window.__tp_has_script || !window.__tp_wd_armed) { tId = setTimeout(loop, TICK_MS); return; } } catch {}
          const now = performance.now();
          const sc = viewer;
          if (!sc) return;
          // Don’t interfere while auto-catchup is active
          if (window.__scrollCtl && window.__scrollCtl.isActive && window.__scrollCtl.isActive()) {
            tId = setTimeout(loop, TICK_MS);
            return;
          }
          // Only act near the end of content
          const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
          const ratio = max ? sc.scrollTop / max : 0;
          const nearEndPage = ratio > 0.86;
          // If we haven’t advanced for a while but are near the end, nudge towards the current target paragraph
          const idleMs = now - (_lastAdvanceAt || 0);
          const idleTooLong = idleMs > 1600;
          if (nearEndPage && idleTooLong) {
            try {
              const p =
                paraIndex.find((p) => currentIndex >= p.start && currentIndex <= p.end) ||
                paraIndex[paraIndex.length - 1];
              if (p && p.el) {
                const target = Math.max(0, p.el.offsetTop - sc.clientHeight * 0.4);
                // Only drift if below target
                if (sc.scrollTop < target - 2) {
                  const step = Math.min(
                    60,
                    Math.max(18, Math.floor((target - sc.scrollTop) * 0.25))
                  );
                  sc.scrollTop = Math.min(max, sc.scrollTop + step);
                  try {
                    debug && debug({ tag: 'scroll:end-drift', top: sc.scrollTop, target, ratio });
                  } catch {}
                }
              }
            } catch {}
          }
        } catch {}
        tId = setTimeout(loop, TICK_MS);
      };
      tId = setTimeout(loop, TICK_MS);
      try {
        window.__TP_cancelEndDrift = () => tId && clearTimeout(tId);
      } catch {}
    } catch {}
  })();
  window.renderScript = renderScript; // for any external callers

  // Camera/WebRTC keepalive: periodically attempt reconnection if user intends camera mirroring
  setInterval(() => {
    try {
      if (!displayWin || displayWin.closed) {
        displayReady = false;
        return;
      }
      const st = camPC?.connectionState;
      if (wantCamRTC && camStream && (!st || st === 'failed' || st === 'disconnected')) {
        updateCamRtcChip('CamRTC: re-offer…');
        ensureCamPeer();
      }
    } catch {}
  }, 1500);

  // --- Token normalization (used by DOCX import, renderScript, and matcher) ---
  // Delegating stub: prefer window.normTokens (from ui/normTokens.js or TS build)
  function normTokens(text) {
    try {
      if (typeof window.normTokens === 'function' && window.normTokens !== normTokens) {
        return window.normTokens(text);
      }
    } catch {}
    // Fallback inline legacy implementation (kept behaviorally equivalent)
    let t = String(text)
      .toLowerCase()
      .replace(/’/g, "'")
      .replace(/\b(won't)\b/g, 'will not')
      .replace(/\b(can|do|does|is|are|was|were|has|have|had|would|should|could|did)n['’]t\b/g, '$1 not')
      .replace(/\b(\w+)'re\b/g, '$1 are')
      .replace(/\b(\w+)'ll\b/g, '$1 will')
      .replace(/\b(\w+)'ve\b/g, '$1 have')
      .replace(/\b(\w+)'d\b/g, '$1 would')
      .replace(/\b(\w+)'m\b/g, '$1 am')
      .replace(/\bit's\b/g, 'it is')
      .replace(/\bthat's\b/g, 'that is');

    t = t.replace(/(\d+)\s*[\u2010-\u2015-]\s*(\d+)/g, '$1 $2');
    t = t.replace(/%/g, ' percent');
    t = t.replace(/([a-z])[\u2010-\u2015-]([a-z])/gi, '$1 $2');

    try {
      t = t.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    } catch {
      t = t.replace(/[.,!?;:()"\[\]`]/g, ' ');
    }
    t = t.replace(/[\u2010-\u2015]/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    const raw = t.split(/\s+/).filter(Boolean);

    const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const teens = ['ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
    const tens = ['','', 'twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
    const numToWords = (n) => {
      n = Number(n);
      if (Number.isNaN(n) || n < 0 || n > 99) return null;
      if (n < 10) return ones[n];
      if (n < 20) return teens[n - 10];
      const t = Math.floor(n / 10), o = n % 10;
      return o ? `${tens[t]} ${ones[o]}` : tens[t];
    };

    const out = [];
    for (const w of raw) {
      if (/^\d{1,2}$/.test(w)) {
        const words = numToWords(w);
        if (words) {
          out.push(...words.split(' '));
          continue;
        }
      }
      out.push(w);
    }
    return out;
  }

  /* ──────────────────────────────────────────────────────────────
   * Smart Tagging (names → roles)
   * ────────────────────────────────────────────────────────────── */
  // Delegating stub: prefer window.normalizeSimpleTagTypos (from ui/normalize.js or TS build)
  function normalizeSimpleTagTypos(text) {
    try {
      if (typeof window.normalizeSimpleTagTypos === 'function' && window.normalizeSimpleTagTypos !== normalizeSimpleTagTypos) {
        return window.normalizeSimpleTagTypos(text);
      }
    } catch {}
    // Fallback (same behavior as legacy)
    return String(text || '')
      .replace(/\[\s*(s1|s2|g1|g2)\s*\]/gi, '[$1]')
      .replace(/\[\s*\/(s1|s2|g1|g2)\s*\]/gi, '[/$1]');
  }

  // Delegating stub: prefer window.smartTag (from ui/smartTag.js or TS build)
  function smartTag(input, opts = {}) {
    try {
      if (typeof window.smartTag === 'function' && window.smartTag !== smartTag) {
        return window.smartTag(input, opts);
      }
    } catch {}
    // Fallback: inline legacy implementation
    // if already tagged, do nothing (prevents double-wrapping on re-run)
    if (/\[(s1|s2|g1|g2)\]/i.test(input)) return input;

    const keepNames = opts.keepNames !== false; // default: true
    const lines = String(input || '').split(/\r?\n/);

    const ROLE_KEYS = ['s1', 's2', 'g1', 'g2'];
    const nameToRole = new Map();
    for (const key of ROLE_KEYS) {
      const nm = (ROLES[key].name || '').trim();
      if (nm) nameToRole.set(nm.toLowerCase(), key);
    }
    const aliasToRole = new Map([
      ['s1', 's1'],
      ['speaker 1', 's1'],
      ['host 1', 's1'],
      ['s2', 's2'],
      ['speaker 2', 's2'],
      ['host 2', 's2'],
      ['g1', 'g1'],
      ['guest 1', 'g1'],
      ['g2', 'g2'],
      ['guest 2', 'g2'],
    ]);

    const resolveRole = (name) => {
      const who = String(name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      return nameToRole.get(who) || aliasToRole.get(who) || null;
    };
    const displayNameFor = (role, fallback) => (ROLES[role]?.name || fallback || '').trim();

    let currentRole = null; // active role after a block header
    let pendingLabel = null; // add label on next paragraph flush
    let paraBuf = [];
    const out = [];

    const flush = () => {
      if (!paraBuf.length) return;
      const text = paraBuf.join(' ').trim();
      if (text) {
        if (currentRole) {
          const label = keepNames && pendingLabel ? `[b]${pendingLabel}:[/b] ` : '';
          out.push(`[${currentRole}]${label}${text}[/${currentRole}]`);
        } else {
          out.push(text);
        }
      }
      paraBuf = [];
      pendingLabel = null; // only show the label on the first paragraph after header
    };

    for (const raw of lines) {
      const s = raw.trim();

      // Block header: ">> NAME:" (also accepts single '>' and :, —, > as enders)
      const block = s.match(/^>{1,2}\s*([^:>\-—()]+?)\s*[:>\-—]\s*$/i);
      if (block) {
        flush();
        const name = block[1];
        const role = resolveRole(name);
        currentRole = role;
        pendingLabel = role && keepNames ? displayNameFor(role, name) : null;
        continue;
      }

      // Inline: "Name: text" / "Name — text" / "Name > text"
      const inline = raw.match(
        /^\s*([^:>\-—()]+?)(?:\s*\((off[-\s]?script)\))?\s*[:>\-—]\s*(.+)$/i
      );
      if (inline) {
        flush();
        const who = inline[1];
        const body = inline[3].trim();
        const role = resolveRole(who);
        if (role) {
          const show = keepNames ? `[b]${displayNameFor(role, who)}:[/b] ` : '';
          out.push(`[${role}]${show}${body}[/${role}]`);
          currentRole = role; // keep role active until another header/inline
          pendingLabel = null; // inline already included label
          continue;
        }
        // if no role match, fall through and treat as plain text
      }

      // Paragraph break
      if (!s) {
        flush();
        out.push('');
        continue;
      }

      // Accumulate content under current role (if any)
      paraBuf.push(s);
    }

    flush();
    return out.join('\n');
  }

  // TP: display-open
  function openDisplay() {
    try {
      // Always use the standalone external display for production
      displayWin = window.open('display.html', 'TeleprompterDisplay', 'width=1000,height=700');
      if (!displayWin) {
        setStatus('Pop-up blocked. Allow pop-ups and try again.');
        displayChip.textContent = 'Display: blocked';
        return;
      }
      displayReady = false;
      displayChip.textContent = 'Display: open';
  try { window.tpArmWatchdog && window.tpArmWatchdog(true); } catch {}
      closeDisplayBtn.disabled = true; // will be enabled by global DISPLAY_READY handler
      // Kick off handshake retry pings: every 300ms up to ~3s or until READY.
      if (displayHelloTimer) {
        clearInterval(displayHelloTimer);
        displayHelloTimer = null;
      }
      displayHelloDeadline = performance.now() + 3000; // 3s window
      displayHelloTimer = setInterval(() => {
        // If closed or already ready, stop.
        if (!displayWin || displayWin.closed || displayReady) {
          clearInterval(displayHelloTimer);
          displayHelloTimer = null;
          return;
        }
        // If deadline passed, stop trying.
        if (performance.now() > displayHelloDeadline) {
          clearInterval(displayHelloTimer);
          displayHelloTimer = null;
          return;
        }
        try {
          sendToDisplay({ type: 'hello' });
        } catch {}
      }, 300);
    } catch {
      setStatus('Unable to open display window: ' + e.message);
    }
  }
  function closeDisplay() {
    if (displayWin && !displayWin.closed) displayWin.close();
    displayWin = null;
    displayReady = false;
    closeDisplayBtn.disabled = true;
    displayChip.textContent = 'Display: closed';
    try { window.tpArmWatchdog && window.tpArmWatchdog(false); } catch {}
  }
  // TP: display-send
  function sendToDisplay(payload) {
    if (!displayWin || displayWin.closed) return;
    try {
      if (payload && payload.type === 'scroll') {
        const now =
          typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        const seq = (window.__tpScrollSeq ||= 0) + 1;
        window.__tpScrollSeq = seq;
        payload = { ...payload, seq, ts: now };
      }
    } catch {}
    displayWin.postMessage(payload, '*');
  }
  window.sendToDisplay = sendToDisplay;

  // Centralized scroll target + helpers (always scroll the same container, not window)
  // Installed later once viewer is bound
  function getScroller() {
    return viewer;
  }
  let _clampScrollTop, scrollByPx, _scrollToY, scrollToEl;

  // Debug chip updater (throttled via rAF): shows anchor percentage within viewport and scrollTop
  function updateDebugPosChipImmediate() {
    try {
      if (!debugPosChip || !viewer) return;
      const vH = Math.max(1, viewer.clientHeight || 1);
      const active = (scriptEl || viewer)?.querySelector('p.active');
      const vis = __anchorObs?.mostVisibleEl?.() || null;
      const el =
        vis ||
        active ||
        paraIndex.find((p) => currentIndex >= p.start && currentIndex <= p.end)?.el ||
        null;
      let pct = 0;
      if (el) {
        const vRect = viewer.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const anchorY = r.top - vRect.top;
        pct = Math.round(Math.max(0, Math.min(100, (anchorY / vH) * 100)));
      }
      const topStr = Math.round(viewer.scrollTop || 0).toLocaleString();
      debugPosChip.textContent = `A:${pct}% S:${topStr}`;
    } catch {}
  }
  let __debugPosRaf = 0;
  let __debugPosPending = false;
  function updateDebugPosChip() {
    if (__debugPosPending) return; // already scheduled
    __debugPosPending = true;
    __debugPosRaf && cancelAnimationFrame(__debugPosRaf);
    __debugPosRaf = requestAnimationFrame(() => {
      // Guard: only run debug/update UI when script present and watchdog armed
      try { if (!window.__tp_has_script || !window.__tp_wd_armed) { __debugPosPending = false; return; } } catch {}
      __debugPosPending = false;
      updateDebugPosChipImmediate();
    });
  }

  // Dead-man timer: if HUD index advances but scrollTop doesn’t, force a catch-up jump
  let _wdLastIdx = -1,
    _wdLastTop = 0,
    _wdLastT = 0;
  function deadmanWatchdog(idx) {
    try {
      // Respect global guard: do nothing when no script or watchdog not armed
      try { if (!window.__tp_has_script || !window.__tp_wd_armed) return; } catch {}
      const sc = getScroller();
      if (!sc) return;
      // Don’t fight auto-scroll
      if (autoTimer) return;
      const now = performance.now();
      const top = sc.scrollTop;
      if (idx > _wdLastIdx && now - _wdLastT > 600 && Math.abs(top - _wdLastTop) < 4) {
        // Force a catch-up jump to the current element/paragraph under idx
        let el = null;
        try {
          const p = (paraIndex || []).find((p) => idx >= p.start && idx <= p.end);
          el = p?.el || null;
          if (!el && Array.isArray(lineEls))
            el = lineEls[Math.min(idx, lineEls.length - 1)] || null; // best-effort fallback
        } catch {}
        if (el) {
          const offset = Math.round(sc.clientHeight * 0.4);
          scrollToEl(el, offset);
          // mirror to display
          const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
          const ratio = max ? sc.scrollTop / max : 0;
          sendToDisplay({ type: 'scroll', top: sc.scrollTop, ratio });
        }
      }
      if (idx > _wdLastIdx) {
        _wdLastIdx = idx;
        _wdLastT = now;
        _wdLastTop = top;
      }
    } catch {}
  }

  /* ──────────────────────────────────────────────────────────────
   * Typography + Auto‑scroll + Timer
   * ────────────────────────────────────────────────────────────── */
  function startAutoScroll() {
    if (autoTimer) return;
    // Pause catch-up controller while auto-scroll is active
    try {
      __scrollCtl?.stopAutoCatchup?.();
    } catch {}
    try { window.tpArmWatchdog && window.tpArmWatchdog(true); } catch {}

    // prefer user input; fall back to last saved; else default 60
    let pxSpeed = parseFloat(autoSpeed.value);
    if (!pxSpeed || pxSpeed <= 0) {
      const saved = parseFloat(localStorage.getItem('autoPxSpeed') || '');
      pxSpeed = saved && saved > 0 ? saved : 25;
      autoSpeed.value = String(pxSpeed); // reflect in UI
    }
    localStorage.setItem('autoPxSpeed', String(pxSpeed));

    autoToggle.textContent = `Auto-scroll: ${pxSpeed}px/s`;
    autoToggle.classList.add('active');

    // clear any previous timer
    if (autoTimer) clearInterval(autoTimer);

    // Use requestAnimationFrame for smooth, accurate timing
    let lastTime = performance.now();
    let startTime = performance.now();
    autoTimer = () => {
      const now = performance.now();
      const dt = (now - lastTime) / 1000; // actual seconds elapsed
      lastTime = now;
      const elapsed = (now - startTime) / 1000; // total elapsed time

      // live-update if user changes the number while running
      const live = parseFloat(autoSpeed.value);
      if (live && live > 0 && live !== pxSpeed) {
        pxSpeed = live;
        localStorage.setItem('autoPxSpeed', String(pxSpeed));
        autoToggle.textContent = `Auto-scroll: ${pxSpeed}px/s`;
      }

      // Initial speed boost for first 3 seconds to get past potential matching issues
      let effectiveSpeed = pxSpeed;
      if (elapsed < 3.0) {
        effectiveSpeed = pxSpeed + 4; // +4px/s boost for smoother initial advancement
        autoToggle.textContent = `Auto-scroll: ${effectiveSpeed.toFixed(0)}px/s (boost)`;
      } else {
        autoToggle.textContent = `Auto-scroll: ${pxSpeed}px/s`;
      }

      // convert px/s to px per frame
      let dy = effectiveSpeed * dt;

      // Apply PLL bias if hybrid lock is enabled
      if (isHybrid()) {
        dy *= 1 + PLL.biasPct;
      }

      try {
        scrollByPx(dy);
      } catch {
        viewer.scrollTop += dy;
      }

      {
        const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
        const ratio = max ? viewer.scrollTop / max : 0;
        sendToDisplay({ type: 'scroll', top: viewer.scrollTop, ratio });
      }

      // Continue the animation loop
      if (autoTimer) requestAnimationFrame(autoTimer);
    };
    requestAnimationFrame(autoTimer);
  }

  function stopAutoScroll() {
    if (autoTimer) {
      cancelAnimationFrame(autoTimer);
      autoTimer = null;
    }
    try { if (!speechOn) window.tpArmWatchdog && window.tpArmWatchdog(false); } catch {}
    autoToggle.classList.remove('active');
    autoToggle.textContent = 'Auto-scroll: Off';
  }

  // Resume catch-up controller if speech sync is active — via heuristic gate
  if (recActive) {
    try {
      const vRect = viewer.getBoundingClientRect();
      // Compute current anchor from active paragraph or currentIndex
      let anchorY = 0;
      // Prefer most-visible from IO module, then active/current paragraph
      const active = (scriptEl || viewer)?.querySelector('p.active');
      const el =
        __anchorObs?.mostVisibleEl?.() ||
        null ||
        active ||
        paraIndex.find((p) => currentIndex >= p.start && currentIndex <= p.end)?.el;
      if (el) {
        const r = el.getBoundingClientRect();
        anchorY = r.top - vRect.top;
      }
      maybeCatchupByAnchor(anchorY, viewer.clientHeight);
    } catch {
      try {
        __scrollCtl?.stopAutoCatchup?.();
      } catch {}
    }
  }

  // ⬇️ keep this OUTSIDE stopAutoScroll
  function tweakSpeed(delta) {
    onUserAutoNudge(); // Gate soft-advance during manual speed adjustments
    let v = Number(autoSpeed.value) || 0;
    v = Math.max(0, Math.min(300, v + delta));
    autoSpeed.value = String(v);
    if (autoTimer) autoToggle.textContent = `Auto-scroll: On (${v}px/s)`;
  }

  function startTimer() {
    if (chrono) return;
    chronoStart = performance.now();
    chrono = requestAnimationFrame(tickTimer);
  }
  function tickTimer(now) {
    const t = (now - chronoStart) / 1000;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const d = Math.floor((t % 1) * 10);
    timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
    chrono = requestAnimationFrame(tickTimer);
  }
  function resetTimer() {
    if (chrono) {
      cancelAnimationFrame(chrono);
      chrono = null;
    }
    timerEl.textContent = '00:00.0';
  }

  function beginCountdownThen(sec, fn) {
    sec = Math.max(0, Number(sec) || 0);
    if (!sec) {
      fn();
      return;
    }
    let n = sec;
    // TP: preroll-controls
    let __prerollStarted = false;
    // Helper: minimal recording ensure using adapter (GetRecordStatus -> StartRecord)
    async function ensureRecordingMini() {
      const bridge =
        typeof window !== 'undefined' && window.__obsBridge ? window.__obsBridge : null;
      if (!bridge && !window.__obsConnected && !(window.__recorder && window.__recorder.get))
        return false;
      const a = bridge ? null : window.__recorder?.get?.('obs');

      // Guard: if OBS is not enabled in recorder settings or the UI checkbox, skip OBS actions
      try {
        const settings = __recorder && __recorder.getSettings ? __recorder.getSettings() : null;
        const obsEnabledInSettings = settings && Array.isArray(settings.selected) ? settings.selected.indexOf('obs') >= 0 : false;
        const enableObsUi = !!document.getElementById('enableObs')?.checked;
        if (!obsEnabledInSettings && !enableObsUi) {
          // OBS explicitly disabled — do not attempt scene switching or starting the recorder
          if (window.__TP_DEV) console.debug('[OBS] ensureRecordingMini: OBS disabled by settings/UI — skipping');
          return false;
        }
      } catch {}

      // 1) Disk space check (best-effort)
      try {
        if (bridge && typeof bridge.getStats === 'function') {
          const stats = await bridge.getStats();
          const free = stats?.recording?.freeDiskSpace || stats?.free_disk_space || null;
          let freeBytes = null;
          if (typeof free === 'number') freeBytes = free;
          else if (typeof free === 'string' && /^\d+$/.test(free)) freeBytes = Number(free);
          if (freeBytes !== null) {
            const minBytes = 2 * 1024 * 1024 * 1024; // 2 GB
            if (freeBytes < minBytes) {
              _toast('Low disk space on OBS host — recording may fail', { type: 'warn' });
            }
          }
        }
      } catch {
        // ignore stats errors
      }

      // 2) If already recording, skip StartRecord
      try {
        const s = bridge
          ? await bridge.getRecordStatus()
          : await (a.call ? a.call('GetRecordStatus') : a.getStatus?.());
        if (s && s.outputActive) {
          try {
            window.setRecChip && window.setRecChip('recording');
          } catch {}
          return true;
        }
      } catch {
        // ignore GetRecordStatus errors and continue
      }

      // 3) Scene sanity — SAFE flow
      // Default behavior: do nothing. If the user has a preferred scene configured,
      // treat it as optional: validate it exists first and only switch if it differs
      // from the current program scene and the connection is stable.
      try {
        const settings = __recorder.getSettings?.() || {};
        let preferredScene = settings.configs?.obs?.scene || localStorage.getItem('tp_obs_scene') || '';
        // If no explicit preferred scene, skip any scene changes entirely
        if (preferredScene) {
          try {
            // wait a small quiet window to ensure connection is stable
            await new Promise((r) => setTimeout(r, 600));

            // helper to read current program scene and scene list from bridge/adapters
            let currentProgram = null;
            let scenes = null;
            try {
              if (bridge && typeof bridge.getCurrentProgramScene === 'function')
                currentProgram = await bridge.getCurrentProgramScene();
              else if (a && a.call) {
                try {
                  const r = await a.call('GetCurrentProgramScene');
                  currentProgram = r && (r.currentProgramScene || r.currentProgramSceneName || r.sceneName);
                } catch {}
              }
            } catch {}
            try {
              if (bridge && typeof bridge.getSceneList === 'function') scenes = await bridge.getSceneList();
              else if (a && a.call) {
                try {
                  const res = await a.call('GetSceneList');
                  scenes = res && (res.scenes || res.sceneList || null);
                } catch {}
              }
            } catch {}

            // Normalize scenes names to an array of string names if possible
            let sceneNames = null;
            try {
              if (Array.isArray(scenes)) sceneNames = scenes.map((s) => s && s.sceneName ? s.sceneName : s && s.name ? s.name : s);
            } catch {}
            // Dev diagnostic: log discovered scenes and current program
            try {
              if (window.__TP_DEV) {
                try { console.debug('[OBS-SCENE] preferredScene=', preferredScene); } catch {}
                try { console.debug('[OBS-SCENE] currentProgram=', currentProgram); } catch {}
                try { console.debug('[OBS-SCENE] sceneNames=', sceneNames); } catch {}
              }
            } catch {}

            // Only proceed if preferredScene exists in the scene list (exact match)
            const exists = Array.isArray(sceneNames) ? sceneNames.indexOf(preferredScene) >= 0 : false;
            if (!exists) {
              // Preferred scene not found: do nothing (leave program scene as-is)
              try { if (window.__TP_DEV) console.debug('[OBS-SCENE] preferred scene not found; skipping'); } catch {}
            } else {
              // If the preferred scene is already the current program scene, do nothing
              if (currentProgram && String(currentProgram) === String(preferredScene)) {
                try { if (window.__TP_DEV) console.debug('[OBS-SCENE] preferred scene already active; skipping'); } catch {}
              } else {
                try { if (window.__TP_DEV) console.debug('[OBS-SCENE] preferred scene exists and differs; will set when quiet'); } catch {}
                // Defer actual SetCurrentProgramScene until no transition is active.
                // We listen for a TransitionEnd-like event or wait a short quiet window of 500ms.
                const doSet = async () => {
                  try {
                    try { if (window.__TP_DEV) console.debug('[OBS-SCENE] invoking SetCurrentProgramScene ->', preferredScene); } catch {}
                    if (bridge && typeof bridge.setCurrentProgramScene === 'function') {
                      await bridge.setCurrentProgramScene(preferredScene);
                    } else if (a && a.call) {
                      await a.call('SetCurrentProgramScene', { sceneName: preferredScene });
                    } else if (typeof a.setCurrentProgramScene === 'function') {
                      await a.setCurrentProgramScene(preferredScene);
                    } else if (window.obsSocket && typeof window.obsSocket.call === 'function') {
                      await window.obsSocket.call('SetCurrentProgramScene', { sceneName: preferredScene });
                    }
                    try { if (window.__TP_DEV) console.debug('[OBS-SCENE] SetCurrentProgramScene complete'); } catch {}
                  } catch {
                    try { if (window.__TP_DEV) console.error('[OBS-SCENE] SetCurrentProgramScene failed', se); } catch {}
                  }
                };

                // Try to detect a transition API; otherwise wait 500ms quiet and set
                let transitionHandled = false;
                try {
                  if (bridge && typeof bridge.on === 'function') {
                    const off = bridge.on('TransitionEnd', async () => {
                      if (transitionHandled) return;
                      transitionHandled = true;
                      try {
                        off && off();
                      } catch {}
                      await doSet();
                    });
                    // fallback: set a timeout in case TransitionEnd never fires
                    setTimeout(async () => {
                      if (transitionHandled) return;
                      transitionHandled = true;
                      await doSet();
                    }, 800);
                  } else {
                    // no transition API: wait a short quiet window then set
                    setTimeout(async () => {
                      await doSet();
                    }, 600);
                  }
                } catch {
                  try { if (window.__TP_DEV) console.error('[OBS-SCENE] transition detection failed', e); } catch {}
                }
              }
            }
          } catch {}
        }
      } catch {}

      // 4) Start recording (bridge preferred)
      try {
        if (bridge) {
          await bridge.start();
          try {
            window.setRecChip('recording');
            window.__obsLastRecEventAt = Date.now();
          } catch {}
          return true;
        }
        if (a) {
          if (typeof a.start === 'function') {
            await a.start();
            try {
              window.setRecChip('recording');
              window.__obsLastRecEventAt = Date.now();
            } catch {}
            return true;
          }
          if (a.call) {
            await a.call('StartRecord');
            try {
              window.setRecChip('recording');
              window.__obsLastRecEventAt = Date.now();
            } catch {}
            return true;
          }
        }
      } catch {
        // start failed
        return false;
      }

      return false;
    }
    const show = (v) => {
      countNum.textContent = String(v);
      countOverlay.style.display = 'flex';
      sendToDisplay({ type: 'preroll', show: true, n: v });
      try {
        if (!__prerollStarted && window.getAutoRecordEnabled && window.getAutoRecordEnabled()) {
          __prerollStarted = true;
          try {
            if (window.__obsRecArmed) return;
            window.__obsRecArmed = true;
            (async () => {
              try {
                const ok = await ensureRecordingMini();
                if (!ok) {
                  _toast("Couldn't start OBS recording", { type: 'error' });
                  // allow manual retry via top rec chip
                  try {
                    const c = document.getElementById('recChip');
                    if (c) {
                      c.style.cursor = 'pointer';
                      c.onclick = async () => {
                        _toast('Retrying OBS start…');
                        await ensureRecordingMini();
                      };
                    }
                  } catch {}
                } else {
                  // Wait ~1.5s for RecordStateChanged confirmation; show clickable retry on failure
                  const t0 = Date.now();
                  const saw = await new Promise((resolve) => {
                    const id = setInterval(() => {
                      if (
                        window.__obsLastRecEventAt &&
                        Date.now() - window.__obsLastRecEventAt < 1600
                      ) {
                        clearInterval(id);
                        resolve(true);
                        return;
                      }
                      if (Date.now() - t0 > 1500) {
                        clearInterval(id);
                        resolve(false);
                        
                      }
                    }, 150);
                  });
                  if (!saw) {
                    _toast("OBS didn't confirm recording — click to retry", {
                      type: 'error',
                      onClick: async () => {
                        _toast('Retrying OBS start…');
                        try {
                          await ensureRecordingMini();
                        } catch {}
                      },
                    });
                  }
                }
              } catch {}
            })();
          } catch {}
        }
      } catch {}
    };
    show(n);
    const id = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(id);
        countOverlay.style.display = 'none';
        sendToDisplay({ type: 'preroll', show: false });
        fn();
      } else show(n);
    }, 1000);
  }

  async function toggleSpeechSync(on) {
    try {
      if (on) {
        // Don't start auto-scroll yet - wait for countdown to complete
        driver = 'speech';
        try {
          window.HUD?.bus?.emit('driver:switch', { to: 'speech' });
        } catch {}

        // Update UI to show preparing state
        document.body.classList.add('listening');
        recChip.textContent = 'Speech: preparing…';
        recBtn.textContent = 'Stop speech sync';
        try {
          recBtn.classList.remove('btn-start');
          recBtn.classList.add('btn-primary', 'btn-stop');
          recBtn.title = 'Stop speech sync';
        } catch {}

        const ok = await startASRorVAD(); // does countdown, then starts speech + auto-scroll
        if (!ok) {
          // Fallback: start auto-scroll in AUTO_ONLY mode
          startAutoScroll();
          mode = 'AUTO_ONLY';
          PLL.tune({ maxBias: 0 }); // ensure no bias if ASR missing
          // Update UI for fallback
          recChip.textContent = 'Speech: unavailable';
          // toast('Speech sync unavailable. Auto-scroll only.');
          console.warn('Speech sync unavailable. Auto-scroll only.');
          try {
            window.HUD?.bus?.emit('speech:fallback', { reason: 'unavailable' });
          } catch {}
          return;
        }

        PLL.tune({ maxBias: 0.12 }); // restore prod default
        setHybrid(true); // dy *= (1 + PLL.biasPct)
        mode = 'HYBRID';

        // Update UI for successful hybrid mode
        recChip.textContent = 'Speech: listening…';

        // optional: initial snap-to-nearest line, forward-only
        snapToViewportAnchor();
      } else {
        setHybrid(false);
        stopASRorVAD();
        PLL.tune({ maxBias: 0 }); // neutralize bias quickly
        stopAutoScroll();

        driver = 'auto';
        try {
          window.HUD?.bus?.emit('driver:switch', { to: 'auto' });
        } catch {}
        mode = 'OFF';

        // Update UI
        document.body.classList.remove('listening');
        recChip.textContent = 'Speech: idle';
        recBtn.textContent = 'Start speech sync';
        try {
          recBtn.classList.remove('btn-stop');
          recBtn.classList.add('btn-primary', 'btn-start');
          recBtn.title = 'Start speech sync';
        } catch {}
        try {
          __scrollCtl?.stopAutoCatchup?.();
          if (scrollChip) scrollChip.textContent = 'Scroll: idle';
        } catch {}
        try {
          window.matcher?.reset?.();
        } catch {}
      }
    } catch {
      console.warn(e);
      // Safe fallback
      setHybrid(false);
      stopASRorVAD();
      PLL.tune({ maxBias: 0 });
      stopAutoScroll();
      startAutoScroll(); // fallback to auto-only
      mode = 'AUTO_ONLY';
      driver = 'auto';
      // Update UI for error fallback
      document.body.classList.remove('listening');
      recChip.textContent = 'Speech: error';
      recBtn.textContent = 'Start speech sync';
      recBtn.classList.remove('btn-stop');
      recBtn.classList.add('btn-primary', 'btn-start');
      recBtn.title = 'Start speech sync';
      // toast('Speech sync error. Reverted to auto-scroll.');
      console.warn('Speech sync error. Reverted to auto-scroll.');
      try {
        window.HUD?.bus?.emit('speech:fallback', { reason: 'error' });
      } catch {}
    }

    // Persist state
    try {
      localStorage.setItem('teleprompter_mode', mode);
      localStorage.setItem('teleprompter_driver', driver);
    } catch {}
  }

  // Helper functions for the new state machine
  async function startASRorVAD() {
    try {
      const sec = Number(prerollInput?.value) || 0;
      await new Promise((resolve, reject) => {
        beginCountdownThen(sec, () => {
          try {
            startAutoScroll(); // Start auto-scroll after countdown completes
            startTimer();
            startSpeechSync();
            // Try to start external recorders per settings
            try {
              __recorder?.start?.();
            } catch {}
            resolve();
          } catch {
            reject(e);
          }
        });
      });
      return true;
    } catch {
      console.warn('ASR start failed:', e);
      return false;
    }
  }

  function stopASRorVAD() {
    try {
      stopSpeechSync();
      // Try to stop external recorders per settings
      try {
        __recorder?.stop?.();
      } catch {}
    } catch {
      console.warn('ASR stop failed:', e);
    }
  }

  function snapToViewportAnchor() {
    // Initial snap-to-nearest line, forward-only
    try {
      if (viewer && typeof scrollToCurrentIndex === 'function') {
        scrollToCurrentIndex();
      }
    } catch {
      console.warn('Viewport anchor snap failed:', e);
    }
  }

  // Diagnostic wrapper (placed AFTER full _initCore definition)
  async function init() {
    console.log('[TP-Pro] init() wrapper start');
    try {
      await _initCore();
  console.log('[TP-Pro] init() wrapper end (success)');
  try { window.tpMarkInitDone && window.tpMarkInitDone('init-wrapper-end'); } catch {}
      // After DOM ready and core init, fetch and propagate the build version
      (async function attachVersionEverywhere() {
        try {
          const res = await fetch('./VERSION.txt', { cache: 'no-store' });
          const v = (await res.text()).trim();
          if (!v) return;
          // 1) Global
          window.APP_VERSION = v;
          // 2) Footer build label (support either #build-label or #anvil-build-label)
          const el =
            document.getElementById('build-label') || document.getElementById('anvil-build-label');
          if (el) el.textContent = v;
          // 3) HUD header will pick up APP_VERSION automatically
          if (window.HUD) HUD.log('boot:version', { v });
        } catch {
          if (window.HUD) HUD.log('boot:version-error', String(e));
        }
      })();
    } catch {
      console.error('[TP-Pro] init() failed:', e);
      try {
        (window.__TP_BOOT_TRACE || []).push({
          t: Date.now(),
          m: 'init-failed:' + (e?.message || e),
        });
      } catch {}
      // Emergency minimal fallback to at least render placeholder + meter
      try {
        if (!window.__tpInitSuccess) {
          console.warn('[TP-Pro] Running emergency fallback init');
          const _ed = document.getElementById('editor');
          const sc = document.getElementById('script');
          if (sc && !sc.innerHTML)
            sc.innerHTML = '<p><em>Paste text in the editor to begin… (fallback)</em></p>';
          try {
            buildDbBars(document.getElementById('dbMeterTop'));
          } catch {}
          window.__tpInitSuccess = true;
        }
      } catch {
        console.error('[TP-Pro] fallback init failed', err2);
      }
      throw e;
    }
  }

  // (Removed duplicate populateDevices/requestMic/updateMicDevices/updateCamDevices — consolidated earlier.)

  /* ──────────────────────────────────────────────────────────────
   * Camera overlay
   * ────────────────────────────────────────────────────────────── */
  async function startCamera() {
    try {
      const id = camDeviceSel?.value || undefined;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: id ? { deviceId: { exact: id } } : true,
        audio: false,
      });
      // Order matters: set properties/attributes first, then assign stream, then play()
      camVideo.muted = true; // required for mobile autoplay
      camVideo.autoplay = true;
      camVideo.playsInline = true;
      camVideo.controls = false;
      camVideo.removeAttribute('controls');
      camVideo.removeAttribute('controlsList');
      camVideo.disablePictureInPicture = true;
      camVideo.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback');
      camVideo.setAttribute('playsinline', '');
      camVideo.setAttribute('webkit-playsinline', '');
      camVideo.srcObject = stream;
      try {
        watchCamTracks(stream);
      } catch {}
      try {
        await camVideo.play();
      } catch {
        // Autoplay might be blocked (iOS). Provide a simple tap-to-start fallback.
        warn('Camera autoplay blocked, waiting for user gesture', err);
        setStatus('Tap the video to start the camera');
        const onTap = async () => {
          try {
            await camVideo.play();
            setStatus('');
            camVideo.removeEventListener('click', onTap);
          } catch {}
        };
        camVideo.addEventListener('click', onTap, { once: true });
      }
      camWrap.style.display = 'block';
      startCamBtn.disabled = true;
      stopCamBtn.disabled = false;
      applyCamSizing();
      applyCamOpacity();
      applyCamMirror();
      camStream = stream;
      wantCamRTC = true;
      // Kick off WebRTC mirroring if display is open/ready
      try {
        if (displayWin && !displayWin.closed && displayReady) await ensureCamPeer();
      } catch {}
      populateDevices();
    } catch {
      warn('startCamera failed', e);
    }
  }
  function watchCamTracks(stream) {
    try {
      stream?.getVideoTracks().forEach((t) => {
        t.onended = async () => {
          try {
            _toast && _toast('Camera ended — attempting to recover…');
          } catch {}
          try {
            await startCamera();
          } catch {}
        };
      });
    } catch {}
  }
  function updateCamRtcChip(msg) {
    try {
      if (camRtcChip) camRtcChip.textContent = msg;
    } catch {}
  }
  function stopCamera() {
    wantCamRTC = false;
    try {
      const s = camVideo?.srcObject;
      if (s) s.getTracks().forEach((t) => t.stop());
    } catch {}
    camVideo.srcObject = null;
    camWrap.style.display = 'none';
    startCamBtn.disabled = false;
    stopCamBtn.disabled = true;
    camStream = null;
    updateCamRtcChip('CamRTC: idle');
    try {
      sendToDisplay({ type: 'webrtc-stop' });
    } catch {}
    try {
      if (camPC) {
        camPC.close();
        camPC = null;
      }
    } catch {}
  }
  function applyCamSizing() {
    const pct = Math.max(15, Math.min(60, Number(camSize.value) || 28));
    camWrap.style.width = pct + '%';
    try {
      sendToDisplay({ type: 'cam-sizing', pct });
    } catch {}
  }
  function applyCamOpacity() {
    const op = Math.max(0.2, Math.min(1, (Number(camOpacity.value) || 100) / 100));
    camWrap.style.opacity = String(op);
    try {
      sendToDisplay({ type: 'cam-opacity', opacity: op });
    } catch {}
  }
  function applyCamMirror() {
    camWrap.classList.toggle('mirrored', !!camMirror.checked);
    try {
      sendToDisplay({ type: 'cam-mirror', on: !!camMirror.checked });
    } catch {}
  }

  // Simple fallback: draw current video frame to a hidden canvas and postImage (future implementation placeholder)
  function enableCanvasMirrorFallback(reswitch) {
    try {
      // Avoid reinitializing if already active
      if (window.__camCanvasFallback && !reswitch) return;
      const cvs = window.__camCanvasFallback || document.createElement('canvas');
      window.__camCanvasFallback = cvs;
      const ctx = cvs.getContext('2d');
      function pump() {
        try {
          // Skip pumping/canvas work when no script or watchdog is not armed to avoid rAF spam
          try { if (!window.__tp_has_script || !window.__tp_wd_armed) { requestAnimationFrame(pump); return; } } catch {}
          if (!camVideo || !camVideo.videoWidth) {
            requestAnimationFrame(pump);
            return;
          }
          cvs.width = camVideo.videoWidth;
          cvs.height = camVideo.videoHeight;
          ctx.drawImage(camVideo, 0, 0);
          // Potential: send via postMessage with cvs.toDataURL('image/webp',0.6) throttled
          // For now: only keep canvas for possible local preview tools
        } catch {}
        requestAnimationFrame(pump);
      }
      requestAnimationFrame(pump);
      updateCamRtcChip('CamRTC: fallback');
    } catch {}
  }

  // ── WebRTC camera mirroring (simple in-window signaling) ──
  async function ensureCamPeer() {
    if (!camStream) return;
    // Fallback: if RTCPeerConnection not supported (locked-down environment), drop to canvas mirror path
    if (typeof window.RTCPeerConnection === 'undefined') {
      try {
        enableCanvasMirrorFallback();
      } catch {}
      return;
    }
    if (camPC) return; // already active
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      camPC = pc;
      updateCamRtcChip('CamRTC: negotiating…');
      camStream.getTracks().forEach((t) => pc.addTrack(t, camStream));
      try {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          const p = sender.getParameters();
          p.degradationPreference = 'maintain-framerate';
          // Target ~720p @ ~0.9 Mbps; allow downscale if upstream constrained
          p.encodings = [{ maxBitrate: 900_000, scaleResolutionDownBy: 1 }];
          await sender.setParameters(p).catch(() => {});
        }
      } catch {}
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          try {
            sendToDisplay({ type: 'cam-ice', candidate: e.candidate });
          } catch {}
        }
      };
      pc.onconnectionstatechange = () => {
        try {
          const st = pc.connectionState;
          if (st === 'connected') updateCamRtcChip('CamRTC: connected');
          else if (st === 'connecting') updateCamRtcChip('CamRTC: connecting…');
          else if (st === 'disconnected') updateCamRtcChip('CamRTC: retry…');
          else if (st === 'failed') updateCamRtcChip('CamRTC: failed');
          else if (st === 'closed') updateCamRtcChip('CamRTC: closed');
        } catch {}
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          try {
            pc.close();
          } catch {}
          camPC = null;
        }
      };
      const offer = await pc.createOffer({ offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);
      camAwaitingAnswer = true;
      // offer already sent above
    } catch {
      warn('ensureCamPeer failed', e);
    }
  }

  // Hot-swap camera device without renegotiation when possible
  async function switchCamera(deviceId) {
    try {
      if (!deviceId) return;
      const rtcOK = typeof window.RTCPeerConnection !== 'undefined';
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      const newTrack = newStream.getVideoTracks()[0];
      const oldTracks = camStream?.getVideoTracks?.() || [];
      // Update local preview
      camStream = newStream;
      camVideo.srcObject = newStream;
      if (!rtcOK) {
        try {
          enableCanvasMirrorFallback(true);
        } catch {}
        return;
      }
      // Replace outbound track if we have a sender
      const sender = camPC?.getSenders?.().find((s) => s.track && s.track.kind === 'video');
      if (sender && newTrack) {
        await sender.replaceTrack(newTrack);
        try {
          const p = sender.getParameters();
          p.degradationPreference = 'maintain-framerate';
          // Keep same bitrate cap after swap
          if (!p.encodings || !p.encodings.length)
            p.encodings = [{ maxBitrate: 900_000, scaleResolutionDownBy: 1 }];
          else p.encodings[0].maxBitrate = 900_000;
          await sender.setParameters(p).catch(() => {});
        } catch {}
        oldTracks.forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        updateCamRtcChip('CamRTC: swapping…');
        // Some browsers might require renegotiation if capabilities changed (rare)
        try {
          if (camPC && camPC.signalingState === 'stable') {
            // Heuristic: if connectionState not 'connected' shortly after swap, force new offer
            setTimeout(async () => {
              try {
                if (!camPC) return;
                const st = camPC.connectionState;
                if (st === 'failed' || st === 'disconnected') {
                  // Tear down and rebuild cleanly
                  try {
                    camPC.close();
                  } catch {}
                  camPC = null;
                  await ensureCamPeer();
                } else if (st !== 'connected') {
                  // Attempt proactive re-offer without full teardown
                  if (camPC.signalingState === 'stable') {
                    const offer = await camPC.createOffer();
                    await camPC.setLocalDescription(offer);
                    camAwaitingAnswer = true;
                    sendToDisplay({ type: 'cam-offer', sdp: offer.sdp });
                    updateCamRtcChip('CamRTC: renegotiate…');
                  }
                }
              } catch {}
            }, 400);
          }
        } catch {}
      } else {
        // No sender yet → build peer
        await ensureCamPeer();
      }
      // Re-apply presentation props to display
      try {
        const pct = Math.max(15, Math.min(60, Number(camSize.value) || 28));
        const op = Math.max(0.2, Math.min(1, (Number(camOpacity.value) || 100) / 100));
        sendToDisplay({ type: 'cam-sizing', pct });
        sendToDisplay({ type: 'cam-opacity', opacity: op });
        sendToDisplay({ type: 'cam-mirror', on: !!camMirror.checked });
      } catch {}
    } catch {
      warn('switchCamera failed', e);
      throw e;
    }
  }
  async function togglePiP() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await camVideo.requestPictureInPicture();
      }
    } catch {
      warn('PiP failed', e);
    }
  }

  /* ──────────────────────────────────────────────────────────────
   * Local storage + File I/O (DOCX supported)
   * ────────────────────────────────────────────────────────────── */
  const LS_KEY = 'tp_script_v1';
  function _saveToLocal() {
    try {
      localStorage.setItem(LS_KEY, editor.value || '');
      setStatus('Saved to browser.');
    } catch {
      setStatus('Save failed.');
    }
  }
  function _loadFromLocal() {
    try {
      const v = localStorage.getItem(LS_KEY) || '';
      editor.value = v;
      renderScript(v);
      setStatus('Loaded from browser.');
    } catch {
      setStatus('Load failed.');
    }
  }
  function _scheduleAutosave() {
    /* optional: attach a debounce here */
  }

  // TP: reset-script
  function resetScript() {
    // Stop auto-scroll and reset timer for a clean take
    if (autoTimer) stopAutoScroll();
    resetTimer();
    // Rebuild layout to ensure paraIndex is fresh, but keep content
    renderScript(editor?.value || '');
    // Reset logical position and scroll to the very top
    currentIndex = 0;
    window.currentIndex = currentIndex;
    viewer.scrollTop = 0;
    // Reset dead-man timer state
    _wdLastIdx = -1;
    _wdLastTop = 0;
    _wdLastT = 0;
    try {
      sendToDisplay({ type: 'scroll', top: 0, ratio: 0 });
    } catch {}
    setStatus('Script reset to top for new take.');
  }

  function _downloadAsFile(name, text, mime = 'text/plain') {
    try {
      let type = String(mime || 'text/plain');
      if (type.startsWith('text/') && !/charset=/i.test(type)) type += ';charset=utf-8';
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = name || 'download.txt';
      a.href = url;
      a.rel = 'noopener';
      // Fallback for browsers that ignore the download attribute
      if (typeof a.download === 'undefined') a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        a.remove();
      }, 1000);
    } catch {
      try {
        alert('Download failed: ' + (e?.message || e));
      } catch {}
    }
  }

  /* ──────────────────────────────────────────────────────────────
   * Speech recognition start/stop logic
   * ────────────────────────────────────────────────────────────── */
  // TP: speech-start
  function startSpeechSync() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setStatus('Speech recognition not supported in this browser.');
      return;
    }
    // Note: In hybrid mode, auto-scroll and speech sync work together
    // Only stop auto-scroll if we're not in hybrid/speech mode
    // if (autoTimer) stopAutoScroll();

    recog = new SR();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = 'en-US';
    // Light phrase bias for domain terms commonly misheard (small boost)
    try {
      recog.maxAlternatives = Math.max(2, recog.maxAlternatives || 0);
      const SGL = window.SpeechGrammarList || window.webkitSpeechGrammarList;
      if (SGL && 'grammars' in recog) {
        const list = new SGL();
        const domainTerms = ['ban', 'confiscation', 'transfer', 'possession'];
        const grammar =
          '#JSGF V1.0; grammar domain; public <term> = ' + domainTerms.join(' | ') + ' ;';
        // Small weight to gently bias without overfitting
        list.addFromString(grammar, 0.0);
        recog.grammars = list;
        try {
          if (typeof debug === 'function')
            debug({ tag: 'speech:grammar', installed: true, terms: domainTerms, weight: 0.0 });
        } catch {}
      } else {
        try {
          if (typeof debug === 'function')
            debug({ tag: 'speech:grammar', installed: false, reason: 'no-SpeechGrammarList' });
        } catch {}
      }
    } catch {
      try {
        if (typeof debug === 'function') debug({ tag: 'speech:grammar:error', e: String(e) });
      } catch {}
    }

    // Reset backoff on a good start and reflect UI state
    recog.onstart = () => {
      recBackoffMs = 300;
      document.body.classList.add('listening');
      try {
        recChip.textContent = 'Speech: listening…';
      } catch {}
      speechOn = true;
      try {
        window.HUD?.bus?.emit('speech:toggle', true);
      } catch {}
      try { window.tpArmWatchdog && window.tpArmWatchdog(true); } catch {}
    };

    let _lastInterimAt = 0;
    recog.onresult = (e) => {
      let interim = '';
      let finals = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += (r[0]?.transcript || '') + ' ';
        else interim += (r[0]?.transcript || '') + ' ';
      }
      // Finals = strong jumps
      if (finals) advanceByTranscript(finals, /*isFinal*/ true);

      // Interims = gentle tracking (every ~150ms)
      const now = performance.now();
      if (interim && now - _lastInterimAt > 150) {
        _lastInterimAt = now;
        advanceByTranscript(interim, /*isFinal*/ false);
      }
    };

    // Pause breathing for natural feel
    let __pauseTimer = null;
    function onPauseBreath(hard = false) {
      if (!PLL?.tune) return;
      PLL.tune({ decayMs: hard ? 350 : 450 });
      clearTimeout(__pauseTimer);
      __pauseTimer = setTimeout(() => PLL.tune({ decayMs: 550 }), 900);
    }

    recog.onspeechend = () => onPauseBreath();
    recog.onaudioend = () => onPauseBreath(true); // stronger hint
    recog.onend = () => {
      document.body.classList.remove('listening');
      try {
        recChip.textContent = 'Speech: idle';
      } catch {}
      speechOn = false;
      try {
        window.HUD?.bus?.emit('speech:toggle', false);
      } catch {}
      try { if (!autoTimer) window.tpArmWatchdog && window.tpArmWatchdog(false); } catch {}
      try {
        __scrollCtl?.stopAutoCatchup?.();
      } catch {}
      // If user didn't stop it, try to bring it back with backoff
      if (recAutoRestart && recActive) {
        setTimeout(() => {
          try {
            recog.start();
            try {
              recChip.textContent = 'Speech: listening…';
            } catch {}
            document.body.classList.add('listening');
          } catch {
            // swallow; next interval will try again
          }
        }, recBackoffMs);
        recBackoffMs = Math.min(recBackoffMs * 1.5, 5000); // cap at 5s
      }
    };

    try {
      recog.start();
    } catch {
      // speech start failed
    }
    // Don't start catch-up unconditionally; the heuristic will kick it in when needed
  }

  // TP: speech-stop
  function stopSpeechSync() {
    try {
      recog && recog.stop();
    } catch {}
    recog = null;
    try {
      __scrollCtl?.stopAutoCatchup?.();
      __scrollCtl?.resetEndgame?.();
    } catch {}
  }

  // TP: docx-mammoth (delegated to ui/upload.js)
  // Renamed to _ensureMammoth so unused-vars lint rule (allowed /^_/) doesn't complain.
  async function _ensureMammoth() {
    try {
      if (typeof window.ensureMammoth === 'function') return await window.ensureMammoth();
    } catch {}
    return null;
  }

  // TP: upload-file (delegates to extracted module)
  async function _uploadFromFile(file) {
    try {
      if (typeof window._uploadFromFile === 'function') return window._uploadFromFile(file);
      const s = document.createElement('script');
      s.src = './ui/upload.js';
      s.async = true;
      document.head.appendChild(s);
      await new Promise((res, rej) => {
        s.onload = res;
        s.onerror = rej;
      });
      if (typeof window._uploadFromFile === 'function') return window._uploadFromFile(file);
    } catch {
      try { console.warn('upload delegate failed', e); } catch {}
    }
  }

  // Debug HUD moved to debug-tools.js

  // ───────────────────────────────────────────────────────────────
  // Self-checks: quick asserts at load, with a small pass/fail bar
  // ───────────────────────────────────────────────────────────────
  // TP: self-checks
  function runSelfChecks() {
    const checks = [];

    // 1) Exactly one script include (by current script src if available)
    try {
      const cs = document.currentScript;
      let count = 1,
        label = 'n/a';
      if (cs && cs.src) {
        const src = cs.src;
        count = Array.from(document.scripts).filter((s) => s.src && s.src === src).length;
        label = src.split('/').pop();
      }
      checks.push({
        name: 'Single script include',
        pass: count === 1,
        info: `${label} found ${count}`,
      });
    } catch {
      checks.push({ name: 'Single script include', pass: true, info: '(skipped)' });
    }

    // 2) Help injected with Normalize/Validate
    try {
      const help = document.getElementById('shortcutsOverlay');
      const has = !!(
        help &&
        help.querySelector('#normalizeBtn') &&
        help.querySelector('#validateBtn')
      );
      checks.push({ name: 'Help injected', pass: has, info: has ? 'OK' : 'missing pieces' });
    } catch {
      checks.push({ name: 'Help injected', pass: false, info: 'error' });
    }

    // 3) Matcher constants defined and sane
    try {
      const a = typeof SIM_THRESHOLD === 'number' && SIM_THRESHOLD > 0 && SIM_THRESHOLD < 1;
      const b =
        typeof MATCH_WINDOW_AHEAD === 'number' &&
        MATCH_WINDOW_AHEAD >= 60 &&
        MATCH_WINDOW_AHEAD <= 1000;
      const c =
        typeof MATCH_WINDOW_BACK === 'number' && MATCH_WINDOW_BACK >= 0 && MATCH_WINDOW_BACK <= 500;
      const d =
        typeof STRICT_FORWARD_SIM === 'number' && STRICT_FORWARD_SIM > 0 && STRICT_FORWARD_SIM < 1;
      const e =
        typeof MAX_JUMP_AHEAD_WORDS === 'number' &&
        MAX_JUMP_AHEAD_WORDS >= 1 &&
        MAX_JUMP_AHEAD_WORDS <= 200;
      checks.push({
        name: 'Matcher constants',
        pass: a && b && c && d && e,
        info: `SIM=${typeof SIM_THRESHOLD === 'number' ? SIM_THRESHOLD : '?'} WIN_F=${typeof MATCH_WINDOW_AHEAD === 'number' ? MATCH_WINDOW_AHEAD : '?'} WIN_B=${typeof MATCH_WINDOW_BACK === 'number' ? MATCH_WINDOW_BACK : '?'} STRICT=${typeof STRICT_FORWARD_SIM === 'number' ? STRICT_FORWARD_SIM : '?'} JUMP=${typeof MAX_JUMP_AHEAD_WORDS === 'number' ? MAX_JUMP_AHEAD_WORDS : '?'}`,
      });
    } catch {
      checks.push({ name: 'Matcher constants', pass: false, info: 'not defined' });
    }

    // 4) Display handshake wiring present (openDisplay + sendToDisplay)
    try {
      const ok = typeof openDisplay === 'function' && typeof sendToDisplay === 'function';
      checks.push({
        name: 'Display handshake',
        pass: ok,
        info: ok ? 'wiring present' : 'functions missing',
      });
    } catch {
      checks.push({ name: 'Display handshake', pass: false, info: 'error' });
    }

    // 5) Top Normalize button wired
    try {
      const btn = document.getElementById('normalizeTopBtn');
      const wired = !!(btn && (btn.onclick || btn.dataset.wired));
      checks.push({
        name: 'Top Normalize button wired',
        pass: wired,
        info: wired ? 'OK' : 'missing',
      });
    } catch {
      checks.push({ name: 'Top Normalize button wired', pass: false, info: 'error' });
    }

    // 6) Mic bars drawing (top bar meter)
    try {
      const meter = document.getElementById('dbMeterTop');
      const bars = meter ? meter.querySelectorAll('.bar').length : 0;
      let pass = bars >= 8;
      let info = `${bars} bars`;
      if (audioStream && analyser) {
        setTimeout(() => {
          try {
            const on = meter.querySelectorAll('.bar.on').length;
            const row = checks.find((c) => c.name === 'Mic bars drawing');
            if (row) {
              row.pass = row.pass && on > 0;
              row.info = `${bars} bars, ${on} on`;
              renderSelfChecks(checks);
            }
          } catch {}
        }, 300);
        info += ', sampling…';
      }
      checks.push({ name: 'Mic bars drawing', pass, info });
    } catch {
      checks.push({ name: 'Mic bars drawing', pass: false, info: 'error' });
    }

    renderSelfChecks(checks);
    return checks;
  }

  function renderSelfChecks(checks) {
    try {
      const total = checks.length;
      const passed = checks.filter((c) => c.pass).length;
      const allOk = passed === total;

      // Try to append in the topbar if present; else fixed bar at top
      const host = document.querySelector('.topbar');
      let bar = document.getElementById('selfChecksBar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'selfChecksBar';
        bar.style.cssText = host
          ? 'margin-left:8px; padding:4px 8px; border:1px solid var(--edge); border-radius:8px; font-size:12px; cursor:pointer;'
          : 'position:fixed; left:8px; right:8px; top:8px; z-index:99999; padding:8px 10px; border:1px solid var(--edge); border-radius:10px; font-size:13px; cursor:pointer; background:#0e141b; color:var(--fg);';
        if (host) host.appendChild(bar);
        else document.body.appendChild(bar);
      }

      bar.style.background = allOk ? (host ? '' : '#0e141b') : host ? '' : '#241313';
      bar.style.borderColor = allOk ? 'var(--edge)' : '#7f1d1d';
      bar.textContent = `Self-checks: ${passed}/${total} ${allOk ? '✅' : '❌'}  (click)`;

      let panel = document.getElementById('selfChecksPanel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'selfChecksPanel';
        panel.className = 'hidden';
        panel.style.cssText =
          'position:fixed; right:10px; top:44px; z-index:99999; max-width:420px; background:#0e141b; border:1px solid var(--edge); border-radius:12px; box-shadow:0 8px 28px rgba(0,0,0,.45); padding:10px; color:var(--fg); font:12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;';
        panel.innerHTML =
          '<div style="margin:4px 0 6px; opacity:.8">Quick startup checks</div><div id="selfChecksList"></div>';
        document.body.appendChild(panel);
        document.addEventListener('click', (e) => {
          if (e.target !== bar && !panel.contains(e.target)) panel.classList.add('hidden');
        });
        const aboutCloseBtn = panel.querySelector('#aboutClose');
        if (aboutCloseBtn) aboutCloseBtn.onclick = () => panel.classList.add('hidden');
      }

      const list = panel.querySelector('#selfChecksList');
      list.innerHTML = '';
      for (const c of checks) {
        const row = document.createElement('div');
        row.style.cssText =
          'display:flex; justify-content:space-between; gap:10px; padding:4px 0; border-bottom:1px dashed var(--edge)';
        row.innerHTML = `<span>${c.pass ? '✅' : '❌'} ${c.name}</span><span class="dim" style="opacity:.8">${c.info || ''}</span>`;
        list.appendChild(row);
      }

      bar.onclick = () => {
        panel.classList.toggle('hidden');
      };
    } catch {
      try {
        console.warn('Self-checks UI failed:', e);
      } catch {}
    }

    // Ensure a top Normalize button exists for self-checks (in case HTML removed it)
    try {
      let topNorm = document.getElementById('normalizeTopBtn');
      if (!topNorm) {
        const targetRow = document.querySelector('.panel .row');
        if (targetRow) {
          topNorm = document.createElement('button');
          topNorm.id = 'normalizeTopBtn';
          topNorm.className = 'btn-chip';
          topNorm.textContent = 'Normalize';
          topNorm.title = 'Normalize current script tags';
          targetRow.appendChild(topNorm);
        }
      }
    } catch {}
  }

  // ───────────────────────────────────────────────────────────────
  // Easter eggs: theme toggle, party meter, advanced tools, :roar
  // ───────────────────────────────────────────────────────────────
  function installEasterEggs() {
    // ---- restore theme
    try {
      const savedTheme = localStorage.getItem('egg.theme');
      if (savedTheme) document.body.classList.add(savedTheme);
    } catch {}

    // ---- Konami unlock -> toggles 'savanna' class
    const konami = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
    let pos = 0;
    window.addEventListener('keydown', (e) => {
      const code = e.keyCode || e.which;
      pos = code === konami[pos] ? pos + 1 : 0;
      if (pos === konami.length) {
        pos = 0;
        document.body.classList.toggle('savanna');
        const on = document.body.classList.contains('savanna');
        try {
          localStorage.setItem('egg.theme', on ? 'savanna' : '');
        } catch {}
        try {
          setStatus && setStatus(on ? 'Savanna unlocked 🦁' : 'Savanna off');
        } catch {}
      }
    });

    // ---- dB meter party mode (5 clicks within 1.2s)
    const meter = document.getElementById('dbMeter');
    if (meter) {
      let clicks = 0,
        t0 = 0;
      meter.addEventListener('click', () => {
        const t = performance.now();
        if (t - t0 > 1200) clicks = 0;
        t0 = t;
        clicks++;
        if (clicks >= 5) {
          clicks = 0;
          meter.classList.toggle('party');
          try {
            setStatus &&
              setStatus(meter.classList.contains('party') ? 'Meter party 🎉' : 'Meter normal');
          } catch {}
        }
      });
    }

    // ---- Help title alt-click -> show hidden "Advanced" tools
    const helpTitle = document.getElementById('shortcutsTitle');
    const advanced = document.getElementById('helpAdvanced');
    if (helpTitle && advanced) {
      helpTitle.addEventListener('click', (e) => {
        if (!e.altKey) return;
        advanced.classList.toggle('hidden');
      });
    }
  } // <-- close installEasterEggs properly

  // ---- :roar in editor -> quick emoji confetti
  const ed = document.getElementById('editor');
  if (ed) {
    ed.addEventListener('input', () => {
      const v = ed.value.slice(-5).toLowerCase();
      if (v === ':roar') {
        ed.value = ed.value.slice(0, -5);
        roarOverlay();
        ed.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  function roarOverlay() {
    const o = document.createElement('div');
    o.style.cssText =
      'position:fixed;inset:0;display:grid;place-items:center;z-index:99999;pointer-events:none';
    o.innerText = '🦁';
    o.style.fontSize = '14vw';
    o.style.opacity = '0';
    document.body.appendChild(o);
    requestAnimationFrame(() => {
      o.style.transition = 'transform .5s ease, opacity .5s ease';
      o.style.transform = 'scale(1.1)';
      o.style.opacity = '0.9';
      setTimeout(() => {
        o.style.opacity = '0';
        o.style.transform = 'scale(0.9)';
      }, 700);
      setTimeout(() => o.remove(), 1200);
    });
  }

  // ───────────────────────────────────────────────────────────────
  // About popover (Ctrl+Alt+K)
  // ───────────────────────────────────────────────────────────────
  // About popover IIFE
  // About popover (inline inside main scope)
  let about;
  function showAbout() {
    if (!about) {
      about = document.createElement('div');
      about.className = 'overlay';
      const built = new Date().toLocaleString();
      const ver = window.APP_VERSION || 'local';
      about.innerHTML = `
      <div class="sheet" style="max-width:560px">
        <header style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <h3 style="margin:0">Teleprompter • About</h3>
          <button class="btn-chip" id="aboutClose">Close</button>
        </header>
        <p style="margin:0 0 6px; color:#96a0aa">Hidden credits & build info</p>
        <pre style="white-space:pre-wrap; user-select:text;">Build: ${built}
JS: v${ver}
Easter eggs: Konami (savanna), Meter party, :roar</pre>
      </div>`;
      document.body.appendChild(about);
      about.addEventListener('click', (e) => {
        if (e.target === about) about.classList.add('hidden');
      });
      about.querySelector('#aboutClose').onclick = () => about.classList.add('hidden');
    }
    about.classList.remove('hidden');
  }
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && e.key?.toLowerCase?.() === 'k') {
      e.preventDefault();
      showAbout();
    }
  });
  // end about popover

  // ── Auto-scroll fine control (micro + coarse) ─────────────────────────
  (function setupAutoSpeedControls() {
    const AUTO_MIN = 0,
      AUTO_MAX = 300,
      STEP_FINE = 1,
      STEP_COARSE = 5;
    const speedInput = document.getElementById('autoSpeed');
    const toggleBtn = document.getElementById('autoToggle');
    const decBtn = document.getElementById('autoDec');
    const incBtn = document.getElementById('autoInc');
    if (!speedInput || !toggleBtn) return;

    // restore last speed
    try {
      const saved = localStorage.getItem('tp_auto_speed');
      if (saved != null && !Number.isNaN(+saved))
        speedInput.value = String(Math.max(AUTO_MIN, Math.min(AUTO_MAX, +saved)));
    } catch {}

    const clamp = (v) => Math.max(AUTO_MIN, Math.min(AUTO_MAX, v | 0));
    function setAutoSpeed(v, _source = 'ui') {
      const val = clamp(v);
      if (String(speedInput.value) !== String(val)) speedInput.value = String(val);
      try {
        localStorage.setItem('tp_auto_speed', String(val));
      } catch {}
      // reflect in button label when ON
      if (toggleBtn.dataset.state === 'on') {
        toggleBtn.textContent = `Auto-scroll: On — ${val} px/s`;
      }
      // if you have a central scroll controller, notify it here:
      try {
        if (window.__scrollCtl?.setSpeed) window.__scrollCtl.setSpeed(val);
      } catch {}
    }
    function nudge(delta) {
      setAutoSpeed((+speedInput.value || 0) + delta, 'nudge');
    }

    // direct edits
    speedInput.addEventListener('input', () => setAutoSpeed(+speedInput.value || 0, 'input'));

    // +/- buttons (Shift = coarse)
    function wireNudge(btn, sign) {
      if (!btn) return;
      let holdTimer = 0;
      const apply = (ev) => nudge((ev && ev.shiftKey ? STEP_COARSE : STEP_FINE) * sign);
      btn.addEventListener('click', apply);
      btn.addEventListener('mousedown', (ev) => {
        apply(ev);
        clearInterval(holdTimer);
        let delay = 350;
        holdTimer = setInterval(() => {
          apply(ev);
          delay = Math.max(60, delay - 30); // accelerate
          clearInterval(holdTimer);
          holdTimer = setInterval(() => apply(ev), delay);
        }, delay);
      });
      ['mouseup', 'mouseleave', 'blur'].forEach((t) =>
        btn.addEventListener(t, () => clearInterval(holdTimer))
      );
    }
    wireNudge(decBtn, -1);
    wireNudge(incBtn, +1);

    // Keyboard: ↑/↓ = ±1, Shift+↑/↓ = ±5 (only when not typing in the editor/inputs)
    document.addEventListener('keydown', (e) => {
      const tag = (e.target && (e.target.tagName || '')).toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        nudge(e.shiftKey ? +STEP_COARSE : +STEP_FINE);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        nudge(e.shiftKey ? -STEP_COARSE : -STEP_FINE);
      }
    });

    // Mouse wheel over speed input: plain = ±1, Shift = ±5
    speedInput.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const delta = (e.deltaY > 0 ? -1 : +1) * (e.shiftKey ? STEP_COARSE : STEP_FINE);
        nudge(delta);
      },
      { passive: false }
    );

    // Reflect state text when toggling ON/OFF
    const _origToggle = toggleBtn.onclick;
    toggleBtn.addEventListener(
      'click',
      () => {
        const on = toggleBtn.dataset.state !== 'on';
        toggleBtn.dataset.state = on ? 'on' : 'off';
        toggleBtn.textContent = on
          ? `Auto-scroll: On — ${clamp(+speedInput.value || 0)} px/s`
          : 'Auto-scroll: Off';
        if (typeof _origToggle === 'function')
          try {
            _origToggle();
          } catch {}
      },
      { capture: true }
    );

    // initialize label if already on
    if (toggleBtn.dataset.state === 'on') {
      toggleBtn.textContent = `Auto-scroll: On — ${clamp(+speedInput.value || 0)} px/s`;
    }

    // expose for other modules/tests
    try {
      window.__setAutoSpeed = setAutoSpeed;
    } catch {}
  })();
})(); // end main IIFE (restored)

