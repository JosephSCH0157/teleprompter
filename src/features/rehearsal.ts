import { broadcastRehearsal } from './rehearsal-bus';
// src/features/rehearsal.ts
// Rehearsal Mode: safe practice state with manual scroll only and no recording
// - Disables OBS/recorders, mic, and camera
// - Blocks programmatic scrolling (ASR/WPM/auto) via __tpClampGuard
// - Adds watermark + subtle tinting
// - Exit confirmation when switching away via the existing dropdown
export type Store = {
  get: (_k: string) => any;
  set: (_k: string, _v: any) => void;
  subscribe?: (_k: string, _fn: (_v: any) => void) => () => void;
};

let prev = {
  obsEnabled: false,
  autoRecord: false,
};

let originalClampGuard: ((_t: number, _max: number) => boolean) | null = null;
let guardInstalled = false;
let keyListenerInstalled = false;
let wiredSelectListeners = false;

function toast(msg: string) {
  try { (window as any).toasts?.show?.(msg); }
  catch { try { console.info('[Rehearsal]', msg); } catch {} }
}

function injectCssOnce() {
  if (document.getElementById('rehearsal-css')) return;
  const st = document.createElement('style');
  st.id = 'rehearsal-css';
  st.textContent = `
  /* Rehearsal Mode visuals */
  body.is-rehearsal .viewer{ filter:saturate(.95) brightness(.98); }
  body.is-rehearsal .topbar{ background:linear-gradient(180deg,rgba(255,200,0,.05),transparent); }
  #rehearsalWatermark{ position:fixed; inset:0; pointer-events:none; display:none; align-items:center; justify-content:center; z-index:2147483000; }
  #rehearsalWatermark .tag{ font:700 clamp(24px,8vw,80px)/1.05 system-ui,Segoe UI,Roboto,Arial,sans-serif; color:#fff; opacity:.12; letter-spacing:.08em; text-transform:uppercase; padding:.4em .6em; border-radius:16px; }
  body.is-rehearsal #rehearsalWatermark{ display:flex; }
  body.is-rehearsal [data-role=start-rec],
  body.is-rehearsal #startRecBtn,
  body.is-rehearsal #recBtn,
  body.is-rehearsal #micBtn,
  body.is-rehearsal #releaseMicBtn,
  body.is-rehearsal #startCam,
  body.is-rehearsal #stopCam,
  body.is-rehearsal #autoToggle,
  body.is-rehearsal [data-role=enable-asr]{ opacity:.5; pointer-events:none; }
  `;
  document.head.appendChild(st);
}

function ensureWatermark() {
  let wm = document.getElementById('rehearsalWatermark');
  if (!wm) {
    wm = document.createElement('div');
    wm.id = 'rehearsalWatermark';
    wm.innerHTML = `<div class="tag">REHEARSAL MODE</div>`;
    document.body.appendChild(wm);
  }
  return wm as HTMLElement;
}

function installScrollGuard() {
  if (guardInstalled) return;
  guardInstalled = true;
  try { originalClampGuard = (window as any).__tpClampGuard ?? null; } catch {}
  (window as any).__tpClampGuard = function (_t: number, _max: number) {
    // deny programmatic scroll when rehearsing
    return !(window as any).__TP_REHEARSAL;
  };
}

function removeScrollGuard() {
  if (!guardInstalled) return;
  guardInstalled = false;
  if (originalClampGuard) (window as any).__tpClampGuard = originalClampGuard;
  else try { delete (window as any).__tpClampGuard; } catch {}
}

function keyGuard(e: KeyboardEvent) {
  if (!(window as any).__TP_REHEARSAL) return;
  // Allow typing in inputs/textarea/contentEditable
  const target = e.target as HTMLElement | null;
  const tag = (target?.tagName || '').toLowerCase();
  const isTyping = tag === 'input' || tag === 'textarea' || (target as any)?.isContentEditable;
  if (isTyping) return;
  const k = String(e.key || '');
  const kl = k.toLowerCase();
  const ctrlMeta = !!(e.ctrlKey || e.metaKey);
  // Block recording/automation hotkeys and keyboard-driven scrolling
  const nav = ['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'];
  const isPedal = (e.code === 'F13' || e.code === 'F14');
  if ((ctrlMeta && kl === 'r') || kl === 'f9' || k === ' ' || k === 'Enter' || nav.includes(k) || isPedal) {
    e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
    if (k === ' ') toast('Auto-scroll disabled in Rehearsal Mode');
    else if (nav.includes(k)) toast('Keyboard scroll is disabled in Rehearsal Mode');
    else toast('Recording/automation is disabled in Rehearsal Mode');
  }
}

function stopAllRecordingPaths() {
  try { (window as any).__tpRecorders?.stopSelected?.(); } catch {}
  try { (window as any).__tpMic?.releaseMic?.(); } catch {}
  try { (window as any).__tpCamera?.stopCamera?.(); } catch {}
  try { (window as any).__tpASR?.stop?.(); } catch {}
  try { (window as any).stopAutoScroll?.(); } catch {}
  try { (window as any).__tpAuto?.setEnabled?.(false); } catch {}
}

function capturePrev() {
  try { prev.autoRecord = !!(localStorage.getItem('tp_auto_record_on_start_v1') === '1'); } catch {}
  try { prev.obsEnabled = !!(window as any).__tpObs?.armed?.(); } catch {}
}

function restorePrev() {
  try {
    if (prev.autoRecord) localStorage.setItem('tp_auto_record_on_start_v1','1');
    else localStorage.removeItem('tp_auto_record_on_start_v1');
  } catch {}
  // OBS armed state is user-driven; do not auto-toggle it here (avoid side effects)
}

function markUiDisabled(on: boolean) {
  const ids = ['recBtn','micBtn','releaseMicBtn','startCam','stopCam','autoToggle'];
  ids.forEach(id => {
    try {
      const el = document.getElementById(id);
      if (el) {
        if (on) { el.setAttribute('aria-disabled','true'); }
        else { el.removeAttribute('aria-disabled'); }
      }
    } catch {}
  });
}

function setState(on: boolean) {
  try { (window as any).__TP_REHEARSAL = on; } catch {}
  if (on) document.body.classList.add('is-rehearsal');
  else document.body.classList.remove('is-rehearsal');
}

function confirmExit(): boolean {
  try {
    return window.confirm('Leave Rehearsal Mode? Programmatic scrolling & recording will re-enable.');
  } catch { return true; }
}

function handleDropdownChange(e?: Event) {
  try {
    const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
    if (!sel) return;
    const val = sel.value;
    if ((window as any).__TP_REHEARSAL && val !== 'rehearsal') {
      if (!confirmExit()) {
        sel.value = 'rehearsal';
        e?.preventDefault();
        return;
      }
      disable();
    } else if (!(window as any).__TP_REHEARSAL && val === 'rehearsal') {
      enable();
    }
  } catch {}
}

function handleSelectModeEvent(e: any) {
  try {
    const m = e?.detail?.mode;
    if (m === 'rehearsal') enable();
    else if ((window as any).__TP_REHEARSAL && m && m !== 'rehearsal') {
      if (!confirmExit()) { e.preventDefault?.(); return; }
      disable();
    }
  } catch {}
}

function wireSelectObserversOnce() {
  if (wiredSelectListeners) return;
  wiredSelectListeners = true;
  try {
    const sel = document.getElementById('scrollMode');
    sel?.addEventListener('change', handleDropdownChange, { capture: true });
  } catch {}
  try { document.addEventListener('tp:selectMode', handleSelectModeEvent as any, { capture: true }); } catch {}
}

function enable() {
  if ((window as any).__TP_REHEARSAL) return; // already
  capturePrev();
  injectCssOnce();
  ensureWatermark();
  installScrollGuard();
  setState(true);
  // Assign a session id for HUD grouping
  try {
    const sid = new Date().toISOString().replace(/[:.]/g,'');
    try { localStorage.setItem('tp_hud_session', sid); } catch {}
    try { window.dispatchEvent(new CustomEvent('tp:session:start',{ detail:{ sid } })); } catch {}
  } catch {}
  stopAllRecordingPaths();
  markUiDisabled(true);
  if (!keyListenerInstalled) {
    document.addEventListener('keydown', keyGuard, { capture: true });
    keyListenerInstalled = true;
  }
  // Ensure observers are wired regardless of mode
  wireSelectObserversOnce();
  toast('Rehearsal Mode enabled');
  try { broadcastRehearsal(true); } catch {}
}

function disable() {
  if (!(window as any).__TP_REHEARSAL) return;
  removeScrollGuard();
  setState(false);
  markUiDisabled(false);
  restorePrev();
  toast('Exited Rehearsal Mode');
  try { broadcastRehearsal(false); } catch {}
}

export function installRehearsal(_store?: Store) {
  // Expose lightweight API
  const api = { enable, disable, isActive: () => !!(window as any).__TP_REHEARSAL };
  try { (window as any).__tpRehearsal = api; } catch {}
  // Always observe the selector so switching to Rehearsal enables it
  try { wireSelectObserversOnce(); } catch {}
  // Auto-wire if dropdown already selected at boot
  try {
    const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
    if (sel && sel.value === 'rehearsal') enable();
  } catch {}
  return api;
}

// Optional: persist/URL bootstrap
export function resolveInitialRehearsal() {
  let should = false;
  try { should = /(?:[?&])rehearsal=1/i.test(location.search); } catch {}
  try { should = should || localStorage.getItem('tp_rehearsal_v1') === '1'; } catch {}
  if (should) {
    try {
      try { (window as any).__tpMode?.set?.('rehearsal'); } catch {}
      const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
      if (sel) sel.value = 'rehearsal';
    } catch {}
    if (!(window as any).__TP_REHEARSAL) enable();
  }
}

// Keep Rehearsal in sync with an external mode value
export function syncRehearsalFromMode(mode: string, revert?: (_prevMode: string)=>void) {
  const wants = String(mode || '').toLowerCase() === 'rehearsal';
  const on = !!(window as any).__TP_REHEARSAL;
  if (wants && !on) return enable();
  if (!wants && on) {
    if (!confirmExit()) {
      try { const sel = document.getElementById('scrollMode') as HTMLSelectElement | null; if (sel) sel.value = 'rehearsal'; } catch {}
      try { revert?.('rehearsal'); } catch {}
      return;
    }
    return disable();
  }
}

// Bind to the central store if available
export function bindRehearsalToStore(store: Store, key = 'scrollMode') {
  if (!store || typeof store.subscribe !== 'function') return () => {};
  const unsub = store.subscribe(key, (v: any) => {
    try { syncRehearsalFromMode(String(v)); } catch {}
  });
  try { syncRehearsalFromMode(String(store.get(key))); } catch {}
  return () => { try { unsub?.(); } catch {} };
}

// ---- Alias exports (spec parity) ----
// Provide enterRehearsal/exitRehearsal/isRehearsal alongside enable/disable/isActive.
// Avoid circular referencing by defining simple wrappers.
export function enterRehearsalAlias() { enable(); }
export function exitRehearsalAlias(withConfirm = true) { if (withConfirm) { if (!confirmExit()) return false; } disable(); return true; }
export function isRehearsalAlias() { return !!(window as any).__TP_REHEARSAL; }

// Re-export under canonical names expected by spec docs
export const enterRehearsal = enterRehearsalAlias;
export const exitRehearsal = exitRehearsalAlias;
export const isRehearsal = isRehearsalAlias;

// Legacy convenience (mirror of installRehearsal API shape)
export const enableRehearsal = enable;
export const disableRehearsal = disable;
export const isRehearsalActive = () => !!(window as any).__TP_REHEARSAL;

// Merge into global helper
try {
  (window as any).__tpRehearsal = Object.assign((window as any).__tpRehearsal || {}, {
    enable,
    disable,
    isActive: () => !!(window as any).__TP_REHEARSAL,
    enterRehearsal,
    exitRehearsal,
    isRehearsal,
    enableRehearsal,
    disableRehearsal,
    isRehearsalActive,
  });
} catch {}
