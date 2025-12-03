// Runtime hooks for ScrollBrain singletons used by legacy JS features.

import type { ScrollBrain, AdaptSample } from './scroll-brain';

declare global {
  interface Window {
    __tpScrollBrain?: ScrollBrain | null;
  }
}

function getBrain(): ScrollBrain | null {
  if (typeof window === 'undefined') return null;
  try {
    const brain = (window as any).__tpScrollBrain as ScrollBrain | null;
    return brain ?? null;
  } catch {
    return null;
  }
}

export function setBrainBaseSpeed(pxPerSec: number): void {
  const numeric = Number(pxPerSec);
  if (!Number.isFinite(numeric) || numeric <= 0) return;
  try {
    const brain = getBrain();
    brain?.setBaseSpeedPx?.(numeric);
  } catch {
    /* silent */
  }
}

export function nudgeBrainSpeed(deltaPxPerSec: number): void {
  const delta = Number(deltaPxPerSec);
  if (!Number.isFinite(delta) || delta === 0) return;
  try {
    const brain = getBrain();
    brain?.onManualSpeedAdjust?.(delta);
  } catch {
    /* silent */
  }
}

export function submitBrainSpeechSample(sample: AdaptSample): void {
  try {
    const brain = getBrain();
    brain?.onSpeechSample?.(sample);
  } catch {
    /* silent */
  }
}
