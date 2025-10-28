// Minimal bootstrap for the new `src/` modular layout.
// This file intentionally performs a very small set of init actions and
// delegates the heavy lifting to the legacy loader until a full migration is done.

import * as Adapters from './adapters/index.js';
import * as Mic from './adapters/mic.js';
import { bus } from './core/bus.js';
import * as Core from './core/state.js';
import * as Auto from './features/autoscroll.js';
import * as Eggs from './features/eggs.js';
import { initHotkeys } from './features/hotkeys.js';
import { initPersistence } from './features/persistence.js';
import { initScroll } from './features/scroll.js';
import { initTelemetry } from './features/telemetry.js';
import { initToasts } from './features/toasts.js';
import * as UI from './ui/dom.js';

// Dev-only helpers and safety stubs: keep out of prod bundle
try {
  if (window?.__TP_BOOT_INFO?.isDev) {
  // Load debug helper dynamically in dev
    import('../debug-tools.js').catch(() => {});
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
    UI.bindStaticDom();

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
      if (!window.__tpOBS && Adapters.obsAdapter?.create) {
        window.__tpOBS = Adapters.obsAdapter.create();
      }
      if (!window.__tpRecorder && Adapters.recorderAdapter?.create) {
        window.__tpRecorder = Adapters.recorderAdapter.create();
      }
    } catch {}

    // Initialize features
    try { initPersistence(); } catch (e) { console.warn('[src/index] initPersistence failed', e); }
    try { initTelemetry(); } catch (e) { console.warn('[src/index] initTelemetry failed', e); }
    try { initToasts(); } catch (e) { console.warn('[src/index] initToasts failed', e); }
    try { initScroll(); } catch (e) { console.warn('[src/index] initScroll failed', e); }
    try { initHotkeys(); } catch (e) { console.warn('[src/index] initHotkeys failed', e); }

    // Wire Start speech sync button if SpeechRecognition is available (no TS imports)
    try {
      const btn = document.getElementById('recBtn');
      const chip = document.getElementById('recChip');
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (btn && SR) {
        btn.disabled = false;
        let running = false;
        let recog = null;
        btn.addEventListener('click', async () => {
          try {
            if (!running) {
              running = true;
              if (chip) chip.textContent = 'Speech: starting…';
              try {
                // Create a simple recognizer directly via Web Speech API
                const r = new SR();
                recog = r;
                r.continuous = true;
                r.interimResults = true;
                r.lang = 'en-US';
                r.onresult = () => { /* no-op matcher for now; future hook */ };
                try { r.start(); } catch {}
                if (chip) chip.textContent = 'Speech: running';
                btn.textContent = 'Stop speech sync';
                // If OBS is enabled, kick off recording (best-effort)
                try {
                  const S = window.__tpStore;
                  if (S && S.get && S.get('obsEnabled')) {
                    const obs = window.__tpOBS;
                    const conn = window.__tpObsConn;
                    if (obs && typeof obs.startRecording === 'function' && conn) {
                      obs.startRecording(conn);
                    }
                  }
                } catch {}
              } catch {
                if (chip) chip.textContent = 'Speech: error';
                running = false;
              }
            } else {
              try { recog && recog.stop && recog.stop(); } catch {}
              recog = null;
              running = false;
              if (chip) chip.textContent = 'Speech: idle';
              btn.textContent = 'Start speech sync';
              // If OBS is enabled, stop recording (best-effort)
              try {
                const S = window.__tpStore;
                if (S && S.get && S.get('obsEnabled')) {
                  const obs = window.__tpOBS;
                  const conn = window.__tpObsConn;
                  if (obs && typeof obs.stopRecording === 'function' && conn) {
                    obs.stopRecording(conn);
                  }
                }
              } catch {}
            }
          } catch {}
        });
      }
    } catch (e) { console.warn('[src/index] speech button wiring failed', e); }

    // Wire Auto-scroll controls (independent of speech/mic)
    try {
      Auto.initAutoScroll();
      // Resilient event delegation (works in headless + when nodes re-render)
      document.addEventListener('click', (e) => {
        const t = e && e.target;
        try { if (t?.closest?.('#autoToggle')) return Auto.toggle(); } catch {}
        try { if (t?.closest?.('#autoInc'))    return Auto.inc(); } catch {}
        try { if (t?.closest?.('#autoDec'))    return Auto.dec(); } catch {}
        try { if (t?.closest?.('#micBtn'))         return Mic.requestMic(); } catch {}
        try { if (t?.closest?.('#releaseMicBtn'))  return Mic.releaseMic(); } catch {}
      }, { capture: true });
      // Headless fallback (some runners only dispatch mousedown)
      document.addEventListener('mousedown', (e) => {
        const t = e && e.target;
        try { if (t?.closest?.('#autoToggle')) return Auto.toggle(); } catch {}
      }, { capture: true });
    } catch (e) { console.warn('[src/index] initAutoScroll failed', e); }

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

