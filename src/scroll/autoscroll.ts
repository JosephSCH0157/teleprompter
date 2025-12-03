// Timed autoscroll engine: sets target speed on the scroll brain, nothing else.
import type { ScrollBrain } from './scroll-brain';

export interface TimedScrollEngine {
  enable(): void;
  disable(): void;
  setSpeedPxPerSec(pxPerSec: number): void;
}

const DEFAULT_SPEED_PX_PER_SEC = 120; // baseline linear speed

export function createTimedEngine(brain: ScrollBrain): TimedScrollEngine {
  let active = false;
  let speed = DEFAULT_SPEED_PX_PER_SEC;

  const apply = () => {
    if (!brain) return;
    const v = Number(speed);
    brain.setTargetSpeed(Number.isFinite(v) ? v : DEFAULT_SPEED_PX_PER_SEC);
  };

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
      const v = Number(px);
      if (!Number.isFinite(v) || v <= 0) return;
      speed = v;
      if (active) apply();
    },
  };
}

export default createTimedEngine;
