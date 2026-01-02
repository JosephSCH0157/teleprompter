import type { AsrThresholds } from './asr-thresholds';
import { DEFAULT_ASR_THRESHOLDS, normalizeThresholds } from './asr-thresholds';
import { loadDevAsrThresholds } from '../dev/dev-thresholds';
import {
  getProfileById,
  getSpeakerBindings,
  getActiveSpeakerSlot,
  subscribeSpeakerBindings,
  subscribeActiveSpeaker,
} from '../ui/speaker-profiles-store';

export const THRESHOLD_EVENT = 'tp:asr:thresholds';
const PROFILE_TWEAK_KEYS: Array<keyof AsrThresholds> = [
  'commitFinalMinSim',
  'commitInterimMinSim',
  'stickinessDelta',
  'interimStreakNeeded',
  'tieDelta',
  'maxJumpsPerSecond',
  'anchorMinSim',
  'anchorStreakNeeded',
];

let baseThresholds: AsrThresholds = normalizeThresholds({ ...DEFAULT_ASR_THRESHOLDS });
let driverThresholds: AsrThresholds = baseThresholds;

function broadcastThresholdUpdate() {
  if (typeof window === 'undefined') return;
  try {
    const payload = driverThresholds;
    window.dispatchEvent(new CustomEvent(THRESHOLD_EVENT, { detail: payload }));
  } catch {
    // ignore
  }
}

function filterProfileTweaks(tweaks?: Partial<AsrThresholds>): Partial<AsrThresholds> {
  if (!tweaks) return {};
  const next: Partial<AsrThresholds> = {};
  for (const key of PROFILE_TWEAK_KEYS) {
    const value = tweaks[key];
    if (Number.isFinite(value)) {
      next[key] = value as number;
    }
  }
  return next;
}

function computeEffectiveThresholds(): AsrThresholds {
  const slot = getActiveSpeakerSlot();
  const bindings = getSpeakerBindings();
  const profileId = bindings[slot] || null;
  const profile = getProfileById(profileId);
  const tweaks = filterProfileTweaks(profile?.asrTweaks);
  return normalizeThresholds({
    ...baseThresholds,
    ...tweaks,
  });
}

function refreshEffectiveThresholds() {
  driverThresholds = computeEffectiveThresholds();
  broadcastThresholdUpdate();
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

export function setAsrDriverThresholds(next: Partial<AsrThresholds>) {
  baseThresholds = normalizeThresholds({ ...baseThresholds, ...next });
  refreshEffectiveThresholds();
}

export function getAsrDriverThresholds(): AsrThresholds {
  return driverThresholds;
}

export function getEffectiveAsrThresholds(): AsrThresholds {
  return getAsrDriverThresholds();
}
