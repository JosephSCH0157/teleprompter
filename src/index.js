// --- Hard dup-boot guard (very top of module) ---
if (window.__tpBooted) {
  console.warn('[src/index] duplicate boot blocked; first =', window.__tpBooted);
  throw new Error('dup-boot');
}
window.__tpBooted = 'index.module';
window.__tpBootCount = (window.__tpBootCount || 0) + 1;
// Camera SSOT — TS owns the camera stack.
try { window.__tpCamSSOT = 'ts'; window.__tpCamWireActive = true; } catch {}

// --- HUD SSOT (dev) ---
(() => {
  try {
    const HUD_FLAG = 'tp_dev_hud_v1';
    if (window.__tpHudWireActive) return; // already installed
    window.__tpHudWireActive = true;

    function ensureHudRoot() {
      try {
        let r = document.getElementById('hud-root');
        if (!r) {
          r = document.createElement('div');
          r.id = 'hud-root';
          r.className = 'hud-root hidden';
          r.setAttribute('aria-hidden', 'true');
          r.setAttribute('inert', '');
          document.body.appendChild(r);
        }
        return r;
      } catch { return null; }
    }

    const root = ensureHudRoot();
    const api = window.__tpHud = window.__tpHud || {
      enabled: false,
      root,
      setEnabled(on) {
        try {
          this.enabled = !!on;
          if (this.root) {
            this.root.classList.toggle('hidden', !on);
            if (on) {
              this.root.removeAttribute('aria-hidden');
              this.root.removeAttribute('inert');
            } else {
              this.root.setAttribute('aria-hidden', 'true');
              this.root.setAttribute('inert', '');
            }
          }
          try { localStorage.setItem(HUD_FLAG, on ? '1' : '0'); } catch {}
          try { document.dispatchEvent(new CustomEvent('hud:toggled', { detail: { on: !!on } })); } catch {}
        } catch {}
      },
      log(...args) {
        try {
          if (!this.enabled || !this.root) return;
          const pre = document.createElement('pre');
          pre.className = 'hud-line';
          pre.textContent = args.map(a => {
            try { return (typeof a === 'string') ? a : JSON.stringify(a); } catch { return String(a); }
          }).join(' ');
          this.root.appendChild(pre);
          this.root.scrollTop = this.root.scrollHeight;
        } catch {}
      },
    };

    // Hydrate from storage
    try { api.setEnabled(localStorage.getItem(HUD_FLAG) === '1'); } catch {}
    // Unify legacy HUD log calls to the SSOT
    try { if (!window.HUD) window.HUD = api; } catch {}
    // Announce readiness
    try { document.dispatchEvent(new CustomEvent('hud:ready')); } catch {}
  } catch {}
})();

// Minimal bootstrap for the new `src/` modular layout.
// This file intentionally performs a very small set of init actions and
// delegates the heavy lifting to the legacy loader until a full migration is done.

import * as Adapters from './adapters/index.js';
// Provide legacy-compatible app store for settings/state persistence (exposes window.__tpStore)
import * as Mic from './adapters/mic.js';
import { bus } from './core/bus.js';
import * as Core from './core/state.js';
import * as Auto from './features/autoscroll.js';
import * as Eggs from './features/eggs.js';
import { initHotkeys } from './features/hotkeys.js';
import { initPersistence } from './features/persistence.js';
import { initScroll } from './features/scroll.js';
import { installSpeech } from './features/speech-loader.js';
import { initTelemetry } from './features/telemetry.js';
import './state/app-store.js';
// Ensure inline formatter is present (provides window.formatInlineMarkup)
import '../ui/format.js';
import '../ui/inline-shim.js';
// Legacy wrapSelection handler for toolbar buttons (ensures global exists in dev/CI)
import '../ui/wrap-shim.js';
// Display bridge: provides window.__tpDisplay (open/close/send/handleMessage)
// Lightweight toast system (attaches window.toast/initToastContainer)
import '../ui/toasts.js';
import './dev/dup-init-check.js';
import './media/display-bridge.js';
// Camera overlay helpers (defines window.__tpCamera and legacy applyCam* shims)
import './media/camera.js';
import * as UI from './ui/dom.js';
// Install typography bridge (CSS vars + wheel zoom guards + Settings bridge)
import '../ui/typography-bridge.js';
// Scripts Save/Load UI (dropdown + buttons wiring)
import '../ui/scripts-ui.js';
// OBS wiring: ensure Test button is always handled (claims OBS controls before legacy wiring)
import { wireObsPersistentUI } from './wiring/wire.js';
// Settings overlay and media/OBS wiring (module path)
import './ui/settings.js';

// Single-source mic adapter facade for legacy callers
try {
  window.__tpMic = {
    requestMic: (...a) => { try { return Mic.requestMic?.(...a); } catch {} },
    releaseMic: (...a) => { try { return Mic.releaseMic?.(...a); } catch {} },
  };
} catch {}

// Feature-level idempotence helper (belt & suspenders)
function initOnce(name, fn) {
  try {
    window.__tpInit = window.__tpInit || {};
    if (window.__tpInit[name]) return;
    window.__tpInit[name] = 1;
    return fn();
  } catch (e) {
    try { console.warn(`[init:${name}] failed`, e); } catch {}
  }
}


// --- Load legacy pieces as modules (no classic script injection) ---
async function loadLegacyPiecesAsModules() {
  const mods = [
    '../eggs.js',
    // Ensure OBS bridge is present before recorders.js so the recorder registry
    // can wrap 'obs' with a StartRecord-capable bridge adapter.
    '../adapters/obsBridge.js',
    '../adapters/bridge.js',
    '../adapters/obs.js',
    '../recorders.js',
    '../debug-tools.js',
    '../debug-seed.js',
    '../io-anchor.js',
    '../help.js',
    '../scroll-helpers.js',
    '../scroll-control.js',
  ];
  await Promise.all(mods.map(async (m) => {
    try {
      await import(m);
      try { window.__tpRegisterInit && window.__tpRegisterInit('import:'+m); } catch {}
    } catch (err) {
      console.error(`[src/index] Failed to import ${m}:`, err);
      if (window && window.__TP_IMPORT_ERRORS) {
        window.__TP_IMPORT_ERRORS.push({ mod: m, error: String(err && err.message || err) });
      } else if (window) {
        window.__TP_IMPORT_ERRORS = [{ mod: m, error: String(err && err.message || err) }];
      }
    }
  }));
  console.log('[src/index] module imports complete');
}

async function boot() {
  try {
    // Ensure legacy pieces are loaded before boot continues (no top-level await for lint compatibility)
    await loadLegacyPiecesAsModules();
    // Install Debug HUD (hidden by default) so the tilde hotkey works in module path too
    try {
      // Ensure HUD installer exists (load fallback if not already present)
      if (typeof window.__tpInstallHUD !== 'function') {
        try { await import('../debug-tools.js'); } catch {}
      }
      const needHudInstall = (typeof window.__tpInstallHUD === 'function') && (
        !window.__tpHud || (typeof window.__tpHud.toggle !== 'function' && typeof window.__tpHud.show !== 'function')
      );
      if (needHudInstall) {
        window.__tpHud = window.__tpInstallHUD({ hotkey: '~' });
        // Ensure HUD mount root is visible (dev stub may have hidden it)
        try {
          const r = document.getElementById('hud-root');
          if (r) {
            r.classList && r.classList.remove('hidden');
            r.removeAttribute && r.removeAttribute('aria-hidden');
            r.removeAttribute && r.removeAttribute('inert');
          }
        } catch {}
        // Auto-show HUD in dev sessions for visibility
        try { if (window.__TP_DEV && window.__tpHud?.show) window.__tpHud.show(); } catch {}
      }
      // Expose a tiny ensureHud() poke for dev; prefer full HUD toggle, else fallback
      if (typeof window.ensureHud !== 'function') {
        window.ensureHud = () => {
          try {
            const need = (typeof window.__tpInstallHUD === 'function') && (
              !window.__tpHud || (typeof window.__tpHud.toggle !== 'function' && typeof window.__tpHud.show !== 'function')
            );
            if (need) { window.__tpHud = window.__tpInstallHUD({ hotkey: '~' }); }
            if (window.__tpHud?.toggle) { window.__tpHud.toggle(); return; }
          } catch {}
          try { window.toggleHud?.(); } catch {}
        };
      }
      // HUD safety hook: lightweight overlay + global toggleHotkey
      if (typeof window.toggleHud !== 'function') {
        window.toggleHud = () => {
          try {
            // Prefer full HUD if available
            if (window.__tpHud && (typeof window.__tpHud.toggle === 'function' || typeof window.__tpHud.show === 'function')) {
              if (typeof window.__tpHud.toggle === 'function') return void window.__tpHud.toggle();
              const shown = !!window.__tpHud?.isVisible?.();
              return shown ? void window.__tpHud.hide?.() : void window.__tpHud.show?.();
            }
          } catch {}
          // Fallback: tiny in-page pill (bottom-right, capture-safe)
          try {
            let el = document.getElementById('tp-hud-lite');
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
      if (!window.__tpHudSafetyHookInstalled) {
        window.__tpHudSafetyHookInstalled = true;
        window.addEventListener('keydown', (e) => {
          try {
            const k = (e.key || '').toLowerCase();
            if ((e.altKey && e.shiftKey && k === 'h') || k === '`' || (e.ctrlKey && e.shiftKey && k === 'h')) {
              e.stopImmediatePropagation();
              // eslint-disable-next-line no-restricted-syntax
              e.preventDefault();
              window.toggleHud?.();
            }
          } catch {}
        }, { capture: true });
      }
      // If HUD is present, mirror speech gates to it for visibility
      try {
        const logHud = (tag, payload) => { try { (window.HUD?.log || window.__tpHud?.log)?.(tag, payload); } catch {} };
        // Quiet dB meter: sample rarely when silent, modestly when speaking, and only on meaningful change
        const __dbState = { lastAt: 0, lastVal: null };
        const __vadState = { speaking: false };
        window.addEventListener('tp:db', (ev) => {
          try {
            const db = (ev && ev.detail && typeof ev.detail.db === 'number') ? ev.detail.db : null;
            if (db == null) return;
            // Respect explicit opt-out via storage or global quiet flag
            try {
              const off = localStorage.getItem('tp_hud_quiet_db') === '1';
              if (off || window.__TP_QUIET) return;
            } catch {}
            const now = performance.now();
            const dt = now - (__dbState.lastAt || 0);
            const dv = Math.abs((__dbState.lastVal ?? db) - db);
            // Throttle harder when not speaking
            const MIN_DT_SPEAK = 3000;   // ms between updates while talking
            const MIN_DT_SILENT = 15000; // ms between updates while silent
            const MIN_DV = 6;            // dB change threshold to break through throttle
            const minDt = __vadState.speaking ? MIN_DT_SPEAK : MIN_DT_SILENT;
            if (dt >= minDt || dv >= MIN_DV) {
              __dbState.lastAt = now; __dbState.lastVal = db;
              logHud('speech:db', { db });
            }
          } catch {}
        });
        window.addEventListener('tp:vad', (ev) => {
          try {
            const speaking = !!(ev && ev.detail && ev.detail.speaking);
            __vadState.speaking = speaking;
            logHud('speech:vad', { speaking });
          } catch {}
        });
        // Small helper to toggle HUD dB logs at runtime (persists in localStorage)
        try {
          if (!window.setHudQuietDb) {
            window.setHudQuietDb = (on) => {
              try { localStorage.setItem('tp_hud_quiet_db', on ? '1' : '0'); } catch {}
              try { console.info('[HUD] dB logs', on ? 'muted' : 'unmuted'); } catch {}
            };
          }
        } catch {}
      } catch {}
    } catch {}
    try { window.__tpRegisterInit && window.__tpRegisterInit('boot:start'); } catch {}
    console.log('[src/index] boot()');
    try { window.__TP_BOOT_TRACE = window.__TP_BOOT_TRACE || []; window.__TP_BOOT_TRACE.push({ t: Date.now(), tag: 'src/index', msg: 'boot start' }); } catch {}
    // Dev-only parity guard: verifies key UI elements and wiring exist
    try { if (window?.__TP_BOOT_INFO?.isDev) import('./dev/parity-guard.js').catch(() => {}); } catch {}
    await Core.init();

    // Pre-seed a wider default script column if user hasn't set one yet
    try {
      const KEY = 'tp_typography_v1';
      let st; try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { st = {}; }
      const existing = st && st.main && st.main.maxLineWidthCh;
      if (!(typeof existing === 'number' && isFinite(existing))) {
        document.documentElement.style.setProperty('--tp-maxch', '95');
        st.main = { ...(st.main || {}), maxLineWidthCh: 95 };
        try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {}
        try { window.dispatchEvent(new Event('tp:lineMetricsDirty')); } catch {}
        // Best-effort broadcast to display so it aligns if already open
        try {
          const payload = { kind: 'tp:typography', source: 'main', display: 'display', t: { maxLineWidthCh: 95 } };
          try { new BroadcastChannel('tp_display').postMessage(payload); } catch {}
          try { const w = window.__tpDisplayWindow; if (w && !w.closed) w.postMessage(payload, '*'); } catch {}
        } catch {}
      }
    } catch {}

    // One-time migration: tp_vad_profile_v1 -> tp_asr_profiles_v1 (unified ASR store)
    try {
      const MIG_FLAG = 'tp_asr_profiles_v1_migrated';
      const OLD_KEY = 'tp_vad_profile_v1';
      const NEW_KEY = 'tp_asr_profiles_v1';
      if (!localStorage.getItem(MIG_FLAG)) {
        const raw = localStorage.getItem(OLD_KEY);
        if (raw) {
          try {
            const p = JSON.parse(raw) || {};
            const now = Date.now();
            const deviceId = String((window.__tpStore && window.__tpStore.get && window.__tpStore.get('micDevice')) || '') || '';
            const id = `vad::${deviceId || 'unknown'}`;
            const unified = {
              id,
              label: p.label || 'VAD Cal',
              capture: {
                deviceId,
                sampleRateHz: p.sr || 48000,
                channelCount: 1,
                echoCancellation: !!p.aec,
                noiseSuppression: !!p.ns,
                autoGainControl: !!p.agc,
              },
              cal: {
                noiseRmsDbfs: Number(p.noise || p.noiseDb || -50),
                noisePeakDbfs: Number(p.noisePeak || (p.noiseDb != null ? p.noiseDb + 6 : -44)),
                speechRmsDbfs: Number(p.speech || p.speechDb || -20),
                speechPeakDbfs: Number(p.speechPeak || (p.speechDb != null ? p.speechDb + 6 : -14)),
                snrDb: Number((p.speech || p.speechDb || -20) - (p.noise || p.noiseDb || -50)),
              },
              vad: {
                tonDb: Number(p.tonDb != null ? p.tonDb : -28),
                toffDb: Number(p.toffDb != null ? p.toffDb : -34),
                attackMs: Number(p.attackMs != null ? p.attackMs : 80),
                releaseMs: Number(p.releaseMs != null ? p.releaseMs : 300),
              },
              filters: {},
              createdAt: now,
              updatedAt: now,
            };
            // Upsert into unified store (localStorage)
            let asrState;
            try { asrState = JSON.parse(localStorage.getItem(NEW_KEY) || '{}') || {}; } catch { asrState = {}; }
            asrState.profiles = asrState.profiles || {};
            asrState.profiles[unified.id] = unified;
            if (!asrState.activeProfileId) asrState.activeProfileId = unified.id;
            try { localStorage.setItem(NEW_KEY, JSON.stringify(asrState)); } catch {}
            // Cleanup old key and mark migrated
            try { localStorage.removeItem(OLD_KEY); } catch {}
            try { localStorage.setItem(MIG_FLAG, '1'); } catch {}
          } catch {}
        }
      }
    } catch {}
  UI.bindStaticDom();
  try { window.__tpRegisterInit && window.__tpRegisterInit('ui:bindStaticDom'); } catch {}
  // Choose and expose the active scroll root so legacy/TS controllers agree (main vs display)
  try {
    function getScrollRoot(){
      try {
        const disp = (window && window.__tpDisplayViewerEl) || null;
        if (disp && disp.isConnected) return disp;
      } catch {}
      try {
        const inPage = document.getElementById('viewer') || document.querySelector('[data-role="viewer"]');
        return inPage || (document.scrollingElement || document.documentElement);
      } catch {}
      return document.documentElement;
    }
    const root = getScrollRoot();
    try { window.__tpScrollRoot = root; } catch {}
  } catch {}
  // Ensure autoscroll engine is initialized before wiring router/UI
  try { Auto.initAutoScroll && Auto.initAutoScroll(); } catch {}
  // Force engine OFF at boot; app shouldn't scroll until user starts speech sync or manually toggles.
  try { Auto.setEnabled && Auto.setEnabled(false); } catch {}
  try { window.__tpRegisterInit && window.__tpRegisterInit('auto:init'); } catch {}

  // Provide a minimal global scroll controller facade for dev/CI bridges and diagnostics.
  // This delegates to the single authoritative Auto engine to avoid double-ownership.
  try {
    if (!window.__scrollCtl) {
      window.__scrollCtl = {
        start: () => { try { Auto.setEnabled(true); } catch {} },
        stop: () => { try { Auto.setEnabled(false); } catch {} },
        setSpeed: (s) => { try { Auto.setSpeed(s); } catch {} },
        isActive: () => {
          try { const st = (typeof Auto.getState === 'function') ? Auto.getState() : null; return !!(st && st.enabled); } catch { return false; }
        },
      };
    }
  } catch {}

  // Centralized Settings mic button delegation (capture so we win races) — bind once
  try {
    if (!window.__tpSettingsDelegatesActive) {
      window.__tpSettingsDelegatesActive = true;
      const clickSel = [
        '#settingsRequestMicBtn',
        '[data-action="settings-request-mic"]',
        '#settingsReleaseMicBtn',
        '[data-action="settings-release-mic"]',
      ].join(',');
      document.addEventListener('click', (ev) => {
        try {
          const el = ev.target?.closest?.(clickSel);
          if (!el) return;
          // eslint-disable-next-line no-restricted-syntax
          ev.preventDefault();
          ev.stopImmediatePropagation();
          if (el.matches('#settingsRequestMicBtn,[data-action="settings-request-mic"]')) {
            try { Mic.requestMic?.(); } catch {}
          } else if (el.matches('#settingsReleaseMicBtn,[data-action="settings-release-mic"]')) {
            try { Mic.releaseMic?.(); } catch {}
          }
        } catch {}
      }, true);
    }
  } catch {}

  // Party-mode eggs (UI + bus triggers)
  try { Eggs.install({ bus }); } catch {}

    // Easter eggs (party mode on dB meter, Konami theme, etc.)
    try {
      const eggs = await import('../eggs.js');
      try { eggs.installEasterEggs && eggs.installEasterEggs(); } catch {}
      try { eggs.installCKEgg && eggs.installCKEgg(); } catch {}
      try { eggs.installAboutPopover && eggs.installAboutPopover(); } catch {}
    } catch (e) { console.warn('[src/index] eggs init failed', e); }

    // Help UI (ensure Normalize/Validate buttons in Help overlay)
    try {
      const help = await import('../help.js');
      try { help.ensureHelpUI && help.ensureHelpUI(); } catch {}
    } catch (e) { console.warn('[src/index] help init failed', e); }

    // Script tools: expose normalize/validate globals for buttons and Help actions
    try { await import('./script/tools-loader.js'); } catch (e) { console.warn('[src/index] tools-loader import failed', e); }

    // Upload handler: expose window._uploadFromFile for Upload button; supports .docx via mammoth
    try { await import('../ui/upload.js'); } catch (e) { console.warn('[src/index] upload handler init failed', e); }

  // Minimal script renderer for module boot path
  try { await import('./ui/render.js'); } catch (e) { console.warn('[src/index] render init failed', e); }

    // Make camera overlay draggable (top-right by default; drag to reposition; dblclick to reset)
    try { await import('../ui/cam-draggable.js'); } catch (e) { console.warn('[src/index] cam-draggable init failed', e); }

    // Legacy matcher constants for parity (dev only)
    try {
      if (window?.__TP_BOOT_INFO?.isDev) {
        if (typeof window.SIM_THRESHOLD !== 'number') window.SIM_THRESHOLD = 0.58;
        if (typeof window.MATCH_WINDOW_AHEAD !== 'number') window.MATCH_WINDOW_AHEAD = 400;
        if (typeof window.MATCH_WINDOW_BACK !== 'number') window.MATCH_WINDOW_BACK = 120;
        if (typeof window.STRICT_FORWARD_SIM !== 'number') window.STRICT_FORWARD_SIM = 0.6;
        if (typeof window.MAX_JUMP_AHEAD_WORDS !== 'number') window.MAX_JUMP_AHEAD_WORDS = 40;
      }
    } catch {}

    // Initialize adapters (best-effort)
    try { await (Adapters.obsAdapter?.init?.() ?? Promise.resolve()); } catch (e) { console.warn('[src/index] obsAdapter.init failed', e); }
    try { await (Adapters.recorderAdapter?.init?.() ?? Promise.resolve()); } catch (e) { console.warn('[src/index] recorderAdapter.init failed', e); }

    // Expose OBS/Recorder adapter instances to the global so non-module settings code can connect
    try {
      // Expose app bus for QA hooks and integrations
      window.__tpBus = bus;
      if (!window.__tpOBS && Adapters.obsAdapter?.create) {
        window.__tpOBS = Adapters.obsAdapter.create();
      }
      // Bridge mic adapter to legacy-global shape for Settings overlay and other consumers
      try {
        if (
          Mic && (typeof Mic.requestMic === 'function' || typeof Mic.releaseMic === 'function') &&
          (!window.__tpMic || typeof window.__tpMic.requestMic !== 'function' || typeof window.__tpMic.releaseMic !== 'function')
        ) {
          window.__tpMic = {
            requestMic: (...a) => { try { return Mic.requestMic?.(...a); } catch {} },
            releaseMic: (...a) => { try { return Mic.releaseMic?.(...a); } catch {} },
          };
        }
      } catch {}
      if (!window.__tpRecorder && Adapters.recorderAdapter?.create) {
        window.__tpRecorder = Adapters.recorderAdapter.create();
      }
    } catch {}

    // Initialize features (idempotent)
    initOnce('persistence', () => { try { initPersistence(); try { window.__tpRegisterInit && window.__tpRegisterInit('feature:persistence'); } catch {} } catch (e) { console.warn('[src/index] initPersistence failed', e); } });
    initOnce('telemetry',   () => { try { initTelemetry();   try { window.__tpRegisterInit && window.__tpRegisterInit('feature:telemetry'); } catch {} } catch (e) { console.warn('[src/index] initTelemetry failed', e); } });
    try { if (typeof window.initToastContainer === 'function') window.initToastContainer(); } catch (e) { console.warn('[src/index] initToastContainer failed', e); }
    initOnce('scroll',      () => { try { initScroll();      try { window.__tpRegisterInit && window.__tpRegisterInit('feature:scroll'); } catch {} } catch (e) { console.warn('[src/index] initScroll failed', e); } });
    initOnce('hotkeys',     () => { try { initHotkeys();     try { window.__tpRegisterInit && window.__tpRegisterInit('feature:hotkeys'); } catch {} } catch (e) { console.warn('[src/index] initHotkeys failed', e); } });

    // Install speech start/stop delegator
    initOnce('speech',      () => { try { installSpeech();   try { window.__tpRegisterInit && window.__tpRegisterInit('feature:speech'); } catch {} } catch (e) { console.warn('[src/index] installSpeech failed', e); } });

    // Try to install ASR feature (probe before import to avoid noisy 404s)
    try {
      // Tiny helper: HEAD probe without caching
      const headOk = async (url) => {
        try { const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); return !!(r && r.ok); }
        catch { return false; }
      };

      // Prefer dist bundle; allow a flat dist fallback; allow dev JS from src
      const candidates = [
        '/dist/index-hooks/asr.js',
        '/dist/asr.js',
        './src/index-hooks/asr.js',
      ];

      let asrEntry = null;
      for (const c of candidates) { if (await headOk(c)) { asrEntry = c; break; } }

      if (!asrEntry) {
        try { console.info('[ASR] no module found, skipping init'); } catch {}
      } else {
        try {
          const mod = await import(asrEntry);
          const init = (mod && (mod.initAsrFeature || mod.default));
          if (typeof init === 'function') {
            init();
            try { console.info('[ASR] initialized from', asrEntry); } catch {}
          } else {
            try { console.warn('[ASR] module missing initAsrFeature', asrEntry); } catch {}
          }
        } catch (e) {
          console.warn('[ASR] failed to init', asrEntry, e);
        }
      }
    } catch (e) { console.warn('[src/index] ASR module probe/import failed', e); }

    // Wire Auto-scroll controls and install new Scroll Router (Step/Hybrid)
    try {
      // Prefer the compiled TS router when available; fall back to JS router
      try {
        let mod = null;
        try {
          mod = await import('/dist/features/scroll-router.js');
          try { window.__tpScrollRouterTsActive = true; } catch {}
        } catch {}
        if (!mod) {
          mod = await import('./features/scroll-router.js');
          try { window.__tpScrollRouterJsActive = true; } catch {}
        }
        // Pass the Auto API to the router so it can drive the engine
        try { mod && typeof mod.installScrollRouter === 'function' && mod.installScrollRouter({ auto: Auto }); try { window.__tpRegisterInit && window.__tpRegisterInit('feature:router'); } catch {} } catch (e) {
          console.warn('[src/index] installScrollRouter failed', e);
        }
      } catch (e) { console.warn('[src/index] router import failed', e); }
      // Resilient event delegation (works in headless + when nodes re-render)
      let __lastAutoToggleAt = 0;
      const __applyAutoChip = () => {
        try {
          const st = (Auto && typeof Auto.getState === 'function') ? Auto.getState() : null;
          const chip = document.getElementById('autoChip');
          if (chip && st) {
            chip.textContent = st.enabled ? 'Auto: On' : 'Auto: Manual';
            chip.setAttribute('aria-live','polite');
            chip.setAttribute('aria-atomic','true');
          }
        } catch {}
      };
      // Let the Scroll Router own #autoToggle behavior to avoid double-ownership.
      // We still delegate clicks for speed +/- and mic buttons.
      document.addEventListener('click', (e) => {
        const t = e && e.target;
        // If the new TS Scroll Router is active, it owns auto +/- and intent controls
        try { if (window.__tpScrollRouterTsActive) { /* delegate to TS router */ } else {
          try { if (t?.closest?.('#autoInc'))    return Auto.inc(); } catch {}
          try { if (t?.closest?.('#autoDec'))    return Auto.dec(); } catch {}
        } } catch {}
        try { if (t?.closest?.('#micBtn'))         return Mic.requestMic(); } catch {}
        try { if (t?.closest?.('#releaseMicBtn'))  return Mic.releaseMic(); } catch {}
      }, { capture: true });

      // Unified auto-speed input + wheel handling
      try {
        const wireSpeedInput = () => {
          const inp = document.getElementById('autoSpeed');
          if (!inp) return;
          // input/change both: keep persisted and labels in sync via Auto.setSpeed
          const onChange = () => { try { Auto.setSpeed(inp.value); } catch {} };
          inp.addEventListener('input', onChange, { capture: true });
          inp.addEventListener('change', onChange, { capture: true });
          // Wheel on input adjusts ±0.5 (Shift: ±5), rounded to one decimal
          inp.addEventListener('wheel', (ev) => {
            try {
              // eslint-disable-next-line no-restricted-syntax
              ev.preventDefault();
              const step = ev.shiftKey ? 5 : 0.5;
              const dir = (ev.deltaY < 0) ? +1 : -1;
              const cur = Number(inp.value || '0') || 0;
              const next = Math.max(5, Math.min(200, Math.round((cur + dir * step) * 10) / 10));
              inp.value = String(next);
              Auto.setSpeed(next);
            } catch {}
          }, { passive: false });
        };
        // wire now and after small delay in case DOM re-renders
        wireSpeedInput();
        setTimeout(wireSpeedInput, 250);
      } catch {}

  // Ensure OBS persistent UI is wired and boot-restore applied (idempotent)
  try { wireObsPersistentUI && wireObsPersistentUI(); } catch {}

      // Stop autoscroll with a short buffer after speech stops to avoid abrupt cutoffs
      try {
        let autoStopTimer = null;
        let speechActiveLatest = false;
        window.addEventListener('tp:speech-state', (ev) => {
          const isRunning = !!(ev && ev.detail && ev.detail.running);
          speechActiveLatest = isRunning;
          try {
            if (isRunning) {
              if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null; }
              return;
            }
          } catch {}
          // Delay stop by 2.5s to allow natural sentence tails
          if (autoStopTimer) { try { clearTimeout(autoStopTimer); } catch {} }
          autoStopTimer = setTimeout(() => {
            try { window.__scrollCtl?.stop?.(); } catch {}
            try { Auto.setEnabled(false); } catch {}
            try { clearInterval(window.__autoFallbackTimer); window.__autoFallbackTimer = null; } catch {}
            autoStopTimer = null;
          }, 2500);
        });

        // Guard: when a new script renders, ensure autoscroll is OFF unless speech is active.
        window.addEventListener('tp:script-rendered', () => {
          try {
            if (!speechActiveLatest) {
              Auto.setEnabled?.(false);
            }
          } catch {}
        });
      } catch {}
    } catch (e) { console.warn('[src/index] auto-scroll wiring failed', e); }

    // Typography bridge is installed via './ui/typography-bridge.js'

  // Mark init as complete for headless checks/smoke tests
  try { window.__tp_init_done = true; } catch {}
  console.log('[src/index] boot completed');
    try { window.__TP_BOOT_TRACE.push({ t: Date.now(), tag: 'src/index', msg: 'boot completed' }); } catch {}
  } catch (err) {
    console.error('[src/index] boot failed', err);
    try { window.__TP_BOOT_TRACE = window.__TP_BOOT_TRACE || []; window.__TP_BOOT_TRACE.push({ t: Date.now(), tag: 'src/index', msg: 'boot failed', error: String(err && err.message || err) }); } catch {}
  }
}

// Auto-run boot when loaded as a module, but also export boot for manual invocation.
boot();

export { boot };

