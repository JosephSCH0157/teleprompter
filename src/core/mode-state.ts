import type { ScrollMode } from '../scroll-router';

type Listener = (mode: ScrollMode) => void;

// Internal state
let mode: ScrollMode = 'manual';
const listeners = new Set<Listener>();

// Persistence helpers (cookie + localStorage)
const COOKIE_KEY = 'tp_scroll_mode';
const LS_KEY = 'tp_scroll_mode';

function getCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

function setCookie(name: string, value: string, days = 365) {
  try {
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
  } catch {}
}

function lsGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k: string, v: string): void { try { localStorage.setItem(k, v); } catch {} }

// Read initial persisted value (cookie wins; fallback to LS)
export function hydratePersistedMode(validValues?: string[]): ScrollMode {
  const saved = getCookie(COOKIE_KEY) || lsGet(LS_KEY);
  // Validate against provided options if present
  if (saved && (!validValues || validValues.includes(saved))) {
    mode = saved as ScrollMode;
  }
  // Try DOM select if nothing persisted
  if (!saved) {
    try {
      const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
      if (sel?.value) mode = sel.value as ScrollMode;
    } catch {}
  }
  return mode;
}

export function getMode(): ScrollMode { return mode; }

export function setMode(next: ScrollMode): void {
  if (!next || next === mode) { emitMode(false); return; }
  mode = next;
  // Persist
  setCookie(COOKIE_KEY, mode);
  lsSet(LS_KEY, mode);
  // Reflect in DOM select if present
  try {
    const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
    if (sel) {
      const exists = Array.from(sel.options || []).some(o => (o as HTMLOptionElement).value === mode);
      if (exists) sel.value = mode;
    }
  } catch {}
  emitMode(true);
}

export function onMode(fn: Listener): () => void {
  listeners.add(fn);
  // immediate call with current
  try { fn(mode); } catch {}
  return () => { try { listeners.delete(fn); } catch {} };
}

function emitMode(dispatchWindowEvent: boolean) {
  // Notify internal listeners
  for (const l of [...listeners]) { try { l(mode); } catch {} }
  // Broadcast for legacy observers/testing
  if (dispatchWindowEvent) {
    try { window.dispatchEvent(new CustomEvent('tp:mode', { detail: { mode } })); } catch {}
  }
}

// Bind a DOM select to setMode (id: scrollMode). Safe to call multiple times.
export function bindModeSelect(selectId = 'scrollMode') {
  try {
    if ((window as any).__tpModeSelectBound) return;
    const sel = document.getElementById(selectId) as HTMLSelectElement | null;
    if (!sel) return;
    (window as any).__tpModeSelectBound = true;
    sel.addEventListener('change', () => {
      try { setMode(sel.value as ScrollMode); } catch {}
    }, { capture: true });
  } catch {}
}

// Install a global shim for JS consumers (speech-loader.js can use window.__tpMode?.get())
try {
  (window as any).__tpMode = (window as any).__tpMode || {
    get: () => getMode(),
    set: (v: string) => { try { setMode(v as ScrollMode); } catch {} },
    on: (fn: (m: string) => void) => onMode((m) => fn(m)),
  };
} catch {}
