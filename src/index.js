// Minimal bootstrap for the new `src/` modular layout.
// This file intentionally performs a very small set of init actions and
// delegates the heavy lifting to the legacy loader until a full migration is done.

import * as Adapters from './adapters/index.js';
import * as Core from './core/state.js';
import { initAutoScroll } from './features/autoscroll.js';
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

    // Easter eggs (party mode on dB meter, Konami theme, etc.)
    try {
      const eggs = await import('../eggs.js');
      try { eggs.installEasterEggs && eggs.installEasterEggs(); } catch {}
      try { eggs.installCKEgg && eggs.installCKEgg(); } catch {}
      try { eggs.installAboutPopover && eggs.installAboutPopover(); } catch {}
    } catch (e) { console.warn('[src/index] eggs init failed', e); }

    // Initialize adapters (best-effort)
    try { await (Adapters.obsAdapter?.init?.() ?? Promise.resolve()); } catch (e) { console.warn('[src/index] obsAdapter.init failed', e); }
    try { await (Adapters.recorderAdapter?.init?.() ?? Promise.resolve()); } catch (e) { console.warn('[src/index] recorderAdapter.init failed', e); }

    // Initialize features
    try { initPersistence(); } catch (e) { console.warn('[src/index] initPersistence failed', e); }
    try { initTelemetry(); } catch (e) { console.warn('[src/index] initTelemetry failed', e); }
    try { initToasts(); } catch (e) { console.warn('[src/index] initToasts failed', e); }
    try { initScroll(); } catch (e) { console.warn('[src/index] initScroll failed', e); }
    try { initHotkeys(); } catch (e) { console.warn('[src/index] initHotkeys failed', e); }

    // Wire Auto-scroll controls (independent of speech/mic)
    try {
      // pick a real scrollable element in priority: #viewer -> #script -> page
      const getScroller = () => {
        const v = document.getElementById('viewer');
        if (v && v.scrollHeight > v.clientHeight + 1) return v;
        const scr = document.getElementById('script');
        if (scr && scr.scrollHeight > scr.clientHeight + 1) return scr;
        return document.scrollingElement || document.documentElement;
      };

      const autoToggle = document.getElementById('autoToggle');
      const autoSpeed = /** @type {HTMLInputElement|null} */ (document.getElementById('autoSpeed'));
      const auto = initAutoScroll(getScroller);
      auto.bindUI(autoToggle, autoSpeed);
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

