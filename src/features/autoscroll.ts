import { setBrainBaseSpeed } from '../scroll/brain-hooks';

type AutoState = { enabled: boolean; speed: number };

const MIN_SPEED_PX = 1;
const MAX_SPEED_PX = 60;
const DEFAULT_SPEED_PX = 21;

// Authoritative auto-scroll controller (TS primary)
let enabled = false;
let speed = DEFAULT_SPEED_PX; // px/sec default (SSOT)
let raf = 0;
let viewer: HTMLElement | null = null;
let autoChip: HTMLElement | null = null;
let statusEl: HTMLElement | null = null;
let _fracCarry = 0; // fractional accumulator to avoid stalling at low speeds

function clampSpeed(px: number): number {
  return Math.max(MIN_SPEED_PX, Math.min(MAX_SPEED_PX, Number(px) || DEFAULT_SPEED_PX));
}

function getSpeed(): number {
  return speed;
}

function applyLabel() {
  const btn = document.getElementById('autoToggle');
  const managedByRouter = !!(btn && (btn as HTMLElement).dataset && (btn as HTMLElement).dataset.state);
  if (btn && !managedByRouter) {
    const sFmt = (Math.round(speed * 10) / 10).toFixed(1);
    btn.textContent = enabled ? `Auto-scroll: On - ${sFmt} px/s` : 'Auto-scroll: Off';
    btn.setAttribute('aria-pressed', String(enabled));
  }
  try {
    autoChip = autoChip || document.getElementById('autoChip');
    const chipManaged = !!(autoChip && autoChip.getAttribute && autoChip.getAttribute('data-state'));
    if (autoChip && !chipManaged) {
      autoChip.textContent = enabled ? 'Auto: On' : 'Auto: Manual';
      autoChip.setAttribute('aria-live', 'polite');
      autoChip.setAttribute('aria-atomic', 'true');
      autoChip.title = enabled ? 'Auto scroll is enabled' : 'Auto scroll is manual/off';
    }
  } catch {}
  try {
    if (!statusEl) statusEl = document.querySelector<HTMLElement>('[data-auto-status]');
    if (statusEl) {
      const sFmt = (Math.round(speed * 10) / 10).toFixed(1);
      statusEl.textContent = enabled ? `Auto-scroll: On – ${sFmt} px/s` : 'Auto-scroll: Off';
    }
  } catch {}
}

function loop() {
  cancelAnimationFrame(raf);
  if (!enabled || !viewer) return;
  try { if ((window as any).__TP_REHEARSAL) return; } catch {}
  let last = performance.now();
  const step = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    try {
      try {
        const ov = document.getElementById('countOverlay');
        if (ov) {
          const cs = getComputedStyle(ov);
          const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && !ov.classList.contains('hidden');
          if (visible) { raf = requestAnimationFrame(step); return; }
        }
      } catch {}
      const delta = getSpeed() * dt + _fracCarry;
      const whole = (delta >= 0) ? Math.floor(delta) : Math.ceil(delta);
      _fracCarry = delta - whole;
      if (whole !== 0 && viewer) viewer.scrollTop += whole;
    } catch {}
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

export function initAutoscrollFeature() {
  viewer = document.getElementById('viewer');
  autoChip = document.getElementById('autoChip');
  statusEl = document.querySelector<HTMLElement>('[data-auto-status]');
  try {
    const stored =
      Number(localStorage.getItem('tp_autoScrollPx') || '') ||
      Number(localStorage.getItem('tp_auto_speed') || ''); // legacy fallback
    if (Number.isFinite(stored) && stored > 0) {
      speed = clampSpeed(stored);
    }
    const inputs = [
      document.getElementById('autoSpeed') as HTMLInputElement | null,
      document.getElementById('autoScrollSpeed') as HTMLInputElement | null,
    ].filter(Boolean) as HTMLInputElement[];
    inputs.forEach((inp) => { inp.value = String(speed); });
  } catch {}
  applyLabel();
  const mo = new MutationObserver(() => {
    const v = document.getElementById('viewer');
    if (v !== viewer) { viewer = v; if (enabled) loop(); }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
}

export function toggle() {
  const want = !enabled;
  try {
    if (want && (window as any).__TP_REHEARSAL) {
      enabled = false;
      try { (window as any).toasts?.show?.('Auto-scroll disabled in Rehearsal Mode'); } catch {}
      applyLabel();
      return;
    }
  } catch {}
  enabled = want;
  applyLabel();
  loop();
}

export function setEnabled(v: boolean) {
  try {
    if (v && (window as any).__TP_REHEARSAL) {
      enabled = false;
      try { (window as any).toasts?.show?.('Auto-scroll disabled in Rehearsal Mode'); } catch {}
      applyLabel();
      return;
    }
  } catch {}
  enabled = !!v;
  applyLabel();
  loop();
}

export function inc() { setSpeed(speed + 0.5); if (enabled) loop(); }
export function dec() { setSpeed(speed - 0.5); if (enabled) loop(); }
export function getState(): AutoState { return { enabled, speed }; }

let _setSpeedReentrant = false;
export function setSpeed(pxPerSec: number) {
  const v = Number(pxPerSec);
  if (!Number.isFinite(v)) return;
  const clamped = clampSpeed(v);
  if (clamped === speed) return;
  const prev = speed;
  speed = clamped;
  try { setBrainBaseSpeed(clamped); } catch {}
  try { localStorage.setItem('tp_autoScrollPx', String(speed)); localStorage.setItem('tp_auto_speed', String(speed)); } catch {}
  if (!_setSpeedReentrant) {
    try {
      _setSpeedReentrant = true;
      (window as any).__scrollCtl?.setSpeed?.(speed);
    } finally {
      _setSpeedReentrant = false;
    }
  }
  const detail = { speed, deltaPx: clamped - prev };
  try { document.dispatchEvent(new CustomEvent('tp:autoSpeed', { detail })); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:autoSpeed', { detail })); } catch {}
  try {
    const inputs = [
      document.getElementById('autoSpeed') as HTMLInputElement | null,
      document.getElementById('autoScrollSpeed') as HTMLInputElement | null,
    ].filter(Boolean) as HTMLInputElement[];
    inputs.forEach((inp) => { inp.value = String(speed); });
  } catch {}
  try {
    const btn = document.getElementById('autoToggle');
    const st = (btn as HTMLElement | null)?.dataset?.state || '';
    if (btn && st) {
      const s1 = Number.isFinite(speed) ? Number(speed) : 0;
      const sFmt = (Math.round(s1 * 10) / 10).toFixed(1);
      if (st === 'on') btn.textContent = `Auto-scroll: On - ${sFmt} px/s`;
      else if (st === 'paused') btn.textContent = `Auto-scroll: Paused - ${sFmt} px/s`;
    }
  } catch {}
  applyLabel();
}

export function nudge(pixels: number) {
  try {
    if (!viewer) viewer = document.getElementById('viewer');
    if (!viewer) return;
    viewer.scrollTop += Number(pixels) || 0;
  } catch {}
}

// Back-compat named entry
export const initAutoScroll = initAutoscrollFeature;
