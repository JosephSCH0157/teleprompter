// src/features/autoscroll.ts

type ViewerGetter = () => HTMLElement | null;
type AnyFn = (...args: any[]) => any;

import { getScrollWriter } from '../scroll/scroll-writer';

const AUTO_MIN_SPEED = 0.1;

export interface AutoScrollController {
  bindUI(toggleEl: HTMLElement | null, speedInput: HTMLInputElement | null): void;
  start(): void;
  stop(): void;
  isActive(): boolean;
}

declare global {
  interface Window {
    startAutoScroll?(): void;
    stopAutoScroll?(): void;
    tweakAutoSpeed?(delta: number): void;

    __tp_has_script?: boolean;
    tpArmWatchdog?: (armed: boolean) => void;

    // HUD variants already in the project
    HUD?: { bus?: { emit?: AnyFn | undefined } | undefined; log?: AnyFn | undefined };
    tp_hud?: (evt: string, data?: unknown) => void;

    __tpMomentaryHandlers?: { onKey?: (e: KeyboardEvent) => void } | null;
  }
}

// --- Internal state ---------------------------------------------------------

let getViewer: ViewerGetter;
let toggleEl: HTMLElement | null = null;
let speedInput: HTMLInputElement | null = null;

let rafId: number | null = null;
let lastTs: number | null = null;
let lastTargetTop: number | null = null; // keep sub-pixel accumulation even if DOM rounds
let active = false;
let controller: AutoScrollController | null = null;

// Momentary speed multiplier (Shift/Alt)
let momentaryMult = 1;

// --- Helpers: base speed persistence (mirrors legacy behavior) -------------

function vpBaseKey(): string {
  try {
    const vh = Math.round((window.innerHeight || 0) / 10) * 10;
    return `tp_base_speed_px_s@vh=${vh}`;
  } catch {
    return 'tp_base_speed_px_s';
  }
}

function loadBaseSpeed(): number {
  try {
    const k = vpBaseKey();
    const v = localStorage.getItem(k) || localStorage.getItem('tp_base_speed_px_s');
    const n = Number(v ?? '');
    return Number.isFinite(n) && n > 0 ? n : 120;
  } catch {
    return 120;
  }
}

function saveBaseSpeed(pxPerSec: number): void {
  try {
    const k = vpBaseKey();
    const v = String(pxPerSec);
    localStorage.setItem(k, v);
    // keep legacy key for compatibility
    localStorage.setItem('tp_base_speed_px_s', v);
  } catch {
    // ignore
  }
}

function currentSpeedPx(): number {
  if (speedInput) {
    const raw = Number(speedInput.value);
    if (Number.isFinite(raw)) {
      const clamped = Math.max(0, Math.min(200, raw));
      if (clamped !== raw) {
        try { hud('auto:speed:clamp', { raw, clamped }); } catch {}
      }
      return clamped;
    }
  }
  return loadBaseSpeed();
}

function readSpeedFromSlider(): number {
  try {
    return currentSpeedPx();
  } catch {
    return 0;
  }
}

function hud(tag: string, data?: unknown): void {
  try {
    if (window.tp_hud) window.tp_hud(tag, data);
    else if (window.HUD?.log) window.HUD.log(tag, data);
  } catch {
    // ignore HUD failures
  }
}

// --- Core scroll loop -------------------------------------------------------

function tick(now: number) {
  if (!active) return;

  if (lastTs == null) {
    lastTs = now;
  }

  const dt = (now - lastTs) / 1000;
  lastTs = now;

  const viewer = getViewer?.();
  if (viewer) {
    const base = currentSpeedPx();
    const pxPerSec = base * momentaryMult;
    const dy = pxPerSec * dt;

    const maxTop = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
    const currentTop = (lastTargetTop != null ? lastTargetTop : viewer.scrollTop || 0);
    const nextTop = Math.max(0, Math.min(maxTop, currentTop + dy));
    lastTargetTop = nextTop;

    const writer = getScrollWriter();
    if (!writer) return;
    try { writer.scrollTo(nextTop, { behavior: 'auto' }); } catch {}
  }

  rafId = requestAnimationFrame(tick);
}

// --- Momentary key handling (Shift = faster, Alt = slower) -----------------

function attachMomentaryKeys() {
  const handler = (e: KeyboardEvent) => {
    try {
      const next = e.shiftKey ? 1.1 : e.altKey ? 0.88 : 1;
      if (next !== momentaryMult) {
        momentaryMult = next;
        hud('auto:momentary', { mult: momentaryMult });
      }
    } catch {
      // ignore
    }
  };

  window.__tpMomentaryHandlers = { onKey: handler };

  window.addEventListener('keydown', handler);
  window.addEventListener('keyup', handler);
}

function detachMomentaryKeys() {
  try {
    const h = window.__tpMomentaryHandlers;
    if (h?.onKey) {
      window.removeEventListener('keydown', h.onKey);
      window.removeEventListener('keyup', h.onKey);
    }
  } catch {
    // ignore
  } finally {
    window.__tpMomentaryHandlers = null;
    momentaryMult = 1;
  }
}

// --- Public controller ------------------------------------------------------

function updateToggleLabel() {
  if (!toggleEl) return;
  if (!active) {
    toggleEl.classList.remove('active');
    toggleEl.textContent = 'Auto-scroll: Off';
  } else {
    const v = Math.round(currentSpeedPx());
    toggleEl.classList.add('active');
    toggleEl.textContent = `Auto-scroll: On (${v}px/s)`;
  }
}

function start() {
  if (active) return;

  const viewer = getViewer?.();
  if (!viewer) {
    try { console.warn('[auto-scroll] viewer not found, will still arm loop'); } catch {}
  }

  active = true;
  lastTs = null;
  lastTargetTop = viewer ? (viewer.scrollTop || 0) : null;

  updateToggleLabel();
  hud('auto:start', { speed: currentSpeedPx() });

  // Arm scroll watchdog if present
  try {
    window.tpArmWatchdog?.(true);
  } catch {
    // ignore
  }

  attachMomentaryKeys();
  rafId = requestAnimationFrame(tick);
}

function stop() {
  if (!active) return;

  active = false;

  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  lastTs = null;
  lastTargetTop = null;

  updateToggleLabel();
  hud('auto:stop');

  try {
    window.tpArmWatchdog?.(false);
  } catch {
    // ignore
  }

  detachMomentaryKeys();
}

// tweak for +/- buttons or future callers
function tweakSpeed(delta: number) {
  if (!speedInput) return;
  const prev = Number(speedInput.value) || 0;
  const next = prev + delta;
  const clamped = Math.max(0, Math.min(200, next));
  speedInput.value = String(clamped);
  saveBaseSpeed(clamped);
  if (active) updateToggleLabel();
  hud('auto:tweak', { delta, prev, next, speed: clamped });
}

// --- Factory: what index.ts calls ------------------------------------------

export function initAutoScroll(viewerGetter: ViewerGetter): AutoScrollController {
  getViewer = viewerGetter;

  // Expose globals for legacy callers (ASR, countdown, etc.)
  window.startAutoScroll = start;
  window.stopAutoScroll = stop;
  window.tweakAutoSpeed = tweakSpeed;
  try {
    (window as any).__tpAuto = {
      setEnabled: (on: boolean) => {
        try { console.log('[AUTO] setEnabled(from hotkey)', on); } catch {}
        return on ? start() : stop();
      },
      set: (on: boolean) => {
        try { console.log('[AUTO] set(from hotkey)', on); } catch {}
        return on ? start() : stop();
      },
      setSpeed: (px: number) => {
        try { console.log('[AUTO] setSpeed(from hotkey)', px); } catch {}
        return setSpeed(px);
      },
      getState: () => ({ enabled: active, speed: currentSpeedPx() }),
      startFromPreroll: (detail?: unknown) => {
        try { console.log('[AUTO] startFromPreroll', detail); } catch {}
        let speed = readSpeedFromSlider();
        if (!Number.isFinite(speed) || speed <= 0 || speed < AUTO_MIN_SPEED) {
          try {
            console.log('[AUTO] preroll: bumping speed to min', {
              from: speed,
              to: AUTO_MIN_SPEED,
            });
          } catch {}
          setSpeed(AUTO_MIN_SPEED);
          speed = AUTO_MIN_SPEED;
        }
        // Hard-enable auto after preroll
        try { console.log('[AUTO] enabling auto from preroll'); } catch {}
        setEnabled(true);
      },
    };
  } catch {}

  return {
    bindUI(toggle, speed) {
      toggleEl = toggle;
      speedInput = speed;

      // Initialize speed input
      if (speedInput) {
        const base = loadBaseSpeed();
        speedInput.min = speedInput.min || '0';
        speedInput.max = speedInput.max || '200';
        speedInput.step = speedInput.step || '0.5';
        speedInput.value = speedInput.value || String(base);

        speedInput.addEventListener('input', () => {
          const v = currentSpeedPx();
          saveBaseSpeed(v);
          if (active) updateToggleLabel();
        });
      }

      // Wire +/- buttons if present
      const decBtn = document.getElementById('autoDec');
      const incBtn = document.getElementById('autoInc');

      // 0.5 px/s per click
      decBtn?.addEventListener('click', () => tweakSpeed(-0.5));
      incBtn?.addEventListener('click', () => tweakSpeed(+0.5));

      // Toggle button
      if (toggleEl && !toggleEl.hasAttribute('data-autoscroll-wired')) {
        toggleEl.setAttribute('data-autoscroll-wired', '1');
        toggleEl.addEventListener('click', () => {
          if (active) stop();
          else start();
        });
      }

      // Initial label
      updateToggleLabel();
    },

    start,
    stop,
    isActive() {
      return active;
    },
  };
}

// --- Legacy compatibility exports (used by existing index.ts wiring) -------

function ensureController(): AutoScrollController | null {
  if (!controller) {
    controller = initAutoScroll(() => {
      return (
        document.getElementById('scriptScrollContainer') ||
        document.getElementById('viewer')
      );
    });
  }
  return controller;
}

function bindDefaultUi(ctrl: AutoScrollController): void {
  const autoToggle =
    (document.getElementById('autoScrollToggle') as HTMLButtonElement | null) ||
    (document.getElementById('autoToggle') as HTMLButtonElement | null);
  const autoSpeed =
    (document.getElementById('autoScrollSpeed') as HTMLInputElement | null) ||
    (document.getElementById('autoSpeed') as HTMLInputElement | null);

  ctrl.bindUI(autoToggle, autoSpeed);
}

export function initAutoscrollFeature(): AutoScrollController | null {
  const ctrl = ensureController();
  if (!ctrl) return null;
  bindDefaultUi(ctrl);
  return ctrl;
}

export function toggle(): void {
  const ctrl = initAutoscrollFeature();
  if (!ctrl) return;
  if (ctrl.isActive()) ctrl.stop();
  else ctrl.start();
}

export function setSpeed(pxPerSec: number): void {
  const ctrl = initAutoscrollFeature();
  if (!ctrl) return;

  if (speedInput) {
    const clamped = Math.max(0, Math.min(200, Number(pxPerSec) || 0));
    speedInput.value = String(clamped);
    saveBaseSpeed(clamped);
    if (ctrl.isActive()) updateToggleLabel();
    hud('auto:set-speed', { speed: clamped });
  }
}

export function inc(): void {
  initAutoscrollFeature();
  tweakSpeed(+0.5);
}

export function dec(): void {
  initAutoscrollFeature();
  tweakSpeed(-0.5);
}

export function setEnabled(enable: boolean): void {
  const ctrl = initAutoscrollFeature();
  if (!ctrl) return;
  if (enable) ctrl.start();
  else ctrl.stop();
}

// --- Auto-boot: wire itself on DOM ready so we don't depend on index.ts wiring ---

if (typeof window !== 'undefined') {
  const boot = () => {
    try {
      const viewer =
        (document.getElementById('scriptScrollContainer') as HTMLElement | null) ||
        (document.getElementById('viewer') as HTMLElement | null);

      // Try multiple ids for the toggle and speed in case HTML naming drifted
      const toggle =
        (document.getElementById('autoToggle') as HTMLElement | null) ||
        (document.getElementById('autoScrollToggle') as HTMLElement | null) ||
        (document.querySelector('[data-auto-toggle]') as HTMLElement | null);

      const speed =
        (document.getElementById('autoSpeed') as HTMLInputElement | null) ||
        (document.querySelector('[data-auto-speed]') as HTMLInputElement | null);

      if (!viewer) {
        try {
          console.warn('[auto-scroll] boot: missing viewer', {
            viewer: !!viewer,
            toggle: !!toggle,
            speed: !!speed,
          });
        } catch {}
        return;
      }

      const auto = initAutoScroll(() => viewer);
      if (toggle && speed) {
        auto.bindUI(toggle, speed);
      } else {
        try {
          console.warn('[auto-scroll] boot: missing toggle/speed; binding skipped', {
            viewer: !!viewer,
            toggle: !!toggle,
            speed: !!speed,
          });
        } catch {}
      }
      try { (window as any).__tpAuto = auto; } catch {}

      try {
        console.log('[auto-scroll] boot: wired', {
          viewer: true,
          toggleId: toggle.id,
          speedId: speed.id,
        });
      } catch {}
    } catch (e) {
      try { console.error('[auto-scroll] boot failed', e); } catch {}
    }
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      // DOM is already ready
      setTimeout(boot, 0);
    }
  }
}

