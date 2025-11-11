/**
 * Scroll Router (TypeScript)
 * - Strongly-typed modes & gate
 * - WPM motor integration (chip, PRM, stalls, observers, drag/snap, selection/background pause)
 * - CI test nudge hook
 */

import { createWpmScroller } from './features/wpm';
import type { WpmMotor } from './features/wpm';

// ---------- Types ----------

export type ScrollMode = 'manual' | 'step' | 'wpm' | 'asr' | 'hybrid';

export interface GateState {
  mode: ScrollMode;
  user: boolean;    // user auto toggle / intent
  speech: boolean;  // speech engine gate (ignored for pure WPM)
  open: boolean;    // derived gate result
}

type LogFn = (_tag: string, _data?: unknown) => void;

declare global {
  interface Window {
    HUD?: { log(_tag: string, _data?: unknown): void };
    __tpAutoOn?: boolean;
    __tpTestNudgeWpm?: () => void;
  }
}

// ---------- HUD logging ----------

const HUD: { log?: LogFn } | undefined = (window as any).HUD;
const log: LogFn = (_tag, _data) => HUD?.log?.(_tag, _data);

// ---------- DOM helpers ----------

const getViewer = (): HTMLElement | null => document.getElementById('viewer');

const getWpmTargetInput = (): HTMLInputElement | null =>
  document.getElementById('wpmTarget') as HTMLInputElement | null;

// Safe localStorage helpers
const lsGet = (k: string): string | null => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const lsSet = (k: string, v: string): void => {
  try { localStorage.setItem(k, v); } catch {}
};

// ---------- Mode + Gate state ----------

let currentMode: ScrollMode = 'manual';
let _userIntent = false;   // auto toggle (reserved)
let _speechGate = false;   // speech engine (reserved)
let lastGateOpen = false;
let lastGateLog = 0;

// User target WPM (persisted)
let wpmSetting = Number(lsGet('tp_wpm') ?? 120);
if (!Number.isFinite(wpmSetting) || wpmSetting <= 0) wpmSetting = 120;

// Reduced motion policy
const PRM = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : ({ matches: false } as MediaQueryList);

// ---------- WPM Motor ----------

const wpm: WpmMotor = createWpmScroller(getViewer, (t, d) => log(`wpm:${t}`, d));

// ---------- Chip UI ----------

let wpmChipTimer: number | undefined;
let resizeObs: ResizeObserver | null = null;
let stallBlinkTimer: number | undefined;

function ensureWpmChip(): HTMLElement {
  let el = document.getElementById('wpmChip') as HTMLElement | null;
  if (el) return el;

  const mk = () => {
    const n = document.createElement('span');
    n.id = 'wpmChip';
    n.className = 'tp-chip tp-chip--wpm tp-chip--ok tp-chip--fade';
    n.setAttribute('role', 'status');
    n.setAttribute('aria-live', 'polite');
    n.textContent = '—';
    return n;
  };

  const autoPill = document.querySelector('#autoPill, .auto-pill, [data-pill="auto"]');
  if (autoPill?.parentElement) {
    el = mk();
    autoPill.parentElement.insertBefore(el, autoPill.nextSibling);
    hydrateWpmChipPosition(el, true);
    enableWpmChipDrag(el);
    return el;
  }

  const host = document.querySelector('#modePills, #statusBar, #controlBar, #topBar');
  if (host) {
    el = mk();
    (host as HTMLElement).appendChild(el);
    hydrateWpmChipPosition(el, true);
    enableWpmChipDrag(el);
    return el;
  }

  el = mk();
  Object.assign(el.style, { position: 'fixed', top: '12px', right: '12px', zIndex: '1000' });
  document.body.appendChild(el);
  hydrateWpmChipPosition(el, false);
  enableWpmChipDrag(el);
  return el;
}

function setWpmChip(text: string, state: 'ok' | 'muted' | 'end' = 'ok') {
  const el = ensureWpmChip();
  el.textContent = text;
  el.classList.remove('tp-chip--ok', 'tp-chip--muted', 'tp-chip--end');
  el.classList.add(`tp-chip--${state}`);
}

function showWpmChip() {
  const el = ensureWpmChip();
  el.classList.remove('tp-chip--hidden');
}

function fadeOutWpmChip(delay = 2000) {
  const el = document.getElementById('wpmChip');
  if (!el) return;
  el.classList.remove('tp-chip--hidden');
  window.setTimeout(() => el.classList.add('tp-chip--hidden'), delay);
}

// ------- Chip drag + snapping + persistence -------

const CHIP_POS_KEY = 'tp_wpm_chip_pos';

function hydrateWpmChipPosition(el: HTMLElement, allowFloat: boolean) {
  try {
    const raw = lsGet(CHIP_POS_KEY);
    if (!raw) return;
    const pos = JSON.parse(raw) as { top?: number; left?: number; right?: number };
    if (allowFloat && el.parentElement !== document.body) {
      const r = el.getBoundingClientRect();
      document.body.appendChild(el);
      Object.assign(el.style, { position: 'fixed', top: `${r.top}px`, left: `${r.left}px`, right: '', zIndex: '1000' });
    }
    if (typeof pos.top === 'number') el.style.top = `${pos.top}px`;
    if (typeof pos.left === 'number') { el.style.left = `${pos.left}px`; el.style.right = ''; }
    else if (typeof pos.right === 'number') { el.style.right = `${pos.right}px`; el.style.left = ''; }
  } catch {}
}

function saveWpmChipPosition(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const fromRight = Math.max(0, window.innerWidth - rect.right);
  const pos = (fromRight < rect.left)
    ? { top: Math.max(0, rect.top), right: fromRight }
    : { top: Math.max(0, rect.top), left: Math.max(0, rect.left) };
  try { lsSet(CHIP_POS_KEY, JSON.stringify(pos)); } catch {}
}

function readMagnetThreshold(): number {
  const raw = Number(lsGet('tp_chip_magnet_px'));
  return Number.isFinite(raw) && raw > 0 ? Math.max(4, Math.min(120, raw)) : 24;
}

function snapChipToEdge(el: HTMLElement, threshold = readMagnetThreshold()) {
  const r = el.getBoundingClientRect();
  const leftGap  = r.left;
  const rightGap = window.innerWidth  - r.right;
  const topGap   = r.top;
  const botGap   = window.innerHeight - r.bottom;

  // Snap horizontally
  if (Math.min(leftGap, rightGap) <= threshold) {
    if (leftGap < rightGap) { el.style.left = '12px'; el.style.right = ''; }
    else { el.style.right = '12px'; el.style.left = ''; }
  }

  // Snap vertically
  if (Math.min(topGap, botGap) <= threshold) {
    if (topGap < botGap) el.style.top = '12px';
    else el.style.top = `${Math.max(12, window.innerHeight - r.height - 12)}px`;
  }

  // Topbar magnet
  const bar = document.querySelector('#modePills, #statusBar, #controlBar, #topBar') as HTMLElement | null;
  if (bar) {
    const b = bar.getBoundingClientRect();
    const overlapX = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left));
    const overlapY = Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top));
    if (overlapX > 6 && overlapY > 6) el.style.top = `${b.bottom + 8}px`;
  }
}

function enableWpmChipDrag(el: HTMLElement) {
  let dragging = false, ox = 0, oy = 0;

  const toFloatIfNeeded = () => {
    if (el.parentElement !== document.body) {
      const r = el.getBoundingClientRect();
      document.body.appendChild(el);
      Object.assign(el.style, { position: 'fixed', top: `${r.top}px`, left: `${r.left}px`, right: '', zIndex: '1000' });
    }
  };

  // dbl-click to reset position
  el.addEventListener('dblclick', () => {
    try { localStorage.removeItem(CHIP_POS_KEY); } catch {}
    if (el.parentElement !== document.body) document.body.appendChild(el);
    Object.assign(el.style, { position: 'fixed', top: '12px', right: '12px', left: '', zIndex: '1000' });
  }, { passive: true });

  el.addEventListener('pointerdown', (ev: PointerEvent) => {
    dragging = true; toFloatIfNeeded(); el.classList.add('tp-chip--drag');
    const rect = el.getBoundingClientRect();
    ox = ev.clientX - rect.left; oy = ev.clientY - rect.top;
    log('wpm:chip:drag:start');
  }, { passive: true });

  window.addEventListener('pointermove', (ev: PointerEvent) => {
    if (!dragging) return;
    const x = Math.max(0, Math.min(window.innerWidth  - 24, ev.clientX - ox));
    const y = Math.max(0, Math.min(window.innerHeight - 24, ev.clientY - oy));
    el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.right = '';
  }, { passive: true });

  window.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false; el.classList.remove('tp-chip--drag');
    snapChipToEdge(el, readMagnetThreshold());
    saveWpmChipPosition(el);
    log('wpm:chip:drag:end');
  }, { passive: true });
}

// ---------- Tooltip (reduced-motion stall fallback) ----------

let chipTipTimer: number | undefined;

function ensureChipTooltip(): HTMLElement {
  let tip = document.getElementById('wpmChipTip') as HTMLElement | null;
  if (tip) return tip;
  tip = document.createElement('div');
  tip.id = 'wpmChipTip';
  tip.className = 'tp-chip-tip';
  tip.setAttribute('role', 'status');
  tip.setAttribute('aria-live', 'polite');
  document.body.appendChild(tip);
  return tip;
}

function showChipTooltip(msg: string, ms = 1500) {
  const chip = ensureWpmChip();
  const tip  = ensureChipTooltip();
  tip.textContent = msg;
  const c = chip.getBoundingClientRect();
  const x = Math.min(window.innerWidth - 12, c.right + 10);
  const y = Math.max(12, c.top);
  Object.assign(tip.style, { left: `${x}px`, top: `${y}px` });
  tip.classList.add('tp-chip-tip--show');
  clearTimeout(chipTipTimer);
  chipTipTimer = window.setTimeout(() => tip.classList.remove('tp-chip-tip--show'), ms);
}

// ---------- PRM policy + helpers ----------

function viewerScrollable(): boolean {
  const sc = getViewer();
  return !!sc && sc.scrollHeight - sc.clientHeight > 2;
}

function currentLineHeightPx(): number {
  const sc = getViewer();
  const probe = sc?.querySelector<HTMLElement>('[data-line], .line, p, span');
  const h = probe?.getBoundingClientRect().height || 28;
  return Math.max(12, Math.min(96, h));
}

function applyReducedMotionPolicy() {
  if (PRM && PRM.matches) {
    wpmSetting = Math.min(wpmSetting, Number(lsGet('tp_prm_wpm_cap') ?? 90) || 90);
    if (wpm.isRunning()) wpm.setRateWpm(wpmSetting);
    setWpmChip(`Reduced • ${wpmSetting} WPM`, 'muted');
  }
}
PRM.addEventListener?.('change', applyReducedMotionPolicy);

// ---------- Chip warn blink (class-based) ----------

function blinkChipWarn() {
  const el = ensureWpmChip();
  el.classList.remove('tp-chip--warn', 'tp-chip--warn-blink');
  // reflow to retrigger keyframes
  void (el as any).offsetWidth;
  el.classList.add('tp-chip--warn', 'tp-chip--warn-blink');
  clearTimeout(stallBlinkTimer);
  stallBlinkTimer = window.setTimeout(() => {
    el.classList.remove('tp-chip--warn', 'tp-chip--warn-blink');
  }, 450);
}

function notifyStall() {
  if (PRM && PRM.matches) showChipTooltip('Stall detected (reduced motion)');
  else blinkChipWarn();
}

// ---------- Chip updater + observers ----------

function startWpmChip(_startWpm: number) {
  stopWpmChip();
  const interval = 250;

  wpmChipTimer = window.setInterval(() => {
    // End-of-script mid-tick?
    if (wpm.didEnd?.()) {
      stopWpmChip();
      setWpmChip('End of script', 'end');
      fadeOutWpmChip(2500);
      return;
    }

    const pxs = wpm.getPxPerSec?.() || 0;
    const lps = pxs / currentLineHeightPx();
    const prefix = PRM.matches ? 'Reduced • ' : '';
    setWpmChip(`${prefix}${wpmSetting} WPM • ${Math.round(pxs)} px/s • ~${lps.toFixed(2)} lps`, 'ok');

    // stall hint when px/s is near zero while we think we're running
    if (pxs < 1 && isAutoOn() && currentMode === 'wpm') notifyStall();
  }, interval);
}

function stopWpmChip() {
  if (wpmChipTimer) {
    clearInterval(wpmChipTimer);
    wpmChipTimer = undefined;
  }
}

function attachViewerObservers(viewer: HTMLElement | null, motor = wpm, getWpm = () => wpmSetting) {
  if (!viewer) return;
  detachViewerObservers();
  resizeObs = new ResizeObserver(() => {
    if (motor.isRunning()) motor.recalcFromDom(getWpm());
  });
  resizeObs.observe(viewer);
}

function detachViewerObservers() {
  if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
  stopWpmChip();
}

// ---------- Manual/selection/background pause ----------

let userPauseTimer: number | undefined;
let selPauseTimer: number | undefined;

function isAutoOn(): boolean {
  if ((window as any).__tpAutoOn != null) return !!(window as any).__tpAutoOn;
  return !!document.querySelector('#autoPill.on, [data-auto="on"], .auto-toggle.on, body.auto-on');
}

function userPause(ms = 1500) {
  if (!wpm.isRunning()) return;
  wpm.stop(); stopWpmChip();
  log('wpm:pause', { reason: 'manual' });
  setWpmChip('Paused', 'muted');
  clearTimeout(userPauseTimer);
  userPauseTimer = window.setTimeout(() => {
    if (currentMode === 'wpm' && isAutoOn()) {
      showWpmChip(); wpm.start(wpmSetting); startWpmChip(wpmSetting);
    } else {
      setWpmChip('Paused', 'muted');
    }
  }, ms);
}

// Selection-aware pause
document.addEventListener('selectionchange', () => {
  if (currentMode !== 'wpm' || !wpm.isRunning()) return;
  const sel = document.getSelection?.();
  if (!sel || sel.type !== 'Range' || !sel.toString().trim()) return;
  wpm.stop(); stopWpmChip();
  setWpmChip('Paused (select)', 'muted');
  clearTimeout(selPauseTimer);
  selPauseTimer = window.setTimeout(() => {
    if (currentMode === 'wpm' && isAutoOn()) {
      showWpmChip(); wpm.start(wpmSetting); startWpmChip(wpmSetting);
    }
  }, 2000);
}, { passive: true });

// Background pause
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (wpm.isRunning()) { wpm.stop(); setWpmChip('Paused (background)', 'muted'); }
  } else if (currentMode === 'wpm' && isAutoOn()) {
    showWpmChip(); wpm.start(wpmSetting); startWpmChip(wpmSetting);
  }
}, { passive: true });

// Manual touch pause only in WPM mode
getViewer()?.addEventListener('wheel', () => { if (currentMode === 'wpm') userPause(); }, { passive: true });
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (currentMode !== 'wpm') return;
  const keys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
  if (keys.includes(e.key)) userPause();
}, { passive: true });

// ---------- Gate + transitions ----------

function computeOpen(mode: ScrollMode, user: boolean, speech: boolean): boolean {
  if (mode === 'wpm') return user && !!getViewer();
  // hybrid/asr/etc. would consider speech as well:
  return user && (mode === 'asr' || mode === 'hybrid' ? speech : true);
}

function logGate(mode: ScrollMode, user: boolean, speech: boolean, open: boolean) {
  const now = performance.now();
  if (open !== lastGateOpen || now - lastGateLog > 1000) {
    log('scroll-router:applyGate', { mode, user, speech, open });
    lastGateOpen = open;
    lastGateLog = now;
  }
}

export function applyGate(mode: ScrollMode, user: boolean, speech: boolean) {
  currentMode = mode;
  _userIntent = user;
  _speechGate = speech;
  const open = computeOpen(mode, user, speech);
  logGate(mode, user, speech, open);

  // Broadcast gate state for HUD or listeners
  try {
    const detail = { mode, user, speech, open } as GateState;
    window.dispatchEvent(new CustomEvent('tp:gate', { detail }));
  } catch {}

  // WPM transitions
  if (mode === 'wpm') {
    if (open && !lastGateOpen) {
      if (!viewerScrollable()) {
        setWpmChip('Nothing to scroll', 'muted'); fadeOutWpmChip(2000);
        return;
      }
      // Stall threshold from LS (seconds)
      const raw = Number(lsGet('tp_wpm_stall_dt'));
      const thr = Number.isFinite(raw) && raw > 0 ? raw : 0.33;
      wpm.setStallThreshold?.(thr);

      // PRM policy
      applyReducedMotionPolicy();

      showWpmChip();
      wpm.start(wpmSetting);
      startWpmChip(wpmSetting);
      attachViewerObservers(getViewer(), wpm, () => wpmSetting);
    } else if (!open && lastGateOpen) {
      const hitEnd = !!wpm.didEnd?.();
      wpm.stop();
      stopWpmChip();
      detachViewerObservers();
      setWpmChip(hitEnd ? 'End of script' : 'Paused', hitEnd ? 'end' : 'muted');
      fadeOutWpmChip(hitEnd ? 2500 : 2000);
    }
    return;
  }

  // Non-WPM modes: ensure WPM is off
  if (wpm.isRunning()) {
    wpm.stop();
    stopWpmChip();
    detachViewerObservers();
  }
}

// ---------- WPM target input binding ----------

function bindWpmTarget() {
  const el = getWpmTargetInput();
  if (!el) return;
  el.addEventListener('input', () => {
    const cap = PRM.matches ? Number(lsGet('tp_prm_wpm_cap') ?? 90) || 90 : 600;
    const val = Math.max(10, Math.min(cap, Number(el.value) || 120));
    wpmSetting = val;
    lsSet('tp_wpm', String(val));
    if (wpm.isRunning()) wpm.setRateWpm(val);
  });
}

// ---------- Public init (optional) ----------

export function initScrollRouter() {
  bindWpmTarget();
  // expose CI nudge hook
  (window as any).__tpTestNudgeWpm = () => {
    try {
      wpmSetting = (Number(wpmSetting) || 120) + 13;
      if (wpm && wpm.isRunning?.()) wpm.setRateWpm(wpmSetting);
      const pxs = wpm.getPxPerSec?.() || 0;
      setWpmChip(`${wpmSetting} WPM • ${Math.round(pxs)} px/s`, 'ok');
    } catch {}
  };
  // initial chip mount (non-intrusive)
  ensureWpmChip();

  // Seed PRM cap and magnet threshold labels if any UI is listening
  try { window.dispatchEvent(new CustomEvent('tp:router:init')); } catch {}
}
