// src/features/scroll-router.js
// Owns the active scroll strategy and routes UI/events to it.
// Modes: 'timed' (existing Auto), 'step', 'hybrid' (voice-gated Auto), stubs for 'wpm','asr','reh'

// Dependencies: existing Auto controller (autoscroll.js) and dB events (tp:db) from mic.js
import { createOrchestrator } from '../asr/v2/orchestrator.js';
import * as Auto from './autoscroll.js';

const LS_KEY = 'scrollMode';
const DEFAULTS = {
  mode: 'hybrid',
  timed:   { speed: 22, rampMs: 300 },
  step:    { unit: 'line', snap: true, holdCreep: 8 },     // unit: 'line'|'paragraph'|'block'
  hybrid:  { speed: 20, attackMs: 150, releaseMs: 350, thresholdDb: -42 },
  wpm:     { target: 170, minPx: 10, maxPx: 120, ewma: 0.3 },
  asr:     { aggr: 0.6, recoverChars: 80 },
  reh:     { pauseAt: '.,;:?!', resumeMs: 900, cue: 'visual', loop: null },
};

const state = { ...DEFAULTS };
let viewer = null;
let orch = null;

// ---------- utilities ----------
function persist() {
  try { localStorage.setItem(LS_KEY, state.mode); } catch {}
}
function restore() {
  try {
    const m = localStorage.getItem(LS_KEY);
    if (m) state.mode = m;
  } catch {}
}

// ---------- STEP MODE ----------
function findNextLine(offsetTop, dir=+1) {
  const lines = viewer?.querySelectorAll?.('.line');
  if (!viewer || !lines?.length) return null;
  const y = offsetTop ?? viewer.scrollTop;
  if (dir > 0) {
    for (let i=0;i<lines.length;i++) {
      const t = lines[i].offsetTop;
      if (t > y + 2) return lines[i];
    }
    return lines[lines.length-1];
  } else {
    let prev = lines[0];
    for (let i=0;i<lines.length;i++) {
      const t = lines[i].offsetTop;
      if (t >= y - 2) return prev;
      prev = lines[i];
    }
    return prev;
  }
}
function stepOnce(dir=+1) {
  if (!viewer) viewer = document.getElementById('viewer');
  if (!viewer) return;
  const next = findNextLine(viewer.scrollTop, dir);
  if (!next) return;
  viewer.scrollTop = Math.max(0, next.offsetTop - 6);
}
// optional “press-and-hold creep”
let creepRaf=0, creepLast=0;
function holdCreepStart(pxPerSec=8, dir=+1) {
  cancelAnimationFrame(creepRaf);
  if (!viewer) viewer = document.getElementById('viewer');
  creepLast = performance.now();
  const tick = (now)=>{
    const dt = (now - creepLast)/1000; creepLast = now;
    viewer.scrollTop += dir * pxPerSec * dt;
    creepRaf = requestAnimationFrame(tick);
  };
  creepRaf = requestAnimationFrame(tick);
}
function holdCreepStop() { cancelAnimationFrame(creepRaf); creepRaf=0; }

// ---------- HYBRID MODE (VAD gates Auto) ----------
let speaking=false, gateTimer=0;
function setSpeaking(on) {
  if (on === speaking) return;
  speaking = on;
  Auto.setEnabled(on);
}
function hybridHandleDb(db) {
  const { attackMs, releaseMs, thresholdDb } = state.hybrid;
  clearTimeout(gateTimer);
  if (db >= thresholdDb) {
    // attack: require brief sustain above threshold
    gateTimer = setTimeout(()=> setSpeaking(true), attackMs);
  } else {
    // release: brief sustain below threshold → pause
    gateTimer = setTimeout(()=> setSpeaking(false), releaseMs);
  }
}

// ---------- WPM / ASR / REH stubs (wire later) ----------
function _wpmUpdate(/*wpm*/) { /* when ready, map → Auto speed */ }
function _asrUpdate(/*alignment*/) { /* when ready, snap to target line */ }
function _rehMarkPause(/*punctuation*/){ /* later */ }

// ---------- MODE ROUTER ----------
function applyMode(m) {
  state.mode = m;
  persist();
  // Ensure viewer ref is current
  viewer = document.getElementById('viewer');

  // Base rule: Timed & Hybrid may run the Auto engine; Step never does.
  if (m === 'timed') {
    Auto.setEnabled(false); // user will press the Auto button to start
  } else if (m === 'hybrid') {
    Auto.setEnabled(false); speaking=false; // waits for VAD gate
  } else {
    Auto.setEnabled(false); speaking=false; // step/wpm/asr/reh start paused
  }

  // Start/stop ASR orchestrator for assisted modes
  try {
    if (!orch) orch = createOrchestrator();
    if (m === 'wpm' || m === 'asr') {
      orch.start('assist');
    } else {
      orch.stop && orch.stop();
    }
  } catch {}

  // Update select if present
  const sel = document.getElementById('scrollMode');
  if (sel && sel.value !== m) sel.value = m;
}

export function getMode(){ return state.mode; }
export function setMode(m){ applyMode(m); }

// Public actions the UI can call
export function step(dir=+1) { if (state.mode === 'step') stepOnce(dir); }

// Install router once
export function installScrollRouter() {
  restore();
  applyMode(state.mode);

  // Mode selector (UI)
  document.addEventListener('change', (e)=>{
    const t = e.target;
    if (t?.id === 'scrollMode') setMode(t.value);
  }, {capture:true});

  // Ensure the select announces changes for screen readers
  try {
    const modeSel = document.getElementById('scrollMode');
    modeSel && modeSel.setAttribute('aria-live', 'polite');
  } catch {}

  // Keyboard helpers for Step mode
  document.addEventListener('keydown', (e)=>{
    if (state.mode !== 'step') return;
    if (e.key === 'PageDown') {
      // eslint-disable-next-line no-restricted-syntax
      e.preventDefault();
      step(+1);
    }
    if (e.key === 'PageUp')   {
      // eslint-disable-next-line no-restricted-syntax
      e.preventDefault();
      step(-1);
    }
    if (e.key === ' ') { // hold to creep
      // eslint-disable-next-line no-restricted-syntax
      e.preventDefault();
      holdCreepStart(state.step.holdCreep, +1);
    }
  }, {capture:true});
  document.addEventListener('keyup', (e)=>{
    if (state.mode !== 'step') return;
    if (e.key === ' ') {
      // eslint-disable-next-line no-restricted-syntax
      e.preventDefault();
      holdCreepStop();
    }
  }, {capture:true});

  // Hybrid listens to dB events and gates the Auto engine
  window.addEventListener('tp:db', (e)=>{
    if (state.mode !== 'hybrid') return;
    const db = e.detail?.db ?? -60;
    hybridHandleDb(db);
  });
}


// This router does not replace your autoscroll.js. It uses it.

// Step Mode: PageDown/PageUp advance to next/prev line; Space (hold) creeps slowly.

// Hybrid Mode: listens to tp:db; above threshold ⇒ start; below ⇒ pause.
