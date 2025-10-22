// Opt-in HUD/debug utilities ported from debug-seed.js
// This module is only initialized when DEV is enabled (window.__TP_DEV || ?dev=1)
type LogFn = (tag: string, payload?: any) => void;

function defaultLog(tag: string, payload?: any) {
  try {
    (window as any).HUD && (window as any).HUD.log(tag, payload);
  } catch {}
}

export function initDebugHUD(opts?: { aggressive?: boolean; devFlag?: boolean }) {
  const log: LogFn = defaultLog;
  try {
    const devQuery = /([?#]).*dev=1/.test(location.href);
    const devLocal = (() => {
      try {
        return localStorage.getItem('tp_dev_mode');
      } catch {
        return null;
      }
    })();

    const flags = {
      devQuery,
      devLocal,
      hasViewer: !!document.getElementById('viewer'),
      hasDisplay: typeof (window as any).sendToDisplay === 'function',
      version: (window as any).APP_VERSION || '(unknown)'
    };
    log('boot:snapshot', flags);

    // Wrap known module functions (non-destructive, idempotent)
    function wrapModule(name: string) {
      try {
        const mod = (window as any)[name];
        if (!mod || typeof mod !== 'object') return;
        if (mod.__hudWrapped) return;
        mod.__hudWrapped = true;
        Object.keys(mod).forEach((k) => {
          const v = mod[k];
          if (typeof v === 'function' && !v.__hudWrapped) {
            const orig: any = v;
            mod[k] = function (this: any, ...args: any[]) {
              log(`wrap:${name}.${k}`, { args: args.slice(0, 3) });
              return orig.apply(this, args);
            } as any;
            (mod[k] as any).__hudWrapped = true;
          }
        });
        log('boot:wrapped', name);
      } catch {}
    }

    function wrapKnown() {
      ['scrollHelpers', 'scrollControl', 'ioAnchor', 'recorders'].forEach(wrapModule);
    }

    // Intercept global currentIndex writes for telemetry
    function interceptCurrentIndex() {
      try {
        if (!('currentIndex' in window)) return;
        let _ci = (window as any).currentIndex;
        Object.defineProperty(window, 'currentIndex', {
          get() { return _ci; },
          set(v) { _ci = v; log('match:index', { currentIndex: v }); },
          configurable: true
        });
        log('boot:index-intercept', 'ok');
      } catch {}
    }

    // Add speech hooks to the speech recognition object if present
    function hookSpeech() {
      try {
        const tryBind = () => {
          const r = (window as any).recog || (window as any).recognition || (window as any).sr || null;
          if (!r || r.__seedBound) return;
          r.__seedBound = true;
          const bind = (ev: string) => {
            const k = 'on' + ev;
            const prev = r[k];
            r[k] = function (e: any) {
              if (ev === 'result') {
                const res = e && e.results && e.results[e.results.length - 1];
                const tail = res && res[0] && res[0].transcript;
                log('speech:onresult+', { tail });
              } else {
                log('speech:' + k, e && e.type || k);
              }
              return typeof prev === 'function' ? prev.apply(this, arguments) : undefined;
            };
          };
          ['start','end','error','audiostart','audioend','soundstart','soundend','speechstart','speechend','result'].forEach(bind);
          log('boot:speech-hook', 'ok');
        };
        const t = setInterval(tryBind, 300);
        setTimeout(()=>clearInterval(t), 15000);
      } catch {}
    }

    function hookPostMessage() {
      try {
        window.addEventListener('message', (e) => {
          try {
            const data = e && (e as MessageEvent).data;
            if (!data) return;
            if (data.type) log('display:postMessage', Object.assign({ type: data.type }, data));
          } catch {}
        });
      } catch {}
    }

    function installScrollDetectors() {
      try {
        const viewer = document.getElementById('viewer');
        if (!viewer) return;
        let lastTop = viewer.scrollTop;
        let lastMoveAt = performance.now();
        viewer.addEventListener('scroll', () => {
          try {
            const now = performance.now();
            const dt = now - lastMoveAt;
            const dy = Math.abs(viewer.scrollTop - lastTop);
            const vh = viewer.clientHeight || 1;
            if (dy > Math.max(64, vh * 0.5)) {
              log('scroll:jump', { from: lastTop, to: viewer.scrollTop, dt: Math.round(dt) });
            } else {
              log('scroll:tick', { top: viewer.scrollTop });
            }
            lastTop = viewer.scrollTop; lastMoveAt = now;
          } catch {}
        }, { passive: true });

        window.addEventListener('tp-speech-chunk', () => {
          setTimeout(() => {
            const idle = performance.now() - lastMoveAt;
            if (idle > 1500) log('scroll:stuck?', { idleMs: Math.round(idle), top: viewer.scrollTop });
          }, 1550);
        });
      } catch {}
    }

    // Init sequence
    function init() {
      wrapKnown();
      interceptCurrentIndex();
      hookSpeech();
      hookPostMessage();
      installScrollDetectors();
      log('boot:seed-complete', { aggressive: !!(opts && opts.aggressive) });
    }

    // Defer to DOM ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(init, 0);
    else document.addEventListener('DOMContentLoaded', init);
  } catch {}
}

export default initDebugHUD;
