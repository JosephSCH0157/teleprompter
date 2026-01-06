// WPM-based speed engine: derives px/sec from typography metrics and sets scroll-brain target speed.
import type { ScrollBrain } from './scroll-brain';
import { wpmToPxPerSec } from './wpmSpeed';
import type { DisplayId } from '../settings/schema';

export interface WpmEngine {
  enable(): void;
  disable(): void;
  setWpm(wpm: number): void;

  // Optional but useful for Hybrid silence gating:
  setSpeechActive(active: boolean): void;
}

const DEFAULT_WPM = 150;

export function createWpmEngine(brain: ScrollBrain, display: DisplayId = 'main'): WpmEngine {
  let enabled = false;
  let speechActive = true; // Hybrid can flip this based on tp:speech-state
  let wpm = DEFAULT_WPM;

  const apply = () => {
    if (!brain) return;
    if (!enabled) return;

    // In Hybrid, if speech is not active, we should stop movement.
    if (!speechActive) {
      try { brain.setTargetSpeed(0); } catch {}
      return;
    }

    const pxPerSec = wpmToPxPerSec(Number(wpm) || DEFAULT_WPM, display);
    brain.setTargetSpeed(Number.isFinite(pxPerSec) ? pxPerSec : 0);
  };

  const onTypography = () => apply();

  return {
    enable: () => {
      enabled = true;
      if (typeof window !== 'undefined') {
        window.addEventListener('tp:typographyChanged', onTypography, { passive: true });
      }
      apply();
    },

    disable: () => {
      enabled = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('tp:typographyChanged', onTypography as any);
      }
      try { brain.setTargetSpeed(0); } catch {}
    },

    setWpm: (next) => {
      const v = Number(next);
      if (!Number.isFinite(v) || v <= 0) return;
      wpm = v;
      apply();
    },

    setSpeechActive: (active) => {
      speechActive = !!active;
      apply();
    },
  };
}

export default createWpmEngine;
