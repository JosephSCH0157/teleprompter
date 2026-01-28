// Minimal app store for centralizing Settings and small app state.
// Exposes window.__tpStore with get/set/subscribe and automatic persistence for a few keys.
import { readScrollMode, writeScrollMode } from '../persist/scrollModePersist';

const IS_TEST = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';

const DEVICE_KEY = 'tp_mic_device_v1';
const OBS_ENABLED_KEY = 'tp_obs_enabled';
const OBS_HOST_KEY = 'tp_obs_host';
const OBS_PASSWORD_KEY = 'tp_obs_password';
const OBS_SCENE_KEY = 'tp_obs_scene';
const OBS_RECONNECT_KEY = 'tp_obs_reconnect';
const AUTO_RECORD_KEY = 'tp_auto_record_on_start_v1';
const LEGACY_AUTO_RECORD_KEY = 'tp_auto_record';
const PREROLL_SEC_KEY = 'tp_preroll_seconds';
const DEV_HUD_KEY = 'tp_dev_hud';
const SETTINGS_TAB_KEY = 'tp_settings_tab';
const LEGACY_ASR_SETTINGS_KEY = 'tp_asr_settings_v1';
const ASR_ENGINE_KEY = 'tp_asr_engine_v1';
const ASR_LANG_KEY = 'tp_asr_language_v1';
const ASR_INTERIM_KEY = 'tp_asr_interim_v1';
const ASR_FILTER_KEY = 'tp_asr_filter_v1';
const ASR_THRESHOLD_KEY = 'tp_asr_threshold_v1';
const ASR_ENDPOINT_KEY = 'tp_asr_endpoint_v1';
const ASR_PROFILES_KEY = 'tp_asr_profiles_v1';
const ASR_ACTIVE_PROFILE_KEY = 'tp_asr_active_profile_v1';
const ASR_TUNING_PROFILES_KEY = 'tp_asr_tuning_profiles_v1';
const ASR_TUNING_ACTIVE_PROFILE_KEY = 'tp_asr_tuning_active_profile_v1';
const RECORD_AUDIO_ONLY_KEY = 'tp_record_audio_only';

// Scroll router keys
const TIMED_SPEED_KEY = 'tp_scroll_timed_speed_v1';
const WPM_TARGET_KEY = 'tp_scroll_wpm_target_v1';
const WPM_BASEPX_KEY = 'tp_scroll_wpm_basepx_v1';
const WPM_MINPX_KEY = 'tp_scroll_wpm_minpx_v1';
const WPM_MAXPX_KEY = 'tp_scroll_wpm_maxpx_v1';
const WPM_EWMA_KEY = 'tp_scroll_wpm_ewma_v1';
const HYB_ATTACK_KEY = 'tp_scroll_hybrid_attack_v1';
const HYB_RELEASE_KEY = 'tp_scroll_hybrid_release_v1';
const HYB_IDLE_KEY = 'tp_scroll_hybrid_idle_v1';
const STEP_PX_KEY = 'tp_scroll_step_px_v1';
const REH_PUNCT_KEY = 'tp_scroll_reh_punct_v1';
const REH_RESUME_KEY = 'tp_scroll_reh_resume_v1';
const ALLOWED_PAGES = new Set<PageName>(['scripts']);
const ALLOWED_OVERLAYS = new Set<AppStoreState['overlay']>(['none', 'settings', 'help', 'shortcuts']);
const HUD_ENABLED_KEY = 'tp_hud_enabled_v1';
const HUD_SPEECH_NOTES_KEY = 'tp_hud_speech_notes_v1';
const OVERLAY_KEY = 'tp_overlay_v1';
const CAMERA_KEY = 'tp_camera_enabled_v1';

type SaveStatusState = 'idle' | 'saving' | 'saved' | 'failed';

const persistMap: Partial<Record<keyof AppStoreState, string>> = {
  settingsTab: SETTINGS_TAB_KEY,
  micDevice: DEVICE_KEY,
  obsEnabled: OBS_ENABLED_KEY,
  obsScene: OBS_SCENE_KEY,
  obsReconnect: OBS_RECONNECT_KEY,
  obsHost: OBS_HOST_KEY,
  obsPassword: OBS_PASSWORD_KEY,
  autoRecord: AUTO_RECORD_KEY,
  prerollSeconds: PREROLL_SEC_KEY,
  devHud: DEV_HUD_KEY,
  hudEnabledByUser: HUD_ENABLED_KEY,
  hudSpeechNotesEnabledByUser: HUD_SPEECH_NOTES_KEY,
  overlay: OVERLAY_KEY,
  cameraEnabled: CAMERA_KEY,
  recordAudioOnly: RECORD_AUDIO_ONLY_KEY,
  // Scroll router persistence
  timedSpeed: TIMED_SPEED_KEY,
  wpmTarget: WPM_TARGET_KEY,
  wpmBasePx: WPM_BASEPX_KEY,
  wpmMinPx: WPM_MINPX_KEY,
  wpmMaxPx: WPM_MAXPX_KEY,
  wpmEwmaSec: WPM_EWMA_KEY,
  hybridAttackMs: HYB_ATTACK_KEY,
  hybridReleaseMs: HYB_RELEASE_KEY,
  hybridIdleMs: HYB_IDLE_KEY,
  stepPx: STEP_PX_KEY,
  rehearsalPunct: REH_PUNCT_KEY,
  rehearsalResumeMs: REH_RESUME_KEY,
  'asr.engine': ASR_ENGINE_KEY,
  'asr.language': ASR_LANG_KEY,
  'asr.useInterimResults': ASR_INTERIM_KEY,
  'asr.threshold': ASR_THRESHOLD_KEY,
  'asr.endpointMs': ASR_ENDPOINT_KEY,
  'asr.filterFillers': ASR_FILTER_KEY,
  asrProfiles: ASR_PROFILES_KEY,
  asrActiveProfileId: ASR_ACTIVE_PROFILE_KEY,
  asrTuningProfiles: ASR_TUNING_PROFILES_KEY,
  asrTuningActiveProfileId: ASR_TUNING_ACTIVE_PROFILE_KEY,
};

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function loadLegacyAsrSettings() {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(LEGACY_ASR_SETTINGS_KEY);
    return parseJson<Partial<Record<string, any>>>(raw);
  } catch {
    return null;
  }
}

export type PageName = string;

type Subscriber<T = unknown> = (value: T) => void;
type SubscriptionMap = Record<string, Array<Subscriber<any>>>;

export type AppStoreState = {
  // UI / Settings
  settingsTab: string;
  micDevice: string;
  obsEnabled: boolean;
  micGranted: boolean;
  cameraEnabled: boolean;
  cameraAvailable: boolean;
  obsScene: string;
  obsReconnect: boolean;
  obsHost: string;
  obsPassword: string;
  autoRecord: boolean;
  recordAudioOnly: boolean;
  prerollSeconds: number;
  devHud: boolean;
  hudSupported: boolean;
  hudEnabledByUser: boolean;
  hudSpeechNotesEnabledByUser: boolean;
  page: PageName;
  overlay: 'none' | 'settings' | 'help' | 'shortcuts';
  asrLive: boolean;
  'asr.engine': string;
  'asr.language': string;
  'asr.useInterimResults': boolean;
  'asr.filterFillers': boolean;
  'asr.threshold': number;
  'asr.endpointMs': number;
  asrProfiles: Record<string, unknown>;
  asrActiveProfileId: string | null;
  asrTuningProfiles: Record<string, unknown>;
  asrTuningActiveProfileId: string | null;
  asrLastAppliedAt: number;
  asrLastAppliedSummary: Record<string, unknown>;
  asrLastApplyOk: boolean;
  settingsSaveStatus: {
    state: SaveStatusState;
    at: number;
    error?: string;
  };

  // Scroll router (persisted)
  scrollMode: string;
  timedSpeed: number;
  wpmTarget: number;
  wpmBasePx: number;
  wpmMinPx: number;
  wpmMaxPx: number;
  wpmEwmaSec: number;
  hybridAttackMs: number;
  hybridReleaseMs: number;
  hybridIdleMs: number;
  stepPx: number;
  rehearsalPunct: string;
  rehearsalResumeMs: number;

  // transient session state (not persisted)
  obsUrl: string;
  obsPort: string;
  obsSecure: boolean;

  // fallthrough for any additional keys
  [key: string]: unknown;
};

export interface AppStore {
  __tsOwned: true;
  get<K extends keyof AppStoreState>(key: K): AppStoreState[K];
  set<K extends keyof AppStoreState>(key: K, value: AppStoreState[K]): AppStoreState[K];
  subscribe<K extends keyof AppStoreState>(key: K, fn: Subscriber<AppStoreState[K]>): () => void;
  subscribeAll(map: Partial<Record<keyof AppStoreState, Subscriber<AppStoreState[keyof AppStoreState]>>>): () => void;
  state: AppStoreState;
  getSnapshot(): AppStoreState;
}

declare global {
  interface Window {
    __tpStore?: AppStore;
  }
}

function migrateAutoRecordFlag() {
  try {
    const current = localStorage.getItem(AUTO_RECORD_KEY);
    if (current !== null && typeof current !== 'undefined') {
      if (localStorage.getItem(LEGACY_AUTO_RECORD_KEY) !== null) {
        try {
          localStorage.removeItem(LEGACY_AUTO_RECORD_KEY);
        } catch {}
      }
      return;
    }
    const legacy = localStorage.getItem(LEGACY_AUTO_RECORD_KEY);
    if (legacy !== null && typeof legacy !== 'undefined') {
      localStorage.setItem(AUTO_RECORD_KEY, legacy === '1' ? '1' : '0');
      try {
        localStorage.removeItem(LEGACY_AUTO_RECORD_KEY);
      } catch {}
    }
  } catch {}
}

migrateAutoRecordFlag();

function resolveInitialScrollMode(): string {
  try {
    const persisted = readScrollMode();
    return persisted ? String(persisted) : 'hybrid';
  } catch {
    return 'hybrid';
  }
}

function buildInitialState(): AppStoreState {
  const legacyAsrSettings = loadLegacyAsrSettings();
  return {
    // UI / Settings
    settingsTab: (() => {
      try {
        return localStorage.getItem(SETTINGS_TAB_KEY) || 'general';
      } catch {
        return 'general';
      }
    })(),
    micDevice: (() => {
      try {
        return localStorage.getItem(DEVICE_KEY) || '';
      } catch {
        return '';
      }
    })(),
    cameraEnabled: (() => {
      try {
        const raw = localStorage.getItem(CAMERA_KEY);
        if (raw == null) return false;
        return raw === '1';
      } catch {
        return false;
      }
    })(),
    cameraAvailable: false,
    micGranted: false,
    obsEnabled: (() => {
      try {
        return localStorage.getItem(OBS_ENABLED_KEY) === '1';
      } catch {
        return false;
      }
    })(),
    obsScene: (() => {
      try {
        return localStorage.getItem(OBS_SCENE_KEY) || '';
      } catch {
        return '';
      }
    })(),
    obsReconnect: (() => {
      try {
        return localStorage.getItem(OBS_RECONNECT_KEY) === '1';
      } catch {
        return false;
      }
    })(),
    autoRecord: (() => {
      try {
        return localStorage.getItem(AUTO_RECORD_KEY) === '1';
      } catch {
        return false;
      }
    })(),
    recordAudioOnly: (() => {
      try {
        return localStorage.getItem(RECORD_AUDIO_ONLY_KEY) === '1';
      } catch {
        return false;
      }
    })(),
    prerollSeconds: (() => {
      try {
        const n = parseInt(localStorage.getItem(PREROLL_SEC_KEY) || '3', 10);
        return isFinite(n) ? Math.max(0, Math.min(10, n)) : 3;
      } catch {
        return 3;
      }
    })(),
    devHud: (() => {
      try {
        return localStorage.getItem(DEV_HUD_KEY) === '1';
      } catch {
        return false;
      }
    })(),
    hudSupported: true,
    hudEnabledByUser: (() => {
      try {
        return localStorage.getItem(HUD_ENABLED_KEY) !== '0';
      } catch {
        return true;
      }
    })(),
    hudSpeechNotesEnabledByUser: (() => {
      try {
        return localStorage.getItem(HUD_SPEECH_NOTES_KEY) === '1';
      } catch {
        return false;
      }
    })(),
    asrLive: false,
    'asr.engine': (() => {
      try {
        const raw = localStorage.getItem(ASR_ENGINE_KEY);
        if (raw) return raw;
        if (legacyAsrSettings?.engine && typeof legacyAsrSettings.engine === 'string') {
          return legacyAsrSettings.engine;
        }
      } catch {}
      return 'webspeech';
    })(),
    'asr.language': (() => {
      try {
        const raw = localStorage.getItem(ASR_LANG_KEY);
        if (raw) return raw;
        if (legacyAsrSettings?.lang && typeof legacyAsrSettings.lang === 'string') {
          return legacyAsrSettings.lang;
        }
      } catch {}
      return 'en-US';
    })(),
    'asr.useInterimResults': (() => {
      try {
        const raw = localStorage.getItem(ASR_INTERIM_KEY);
        if (raw !== null) return raw === '1';
        if (legacyAsrSettings?.interim !== undefined) return !!legacyAsrSettings.interim;
      } catch {}
      return true;
    })(),
    'asr.filterFillers': (() => {
      try {
        const raw = localStorage.getItem(ASR_FILTER_KEY);
        if (raw !== null) return raw === '1';
        if (legacyAsrSettings?.filterFillers !== undefined) return !!legacyAsrSettings.filterFillers;
      } catch {}
      return true;
    })(),
    'asr.threshold': (() => {
      try {
        const raw = localStorage.getItem(ASR_THRESHOLD_KEY);
        const num = Number(raw);
        if (raw !== null && !Number.isNaN(num)) return num;
        if (legacyAsrSettings?.threshold !== undefined) return Number(legacyAsrSettings.threshold) || 0.6;
      } catch {}
      return 0.6;
    })(),
    'asr.endpointMs': (() => {
      try {
        const raw = localStorage.getItem(ASR_ENDPOINT_KEY);
        const num = Number(raw);
        if (raw !== null && !Number.isNaN(num)) return num;
        if (legacyAsrSettings?.endpointMs !== undefined) return Number(legacyAsrSettings.endpointMs) || 700;
      } catch {}
      return 700;
    })(),
    asrProfiles: (() => {
      try {
        const raw = localStorage.getItem(ASR_PROFILES_KEY);
        const parsed = parseJson<Record<string, unknown>>(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {}
      return {};
    })(),
    asrActiveProfileId: (() => {
      try {
        const raw = localStorage.getItem(ASR_ACTIVE_PROFILE_KEY);
        if (raw) return raw;
      } catch {}
      return null;
    })(),
    asrTuningProfiles: (() => {
      try {
        const raw = localStorage.getItem(ASR_TUNING_PROFILES_KEY);
        const parsed = parseJson<Record<string, unknown>>(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {}
      return {};
    })(),
    asrTuningActiveProfileId: (() => {
      try {
        const raw = localStorage.getItem(ASR_TUNING_ACTIVE_PROFILE_KEY);
        if (raw) return raw;
      } catch {}
      return null;
    })(),
    asrLastAppliedAt: 0,
    asrLastAppliedSummary: {},
    asrLastApplyOk: false,
    settingsSaveStatus: { state: 'idle', at: 0 },
    overlay: (() => {
      try {
        const v = localStorage.getItem(OVERLAY_KEY) || 'none';
        if (!ALLOWED_OVERLAYS.has(v as any)) {
          try { localStorage.removeItem(OVERLAY_KEY); } catch {}
          return 'none';
        }
        return v as any;
      } catch {
        return 'none';
      }
    })(),
    page: (() => {
      try {
        const v = ('scripts') as PageName;
        if (!ALLOWED_PAGES.has(v)) {
          // page is no longer persisted
          return 'scripts';
        }
        return v;
      } catch {
        return 'scripts';
      }
    })(),
    obsHost: (() => {
      try {
        return localStorage.getItem(OBS_HOST_KEY) || '';
      } catch {
        return '';
      }
    })(),
    obsPassword: (() => {
      try {
        return localStorage.getItem(OBS_PASSWORD_KEY) || '';
      } catch {
        return '';
      }
    })(),

    // Scroll router (persisted)
    scrollMode: resolveInitialScrollMode(),
    timedSpeed: (() => {
      try {
        const v = parseFloat(localStorage.getItem(TIMED_SPEED_KEY) || '');
        return isFinite(v) && v > 0 ? v : 25;
      } catch {
        return 25;
      }
    })(),
    wpmTarget: (() => {
      try {
        const v = parseInt(localStorage.getItem(WPM_TARGET_KEY) || '');
        return isFinite(v) && v >= 60 ? v : 180;
      } catch {
        return 180;
      }
    })(),
    wpmBasePx: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_BASEPX_KEY) || '');
        return isFinite(v) && v > 0 ? v : 25;
      } catch {
        return 25;
      }
    })(),
    wpmMinPx: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_MINPX_KEY) || '');
        return isFinite(v) && v > 0 ? v : 6;
      } catch {
        return 6;
      }
    })(),
    wpmMaxPx: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_MAXPX_KEY) || '');
        return isFinite(v) && v > 0 ? v : 200;
      } catch {
        return 200;
      }
    })(),
    wpmEwmaSec: (() => {
      try {
        const v = parseFloat(localStorage.getItem(WPM_EWMA_KEY) || '');
        return isFinite(v) && v > 0 ? v : 1.0;
      } catch {
        return 1.0;
      }
    })(),
    hybridAttackMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(HYB_ATTACK_KEY) || '');
        return isFinite(v) && v >= 0 ? v : 120;
      } catch {
        return 120;
      }
    })(),
    hybridReleaseMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(HYB_RELEASE_KEY) || '');
        return isFinite(v) && v >= 0 ? v : 250;
      } catch {
        return 250;
      }
    })(),
    hybridIdleMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(HYB_IDLE_KEY) || '');
        return isFinite(v) && v >= 0 ? v : 1500;
      } catch {
        return 1500;
      }
    })(),
    stepPx: (() => {
      try {
        const v = parseInt(localStorage.getItem(STEP_PX_KEY) || '');
        return isFinite(v) && v > 0 ? v : 120;
      } catch {
        return 120;
      }
    })(),
    rehearsalPunct: (() => {
      try {
        const v = localStorage.getItem(REH_PUNCT_KEY);
        return v != null && v !== '' ? v : '.,;:?!';
      } catch {
        return '.,;:?!';
      }
    })(),
    rehearsalResumeMs: (() => {
      try {
        const v = parseInt(localStorage.getItem(REH_RESUME_KEY) || '');
        return isFinite(v) && v >= 100 ? v : 1000;
      } catch {
        return 1000;
      }
    })(),

    // transient session state (not persisted)
    obsUrl: '',
    obsPort: '',
    obsSecure: false,
  };
}

function ensureExistingState(): Partial<AppStoreState> {
  if (IS_TEST) {
    try { delete (window as any).__tpStore; } catch {}
    return {};
  }
  try {
    const existing = (window as any).__tpStore;
    if (!existing || typeof existing !== 'object') return {};
    const snapshot =
      typeof existing.getSnapshot === 'function'
        ? existing.getSnapshot()
        : (existing.state as Partial<AppStoreState> | undefined);
    if (snapshot && typeof snapshot === 'object') return snapshot;
  } catch {}
  return {};
}

function sanitizeState(state: AppStoreState): AppStoreState {
  // Clamp page to allowed set and clean persisted value if invalid
  if (!ALLOWED_PAGES.has(state.page as PageName)) {
    state.page = 'scripts';
  }
  // Clamp overlay to allowed set and clear bad persisted values
  if (!ALLOWED_OVERLAYS.has(state.overlay)) {
    state.overlay = 'none';
    try { localStorage.removeItem(OVERLAY_KEY); } catch {}
  }
  if (state.scrollMode === 'manual') {
    state.scrollMode = 'step';
  }
  if (!state.asrProfiles || typeof state.asrProfiles !== 'object') {
    state.asrProfiles = {};
  }
  if (state.asrActiveProfileId && typeof state.asrActiveProfileId !== 'string') {
    state.asrActiveProfileId = null;
  }
  if (!state.asrTuningProfiles || typeof state.asrTuningProfiles !== 'object') {
    state.asrTuningProfiles = {};
  }
  if (state.asrTuningActiveProfileId && typeof state.asrTuningActiveProfileId !== 'string') {
    state.asrTuningActiveProfileId = null;
  }
  if (typeof state.asrLastAppliedAt !== 'number') {
    state.asrLastAppliedAt = 0;
  }
  if (!state.asrLastAppliedSummary || typeof state.asrLastAppliedSummary !== 'object') {
    state.asrLastAppliedSummary = {};
  }
  if (typeof state.asrLastApplyOk !== 'boolean') {
    state.asrLastApplyOk = false;
  }
  if (!state.settingsSaveStatus || typeof state.settingsSaveStatus !== 'object') {
    state.settingsSaveStatus = { state: 'idle', at: 0 };
  }
  if (typeof state.recordAudioOnly !== 'boolean') {
    state.recordAudioOnly = false;
  }
  return state;
}

export function createAppStore(initial?: Partial<AppStoreState>): AppStore {
  const subs: SubscriptionMap = Object.create(null);
  const baseState = buildInitialState();
  const state: AppStoreState = sanitizeState(
    Object.assign(
      {},
      baseState,
      ensureExistingState(),
      initial || {},
    ),
  );

  function notify(key: keyof AppStoreState, value: AppStoreState[typeof key]) {
    try {
      const k = String(key);
      const fns = subs[k] || [];
      for (let i = 0; i < fns.length; i++) {
        try {
          fns[i](value);
        } catch {}
      }
    } catch {}
  }

  function get<K extends keyof AppStoreState>(key: K): AppStoreState[K] {
    try {
      return state[key];
    } catch {
      return undefined as AppStoreState[K];
    }
  }

  function set<K extends keyof AppStoreState>(key: K, value: AppStoreState[K]): AppStoreState[K] {
    try {
      if (key === 'page') {
        value = (ALLOWED_PAGES.has(value as PageName) ? value : 'scripts') as AppStoreState[K];
      }
      if (key === 'overlay') {
        value = (ALLOWED_OVERLAYS.has(value as AppStoreState['overlay']) ? value : 'none') as AppStoreState[K];
      }
      if (key === 'scrollMode') {
        const normalized = writeScrollMode(value as unknown as string);
        value = (normalized || 'hybrid') as AppStoreState[K];
      }
      const prev = state[key];
      if (prev === value) return value;
      state[key] = value;
      try {
        const storageKey = persistMap[key];
      if (storageKey) {
        if (value === null || typeof value === 'undefined') {
          localStorage.removeItem(storageKey);
        } else if (typeof value === 'boolean') {
          localStorage.setItem(storageKey, value ? '1' : '0');
        } else if (typeof value === 'object') {
          try {
            localStorage.setItem(storageKey, JSON.stringify(value));
          } catch {
            // ignore serialization failures
          }
        } else {
          localStorage.setItem(storageKey, String(value));
        }
          if (key === 'autoRecord') {
            try {
              localStorage.removeItem(LEGACY_AUTO_RECORD_KEY);
            } catch {}
          }
        }
      } catch {}
      notify(key, value);
      return value;
    } catch {
      return value;
    }
  }

  function subscribe<K extends keyof AppStoreState>(
    key: K,
    fn: Subscriber<AppStoreState[K]>,
  ): () => void {
    if (typeof fn !== 'function') return () => {};
    const k = String(key);
    subs[k] = subs[k] || [];
    subs[k].push(fn);
    try {
      fn(state[key]);
    } catch {}
    return function unsubscribe() {
      try {
        subs[k] = (subs[k] || []).filter((x: Subscriber<AppStoreState[K]>) => x !== fn);
      } catch {}
    };
  }

  function subscribeAll(
    map: Partial<Record<keyof AppStoreState, Subscriber<AppStoreState[keyof AppStoreState]>>>,
  ): () => void {
    const unsubs: Array<() => void> = [];
    try {
      for (const k in map) {
        if (Object.prototype.hasOwnProperty.call(map, k)) {
          const key = k as keyof AppStoreState;
          const fn = map[key];
          if (fn) unsubs.push(subscribe(key, fn as any));
        }
      }
    } catch {}
    return function unsubscribeAll() {
      unsubs.forEach((u) => u && u());
    };
  }

  const appStore: AppStore = {
    __tsOwned: true,
    get,
    set,
    subscribe,
    subscribeAll,
    state,
    getSnapshot: () => ({ ...state }),
  };

  try {
    if (!IS_TEST) {
      const w = window as any;
      const existing = w.__tpStore;
      if (!existing || !existing.__tsOwned) {
        try {
          Object.defineProperty(w, '__tpStore', {
            value: appStore,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        } catch {
          w.__tpStore = appStore;
        }
      }
    }
  } catch {}

  return appStore;
}

// Create and expose a singleton by default so existing imports still work.
const appStoreSingleton = createAppStore();
export { appStoreSingleton as appStore };
