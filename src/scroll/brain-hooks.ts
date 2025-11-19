import type { ScrollBrain } from './scroll-brain';

function getBrain(): ScrollBrain | null {
  if (typeof window === 'undefined') return null;
  try {
    const brain = (window as any).__tpScrollBrain as ScrollBrain | undefined;
    return brain ?? null;
  } catch {
    return null;
  }
}

export function setBrainBaseSpeed(pxPerSec: number): void {
  const numeric = Number(pxPerSec);
  if (!Number.isFinite(numeric) || numeric <= 0) return;
  try {
    getBrain()?.setBaseSpeedPx(numeric);
  } catch {
    /* silent */
  }
}

export function nudgeBrainSpeed(deltaPxPerSec: number): void {
  const delta = Number(deltaPxPerSec);
  if (!Number.isFinite(delta) || delta === 0) return;
  try {
    getBrain()?.onManualSpeedAdjust(delta);
  } catch {
    /* silent */
  }
}

export function submitBrainSpeechSample(sample: Parameters<ScrollBrain['onSpeechSample']>[0]): void {
  try {
    getBrain()?.onSpeechSample(sample);
  } catch {
    /* silent */
  }
}
