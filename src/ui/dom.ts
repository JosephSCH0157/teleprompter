// @ts-nocheck
// Minimal DOM helpers for the UI layer

import { computeAnchorLineIndex } from '../scroll/scroll-helpers';
import { getScrollWriter } from '../scroll/scroll-writer';
import {
  applyCanonicalScrollTop,
  getFallbackScroller,
  getPrimaryScroller,
  getScriptRoot,
  resolveActiveScroller,
} from '../scroll/scroller';
import { setSessionPhase } from '../state/session';
import { applyScript } from '../features/apply-script';
import { getNextSampleScript } from '../content/sample-scripts';
import { flushPendingSettingsEdits } from '../ui/settings';
import { initStepControls } from './step-controls';
import { wireCatchUpButton } from './catch-up';


type AnyFn = (...args: any[]) => any;

export function qs<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector(selector) as T | null;
}

export function qsa<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll(selector)) as T[];
}

declare global {
  interface Window {
    __tpDisplayWindow?: Window | null;
    __tpDisplayPipWindow?: Window | null;
    __tpDisplay?: any;
    __tpDisplayMsgWired?: boolean;
    __tpCamGlobalCaptureGuard?: boolean;
    __tpSettingsCamGuardActive?: boolean;
    __tpCamera?: any;
    openDisplay?: () => any;
    closeDisplay?: () => any;
    __tpDisplayDebug?: Array<{ ts?: number; t?: number; tag: string; data?: unknown }>;
    __tpHud?: { log?: AnyFn };
    __tpHudRecorderBtn?: HTMLElement | null;
    __tpTextStats?: any;
    __tpFeatureInit?: Record<string, any>;
    __tp?: any;
    __tpInit?: Record<string, any>;
    __tpStore?: any;
    toast?: (msg: string, opts?: any) => void;
    __tpObsSSOT?: string;
  }
}

// Broadcast channel for cross-window display sync (names/colors)
let __bc = null; try { __bc = new BroadcastChannel('prompter'); } catch {}

const scrollWriter = getScrollWriter();
const DISPLAY_TOGGLE_SELECTOR =
  '#displayToggleBtn,#displayToggleBtnSidebar,[data-ci="display-toggle"],[data-action="display"],[data-action="display-toggle"]';

export function on(
  el: EventTarget | null | undefined,
  ev: string,
  fn: any,
  opts?: boolean | AddEventListenerOptions,
): void {
  try { if (el && typeof el.addEventListener === 'function') el.addEventListener(ev, fn, opts); } catch {}
}

export function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
  try { return document.getElementById(id) as T | null; } catch { return null; }
}

export function wireTopbarHeightVar(): void {
  const topbar = document.querySelector<HTMLElement>('.topbar');
  if (!topbar) return;

  const apply = () => {
    try {
      const h = topbar.offsetHeight;
      if (!h) return;
      const root = document.documentElement;
      root.style.setProperty('--tp-topbar-h', `${h}px`);
      root.style.setProperty('--topbar-h', `${h}px`);
    } catch {}
  };

  apply();
  let ro: ResizeObserver | null = null;
  try {
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => apply());
      ro.observe(topbar);
    }
  } catch {}
  try { window.addEventListener('load', apply, { passive: true }); } catch {}
  try {
    if (ro) {
      window.addEventListener('beforeunload', () => { try { ro?.disconnect(); } catch {} }, { once: true });
    }
  } catch {}
}

function logDisplayDebug(tag: string, data?: unknown) {
  try {
    const arr = (window.__tpDisplayDebug = window.__tpDisplayDebug || []);
    const now = Date.now();
    arr.push({ ts: now, t: now, tag, data });
    if (arr.length > 50) arr.shift();
    try {
      console.debug('[display-debug]', tag, data || {});
    } catch {}
  } catch {}
}

// --- UI Hydration Contract ---------------------------------------------------
const UI_WIRED = new Set();
const $id = (id) => { try { return document.getElementById(id); } catch { return null; } };
let IS_HYDRATING = false;
let HYDRATE_SCHEDULED = false;

// Global guard for camera controls to swallow any stray legacy bubble listeners
try {
  if (!window.__tpCamGlobalCaptureGuard) {
    window.__tpCamGlobalCaptureGuard = true;
    document.addEventListener('click', (e) => {
      try {
        const t = e.target?.closest?.('#startCam, #stopCam, #camDevice, #StartCam, #StopCam, #CamDevice');
        if (!t) return;
        e.stopPropagation();
        e.stopImmediatePropagation?.();
      } catch {}
    }, { capture: false });

    // Device select safety: handle Settings/Main device changes even if specific wiring didn't attach
    document.addEventListener('change', async (e) => {
      try {
        if (window.__tpSettingsCamGuardActive) return; // Settings wiring owns this
        const el = e.target && e.target.closest && e.target.closest('#settingsCamSel, #camDevice, #CamDevice');
        if (!el) return;
        const val = el && 'value' in el ? el.value : '';
        const prev = (function(){ try { return localStorage.getItem('tp_camera_device_v1') || ''; } catch { return ''; } })();
        let ok = true;
        // Live switch if active; only persist on success
        if (window.__tpCamera?.isActive?.()) {
          try {
            ok = !!(await window.__tpCamera.switchCamera?.(val));
          } catch { ok = false; }
        }
        if (ok) {
          try { if (val) localStorage.setItem('tp_camera_device_v1', String(val)); } catch {}
          try {
            const sSel = document.getElementById('settingsCamSel');
            const mSel = document.getElementById('camDevice') || document.getElementById('CamDevice');
            if (sSel && sSel !== el && sSel.value !== val) sSel.value = val;
            if (mSel && mSel !== el && mSel.value !== val) mSel.value = val;
          } catch {}
        } else {
          // Revert UI to previously saved id on failure
          try {
            const sSel = document.getElementById('settingsCamSel');
            const mSel = document.getElementById('camDevice') || document.getElementById('CamDevice');
            if (sSel && prev && sSel.value !== prev) sSel.value = prev;
            if (mSel && prev && mSel.value !== prev) mSel.value = prev;
          } catch {}
          try { window.toast && window.toast('Camera unavailable â€” selection reverted', { type: 'warn' }); } catch {}
        }
        // Stop legacy listeners from reacting
        try { e.stopPropagation(); e.stopImmediatePropagation?.(); } catch {}
      } catch {}
    }, { capture: true });
  }
} catch {}

// Wire once per key
function once(key, fn) {
  try {
    if (UI_WIRED.has(key)) return;
    try { fn && fn(); } finally { UI_WIRED.add(key); }
  } catch {}
}

// (legacy toggleOverlay helper removed with legacy overlay wiring)

// (legacy non-delegated overlay wiring removed; replaced by idempotent delegated wiring)

export function wireDisplayBridgeDelegated(onToggle?: () => void) {
  if ((window as any).__tpDisplayDelegatedWired) return;
  (window as any).__tpDisplayDelegatedWired = true;

  const hasOpen = typeof window.openDisplay === 'function';
  const hasClose = typeof window.closeDisplay === 'function';

  logDisplayDebug('wireDisplayBridge', {
    hasOpen,
    hasClose,
    toggleCount: document.querySelectorAll(DISPLAY_TOGGLE_SELECTOR).length,
  });

  document.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;

    const btn = target.closest(DISPLAY_TOGGLE_SELECTOR) as HTMLButtonElement | null;
    if (!btn) return;

    const hasWindow = !!(window.__tpDisplayWindow && !window.__tpDisplayWindow.closed);

    logDisplayDebug('display:click', {
      hasOpen: typeof window.openDisplay === 'function',
      hasClose: typeof window.closeDisplay === 'function',
      hasWindow,
    });

    if (hasWindow && typeof window.closeDisplay === 'function') {
      window.closeDisplay();
    } else if (typeof window.openDisplay === 'function') {
      window.openDisplay();
    } else {
      console.warn('[display-toggle] openDisplay() is not available');
      try {
        const w = window.open('display.html', 'TeleprompterDisplay', 'width=1000,height=700');
        try { (window as any).__tpDisplayWindow = w || null; } catch {}
      } catch {}
    }

    try { onToggle && onToggle(); } catch {}
  });
}

export function wireDisplayBridge() {
  // Bridge wrappers for legacy global API expected by some helpers/self-checks
  try {
    const disp = (window.__tpDisplay || {});
    // Always delegate to the bridge to avoid stale no-op stubs
    if (disp) window.openDisplay = () => { try { return disp.openDisplay && disp.openDisplay(); } catch {} };
    if (disp) window.closeDisplay = () => { try { return disp.closeDisplay && disp.closeDisplay(); } catch {} };
    if (disp) window.sendToDisplay = (p) => { try { return disp.sendToDisplay && disp.sendToDisplay(p); } catch {} };
  } catch {}

  // Wire message handler once
  try {
    const handler = (e) => { try { window.__tpDisplay && window.__tpDisplay.handleMessage && window.__tpDisplay.handleMessage(e); } catch {} };
    if (!window.__tpDisplayMsgWired) {
      window.addEventListener('message', handler);
      window.__tpDisplayMsgWired = true;
    }
  } catch {}

  // Buttons
  const openBtn = $('openDisplayBtn');
  const closeBtn = $('closeDisplayBtn');
  const getToggleBtns = () =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        DISPLAY_TOGGLE_SELECTOR,
      ),
    );
  const updateToggleState = () => {
    try {
      const w = window.__tpDisplayWindow || null;
      const isOpen = !!(w && !w.closed);
      getToggleBtns().forEach((toggleBtn) => {
        try {
          toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          toggleBtn.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
          toggleBtn.dataset.state = isOpen ? 'open' : 'closed';
          toggleBtn.textContent = isOpen ? 'Display: Open' : 'Display: Closed';
        } catch {}
      });
    } catch {}
  };
  on(openBtn, 'click', () => { try { window.openDisplay && window.openDisplay(); } catch {} });
  on(closeBtn, 'click', () => { try { window.closeDisplay && window.closeDisplay(); } catch {} });
  try {
    window.addEventListener('tp:display:opened', updateToggleState);
    window.addEventListener('tp:display:closed', updateToggleState);
  } catch {}
  updateToggleState();
  try {
    // Early resync to catch any late-mount duplicate buttons
    const t0 = window.setInterval(updateToggleState, 400);
    window.setTimeout(() => { try { window.clearInterval(t0); } catch {} }, 4000);
  } catch {}
  wireDisplayBridgeDelegated(updateToggleState);
}

// Mirror main window state to display: scroll position, typography, and content
export function wireDisplayMirror() {
  try {
    if (document.documentElement.dataset.displayMirrorWired === '1') return;
    document.documentElement.dataset.displayMirrorWired = '1';

    const viewer = $('viewer');
    const scriptEl = $('script');
    // Throttled scroll mirroring (send ratio for resolution independence)
    let scrollPending = false;
    const sendScroll = () => {
      try {
        if (!viewer || !window.sendToDisplay) return;
        const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
        const ratio = max > 0 ? (viewer.scrollTop / max) : 0;
        const cursorLine = computeAnchorLineIndex(viewer);
        window.sendToDisplay({
          type: 'scroll',
          ratio,
          anchorRatio: ratio,
          top: viewer.scrollTop,
          cursorLine: cursorLine ?? undefined,
        });
      } finally {
        scrollPending = false;
      }
    };
    const requestSendScroll = () => {
      if (scrollPending) return;
      scrollPending = true;
      requestAnimationFrame(sendScroll);
    };
    if (viewer) {
      viewer.addEventListener('scroll', () => {
        requestSendScroll();
        try { window.dispatchEvent(new Event('tp:anchorChanged')); } catch {}
      }, { passive: true });
      // Heartbeat: ensure display keeps getting the latest top even if scroll events are swallowed
      let lastHeartbeatTop = viewer.scrollTop || 0;
      const pollScrollHeartbeat = () => {
        try {
          const current = viewer.scrollTop || 0;
          if (Math.abs(current - lastHeartbeatTop) >= 0.25) {
            lastHeartbeatTop = current;
            requestSendScroll();
          }
        } catch {}
        try {
          requestAnimationFrame(pollScrollHeartbeat);
        } catch {}
      };
      try { requestAnimationFrame(pollScrollHeartbeat); } catch {}
    }

    // Typography mirroring (font size / line height)
    const fs = $('fontSize');
    const lh = $('lineHeight');
    const sendTypography = () => {
      try {
        // Only broadcast when linking is ON
        let linkOn = false;
        try {
          const raw = localStorage.getItem('tp_ui_prefs_v1');
          const st = raw ? JSON.parse(raw) : {};
          linkOn = !!st.linkTypography;
        } catch {}
        if (!linkOn) return;
        const fontSize = fs && 'value' in fs ? Number(fs.value) : undefined;
        const lineHeight = lh && 'value' in lh ? Number(lh.value) : undefined;
        window.sendToDisplay && window.sendToDisplay({ type: 'typography', fontSize, lineHeight });
      } catch {}
    };
    on(fs, 'input', sendTypography);
    on(lh, 'input', sendTypography);

  // Initial push only if linking is enabled
  setTimeout(sendTypography, 0);

    // Content render mirroring: listen for our renderer's event and also observe #script for any DOM changes
    let renderPending = false;
    const sendRender = () => {
      try {
        const html = document.getElementById('script')?.innerHTML || '';
        const fontSize = fs && 'value' in fs ? Number(fs.value) : undefined;
        const lineHeight = lh && 'value' in lh ? Number(lh.value) : undefined;
        window.sendToDisplay && window.sendToDisplay({ type: 'render', html, fontSize, lineHeight });
      } finally {
        renderPending = false;
      }
    };
    document.addEventListener('tp:script-rendered', () => {
      if (!renderPending) { renderPending = true; requestAnimationFrame(sendRender); }
    });
    try {
      if (scriptEl) {
        const mo = new MutationObserver(() => {
          if (!renderPending) { renderPending = true; requestAnimationFrame(sendRender); }
        });
        mo.observe(scriptEl, { childList: true, subtree: true });
      }
    } catch {}
  } catch {}
}

  export function wireMic() {
    const req = $('micBtn');
    const rel = $('releaseMicBtn');
    on(req, 'click', async () => { try { await window.__tpMic?.requestMic?.(); } catch {} });
    on(rel, 'click', () => { try { window.__tpMic?.releaseMic?.(); } catch {} });
    const cal = $('micCalBtn');
    if (cal && !(cal as any)._tpMicCalWired) {
      (cal as any)._tpMicCalWired = true;
      cal.dataset.micCalWired = '1';
      const openMediaSettings = (ev?: Event) => {
        try { ev?.preventDefault(); } catch {}
        try {
          const anyWin = window as any;
          if (typeof anyWin.openSettingsToMedia === 'function') {
            anyWin.openSettingsToMedia();
            return;
          }
          try { anyWin.__tpStore?.set?.('settingsTab', 'media'); } catch {}
          try { document.querySelector<HTMLElement>('#settingsBtn, [data-action="settings-open"]')?.click(); } catch {}
          try { anyWin.__tpSettings?.open?.(); } catch {}
          const clickMediaTab = () => {
            try { document.querySelector<HTMLElement>('[data-settings-tab="media"]')?.click(); } catch {}
            try { document.querySelector<HTMLElement>('[data-tab="media"]')?.click(); } catch {}
          };
          clickMediaTab();
          setTimeout(clickMediaTab, 80);
        } catch {
          try { document.querySelector<HTMLElement>('#settingsBtn, [data-action="settings-open"]')?.click(); } catch {}
        }
      };
      cal.addEventListener('click', openMediaSettings, { capture: true });
    }
}

export function wireCamera() {
  const start = $('startCam') || $('StartCam');
  const stop = $('stopCam') || $('StopCam');
  const camSel= $('camDevice') || $('CamDevice');
  const size = $('camSize');
  const op = $('camOpacity');
  const mir = $('camMirror');
  const cameraControls = [camSel, size, op, mir];
  const store = (window as any).__tpStore;
  const startLabel = start?.textContent || 'Start Camera';
  let lastAudioOnlyState: boolean | null = null;
  const applyAudioOnlyState = (on: boolean) => {
    const normalized = !!on;
    if (start) {
      start.disabled = normalized;
      start.textContent = normalized ? 'Camera: Disabled (Audio-only)' : startLabel;
    }
    if (stop) stop.disabled = normalized;
    cameraControls.forEach((el) => {
      if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) {
        el.disabled = normalized;
      }
    });
    if (lastAudioOnlyState === normalized) return;
    lastAudioOnlyState = normalized;
    if (normalized) {
      try { window.__tpCamera?.stopCamera?.(); } catch {}
      try { store?.set?.('cameraEnabled', false); } catch {}
    }
  };
  try {
    applyAudioOnlyState(!!store?.get?.('recordAudioOnly'));
    store?.subscribe?.('recordAudioOnly', (value) => applyAudioOnlyState(!!value));
  } catch {}
  if (start && !start.dataset.captureWired) {
    start.dataset.captureWired = '1';
    start.addEventListener('click', async (e) => {
      try { e.stopImmediatePropagation(); e.preventDefault(); } catch {}
      try { if (window.toast) window.toast('Camera startingâ€¦'); } catch {}
      // Ensure camera module is loaded if not yet available
      try { if (!window.__tpCamera || typeof window.__tpCamera.startCamera !== 'function') await import('../media/camera'); } catch {}
      try {
        await window.__tpCamera?.startCamera?.();
      } catch (err) {
        try {
          const msg = (err && (err.message || err.name)) ? String(err.message || err.name) : '';
          let hint = '';
          try {
            const name = String(err && err.name || '');
            if (name === 'NotReadableError' || name === 'TrackStartError') {
              hint = ' â€¢ Another app is using the camera (e.g., OBS). Close it or pick "OBS Virtual Camera" in Settings â†’ Media.';
            } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
              hint = ' â€¢ Grant camera permission to this tab and try again.';
            }
          } catch {}
          if (window.toast) window.toast('Camera start failed' + (msg ? ': ' + msg : '') + hint);
        } catch {}
      }
    }, { capture: true });
  }
  if (stop && !stop.dataset.captureWired) {
    stop.dataset.captureWired = '1';
    stop.addEventListener('click', (e) => {
      try { e.stopImmediatePropagation(); e.preventDefault(); } catch {}
      try { window.__tpCamera?.stopCamera?.(); } catch {}
      try { if (window.toast) window.toast('Camera stopped', { type: 'ok' }); } catch {}
    }, { capture: true });
  }
  if (camSel && !camSel.dataset.captureWired) {
    camSel.dataset.captureWired = '1';
    camSel.addEventListener('change', (e) => {
      try { e.stopPropagation(); e.stopImmediatePropagation?.(); } catch {}
      try { window.__tpCamera?.switchCamera?.(camSel.value); } catch {}
    }, { capture: true });
  }
  on(size, 'input', () => { try { window.__tpCamera?.applyCamSizing?.(); } catch {} });
  on(op, 'input', () => { try { window.__tpCamera?.applyCamOpacity?.(); } catch {} });
  on(mir, 'change', () => { try { window.__tpCamera?.applyCamMirror?.(); } catch {} });
}

export function wireLoadSample(doc: Document = document) {
  const btn = (doc.getElementById('loadSample') ||
    doc.querySelector('[data-action=\"load-sample\"]')) as HTMLElement | null;
  const ed = doc.getElementById('editor') as HTMLTextAreaElement | HTMLInputElement | null;
  if (!btn || !ed) return;

  // Guard with our own flag; ignore legacy data-wired
  if ((btn as any)._tpSampleWired) return;
  (btn as any)._tpSampleWired = true;

  btn.addEventListener('click', (e) => {
    try { e.preventDefault(); e.stopImmediatePropagation?.(); } catch {}
    try {
      const sample = getNextSampleScript();
      if (!sample) return;
      applyScript(sample, 'sample', { updateEditor: true });
    } catch {}
  }, { capture: true });
}
// Reset run without clearing content: rewind to top, reset index/state, keep editor text.
function resetRun() {
  try { window.stopAutoScroll && window.stopAutoScroll(); } catch {}
  try { window.__scrollCtl?.stopAutoCatchup?.(); } catch {}
  try { window.resetTimer && window.resetTimer(); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:autoIntent', { detail: { on: false } })); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running: false } })); } catch {}
  try { setSessionPhase('idle'); } catch {}

  const editor = document.getElementById('editor');
  const text = (editor && 'value' in editor) ? editor.value : '';
  // Re-render to rebuild layout and anchors
  try { if (typeof window.renderScript === 'function') window.renderScript(text); } catch {}

  // Reset logical position + display mirror
  try { window.currentIndex = 0; } catch {}
  try { window.__lastScrollTarget = 0; } catch {}

  // Scroll viewer to the top
  try {
    const scroller =
      (document.querySelector('[data-script-view]') as HTMLElement | null) ||
      document.getElementById('viewer');
    if (scroller) scrollWriter.scrollTo(0, { behavior: 'auto' });
    try {
      const max = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
      const ratio = max ? 0 : 0;
      window.sendToDisplay && window.sendToDisplay({
        type: 'scroll',
        top: 0,
        ratio,
        anchorRatio: ratio,
        cursorLine: 0,
      });
    } catch {}
  } catch {}

  // Notify listeners that the run was rewound
  try { window.dispatchEvent(new CustomEvent('tp:script:reset', { detail: { at: Date.now() } })); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:scroll:status', { detail: { running: false } })); } catch {}

  try { (window.setStatus || (()=>{}))('Script reset to start'); } catch {}
}

export function wireScriptControls() {
  try {
    const clearBtn = document.getElementById('clearText');
    const resetBtn = document.getElementById('resetScriptBtn');
    const editor = document.getElementById('editor');
    const _scriptTitleEl = document.getElementById('scriptTitle'); // unused (legacy wiring placeholder)

    if (clearBtn && !clearBtn.dataset.wired) {
      clearBtn.dataset.wired = '1';
      clearBtn.addEventListener('click', () => {
        try {
          if (editor && 'value' in editor) {
            editor.value = '';
            try { editor.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
            try { if (typeof window.renderScript === 'function') window.renderScript(''); } catch {}
          }
          try { (window.setStatus || (()=>{}))('Cleared'); } catch {}
        } catch {}
      });
    }

    if (resetBtn && !resetBtn.dataset.wired) {
      resetBtn.dataset.wired = '1';
      resetBtn.addEventListener('click', () => {
        try {
          resetRun();
        } catch {}
      });
    }
  } catch {}
}

function installSpeakerIndex() {
  try {
    const host = $('speakerIndexChip');
    if (!host) return;
    const editor = $('editor') || $('scriptInput') || $('sourceText');
    const viewer = $('viewer');
    const getText = () => {
      try { if (editor && 'value' in editor) return editor.value; } catch {}
      try { return (viewer && viewer.textContent) || ''; } catch {}
      return '';
    };
    const countTag = (tag) => {
      try { const m = getText().match(new RegExp('\\\[' + tag + '\\]', 'g')); return m ? m.length : 0; } catch { return 0; }
    };
    const render = () => {
      try {
        const s1 = countTag('s1');
        const s2 = countTag('s2');
        // tolerate variants: guest1, g1, guest
        const g = countTag('g1') + countTag('g2') + countTag('guest1') + countTag('guest');
        host.textContent = `Speakers: S1 ${s1} â€¢ S2 ${s2}${g ? ` â€¢ G ${g}` : ''}`;
      } catch {}
    };
    render();
    on(document, 'input', (e) => {
      try { const id = (e && e.target && e.target.id) ? String(e.target.id) : ''; if (/editor|script|source/i.test(id)) render(); } catch {}
    });
  } catch {}
}

function installDbMeter() {
  once('db-meter', () => {
    try {
      // Top-bar compact meter (single source of truth)
      const hostTop = document.getElementById('dbMeterTop');
      let topFill = null;
      if (hostTop && !hostTop.dataset.wired) {
        hostTop.dataset.wired = '1';
        const barMini = document.createElement('div');
        barMini.style.cssText = 'height:6px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.1);width:90px';
        const fill = document.createElement('i');
        fill.style.cssText = 'display:block;height:100%;transform-origin:left center;transform:scaleX(0);background:linear-gradient(90deg,#4caf50,#ffc107 60%,#e53935)';
        barMini.appendChild(fill);
        hostTop.title = 'Input level';
        hostTop.appendChild(barMini);
        topFill = fill;
      } else if (hostTop) {
        topFill = hostTop.querySelector('i');
      }

      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      const render = (db = NaN, peak = NaN) => {
        try {
          const val = Number.isFinite(peak) ? peak : (Number.isFinite(db) ? db : -60);
          const pct = (clamp(val, -60, 0) + 60) / 60; // map -60..0 â†’ 0..1
          if (topFill) topFill.style.transform = `scaleX(${pct})`;
        } catch {}
      };
      render(); // idle

      window.addEventListener('tp:db', (e) => {
        try { const d = (e && e.detail) || {}; render(d.db, d.peak); } catch {}
      });
    } catch {}
  });
}

// Tiny OBS status chip: creates #obsChip once and updates on tp:obs events
function installObsChip() {
  once('obs-chip', () => {
    try {
      const topbar = document.querySelector('.topbar') || document.body;
      let chip = document.getElementById('obsChip');
      if (!chip) {
        chip = document.createElement('span');
        chip.id = 'obsChip';
        chip.className = 'chip';
        // Create structured content: label + optional test icon
        const label = document.createElement('span');
        label.className = 'obs-chip-label';
        label.textContent = 'OBS: disconnected';
        const icon = document.createElement('i');
        icon.className = 'obs-test-icon';
        icon.setAttribute('aria-hidden','true');
        chip.appendChild(label);
        chip.appendChild(icon);
        topbar && topbar.appendChild(chip);
      }
      const labelEl = chip.querySelector('.obs-chip-label') || chip;
      const iconEl = chip.querySelector('.obs-test-icon');
      let hideTimer = null;
      const render = ({ status = 'disconnected', recording = false, scene } = {}) => {
        try {
          const s = String(status||'disconnected');
          labelEl.textContent = `OBS: ${s}${recording ? ' â€¢ REC' : ''}${scene ? ` â€¢ ${scene}` : ''}`;
          // reset state classes and apply new one(s)
          const base = ['chip'];
          if (s === 'identified' || s === 'open') base.push('obs-connected');
          else if (s === 'connecting') base.push('obs-reconnecting');
          else if (s === 'error') base.push('obs-error');
          if (recording) base.push('chip-live');
          chip.className = base.join(' ');
        } catch {}
      };
      render();
      window.addEventListener('tp:obs', (e) => { try { render((e && e.detail) || {}); } catch {} });
      // Show a brief test icon feedback when test completes
      window.addEventListener('tp:obs-test', (e) => {
        try {
          const d = (e && e.detail) || {}; const ok = !!d.ok;
          if (!iconEl) return;
          iconEl.textContent = ok ? 'âœ“' : '!';
          iconEl.classList.remove('ok','error','show');
          iconEl.classList.add(ok ? 'ok' : 'error');
          // force reflow for transition
          void iconEl.offsetWidth;
          iconEl.classList.add('show');
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = setTimeout(() => { try { iconEl.classList.remove('show'); } catch {} }, 2500);
        } catch {}
      });
    } catch {}
  });
}

export function wireOverlays() {
  once('overlays', () => {
    try {
      const ensureHelpContents = () => {
        try {
          const ov = $id('shortcutsOverlay'); if (!ov) return;
          const sheet = ov.querySelector('.sheet'); if (!sheet) return;
          if (ov.querySelector('#tagGuide')) return; // already injected
          const wrap = document.createElement('section');
          wrap.id = 'tagGuide';
          wrap.className = 'tag-guide';
          wrap.innerHTML = `
            <h4>Tag Guide</h4>
            <div class="settings-small">Use bracket tags inside your script to style and segment content.</div>
            <ul class="tag-list">
              <li><code>[s1]</code>â€¦<code>[/s1]</code> â€” Speaker 1</li>
              <li><code>[s2]</code>â€¦<code>[/s2]</code> â€” Speaker 2</li>
              <li><code>[g1]</code>â€¦<code>[/g1]</code> â€” Guest 1</li>
              <li><code>[g2]</code>â€¦<code>[/g2]</code> â€” Guest 2</li>
              <li><code>[b]</code>/<code>[i]</code>/<code>[u]</code> â€” Bold/Italic/Underline</li>
              <li><code>[note]</code>â€¦<code>[/note]</code> â€” Sidebar note</li>
              <li><code>[color=#ff0]</code>â€¦<code>[/color]</code> â€” Text color</li>
              <li><code>[bg=#112233]</code>â€¦<code>[/bg]</code> â€” Background color</li>
            </ul>
            <div class="row">
              <button id="normalizeBtn" class="btn-chip">Normalize</button>
              <span class="chip">Fix whitespace and non-breaking spaces</span>
            </div>`;
          sheet.appendChild(wrap);
        } catch {}
      };
      // Also respond to binder events to ensure content is present even when help opened via delegated binder
      try {
        window.addEventListener('tp:help:open', () => { try { ensureHelpContents(); } catch {} });
      } catch {}
      const SETTINGS_OPEN_SEL = '#settingsBtn, [data-action="settings-open"]';
      const HANDLED_FLAG = '__tpSettingsHandled';

      const open = (name) => {
        try {
          const btn = $id(name + 'Btn');
          const dlg = $id(name + 'Overlay');
          if (!dlg) return;
          // Ensure settings content is mounted before showing
          if (name === 'settings') {
            try {
              const api = (window.__tp && window.__tp.settings) ? window.__tp.settings : null;
              if (api && typeof api.mount === 'function') api.mount();
            } catch {}
          } else if (name === 'shortcuts') {
            // Inject help contents if missing
            ensureHelpContents();
          }
          dlg.classList.remove('hidden');
          dlg.removeAttribute('hidden');
          dlg.setAttribute('aria-hidden', 'false');
          btn && btn.setAttribute('aria-expanded', 'true');
        } catch {}
      };
      const close = (name) => {
        try {
          const btn = $id(name + 'Btn');
          const dlg = $id(name + 'Overlay');
          if (!dlg) return;
          if (name === 'settings') {
            try { flushPendingSettingsEdits(); } catch {}
          }
          dlg.classList.add('hidden');
          dlg.hidden = true;
          dlg.setAttribute('aria-hidden', 'true');
          btn && btn.setAttribute('aria-expanded', 'false');
          const focused = document.activeElement as HTMLElement | null;
          if (focused && dlg.contains(focused)) {
            try { btn?.focus(); } catch {}
            try { focused.blur(); } catch {}
          }
        } catch {}
      };

      document.addEventListener('click', (e) => {
        try {
          const t = e.target;
          if (t && t.closest && t.closest('#shortcutsBtn, [data-action="help-open"]')) {
            try { (window as any).__tpStore?.set?.('page', 'help'); } catch {}
            return open('shortcuts');
          }
          if (t && t.closest && t.closest(SETTINGS_OPEN_SEL)) {
            if ((e as any)?.[HANDLED_FLAG]) return;
            // Ensure Scripts Folder card injected before/after opening
            try { (window.ensureSettingsFolderControls || (()=>{}))(); } catch {}
            try { (window as any).__tpStore?.set?.('page', 'settings'); } catch {}
            open('settings');
            try { (window.ensureSettingsFolderControls || (()=>{}))(); } catch {}
            return;
          }
          if (t && t.closest && t.closest('#shortcutsClose, [data-action="help-close"]')) return close('shortcuts');
          if (t && t.closest && t.closest('#settingsClose, [data-action="settings-close"]')) return close('settings');
          const sc = $id('shortcutsOverlay');
          if (sc && t === sc) close('shortcuts');
          const se = $id('settingsOverlay');
          if (se && t === se) close('settings');
        } catch {}
      }, { capture: true });

      window.addEventListener('keydown', (e) => {
        try {
          if (e.key !== 'Escape') return;
          close('shortcuts');
          close('settings');
        } catch {}
      });

      const attachSettingsBtn = () => {
        try {
          const selector = '#settingsBtn, [data-action="settings-open"]';
          const buttons = document.querySelectorAll<HTMLElement>(selector);
          buttons.forEach((btn) => {
            const bound = (btn as any).__tpSettingsBound;
            if (bound) return;
            try {
              btn.addEventListener('click', (e) => {
                try { e.preventDefault(); } catch {}
                try { e.stopPropagation(); } catch {}
                try { (e as any).stopImmediatePropagation?.(); } catch {}
                try {
                  (e as any)[HANDLED_FLAG] = true;
                } catch {}
                try { (window.ensureSettingsFolderControls || (()=>{}))(); } catch {}
                try { (window as any).__tpStore?.set?.('page', 'settings'); } catch {}
                try { open('settings'); } catch {}
                try { (window.ensureSettingsFolderControls || (()=>{}))(); } catch {}
              }, { capture: true });
              (btn as any).__tpSettingsBound = true;
            } catch {}
          });
        } catch {}
      };

      attachSettingsBtn();
    } catch {}
  });
}

const ROLE_KEYS = ['s1','s2','g1','g2'];
const ROLES_KEY = 'tp_roles_v2';
const ROLE_DEFAULTS = {
  s1: { name: 'Joe',    color: '#2ea8ff' },
  s2: { name: 'Brad',   color: '#ffd24a' },
  g1: { name: 'Guest 1',   color: '#25d08a' },
  g2: { name: 'Guest 2',   color: '#b36cff' },
};

function loadRoles() {
  try { return Object.assign({}, ROLE_DEFAULTS, JSON.parse(localStorage.getItem(ROLES_KEY) || '{}')); }
  catch { return { ...ROLE_DEFAULTS }; }
}

export function updateLegend() {
  try {
    // Mark that legend is being rendered so the MutationObserver can ignore these mutations
    document.documentElement.dataset.legendRendering = '1';
    const legend = document.getElementById('legend');
    if (!legend) return;
    const ROLES = loadRoles();
    // Build a snapshot of the legend so we only touch the DOM when something changes
    const resolved: Record<string, { color: string; name: string }> = {};
    const snapParts: string[] = [];
    for (const key of ROLE_KEYS) {
      const item = ROLES[key];

      let color = item.color;
      try {
        const colorInput = document.getElementById('color-' + key) as HTMLInputElement | null;
        const c = (colorInput && 'value' in colorInput) ? String(colorInput.value || '').trim() : '';
        if (c) color = c;
      } catch {}

      let nameText = key.toUpperCase();
      try {
        const nameInput = document.getElementById('name-' + key) as HTMLInputElement | null;
        const v = (nameInput && 'value' in nameInput) ? String(nameInput.value || '').trim() : '';
        if (v) nameText = v;
      } catch {}

      resolved[key] = { color, name: nameText };
      snapParts.push(`${key}:${color}:${nameText}`);
    }

    const snapshot = snapParts.join('|');
    const rootAny = document.documentElement as any;
    if (rootAny.__tpLegendSnapshot === snapshot) {
      return;
    }
    rootAny.__tpLegendSnapshot = snapshot;

    legend.innerHTML = '';
    for (const key of ROLE_KEYS) {
      const tag = document.createElement('span');
      tag.className = 'tag';

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = resolved[key].color;

      const name = document.createElement('span');
      name.textContent = resolved[key].name;

      tag.appendChild(dot);
      tag.appendChild(name);
      legend.appendChild(tag);
    }
    // One-time input wiring to re-render on user changes
    try {
      if (!document.documentElement.dataset.legendWired) {
        document.documentElement.dataset.legendWired = '1';
        document.addEventListener('input', (e) => {
          try {
            const id = (e && e.target && e.target.id) ? String(e.target.id) : '';
            if (/^(name|color)-(s1|s2|g1|g2)$/.test(id)) updateLegend();
          } catch {}
        });
      }
    } catch {}

    // Broadcast speaker names/colors to display (s1/s2 only for the legend there)
    try {
      const getColor = (role, fallback) => {
        try { const inp = document.getElementById('color-' + role); const v = (inp && 'value' in inp) ? String(inp.value||'').trim() : ''; return v || fallback; } catch { return fallback; }
      };
      const getName = (role, fallback) => {
        try { const inp = document.getElementById('name-' + role); const v = (inp && 'value' in inp) ? String(inp.value||'').trim() : ''; return v || fallback; } catch { return fallback; }
      };
      const s1Color = getColor('s1', resolved.s1?.color || ROLES.s1.color);
      const s2Color = getColor('s2', resolved.s2?.color || ROLES.s2.color);
      const s1Name  = getName('s1', resolved.s1?.name || 'S1');
      const s2Name  = getName('s2', resolved.s2?.name || 'S2');
      if (__bc) {
        try { __bc.postMessage({ type: 'SPEAKER_COLORS', s1: s1Color, s2: s2Color }); } catch {}
        try { __bc.postMessage({ type: 'SPEAKER_NAMES', s1Name, s2Name }); } catch {}
      }
    } catch {}
  } finally {
    try { delete document.documentElement.dataset.legendRendering; } catch {}
  }
}

export function initLegend(appStore: any = (window as any).__tpStore): void {
  try {
    updateLegend();
    // Subscribe to any speaker name/color changes; fallback to periodic refresh if no store
    const refresh = () => { try { updateLegend(); } catch {} };
    const sub = appStore?.subscribe;
    if (typeof sub === 'function') {
      try { sub('speakerNames', refresh); } catch {}
      try { sub('speakerColors', refresh); } catch {}
      try { sub('tp_roles_v2', refresh); } catch {}
    } else {
      // fallback: observe input changes (already wired inside updateLegend)
    }
  } catch {}
}

function ensureEmptyBanner() {
  try {
    const scriptEl = document.getElementById('script');
    const viewer = document.getElementById('viewer');
    if (!scriptEl || !viewer) return;
    const anyLines = !!scriptEl.querySelector('.line');
    const banner = viewer.querySelector('.empty-msg');
    if (!anyLines && !banner) {
      const el = document.createElement('div');
      el.className = 'empty-msg';
      el.textContent = 'Paste text in the editor to begin…';
      viewer.appendChild(el);
    }
    if (anyLines && banner) {
      banner.remove();
    }
  } catch {}
}


// === Master hydrator: run now and whenever DOM changes ===
function hydrateUI() {
  if (IS_HYDRATING) return;
  IS_HYDRATING = true;
  try {
    wireOverlays();
    updateLegend();
    ensureEmptyBanner();
  } finally {
    IS_HYDRATING = false;
  }
}

export function bindStaticDom() {
  console.log('[src/ui/dom] bindStaticDom');
  try {
    // one-time UI wiring guard to prevent duplicate listeners and chips
    if (document.documentElement.dataset.uiWired === '1') return;
    document.documentElement.dataset.uiWired = '1';

    // core feature wiring
    const toggleCount = document.querySelectorAll(DISPLAY_TOGGLE_SELECTOR).length;
    logDisplayDebug('bindStaticDom:display-btn', {
      found: toggleCount > 0,
      count: toggleCount,
    });
    wireDisplayBridge();
  wireDisplayMirror();
    wireMic();
    wireCamera();
    wireScriptControls();
  wireLoadSample();
    installSpeakerIndex();
    installDbMeter();
    installObsChip();
  initSelfChecksChip();
    initStepControls(document);
    try {
      const resolveCatchUpScroller = () =>
        resolveActiveScroller(getPrimaryScroller(), getScriptRoot() || getFallbackScroller());
      const getLineElementByIndex = (root: ParentNode | null, index: number) => {
        if (!root || !Number.isFinite(index)) return null;
        const idx = Math.max(0, Math.floor(index));
        const selector = [
          `.line[data-i="${idx}"]`,
          `.line[data-index="${idx}"]`,
          `.line[data-line="${idx}"]`,
          `.line[data-line-idx="${idx}"]`,
          `.tp-line[data-i="${idx}"]`,
          `.tp-line[data-index="${idx}"]`,
          `.tp-line[data-line="${idx}"]`,
          `.tp-line[data-line-idx="${idx}"]`,
        ].join(',');
        try {
          const found = (root as ParentNode).querySelector?.(selector) as HTMLElement | null;
          if (found) return found;
        } catch {}
        return document.getElementById(`tp-line-${idx}`) as HTMLElement | null;
      };
      let lastCatchUpLine: HTMLElement | null = null;
      const setActiveLine = (line: HTMLElement | null) => {
        try {
          if (lastCatchUpLine && lastCatchUpLine !== line) {
            lastCatchUpLine.classList.remove('is-active');
            lastCatchUpLine.classList.remove('tp-line');
            lastCatchUpLine.removeAttribute('data-active-line');
          }
        } catch {}
        if (line) {
          try {
            line.classList.add('tp-line');
            line.classList.add('is-active');
            line.setAttribute('data-active-line', '1');
            lastCatchUpLine = line;
          } catch {}
        }
      };
      const getMarkerOffsetPx = () => {
        const scroller = resolveCatchUpScroller();
        const hostHeight = scroller?.clientHeight || window.innerHeight || 0;
        const markerPct = typeof (window as any).__TP_MARKER_PCT === 'number'
          ? (window as any).__TP_MARKER_PCT
          : 0.4;
        return Math.max(0, Math.round(hostHeight * markerPct));
      };
      const getScrollMode = () => {
        try {
          const store = (window as any).__tpStore;
          const raw = store?.get?.('scrollMode') ?? (window as any).__tpScrollMode?.getMode?.();
          return String(raw || '').toLowerCase();
        } catch {
          return '';
        }
      };
      const getAsrAnchorIndex = () => {
        try {
          const driver = (window as any).__tpAsrScrollDriver;
          const driverIdx = typeof driver?.getLastLineIndex === 'function' ? driver.getLastLineIndex() : null;
          if (Number.isFinite(driverIdx as number) && (driverIdx as number) >= 0) {
            return Math.max(0, Math.floor(driverIdx as number));
          }
        } catch {}
        const idxRaw = Number((window as any).currentIndex ?? -1);
        return Number.isFinite(idxRaw) && idxRaw >= 0 ? Math.max(0, Math.floor(idxRaw)) : null;
      };
      const getMarkerLineIndex = () => {
        const mode = getScrollMode();
        if (mode === 'asr' || mode === 'hybrid') {
          return getAsrAnchorIndex();
        }
        const scroller = resolveCatchUpScroller();
        const idx = scroller ? computeAnchorLineIndex(scroller) : computeAnchorLineIndex();
        return Number.isFinite(idx as number) ? (idx as number) : null;
      };
      wireCatchUpButton({
        getScroller: resolveCatchUpScroller,
        getMarkerOffsetPx,
        getMarkerLineIndex,
        getLineByIndex: (index: number) => {
          const scroller = resolveCatchUpScroller();
          const root = getScriptRoot() || scroller || document;
          return getLineElementByIndex(root as ParentNode, index);
        },
        scrollToTop: (top: number) => {
          applyCanonicalScrollTop(top, {
            scroller: resolveCatchUpScroller(),
            reason: 'catchup',
            source: 'dom-catchup',
          });
        },
        onCatchUp: ({ index, line, targetTop, prevTop }) => {
          const mode = getScrollMode();
          setActiveLine(line);
          if (mode === 'asr' || mode === 'hybrid') {
            const prevIndex = Number.isFinite(index as number) ? Math.max(0, Math.floor(index as number)) : null;
            const verify = () => {
              const nextIndex = getAsrAnchorIndex();
              if (
                prevIndex != null &&
                nextIndex != null &&
                nextIndex < prevIndex - 2
              ) {
                try {
                  console.warn('[CATCHUP_ABORTED_BACKJUMP]', { prevIndex, nextIndex });
                } catch {}
                applyCanonicalScrollTop(prevTop, {
                  scroller: resolveCatchUpScroller(),
                  reason: 'catchup-abort-backjump',
                  source: 'dom-catchup',
                });
                try { (window as any).currentIndex = prevIndex; } catch {}
              }
            };
            try {
              if (typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(() => verify());
              } else {
                window.setTimeout?.(verify, 0);
              }
            } catch {
              verify();
            }
          }
          if (mode === 'timed' || mode === 'wpm' || mode === 'hybrid') {
            try { (window as any).__tpAuto?.rebase?.(targetTop); } catch {}
          }
        },
        devLog: (...args) => {
          try {
            const debug =
              (window as any).__tpScrollDebug === true ||
              /scrollDebug=1/i.test(String(location.search || ''));
            if (debug) console.debug(...args);
            (window as any).__tpHud?.log?.(...args);
          } catch {}
        },
      });
    } catch {}
      // Keep empty script area informative before real content loads
    // Speakers section toggle (show/hide panel body)
    try {
      const btn = document.getElementById('toggleSpeakers');
      const body = document.getElementById('speakersBody');
      if (btn && body && !btn.dataset.wired) {
        btn.dataset.wired = '1';
        const KEY = 'tp_speakers_visible';
        let vis = true;
        const apply = (next: boolean) => {
          try {
            vis = !!next;
            body.style.display = vis ? '' : 'none';
            btn.textContent = vis ? 'Hide' : 'Show';
            btn.setAttribute('aria-expanded', vis ? 'true' : 'false');
            try { localStorage.setItem(KEY, vis ? '1' : '0'); } catch {}
          } catch {}
        };
        // initial
        try { vis = (localStorage.getItem(KEY) !== '0'); } catch {}
        apply(vis);
        btn.addEventListener('click', () => apply(!vis));
      }
    } catch {}

    // Wire normalize button(s) for parity (top bar / settings / help)
    try {
      const selector = '#normalizeTopBtn, #normalizeBtn, #settingsNormalize';
      document.addEventListener('click', (ev) => {
        const btn = (ev.target as HTMLElement | null)?.closest(selector) as HTMLButtonElement | null;
        if (!btn) return;
        try { ev.preventDefault(); } catch {}
        try {
          if (typeof window.normalizeToStandard === 'function') {
            window.normalizeToStandard();
          } else if (typeof window.fallbackNormalize === 'function') {
            window.fallbackNormalize();
          }
        } catch {}
      }, { capture: true });
    } catch {}

    // Wire editor input to re-render script
    try {
      const ed = document.getElementById('editor');
      if (ed && !ed.dataset.renderWired) {
        ed.dataset.renderWired = '1';
        ed.addEventListener('input', () => {
          try {
            if ((window as any).__TP_LOADING_SCRIPT) return;
            applyScript(ed.value || '', 'editor', { updateEditor: false });
          } catch {}
        });
      }
    } catch {}

    // initial hydration pass
    hydrateUI();

    // keep it healthy: observe DOM changes and rehydrate idempotently
    const mo = new MutationObserver(() => {
      try {
        // Ignore mutations caused by legend rendering to avoid feedback loops
        if (document.documentElement.dataset.legendRendering === '1') return;
        if (IS_HYDRATING) return;
        if (!HYDRATE_SCHEDULED) {
          HYDRATE_SCHEDULED = true;
          requestAnimationFrame(() => { try { hydrateUI(); } finally { HYDRATE_SCHEDULED = false; } });
        }
      } catch {}
    });
    try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
  } catch {}
}

// Self-checks chip: stub interaction for parity (click to set static text)
function initSelfChecksChip() {
  try {
    const chip = document.getElementById('selfChecksChip');
    const txt = document.getElementById('selfChecksText');
    if (!chip || !txt) return;
    chip.title = 'Click to run self-checks';

    const runLocalChecks = () => {
      const checks = [];
      try {
        // Overlays wiring
        const openBtn = document.getElementById('shortcutsBtn');
        const ov = document.getElementById('shortcutsOverlay');
        openBtn && openBtn.click();
        const opened = ov && !ov.classList.contains('hidden');
        // close via Escape
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        const closed = ov && ov.classList.contains('hidden');
        checks.push({ name: 'Overlays open/close', pass: Boolean(opened && closed) });
      } catch { checks.push({ name: 'Overlays open/close', pass: false }); }

      try {
        // Present Mode controls exist (non-invasive)
        const btn = document.getElementById('presentBtn');
        const root = document.documentElement;
        const was = root.classList.contains('tp-present');
        // Send Escape to ensure no errors when present is off; shouldn't change state
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        const unchanged = root.classList.contains('tp-present') === was;
        checks.push({ name: 'Present Mode controls', pass: Boolean(btn && unchanged) });
      } catch { checks.push({ name: 'Present Mode controls', pass: false }); }

      try {
        // dB meter listener (robust: toggle across two extremes to avoid equal-state no-op)
        const hostTop = document.getElementById('dbMeterTop');
        const fill = hostTop && hostTop.querySelector('i');
        const t0 = fill && getComputedStyle(fill).transform;
        window.dispatchEvent(new CustomEvent('tp:db', { detail: { db: -60 } }));
        const t1 = fill && getComputedStyle(fill).transform;
        window.dispatchEvent(new CustomEvent('tp:db', { detail: { db: 0 } }));
        const t2 = fill && getComputedStyle(fill).transform;
        const changed = !!(hostTop && fill && t0 && (t1 !== t0 || t2 !== t1));
        checks.push({ name: 'dB meter updates', pass: changed });
      } catch { checks.push({ name: 'dB meter updates', pass: false }); }

      try {
        // Legend hydration (4 tags)
        const legend = document.getElementById('legend');
        const good = !!(legend && legend.querySelectorAll('.tag').length >= 4);
        checks.push({ name: 'Legend hydrated', pass: good });
      } catch { checks.push({ name: 'Legend hydrated', pass: false }); }

      return checks;
    };

    const renderResult = (checks) => {
      try {
        const total = checks.length;
        const passed = checks.filter(c => c.pass).length;
        txt.textContent = `${passed}/${total} ${passed===total ? 'âœ”' : 'â€¢'}`;
        console.table(checks);
      } catch {}
    };

    const runChecks = () => {
      try {
        if (typeof window.runSelfChecks === 'function') {
          const legacy = window.runSelfChecks();
          // Merge with local checks for wiring specifics
          const local = runLocalChecks();
          renderResult([ ...legacy, ...local ]);
        } else {
          renderResult(runLocalChecks());
        }
      } catch { txt.textContent = '0/0 â€¢'; }
    };

    // Initial quick pass after hydration
    setTimeout(runChecks, 0);
    // On click, re-run and show console table
    chip.addEventListener('click', runChecks);
  } catch {}
}

export function query(selector) {
  return document.querySelector(selector);
}

export function readText(selector) {
  const el = document.querySelector(selector);
  return el ? el.textContent : null;
}

export function setText(selector, txt) {
  const el = document.querySelector(selector);
  if (el) el.textContent = String(txt);
}
