// WPM-based speed engine: derives px/sec from typography metrics and sets scroll-brain target speed.
import type { ScrollBrain } from './scroll-brain';

export interface WpmEngine {
  enable(): void;
  disable(): void;
  setWpm(wpm: number): void;
}

const DEFAULT_WPM = 150;

export function createWpmEngine(brain: ScrollBrain): WpmEngine {
  let active = false;
  let wpm = DEFAULT_WPM;
  let pxPerWord = 0;

  const apply = () => {
    if (!brain) return;
    const wordsPerSec = (Number(wpm) || DEFAULT_WPM) / 60;
    const speed = wordsPerSec * (pxPerWord || 0);
    brain.setTargetSpeed(Number.isFinite(speed) ? speed : 0);
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
    setWpm: (next) => {
      const v = Number(next);
      if (!Number.isFinite(v) || v <= 0) return;
      wpm = v;
      if (active) apply();
    },
  };
}

export default createWpmEngine;
