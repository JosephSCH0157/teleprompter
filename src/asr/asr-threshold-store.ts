import type { SpeakerSlot } from '../types/speaker-profiles';
import type { AsrThresholds } from './asr-thresholds';
import { DEFAULT_ASR_THRESHOLDS, normalizeThresholds } from './asr-thresholds';
import { loadDevAsrThresholds } from '../dev/dev-thresholds';

export const THRESHOLD_EVENT = 'tp:asr:thresholds';
export type LearnedPatch = Partial<AsrThresholds>;

let baseThresholds: AsrThresholds = normalizeThresholds({ ...DEFAULT_ASR_THRESHOLDS });
let driverThresholds: AsrThresholds = baseThresholds;
let thresholdsDirty = false;

function broadcastThresholdUpdate() {
  if (typeof window === 'undefined') return;
  try {
    const payload = driverThresholds;
    window.dispatchEvent(new CustomEvent(THRESHOLD_EVENT, { detail: payload }));
  } catch {
    // ignore
  }
}

function computeEffectiveThresholds(): AsrThresholds {
  return normalizeThresholds({ ...baseThresholds });
}

function refreshEffectiveThresholds(force = false) {
  if (!force && thresholdsDirty) return;
  driverThresholds = computeEffectiveThresholds();
  broadcastThresholdUpdate();
}

function markThresholdsDirty() {
  thresholdsDirty = true;
}

function clearThresholdsDirtyInternal() {
  thresholdsDirty = false;
  refreshEffectiveThresholds(true);
}

function applyDevOverrides() {
  const overrides = loadDevAsrThresholds();
  if (!overrides) return;
  baseThresholds = normalizeThresholds({ ...baseThresholds, ...overrides });
}

applyDevOverrides();
refreshEffectiveThresholds();

type SetAsrDriverThresholdsOptions = {
  markDirty?: boolean;
};

export function setAsrDriverThresholds(next: Partial<AsrThresholds>, options?: SetAsrDriverThresholdsOptions) {
  baseThresholds = normalizeThresholds({ ...baseThresholds, ...next });
  if (options?.markDirty) {
    markThresholdsDirty();
  }
  refreshEffectiveThresholds(true);
}

export function getAsrDriverThresholds(): AsrThresholds {
  return driverThresholds;
}

export function getEffectiveAsrThresholds(): AsrThresholds {
  return getAsrDriverThresholds();
}

export function getBaseAsrThresholds(): AsrThresholds {
  return baseThresholds;
}

export function getSessionLearnedPatches(): Partial<Record<SpeakerSlot, LearnedPatch>> {
  return {};
}

export function clearSessionLearnedPatches(): void {
  // no-op; thresholds are globally managed
}

export function markAsrThresholdsDirty(): void {
  markThresholdsDirty();
}

export function clearAsrThresholdsDirty(): void {
  if (!thresholdsDirty) return;
  clearThresholdsDirtyInternal();
}

export function areAsrThresholdsDirty(): boolean {
  return thresholdsDirty;
}
