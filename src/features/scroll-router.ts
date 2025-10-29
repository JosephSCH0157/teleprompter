// src/features/scroll-router.ts
// Owns the active scroll strategy and routes UI/events to it.
// Modes: 'timed' (existing Auto), 'step', 'hybrid' (voice-gated Auto), stubs: 'wpm','asr','rehearsal'

export type AutoAPI = {
  toggle: () => void;
  inc?: () => void;
  dec?: () => void;
  setEnabled?: (_on: boolean) => void;
};

export type ScrollRouterOpts = { auto: AutoAPI };

const LS_KEY = 'scrollMode';

const DEFAULTS = {
  mode: 'hybrid' as 'timed'|'step'|'hybrid'|'wpm'|'asr'|'rehearsal',
  step:    { holdCreep: 8 },
  hybrid:  { attackMs: 150, releaseMs: 350, thresholdDb: -42 },
};

type Mode = typeof DEFAULTS.mode;

const state: { mode: Mode } & typeof DEFAULTS = { ...DEFAULTS } as any;
let viewer: HTMLElement | null = null;

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

import { getUiPrefs, onUiPrefs } from '../settings/uiPrefs';
import { createOrchestrator } from '../asr/v2/orchestrator';
import { createVadEventAdapter } from '../asr/v2/adapters/vad';

export function installScrollRouter(opts: ScrollRouterOpts){
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

  // Chip helpers
  const chipEl = () => document.getElementById('autoChip');
  function setAutoChip(state: 'on' | 'paused' | 'manual', detail?: string) {
    const el = chipEl();
    if (!el) return;
    el.textContent = `Auto: ${state === 'on' ? 'On' : state === 'paused' ? 'Paused' : 'Manual'}`;
    el.classList.remove('on','paused','manual');
    el.classList.add(state);
    el.setAttribute('data-state', state);
    if (detail) el.title = detail;
  }

  function applyGate() {
    if (state.mode !== 'hybrid') {
      // Outside Hybrid, honor user toggle directly
      if (typeof auto.setEnabled === 'function') auto.setEnabled(userEnabled);
      const detail = `Mode: ${state.mode} • User: ${userEnabled ? 'On' : 'Off'}`;
      setAutoChip(userEnabled ? 'on' : 'manual', detail);
      return;
    }
    let gateWanted = false;
    switch (gatePref) {
      case 'db':         gateWanted = dbGate; break;
      case 'vad':        gateWanted = vadGate; break;
      case 'db_and_vad': gateWanted = dbGate && vadGate; break;
      case 'db_or_vad':
      default:           gateWanted = dbGate || vadGate; break;
    }
    const enabled = userEnabled && gateWanted;
    if (typeof auto.setEnabled === 'function') auto.setEnabled(enabled);
    const detail = `Mode: Hybrid • Pref: ${gatePref} • User: ${userEnabled ? 'On' : 'Off'} • dB:${dbGate?'1':'0'} • VAD:${vadGate?'1':'0'}`;
    setAutoChip(userEnabled ? (enabled ? 'on' : 'paused') : 'manual', detail);
  }

  onUiPrefs((p) => { gatePref = p.hybridGate; applyGate(); });

  // Mode selector
  try {
    document.addEventListener('change', (e: Event)=>{
      const t = e.target as HTMLElement | null;
      if ((t as HTMLSelectElement)?.id === 'scrollMode') {
        const v = (t as HTMLSelectElement).value as Mode;
        applyMode(v);
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

  // Wire user Auto toggle intent
  try {
    document.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement | null;
      if (t?.id === 'autoToggle') {
        userEnabled = !userEnabled;
        applyGate();
      }
    }, { capture: true });
  } catch {}

  // Ensure initial gate application
  if (state.mode === 'hybrid') applyGate();
  // If ASR modes selected initially, ensure orchestrator
  if (state.mode === 'wpm' || state.mode === 'asr') ensureOrchestratorForMode();
}
