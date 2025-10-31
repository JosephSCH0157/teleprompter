// src/features/scroll-router.ts
// Owns the active scroll strategy and routes UI/events to it.
// Modes: 'timed' (existing Auto), 'step', 'hybrid' (voice-gated Auto), stubs: 'wpm','asr','rehearsal'

export type AutoAPI = {
  toggle: () => void;
  inc?: () => void;
  dec?: () => void;
  setEnabled?: (_on: boolean) => void;
  setSpeed?: (_v: number) => void;
  getState?: () => { enabled: boolean; speed: number };
};

export type ScrollRouterOpts = { auto: AutoAPI };

const LS_KEY = 'scrollMode';

const DEFAULTS = {
  mode: 'hybrid' as 'timed'|'step'|'hybrid'|'wpm'|'asr'|'rehearsal',
  step:    { holdCreep: 8 },
  // hybrid speech-gated Auto: db/VAD gate with attack/release; plus silence buffer before stopping
  hybrid:  { attackMs: 150, releaseMs: 350, thresholdDb: -42, silenceStopMs: 1500 },
};

type Mode = typeof DEFAULTS.mode;

const state: { mode: Mode } & typeof DEFAULTS = { ...DEFAULTS } as any;
let viewer: HTMLElement | null = null;

// Debug bypass: set via DevTools localStorage.setItem('tp_hybrid_bypass','1') to force gate open
const isHybridBypass = () => {
  try { return localStorage.getItem('tp_hybrid_bypass') === '1'; } catch { return false; }
};

function persistMode() {
  try { localStorage.setItem(LS_KEY, state.mode); } catch {}
}
function restoreMode() {
  try {
    const m = localStorage.getItem(LS_KEY);
    if (m) state.mode = m as Mode;
  } catch {}
}

// ---------- STEP MODE ----------
function findNextLine(offsetTop: number, dir: 1|-1){
  if (!viewer) return null;
  const lines = viewer.querySelectorAll('.line');
  if (!lines || !lines.length) return null;
  const y = Number.isFinite(offsetTop) ? offsetTop : viewer.scrollTop;
  if (dir > 0) {
    for (let i = 0; i < lines.length; i++) {
      const el = lines[i] as HTMLElement;
      if (el.offsetTop > y + 2) return el;
    }
    return lines[lines.length-1] as HTMLElement;
  } else {
    let prev = lines[0] as HTMLElement;
    for (let i = 0; i < lines.length; i++) {
      const el = lines[i] as HTMLElement;
      if (el.offsetTop >= y - 2) return prev;
      prev = el;
    }
    return prev;
  }
}
function stepOnce(dir: 1|-1){
  if (!viewer) viewer = document.getElementById('viewer') as HTMLElement | null;
  if (!viewer) return;
  const next = findNextLine(viewer.scrollTop, dir);
  if (!next) return;
  viewer.scrollTop = Math.max(0, (next as HTMLElement).offsetTop - 6);
}

// optional “press-and-hold creep”
let creepRaf = 0 as number | 0;
let creepLast = 0;
function holdCreepStart(pxPerSec = DEFAULTS.step.holdCreep, dir: 1|-1 = 1){
  if (!viewer) viewer = document.getElementById('viewer') as HTMLElement | null;
  if (!viewer) return;
  cancelAnimationFrame(creepRaf as number);
  creepLast = performance.now();
  const tick = (now: number)=>{
    const dt = (now - creepLast)/1000; creepLast = now;
    try { if (viewer) viewer.scrollTop += dir * pxPerSec * dt; } catch {}
    creepRaf = requestAnimationFrame(tick) as unknown as number;
  };
  creepRaf = requestAnimationFrame(tick) as unknown as number;
}
function holdCreepStop(){ cancelAnimationFrame(creepRaf as number); creepRaf = 0; }

// ---------- HYBRID MODE (VAD gates Auto) ----------
let speaking = false;
let gateTimer: number | undefined;
function setSpeaking(on: boolean, auto: AutoAPI){
  if (on === speaking) return;
  speaking = on;
  if (typeof auto.setEnabled === 'function') auto.setEnabled(on);
  else auto.toggle(); // best-effort fallback
}
function hybridHandleDb(db: number, auto: AutoAPI){
  const { attackMs, releaseMs, thresholdDb } = DEFAULTS.hybrid;
  if (gateTimer) clearTimeout(gateTimer);
  if (db >= thresholdDb) gateTimer = setTimeout(()=> setSpeaking(true, auto), attackMs) as unknown as number;
  else gateTimer = setTimeout(()=> setSpeaking(false, auto), releaseMs) as unknown as number;
}

function applyMode(m: Mode){
  state.mode = m;
  persistMode();
  viewer = document.getElementById('viewer') as HTMLElement | null;
  // update select if present
  try {
    const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
    if (sel && sel.value !== m) sel.value = m;
  } catch {}
}

import { createVadEventAdapter } from '../asr/v2/adapters/vad';
import { createOrchestrator } from '../asr/v2/orchestrator';
import { getUiPrefs, onUiPrefs } from '../settings/uiPrefs';

export function installScrollRouter(opts: ScrollRouterOpts){
  try { (window as any).__tpScrollRouterTsActive = true; } catch {}
  const { auto } = opts;
  restoreMode();
  applyMode(state.mode);

  // ASR v2 Orchestrator (minimal integration): start on 'wpm'/'asr', stop otherwise
  const orch = createOrchestrator();
  let orchRunning = false;
  async function ensureOrchestratorForMode() {
    try {
      if (state.mode === 'wpm' || state.mode === 'asr') {
        if (!orchRunning) {
          await orch.start(createVadEventAdapter()); // use VAD events for speaking; WPM updates when tokens are available
          orch.setMode('assist');
          orchRunning = true;
        }
      } else if (orchRunning) {
        await orch.stop();
        orchRunning = false;
      }
    } catch {}
  }
  ensureOrchestratorForMode();

  // Hybrid gating via dB and/or VAD per user preference
  let userEnabled = false; // reflects user's Auto on/off intent
  let dbGate = false;      // set from tp:db
  let vadGate = false;     // set from tp:vad
  let gatePref = getUiPrefs().hybridGate;
  // Require global speech sync to be active in any mode for Auto to actually run
  let speechActive = false;
  try {
    window.addEventListener('tp:speech-state' as any, (e: any) => {
      try {
        const running = !!(e && e.detail && e.detail.running);
        speechActive = running;
        applyGate();
      } catch {}
    });
  } catch {}
  // Track actual engine state and manage delayed stop when speech falls silent
  let enabledNow: boolean = (() => { try { return !!opts.auto.getState?.().enabled; } catch { return false; } })();
  let silenceTimer: number | undefined;

  // Chip helpers
  const chipEl = () => document.getElementById('autoChip');
  function emitAutoState() {
    try {
      const btn = document.getElementById('autoToggle') as HTMLButtonElement | null;
      const chip = chipEl();
      const st = (btn && btn.getAttribute && btn.getAttribute('data-state')) || '';
      const gate: 'manual'|'paused'|'on' = (st === 'on') ? 'on' : (st === 'paused') ? 'paused' : 'manual';
      const speed = typeof opts.auto.getState === 'function' ? (opts.auto.getState()?.speed) : (Number(localStorage.getItem('tp_auto_speed')||'0')||0);
      const payload = {
        intentOn: !!userEnabled,
        gate,
        speed,
        label: (btn && btn.textContent || '').trim(),
        chip: (chip && chip.textContent || '').trim(),
      };
      try { (window as any).__tp_onAutoStateChange?.(payload); } catch {}
      try { document.dispatchEvent(new CustomEvent('tp:autoState', { detail: payload })); } catch {}
    } catch {}
  }
  function setAutoChip(state: 'on' | 'paused' | 'manual', detail?: string) {
    const el = chipEl();
    if (!el) return;
    el.textContent = `Auto: ${state === 'on' ? 'On' : state === 'paused' ? 'Paused' : 'Manual'}`;
    el.classList.remove('on','paused','manual');
    el.classList.add(state);
    el.setAttribute('data-state', state);
    if (detail) el.title = detail;
  }

  const getStoredSpeed = (): number => {
    try { return Number(localStorage.getItem('tp_auto_speed') || '60') || 60; } catch { return 60; }
  };

  function applyGate() {
    if (state.mode !== 'hybrid') {
      // Outside Hybrid, require speech sync to be active and user intent On
      if (silenceTimer) { try { clearTimeout(silenceTimer as any); } catch {} silenceTimer = undefined; }
      const want = !!userEnabled && !!speechActive;
      if (typeof auto.setEnabled === 'function') auto.setEnabled(want);
      enabledNow = want;
      const detail = `Mode: ${state.mode} • User: ${userEnabled ? 'On' : 'Off'} • Speech:${speechActive ? '1' : '0'}`;
      setAutoChip(userEnabled ? (enabledNow ? 'on' : 'paused') : 'manual', detail);
      try {
        const btn = document.getElementById('autoToggle') as HTMLButtonElement | null;
        if (btn) {
          const s = getStoredSpeed();
          if (!userEnabled) {
            btn.textContent = 'Auto-scroll: Off';
            btn.setAttribute('data-state', 'off');
          } else if (enabledNow) {
            btn.textContent = `Auto-scroll: On — ${s} px/s`;
            btn.setAttribute('data-state', 'on');
          } else {
            btn.textContent = `Auto-scroll: Paused — ${s} px/s`;
            btn.setAttribute('data-state', 'paused');
          }
          btn.setAttribute('aria-pressed', String(!!userEnabled));
        }
      } catch {}
      try { emitAutoState(); } catch {}
      return;
    }
    const computeGateWanted = () => {
      switch (gatePref) {
        case 'db':         return dbGate;
        case 'vad':        return vadGate;
        case 'db_and_vad': return dbGate && vadGate;
        case 'db_or_vad':
        default:           return dbGate || vadGate;
      }
    };
  const gateWanted = computeGateWanted();
  // In Hybrid, require speech active AND gate (unless bypass)
  const wantEnabled = userEnabled && speechActive && (isHybridBypass() ? true : gateWanted);
  const dueToGateSilence = userEnabled && speechActive && !isHybridBypass() && !gateWanted;

    if (wantEnabled) {
      // Speech present (or bypass): ensure running immediately; cancel pending stop
      if (silenceTimer) { try { clearTimeout(silenceTimer as any); } catch {} silenceTimer = undefined; }
      if (!enabledNow) {
        try { auto.setEnabled?.(true); } catch {}
        enabledNow = true;
      }
    } else {
      // We want to disable. If the reason is speech silence while user intent is ON, buffer the stop.
      if (dueToGateSilence && enabledNow) {
        if (silenceTimer) { try { clearTimeout(silenceTimer as any); } catch {} }
        silenceTimer = setTimeout(() => {
          try {
            // Re-evaluate latest desire to avoid stale disable
            const stillGateWanted = computeGateWanted();
            const stillWantEnabled = userEnabled && (isHybridBypass() ? true : stillGateWanted);
            if (!stillWantEnabled && enabledNow) {
              try { auto.setEnabled?.(false); } catch {}
              enabledNow = false;
              // Update UI to reflect paused state after delayed stop
              const s = getStoredSpeed();
              const detail2 = `Mode: Hybrid • Pref: ${gatePref} • User: ${userEnabled ? 'On' : 'Off'} • dB:${dbGate?'1':'0'} • VAD:${vadGate?'1':'0'}`;
              setAutoChip(userEnabled ? 'paused' : 'manual', detail2);
              try {
                const btn = document.getElementById('autoToggle') as HTMLButtonElement | null;
                if (btn) {
                  if (userEnabled) { btn.textContent = `Auto-scroll: Paused — ${s} px/s`; btn.setAttribute('data-state', 'paused'); }
                  else { btn.textContent = 'Auto-scroll: Off'; btn.setAttribute('data-state', 'off'); }
                  btn.setAttribute('aria-pressed', String(!!userEnabled));
                }
              } catch {}
              try { emitAutoState(); } catch {}
            }
          } catch {}
          silenceTimer = undefined;
        }, DEFAULTS.hybrid.silenceStopMs) as unknown as number;
      } else {
        // Immediate disable (user turned it off, changed mode, or already disabled)
        if (silenceTimer) { try { clearTimeout(silenceTimer as any); } catch {} silenceTimer = undefined; }
        if (enabledNow) { try { auto.setEnabled?.(false); } catch {} enabledNow = false; }
      }
    }

  const detail = `Mode: Hybrid • Pref: ${gatePref} • User: ${userEnabled ? 'On' : 'Off'} • Speech:${speechActive?'1':'0'} • dB:${dbGate?'1':'0'} • VAD:${vadGate?'1':'0'}`;
    // UI reflects the actual engine state (enabledNow), not the instantaneous gate desire
    setAutoChip(userEnabled ? (enabledNow ? 'on' : 'paused') : 'manual', detail);
    // Reflect user intent on the main Auto button label with speed and paused state
    try {
      const btn = document.getElementById('autoToggle') as HTMLButtonElement | null;
      if (btn) {
        const s = getStoredSpeed();
        if (!userEnabled) {
          btn.textContent = 'Auto-scroll: Off';
          btn.setAttribute('data-state', 'off');
        } else if (enabledNow) {
          btn.textContent = `Auto-scroll: On — ${s} px/s`;
          btn.setAttribute('data-state', 'on');
        } else {
          btn.textContent = `Auto-scroll: Paused — ${s} px/s`;
          btn.setAttribute('data-state', 'paused');
        }
        btn.setAttribute('aria-pressed', String(!!userEnabled));
      }
    } catch {}
    try { emitAutoState(); } catch {}
  }

  onUiPrefs((p) => { gatePref = p.hybridGate; applyGate(); });

  // Mode selector
  try {
    document.addEventListener('change', (e: Event)=>{
      const t = e.target as HTMLElement | null;
      if ((t as HTMLSelectElement)?.id === 'scrollMode') {
  const modeVal = (t as HTMLSelectElement).value as Mode;
  applyMode(modeVal);
        applyGate();
        ensureOrchestratorForMode();
      }
    }, { capture: true });
    // Screen-reader live announcement on the single control
    const modeSel = document.getElementById('scrollMode') as HTMLSelectElement | null;
    modeSel?.setAttribute('aria-live', 'polite');
  } catch {}

  // Step mode keys
  try {
    document.addEventListener('keydown', (e: KeyboardEvent)=>{
      if (state.mode !== 'step') return;
      if (e.key === 'PageDown') { e.preventDefault(); stepOnce(1); }
      if (e.key === 'PageUp')   { e.preventDefault(); stepOnce(-1 as any); }
      if (e.key === ' ') { e.preventDefault(); holdCreepStart(DEFAULTS.step.holdCreep, 1); }
    }, { capture: true });
    document.addEventListener('keyup', (e: KeyboardEvent)=>{
      if (state.mode !== 'step') return;
      if (e.key === ' ') { e.preventDefault(); holdCreepStop(); }
    }, { capture: true });
  } catch {}

  // Hybrid gates
  try {
    window.addEventListener('tp:db' as any, (e: any)=>{
      const db = (e && e.detail && typeof e.detail.db === 'number') ? e.detail.db : -60;
      // keep legacy handler as a fallback smoothing on dbGate
      hybridHandleDb(db, auto);
      dbGate = (db >= DEFAULTS.hybrid.thresholdDb);
      applyGate();
    });
    window.addEventListener('tp:vad' as any, (e: any) => {
      vadGate = !!(e && e.detail && e.detail.speaking);
      applyGate();
    });
  } catch {}

  // External user intent control (speech start/stop, automation)
  try {
    window.addEventListener('tp:autoIntent' as any, (e: any) => {
      try {
        const on = !!(e && e.detail && ((e.detail.on !== undefined) ? e.detail.on : e.detail.enabled));
        userEnabled = !!on;
        applyGate();
      } catch {}
    });
  } catch {}

  // Wire user Auto toggle intent
  try {
    document.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement | null;
      if (t?.id === 'autoToggle') {
        const was = userEnabled;
        userEnabled = !userEnabled;
        // When intent flips ON, seed speed so engine warms and label reflects immediately
        if (!was && userEnabled) {
          try { auto.setSpeed?.(getStoredSpeed()); } catch {}
          // Additionally, prime the low-level controller with the current speed if available
          try { (window as any).__scrollCtl?.setSpeed?.(getStoredSpeed()); } catch {}
        }
        applyGate();
      }
    }, { capture: true });
  } catch {}

  // Default Hybrid intent to ON at startup; set initial label with stored speed and apply once
  if (state.mode === 'hybrid') {
    userEnabled = true;
    // Seed engine speed from storage so ticks use the intended value
    try { auto.setSpeed?.(getStoredSpeed()); } catch {}
    try {
      const btn = document.getElementById('autoToggle') as HTMLButtonElement | null;
      if (btn) {
        btn.dataset.state = 'on';
        btn.textContent = `Auto-scroll: On — ${getStoredSpeed()} px/s`;
      }
    } catch {}
    applyGate();
  } else {
    applyGate();
  }
  // If ASR modes selected initially, ensure orchestrator
  if (state.mode === 'wpm' || state.mode === 'asr') ensureOrchestratorForMode();

  // Keep the label in sync with speed changes while intent is ON/paused
  try {
    document.addEventListener('tp:autoSpeed' as any, (e: any) => {
      const btn = document.getElementById('autoToggle') as HTMLButtonElement | null;
      if (!btn) return;
      const ds = btn.dataset?.state || '';
      const s = (e && e.detail && typeof e.detail.speed === 'number') ? e.detail.speed : getStoredSpeed();
      if (ds === 'on') btn.textContent = `Auto-scroll: On — ${s} px/s`;
      if (ds === 'paused') btn.textContent = `Auto-scroll: Paused — ${s} px/s`;
      try { emitAutoState(); } catch {}
    });
  } catch {}

  // Global keybindings for speed tweaks — use the single setter
  try {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      try {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const tag = (target.tagName || '').toUpperCase();
        // ignore when typing/selecting or with modifiers
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || (target as any).isContentEditable) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const wantUp = e.key === '+' || e.code === 'NumpadAdd' || e.key === 'ArrowUp';
        const wantDown = e.key === '-' || e.code === 'NumpadSubtract' || e.key === 'ArrowDown';
        if (!wantUp && !wantDown) return;
        e.preventDefault();
        const cur = Number(auto?.getState?.().speed) || getStoredSpeed();
        const next = cur + (wantUp ? 5 : -5);
        auto?.setSpeed?.(next);
      } catch {}
    }, { capture: true });
  } catch {}
}
