import { setBrainBaseSpeed } from '../scroll/brain-hooks';

type AutoState = { enabled: boolean; speed: number };

const MIN_SPEED_PX = 1;
const MAX_SPEED_PX = 60;
const DEFAULT_SPEED_PX = 21;

// Authoritative auto-scroll controller (TS primary)
let enabled = false;
let speed = DEFAULT_SPEED_PX; // px/sec default (SSOT)
let raf = 0;
let lastTs = 0;
let viewer: HTMLElement | null = null;
let autoChip: HTMLElement | null = null;
let statusEl: HTMLElement | null = null;
let toggleBtns: HTMLElement[] = [];
let speedInputs: HTMLInputElement[] = [];
let _fracCarry = 0; // fractional accumulator to avoid stalling at low speeds

function clampSpeed(px: number): number {
  return Math.max(MIN_SPEED_PX, Math.min(MAX_SPEED_PX, Number(px) || DEFAULT_SPEED_PX));
}

function getSpeed(): number {
  return speed;
}

function applyLabel() {
  const sFmt = (Math.round(speed * 10) / 10).toFixed(1);
  toggleBtns.forEach((btn) => {
    const managedByRouter = !!btn.dataset.state;
    if (managedByRouter) return;
    btn.textContent = enabled ? `Auto-scroll: On - ${sFmt} px/s` : 'Auto-scroll: Off';
    btn.setAttribute('aria-pressed', String(enabled));
  });
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
      statusEl.textContent = enabled ? `Auto-scroll: On - ${sFmt} px/s` : 'Auto-scroll: Off';
    }
  } catch {}
}

function stopLoop() {
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

function loop() {
  stopLoop();
  if (!enabled || !viewer) return;
  try { if ((window as any).__TP_REHEARSAL) return; } catch {}
  lastTs = 0;
  const step = (now: number) => {
    if (!enabled || !viewer) { stopLoop(); return; }
    try {
      const ov = document.getElementById('countOverlay');
      if (ov) {
        const cs = getComputedStyle(ov);
        const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && !ov.classList.contains('hidden');
        if (visible) { raf = requestAnimationFrame(step); return; }
      }
    } catch {}

    if (!lastTs) { lastTs = now; raf = requestAnimationFrame(step); return; }

    const dt = (now - lastTs) / 1000;
    lastTs = now;
    const delta = getSpeed() * dt + _fracCarry;
    const whole = delta >= 0 ? Math.floor(delta) : Math.ceil(delta);
    _fracCarry = delta - whole;
    if (whole !== 0 && viewer) {
      const maxScroll = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
      const next = Math.min(maxScroll, (viewer.scrollTop || 0) + whole);
      viewer.scrollTop = next;
      if (next >= maxScroll) { stopLoop(); return; }
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

export function initAutoscrollFeature() {
  viewer = document.getElementById('viewer');
  autoChip = document.getElementById('autoChip');
  statusEl = document.querySelector<HTMLElement>('[data-auto-status]');
  toggleBtns = [
    document.getElementById('autoToggle') as HTMLElement | null,
    document.getElementById('autoScrollToggle') as HTMLElement | null,
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-action="auto-toggle"]')),
  ].filter(Boolean) as HTMLElement[];
  speedInputs = [
    document.getElementById('autoSpeed') as HTMLInputElement | null,
    document.getElementById('autoScrollSpeed') as HTMLInputElement | null,
  ].filter(Boolean) as HTMLInputElement[];
  try {
    const stored =
      Number(localStorage.getItem('tp_autoScrollPx') || '') ||
      Number(localStorage.getItem('tp_auto_speed') || ''); // legacy fallback
    if (Number.isFinite(stored) && stored > 0) {
      speed = clampSpeed(stored);
    }
    speedInputs.forEach((inp) => { inp.value = String(speed); });
  } catch {}
  applyLabel();

  // Wire UI controls to the TS engine
  try {
    toggleBtns.forEach((btn) => {
      if (btn.dataset.wired) return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', (ev) => {
        try { ev.preventDefault(); ev.stopPropagation(); } catch {}
        const pressed = btn.getAttribute('aria-pressed') === 'true';
        // toggle based on current aria state
        enabled = !pressed;
        _fracCarry = 0;
        lastTs = 0;
        if (enabled) loop(); else stopLoop();
        applyLabel();
        try { window.dispatchEvent(new CustomEvent('tp:autoIntent', { detail: { on: enabled } })); } catch {}
      }, { capture: true });
    });
  } catch {}

  try {
    speedInputs.forEach((inp) => {
      if (inp.dataset.wired) return;
      inp.dataset.wired = '1';
      inp.addEventListener('input', () => {
        const v = Number(inp.value) || 0;
        setSpeed(v);
      });
    });
  } catch {}

  const mo = new MutationObserver(() => {
    const v = document.getElementById('viewer');
    if (v !== viewer) { viewer = v; if (enabled) loop(); }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Listen to scroll status for HUD purposes only (no control of the loop here)
  try {
    window.addEventListener('tp:scroll:status', () => {
      applyLabel();
    });
  } catch {
    /* ignore */
  }
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
  _fracCarry = 0;
  lastTs = 0;
  if (enabled) loop(); else stopLoop();
  applyLabel();
  try {
    window.dispatchEvent(new CustomEvent('tp:autoIntent', { detail: { on: enabled } }));
  } catch {}
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
  _fracCarry = 0;
  lastTs = 0;
  if (enabled) loop(); else stopLoop();
  applyLabel();
  try {
    window.dispatchEvent(new CustomEvent('tp:autoIntent', { detail: { on: enabled } }));
  } catch {}
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
    speedInputs.forEach((inp) => { inp.value = String(speed); });
  } catch {}
  try {
    toggleBtns.forEach((btn) => {
      const st = btn.dataset?.state || '';
      const sFmt = (Math.round(speed * 10) / 10).toFixed(1);
      if (st === 'on') btn.textContent = `Auto-scroll: On - ${sFmt} px/s`;
      else if (st === 'paused') btn.textContent = `Auto-scroll: Paused - ${sFmt} px/s`;
    });
  } catch {}
  applyLabel();
  if (enabled) { _fracCarry = 0; lastTs = 0; loop(); }
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
