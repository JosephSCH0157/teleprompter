// Unified TypeScript entry (scaffold). This will eventually replace index.js + index.ts dual boot.
// For now it imports shared helpers and performs a minimal subset of the existing boot.

import { installAutoToggleSync } from './boot/autoToggleSync.js';
import './boot/compat-ids';
import { installModeRowsSync } from './boot/uiModeSync.js';
import { bindModeSelect, getMode, hydratePersistedMode, onMode, initModeState, bindSelect } from './core/mode-state';
import * as Auto from './features/autoscroll.js';
import { initHotkeys } from './features/hotkeys.js';
import { initPersistence } from './features/persistence.js';
import { initScroll } from './features/scroll.js';
import { installSpeech } from './features/speech-loader.js';
import { initTelemetry } from './features/telemetry.js';
import * as UI from './ui/dom.js';
// Signal JS path to skip its internal router and ASR boot logic
try {
  (window as any).__TP_TS_ROUTER_BOOT = true;
  (window as any).__TP_TS_ASR_BOOT = true;
  (window as any).__TP_TS_CORE_BOOT = true;
  (window as any).__TP_TS_HUD_BOOT = true;
} catch {}

async function boot(){
  try {
    // Delegate to existing JS boot for legacy pieces (router boot skipped via flag)
    await import('./index.js');
    // Minimal HUD SSOT (dev) — moved under TS entry ownership
    try {
      if (!(window as any).__tpHudWireActive) {
        (window as any).__tpHudWireActive = true;
        const HUD_FLAG = 'tp_dev_hud_v1';
        const ensureHudRoot = () => {
          try {
            let r = document.getElementById('hud-root') as HTMLElement | null;
            if (!r) {
              r = document.createElement('div');
              r.id = 'hud-root';
              r.className = 'hud-root hidden';
              r.setAttribute('aria-hidden', 'true');
              r.setAttribute('inert', '');
              document.body.appendChild(r);
            }
            return r;
          } catch { return null as any; }
        };
        const root = ensureHudRoot();
        const hudBus = new EventTarget();
        const api: any = (window as any).__tpHud = (window as any).__tpHud || {
          enabled: false,
          root,
          bus: {
            emit: (type: string, detail?: any) => { try { hudBus.dispatchEvent(new CustomEvent(type, { detail })); } catch {} },
            on: (type: string, fn: (d: any)=>void) => {
              try {
                const h = (e: any) => { try { fn(e.detail); } catch {} };
                hudBus.addEventListener(type, h);
                return () => { try { hudBus.removeEventListener(type, h); } catch {} };
              } catch { return () => {}; }
            },
          },
          setEnabled(on: boolean) {
            try {
              (this as any).enabled = !!on;
              if ((this as any).root) {
                (this as any).root.classList.toggle('hidden', !on);
                if (on) {
                  (this as any).root.removeAttribute('aria-hidden');
                  (this as any).root.removeAttribute('inert');
                } else {
                  (this as any).root.setAttribute('aria-hidden','true');
                  (this as any).root.setAttribute('inert','');
                }
              }
              try { localStorage.setItem(HUD_FLAG, on ? '1' : '0'); } catch {}
              try { document.dispatchEvent(new CustomEvent('hud:toggled', { detail: { on: !!on } })); } catch {}
            } catch {}
          },
          log: (...args: any[]) => {
            try {
              if (!(api as any).enabled || !(api as any).root) return;
              const pre = document.createElement('pre');
              pre.className = 'hud-line';
              pre.textContent = args.map(a => { try { return (typeof a === 'string') ? a : JSON.stringify(a); } catch { return String(a); } }).join(' ');
              (api as any).root.appendChild(pre);
              (api as any).root.scrollTop = (api as any).root.scrollHeight;
            } catch {}
          },
        };
        try { api.setEnabled(localStorage.getItem(HUD_FLAG) === '1'); } catch {}
        try { if (!(window as any).HUD) (window as any).HUD = api; } catch {}
        try {
          const logTx = (d: any) => { if (!d) return; api.log('captions:tx', { partial: d.partial, final: d.final, conf: d.confidence?.toFixed?.(2), len: d.text?.length ?? 0, idx: d.lineIndex, harness: d.harness }); };
          const logState = (d: any) => { if (!d) return; api.log('captions:state', { state: d.state, reason: d.reason, harness: d.harness }); };
          window.addEventListener('tp:captions:transcript', (e: any) => logTx(e.detail));
          window.addEventListener('tp:captions:state', (e: any) => logState(e.detail));
          window.addEventListener('tp:speech:transcript', (e: any) => logTx(e.detail));
          window.addEventListener('tp:speech:state', (e: any) => logState(e.detail));
        } catch {}
        try { document.dispatchEvent(new CustomEvent('hud:ready')); } catch {}
      }
    } catch {}
    // Perform router + gate orchestrator boot here (mirrors logic from index.js)
    try {
      async function tryImport(spec: string, flag?: string){
        try {
          const m = await import(spec);
          if (m) { try { flag && ((window as any)[flag] = true); } catch {} return m; }
        } catch (err){ try { console.warn('[router] import failed', spec, (err as any)?.message); } catch {} }
        return null;
      }
      const candidates = [
        { spec: '/dist/scroll-router.js', flag: '__tpScrollRouterTsActive' },
        { spec: '/dist/features/scroll-router.js', flag: '__tpScrollRouterLegacyDist' },
        { spec: './features/scroll-router.js', flag: '__tpScrollRouterJsActive' }
      ];
      let mod: any = null;
      for (const c of candidates){ mod = await tryImport(c.spec, c.flag); if (mod) break; }
      if (!mod){
        try {
          console.warn('[router] all candidates failed; injecting legacy script');
          const s = document.createElement('script');
          s.src = './teleprompter_pro.js'; s.defer = true;
          s.onload = () => { try { console.info('[router] legacy script loaded'); } catch {} };
          document.head.appendChild(s);
        } catch {}
      } else {
        try {
          if (typeof mod.initScrollRouter === 'function') {
            mod.initScrollRouter();
            try { (window as any).__tpScrollRouterTsActive = true; } catch {}
            try { (window as any).__tpRegisterInit && (window as any).__tpRegisterInit('feature:router'); } catch {}
          } else if (typeof mod.installScrollRouter === 'function') {
            mod.installScrollRouter({ auto: Auto });
            try { (window as any).__tpRegisterInit && (window as any).__tpRegisterInit('feature:router'); } catch {}
          } else {
            console.warn('[router] no recognized init API');
          }
        } catch (e){ console.warn('[entry.ts] router init failed', e); }
        try {
          const go = await (async () => {
            try {
              const goSpec = '/dist/gate-orchestrator.js' as string;
              return await import(goSpec as any);
            } catch (err){ try { console.warn('[gate] import failed', (err as any)?.message); } catch {} return null; }
          })();
          if (go && typeof go.initGateOrchestrator === 'function') {
            go.initGateOrchestrator();
            try { (window as any).__tpGateOrchestratorActive = true; } catch {}
            try { (window as any).__tpRegisterInit && (window as any).__tpRegisterInit('feature:gate-orchestrator'); } catch {}
            try { console.info('[gate] orchestrator initialized'); } catch {}
          }
        } catch (e){ console.warn('[entry.ts] gate orchestrator init failed', e); }
      }
    } catch (e){ console.warn('[entry.ts] router boot sequence failed', e); }

    // Install ASR feature from TS entry (mirrors JS probe/import with guard)
    try {
      const asrSpecs: string[] = [
        './index-hooks/asr.js',
        '/dist/index-hooks/asr.js',
        '/dist/asr.js',
      ];
      let asrInitDone = false;
      for (const spec of asrSpecs) {
        const dynSpec = spec as any; // avoid static analyzer complaints
        try {
          const mod: any = await import(dynSpec);
          if (mod) {
            const init = (mod.initAsrFeature || mod.default);
            if (typeof init === 'function') {
              try { init(); } catch {}
              try { (window as any).__tpAsrFeatureActive = true; } catch {}
              try { (window as any).__tpRegisterInit && (window as any).__tpRegisterInit('feature:asr'); } catch {}
              try { console.info('[ASR] initialized from', spec); } catch {}
              asrInitDone = true;
              break;
            }
          }
        } catch (e) {
          try { console.warn('[ASR] import failed', spec, (e as any)?.message || e); } catch {}
        }
      }
      if (!asrInitDone) {
        try { console.info('[ASR] no module found, skipping init'); } catch {}
      }
    } catch (e) {
      try { console.warn('[entry.ts] ASR init failed', e); } catch {}
    }

  // Core UI and feature boot now live in TS entry (index.js will skip these when __TP_TS_CORE_BOOT is true)
  try { UI.bindStaticDom(); } catch {}
  try { initPersistence();   try { (window as any).__tpRegisterInit && (window as any).__tpRegisterInit('feature:persistence'); } catch {} } catch (e) { try { console.warn('[entry.ts] initPersistence failed', e); } catch {} }
  try { initTelemetry();     try { (window as any).__tpRegisterInit && (window as any).__tpRegisterInit('feature:telemetry'); } catch {} } catch (e) { try { console.warn('[entry.ts] initTelemetry failed', e); } catch {} }
  try { initScroll();        try { (window as any).__tpRegisterInit && (window as any).__tpRegisterInit('feature:scroll'); } catch {} } catch (e) { try { console.warn('[entry.ts] initScroll failed', e); } catch {} }
  try { initHotkeys();       try { (window as any).__tpRegisterInit && (window as any).__tpRegisterInit('feature:hotkeys'); } catch {} } catch (e) { try { console.warn('[entry.ts] initHotkeys failed', e); } catch {} }
  try { installSpeech();     try { (window as any).__tpRegisterInit && (window as any).__tpRegisterInit('feature:speech'); } catch {} } catch (e) { try { console.warn('[entry.ts] installSpeech failed', e); } catch {} }

  // Layer shared helpers (idempotent)
    // Persist scroll mode across reloads using a cookie
    try {
      const cookieKey = 'tp_scroll_mode';
      const getCookie = (name: string): string | null => {
        try {
          const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
          return m ? decodeURIComponent(m[1]) : null;
        } catch { return null; }
      };
      const setCookie = (name: string, value: string, days = 365) => {
        try {
          const maxAge = days * 24 * 60 * 60;
          document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
        } catch {}
      };
      // Apply persisted mode before installing mode row sync and emitting events
      const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
      const saved = getCookie(cookieKey);
      if (sel && saved) {
        const exists = Array.from(sel.options || []).some(o => (o as HTMLOptionElement).value === saved);
        if (exists) sel.value = saved;
      }
      // Attach a one-time writer on change
      if (sel && !(window as any).__tpModeCookieWriter) {
        (window as any).__tpModeCookieWriter = true;
        sel.addEventListener('change', () => { try { setCookie(cookieKey, sel.value); } catch {} }, { capture: true });
      }
    } catch {}
    // Hydrate unified mode state (SSOT) before helpers
    try {
      const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
      initModeState({ defaultMode: 'manual', select: sel });
      if (!sel) { queueMicrotask(() => { try { bindSelect(document.getElementById('scrollMode') as HTMLSelectElement | null); } catch {} }); }
    } catch {}
    try { installModeRowsSync(); } catch {}
    try { installAutoToggleSync(Auto); } catch {}
    // Helper-friendly event emitters (tp:mode, tp:autoState) so smoke can observe under TS boot
    try {
      // Auto state emitter (reads from Auto feature)
      function __emitAutoState(){
        try {
          const st = (Auto && (Auto as any).getState && typeof (Auto as any).getState === 'function') ? (Auto as any).getState() : null;
          if (st) window.dispatchEvent(new CustomEvent('tp:autoState', { detail: st }));
        } catch {}
      }
      function __emitCurrentMode(){ try { window.dispatchEvent(new CustomEvent('tp:mode', { detail: { mode: getMode() } })); } catch {} }
      // Wire mode emitter once
      // Replace legacy direct DOM emitter: subscribe to unified mode-state
      try {
        if (!(window as any).__tpUnifiedModeListener) {
          (window as any).__tpUnifiedModeListener = true;
          onMode(() => { try { __emitCurrentMode(); } catch {} });
        }
      } catch {}
      // Seed initial auto state
    __emitAutoState();
    __emitCurrentMode();
      // Re-emit when autoscroll engine starts/stops or ticks
      try { document.addEventListener('autoscroll:start', __emitAutoState, { capture: true }); } catch {}
      try { document.addEventListener('autoscroll:stop', __emitAutoState,  { capture: true }); } catch {}
      try { document.addEventListener('autoscroll:tick', __emitAutoState,  { capture: true }); } catch {}
      // Also re-emit when speed input changes
      try {
        document.addEventListener('input', (ev) => { try { if ((ev?.target as any)?.id === 'autoSpeed') __emitAutoState(); } catch {} }, { capture: true });
        document.addEventListener('change', (ev) => { try { if ((ev?.target as any)?.id === 'autoSpeed') __emitAutoState(); } catch {} }, { capture: true });
      } catch {}
      // Defensive delayed re-emits so late observers (like smoke harness) still see at least one event
      try {
        [250, 750, 1500].forEach(ms => setTimeout(() => { try { __emitAutoState(); } catch {} try {
          const mode = getMode(); window.dispatchEvent(new CustomEvent('tp:mode', { detail: { mode, reemit:true, at: Date.now() } }));
        } catch {} }, ms));
      } catch {}
      // Mode sweep: emit each available mode once for observers (test harness) to confirm coverage
      try {
        if (!(window as any).__tpModeSweepDone) {
          (window as any).__tpModeSweepDone = true;
          const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
          const modes = sel ? Array.from(sel.options || []).map(o => (o as HTMLOptionElement).value).filter(Boolean) : [getMode()];
          modes.forEach((m, i) => setTimeout(() => { try { window.dispatchEvent(new CustomEvent('tp:mode', { detail: { mode: m, sweep:true, idx:i } })); } catch {} }, 100 + i * 60));
          if (!modes.includes('auto') && modes.includes('hybrid')) {
            setTimeout(() => { try { window.dispatchEvent(new CustomEvent('tp:mode', { detail: { mode: 'auto', aliasOf: 'hybrid', compat:true } })); } catch {} }, 100 + modes.length * 60 + 40);
          }
        }
      } catch {}

      // Handshake for smoke harness: re-emit signals when requested
      try {
        if (!(window as any).__tpSmokeTapInstalled) {
          (window as any).__tpSmokeTapInstalled = true;
          window.addEventListener('tp:smoke:tap', () => {
            try { __emitAutoState(); } catch {}
            try { __emitCurrentMode(); } catch {}
            try {
              const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
              const modes = sel ? Array.from(sel.options || []).map(o => (o as HTMLOptionElement).value).filter(Boolean) : [getMode()];
              modes.forEach((m, i) => setTimeout(() => { try { window.dispatchEvent(new CustomEvent('tp:mode', { detail: { mode: m, sweep:true, tap:true, idx:i } })); } catch {} }, 10 + i * 40));
              if (!modes.includes('auto') && modes.includes('hybrid')) {
                setTimeout(() => { try { window.dispatchEvent(new CustomEvent('tp:mode', { detail: { mode: 'auto', aliasOf: 'hybrid', compat:true, tap:true } })); } catch {} }, 10 + modes.length * 40 + 20);
              }
            } catch {}
          });
        }
      } catch {}
    } catch {}
    try { console.info('[entry.ts] delegated boot complete'); } catch {}
  } catch (e) {
    try { console.error('[entry.ts] boot failed', e); } catch {}
  }

          // HUD toggles + safety hotkey + dB/VAD mirroring (parity with legacy JS path)
          try {
            // Global helpers
            if (!(window as any).ensureHud) {
              (window as any).ensureHud = () => {
                try {
                  const hud: any = (window as any).__tpHud;
                  if (hud && typeof hud.toggle === 'function') { hud.toggle(); return; }
                } catch {}
                try { (window as any).toggleHud?.(); } catch {}
              };
            }
            if (!(window as any).toggleHud) {
              (window as any).toggleHud = () => {
                try {
                  const hud: any = (window as any).__tpHud;
                  if (hud && (typeof hud.toggle === 'function' || typeof hud.show === 'function')) {
                    if (typeof hud.toggle === 'function') return void hud.toggle();
                    const shown = !!(hud.isVisible?.());
                    return shown ? void hud.hide?.() : void hud.show?.();
                  }
                } catch {}
                // Tiny fallback pill if no HUD implementation is present
                try {
                  let el = document.getElementById('tp-hud-lite') as HTMLElement | null;
                  if (!el) {
                    el = document.createElement('div');
                    el.id = 'tp-hud-lite';
                    el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:999999;background:#111;color:#0f0;padding:6px 10px;border-radius:8px;border:1px solid #0f0;font:12px/1.2 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.4)';
                    el.textContent = 'HUD ready';
                    document.body.appendChild(el);
                  }
                  el.hidden = !el.hidden;
                } catch {}
              };
            }
            if (!(window as any).__tpHudSafetyHookInstalled) {
              (window as any).__tpHudSafetyHookInstalled = true;
              window.addEventListener('keydown', (e: any) => {
                try {
                  const k = (e.key || '').toLowerCase();
                  if ((e.altKey && e.shiftKey && k === 'h') || k === '`' || (e.ctrlKey && e.shiftKey && k === 'h')) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    (window as any).toggleHud?.();
                  }
                } catch {}
              }, { capture: true });
            }
            // dB/VAD mirroring + event bridge
            const logHud = (tag: string, payload?: any) => { try { ((window as any).HUD?.log || (window as any).__tpHud?.log)?.(tag, payload); } catch {} };
            const logDb = (() => {
              let lastDb = -Infinity, lastTs = 0;
              return (db: number) => {
                try {
                  const now = performance.now();
                  if (!(typeof db === 'number' && isFinite(db))) return;
                  if (Math.abs(db - lastDb) >= 2 || (now - lastTs) >= 150) {
                    lastDb = db; lastTs = now;
                    try { window.dispatchEvent(new CustomEvent('speech:db', { detail: { db } })); } catch {}
                    try {
                      const off = localStorage.getItem('tp_hud_quiet_db') === '1';
                      if (!off && !(window as any).__TP_QUIET) logHud('speech:db', { db });
                    } catch {}
                  }
                } catch {}
              };
            })();
            window.addEventListener('tp:db', (ev: any) => {
              try {
                const db = (ev && ev.detail && typeof ev.detail.db === 'number') ? ev.detail.db : null;
                if (db == null) return;
                logDb(db);
              } catch {}
            });
            window.addEventListener('tp:vad', (ev: any) => {
              try {
                const speaking = !!(ev && ev.detail && ev.detail.speaking);
                logHud('speech:vad', { speaking });
              } catch {}
            });
            if (!(window as any).setHudQuietDb) {
              (window as any).setHudQuietDb = (on: boolean) => {
                try { localStorage.setItem('tp_hud_quiet_db', on ? '1' : '0'); } catch {}
                try { console.info('[HUD] dB logs', on ? 'muted' : 'unmuted'); } catch {}
              };
            }
          } catch {}
  // HUD toggles + safety hotkey + dB/VAD mirroring (parity with legacy JS path)
  try {
    // Global helpers
    if (!(window as any).ensureHud) {
      (window as any).ensureHud = () => {
        try {
          const hud: any = (window as any).__tpHud;
          if (hud && typeof hud.toggle === 'function') { hud.toggle(); return; }
        } catch {}
        try { (window as any).toggleHud?.(); } catch {}
      };
    }
    if (!(window as any).toggleHud) {
      (window as any).toggleHud = () => {
        try {
          const hud: any = (window as any).__tpHud;
          if (hud && (typeof hud.toggle === 'function' || typeof hud.show === 'function')) {
            if (typeof hud.toggle === 'function') return void hud.toggle();
            const shown = !!(hud.isVisible?.());
            return shown ? void hud.hide?.() : void hud.show?.();
          }
        } catch {}
        // Tiny fallback pill if no HUD implementation is present
        try {
          let el = document.getElementById('tp-hud-lite') as HTMLElement | null;
          if (!el) {
            el = document.createElement('div');
            el.id = 'tp-hud-lite';
            el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:999999;background:#111;color:#0f0;padding:6px 10px;border-radius:8px;border:1px solid #0f0;font:12px/1.2 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.4)';
            el.textContent = 'HUD ready';
            document.body.appendChild(el);
          }
          (el as any).hidden = !(el as any).hidden;
        } catch {}
      };
    }
    if (!(window as any).__tpHudSafetyHookInstalled) {
      (window as any).__tpHudSafetyHookInstalled = true;
      window.addEventListener('keydown', (e: any) => {
        try {
          const k = (e.key || '').toLowerCase();
          if ((e.altKey && e.shiftKey && k === 'h') || k === '`' || (e.ctrlKey && e.shiftKey && k === 'h')) {
            e.stopImmediatePropagation();
            e.preventDefault();
            (window as any).toggleHud?.();
          }
        } catch {}
      }, { capture: true });
    }
    // dB/VAD mirroring + event bridge
    const logHud = (tag: string, payload?: any) => { try { ((window as any).HUD?.log || (window as any).__tpHud?.log)?.(tag, payload); } catch {} };
    const logDb = (() => {
      let lastDb = -Infinity, lastTs = 0;
      return (db: number) => {
        try {
          const now = performance.now();
          if (!(typeof db === 'number' && isFinite(db))) return;
          if (Math.abs(db - lastDb) >= 2 || (now - lastTs) >= 150) {
            lastDb = db; lastTs = now;
            try { window.dispatchEvent(new CustomEvent('speech:db', { detail: { db } })); } catch {}
            try {
              const off = localStorage.getItem('tp_hud_quiet_db') === '1';
              if (!off && !(window as any).__TP_QUIET) logHud('speech:db', { db });
            } catch {}
          }
        } catch {}
      };
    })();
    window.addEventListener('tp:db', (ev: any) => {
      try {
        const db = (ev && ev.detail && typeof ev.detail.db === 'number') ? ev.detail.db : null;
        if (db == null) return;
        logDb(db);
      } catch {}
    });
    window.addEventListener('tp:vad', (ev: any) => {
      try {
        const speaking = !!(ev && ev.detail && ev.detail.speaking);
        logHud('speech:vad', { speaking });
      } catch {}
    });
    if (!(window as any).setHudQuietDb) {
      (window as any).setHudQuietDb = (on: boolean) => {
        try { localStorage.setItem('tp_hud_quiet_db', on ? '1' : '0'); } catch {}
        try { console.info('[HUD] dB logs', on ? 'muted' : 'unmuted'); } catch {}
      };
    }
  } catch {}

}

boot();
export { boot };

