// Minimal bootstrap for the new `src/` modular layout.
// This file intentionally performs a very small set of init actions and
// delegates the heavy lifting to the legacy loader until a full migration is done.

import * as Adapters from './adapters/index.js';
// Provide legacy-compatible app store for settings/state persistence (exposes window.__tpStore)
import './state/app-store.js';
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
// Ensure inline formatter is present (provides window.formatInlineMarkup)
import '../ui/format.js';
import '../ui/inline-shim.js';
// Display bridge: provides window.__tpDisplay (open/close/send/handleMessage)
// Lightweight toast system (attaches window.toast/initToastContainer)
import '../ui/toasts.js';
import './media/display-bridge.js';
import * as UI from './ui/dom.js';
// Install typography bridge (CSS vars + wheel zoom guards + Settings bridge)
import '../ui/typography-bridge.js';
// Scripts Save/Load UI (dropdown + buttons wiring)
import '../ui/scripts-ui.js';
// Settings overlay and media/OBS wiring (module path)
import './ui/settings.js';

// Dev-only helpers and safety stubs: keep out of prod bundle
try {
  if (window?.__TP_BOOT_INFO?.isDev) {
  // Load debug helper dynamically in dev
    import('../debug-tools.js')
      .then(() => {
        // If the advanced setting is enabled, auto-install HUD; also subscribe to toggle
        try {
          const S = window.__tpStore || null;
          const ensureHud = (on) => {
            try {
              // Install once unconditionally in dev so the hotkey (~) always works
              if (typeof window.__tpInstallHUD === 'function' && !window.__tpHud) {
                window.__tpHud = window.__tpInstallHUD({ hotkey: '~' });
              }
              // Show/hide if instance exists based on preference
              if (window.__tpHud) {
                if (on) { try { window.__tpHud.show && window.__tpHud.show(); } catch {} }
                else { try { window.__tpHud.hide && window.__tpHud.hide(); } catch {} }
              }
            } catch {}
          };
          // Apply current preference (if store available)
          try { if (S && typeof S.get === 'function') ensureHud(!!S.get('devHud')); } catch {}
          // Subscribe for future changes
          try { if (S && typeof S.subscribe === 'function') S.subscribe('devHud', (v) => ensureHud(!!v)); } catch {}
          // Ensure install even before store is ready so hotkey works immediately
          if (!S) { try { ensureHud(false); } catch {} }
        } catch {}
      })
      .catch(() => {});
  // Load legacy self-checks (provides window.runSelfChecks)
  import('../ui/selfChecks.js').catch(() => {});
    // Install safe no-op shims so early UI clicks never throw before adapters/media load
    // Display bridge (both shapes)
    window.__tpDisplay = window.__tpDisplay || {
      openDisplay: function(){}, closeDisplay: function(){}, sendToDisplay: function(){}, handleMessage: function(){}
    };
    if (!window.openDisplay) window.openDisplay = function(){};
    if (!window.closeDisplay) window.closeDisplay = function(){};
    if (!window.sendToDisplay) window.sendToDisplay = function(){};
    // Mic
    window.__tpMic = window.__tpMic || { requestMic: async function(){}, releaseMic: function(){} };
    // Camera: include both alias sets so any caller shape is safe
    window.__tpCamera = window.__tpCamera || {};
    window.__tpCamera.start = window.__tpCamera.start || (async function(){});
    window.__tpCamera.stop = window.__tpCamera.stop || (function(){});
    window.__tpCamera.setDevice = window.__tpCamera.setDevice || (function(){});
    window.__tpCamera.setSize = window.__tpCamera.setSize || (function(){});
    window.__tpCamera.setOpacity = window.__tpCamera.setOpacity || (function(){});
    window.__tpCamera.setMirror = window.__tpCamera.setMirror || (function(){});
    window.__tpCamera.startCamera = window.__tpCamera.startCamera || (async function(){});
    window.__tpCamera.stopCamera = window.__tpCamera.stopCamera || (function(){});
    window.__tpCamera.switchCamera = window.__tpCamera.switchCamera || (function(){});
    window.__tpCamera.applyCamSizing = window.__tpCamera.applyCamSizing || (function(){});
    window.__tpCamera.applyCamOpacity = window.__tpCamera.applyCamOpacity || (function(){});
    window.__tpCamera.applyCamMirror = window.__tpCamera.applyCamMirror || (function(){});
  }
} catch {}

async function boot() {
  try {
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
        if (Mic && (typeof Mic.requestMic === 'function' || typeof Mic.releaseMic === 'function')) {
          window.__tpMic = {
            requestMic: async () => { try { await Mic.requestMic(); } catch {} },
            releaseMic: () => { try { Mic.releaseMic && Mic.releaseMic(); } catch {} },
          };
        }
      } catch {}
      if (!window.__tpRecorder && Adapters.recorderAdapter?.create) {
        window.__tpRecorder = Adapters.recorderAdapter.create();
      }
    } catch {}

    // Initialize features
    try { initPersistence(); } catch (e) { console.warn('[src/index] initPersistence failed', e); }
    try { initTelemetry(); } catch (e) { console.warn('[src/index] initTelemetry failed', e); }
  try { if (typeof window.initToastContainer === 'function') window.initToastContainer(); } catch (e) { console.warn('[src/index] initToastContainer failed', e); }
  try { initScroll(); } catch (e) { console.warn('[src/index] initScroll failed', e); }
    try { initHotkeys(); } catch (e) { console.warn('[src/index] initHotkeys failed', e); }

      // Install speech start/stop delegator
      try { installSpeech(); } catch (e) { console.warn('[src/index] installSpeech failed', e); }

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
        }
        // Pass the Auto API to the router so it can drive the engine
        try { mod && typeof mod.installScrollRouter === 'function' && mod.installScrollRouter({ auto: Auto }); } catch (e) {
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
      document.addEventListener('click', (e) => {
        const t = e && e.target;
        try {
          if (t?.closest?.('#autoToggle')) {
            __lastAutoToggleAt = Date.now();
            Auto.toggle();
            // If just enabled, warm the engine with the persisted speed for immediate consistency
            try {
              const st = Auto.getState ? Auto.getState() : null;
              if (st && st.enabled) {
                const s = (function(){ try { return Number(localStorage.getItem('tp_auto_speed')||'60')||60; } catch { return 60; } })();
                Auto.setSpeed(s);
                try { window.__scrollCtl?.setSpeed?.(s); } catch {}
              }
            } catch {}
            // Reflect immediately for headless probes
            setTimeout(__applyAutoChip, 0);
            return;
          }
        } catch {}
        try { if (t?.closest?.('#autoInc'))    return Auto.inc(); } catch {}
        try { if (t?.closest?.('#autoDec'))    return Auto.dec(); } catch {}
        try { if (t?.closest?.('#micBtn'))         return Mic.requestMic(); } catch {}
        try { if (t?.closest?.('#releaseMicBtn'))  return Mic.releaseMic(); } catch {}
      }, { capture: true });
      // Headless fallback (some runners only dispatch mousedown)
      document.addEventListener('mousedown', (e) => {
        const t = e && e.target;
        try {
          if (t?.closest?.('#autoToggle')) {
            // Avoid double-toggling when both mousedown and click fire
            if (Date.now() - __lastAutoToggleAt < 200) return;
            __lastAutoToggleAt = Date.now();
            Auto.toggle();
            // If just enabled, warm the engine with the persisted speed
            try {
              const st = Auto.getState ? Auto.getState() : null;
              if (st && st.enabled) {
                const s = (function(){ try { return Number(localStorage.getItem('tp_auto_speed')||'60')||60; } catch { return 60; } })();
                Auto.setSpeed(s);
                try { window.__scrollCtl?.setSpeed?.(s); } catch {}
              }
            } catch {}
            setTimeout(__applyAutoChip, 0);
            // no explicit return needed; end of handler
          }
        } catch {}
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
          // Wheel on input adjusts ±1 (Shift: ±5)
          inp.addEventListener('wheel', (ev) => {
            try {
              // eslint-disable-next-line no-restricted-syntax
              ev.preventDefault();
              const step = ev.shiftKey ? 5 : 1;
              const dir = (ev.deltaY < 0) ? +1 : -1;
              const cur = Number(inp.value || '0') || 0;
              const next = Math.max(5, Math.min(200, Math.round((cur + dir * step) * 100) / 100));
              inp.value = String(next);
              Auto.setSpeed(next);
            } catch {}
          }, { passive: false });
        };
        // wire now and after small delay in case DOM re-renders
        wireSpeedInput();
        setTimeout(wireSpeedInput, 250);
      } catch {}

      // Stop autoscroll with a short buffer after speech stops to avoid abrupt cutoffs
      try {
        let autoStopTimer = null;
        window.addEventListener('tp:speech-state', (ev) => {
          const isRunning = !!(ev && ev.detail && ev.detail.running);
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

