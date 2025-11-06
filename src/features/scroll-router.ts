// src/features/scroll-router.ts// src/features/scroll-router.ts// src/features/scroll-router.ts



export type AutoAPI = {// Owns the active scroll strategy and routes UI/events to it.// Owns the active scroll strategy and routes UI/events to it.

  toggle: () => void;

  inc?: () => void;// Modes: 'timed' (existing Auto), 'step', 'hybrid' (voice-gated Auto), plus stubs: 'wpm','asr','rehearsal'// Modes: 'timed' (existing Auto), 'step', 'hybrid' (voice-gated Auto), plus stubs: 'wpm','asr','rehearsal'

  dec?: () => void;

  setEnabled?: (_on: boolean) => void;

  setSpeed?: (_v: number) => void;

  getState?: () => { enabled: boolean; speed: number };export type AutoAPI = {export type AutoAPI = {

};

  toggle: () => void;  toggle: () => void;

export type ScrollRouterOpts = { auto: AutoAPI };

  inc?: () => void;  inc?: () => void;

export function installScrollRouter(_opts: ScrollRouterOpts) {

  // Minimal stub to satisfy types while we replace this with full implementation.  dec?: () => void;  dec?: () => void;

}

  setEnabled?: (_on: boolean) => void;  setEnabled?: (_on: boolean) => void;

  setSpeed?: (_v: number) => void;  setSpeed?: (_v: number) => void;

  getState?: () => { enabled: boolean; speed: number };  getState?: () => { enabled: boolean; speed: number };

};};



export type ScrollRouterOpts = { auto: AutoAPI };export type ScrollRouterOpts = { auto: AutoAPI };



// New JSON key with legacy fallback support// New JSON key with legacy fallback support

const LS_KEY = 'tp_scroll_mode_v1';const LS_KEY = 'tp_scroll_mode_v1';



const DEFAULTS = {const DEFAULTS = {

  mode: 'hybrid' as 'timed' | 'step' | 'hybrid' | 'wpm' | 'asr' | 'rehearsal',  mode: 'hybrid' as 'timed' | 'step' | 'hybrid' | 'wpm' | 'asr' | 'rehearsal',

  step: { holdCreep: 8 },  step: { holdCreep: 8 },

  // hybrid speech-gated Auto: db/VAD gate with attack/release; plus silence buffer before stopping  // hybrid speech-gated Auto: db/VAD gate with attack/release; plus silence buffer before stopping

  hybrid: { attackMs: 150, releaseMs: 350, thresholdDb: -42, silenceStopMs: 1500 },  hybrid: { attackMs: 150, releaseMs: 350, thresholdDb: -42, silenceStopMs: 1500 },

};};



type Mode = typeof DEFAULTS.mode;type Mode = typeof DEFAULTS.mode;



const state: { mode: Mode } & typeof DEFAULTS = { ...DEFAULTS } as any;const state: { mode: Mode } & typeof DEFAULTS = { ...DEFAULTS } as any;

let viewer: HTMLElement | null = null;let viewer: HTMLElement | null = null;



// Debug bypass: set via DevTools localStorage.setItem('tp_hybrid_bypass','1') to force gate open// Debug bypass: set via DevTools localStorage.setItem('tp_hybrid_bypass','1') to force gate open

const isHybridBypass = () => {const isHybridBypass = () => {

  try { return localStorage.getItem('tp_hybrid_bypass') === '1'; } catch { return false; }  try { return localStorage.getItem('tp_hybrid_bypass') === '1'; } catch { return false; }

};};



function persistMode() {function persistMode() {

  try { localStorage.setItem(LS_KEY, JSON.stringify({ mode: state.mode })); } catch { /* noop */ }  try { localStorage.setItem(LS_KEY, JSON.stringify({ mode: state.mode })); } catch { }

}}

function restoreMode() {function restoreMode() {

  try {  try {

    // Prefer v1 JSON format    // Prefer v1 JSON format

    const raw = localStorage.getItem(LS_KEY);    const raw = localStorage.getItem(LS_KEY);

    if (raw) {    if (raw) {

      try {      try {

        const s = JSON.parse(raw);        const s = JSON.parse(raw);

        if (s && typeof s.mode === 'string') { state.mode = s.mode as Mode; return; }        if (s && typeof s.mode === 'string') { state.mode = s.mode as Mode; return; }

      } catch { /* fall back */ }      } catch { /* fall back */ }

    }    }

    // Back-compat with legacy key storing plain string    // Back-compat with legacy key storing plain string

    const legacy = localStorage.getItem('scrollMode');    const legacy = localStorage.getItem('scrollMode');

    if (legacy) state.mode = legacy as Mode;    if (legacy) state.mode = legacy as Mode;

  } catch { /* noop */ }  } catch { }

}}



// ---------- STEP MODE ----------// ---------- STEP MODE ----------

function findNextLine(offsetTop: number, dir: 1 | -1) {function findNextLine(offsetTop: number, dir: 1 | -1) {

  if (!viewer) return null;  if (!viewer) return null;

  const lines = viewer.querySelectorAll('.line');  const lines = viewer.querySelectorAll('.line');

  if (!lines || !lines.length) return null;  if (!lines || !lines.length) return null;

  const y = Number.isFinite(offsetTop) ? offsetTop : viewer.scrollTop;  const y = Number.isFinite(offsetTop) ? offsetTop : viewer.scrollTop;

  if (dir > 0) {  if (dir > 0) {

    for (let i = 0; i < lines.length; i++) {    for (let i = 0; i < lines.length; i++) {

      const el = lines[i] as HTMLElement;      const el = lines[i] as HTMLElement;

      if (el.offsetTop > y + 2) return el;      if (el.offsetTop > y + 2) return el;

    }    }

    return lines[lines.length - 1] as HTMLElement;    return lines[lines.length - 1] as HTMLElement;

  } else {  } else {

    let prev = lines[0] as HTMLElement;    let prev = lines[0] as HTMLElement;

    for (let i = 0; i < lines.length; i++) {    for (let i = 0; i < lines.length; i++) {

      const el = lines[i] as HTMLElement;      const el = lines[i] as HTMLElement;

      if (el.offsetTop >= y - 2) return prev;      if (el.offsetTop >= y - 2) return prev;

      prev = el;      prev = el;

    }    }

    return prev;    return prev;

  }  }

}}

function stepOnce(dir: 1 | -1) {function stepOnce(dir: 1 | -1) {

  if (!viewer) viewer = document.getElementById('viewer') as HTMLElement | null;  if (!viewer) viewer = document.getElementById('viewer') as HTMLElement | null;

  if (!viewer) return;  if (!viewer) return;

  const next = findNextLine(viewer.scrollTop, dir);  const next = findNextLine(viewer.scrollTop, dir);

  if (!next) return;  if (!next) return;

  viewer.scrollTop = Math.max(0, (next as HTMLElement).offsetTop - 6);  viewer.scrollTop = Math.max(0, (next as HTMLElement).offsetTop - 6);

}}



// optional “press-and-hold creep”// optional “press-and-hold creep”

let creepRaf = 0 as number | 0;let creepRaf = 0 as number | 0;

let creepLast = 0;let creepLast = 0;

function holdCreepStart(pxPerSec = DEFAULTS.step.holdCreep, dir: 1 | -1 = 1) {function holdCreepStart(pxPerSec = DEFAULTS.step.holdCreep, dir: 1 | -1 = 1) {

  if (!viewer) viewer = document.getElementById('viewer') as HTMLElement | null;  if (!viewer) viewer = document.getElementById('viewer') as HTMLElement | null;

  if (!viewer) return;  if (!viewer) return;

  cancelAnimationFrame(creepRaf as number);  cancelAnimationFrame(creepRaf as number);

  creepLast = performance.now();  creepLast = performance.now();

  const tick = (now: number) => {  const tick = (now: number) => {

    const dt = (now - creepLast) / 1000; creepLast = now;    const dt = (now - creepLast) / 1000; creepLast = now;

    try { if (viewer) viewer.scrollTop += dir * pxPerSec * dt; } catch { /* noop */ }    try { if (viewer) viewer.scrollTop += dir * pxPerSec * dt; } catch { }

    creepRaf = requestAnimationFrame(tick) as unknown as number;    creepRaf = requestAnimationFrame(tick) as unknown as number;

  };  };

  creepRaf = requestAnimationFrame(tick) as unknown as number;  creepRaf = requestAnimationFrame(tick) as unknown as number;

}}

function holdCreepStop() { cancelAnimationFrame(creepRaf as number); creepRaf = 0; }function holdCreepStop() { cancelAnimationFrame(creepRaf as number); creepRaf = 0; }



// ---------- HYBRID MODE (VAD gates Auto) ----------// ---------- HYBRID MODE (VAD gates Auto) ----------

// Smooth dB gate transitions (attack/release) and let applyGate() decide engine state.// Smooth dB gate transitions (attack/release) and let applyGate() decide engine state.

let gateTimer: number | undefined;let gateTimer: number | undefined;



// Speech/activity flags and tiny UI stubs to decouple from other modules// Speech/activity flags and tiny UI stubs to decouple from other modules

let speechActive = false;let speechActive = false;

function updateWpmUiVisibility() { /* optional UI; safe no-op if not present */ }function updateWpmUiVisibility() { /* optional UI; safe no-op if not present */ }

function updateAutoUiForMode() { /* optional UI; safe no-op if not present */ }function updateAutoUiForMode() { /* optional UI; safe no-op if not present */ }

function setAsrBadgeVisible(_on: boolean) { /* optional UI; safe no-op if not present */ }function setAsrBadgeVisible(_on: boolean) { /* optional UI; safe no-op if not present */ }

async function ensureOrchestratorForMode() { /* optional orchestrator wiring; no-op here */ }function updateWpmPxLabel() { /* optional UI; safe no-op if not present */ }

async function ensureOrchestratorForMode() { /* optional orchestrator wiring; no-op here */ }

// Set the current mode; lightweight

function applyMode(m: Mode) {// Set the current mode; lightweight

  state.mode = m;function applyMode(m: Mode) {

  persistMode();  state.mode = m;

  viewer = document.getElementById('viewer') as HTMLElement | null;  persistMode();

}  viewer = document.getElementById('viewer') as HTMLElement | null;

}

// Minimal but usable install entrypoint; keeps the API shape so callers can pass an AutoAPI and controls operate.

export function installScrollRouter(opts: ScrollRouterOpts) {// Minimal but usable install entrypoint; keeps the API shape so callers can pass an AutoAPI and controls operate.

  try { (window as any).__tpScrollRouterTsActive = true; } catch { /* noop */ }export function installScrollRouter(opts: ScrollRouterOpts) {

  const { auto } = opts;  try { (window as any).__tpScrollRouterTsActive = true; } catch { }

  restoreMode();  const { auto } = opts;

  applyMode(state.mode);  restoreMode();

  try { updateWpmUiVisibility(); } catch { /* noop */ }  applyMode(state.mode);

  try { updateAutoUiForMode(); } catch { /* noop */ }  try { updateWpmUiVisibility(); } catch { }

  try { updateAutoUiForMode(); } catch { }

  // Track last speed (used to seed on first enable)

  let lastSpeed: number = (() => { try { const s = Number(auto.getState?.().speed); return (Number.isFinite(s) && s > 0) ? s : Number(localStorage.getItem('tp_auto_speed') || '60') || 60; } catch { return 60; } })();  // Track actual engine state, last speed, and silence buffering

  let enabledNow: boolean = !!(auto.getState?.().enabled);

  // Hybrid gate state  let lastSpeed: number = (() => { try { const s = Number(auto.getState?.().speed); return (Number.isFinite(s) && s > 0) ? s : Number(localStorage.getItem('tp_auto_speed') || '60') || 60; } catch { return 60; } })();

  let userEnabled = false;  let silenceTimer: number | undefined;

  let dbGate = false;

  let vadGate = false;  // Hybrid gate state

  let userEnabled = false;

  // Small helper functions used by the simplified router  let dbGate = false;

  const speedKey = (m: Mode) => `tp_speed_${m}`;  let vadGate = false;

  const getStoredSpeedForMode = (m: Mode): number => { try { const v = Number(localStorage.getItem(speedKey(m)) || ''); if (Number.isFinite(v) && v > 0) return v; } catch { /* noop */ } try { return Number(localStorage.getItem('tp_auto_speed') || '60') || 60; } catch { return 60; } };  let gatePref = getUiPrefs().hybridGate;

  const setStoredSpeedForMode = (m: Mode, v: number) => { try { localStorage.setItem(speedKey(m), String(v)); } catch { /* noop */ } try { localStorage.setItem('tp_auto_speed', String(v)); } catch { /* noop */ } };

  const getStoredSpeed = (): number => getStoredSpeedForMode(state.mode);  // Small helper functions used by the simplified router

  const speedKey = (m: Mode) => `tp_speed_${m}`;

  function applyGate() {  const getStoredSpeedForMode = (m: Mode): number => { try { const v = Number(localStorage.getItem(speedKey(m)) || ''); if (Number.isFinite(v) && v > 0) return v; } catch { } try { return Number(localStorage.getItem('tp_auto_speed') || '60') || 60; } catch { return 60; } };

    // ASR mode: force Auto off, show ASR badge  const setStoredSpeedForMode = (m: Mode, v: number) => { try { localStorage.setItem(speedKey(m), String(v)); } catch { } try { localStorage.setItem('tp_auto_speed', String(v)); } catch { } };

    if (state.mode === 'asr') {  const getStoredSpeed = (): number => getStoredSpeedForMode(state.mode);

      try { auto.setEnabled?.(false); } catch { /* noop */ }

      try { setAsrBadgeVisible(true); } catch { /* noop */ }  function applyGate() {

      return;    // Keep behavior minimal but coherent with original intent:

    }    if (state.mode === 'asr') {

    try { setAsrBadgeVisible(false); } catch { /* noop */ }      try { auto.setEnabled?.(false); } catch { }

    // Respect hybrid bypass. If hybrid mode, require either db or vad gate (logical OR); can expand to prefs if needed.      enabledNow = false;

    const hybridOk = isHybridBypass() ? true : (dbGate || vadGate);      try { setAsrBadgeVisible(true); } catch { }

    const want = !!userEnabled && !!speechActive && (state.mode !== 'hybrid' ? true : hybridOk);      return;

    try { if (want) auto.setEnabled?.(true); else auto.setEnabled?.(false); } catch { /* noop */ }    }

  }    try { setAsrBadgeVisible(false); } catch { }

    // Respect hybrid bypass. If hybrid mode, require either db or vad gate (configurable via prefs later).

  // Event wiring: speech-state, dB smoothing, VAD    const hybridOk = isHybridBypass() ? true : (dbGate || vadGate);

  try {    const want = !!userEnabled && !!speechActive && (state.mode !== 'hybrid' ? true : hybridOk);

    window.addEventListener('tp:speech-state' as any, (e: any) => {    try { if (want) auto.setEnabled?.(true); else auto.setEnabled?.(false); } catch { }

      try { speechActive = !!(e && e.detail && e.detail.running); applyGate(); void ensureOrchestratorForMode(); } catch { /* noop */ }    enabledNow = want;

    });  }

  } catch { /* noop */ }

  // Small event wiring consistent with the original file (keeps public events working)

  try {  try {

    window.addEventListener('tp:db' as any, (e: any) => {    window.addEventListener('tp:speech-state' as any, (e: any) => {

      const db = (e && e.detail && typeof e.detail.db === 'number') ? e.detail.db : -60;      try { speechActive = !!(e && e.detail && e.detail.running); applyGate(); void ensureOrchestratorForMode(); } catch { }

      try { if (gateTimer) { clearTimeout(gateTimer as any); gateTimer = undefined; } } catch { /* noop */ }    });

      const on = db >= DEFAULTS.hybrid.thresholdDb;  } catch { }

      const delay = on ? DEFAULTS.hybrid.attackMs : DEFAULTS.hybrid.releaseMs;

      gateTimer = setTimeout(() => { dbGate = on; gateTimer = undefined; applyGate(); }, delay) as unknown as number;  try {

    });    window.addEventListener('tp:db' as any, (e: any) => {

    window.addEventListener('tp:vad' as any, (e: any) => { vadGate = !!(e && e.detail && e.detail.speaking); applyGate(); });      const db = (e && e.detail && typeof e.detail.db === 'number') ? e.detail.db : -60;

  } catch { /* noop */ }      try { if (gateTimer) { clearTimeout(gateTimer as any); gateTimer = undefined; } } catch { }

      const on = db >= DEFAULTS.hybrid.thresholdDb;

  // User intent and UI controls      const delay = on ? DEFAULTS.hybrid.attackMs : DEFAULTS.hybrid.releaseMs;

  try {      gateTimer = setTimeout(() => { dbGate = on; gateTimer = undefined; applyGate(); }, delay) as unknown as number;

    document.addEventListener('click', (ev) => {    });

      const t = ev.target as HTMLElement | null;    window.addEventListener('tp:vad' as any, (e: any) => { vadGate = !!(e && e.detail && e.detail.speaking); applyGate(); });

      if (t?.id === 'autoToggle') {  } catch { }

        const was = userEnabled;

        userEnabled = !userEnabled;  // User intent and UI controls (kept simple)

        if (!was && userEnabled) {  try {

          const seed = getStoredSpeed();    document.addEventListener('click', (ev) => {

          try { auto.setSpeed?.(seed); } catch { /* noop */ }      const t = ev.target as HTMLElement | null;

          lastSpeed = seed;      if (t?.id === 'autoToggle') {

        }        const was = userEnabled;

        applyGate();        userEnabled = !userEnabled;

      }        if (!was && userEnabled) {

      if (t?.id === 'stepUp') stepOnce(1);          const seed = getStoredSpeed();

      if (t?.id === 'stepDown') stepOnce(-1);          try { auto.setSpeed?.(seed); } catch { }

    }, { capture: true });          lastSpeed = seed;

  } catch { /* noop */ }        }

        applyGate();

  // basic + / - keyboard handling      }

  try {      if (t?.id === 'stepUp') stepOnce(1);

    document.addEventListener('keydown', (e: KeyboardEvent) => {      if (t?.id === 'stepDown') stepOnce(-1);

      try {    }, { capture: true });

        const target = e.target as HTMLElement | null;  } catch { }

        if (!target) return;

        const tag = (target.tagName || '').toUpperCase();  // basic + / - keyboard handling (simplified)

        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || (target as any).isContentEditable) return;  try {

        if (e.ctrlKey || e.metaKey || e.altKey) return;    document.addEventListener('keydown', (e: KeyboardEvent) => {

        const wantUp = e.key === '+' || e.code === 'NumpadAdd' || e.key === 'ArrowUp';      try {

        const wantDown = e.key === '-' || e.code === 'NumpadSubtract' || e.key === 'ArrowDown';        const target = e.target as HTMLElement | null;

        if (!wantUp && !wantDown) return;        if (!target) return;

        e.preventDefault();        const tag = (target.tagName || '').toUpperCase();

        if (state.mode !== 'asr') {        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || (target as any).isContentEditable) return;

          const step = e.shiftKey ? 5 : 0.5;        if (e.ctrlKey || e.metaKey || e.altKey) return;

          const got = Number(auto?.getState?.().speed);        const wantUp = e.key === '+' || e.code === 'NumpadAdd' || e.key === 'ArrowUp';

          const base = (Number.isFinite(got) && got > 0) ? got : (Number.isFinite(lastSpeed) && lastSpeed > 0 ? lastSpeed : getStoredSpeed());        const wantDown = e.key === '-' || e.code === 'NumpadSubtract' || e.key === 'ArrowDown';

          const next = Math.max(1, Math.min(200, base + (wantUp ? step : -step)));        if (!wantUp && !wantDown) return;

          auto?.setSpeed?.(next);        e.preventDefault();

          lastSpeed = next;        if (state.mode !== 'asr') {

          try { if (state.mode !== 'wpm') setStoredSpeedForMode(state.mode as any, next); } catch { /* noop */ }          const step = e.shiftKey ? 5 : 0.5;

        }          const got = Number(auto?.getState?.().speed);

      } catch { /* noop */ }          const base = (Number.isFinite(got) && got > 0) ? got : (Number.isFinite(lastSpeed) && lastSpeed > 0 ? lastSpeed : getStoredSpeed());

    }, { capture: true });          const next = Math.max(1, Math.min(200, base + (wantUp ? step : -step)));

  } catch { /* noop */ }          auto?.setSpeed?.(next);

          lastSpeed = next;

  // initial apply          try { if (state.mode !== 'wpm') setStoredSpeedForMode(state.mode as any, next); } catch { }

  applyGate();        }

}      } catch { }

    }, { capture: true });

// Lightweight UI prefs types and accessor (single, robust implementation)  } catch { }

type GatePref = 'db' | 'vad' | 'db_and_vad' | 'db_or_vad';

type UiPrefs = { hybridGate: GatePref };  // initial apply

  applyGate();

function getUiPrefs(): UiPrefs {}

  const DEFAULT: UiPrefs = { hybridGate: 'db_or_vad' };

  try {// Lightweight UI prefs types and accessor (single, robust implementation)

    // Try structured prefs firsttype GatePref = 'db' | 'vad' | 'db_and_vad' | 'db_or_vad';

    const raw = localStorage.getItem('tp_ui_prefs_v1') || localStorage.getItem('tp_ui_prefs');type UiPrefs = { hybridGate: GatePref };

    if (raw) {

      try {function getUiPrefs(): UiPrefs {

        const parsed = JSON.parse(raw);  const DEFAULT: UiPrefs = { hybridGate: 'db_or_vad' };

        if (parsed && typeof parsed.hybridGate === 'string') {  try {

          const v = parsed.hybridGate as string;    // Try structured prefs first

          if (['db', 'vad', 'db_and_vad', 'db_or_vad'].includes(v)) return { hybridGate: v as GatePref };    const raw = localStorage.getItem('tp_ui_prefs_v1') || localStorage.getItem('tp_ui_prefs');

        }    if (raw) {

      } catch {      try {

        // fall through to try as legacy plain value        const parsed = JSON.parse(raw);

      }        if (parsed && typeof parsed.hybridGate === 'string') {

    }          const v = parsed.hybridGate as string;

    // Legacy single-value key fallback          if (['db', 'vad', 'db_and_vad', 'db_or_vad'].includes(v)) return { hybridGate: v as GatePref };

    const legacy = localStorage.getItem('tp_hybrid_gate') || localStorage.getItem('hybridGate');        }

    if (legacy && ['db', 'vad', 'db_and_vad', 'db_or_vad'].includes(legacy)) {      } catch {

      return { hybridGate: legacy as GatePref };        // fall through to try as legacy plain value

    }      }

  } catch {    }

    // ignore and return default    // Legacy single-value key fallback

  }    const legacy = localStorage.getItem('tp_hybrid_gate') || localStorage.getItem('hybridGate');

  return DEFAULT;    if (legacy && ['db', 'vad', 'db_and_vad', 'db_or_vad'].includes(legacy)) {

}      return { hybridGate: legacy as GatePref };

    }
  } catch {
    // ignore and return default
  }
  return DEFAULT;
}
