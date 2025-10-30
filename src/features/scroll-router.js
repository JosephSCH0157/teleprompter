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
let VAD_PROFILE = null;
const ASR_KEY = 'tp_asr_profiles_v1';
const PREF_KEY = 'tp_ui_prefs_v1';
const APPLY_KEY = 'tp_vad_apply_hybrid'; // keep existing apply flag for now
function _pickProfileId(asrState, prefs){
  try {
    const prefId = prefs && prefs.hybridUseProfileId;
    if (prefId && asrState && asrState.profiles && asrState.profiles[prefId]) return prefId;
    return (asrState && asrState.activeProfileId) || null;
  } catch { return null; }
}
function loadVadProfile(){
  try {
    const apply = localStorage.getItem(APPLY_KEY) === '1';
    const asrRaw = localStorage.getItem(ASR_KEY);
    const prefsRaw = localStorage.getItem(PREF_KEY);
    const asr = asrRaw ? (JSON.parse(asrRaw)||{}) : null;
    const prefs = prefsRaw ? (JSON.parse(prefsRaw)||{}) : null;
    const id = _pickProfileId(asr, prefs);
    if (id && asr && asr.profiles && asr.profiles[id] && asr.profiles[id].vad) {
      const p = asr.profiles[id];
      VAD_PROFILE = { apply, tonDb: Number(p.vad.tonDb), toffDb: Number(p.vad.toffDb), attackMs: Number(p.vad.attackMs), releaseMs: Number(p.vad.releaseMs), label: p.label };
    } else {
      // Fallback to legacy key if present
      const raw = localStorage.getItem('tp_vad_profile_v1');
      VAD_PROFILE = raw ? { apply, ...(JSON.parse(raw)||{}) } : null;
    }
  } catch { VAD_PROFILE = null; }
}
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

// ---------- HYBRID MODE (VAD/DB combine) ----------
let userEnabled = false; // user's Auto toggle intent
let dbGate = false, vadGate = false; // per-source gates
let dbAvail = false, vadAvail = false; // source availability
let gateTimer=0; // for dbGate smoothing
let gatePref = (function(){ try { return (JSON.parse(localStorage.getItem('tp_ui_prefs_v1')||'{}')||{}).hybridGate || 'db_or_vad'; } catch { return 'db_or_vad'; } })();

function combinedGate(pref, _dbAvail, _vadAvail, _dbGate, _vadGate){
  if (pref === 'db_and_vad' && (!_dbAvail || !_vadAvail)) return false;
  if (pref === 'db')  return _dbAvail  ? _dbGate  : false;
  if (pref === 'vad') return _vadAvail ? _vadGate : false;
  const okDb = _dbAvail ? _dbGate : false;
  const okVad = _vadAvail ? _vadGate : false;
  return okDb || okVad;
}

function applyGate(){
  const enabled = userEnabled && combinedGate(gatePref, dbAvail, vadAvail, dbGate, vadGate);
  try { Auto.setEnabled(enabled); } catch {}
  try {
    const chip = document.getElementById('autoChip');
    if (chip) {
      const stateTxt = userEnabled ? (enabled ? 'On' : 'Paused') : 'Manual';
      chip.textContent = `Auto: ${stateTxt}`;
      chip.setAttribute('data-state', stateTxt.toLowerCase());
    }
  } catch {}
  // Reflect user intent on the main Auto button label
  try {
    const btn = document.getElementById('autoToggle');
    if (btn) {
      const s = (function(){ try { return Number(localStorage.getItem('tp_auto_speed')||'60')||60; } catch { return 60; } })();
      if (!userEnabled) {
        btn.textContent = 'Auto-scroll: Off';
        btn.setAttribute('data-state','off');
      } else if (enabled) {
        btn.textContent = `Auto-scroll: On — ${s} px/s`;
        btn.setAttribute('data-state','on');
      } else {
        btn.textContent = `Auto-scroll: Paused — ${s} px/s`;
        btn.setAttribute('data-state','paused');
      }
      btn.setAttribute('aria-pressed', String(!!userEnabled));
    }
  } catch {}
}

function hybridHandleDb(db) {
  clearTimeout(gateTimer);
  dbAvail = true;
  // Prefer calibrated profile when applied
  if (VAD_PROFILE && VAD_PROFILE.apply) {
    const atk = Number(VAD_PROFILE.attackMs) || state.hybrid.attackMs;
    const rel = Number(VAD_PROFILE.releaseMs) || state.hybrid.releaseMs;
    const ton = Number(VAD_PROFILE.tonDb);
    const toff = Number(VAD_PROFILE.toffDb);
    if (dbGate) {
      // sustain while above toff; else release after rel
      if (Number.isFinite(toff) && db >= toff) {
        gateTimer = setTimeout(()=> { dbGate = true; applyGate(); }, 0);
      } else {
        gateTimer = setTimeout(()=> { dbGate = false; applyGate(); }, rel);
      }
    } else {
      if (Number.isFinite(ton) && db >= ton) {
        gateTimer = setTimeout(()=> { dbGate = true; applyGate(); }, atk);
      } else {
        gateTimer = setTimeout(()=> { dbGate = false; applyGate(); }, 0);
      }
    }
    return;
  }
  // Fallback: single-threshold behavior
  const { attackMs, releaseMs, thresholdDb } = state.hybrid;
  if (db >= thresholdDb) {
    gateTimer = setTimeout(()=> { dbGate = true; applyGate(); }, attackMs);
  } else {
    gateTimer = setTimeout(()=> { dbGate = false; applyGate(); }, releaseMs);
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

  // Flip global flags/classes for Rehearsal watermark + no-record promise
  try {
    const isRehearsal = (m === 'rehearsal');
    document.body && document.body.classList && document.body.classList.toggle('mode-rehearsal', isRehearsal);
    try { window.__tpNoRecord = isRehearsal; } catch {}
    try { window.HUD?.bus?.emit('mode:rehearsal', isRehearsal); } catch {}
    if (isRehearsal) {
      // Ensure the timed driver is the active engine (no-op if unavailable)
      try { window.scrollController?.setDriver?.('timed'); } catch {}
    }
  } catch {}

  // Base rule: Timed & Hybrid may run the Auto engine; Step never does.
  if (m === 'timed') {
    Auto.setEnabled(false); // user will press the Auto button to start
  } else if (m === 'hybrid') {
    // In Hybrid mode, default user intent is ON and speed preset to 21 px/s.
    try { Auto.setSpeed && Auto.setSpeed(21); } catch {}
    userEnabled = true; // let the gate control actual movement
    Auto.setEnabled(false); // engine follows gate; applyGate() will enable if open
  } else if (m === 'rehearsal') {
    // Rehearsal: steady timed auto-scroll; user uses the Auto toggle as usual
    Auto.setEnabled(false);
  } else {
    Auto.setEnabled(false); // step/wpm/asr/reh start paused
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

  // Recompute gate effects after mode change
  try { applyGate(); } catch {}
}

export function getMode(){ return state.mode; }
export function setMode(m){ applyMode(m); }

// Public actions the UI can call
export function step(dir=+1) { if (state.mode === 'step') stepOnce(dir); }

// Install router once
export function installScrollRouter() {
  try { if (window.__tpScrollRouterTsActive) return; } catch {}
  try { window.__tpScrollRouterJsActive = true; } catch {}
  restore();
  applyMode(state.mode);
  loadVadProfile();

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
  // VAD events: mark availability and gate boolean
  window.addEventListener('tp:vad', (e) => {
    if (state.mode !== 'hybrid') return;
    vadAvail = true;
    vadGate = !!(e && e.detail && e.detail.speaking);
    applyGate();
  });
  // Refresh VAD profile if it changes
  window.addEventListener('storage', (e) => {
    try {
      if (!e) return;
      if (e.key === ASR_KEY || e.key === PREF_KEY || e.key === APPLY_KEY || e.key === 'tp_vad_profile_v1') loadVadProfile();
      if (e.key === PREF_KEY) {
        try { gatePref = (JSON.parse(e.newValue||'{}')||{}).hybridGate || gatePref; } catch {}
      }
    } catch {}
  });
  window.addEventListener('tp:vad:profile', () => { try { loadVadProfile(); } catch {} });

  // Capture user Auto toggle intent
  try {
    document.addEventListener('click', (ev) => {
      const t = ev && ev.target;
      if (t && t.closest && t.closest('#autoToggle')) {
        userEnabled = !userEnabled;
        setTimeout(applyGate, 0);
      }
    }, { capture: true });
  } catch {}

  // Initialize userEnabled from current Auto state and apply once
  try {
    if (state.mode === 'hybrid') {
      userEnabled = true;
      const btn = document.getElementById('autoToggle');
      if (btn) {
        const s = (function(){ try { return Number(localStorage.getItem('tp_auto_speed')||'60')||60; } catch { return 60; } })();
        btn.dataset.state = 'on';
        btn.textContent = `Auto-scroll: On — ${s} px/s`;
      }
    } else {
      userEnabled = !!(Auto.getState && Auto.getState().enabled);
    }
  } catch {}
  applyGate();
  // Keep the label in sync with speed changes
  try {
    document.addEventListener('tp:autoSpeed', (e)=>{
      const btn = document.getElementById('autoToggle');
      if (!btn) return;
      const ds = btn.dataset && btn.dataset.state || '';
      const s = (e && e.detail && typeof e.detail.speed === 'number') ? e.detail.speed : (function(){ try { return Number(localStorage.getItem('tp_auto_speed')||'60')||60; } catch { return 60; } })();
      if (ds === 'on') btn.textContent = `Auto-scroll: On — ${s} px/s`;
      if (ds === 'paused') btn.textContent = `Auto-scroll: Paused — ${s} px/s`;
    });
  } catch {}
}


// This router does not replace your autoscroll.js. It uses it.

// Step Mode: PageDown/PageUp advance to next/prev line; Space (hold) creeps slowly.

// Hybrid Mode: listens to tp:db; above threshold ⇒ start; below ⇒ pause.
