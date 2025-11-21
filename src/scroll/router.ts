// Scroll Mode Router: owns a single active strategy and fans out start/stop/params
import { on } from '../core/bus';
import * as Auto from '../features/autoscroll';

type ScrollMode = 'timed' | 'wpm' | 'hybrid' | 'asr' | 'step' | 'rehearsal';

// Utilities
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const now = () => performance.now();
const hasWindow = () => typeof window !== 'undefined';

const SCROLL_MODE_STORAGE_KEY = 'tp_scroll_mode';

function getStore() {
  if (!hasWindow()) return null;
  try { return (window as any).__tpStore || null; } catch { return null; }
}

function persistScrollMode(mode: string) {
  const key = String(mode || '').toLowerCase();
  if (!key) return;
  try {
    const store = getStore();
    if (store) store.set('scrollMode', key);
  } catch {}
  if (!hasWindow()) return;
  try {
    const ls = window.localStorage;
    if (ls) ls.setItem(SCROLL_MODE_STORAGE_KEY, key);
  } catch {}
}

function restoreScrollMode() {
  try {
    const store = getStore();
    if (store) {
      const value = store.get('scrollMode');
      if (value) return String(value);
    }
  } catch {}
  if (!hasWindow()) return null;
  try {
    const ls = window.localStorage;
    return ls ? ls.getItem(SCROLL_MODE_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

// State
let current: ScrollMode = 'timed';
let running = false;
let unsubscribers: Array<() => void> = [];
const params = {
  timed: { speed: 25 },
  wpm: { targetWpm: 180, basePx: 25, minPx: 6, maxPx: 200, ewmaSec: 1.0 },
  hybrid: { attackMs: 120, releaseMs: 250, idleMs: 1500 },
  asr: { aggressiveness: 2, recoveryChars: 120 },
  step: { stepPx: 120, snapToMarker: false, creepPx: 0 },
  rehearsal: { pausePunct: '.,;:?!', resumeMs: 1000, cue: 'visual' },
};

function setModeChip(text: string) {
  try {
    let chip = document.getElementById('modeChip');
    if (!chip) {
      const topbar = document.querySelector('.topbar') || document.body;
      chip = document.createElement('span');
      chip.id = 'modeChip'; chip.className = 'chip';
      topbar && topbar.insertBefore(chip, document.getElementById('autoToggle') || topbar.firstChild);
    }
    chip.textContent = `Mode: ${text}`;
  } catch {}
}

// Strategies
const strategies: Record<ScrollMode, {
  start: () => void;
  stop: () => void;
  onParams?: (p: any) => void;
}> = {
  timed: {
    start() {
      Auto.setSpeed(params.timed.speed);
      Auto.setEnabled?.(true);
      if (!Auto.getState().enabled) Auto.toggle();
    },
    stop() { if (Auto.getState().enabled) Auto.toggle(); },
    onParams(p) { Object.assign(params.timed, p || {}); if (running && current === 'timed') Auto.setSpeed(params.timed.speed); },
  },
  wpm: (() => {
    let ewma: number | null = null; let lastTs = 0;
    const mapToPx = (wpmVal: number) => {
      const base = params.wpm.basePx;
      const px = (wpmVal / Math.max(60, params.wpm.targetWpm)) * base;
      return clamp(px, params.wpm.minPx, params.wpm.maxPx);
    };
    const onWpm = (d: { value?: unknown }) => {
      const v = Number(d && d.value);
      if (!Number.isFinite(v) || v <= 0) return;
      const ts = now();
      const dt = Math.max(1 / 60, (ts - (lastTs || ts)) / 1000);
      const a = clamp(dt / (params.wpm.ewmaSec || 1), 0.01, 1);
      ewma = (ewma == null) ? v : (ewma + a * (v - ewma));
      lastTs = ts;
      const speed = mapToPx(ewma);
      Auto.setSpeed(speed);
    };
    return {
      start() { Auto.setEnabled?.(true); if (!Auto.getState().enabled) Auto.toggle(); unsubscribers.push(on('wpm', onWpm)); },
      stop() { if (Auto.getState().enabled) Auto.toggle(); },
      onParams(p) { Object.assign(params.wpm, p || {}); },
    };
  })(),
  hybrid: (() => {
    let speak = false; let attT = 0; let relT = 0; let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const onVad = (d: { speaking?: boolean }) => {
      speak = !!(d && d.speaking);
      const t = now();
      if (speak) attT = t; else relT = t;
    };
    function tick() {
      if (!running || current !== 'hybrid') return;
      const t = now();
      const shouldRun = speak ? (t - attT) >= params.hybrid.attackMs : !((t - relT) >= params.hybrid.releaseMs);
      const isOn = Auto.getState().enabled;
      if (shouldRun && !isOn) { Auto.toggle(); }
      if (!shouldRun && isOn) { Auto.toggle(); }
      if (isOn) {
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      } else if (!idleTimer) {
        idleTimer = setTimeout(() => { /* fully idle state hook */ }, params.hybrid.idleMs);
      }
      requestAnimationFrame(tick);
    }
    return { start() { unsubscribers.push(on('vad', onVad)); if (!Auto.getState().enabled) Auto.toggle(); requestAnimationFrame(tick); }, stop() { if (Auto.getState().enabled) Auto.toggle(); }, onParams(p) { Object.assign(params.hybrid, p || {}); } };
  })(),
  asr: {
    start() { if (!Auto.getState().enabled) Auto.toggle(); },
    stop() { if (Auto.getState().enabled) Auto.toggle(); },
    onParams(p) { Object.assign(params.asr, p || {}); },
  },
  step: (() => {
    const onStep = () => {
      try { if ((window as any).__TP_REHEARSAL) return; } catch {}
      Auto.nudge(params.step.stepPx);
    };
    return { start() { if (Auto.getState().enabled) Auto.toggle(); unsubscribers.push(on('step', onStep)); }, stop() { unsubscribers.push(() => {}); }, onParams(p) { Object.assign(params.step, p || {}); } };
  })(),
  rehearsal: (() => {
    let pausedUntil = 0;
    const punctSet = () => new Set(String(params.rehearsal.pausePunct || '.,;:?!').split(''));
    function isMarkerOnPunct() {
      try {
        const viewer = document.getElementById('viewer'); if (!viewer) return false;
        const markerY = viewer.getBoundingClientRect().top + viewer.clientHeight * 0.40;
        const lines = viewer.querySelectorAll('.line');
        for (let i = 0; i < lines.length; i++) {
          const r = lines[i].getBoundingClientRect();
          if (r.top <= markerY && r.bottom >= markerY) {
            const txt = lines[i].textContent || ''; const ch = txt.trim().slice(-1);
            return punctSet().has(ch);
          }
        }
      } catch {}
      return false;
    }
    function tick() {
      if (!running || current !== 'rehearsal') return;
      const t = now();
      if (t < pausedUntil) { if (Auto.getState().enabled) Auto.toggle(); requestAnimationFrame(tick); return; }
      if (isMarkerOnPunct()) { pausedUntil = t + (params.rehearsal.resumeMs || 1000); if (Auto.getState().enabled) Auto.toggle(); }
      else { if (!Auto.getState().enabled) Auto.toggle(); }
      requestAnimationFrame(tick);
    }
    return { start() { requestAnimationFrame(tick); }, stop() { /* engine toggled inside */ }, onParams(p) { Object.assign(params.rehearsal, p || {}); } };
  })(),
};

export function setMode(mode: string) {
  const key = String(mode || '').toLowerCase() as ScrollMode;
  if (!strategies[key]) return;
  if (running) { try { strategies[current].stop(); } catch {} }
  unsubscribers.forEach(fn => { try { fn(); } catch {} }); unsubscribers = [];
  current = key; setModeChip({ timed: 'Timed', wpm: 'WPM', hybrid: 'Hybrid', asr: 'ASR', step: 'Step', rehearsal: 'Rehearsal' }[key] || key);
  persistScrollMode(key);
  if (running) { try { strategies[current].start(); } catch {} }
}

export function start() { running = true; try { strategies[current].start(); } catch {} }
export function stop() { running = false; try { strategies[current].stop(); } catch {} }
export function onParams(p: unknown) { try { strategies[current].onParams && strategies[current].onParams(p); } catch {} }
export function getMode() { return current; }
export function isRunning() { return !!running; }

// UI wiring: Mode select + settings (minimal, inline popover)
function installModeUi() {
  try {
    const topbar = document.querySelector('.topbar'); if (!topbar) return;
    let sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
    if (!sel) {
      sel = document.createElement('select'); sel.id = 'scrollMode'; sel.className = 'select-sm';
      ['Timed', 'WPM', 'Hybrid', 'ASR', 'Step', 'Rehearsal'].forEach((name) => { const opt = document.createElement('option'); opt.value = name.toLowerCase(); opt.textContent = name; sel!.appendChild(opt); });
      const autoBtn = document.getElementById('autoToggle');
      if (autoBtn && autoBtn.parentNode) autoBtn.parentNode.insertBefore(sel, autoBtn);
      else topbar.appendChild(sel);
    }
    const restored = restoreScrollMode();
    if (restored && strategies[restored as ScrollMode]) current = restored as ScrollMode;
    sel.value = current;
    const handleModeChange = () => { setMode(sel!.value); updateHelp(); };
    sel.addEventListener('change', handleModeChange);

    let gear = document.getElementById('scrollModeSettings');
    if (!gear) { gear = document.createElement('button'); gear.id = 'scrollModeSettings'; gear.className = 'chip'; gear.textContent = '⚙'; sel.insertAdjacentElement('afterend', gear); }

    let help = document.getElementById('scrollModeHelp');
    if (!help) {
      help = document.createElement('span');
      help.id = 'scrollModeHelp';
      help.className = 'muted';
      help.setAttribute('aria-live', 'polite');
      help.style.marginLeft = '8px';
      help.style.fontSize = '12px';
      gear.insertAdjacentElement('afterend', help);
    }
    function updateHelp() {
      try {
        const h = document.getElementById('scrollModeHelp');
        if (!h) return;
        const m = getMode();
        if (m === 'rehearsal') {
          h.textContent = 'Rehearsal is wheel/touchpad only; recording, pedals, auto-scroll and ASR are disabled.';
        } else {
          h.textContent = '';
        }
      } catch {}
    }
    updateHelp();

    let panel = document.getElementById('scrollModePanel');
    if (!panel) {
      panel = document.createElement('div'); panel.id = 'scrollModePanel'; panel.className = 'overlay hidden'; panel.innerHTML = '<div class="sheet"><h4>Mode Settings</h4><div id="scrollModeBody"></div><div class="settings-footer"><button id="scrollModeClose" class="btn-chip">Close</button></div></div>';
      document.body.appendChild(panel);
    }
    const body = () => document.getElementById('scrollModeBody');
    function open() { renderPanel(); panel!.classList.remove('hidden'); }
    function close() { panel!.classList.add('hidden'); }
    gear.addEventListener('click', open);
    panel.addEventListener('click', (e) => { if (e.target === panel) close(); });
    document.getElementById('scrollModeClose')?.addEventListener('click', close);

    function persistParam(mode: ScrollMode, key: string, value: unknown) {
      try {
        const S = ((window as any) && (window as any).__tpStore) ? (window as any).__tpStore : null; if (!S) return;
        if (mode === 'timed' && key === 'speed') S.set('timedSpeed', value);
        if (mode === 'wpm') {
          if (key === 'targetWpm') S.set('wpmTarget', value);
          else if (key === 'basePx') S.set('wpmBasePx', value);
          else if (key === 'minPx') S.set('wpmMinPx', value);
          else if (key === 'maxPx') S.set('wpmMaxPx', value);
          else if (key === 'ewmaSec') S.set('wpmEwmaSec', value);
        }
        if (mode === 'hybrid') {
          if (key === 'attackMs') S.set('hybridAttackMs', value);
          else if (key === 'releaseMs') S.set('hybridReleaseMs', value);
          else if (key === 'idleMs') S.set('hybridIdleMs', value);
        }
        if (mode === 'step' && key === 'stepPx') S.set('stepPx', value);
        if (mode === 'rehearsal') {
          if (key === 'pausePunct') S.set('rehearsalPunct', String(value || ''));
          else if (key === 'resumeMs') S.set('rehearsalResumeMs', value);
        }
      } catch {}
    }

    function renderPanel() {
      const mode = getMode();
      const p = (params as any)[mode] || {};
      const B = body(); if (!B) return;
      const field = (id: string, label: string, val: unknown, extra = '') => `<label>${label} <input id="${id}" type="number" class="select-md" value="${String(val)}" ${extra}/></label>`;
      if (mode === 'timed') {
        B.innerHTML = `<div class="row">${field('m_speed', 'Speed (px/s)', p.speed, 'min="1" max="200" step="1"')}</div>`;
      } else if (mode === 'wpm') {
        B.innerHTML = `<div class="row">${field('m_target', 'Target WPM', p.targetWpm, 'min="60" max="300" step="10"')}${field('m_base', 'Base px/s', p.basePx, 'min="6" max="200" step="1"')}</div>
        <div class="row">${field('m_min', 'Min px/s', p.minPx, 'min="6" max="200" step="1"')}${field('m_max', 'Max px/s', p.maxPx, 'min="6" max="200" step="1"')}</div>
        <div class="row">${field('m_ewma', 'EWMA (sec)', p.ewmaSec, 'min="0.1" max="5" step="0.1"')}</div>`;
      } else if (mode === 'hybrid') {
        B.innerHTML = `<div class="row">${field('m_attack', 'Attack (ms)', p.attackMs, 'min="0" max="2000" step="10"')}${field('m_release', 'Release (ms)', p.releaseMs, 'min="0" max="2000" step="10"')}</div>
        <div class="row">${field('m_idle', 'Idle timeout (ms)', p.idleMs, 'min="0" max="10000" step="100"')}</div>`;
      } else if (mode === 'step') {
        B.innerHTML = `<div class="row">${field('m_step', 'Step (px)', p.stepPx, 'min="20" max="800" step="10"')}</div>`;
      } else if (mode === 'rehearsal') {
        B.innerHTML = `
        <div class="row"><label>Pause at <input id="m_punct" type="text" class="select-md" value="${p.pausePunct}"/></label></div>
        <div class="row">${field('m_resume', 'Resume delay (ms)', p.resumeMs, 'min="100" max="5000" step="100"')}</div>
          <div class="row" style="margin-top:8px;font-size:12px;line-height:1.4;color:#789;">Rehearsal is wheel/touchpad only; recording, pedals, auto-scroll and ASR are disabled. Use the dropdown to exit.</div>
        `;
      } else if (mode === 'asr') {
        B.innerHTML = `<div class="row">Alignment uses orchestrator when available. No extra settings.</div>`;
      }
      const bindNum = (id: string, key: string, parent: Record<string, any>) => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el) el.addEventListener('input', () => { const v = Number(el.value); if (Number.isFinite(v)) { parent[key] = v; persistParam(mode as ScrollMode, key, v); strategies[mode as ScrollMode].onParams && strategies[mode as ScrollMode].onParams!({}); } });
      };
      if (mode === 'timed') { bindNum('m_speed', 'speed', p); }
      if (mode === 'wpm') { bindNum('m_target', 'targetWpm', p); bindNum('m_base', 'basePx', p); bindNum('m_min', 'minPx', p); bindNum('m_max', 'maxPx', p); bindNum('m_ewma', 'ewmaSec', p); }
      if (mode === 'hybrid') { bindNum('m_attack', 'attackMs', p); bindNum('m_release', 'releaseMs', p); bindNum('m_idle', 'idleMs', p); }
      if (mode === 'step') { bindNum('m_step', 'stepPx', p); }
      if (mode === 'rehearsal') {
        const punct = document.getElementById('m_punct') as HTMLInputElement | null;
        if (punct) punct.addEventListener('input', () => { p.pausePunct = String(punct.value || '.,;:?!'); persistParam(mode as ScrollMode, 'pausePunct', p.pausePunct); });
        bindNum('m_resume', 'resumeMs', p);
      }
    }
  } catch {}
}

export function installScrollModes() {
  try {
    Auto.initAutoscrollFeature();
    try {
      const S = getStore();
      if (S) {
        const ts = S.get('timedSpeed'); if (ts != null) params.timed.speed = Number(ts) || params.timed.speed;
        const wpt = S.get('wpmTarget'); if (wpt != null) params.wpm.targetWpm = Number(wpt) || params.wpm.targetWpm;
        const wpb = S.get('wpmBasePx'); if (wpb != null) params.wpm.basePx = Number(wpb) || params.wpm.basePx;
        const wpn = S.get('wpmMinPx'); if (wpn != null) params.wpm.minPx = Number(wpn) || params.wpm.minPx;
        const wpx = S.get('wpmMaxPx'); if (wpx != null) params.wpm.maxPx = Number(wpx) || params.wpm.maxPx;
        const wpe = S.get('wpmEwmaSec'); if (wpe != null) params.wpm.ewmaSec = Number(wpe) || params.wpm.ewmaSec;
        const ha = S.get('hybridAttackMs'); if (ha != null) params.hybrid.attackMs = Number(ha) || params.hybrid.attackMs;
        const hr = S.get('hybridReleaseMs'); if (hr != null) params.hybrid.releaseMs = Number(hr) || params.hybrid.releaseMs;
        const hi = S.get('hybridIdleMs'); if (hi != null) params.hybrid.idleMs = Number(hi) || params.hybrid.idleMs;
        const sp = S.get('stepPx'); if (sp != null) params.step.stepPx = Number(sp) || params.step.stepPx;
        const rp = S.get('rehearsalPunct'); if (rp != null) params.rehearsal.pausePunct = String(rp || params.rehearsal.pausePunct);
        const rr = S.get('rehearsalResumeMs'); if (rr != null) params.rehearsal.resumeMs = Number(rr) || params.rehearsal.resumeMs;
      }
    } catch {}
    const savedMode = restoreScrollMode();
    if (savedMode && strategies[savedMode as ScrollMode]) current = savedMode as ScrollMode;
    installModeUi();
    setMode(current); setModeChip({ timed: 'Timed', wpm: 'WPM', hybrid: 'Hybrid', asr: 'ASR', step: 'Step', rehearsal: 'Rehearsal' }[current] || current);
  } catch (e) { console.warn('[scroll/router] init failed', e); }
}

// Single entry: aligns with TS boot orchestration
export function initScrollRouter() {
  installScrollModes();
}
