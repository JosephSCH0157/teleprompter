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
    
    // Create a simple event bus for HUD components (compat shim before full bus import)
    const hudBus = new EventTarget();
    const api = window.__tpHud = window.__tpHud || {
      enabled: false,
      root,
      bus: {
        emit: (type, detail) => { try { hudBus.dispatchEvent(new CustomEvent(type, { detail })); } catch {} },
        on: (type, fn) => {
          try {
            const h = (e) => { try { fn(e.detail); } catch {} };
            hudBus.addEventListener(type, h);
            return () => { try { hudBus.removeEventListener(type, h); } catch {} };
          } catch {}
        },
      },
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
    
    // Listen to new typed transcript and state events (both captions and legacy speech)
    try {
      const logTx = (d) => {
        if (!d) return;
        api.log('captions:tx', {
          partial: d.partial,
          final: d.final,
          conf: d.confidence?.toFixed(2),
          len: d.text?.length ?? 0,
          idx: d.lineIndex,
          harness: d.harness,
        });
      };
      const logState = (d) => {
        if (!d) return;
        api.log('captions:state', { state: d.state, reason: d.reason, harness: d.harness });
      };
      
      // Primary captions events
      window.addEventListener('tp:captions:transcript', (e) => logTx(e.detail));
      window.addEventListener('tp:captions:state', (e) => logState(e.detail));
      
      // Legacy speech events (for backwards compatibility)
      window.addEventListener('tp:speech:transcript', (e) => logTx(e.detail));
      window.addEventListener('tp:speech:state', (e) => logState(e.detail));
    } catch {}
    
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
// HUD: minimal ASR stats line (dev only)
import './hud/asr-stats.js';
import './hud/rec-stats.js';
import { ensureSettingsFolderControls, ensureSettingsFolderControlsAsync } from './ui/inject-settings-folder.js';

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
        // Throttled dB logger → emits speech:db event and (optionally) HUD log
        const logDb = (() => {
          let lastDb = -Infinity, lastTs = 0;
          return (db) => {
            try {
              const now = performance.now();
              if (!(typeof db === 'number' && isFinite(db))) return;
              if (Math.abs(db - lastDb) >= 2 || (now - lastTs) >= 150) {
                lastDb = db; lastTs = now;
                // Always fire an event for listeners
                try { window.dispatchEvent(new CustomEvent('speech:db', { detail: { db } })); } catch {}
                // HUD breadcrumb only if not muted
                try {
                  const off = localStorage.getItem('tp_hud_quiet_db') === '1';
                  if (!off && !window.__TP_QUIET) logHud('speech:db', { db });
                } catch {}
              }
            } catch {}
          };
        })();
        const __vadState = { speaking: false };
        window.addEventListener('tp:db', (ev) => {
          try {
            const db = (ev && ev.detail && typeof ev.detail.db === 'number') ? ev.detail.db : null;
            if (db == null) return;
            // Always send the throttled db event; HUD log is internally muted or throttled
            logDb(db);
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

    // Default: mute HUD dB breadcrumbs in dev unless explicitly enabled
    try {
      if (window.__TP_DEV) {
        const k = 'tp_hud_quiet_db';
        const has = localStorage.getItem(k);
        if (has == null) localStorage.setItem(k, '1');
      }
    } catch {}

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
    try {
      const cam = await import('../ui/cam-draggable.js');
      try { (cam && (cam.initCamDraggable || cam.default?.initCamDraggable))?.(); } catch {}
    } catch (e) { console.warn('[src/index] cam-draggable init failed', e); }

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
      // Bridge legacy smoke harness (__recorder) to modern OBS adapter so rec.getAdapter('obs') works
      try {
        if (window.__tpOBS && window.__recorder) {
          window.__recorder.getAdapter = (id) => id === 'obs' ? window.__tpOBS : null;
          window.__recorder.get = (id) => id === 'obs' ? window.__tpOBS : null;
        }
      } catch {}
    } catch {}

    // Initialize features (idempotent)
    initOnce('persistence', () => { try { initPersistence(); try { window.__tpRegisterInit && window.__tpRegisterInit('feature:persistence'); } catch {} } catch (e) { console.warn('[src/index] initPersistence failed', e); } });
    initOnce('telemetry',   () => { try { initTelemetry();   try { window.__tpRegisterInit && window.__tpRegisterInit('feature:telemetry'); } catch {} } catch (e) { console.warn('[src/index] initTelemetry failed', e); } });
    try { if (typeof window.initToastContainer === 'function') window.initToastContainer(); } catch (e) { console.warn('[src/index] initToastContainer failed', e); }
    initOnce('scroll',      () => { try { initScroll();      try { window.__tpRegisterInit && window.__tpRegisterInit('feature:scroll'); } catch {} } catch (e) { console.warn('[src/index] initScroll failed', e); } });
    initOnce('hotkeys',     () => { try { initHotkeys();     try { window.__tpRegisterInit && window.__tpRegisterInit('feature:hotkeys'); } catch {} } catch (e) { console.warn('[src/index] initHotkeys failed', e); } });

    // Install speech start/stop delegator
    initOnce('speech',      () => { try { installSpeech();   try { window.__tpRegisterInit && window.__tpRegisterInit('feature:speech'); } catch {} } catch (e) { console.warn('[src/index] installSpeech failed', e); } });

    // Ensure local auto-recorder surface exists (camera+mic → WebM)
    try { await import('./recording/local-auto.js'); } catch (e) { try { console.warn('[src/index] local-auto import failed', e); } catch {} }

    // Bind core UI (present/settings/help) for JS boot path so smoke harness sees dataset.uiBound
    try {
      const core = await import('./wiring/ui-binds.js').catch(() => null);
      if (core && typeof core.bindCoreUI === 'function') {
        try { core.bindCoreUI({ scrollModeSelect: '#scrollMode', presentBtn: '#presentBtn, [data-action="present-toggle"]' }); } catch {}
      }
    } catch {}

    // Try to install ASR feature (probe before import to avoid noisy 404s)
    try {
      // Tiny helper: HEAD probe without caching
      const headOk = async (url) => {
        try { const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); return !!(r && r.ok); }
        catch { return false; }
      };

      // Prefer dist bundle; allow a flat dist fallback; allow dev JS from src
      // Prefer dev module first so we always run the freshest code in dev
      const candidates = [
        // Correct relative path from src/index.js to the dev JS entry
        './index-hooks/asr.js',
        '/dist/index-hooks/asr.js',
        '/dist/asr.js',
      ];

      let asrEntry = null;
      for (const c of candidates) {
        // Resolve module-relative specs for probing so fetch doesn't use document base
        let probeUrl = c;
        try {
          if (c.startsWith('./')) {
            const u = new URL(c, import.meta.url);
            probeUrl = u.href; // absolute URL to this module
          }
        } catch {}
        if (await headOk(probeUrl)) { asrEntry = c.startsWith('./') ? probeUrl : c; break; }
      }

      // Dev-friendly fallback: if HEAD probes fail (server may not support HEAD), attempt a single import of the dev path.
      if (!asrEntry) {
        try {
          const fallback = './index-hooks/asr.js';
          const mod = await import(fallback);
          const init = (mod && (mod.initAsrFeature || mod.default));
          if (typeof init === 'function') { init(); try { console.info('[ASR] initialized from fallback', fallback); } catch {} }
          else { try { console.warn('[ASR] fallback missing initAsrFeature', fallback); } catch {} }
        } catch {
          try { console.info('[ASR] no module found, skipping init'); } catch {}
        }
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
        // Robust dynamic import sequence with graceful legacy fallback.
        async function tryImport(spec, flag) {
          try {
            const m = await import(spec);
            if (m) {
              try { flag && (window[flag] = true); } catch {}
              return m;
            }
          } catch (err) {
            try { console.warn('[router] import failed', spec, err && err.message); } catch {}
          }
          return null;
        }
        const candidates = [
          { spec: '/dist/features/scroll-router.js', flag: '__tpScrollRouterTsActive' },
          { spec: './features/scroll-router.js',     flag: '__tpScrollRouterJsActive' }
        ];
        let mod = null;
        for (const c of candidates) {
          mod = await tryImport(c.spec, c.flag);
          if (mod) break;
        }
        if (!mod) {
          // Final fallback: inject legacy monolith (teleprompter_pro.js) if router modules missing.
          try {
            console.warn('[router] all module candidates failed; attempting legacy fallback script');
            const s = document.createElement('script');
            s.src = './teleprompter_pro.js';
            s.defer = true;
            s.onload = () => { try { console.info('[router] legacy script loaded'); } catch {} };
            document.head.appendChild(s);
          } catch {}
        } else {
          // Pass the Auto API to the router so it can drive the engine.
          try {
            if (typeof mod.installScrollRouter === 'function') {
              mod.installScrollRouter({ auto: Auto });
              try { window.__tpRegisterInit && window.__tpRegisterInit('feature:router'); } catch {}
            } else {
              console.warn('[router] installScrollRouter not found on module');
            }
          } catch (e) {
            console.warn('[src/index] installScrollRouter failed', e);
          }
        }
      } catch (e) { console.warn('[src/index] router import sequence failed', e); }
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
        // Load button → trigger mapped-folder select change to load the chosen script
        try {
          const loadHit = t?.closest?.('#scriptLoadBtn,[data-action="load"]');
          if (loadHit) {
            try { e.preventDefault(); e.stopImmediatePropagation(); } catch {}
            // Helper: quick file picker fallback
            const pickFile = async () => {
              return await new Promise((res) => {
                try {
                  const inp = document.createElement('input');
                  inp.type = 'file';
                  inp.accept = '.txt,.md,.rtf,.docx';
                  inp.style.position = 'fixed';
                  inp.style.left = '-9999px';
                  inp.addEventListener('change', async () => {
                    try {
                      const f = (inp.files && inp.files[0]) || null;
                      res(f || null);
                    } catch { res(null); }
                    try { inp.remove(); } catch {}
                  }, { once: true });
                  document.body.appendChild(inp);
                  inp.click();
                  setTimeout(() => { try { inp.remove(); } catch {} }, 15000);
                } catch { res(null); }
              });
            };
            const render = async (file) => {
              try {
                if (!file) return;
                let text = '';
                if (file.name.toLowerCase().endsWith('.docx') && window.docxToText) {
                  try { text = await window.docxToText(file); } catch { text = await file.text(); }
                } else {
                  text = await file.text();
                }
                const ed = document.getElementById('editor');
                if (ed && 'value' in ed) {
                  ed.value = text;
                  try { ed.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
                }
                try { window.dispatchEvent(new CustomEvent('tp:script-load', { detail: { name: file.name, text } })); } catch {}
              } catch {}
            };
            try {
              // Prefer main select so the mapped-folder loader reads via folder handle
              const main = document.querySelector('#scriptSelect');
              const side = document.querySelector('#scriptSelectSidebar');
              const sel = (main || side);
              if (sel) {
                const name = (sel.selectedOptions && sel.selectedOptions[0] && sel.selectedOptions[0].textContent) || '';
                const hasDir = !!(window.__tpFolderHandle);
                const hasMapEntry = (() => { try { return !!(window.__tpFolderFilesMap && window.__tpFolderFilesMap.get && name && window.__tpFolderFilesMap.get(String(name))); } catch { return false; } })();
                if (hasDir || hasMapEntry) {
                  // If sidebar exists and main exists, mirror selection to main before dispatch
                  try {
                    if (main && side && side.value && main.value !== side.value) { main.value = side.value; }
                  } catch {}
                  (main || side).dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                  // No backing source; prompt user to pick a file now.
                  const f = await pickFile();
                  await render(f);
                }
              } else {
                // No select exists; prompt for a file directly.
                const f = await pickFile();
                await render(f);
              }
            } catch {}
            return;
          }
        } catch {}
        // If the new TS Scroll Router is active, it owns auto +/- and intent controls
        try { if (window.__tpScrollRouterTsActive) { /* delegate to TS router */ } else {
          try { if (t?.closest?.('#autoInc'))    return Auto.inc(); } catch {}
          try { if (t?.closest?.('#autoDec'))    return Auto.dec(); } catch {}
        } } catch {}
        try { if (t?.closest?.('#micBtn'))         return Mic.requestMic(); } catch {}
        try { if (t?.closest?.('#releaseMicBtn'))  return Mic.releaseMic(); } catch {}
        // Unified single-button mic toggle (JS path)
        try {
          const btn = t?.closest?.('#micToggleBtn');
          if (btn) {
            // Prevent other handlers from racing; we own this button
            try { e.preventDefault(); e.stopImmediatePropagation(); } catch {}
            const mic = window.__tpMic || window.ASR || window.__tpAsrImpl;
            const isActive = btn.classList?.contains?.('mic-active');
            const sync = (on) => {
              try {
                if (on) {
                  btn.textContent = 'Release Mic';
                  btn.classList.remove('mic-idle');
                  btn.classList.add('mic-active');
                } else {
                  btn.textContent = 'Request Mic';
                  btn.classList.remove('mic-active');
                  btn.classList.add('mic-idle');
                }
              } catch {}
            };
            // Try adapter first; fall back to best-effort UI toggle
            try {
              if (!isActive) { (mic && mic.requestMic) ? mic.requestMic() : null; sync(true); }
              else { (mic && mic.releaseMic) ? mic.releaseMic() : null; sync(false); }
            } catch { sync(!isActive); }
            return;
          }
        } catch {}
      }, { capture: true });

      // Ctrl/Cmd+O → Load selected script (capture early to beat browser default)
      try {
        if (!window.__tpCtrlOLoadHotkey) {
          window.__tpCtrlOLoadHotkey = true;
          window.addEventListener('keydown', async (e) => {
            try {
              const k = (e.key || '').toLowerCase();
              if (!(e && (e.ctrlKey || e.metaKey) && k === 'o')) return;
              e.preventDefault();
              e.stopImmediatePropagation();
              // Prefer clicking the Load button to reuse click handler logic
              const btn = document.querySelector('#scriptLoadBtn,[data-action="load"]');
              if (btn && typeof (btn).click === 'function') { (btn).click(); return; }
              // Fallback: attempt direct select-trigger (prefer main) or file pick
              const main = document.querySelector('#scriptSelect');
              const side = document.querySelector('#scriptSelectSidebar');
              if (main || side) {
                try { if (main && side && side.value && main.value !== side.value) main.value = side.value; } catch {}
                (main || side).dispatchEvent(new Event('change', { bubbles: true }));
                return;
              }
              // As a last resort, open a file picker
              const inp = document.createElement('input');
              inp.type = 'file'; inp.accept = '.txt,.md,.rtf,.docx';
              inp.style.position = 'fixed'; inp.style.left = '-9999px';
              inp.addEventListener('change', async () => {
                try {
                  const f = (inp.files && inp.files[0]) || null;
                  if (!f) return;
                  const text = f.name.toLowerCase().endsWith('.docx') && window.docxToText ? await window.docxToText(f) : await f.text();
                  const ed = document.getElementById('editor');
                  if (ed && 'value' in ed) { ed.value = text; try { ed.dispatchEvent(new Event('input', { bubbles: true })); } catch {} }
                  try { window.dispatchEvent(new CustomEvent('tp:script-load', { detail: { name: f.name, text } })); } catch {}
                } catch {}
                try { inp.remove(); } catch {}
              }, { once: true });
              document.body.appendChild(inp); inp.click();
              setTimeout(() => { try { inp.remove(); } catch {} }, 15000);
            } catch {}
          }, { capture: true });
        }
      } catch {}

      // Reflect mic state changes to the single-button UI if events are emitted
      try {
        if (!window.__tpMicToggleListenerInstalled) {
          window.__tpMicToggleListenerInstalled = true;
          window.addEventListener('tp:mic:state', (ev) => {
            try {
              const on = !!(ev && ev.detail && ev.detail.on);
              const btn = document.getElementById('micToggleBtn');
              if (!btn) return;
              if (on) {
                btn.textContent = 'Release Mic';
                btn.classList.remove('mic-idle');
                btn.classList.add('mic-active');
              } else {
                btn.textContent = 'Request Mic';
                btn.classList.remove('mic-active');
                btn.classList.add('mic-idle');
              }
            } catch {}
          });
        }
      } catch {}

      // Unified auto-speed input + wheel handling (resilient delegation)
      try {
        // Use event delegation to handle input changes even if DOM is replaced
        document.addEventListener('input', (ev) => {
          try {
            const t = ev?.target;
            if (t?.id === 'autoSpeed') {
              Auto.setSpeed(t.value);
            }
          } catch {}
        }, { capture: true });

        document.addEventListener('change', (ev) => {
          try {
            const t = ev?.target;
            if (t?.id === 'autoSpeed') {
              Auto.setSpeed(t.value);
            }
          } catch {}
        }, { capture: true });

        // Wheel on speed input adjusts ±0.5 (Shift: ±5), rounded to one decimal
        document.addEventListener('wheel', (ev) => {
          try {
            const t = ev?.target;
            if (t?.id !== 'autoSpeed') return;
            // eslint-disable-next-line no-restricted-syntax
            ev.preventDefault();
            const step = ev.shiftKey ? 5 : 0.5;
            const dir = (ev.deltaY < 0) ? +1 : -1;
            const cur = Number(t.value || '0') || 0;
            const next = Math.max(5, Math.min(200, Math.round((cur + dir * step) * 10) / 10));
            t.value = String(next);
            Auto.setSpeed(next);
          } catch {}
        }, { passive: false, capture: true });
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
    // Ensure Settings Scripts Folder card is available (JS path)
    try { ensureSettingsFolderControls(); } catch {}
    try { ensureSettingsFolderControlsAsync(6000); } catch {}

    // Wire native folder picker + fallback, deferring to our binder if already present
    function wireMappedFolderNative() {
      try { window.__bindMappedFolderUI?.(); } catch {}
    }
    try { wireMappedFolderNative(); } catch {}
    try { document.addEventListener('DOMContentLoaded', () => { try { wireMappedFolderNative(); } catch {} }); } catch {}

    // Binder for Scripts Folder (JS path) – minimal parity with TS binder
    function __bindMappedFolderUI() {
      try {
        const btn = document.getElementById('chooseFolderBtn');
        if (!btn || btn.dataset.mappedFolderWired === '1') return;
        const recheckBtn = document.getElementById('recheckFolderBtn');
        const sel = document.getElementById('scriptSelect');
        const fallback = document.getElementById('folderFallback');
        // Session-only map of files when using the fallback directory input
        try { if (!window.__tpFolderFilesMap) window.__tpFolderFilesMap = new Map(); } catch {}
        const useMock = (() => { try { const Q = new URLSearchParams(location.search||''); return Q.has('mockFolder'); } catch { return false; } })();
        btn.dataset.mappedFolderWired = '1';
        try { btn.disabled = false; } catch {}

        function populate(names) {
          try {
            if (!sel) return;
            sel.setAttribute('aria-busy','true');
            const filtered = (names||[]).filter(n => /\.(txt|md|docx)$/i.test(n));
            sel.innerHTML = '';
            filtered.forEach((n,i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = n; sel.appendChild(o); });
            sel.setAttribute('aria-busy','false');
            sel.disabled = filtered.length === 0;
            sel.dataset.count = String(filtered.length);
            try { window.dispatchEvent(new CustomEvent('tp:folderScripts:populated', { detail: { count: filtered.length } })); } catch {}
          } catch {}
        }

        async function pickFolder() {
          try {
            btn.disabled = true; btn.textContent = 'Choosing…';
            let scriptNames = [];
            if (window.showDirectoryPicker) {
              try {
                const dirHandle = await window.showDirectoryPicker();
                try { window.__tpFolderHandle = dirHandle; } catch {}
                // New native selection replaces any prior fallback file map
                try { if (window.__tpFolderFilesMap && window.__tpFolderFilesMap.clear) window.__tpFolderFilesMap.clear(); } catch {}
                for await (const entry of dirHandle.values()) {
                  try {
                    if (entry.kind === 'file' && /\.(txt|md|docx)$/i.test(entry.name)) {
                      scriptNames.push(entry.name);
                    }
                  } catch {}
                }
              } catch (e) {
                // user cancel → fall back to input
                if (e && e.name !== 'AbortError') console.warn('[folder] picker err', e);
                if (!fallback) return;
                try { fallback.click(); } catch {}
                return;
              }
            } else if (fallback) {
              // Use hidden directory input (webkitdirectory) – user picks then change event populates
              try { fallback.click(); } catch {}
              return;
            }
            if (scriptNames.length) {
              populate(scriptNames);
              try { localStorage.setItem('tp_last_folder_scripts', JSON.stringify(scriptNames)); } catch {}
            }
          } catch (e) { console.warn('[folder] pickFolder failed', e); }
          finally {
            try { btn.disabled = false; btn.textContent = 'Choose Folder'; } catch {}
          }
        }

        // Fallback input change handler (webkitdirectory)
        try {
          if (fallback) {
            fallback.addEventListener('change', () => {
              try {
                const files = Array.from(fallback.files || []);
                const names = files.map(f => f && f.name).filter(Boolean);
                // Reset any native handle since we're using the fallback source now
                try { window.__tpFolderHandle = null; } catch {}
                // Store File objects in a session map for on-demand loads
                try {
                  if (!window.__tpFolderFilesMap) window.__tpFolderFilesMap = new Map();
                  window.__tpFolderFilesMap.clear();
                  for (const f of files) { if (f && f.name) window.__tpFolderFilesMap.set(f.name, f); }
                } catch {}
                if (names.length) {
                  populate(names);
                  try { localStorage.setItem('tp_last_folder_scripts', JSON.stringify(names)); } catch {}
                }
              } catch {}
            });
          }
        } catch {}

        btn.addEventListener('click', (ev) => { try { ev.stopImmediatePropagation(); } catch {}; pickFolder(); });
        recheckBtn?.addEventListener('click', (ev) => {
          try { ev.stopImmediatePropagation(); } catch {}
          try {
            const raw = localStorage.getItem('tp_last_folder_scripts');
            if (raw) {
              const arr = JSON.parse(raw) || [];
              if (Array.isArray(arr) && arr.length) populate(arr);
            }
          } catch {}
        });

        // Do not auto-populate from stored if mock folder flag active (avoid parity mismatch)
        if (!useMock) {
          try {
            const raw = localStorage.getItem('tp_last_folder_scripts');
            if (raw) {
              const arr = JSON.parse(raw) || [];
              if (Array.isArray(arr) && arr.length && (!sel || !sel.options || sel.options.length === 0)) {
                populate(arr);
              }
            }
          } catch {}
        }
      } catch {}
    }
    try { window.__bindMappedFolderUI = __bindMappedFolderUI; } catch {}
    try { __bindMappedFolderUI(); } catch {}

    // Sidebar mirror: keep #scriptSelectSidebar in sync with Settings #scriptSelect (JS path)
    (function ensureSidebarMirror(){
      try {
        if (window.__tpSidebarMirrorInstalled) return; window.__tpSidebarMirrorInstalled = true;
        const getMain = () => document.getElementById('scriptSelect');
        const getSide = () => document.getElementById('scriptSelectSidebar');

        function copyOptionsFromMain(){
          try {
            const main = getMain();
            const side = getSide();
            if (!main || !side) return;
            const opts = Array.from(main.options || []);
            side.setAttribute('aria-busy','true');
            side.disabled = true;
            side.innerHTML = '';
            for (const o of opts) {
              try { const n = document.createElement('option'); n.value = o.value; n.textContent = o.textContent || ''; side.appendChild(n); } catch {}
            }
            // reflect value if present
            try { side.value = main.value; } catch {}
            side.setAttribute('aria-busy','false');
            side.disabled = side.options.length === 0;
            side.dataset.count = String(side.options.length || 0);
          } catch {}
        }

        // One-time sync attempt (handles case when population already happened)
        try { copyOptionsFromMain(); } catch {}

        // Refresh mirror whenever folder scripts are (re)populated
        try {
          window.addEventListener('tp:folderScripts:populated', () => { try { copyOptionsFromMain(); } catch {} });
        } catch {}

        // Keep selection in sync both ways
        try {
          const main = getMain(); const side = getSide();
          if (main && !main.__mirrorSel) {
            main.__mirrorSel = true;
            main.addEventListener('change', () => { try { const s = getSide(); if (s) s.value = main.value; } catch {} });
          }
          if (side && !side.__mirrorSel) {
            side.__mirrorSel = true;
            side.addEventListener('change', () => { try { const m = getMain(); if (m) m.value = side.value; } catch {} });
          }
        } catch {}

        // If either select is not present yet, observe briefly and retry
        try {
          if (!(getMain() && getSide())) {
            const mo = new MutationObserver(() => {
              try {
                if (getMain() && getSide()) {
                  try { copyOptionsFromMain(); } catch {}
                  try { mo.disconnect(); } catch {}
                }
              } catch {}
            });
            mo.observe(document.documentElement, { childList: true, subtree: true });
            setTimeout(() => { try { mo.disconnect(); } catch {} }, 20000);
          }
        } catch {}
      } catch {}
    })();

    // Real FS operations: save, save-as, delete, rename, and load from folder if handle is available
    (function installFolderFsOps(){
      try {
        if (window.__tpFolderFsOpsInstalled) return; window.__tpFolderFsOpsInstalled = true;
        const getDir = () => { try { return window.__tpFolderHandle || null; } catch { return null; } };
        const getEditorText = () => { try { const ed = document.getElementById('editor'); return (ed && 'value' in ed) ? (ed.value || '') : ''; } catch { return ''; } };
        async function saveToFolder(name, text){
          try {
            const dir = getDir(); if (!dir || !name) return false;
            const fh = await dir.getFileHandle(name, { create: true });
            const w = await fh.createWritable();
            await w.write(text || '');
            await w.close();
            return true;
          } catch { return false; }
        }
        async function copyFile(dir, fromName, toName){
          try {
            const src = await dir.getFileHandle(fromName, { create: false });
            const file = await src.getFile();
            const text = await file.text();
            return await saveToFolder(toName, text);
          } catch { return false; }
        }
        function addOptionIfMissing(name){
          try {
            const sels = [document.getElementById('scriptSelectSidebar'), document.getElementById('scriptSelect')].filter(Boolean);
            for (const s of sels) {
              try {
                const sel = s; if (!sel) continue;
                const exists = Array.from(sel.options || []).some(o => (o.textContent || '') === name);
                if (!exists) {
                  const o = document.createElement('option'); o.value = String((sel.options?.length||0)); o.textContent = name; sel.appendChild(o);
                  sel.dataset.count = String(sel.options.length || 0);
                }
                sel.disabled = (sel.options.length === 0);
              } catch {}
            }
            try { window.dispatchEvent(new CustomEvent('tp:folderScripts:populated', { detail: { count: (document.getElementById('scriptSelectSidebar')?.options.length || 0) } })); } catch {}
          } catch {}
        }
        function removeOptionEverywhere(name){
          try {
            const sels = [document.getElementById('scriptSelectSidebar'), document.getElementById('scriptSelect')].filter(Boolean);
            for (const s of sels) {
              try {
                const sel = s; if (!sel) continue;
                const opt = Array.from(sel.options || []).find(o => (o.textContent || '') === name);
                if (opt) opt.remove();
                sel.dataset.count = String(sel.options.length || 0);
                sel.disabled = (sel.options.length === 0);
              } catch {}
            }
            try { window.dispatchEvent(new CustomEvent('tp:folderScripts:populated', { detail: { count: (document.getElementById('scriptSelectSidebar')?.options.length || 0) } })); } catch {}
          } catch {}
        }
        function renameOptionEverywhere(from, to){
          try {
            const sels = [document.getElementById('scriptSelectSidebar'), document.getElementById('scriptSelect')].filter(Boolean);
            for (const s of sels) {
              try {
                const sel = s; if (!sel) continue;
                const opt = Array.from(sel.options || []).find(o => (o.textContent || '') === from);
                if (opt) { opt.textContent = to; }
              } catch {}
            }
          } catch {}
        }

        // Save to existing selected name (if folder handle exists), else no-op; TS binder still did download
        window.addEventListener('tp:script:save', async () => {
          try {
            const dir = getDir(); if (!dir) return;
            const sel = (document.getElementById('scriptSelectSidebar') || document.getElementById('scriptSelect'));
            const name = sel && sel.selectedOptions && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
            if (!name) return;
            const ok = await saveToFolder(String(name), getEditorText());
            if (ok) addOptionIfMissing(String(name));
          } catch {}
        });

        // Save As → write new file and add option
        window.addEventListener('tp:script:saveas', async (ev) => {
          try {
            const dir = getDir(); if (!dir) return;
            const to = ev && ev.detail && ev.detail.to; if (!to) return;
            const ok = await saveToFolder(String(to), getEditorText());
            if (ok) addOptionIfMissing(String(to));
          } catch {}
        });

        // Delete selected file by name
        window.addEventListener('tp:folderScripts:delete', async (ev) => {
          try {
            const dir = getDir();
            const name = ev && ev.detail && ev.detail.name; if (!name) return;
            if (dir && typeof dir.removeEntry === 'function') {
              try { await dir.removeEntry(String(name)); } catch {}
            }
            removeOptionEverywhere(String(name));
          } catch {}
        });

        // Rename: copy to new, then delete old; update UI
        window.addEventListener('tp:folderScripts:rename', async (ev) => {
          try {
            const dir = getDir(); if (!dir) return;
            const from = ev && ev.detail && ev.detail.from; const to = ev && ev.detail && ev.detail.to;
            if (!from || !to || from === to) return;
            const ok = await copyFile(dir, String(from), String(to));
            if (ok) {
              try { await dir.removeEntry(String(from)); } catch {}
              renameOptionEverywhere(String(from), String(to));
              addOptionIfMissing(String(to));
            }
          } catch {}
        });

        // Load content on select change when folder handle exists or fallback files map is set
        document.addEventListener('change', async (ev) => {
          try {
            const t = ev && ev.target;
            const isSel = !!(t && (t.id === 'scriptSelect' || t.id === 'scriptSelectSidebar'));
            if (!isSel) return;
            const sel = t; const name = sel && sel.selectedOptions && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
            if (!name) return;
            const dir = getDir();
            // Try native directory read first
            if (dir) {
              try {
                const fh = await dir.getFileHandle(String(name), { create: false });
                const file = await fh.getFile();
                const text = await file.text();
                try { const ed = document.getElementById('editor'); if (ed && 'value' in ed) { ed.value = text; try { ed.dispatchEvent(new Event('input', { bubbles: true })); } catch {} } } catch {}
                try { window.dispatchEvent(new CustomEvent('tp:script-load', { detail: { name: String(name), text } })); } catch {}
                return;
              } catch {}
            }
            // Fallback: if we have a session files map from the fallback picker, use it
            try {
              const mp = window.__tpFolderFilesMap;
              if (mp && typeof mp.get === 'function') {
                const f = mp.get(String(name));
                if (f) {
                  const text = await f.text();
                  try { const ed = document.getElementById('editor'); if (ed && 'value' in ed) { ed.value = text; try { ed.dispatchEvent(new Event('input', { bubbles: true })); } catch {} } } catch {}
                  try { window.dispatchEvent(new CustomEvent('tp:script-load', { detail: { name: String(name), text } })); } catch {}
                }
              }
            } catch {}
          } catch {}
        }, { capture: true });
      } catch {}
    })();

    // Re-bind if card is re-injected (mutation observer)
    try {
      if (!window.__tpFolderBinderWatcher) {
        window.__tpFolderBinderWatcher = true;
        const mo = new MutationObserver(() => {
          try {
            const btn = document.getElementById('chooseFolderBtn');
            if (btn && btn.dataset.mappedFolderWired !== '1') {
              try { window.__bindMappedFolderUI?.(); } catch {}
            }
          } catch {}
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => { try { mo.disconnect(); } catch {} }, 120000);
      }
    } catch {}

    // Test-only mock folder population: enable with ?mockFolder=1
    try {
      const Q = new URLSearchParams(location.search || '');
      const useMock = Q.has('mockFolder') || (typeof navigator !== 'undefined' && navigator.webdriver === true) || (window && window.__TP_TEST_MOCK__);
      if (useMock) {
        const NAMES = ['Practice_Intro.txt', 'Main_Episode.txt', 'Notes.docx'];
        const populate = () => {
          try {
            const main = document.getElementById('scriptSelect');
            const mirror = document.getElementById('scriptSelectSidebar');
            if (!main) return false;
            const targets = [main, mirror].filter(Boolean);
            for (const sel of targets) {
              try { sel.setAttribute('aria-busy','true'); sel.disabled = true; } catch {}
            }
            const items = NAMES.filter(n => /\.(txt|docx)$/i.test(n));
            for (const sel of targets) {
              try {
                sel.innerHTML = '';
                items.forEach((n, i) => {
                  const o = document.createElement('option');
                  o.value = String(i);
                  o.textContent = n;
                  sel.appendChild(o);
                });
                sel.setAttribute('aria-busy','false');
                sel.disabled = items.length === 0;
                sel.dataset.count = String(items.length);
              } catch {}
            }
            try { window.dispatchEvent(new CustomEvent('tp:folderScripts:populated', { detail: { count: items.length } })); } catch {}
            // minimal sync: when one changes, reflect value to the other
            try {
              const sync = (a, b) => { try { if (a && b) b.value = a.value; } catch {} };
              if (main) main.addEventListener('change', () => sync(main, mirror));
              if (mirror) mirror.addEventListener('change', () => sync(mirror, main));
            } catch {}
            return true;
          } catch { return false; }
        };
        // Try now; if selects not present yet, wait briefly
        // Defer a bit to allow injection of the Settings card
        setTimeout(() => { try { populate(); } catch {} }, 50);
        if (!populate()) {
          let tries = 0; const iv = setInterval(() => {
            tries++; if (populate() || tries > 30) { try { clearInterval(iv); } catch {} }
          }, 50);
        }
      }
    } catch {}

    // CI / uiMock auto sample + upload mock markers so smoke harness notes disappear.
    try {
      const QQ = new URLSearchParams(location.search||'');
      const inCi = QQ.has('ci');
      const uiMock = QQ.has('uiMock');
      if (inCi && uiMock) {
        const ed = document.getElementById('editor');
        if (ed && 'value' in ed && !String(ed.value||'').trim()) {
          ed.value = '[s1]\nSmoke Sample Auto‑Load.\nUse auto‑scroll or step to advance.\n[/s1]';
          try { ed.dispatchEvent(new Event('input',{bubbles:true})); } catch {}
          try { if (typeof window.renderScript === 'function') window.renderScript(ed.value); } catch {}
          try { document.body && (document.body.dataset.smokeSample = 'loaded'); } catch {}
        }
        // Mark upload mock readiness (the harness will attempt an upload button click later)
        try { document.body && (document.body.dataset.smokeUpload = 'ready'); } catch {}
        try { window.dispatchEvent(new CustomEvent('tp:upload:mock', { detail: { ready: true } })); } catch {}
      }
    } catch {}
  } catch (err) {
    console.error('[src/index] boot failed', err);
    try { window.__TP_BOOT_TRACE = window.__TP_BOOT_TRACE || []; window.__TP_BOOT_TRACE.push({ t: Date.now(), tag: 'src/index', msg: 'boot failed', error: String(err && err.message || err) }); } catch {}
  }
}

// Auto-run boot when loaded as a module, but also export boot for manual invocation.
boot();

export { boot };

