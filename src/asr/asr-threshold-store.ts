import { DEFAULT_ASR_THRESHOLDS, normalizeThresholds, type AsrThresholds } from './asr-thresholds';
import { loadDevAsrThresholds } from '../dev/dev-thresholds';

const THRESHOLD_EVENT = 'tp:asr:thresholds';

let driverThresholds: AsrThresholds = DEFAULT_ASR_THRESHOLDS;

function broadcastThresholdUpdate() {
  if (typeof window === 'undefined') return;
  try {
    const payload = driverThresholds;
    window.dispatchEvent(new CustomEvent(THRESHOLD_EVENT, { detail: payload }));
  } catch {
    // ignore
  }
}

function applyDevOverrides() {
  const overrides = loadDevAsrThresholds();
  if (overrides) {
    driverThresholds = overrides;
  }
}

applyDevOverrides();
broadcastThresholdUpdate();

export function setAsrDriverThresholds(next: Partial<AsrThresholds>) {
  driverThresholds = normalizeThresholds({ ...driverThresholds, ...next });
  broadcastThresholdUpdate();
}

export function getAsrDriverThresholds(): AsrThresholds {
  return driverThresholds;
}
