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
// Smooth dB gate transitions (attack/release) and let applyGate() decide engine state.
let gateTimer: number | undefined;

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
import { createOrchestrator } from '../asr/v2/orchestrator';
import { createVadEventAdapter } from '../asr/v2/adapters/vad';

export function installScrollRouter(opts: ScrollRouterOpts){
  try { (window as any).__tpScrollRouterTsActive = true; } catch {}
  const { auto } = opts;
  restoreMode();
  applyMode(state.mode);
  // Reflect initial visibility for WPM controls
  try { updateWpmUiVisibility(); } catch {}
  // Reflect Auto control availability
  try { updateAutoUiForMode(); } catch {}

  // Track actual engine state and manage delayed stop when speech falls silent
  let enabledNow: boolean = false;

  // Helpers shared across handlers
  function mapWpmToPxPerSec(wpm: number, doc: Document): number {
    try {
      const cs = getComputedStyle(doc.documentElement);
      const fsPx = parseFloat(cs.getPropertyValue('--tp-font-size')) || 56;
      const lhScale = parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4;
      const lineHeightPx = fsPx * lhScale;
      const wpl = parseFloat(localStorage.getItem('tp_wpl_hint') || '8') || 8;
      const linesPerSec = (wpm / 60) / wpl;
      return linesPerSec * lineHeightPx;
    } catch { return (wpm / 60) / 8 * (56 * 1.4); }
  }
  function getTargetWpm(): number {
    try { return Number(localStorage.getItem('tp_wpm_target') || '150') || 150; } catch { return 150; }
  }
  function setTargetWpm(wpm: number) {
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const val = clamp(Math.round(wpm), 60, 260);
    try { localStorage.setItem('tp_wpm_target', String(val)); } catch {}
    try {
      const input = document.getElementById('wpmTarget') as HTMLInputElement | null;
      if (input) input.value = String(val);
    } catch {}
    // If active in WPM mode and enabled, apply immediately
    if (state.mode === 'wpm' && enabledNow) {
      try { const pxs = mapWpmToPxPerSec(val, document); auto?.setSpeed?.(pxs); } catch {}
    }
    try { updateWpmPxLabel(); } catch {}
  }
  function updateWpmUiVisibility() {
    try {
      const row = ensureWpmRow();
      if (!row) return;
      const on = state.mode === 'wpm';
      if (on) { row.classList.remove('visually-hidden'); row.setAttribute('aria-hidden','false'); }
      else { row.classList.add('visually-hidden'); row.setAttribute('aria-hidden','true'); }
      // Seed input value from storage
      const input = document.getElementById('wpmTarget') as HTMLInputElement | null;
      if (input) input.value = String(getTargetWpm());
      try { updateWpmPxLabel(); } catch {}
    } catch {}
  }
  function ensureWpmRow(): HTMLElement | null {
    try {
      let row = document.getElementById('wpmRow') as HTMLElement | null;
      if (row) return row;
      // Create on-the-fly if markup missing
      const autoRow = (document.getElementById('autoToggle') as HTMLElement | null)?.closest('.row') as HTMLElement | null;
      if (!autoRow || !autoRow.parentElement) return null;
      row = document.createElement('div');
      row.id = 'wpmRow';
      row.className = 'row visually-hidden';
      row.setAttribute('aria-hidden','true');
      row.innerHTML = `
        <label>Target WPM
          <input id="wpmTarget" type="number" min="60" max="260" step="5" value="150"/>
        </label>
        <span class="chip" id="wpmPx">≈ — px/s</span>
      `;
      autoRow.insertAdjacentElement('afterend', row);
      return row;
    } catch { return null; }
  }
  function updateWpmPxLabel(){
    try {
      const chip = document.getElementById('wpmPx');
      if (!chip) return;
      const pxs = mapWpmToPxPerSec(getTargetWpm(), document);
      const s = (Math.round(pxs * 10) / 10).toFixed(1);
      chip.textContent = `≈ ${s} px/s`;
      chip.title = `Mapped at current layout`;
    } catch {}
  }

  // Disable/enable Auto controls depending on mode
  function updateAutoUiForMode() {
    try {
      const asrLocked = state.mode === 'asr';
      const btn = document.getElementById('autoToggle') as HTMLButtonElement | null;
      const inc = document.getElementById('autoInc') as HTMLButtonElement | null;
      const dec = document.getElementById('autoDec') as HTMLButtonElement | null;
      const inp = document.getElementById('autoSpeed') as HTMLInputElement | null;
      [btn, inc, dec, inp].forEach((el: any) => {
        if (!el) return;
        el.toggleAttribute?.('disabled', asrLocked);
        if (asrLocked) el.setAttribute('title', 'Disabled in ASR mode — speed is controlled by ASR');
        else el.removeAttribute?.('title');
      });
      setAsrBadgeVisible(asrLocked);
    } catch {}
  }

  function setAsrBadgeVisible(on: boolean) {
    try {
      // Avoid duplicate messaging: if the Auto chip exists (and carries the suffix), skip the extra badge
      const hasAutoChip = !!document.getElementById('autoChip');
      if (hasAutoChip) {
        const existing = document.getElementById('asrSpeedBadge') as HTMLElement | null;
        if (existing) existing.style.display = 'none';
        return;
      }
      const after = document.getElementById('scrollChip') || document.querySelector('.topbar');
      let badge = document.getElementById('asrSpeedBadge') as HTMLElement | null;
      if (on) {
        if (!badge) {
          badge = document.createElement('span');
          badge.id = 'asrSpeedBadge';
          badge.className = 'chip chip-muted';
          badge.textContent = 'ASR controls speed';
          if (after && (after as any).after) (after as any).after(badge); else document.body.appendChild(badge);
        }
        badge.style.display = '';
        badge.setAttribute('aria-live','polite');
      } else if (badge) {
        badge.style.display = 'none';
      }
    } catch {}
  }

  // (Initial seeding moved below after variables are declared)

  // ASR v2 Orchestrator (minimal integration): only run when mode is 'wpm'/'asr' AND speech is active
  const orch = createOrchestrator();
  let orchRunning = false;
  // Require global speech sync to be active in any mode for engine to actually run
  let speechActive = false;
  async function ensureOrchestratorForMode() {
    try {
      // Only needed for ASR-driven pacing; WPM mode is fixed-target
      if ((state.mode === 'asr') && speechActive) {
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
  try {
    window.addEventListener('tp:speech-state' as any, (e: any) => {
      try {
        const running = !!(e && e.detail && e.detail.running);
        speechActive = running;
        applyGate();
        void ensureOrchestratorForMode();
      } catch {}
    });
  } catch {}
  // Initialize enabled state from engine
  enabledNow = (() => { try { return !!opts.auto.getState?.().enabled; } catch { return false; } })();
  let silenceTimer: number | undefined;

  // Speed tracking to avoid jumps when engine doesn't expose current speed
  let lastSpeed: number = (() => {
    try {
      const s = Number(opts.auto.getState?.().speed);
      if (Number.isFinite(s) && s > 0) return s;
    } catch {}
    try { return Number(localStorage.getItem('tp_auto_speed') || '60') || 60; } catch { return 60; }
  })();

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
  function setAutoChip(state: 'on' | 'paused' | 'manual', detail?: string, suffix?: string) {
    const el = chipEl();
    if (!el) return;
    const base = `Auto: ${state === 'on' ? 'On' : state === 'paused' ? 'Paused' : 'Manual'}`;
    el.textContent = suffix ? `${base} — ${suffix}` : base;
    el.classList.remove('on','paused','manual');
    el.classList.add(state);
    el.setAttribute('data-state', state);
    if (detail) el.title = detail;
  }

  // Per-mode speed persistence (fallback to global)
  const speedKey = (m: Mode) => `tp_speed_${m}`;
  const getStoredSpeedForMode = (m: Mode): number => {
    try {
      const v = Number(localStorage.getItem(speedKey(m)) || '');
      if (Number.isFinite(v) && v > 0) return v;
    } catch {}
    try { return Number(localStorage.getItem('tp_auto_speed') || '60') || 60; } catch { return 60; }
  };
  const setStoredSpeedForMode = (m: Mode, v: number) => {
    try { localStorage.setItem(speedKey(m), String(v)); } catch {}
    try { localStorage.setItem('tp_auto_speed', String(v)); } catch {}
  };
  const getStoredSpeed = (): number => getStoredSpeedForMode(state.mode);

  function applyGate() {
    if (state.mode !== 'hybrid') {
      // In ASR mode, the speech engine controls pacing; hard-disable Auto engine and UI
      if (state.mode === 'asr') {
        try { auto.setEnabled?.(false); } catch {}
        enabledNow = false;
        const detailAsr = 'Mode: asr • Auto is disabled — ASR controls speed';
        setAutoChip('manual', detailAsr, 'ASR controls speed');
        try {
          const btn = document.getElementById('autoToggle') as HTMLButtonElement | null;
          if (btn) { btn.textContent = 'Auto-scroll: Off — ASR mode'; btn.setAttribute('data-state','off'); btn.setAttribute('aria-pressed','false'); }
        } catch {}
        try { emitAutoState(); } catch {}
        try { setAsrBadgeVisible(true); } catch {}
        return;
      }
      try { setAsrBadgeVisible(false); } catch {}
      // Outside Hybrid, require speech sync to be active and user intent On
      if (silenceTimer) { try { clearTimeout(silenceTimer as any); } catch {} silenceTimer = undefined; }
      const want = !!userEnabled && !!speechActive;
      if (typeof auto.setEnabled === 'function') auto.setEnabled(want);
      enabledNow = want;
      // In WPM mode, map target WPM to px/s whenever enabled
      try {
        if (state.mode === 'wpm' && want) {
          const pxs = mapWpmToPxPerSec(getTargetWpm(), document);
          try { auto.setSpeed?.(pxs); lastSpeed = pxs; } catch {}
        }
      } catch {}
      const detail = `Mode: ${state.mode} • User: ${userEnabled ? 'On' : 'Off'} • Speech:${speechActive ? '1' : '0'}`;
  setAutoChip(userEnabled ? (enabledNow ? 'on' : 'paused') : 'manual', detail);
      try {
        const btn = document.getElementById('autoToggle') as HTMLButtonElement | null;
        if (btn) {
          const sRaw = getStoredSpeed();
          const s = (Math.round(sRaw * 10) / 10).toFixed(1);
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
  const pausedDueToGate = userEnabled && speechActive && !enabledNow && !isHybridBypass() && !computeGateWanted();
  setAutoChip(userEnabled ? (enabledNow ? 'on' : 'paused') : 'manual', detail, pausedDueToGate ? 'waiting for speech' : undefined);
    // Reflect user intent on the main Auto button label with speed and paused state
    try {
      const btn = document.getElementById('autoToggle') as HTMLButtonElement | null;
      if (btn) {
        const s = getStoredSpeed();
        const pausedDueToGate2 = userEnabled && speechActive && !enabledNow && !isHybridBypass() && !computeGateWanted();
        if (!userEnabled) {
          btn.textContent = 'Auto-scroll: Off';
          btn.setAttribute('data-state', 'off');
        } else if (enabledNow) {
          btn.textContent = `Auto-scroll: On — ${s} px/s`;
          btn.setAttribute('data-state', 'on');
        } else {
          btn.textContent = `Auto-scroll: Paused — ${s} px/s${pausedDueToGate2 ? ' (waiting for speech)' : ''}`;
          btn.setAttribute('data-state', 'paused');
        }
        btn.setAttribute('aria-pressed', String(!!userEnabled));
      }
    } catch {}
    try { emitAutoState(); } catch {}
  }

  onUiPrefs((p) => { gatePref = p.hybridGate; applyGate(); });

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
  const modeVal = (t as HTMLSelectElement).value as Mode;
  applyMode(modeVal);
        updateWpmUiVisibility();
  updateAutoUiForMode();
        applyGate();
        ensureOrchestratorForMode();
        // When switching into a non-WPM mode and Auto is desired, apply that mode's stored speed immediately
        try {
          if (state.mode !== 'wpm' && userEnabled && speechActive) {
            const s = getStoredSpeedForMode(state.mode);
            auto?.setSpeed?.(s);
            lastSpeed = s;
          }
        } catch {}
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
      // Smooth attack/release for dbGate, but do not toggle engine directly here
      try { if (gateTimer) { clearTimeout(gateTimer as any); gateTimer = undefined; } } catch {}
      const on = db >= DEFAULTS.hybrid.thresholdDb;
      const delay = on ? DEFAULTS.hybrid.attackMs : DEFAULTS.hybrid.releaseMs;
      gateTimer = setTimeout(() => {
        dbGate = on;
        gateTimer = undefined;
        applyGate();
      }, delay) as unknown as number;
    });
    window.addEventListener('tp:vad' as any, (e: any) => {
      vadGate = !!(e && e.detail && e.detail.speaking);
      applyGate();
    });
  } catch {}

  // Update WPM px/s label on typography/layout changes
  try {
    window.addEventListener('tp:lineMetricsDirty', () => { try { updateWpmPxLabel(); } catch {} });
  } catch {}

  // External user intent control (speech start/stop, automation)
  try {
    window.addEventListener('tp:autoIntent' as any, (e: any) => {
      try {
        const on = !!(e && e.detail && ((e.detail.on !== undefined) ? e.detail.on : e.detail.enabled));
        userEnabled = !!on;
        if (!userEnabled) { try { if (silenceTimer) { clearTimeout(silenceTimer as any); silenceTimer = undefined; } } catch {}
          try { if (gateTimer) { clearTimeout(gateTimer as any); gateTimer = undefined; } } catch {}
        }
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
          const seed = getStoredSpeed();
          try { auto.setSpeed?.(seed); } catch {}
          // Additionally, prime the low-level controller with the current speed if available
          try { (window as any).__scrollCtl?.setSpeed?.(seed); } catch {}
          lastSpeed = seed;
        }
        applyGate();
      }
    }, { capture: true });
  } catch {}

  // Seed initial speech/intent state if speech was started before router mounted
  try {
    const body = document.body as HTMLElement | null;
    const wasListening = !!(body && (body.classList.contains('speech-listening') || body.classList.contains('listening')));
    const speechOnFlag = (window as any).speechOn === true;
    if (wasListening || speechOnFlag) {
      speechActive = true;
      // Assume user's intent is ON if they already started speech sync
      userEnabled = true;
      // Warm engine with current speed so UI label is correct immediately
      const seed = getStoredSpeed();
      try { auto.setSpeed?.(seed); } catch {}
      try { (window as any).__scrollCtl?.setSpeed?.(seed); } catch {}
    }
  } catch {}

  // At startup, reflect initial state (including seeding above)
  applyGate();
  // If ASR modes selected initially, ensure orchestrator
  if (state.mode === 'wpm' || state.mode === 'asr') ensureOrchestratorForMode();

  // Keep the label in sync with speed changes while intent is ON/paused
  try {
    document.addEventListener('tp:autoSpeed' as any, (e: any) => {
      const btn = document.getElementById('autoToggle') as HTMLButtonElement | null;
      if (!btn) return;
      const ds = btn.dataset?.state || '';
      const raw = (e && e.detail && typeof e.detail.speed === 'number') ? e.detail.speed : getStoredSpeed();
      lastSpeed = raw;
      // Persist per-mode for non-WPM modes
      try {
        if (state.mode !== 'wpm') { setStoredSpeedForMode(state.mode as any, raw); }
      } catch {}
      const s = (Math.round(raw * 10) / 10).toFixed(1);
      if (ds === 'on') btn.textContent = `Auto-scroll: On — ${s} px/s`;
      if (ds === 'paused') btn.textContent = `Auto-scroll: Paused — ${s} px/s`;
      try { emitAutoState(); } catch {}
    });
  } catch {}

  // Global keybindings for speed tweaks — use the single setter
  try {
    // Helper: mapping and WPM target persistence
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    // duplicate mapWpmToPxPerSec removed (defined earlier in this module)
    // Initialize WPM UI on first load
    updateWpmUiVisibility();

    // Unified helpers so clicks and keys behave consistently across modes
    const adjustSpeed = (delta: number) => {
      try {
        const got = Number(auto?.getState?.().speed);
        const base = (Number.isFinite(got) && got > 0)
          ? got
          : (Number.isFinite(lastSpeed) && lastSpeed > 0 ? lastSpeed : getStoredSpeed());
        const next = clamp(base + delta, 1, 200);
        auto?.setSpeed?.(next);
        lastSpeed = next;
        try { if (state.mode !== 'wpm') setStoredSpeedForMode(state.mode as any, next); } catch {}
      } catch {}
    };
    const adjustWpmTarget = (delta: number) => {
      try {
        const next = getTargetWpm() + delta;
        setTargetWpm(next);
      } catch {}
    };

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
        if (state.mode === 'wpm') {
          const stepWpm = e.shiftKey ? 10 : 5;
          adjustWpmTarget(wantUp ? stepWpm : -stepWpm);
        } else if (state.mode !== 'asr') {
          const step = e.shiftKey ? 5 : 0.5;
          adjustSpeed(wantUp ? step : -step);
        } else {
          // ASR mode: ignore Auto speed hotkeys
          return;
        }
      } catch {}
    }, { capture: true });

    // Also handle click on +/- buttons here so behavior is identical in all modes
    document.addEventListener('click', (e: MouseEvent) => {
      try {
        const t = e.target as HTMLElement | null;
        if (!t) return;
        const incBtn = t.closest?.('#autoInc');
        const decBtn = t.closest?.('#autoDec');
        if (!incBtn && !decBtn) return;
        e.preventDefault();
        e.stopImmediatePropagation?.();
        if (state.mode === 'wpm') {
          const stepWpm = (e.shiftKey ? 10 : 5);
          adjustWpmTarget(incBtn ? stepWpm : -stepWpm);
        } else if (state.mode !== 'asr') {
          const step = (e.shiftKey ? 5 : 0.5);
          adjustSpeed(incBtn ? step : -step);
        } else {
          // ASR mode: ignore Auto speed +/-
          return;
        }
      } catch {}
    }, { capture: true });

    // WPM Target input change handler
    document.addEventListener('input', (e: Event) => {
      try {
        const t = e.target as HTMLElement | null;
        if ((t as HTMLInputElement)?.id !== 'wpmTarget') return;
        const v = Number((t as HTMLInputElement).value);
        if (!Number.isFinite(v)) return;
        setTargetWpm(v);
      } catch {}
    }, { capture: true });
  } catch {}
}
