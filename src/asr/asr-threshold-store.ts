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

export function getBaseAsrThresholds(): AsrThresholds {
  return baseThresholds;
}
