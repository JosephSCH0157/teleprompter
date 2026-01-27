const AUTO_SPEED_KEY = 'tp_auto_speed';
const AUTO_DEFAULT_SPEED = 21;
const AUTO_MIN_SPEED = 1;
const AUTO_MAX_SPEED = 60;
const AUTO_STEP_FINE = 1;

function clampSpeed(value: number): number {
  if (!Number.isFinite(value)) return AUTO_DEFAULT_SPEED;
  return Math.min(AUTO_MAX_SPEED, Math.max(AUTO_MIN_SPEED, value));
}

function readStoredSpeed(): number {
  if (typeof localStorage === 'undefined') return AUTO_DEFAULT_SPEED;
  try {
    const raw = localStorage.getItem(AUTO_SPEED_KEY);
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return clampSpeed(n);
    }
  } catch {
    // ignore
  }
  return AUTO_DEFAULT_SPEED;
}

function storeSpeed(value: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(AUTO_SPEED_KEY, String(value));
  } catch {
    // ignore
  }
}

function dispatchAutoIntent(on: boolean, reason?: string): void {
  if (typeof window === 'undefined') return;
  try {
    (window as any).__tpAutoIntentPending = on;
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent('tp:auto:intent', { detail: { enabled: on, reason } }));
  } catch {}
}

function dispatchAutoSpeed(pxPerSec: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('tp:autoSpeed', { detail: { pxPerSec } }));
  } catch {}
}

function onDomReady(callback: () => void): void {
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback, { once: true });
  } else {
    callback();
  }
}

function initAutoControls(): void {
  if (typeof document === 'undefined') return;

  const toggleEl =
    (document.getElementById('autoScrollToggle') as HTMLButtonElement | null) ||
    (document.getElementById('autoToggle') as HTMLButtonElement | null);
  const speedInput =
    (document.getElementById('autoScrollSpeed') as HTMLInputElement | null) ||
    (document.getElementById('autoSpeed') as HTMLInputElement | null);
  const decBtn = document.getElementById('autoDec');
  const incBtn = document.getElementById('autoInc');

  let autoRunning = false;
  let currentSpeed = readStoredSpeed();

  const updateSpeedInput = (value: number) => {
    currentSpeed = clampSpeed(value);
    if (speedInput) {
      try { speedInput.value = String(currentSpeed); } catch {}
    }
  };

  const updateToggleLabel = () => {
    if (!toggleEl) return;
    const label = autoRunning ? 'On' : 'Off';
    const speedSuffix = autoRunning ? ` (${currentSpeed.toFixed(1)} px/s)` : '';
    toggleEl.textContent = `Auto-scroll: ${label}${speedSuffix}`;
  };

  const handleSpeedChange = (next: number) => {
    const clamped = clampSpeed(next);
    updateSpeedInput(clamped);
    storeSpeed(clamped);
    dispatchAutoSpeed(clamped);
    updateToggleLabel();
  };

  if (speedInput) {
    updateSpeedInput(currentSpeed);
    speedInput.addEventListener('change', () => {
      const next = Number(speedInput.value) || currentSpeed;
      handleSpeedChange(next);
    }, { capture: true });
    speedInput.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        const delta = ev.deltaY || ev.deltaX || 0;
        if (!delta) return;
        const direction = delta > 0 ? -AUTO_STEP_FINE : AUTO_STEP_FINE;
        adjustSpeed(direction);
      },
      { passive: false, capture: true },
    );
  }

  const adjustSpeed = (delta: number) => {
    handleSpeedChange(currentSpeed + delta);
  };

  if (decBtn) {
    decBtn.addEventListener('click', (ev) => {
      try { ev.preventDefault(); } catch {}
      adjustSpeed(-AUTO_STEP_FINE);
    }, { capture: true });
  }

  if (incBtn) {
    incBtn.addEventListener('click', (ev) => {
      try { ev.preventDefault(); } catch {}
      adjustSpeed(AUTO_STEP_FINE);
    }, { capture: true });
  }

  toggleEl?.addEventListener('click', (ev) => {
    try { ev.preventDefault(); } catch {}
    dispatchAutoIntent(!autoRunning, 'user');
  }, { capture: true });

  window.addEventListener('tp:motorState', (ev) => {
    const detail = (ev as CustomEvent)?.detail || {};
    if (detail.source !== 'auto') return;
    autoRunning = !!detail.running;
    updateToggleLabel();
  });

  updateToggleLabel();
}

onDomReady(initAutoControls);
