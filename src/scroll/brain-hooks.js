// src/scroll/brain-hooks.js
// Runtime hooks for ScrollBrain singletons used by legacy JS features.
// NOTE: Keep this in sync with brain-hooks.ts (source of truth for typed entry points).

function getBrain() {
  if (typeof window === 'undefined') return null;
  try {
    const brain = window.__tpScrollBrain;
    return brain ?? null;
  } catch {
    return null;
  }
}

export function setBrainBaseSpeed(pxPerSec) {
  const numeric = Number(pxPerSec);
  if (!Number.isFinite(numeric) || numeric <= 0) return;
  try {
    const brain = getBrain();
    brain?.setBaseSpeedPx?.(numeric);
  } catch {
    /* silent */
  }
}

export function nudgeBrainSpeed(deltaPxPerSec) {
  const delta = Number(deltaPxPerSec);
  if (!Number.isFinite(delta) || delta === 0) return;
  try {
    const brain = getBrain();
    brain?.onManualSpeedAdjust?.(delta);
  } catch {
    /* silent */
  }
}

export function submitBrainSpeechSample(sample) {
  try {
    const brain = getBrain();
    brain?.onSpeechSample?.(sample);
  } catch {
    /* silent */
  }
}
