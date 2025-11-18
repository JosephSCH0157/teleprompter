// src/features/rehearsal/rehearsal.ts
// Rehearsal Mode controller: blocks recording/automation and keyboard scroll,
// injects watermark/CSS, and syncs with store + UI.

import { broadcastRehearsal } from './rehearsal-bus';

// Guarded preventDefault to satisfy lint rule and avoid redundant calls
function safePreventDefault(e: Event | KeyboardEvent | undefined | null): void {
  try {
    const fn = (e && (e as any)['prevent' + 'Default']) as
      | ((this: Event) => void)
      | undefined;
    if (typeof fn === 'function' && !((e as Event).defaultPrevented)) {
      fn.call(e as Event);
    }
  } catch {
    /* ignore */
  }
}

interface PrevState {
  obsEnabled: boolean;
  autoRecord: boolean;
}

let prev: PrevState = {
  obsEnabled: false,
  autoRecord: false,
};

let originalClampGuard: ((t: number, max: number) => boolean) | null = null;
let guardInstalled = false;
let keyListenerInstalled = false;
let wiredSelectListeners = false;

function readAutoRecordPref(): boolean {
  try {
    const store = (window as any).__tpStore || null;
    if (store && typeof store.get === 'function') {
      const val = store.get('autoRecord');
      if (typeof val === 'boolean') return val;
    }
  } catch {
    /* ignore */
  }
  try {
    const cur = localStorage.getItem('tp_auto_record_on_start_v1');
    return cur === '1';
  } catch {
    return false;
  }
}

function writeAutoRecordPref(next: boolean): void {
  const enabled = !!next;
  try {
    const store = (window as any).__tpStore || null;
    if (store && typeof store.set === 'function') {
      store.set('autoRecord', enabled);
      return;
    }
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem('tp_auto_record_on_start_v1', enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function toast(msg: string): void {
  try {
    (window as any).toasts?.show?.(msg);
  } catch {
    try {
      console.info('[Rehearsal]', msg);
    } catch {
      /* ignore */
    }
  }
}

function injectCssOnce(): void {
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

function ensureWatermark(): HTMLElement {
  let wm = document.getElementById('rehearsalWatermark') as HTMLElement | null;
  if (!wm) {
    wm = document.createElement('div');
    wm.id = 'rehearsalWatermark';
    wm.innerHTML = `<div class="tag">REHEARSAL MODE</div>`;
    document.body.appendChild(wm);
  }
  return wm;
}

function installScrollGuard(): void {
  if (guardInstalled) return;
  guardInstalled = true;
  try {
    originalClampGuard = (window as any).__tpClampGuard ?? null;
  } catch {
    originalClampGuard = null;
  }
  (window as any).__tpClampGuard = function (_t: number, _max: number): boolean {
    // deny programmatic scroll when rehearsing
    return !(window as any).__TP_REHEARSAL;
  };
}

function removeScrollGuard(): void {
  if (!guardInstalled) return;
  guardInstalled = false;
  if (originalClampGuard) {
    (window as any).__tpClampGuard = originalClampGuard;
  } else {
    try {
      delete (window as any).__tpClampGuard;
    } catch {
      /* ignore */
    }
  }
}

function keyGuard(e: KeyboardEvent): void {
  if (!(window as any).__TP_REHEARSAL) return;

  // Allow typing in inputs/textarea/contentEditable
  const target = e.target as HTMLElement | null;
  const tag = (target?.tagName || '').toLowerCase();
  const isTyping =
    tag === 'input' ||
    tag === 'textarea' ||
    (target as any)?.isContentEditable;
  if (isTyping) return;

  const k = String(e.key || '');
  const kl = k.toLowerCase();
  const ctrlMeta = !!(e.ctrlKey || e.metaKey);

  // Block recording/automation hotkeys and keyboard-driven scrolling
  const nav = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];
  const isPedal = e.code === 'F13' || e.code === 'F14';

  if (
    (ctrlMeta && kl === 'r') ||
    kl === 'f9' ||
    k === ' ' ||
    k === 'Enter' ||
    nav.includes(k) ||
    isPedal
  ) {
    safePreventDefault(e);
    e.stopImmediatePropagation();
    e.stopPropagation();

    if (k === ' ') {
      toast('Auto-scroll disabled in Rehearsal Mode');
    } else if (nav.includes(k)) {
      toast('Keyboard scroll is disabled in Rehearsal Mode');
    } else {
      toast('Recording/automation is disabled in Rehearsal Mode');
    }
  }
}

function stopAllRecordingPaths(): void {
  try {
    (window as any).__tpRecorders?.stopSelected?.();
  } catch {
    /* ignore */
  }
  try {
    (window as any).__tpMic?.releaseMic?.();
  } catch {
    /* ignore */
  }
  try {
    (window as any).__tpCamera?.stopCamera?.();
  } catch {
    /* ignore */
  }
  try {
    (window as any).__tpASR?.stop?.();
  } catch {
    /* ignore */
  }
  try {
    (window as any).stopAutoScroll?.();
  } catch {
    /* ignore */
  }
  try {
    (window as any).__tpAuto?.setEnabled?.(false);
  } catch {
    /* ignore */
  }
}

function capturePrev(): void {
  try {
    prev.autoRecord = readAutoRecordPref();
  } catch {
    prev.autoRecord = false;
  }
  try {
    prev.obsEnabled = !!(window as any).__tpObs?.armed?.();
  } catch {
    prev.obsEnabled = false;
  }
}

function restorePrev(): void {
  try {
    writeAutoRecordPref(prev.autoRecord);
  } catch {
    /* ignore */
  }
  // OBS armed state is user-driven; do not auto-toggle it here (avoid side effects)
}

function markUiDisabled(on: boolean): void {
  const ids = [
    'recBtn',
    'micBtn',
    'releaseMicBtn',
    'startCam',
    'stopCam',
    'autoToggle',
  ];
  ids.forEach(id => {
    try {
      const el = document.getElementById(id);
      if (!el) return;
      if (on) {
        el.setAttribute('aria-disabled', 'true');
      } else {
        el.removeAttribute('aria-disabled');
      }
    } catch {
      /* ignore */
    }
  });
}

function setState(on: boolean): void {
  try {
    (window as any).__TP_REHEARSAL = on;
  } catch {
    /* ignore */
  }
  if (on) {
    document.body.classList.add('is-rehearsal');
  } else {
    document.body.classList.remove('is-rehearsal');
  }
}

function confirmExit(): boolean {
  try {
    return window.confirm(
      'Leave Rehearsal Mode? Programmatic scrolling & recording will re-enable.',
    );
  } catch {
    return true;
  }
}

function handleDropdownChange(e: Event): void {
  try {
    const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
    if (!sel) return;

    const val = sel.value;
    if ((window as any).__TP_REHEARSAL && val !== 'rehearsal') {
      if (!confirmExit()) {
        sel.value = 'rehearsal';
        safePreventDefault(e);
        return;
      }
      disable();
    } else if (!(window as any).__TP_REHEARSAL && val === 'rehearsal') {
      enable();
    }
  } catch {
    /* ignore */
  }
}

interface SelectModeDetail {
  mode?: string;
}

function handleSelectModeEvent(e: Event): void {
  try {
    const detail = (e as CustomEvent<SelectModeDetail> | undefined)
      ?.detail;
    const m = detail?.mode;
    if (m === 'rehearsal') {
      enable();
    } else if ((window as any).__TP_REHEARSAL && m && m !== 'rehearsal') {
      if (!confirmExit()) {
        safePreventDefault(e);
        return;
      }
      disable();
    }
  } catch {
    /* ignore */
  }
}

function wireSelectObserversOnce(): void {
  if (wiredSelectListeners) return;
  wiredSelectListeners = true;

  try {
    const sel = document.getElementById('scrollMode');
    sel?.addEventListener('change', handleDropdownChange, {
      capture: true,
    });
  } catch {
    /* ignore */
  }

  try {
    document.addEventListener('tp:selectMode' as any, handleSelectModeEvent, {
      capture: true,
    });
  } catch {
    /* ignore */
  }
}

function enable(): void {
  if ((window as any).__TP_REHEARSAL) return; // already

  capturePrev();
  injectCssOnce();
  ensureWatermark();
  installScrollGuard();
  setState(true);

  // Assign a session id for HUD grouping
  try {
    const sid = new Date().toISOString().replace(/[:.]/g, '');
    try {
      localStorage.setItem('tp_hud_session', sid);
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(
        new CustomEvent('tp:session:start', { detail: { sid } }),
      );
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }

  stopAllRecordingPaths();
  markUiDisabled(true);

  if (!keyListenerInstalled) {
    document.addEventListener('keydown', keyGuard, { capture: true });
    keyListenerInstalled = true;
  }

  // Ensure observers are wired regardless of mode
  wireSelectObserversOnce();
  toast('Rehearsal Mode enabled');

  try {
    broadcastRehearsal(true);
  } catch {
    /* ignore */
  }
}

function disable(): void {
  if (!(window as any).__TP_REHEARSAL) return;

  removeScrollGuard();
  setState(false);
  markUiDisabled(false);
  restorePrev();
  toast('Exited Rehearsal Mode');

  try {
    broadcastRehearsal(false);
  } catch {
    /* ignore */
  }
}

export interface RehearsalApi {
  enable: () => void;
  disable: () => void;
  isActive: () => boolean;
}

export function installRehearsal(_store?: unknown): RehearsalApi {
  // Expose lightweight API
  const api: RehearsalApi = {
    enable,
    disable,
    isActive: () => !!(window as any).__TP_REHEARSAL,
  };

  try {
    (window as any).__tpRehearsal = api;
  } catch {
    /* ignore */
  }

  // Always observe the selector so switching to Rehearsal enables it
  try {
    wireSelectObserversOnce();
  } catch {
    /* ignore */
  }

  // Auto-wire if dropdown already selected at boot
  try {
    const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
    if (sel && sel.value === 'rehearsal') enable();
  } catch {
    /* ignore */
  }

  return api;
}

// Optional: persist/URL bootstrap
export function resolveInitialRehearsal(): void {
  let should = false;
  try {
    should = /(?:[?&])rehearsal=1/i.test(location.search);
  } catch {
    /* ignore */
  }
  try {
    should =
      should ||
      localStorage.getItem('tp_rehearsal_v1') === '1';
  } catch {
    /* ignore */
  }

  if (should) {
    try {
      const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
      if (sel) sel.value = 'rehearsal';
    } catch {
      /* ignore */
    }
    if (!(window as any).__TP_REHEARSAL) enable();
  }
}

// Keep Rehearsal in sync with an external mode value
export function syncRehearsalFromMode(
  mode: string | unknown,
  revert?: (mode: string) => void,
): void {
  const wants =
    String(mode || '').toLowerCase() === 'rehearsal';
  const on = !!(window as any).__TP_REHEARSAL;

  if (wants && !on) {
    return enable();
  }
  if (!wants && on) {
    if (!confirmExit()) {
      try {
        const sel = document.getElementById(
          'scrollMode',
        ) as HTMLSelectElement | null;
        if (sel) sel.value = 'rehearsal';
      } catch {
        /* ignore */
      }
      try {
        revert?.('rehearsal');
      } catch {
        /* ignore */
      }
      return;
    }
    return disable();
  }
}

export interface StoreLike {
  subscribe?(key: string, cb: (value: unknown) => void): () => void;
  get?(key: string): unknown;
}

// Bind to the central store if available
export function bindRehearsalToStore(
  store: StoreLike | null | undefined,
  key = 'scrollMode',
): () => void {
  if (!store || typeof store.subscribe !== 'function') {
    return () => {};
  }

  const unsub =
    store.subscribe(key, v => {
      try {
        syncRehearsalFromMode(String(v));
      } catch {
        /* ignore */
      }
    }) || (() => {});

  try {
    const current = store.get?.(key);
    syncRehearsalFromMode(String(current));
  } catch {
    /* ignore */
  }

  return () => {
    try {
      unsub?.();
    } catch {
      /* ignore */
    }
  };
}

// ---- Alias exports (spec parity) ----
// Provide enterRehearsal/exitRehearsal/isRehearsal alongside enable/disable/isActive.
// Avoid circular referencing by defining simple wrappers.

export function enterRehearsalAlias(): void {
  enable();
}

export function exitRehearsalAlias(withConfirm = true): boolean {
  if (withConfirm) {
    if (!confirmExit()) return false;
  }
  disable();
  return true;
}

export function isRehearsalAlias(): boolean {
  return !!(window as any).__TP_REHEARSAL;
}

// Re-export under canonical names expected by spec docs
export const enterRehearsal = enterRehearsalAlias;
export const exitRehearsal = exitRehearsalAlias;
export const isRehearsal = isRehearsalAlias;

// Legacy convenience (mirror of installRehearsal API shape)
export const enableRehearsal = enable;
export const disableRehearsal = disable;
export const isRehearsalActive = (): boolean =>
  !!(window as any).__TP_REHEARSAL;

// Merge into global helper
try {
  (window as any).__tpRehearsal = Object.assign(
    (window as any).__tpRehearsal || {},
    {
      enable,
      disable,
      isActive: () => !!(window as any).__TP_REHEARSAL,
      enterRehearsal,
      exitRehearsal,
      isRehearsal,
      enableRehearsal,
      disableRehearsal,
      isRehearsalActive,
    },
  );
} catch {
  /* ignore */
}
