// src/features/autoscroll.ts

type ViewerGetter = () => HTMLElement | null;

export interface AutoScrollController {
  bindUI(toggleEl: HTMLElement | null, speedInput: HTMLInputElement | null): void;
  start(): void;
  stop(): void;
  isActive(): boolean;
}

declare global {
  interface Window {
    startAutoScroll?: () => void;
    stopAutoScroll?: () => void;
    tweakAutoSpeed?: (delta: number) => void;

    __tp_has_script?: boolean;
    tpArmWatchdog?: (armed: boolean) => void;

    // HUD variants already in the project
    HUD?: { log?: (evt: string, data?: unknown) => void };
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
let active = false;

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
    const v = Number(speedInput.value);
    if (Number.isFinite(v)) {
      return Math.max(0, Math.min(300, v));
    }
  }
  return loadBaseSpeed();
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
    const nextTop = Math.max(0, Math.min(maxTop, viewer.scrollTop + dy));

    try {
      viewer.scrollTop = nextTop;
    } catch {
      // ignore
    }

    // Send to display if the legacy helper is present
    try {
      const ratio = maxTop ? nextTop / maxTop : 0;
      (window as any).sendToDisplay?.({ type: 'scroll', top: nextTop, ratio });
    } catch {
      // ignore
    }
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
  if (!viewer) return;

  // Optional guard: require a script to be loaded
  if (window.__tp_has_script === false) {
    return;
  }

  active = true;
  lastTs = null;

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
  const clamped = Math.max(0, Math.min(300, (Number(speedInput.value) || 0) + delta));
  speedInput.value = String(clamped);
  saveBaseSpeed(clamped);
  if (active) updateToggleLabel();
  hud('auto:tweak', { delta, speed: clamped });
}

// --- Factory: what index.ts calls ------------------------------------------

export function initAutoScroll(viewerGetter: ViewerGetter): AutoScrollController {
  getViewer = viewerGetter;

  // Expose globals for legacy callers (ASR, countdown, etc.)
  window.startAutoScroll = start;
  window.stopAutoScroll = stop;
  window.tweakAutoSpeed = tweakSpeed;

  return {
    bindUI(toggle, speed) {
      toggleEl = toggle;
      speedInput = speed;

      // Initialize speed input
      if (speedInput) {
        const base = loadBaseSpeed();
        speedInput.min = speedInput.min || '0';
        speedInput.max = speedInput.max || '300';
        speedInput.step = speedInput.step || '5';
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

      decBtn?.addEventListener('click', () => tweakSpeed(-10));
      incBtn?.addEventListener('click', () => tweakSpeed(+10));

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
