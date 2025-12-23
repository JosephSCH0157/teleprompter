// Timed autoscroll engine: sets target speed on the scroll brain, nothing else.
import type { ScrollBrain } from './scroll-brain';

export interface TimedScrollEngine {
  enable(): void;
  disable(): void;
  setSpeedPxPerSec(pxPerSec: number): void;
}

const DEFAULT_SPEED_PX_PER_SEC = 21;
const MIN_SPEED_PX_PER_SEC = 1;
const MAX_SPEED_PX_PER_SEC = 60;

function readStoredSpeed(): number {
  const keys = ['tp_autoScrollPx', 'tp_auto_speed'];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const v = Number(raw);
      if (Number.isFinite(v) && v > 0) return v;
    } catch {
      /* ignore */
    }
  }
  return DEFAULT_SPEED_PX_PER_SEC;
}

function clampSpeed(px: number): number {
  const v = Number(px) || DEFAULT_SPEED_PX_PER_SEC;
  return Math.max(MIN_SPEED_PX_PER_SEC, Math.min(MAX_SPEED_PX_PER_SEC, v));
}

export function createTimedEngine(brain: ScrollBrain): TimedScrollEngine {
  let active = false;
  let speed = clampSpeed(readStoredSpeed());

  const apply = () => {
    if (!brain) return;
    const v = Number(speed);
    brain.setTargetSpeed(Number.isFinite(v) ? v : DEFAULT_SPEED_PX_PER_SEC);
  };

  // Sync with UI auto-speed events
  try {
    window.addEventListener('tp:autoSpeed', (ev: Event) => {
      const detail = (ev as CustomEvent<{ speed?: number }>).detail || {};
      if (typeof detail.speed === 'number') {
        speed = clampSpeed(detail.speed);
        if (active) apply();
      }
    });
  } catch {
    /* ignore */
  }

  return {
    enable: () => {
      active = true;
      apply();
    },
    disable: () => {
      active = false;
      try { brain.setTargetSpeed(0); } catch {}
    },
    setSpeedPxPerSec: (px) => {
      const v = clampSpeed(px);
      if (!Number.isFinite(v) || v <= 0) return;
      speed = v;
      if (active) apply();
    },
  };
}

export default createTimedEngine;
