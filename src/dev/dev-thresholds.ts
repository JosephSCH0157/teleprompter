import type { AsrThresholds } from '../asr/asr-thresholds';
import { DEFAULT_ASR_THRESHOLDS, normalizeThresholds } from '../asr/asr-thresholds';

const STORAGE_KEY = 'tp_asr_thresholds_v1';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadDevAsrThresholds(): AsrThresholds | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return normalizeThresholds({ ...DEFAULT_ASR_THRESHOLDS, ...parsed });
  } catch {
    return null;
  }
}

export function saveDevAsrThresholds(thresholds: AsrThresholds) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
  } catch {
    // ignore serialization/localStorage failures
  }
}
