import { normTokens } from '../speech/matcher';
import { getAppStore } from '../state/appStore';

export type AsrTuningProfileId = 'reading' | 'strict' | string;

export type AsrTuningProfile = {
  id: AsrTuningProfileId;
  label: string;
  description?: string;
  updatedAt?: number;
  bufferMs: number;
  minTokenCount: number;
  minEvidenceChars: number;
  interimHysteresisBonus: number;
  interimStableRepeats: number;
  consistencyCount: number;
  consistencyWindowMs: number;
  consistencyMaxDeltaLines: number;
  consistencyMaxSpreadLines: number;
  consistencySimSlack: number;
  consistencyRequireNearMarker: boolean;
  consistencyMarkerBandLines: number;
  catchupMaxDeltaLines: number;
  catchupSimSlack: number;
  allowInterimCommit: boolean;
  allowShortEvidence: boolean;
  allowCatchup: boolean;
};

export type AsrTuningState = {
  profiles: Record<AsrTuningProfileId, AsrTuningProfile>;
  activeProfileId?: AsrTuningProfileId;
};

const DISABLE_ASR_TUNING_PERSIST = true;
const KEY = 'tp_asr_tuning_profiles_v1';
const ACTIVE_KEY = 'tp_asr_tuning_active_profile_v1';
const store = getAppStore();

const DEFAULT_READING_PROFILE: AsrTuningProfile = {
  id: 'reading',
  label: 'Reading',
  description: 'Reading profile for scripts and teleprompter cadence.',
  bufferMs: 1500,
  minTokenCount: 2,
  minEvidenceChars: 12,
  interimHysteresisBonus: 0.08,
  interimStableRepeats: 1,
  consistencyCount: 3,
  consistencyWindowMs: 2400,
  consistencyMaxDeltaLines: 6,
  consistencyMaxSpreadLines: 4,
  consistencySimSlack: 0.1,
  consistencyRequireNearMarker: true,
  consistencyMarkerBandLines: 8,
  catchupMaxDeltaLines: 10,
  catchupSimSlack: 0.12,
  allowInterimCommit: true,
  allowShortEvidence: true,
  allowCatchup: true,
};

const DEFAULT_STRICT_PROFILE: AsrTuningProfile = {
  id: 'strict',
  label: 'Strict',
  description: 'Strict profile for conversation or dictation safety.',
  bufferMs: 0,
  minTokenCount: 6,
  minEvidenceChars: 40,
  interimHysteresisBonus: 0.15,
  interimStableRepeats: 2,
  consistencyCount: 3,
  consistencyWindowMs: 2000,
  consistencyMaxDeltaLines: 6,
  consistencyMaxSpreadLines: 3,
  consistencySimSlack: 0,
  consistencyRequireNearMarker: true,
  consistencyMarkerBandLines: 6,
  catchupMaxDeltaLines: 6,
  catchupSimSlack: 0,
  allowInterimCommit: true,
  allowShortEvidence: false,
  allowCatchup: false,
};

const BUILTIN_PROFILES: Record<AsrTuningProfileId, AsrTuningProfile> = {
  reading: DEFAULT_READING_PROFILE,
  strict: DEFAULT_STRICT_PROFILE,
};

const stateFromStore = (() => {
  if (DISABLE_ASR_TUNING_PERSIST) return null;
  if (!store) return null;
  try {
    const profiles = (store.get('asrTuningProfiles') as Record<AsrTuningProfileId, AsrTuningProfile> | undefined) || {};
    const activeProfileId = (store.get('asrTuningActiveProfileId') as string | undefined) || undefined;
    return { profiles, activeProfileId };
  } catch {
    return null;
  }
})();

function normalizeProfile(profile: Partial<AsrTuningProfile> | null | undefined, fallback: AsrTuningProfile): AsrTuningProfile {
  const base = fallback || DEFAULT_READING_PROFILE;
  if (!profile || typeof profile !== 'object') {
    return { ...base, updatedAt: Date.now() };
  }
  const id = (profile.id || base.id) as AsrTuningProfileId;
  return {
    ...base,
    ...profile,
    id,
    label: profile.label || base.label,
    updatedAt: Date.now(),
  };
}

function hydrateProfiles(raw: Record<AsrTuningProfileId, Partial<AsrTuningProfile>> | null | undefined) {
  const profiles: Record<AsrTuningProfileId, AsrTuningProfile> = {
    reading: { ...DEFAULT_READING_PROFILE },
    strict: { ...DEFAULT_STRICT_PROFILE },
  };
  if (!raw || typeof raw !== 'object') return profiles;
  Object.keys(raw).forEach((id) => {
    const key = id as AsrTuningProfileId;
    const existing = profiles[key] || DEFAULT_READING_PROFILE;
    profiles[key] = normalizeProfile(raw[key], existing);
  });
  return profiles;
}

let state: AsrTuningState = (() => {
  try {
    if (DISABLE_ASR_TUNING_PERSIST) {
      return { profiles: hydrateProfiles(null), activeProfileId: 'reading' } as AsrTuningState;
    }
    if (stateFromStore) {
      return {
        profiles: hydrateProfiles(stateFromStore.profiles),
        activeProfileId: stateFromStore.activeProfileId,
      };
    }
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AsrTuningState> | Record<AsrTuningProfileId, AsrTuningProfile>) : {};
    const legacyProfiles = parsed && typeof parsed === 'object' && 'profiles' in parsed
      ? (parsed as AsrTuningState).profiles
      : null;
    const profiles = legacyProfiles && typeof legacyProfiles === 'object'
      ? legacyProfiles
      : (parsed && typeof parsed === 'object' ? (parsed as Record<AsrTuningProfileId, AsrTuningProfile>) : {});
    const activeProfileId =
      (typeof (parsed as AsrTuningState)?.activeProfileId === 'string' && (parsed as AsrTuningState).activeProfileId) ||
      (localStorage.getItem(ACTIVE_KEY) || undefined);
    return { profiles: hydrateProfiles(profiles), activeProfileId } as AsrTuningState;
  } catch {
    return { profiles: hydrateProfiles(null) } as AsrTuningState;
  }
})();

const subs = new Set<(_s: AsrTuningState) => void>();
let storeSyncSuppressed = false;
let calibrationRunning = false;

function syncAppStore() {
  if (DISABLE_ASR_TUNING_PERSIST) return;
  if (!store) return;
  storeSyncSuppressed = true;
  try { store.set('asrTuningProfiles', state.profiles); } catch {}
  try { store.set('asrTuningActiveProfileId', state.activeProfileId ?? null); } catch {}
  storeSyncSuppressed = false;
}

function emitChange() {
  try { window.dispatchEvent(new CustomEvent('tp:asr:tuning', { detail: { ...state } })); } catch {}
}

function save(opts?: { fromStore?: boolean }) {
  if (!DISABLE_ASR_TUNING_PERSIST) {
    try { localStorage.setItem(KEY, JSON.stringify(state.profiles || {})); } catch {}
    try {
      if (state.activeProfileId) localStorage.setItem(ACTIVE_KEY, state.activeProfileId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {}
  }
  subs.forEach(fn => { try { fn(state); } catch {} });
  if (!opts?.fromStore) {
    syncAppStore();
  }
  emitChange();
}

export const getAsrTuningState = (): AsrTuningState => state;

export function getActiveAsrTuningProfile(): AsrTuningProfile {
  const id = state.activeProfileId || 'reading';
  const selected = state.profiles[id];
  if (selected) return selected;
  return state.profiles.reading || DEFAULT_READING_PROFILE;
}

export function getActiveAsrTuningProfileId(): AsrTuningProfileId {
  return (state.activeProfileId || getActiveAsrTuningProfile().id || 'reading') as AsrTuningProfileId;
}

export function ensureAsrTuningProfile(id: AsrTuningProfileId) {
  if (!state.activeProfileId || !state.profiles[state.activeProfileId]) {
    state.activeProfileId = id;
    save();
  }
}

export function upsertAsrTuningProfile(profile: AsrTuningProfile) {
  const fallback = BUILTIN_PROFILES[profile.id] || DEFAULT_READING_PROFILE;
  state.profiles[profile.id] = normalizeProfile(profile, fallback);
  if (!state.activeProfileId) state.activeProfileId = profile.id;
  save();
}

export function setActiveAsrTuningProfile(id: AsrTuningProfileId) {
  state.activeProfileId = id;
  if (!state.profiles[id]) {
    const fallback = BUILTIN_PROFILES[id] || DEFAULT_READING_PROFILE;
    state.profiles[id] = normalizeProfile({ id }, fallback);
  }
  save();
}

export function onAsrTuning(fn: (_s: AsrTuningState) => void) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function startCadenceCalibration(opts?: { durationMs?: number; profileId?: AsrTuningProfileId }) {
  if (typeof window === 'undefined') {
    return { stop: () => undefined, done: Promise.resolve(null) };
  }
  if (calibrationRunning) {
    return {
      stop: () => undefined,
      done: Promise.resolve(null),
    };
  }
  calibrationRunning = true;
  const durationMs = Math.max(5000, Number(opts?.durationMs) || 30000);
  const profileId = (opts?.profileId || 'reading') as AsrTuningProfileId;
  const startedAt = Date.now();
  let totalTokens = 0;
  let totalChars = 0;
  let sampleCount = 0;
  let totalInterim = 0;
  let stableInterim = 0;
  let lastInterimText = '';
  let lastSpeechTs = 0;
  let pauseCount = 0;
  let pauseSumMs = 0;
  let stopped = false;
  let timer: number | null = null;
  let resolveDone: ((value: any) => void) | null = null;

  const handler = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    const raw = typeof detail.text === 'string' ? detail.text : '';
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) return;
    const now = Date.now();
    const tokens = normTokens(text);
    if (tokens.length) {
      totalTokens += tokens.length;
      totalChars += text.length;
      sampleCount += 1;
    }
    if (lastSpeechTs) {
      const gap = now - lastSpeechTs;
      if (gap >= 300) {
        pauseCount += 1;
        pauseSumMs += gap;
      }
    }
    lastSpeechTs = now;
    const isFinal = Boolean(detail.isFinal ?? detail.final);
    if (!isFinal) {
      totalInterim += 1;
      if (text === lastInterimText) stableInterim += 1;
      lastInterimText = text;
    } else {
      lastInterimText = '';
    }
  };

  const finish = () => {
    if (stopped) return;
    stopped = true;
    calibrationRunning = false;
    try { window.removeEventListener('tp:speech:transcript', handler as EventListener, true); } catch {}
    if (timer) {
      try { window.clearTimeout(timer); } catch {}
      timer = null;
    }

    const durationMin = Math.max(0.01, (Date.now() - startedAt) / 60000);
    const avgTokens = sampleCount ? totalTokens / sampleCount : 0;
    const avgChars = sampleCount ? totalChars / sampleCount : 0;
    const wpm = durationMin > 0 ? totalTokens / durationMin : 0;
    const avgPauseMs = pauseCount ? pauseSumMs / pauseCount : 0;
    const interimStability = totalInterim ? stableInterim / totalInterim : 0;

    let bufferMs = Math.round(900 + Math.min(1200, avgPauseMs || 600));
    if (wpm > 160) bufferMs -= 200;
    bufferMs = Math.max(700, Math.min(2200, bufferMs));

    let minTokenCount = avgTokens <= 3 ? 2 : avgTokens <= 6 ? 3 : 4;
    if (wpm > 170) minTokenCount = Math.max(2, minTokenCount - 1);
    let minEvidenceChars = Math.max(10, Math.round(minTokenCount * 6 + (avgChars > 40 ? 6 : 0)));

    let consistencyCount = interimStability >= 0.6 ? 2 : interimStability >= 0.35 ? 3 : 4;
    if (wpm < 100) consistencyCount = Math.min(4, consistencyCount + 1);
    let interimStableRepeats = interimStability >= 0.6 ? 1 : 2;

    const baseProfile = state.profiles[profileId] || DEFAULT_READING_PROFILE;
    const nextProfile = {
      ...baseProfile,
      id: profileId,
      bufferMs,
      minTokenCount,
      minEvidenceChars,
      interimStableRepeats,
      consistencyCount,
      consistencyWindowMs: Math.max(1200, Math.min(3200, Math.round(bufferMs + 800))),
    } as AsrTuningProfile;

    upsertAsrTuningProfile(nextProfile);
    const result = {
      profileId,
      bufferMs,
      minTokenCount,
      minEvidenceChars,
      interimStableRepeats,
      consistencyCount,
      avgTokens,
      avgChars,
      wpm,
      avgPauseMs,
      interimStability,
    };
    try { window.dispatchEvent(new CustomEvent('tp:asr:tuning-calibrated', { detail: result })); } catch {}
    if (resolveDone) resolveDone(result);
  };

  const stop = () => finish();
  const done = new Promise((resolve) => {
    resolveDone = resolve as any;
    timer = window.setTimeout(() => finish(), durationMs);
  });

  try { window.addEventListener('tp:speech:transcript', handler as EventListener, true); } catch {}
  return { stop, done };
}

if (store && !DISABLE_ASR_TUNING_PERSIST) {
  try {
    store.subscribe('asrTuningProfiles', (next) => {
      if (storeSyncSuppressed) return;
      const profilesObj = next && typeof next === 'object' ? (next as Record<AsrTuningProfileId, AsrTuningProfile>) : {};
      state.profiles = hydrateProfiles(profilesObj);
      save({ fromStore: true });
    });
    store.subscribe('asrTuningActiveProfileId', (next) => {
      if (storeSyncSuppressed) return;
      state.activeProfileId = typeof next === 'string' && next ? (next as AsrTuningProfileId) : undefined;
      save({ fromStore: true });
    });
  } catch {
    // best-effort only
  }
  syncAppStore();
}

try {
  if (!DISABLE_ASR_TUNING_PERSIST) {
    window.addEventListener('storage', (e: StorageEvent) => {
      try {
        if (e.key === KEY && e.newValue) {
          const parsed = JSON.parse(e.newValue) as Partial<AsrTuningState> | Record<AsrTuningProfileId, AsrTuningProfile>;
          const legacyProfiles = parsed && typeof parsed === 'object' && 'profiles' in parsed
            ? (parsed as AsrTuningState).profiles
            : null;
          const profiles = legacyProfiles && typeof legacyProfiles === 'object'
            ? legacyProfiles
            : (parsed && typeof parsed === 'object' ? (parsed as Record<AsrTuningProfileId, AsrTuningProfile>) : {});
          state = {
            ...state,
            profiles: hydrateProfiles(profiles || {}),
          } as AsrTuningState;
          save({ fromStore: true });
        }
        if (e.key === ACTIVE_KEY) {
          state.activeProfileId = e.newValue || undefined;
          save({ fromStore: true });
        }
      } catch {}
    });
  }
} catch {}

try {
  (window as any).__tpAsrTuning = {
    getState: getAsrTuningState,
    getActiveProfile: getActiveAsrTuningProfile,
    setActiveProfile: setActiveAsrTuningProfile,
    upsertProfile: upsertAsrTuningProfile,
    ensureProfile: ensureAsrTuningProfile,
    startCalibration: startCadenceCalibration,
  };
} catch {}
