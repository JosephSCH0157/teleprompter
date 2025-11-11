import type { ScrollMode } from './mode-types';

type Listener = (mode: ScrollMode) => void;

// Internal state
let mode: ScrollMode = 'manual';
let inited = false;
const listeners = new Set<Listener>();
let boundSelect: HTMLSelectElement | null = null;

// Persistence helpers (cookie + localStorage)
const COOKIE_KEY = 'tp_scroll_mode';
const LS_KEY = 'tp_scroll_mode';
const BCAST_KEY = 'tp_scroll_mode_bcast';

// Normalize external strings into canonical ScrollMode values
function normalizeMode(x: string | null | undefined): ScrollMode | null {
  if (!x) return null;
  const s = String(x).trim().toLowerCase();
  const map: Record<string, ScrollMode> = {
    auto: 'wpm',
    wpm: 'wpm',
    manual: 'manual',
    asr: 'asr',
    hybrid: 'hybrid',
    rehearsal: 'rehearsal',
    step: 'step',
  };
  return map[s] || null;
}

function getCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

function writeCookie(name: string, val: string, days = 365) {
  try {
    const exp = new Date(Date.now() + days * 864e5).toUTCString();
    const secure = location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${name}=${encodeURIComponent(val)}; expires=${exp}; path=/; samesite=lax${secure}`;
  } catch {}
}

function pokeStorageBroadcast(m: ScrollMode) {
  try {
    localStorage.setItem(BCAST_KEY, JSON.stringify({ m, t: Date.now() }));
    setTimeout(() => { try { localStorage.removeItem(BCAST_KEY); } catch {} }, 1000);
  } catch {}
}

function lsGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k: string, v: string): void { try { localStorage.setItem(k, v); } catch {} }

// Read initial persisted value (cookie wins; fallback to LS)

export function getMode(): ScrollMode { return mode; }

export function setMode(next: ScrollMode | string): void {
  const n = normalizeMode(next as any);
  if (!n || n === mode) { emitMode(false); return; }
  mode = n;
  // Persist
  writeCookie(COOKIE_KEY, mode);
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

function emitMode(dispatchWindowEvent: boolean, why: 'init'|'set' = 'set') {
  // Notify internal listeners
  for (const l of [...listeners]) { try { l(mode); } catch {} }
  // Data hook for CSS/diagnostics
  try { document.documentElement.dataset.scrollMode = mode; } catch {}
  // Broadcast for legacy observers/testing
  if (dispatchWindowEvent) {
    try { window.dispatchEvent(new CustomEvent('tp:mode', { detail: { mode, why, ssot: true, ts: Date.now() } })); } catch {}
    // storage-event fallback broadcast
    try { pokeStorageBroadcast(mode); } catch {}
  }
}

// Bind a DOM select to setMode (id: scrollMode). Safe to call multiple times.
export function bindModeSelect(selectId = 'scrollMode') {
  try {
    if ((window as any).__tpModeSelectBound) return;
    const sel = document.getElementById(selectId) as HTMLSelectElement | null;
    if (!sel) return;
    (window as any).__tpModeSelectBound = true;
    boundSelect = sel;
    // Prime select with current mode
    try { if (boundSelect.value !== mode) boundSelect.value = mode; } catch {}
  sel.addEventListener('change', () => { try { setMode(sel.value as ScrollMode); } catch {} }, { capture: true });
    // Migration shim: detect silent external pokes by polling
    try {
      if (localStorage.getItem('tp_dev_mode') === '1') {
        if (!(window as any).__tpModeSelectPoll) {
          (window as any).__tpModeSelectPoll = window.setInterval(() => {
            try {
              if (!boundSelect) return;
              const v = boundSelect.value as ScrollMode;
              if (v && v !== mode) setMode(v);
            } catch {}
          }, 500);
        }
      }
    } catch {}
  } catch {}
}

// Aliases matching proposed API
export function bindSelect(sel: HTMLSelectElement | null): () => void {
  if (!sel) return () => {};
  boundSelect = sel;
  try { if (boundSelect.value !== mode) boundSelect.value = mode; } catch {}
  const onChange = () => { try { setMode(boundSelect!.value as ScrollMode); } catch {} };
  boundSelect.addEventListener('change', onChange, { passive: true });
  // Poll shim
  let pollId: number | null = null;
  try {
    if (localStorage.getItem('tp_dev_mode') === '1') {
      pollId = window.setInterval(() => { try { if (!boundSelect) return; const v = boundSelect.value as ScrollMode; if (v && v !== mode) setMode(v); } catch {} }, 500);
    }
  } catch {}
  return () => {
    try { boundSelect?.removeEventListener('change', onChange as any); } catch {}
    if (pollId != null) { try { clearInterval(pollId); } catch {} }
    if (boundSelect === sel) boundSelect = null;
  };
}

export function initModeState(opts?: { defaultMode?: ScrollMode; select?: HTMLSelectElement | null; }): void {
  if (inited) return;
  inited = true;
  try {
    const persisted = normalizeMode(getCookie(COOKIE_KEY) || lsGet(LS_KEY));
    const selVal = normalizeMode(opts?.select && opts.select.value);
    mode = (persisted || selVal || opts?.defaultMode || 'manual') as ScrollMode;
  } catch {}
  if (opts?.select) { try { bindSelect(opts.select); } catch {} }
  // Expose migration shim with desired method names
  try { (window as any).__tpMode = { getMode, setMode, onMode }; } catch {}
  emitMode(true, 'init');
}

// Install a global shim for JS consumers (speech-loader.js can use window.__tpMode?.get())
try {
  (window as any).__tpMode = (window as any).__tpMode || {
    get: () => getMode(),
    set: (v: string) => { try { setMode(v as ScrollMode); } catch {} },
    on: (fn: (m: string) => void) => onMode((m) => fn(m)),
  };
} catch {}

// Cross-window synchronization via BroadcastChannel (if available)
try {
  const BC = (window as any).BroadcastChannel as (new (name: string) => { postMessage: (d: any)=>void; onmessage: ((e: MessageEvent)=>void) | null });
  const ch = BC ? new BC('tp-mode') : null;
  if (ch) {
    // Broadcast local changes
    try { onMode((m) => { try { ch.postMessage({ m }); } catch {} }); } catch {}
    // Apply remote changes
    try {
      ch.onmessage = (e: MessageEvent) => {
        try {
          const m = (e && (e as any).data && (e as any).data.m) as ScrollMode | undefined;
          if (m && m !== getMode()) setMode(m as ScrollMode);
        } catch {}
      };
    } catch {}
  }
} catch {}

// Fallback sync via storage events (fires only in other tabs)
try {
  window.addEventListener('storage', (ev: StorageEvent) => {
    try {
      if (ev.key !== BCAST_KEY || !ev.newValue) return;
      const payload = JSON.parse(ev.newValue || '{}');
      const n = normalizeMode(payload?.m);
      if (n && n !== getMode()) setMode(n);
    } catch {}
  });
} catch {}
