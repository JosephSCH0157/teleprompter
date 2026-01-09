import type { AsrThresholds } from './asr-thresholds';
import { DEFAULT_ASR_THRESHOLDS, normalizeThresholds } from './asr-thresholds';
import { loadDevAsrThresholds } from '../dev/dev-thresholds';
import type { SpeakerSlot } from '../types/speaker-profiles';
import {
  getProfileById,
  getSpeakerBindings,
  getActiveSpeakerSlot,
  subscribeSpeakerBindings,
  subscribeActiveSpeaker,
} from '../ui/speaker-profiles-store';

export const THRESHOLD_EVENT = 'tp:asr:thresholds';
const PROFILE_TWEAK_KEYS: Array<keyof AsrThresholds> = [
  'candidateMinSim',
  'commitFinalMinSim',
  'commitInterimMinSim',
  'stickinessDelta',
  'interimStreakNeeded',
  'tieDelta',
  'maxJumpsPerSecond',
  'anchorMinSim',
  'anchorStreakNeeded',
];

export type LearnedPatch = Partial<AsrThresholds>;

let baseThresholds: AsrThresholds = normalizeThresholds({ ...DEFAULT_ASR_THRESHOLDS });
let driverThresholds: AsrThresholds = baseThresholds;
let thresholdsDirty = false;
const sessionLearnedPatches: Partial<Record<SpeakerSlot, LearnedPatch>> = {};

function broadcastThresholdUpdate() {
  if (typeof window === 'undefined') return;
  try {
    const payload = driverThresholds;
    window.dispatchEvent(new CustomEvent(THRESHOLD_EVENT, { detail: payload }));
  } catch {
    // ignore
  }
}

function clampNumber(value: number, min: number, max: number, round = false) {
  if (!Number.isFinite(value)) return NaN;
  const v = round ? Math.round(value) : value;
  return Math.max(min, Math.min(max, v));
}

function sanitizeProfileTweaks(tweaks?: Partial<AsrThresholds>): Partial<AsrThresholds> {
  if (!tweaks) return {};
  const next: Partial<AsrThresholds> = {};
  for (const key of PROFILE_TWEAK_KEYS) {
    const raw = tweaks[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    let clamped = raw;
    switch (key) {
      case 'interimStreakNeeded':
        clamped = clampNumber(raw, 1, 5, true);
        break;
      case 'maxJumpsPerSecond':
        clamped = clampNumber(raw, 1, 10, true);
        break;
      case 'stickinessDelta':
      case 'tieDelta':
      case 'commitFinalMinSim':
      case 'commitInterimMinSim':
      case 'anchorMinSim':
      case 'candidateMinSim':
        clamped = clampNumber(raw, 0, 1);
        break;
      case 'anchorStreakNeeded':
        clamped = clampNumber(raw, 1, 6, true);
        break;
      default:
        clamped = raw;
        break;
    }
    next[key] = clamped;
  }
  return next;
}

function computeEffectiveThresholds(): AsrThresholds {
  const slot = getActiveSpeakerSlot();
  const bindings = getSpeakerBindings();
  const profileId = bindings[slot] || null;
  const profile = getProfileById(profileId);
  const tweaks = sanitizeProfileTweaks(profile?.asrTweaks);
  return normalizeThresholds({
    ...baseThresholds,
    ...tweaks,
  });
}

function approxEqual(a: number | null | undefined, b: number | null | undefined, eps = 1e-6): boolean {
  const au = typeof a === 'number' ? a : NaN;
  const bu = typeof b === 'number' ? b : NaN;
  if (!Number.isFinite(au) || !Number.isFinite(bu)) return false;
  return Math.abs(au - bu) <= eps;
}

function hasPatchValues(patch?: LearnedPatch | null): patch is LearnedPatch {
  return !!patch && Object.keys(patch).length > 0;
}

function updateSessionPatch(slot: SpeakerSlot) {
  const bindings = getSpeakerBindings();
  const profileId = bindings[slot] || null;
  const profile = getProfileById(profileId);
  const patch: LearnedPatch = {};
  for (const key of PROFILE_TWEAK_KEYS) {
    const driverValue = driverThresholds[key];
    if (!Number.isFinite(driverValue)) continue;
    const baseValue = baseThresholds[key];
    if (approxEqual(driverValue, baseValue)) continue;
    const storedValue = profile?.asrTweaks?.[key];
    if (typeof storedValue === 'number' && approxEqual(driverValue, storedValue)) continue;
    patch[key] = driverValue;
  }
  if (hasPatchValues(patch)) {
    sessionLearnedPatches[slot] = patch;
  } else {
    delete sessionLearnedPatches[slot];
  }
}

function refreshEffectiveThresholds(force = false) {
  if (!force && thresholdsDirty) return;
  driverThresholds = computeEffectiveThresholds();
  broadcastThresholdUpdate();
  updateSessionPatch(getActiveSpeakerSlot());
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

const handleProfileOrSlotChange = () => {
  refreshEffectiveThresholds();
};

subscribeSpeakerBindings(handleProfileOrSlotChange);
subscribeActiveSpeaker(handleProfileOrSlotChange);

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
  return { ...sessionLearnedPatches };
}

export function clearSessionLearnedPatches(): void {
  Object.keys(sessionLearnedPatches).forEach((slot) => {
    delete sessionLearnedPatches[slot as SpeakerSlot];
  });
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
