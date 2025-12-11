// Minimal app store for centralizing Settings and small app state.
// Exposes window.__tpStore with get/set/subscribe and automatic persistence for a few keys.

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

// Scroll router keys
const SCROLL_MODE_KEY = 'tp_scroll_mode_v1';
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
const PAGE_KEY = 'tp_page_v1';
const HUD_ENABLED_KEY = 'tp_hud_enabled_v1';
const OVERLAY_KEY = 'tp_overlay_v1';
const CAMERA_KEY = 'tp_camera_enabled_v1';

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
  page: PAGE_KEY,
  overlay: OVERLAY_KEY,
  cameraEnabled: CAMERA_KEY,
  // Scroll router persistence
  scrollMode: SCROLL_MODE_KEY,
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
};

export type PageName = string;

type Subscriber<T = unknown> = (value: T) => void;
type SubscriptionMap = Record<string, Array<Subscriber<any>>>;
type PageStore = AppStore;

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
  prerollSeconds: number;
  devHud: boolean;
  hudSupported: boolean;
  hudEnabledByUser: boolean;
  page: PageName;
  overlay: 'none' | 'settings' | 'help' | 'shortcuts';

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

function buildInitialState(): AppStoreState {
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
    overlay: (() => {
      try {
        const v = localStorage.getItem(OVERLAY_KEY) || 'none';
        return (v === 'settings' || v === 'help' || v === 'shortcuts') ? v as any : 'none';
      } catch {
        return 'none';
      }
    })(),
    page: (() => {
      try {
        const v = localStorage.getItem(PAGE_KEY) || 'scripts';
        return (v === 'scripts' || v === 'settings' || v === 'help' || v === 'hud') ? v as PageName : 'scripts';
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
    scrollMode: (() => {
      try {
        return (
          localStorage.getItem(SCROLL_MODE_KEY) ||
          localStorage.getItem('tp_scroll_mode') ||
          localStorage.getItem('scrollMode') ||
          'manual'
        );
      } catch {
        return 'manual';
      }
    })(),
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

export function createAppStore(initial?: Partial<AppStoreState>): AppStore {
  const subs: SubscriptionMap = Object.create(null);
  const baseState = buildInitialState();
  const state: AppStoreState = Object.assign(
    {},
    baseState,
    ensureExistingState(),
    initial || {},
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
      const prev = state[key];
      if (prev === value) return value;
      state[key] = value;
      try {
        const storageKey = persistMap[key];
        if (storageKey) {
          if (typeof value === 'boolean') {
            localStorage.setItem(storageKey, value ? '1' : '0');
          } else if (value === null || typeof value === 'undefined') {
            localStorage.removeItem(storageKey);
          } else {
            localStorage.setItem(storageKey, String(value));
          }
          if (key === 'autoRecord') {
            try {
              localStorage.removeItem(LEGACY_AUTO_RECORD_KEY);
            } catch {}
          }
          if (key === 'scrollMode') {
            try { localStorage.setItem('tp_scroll_mode', String(value)); } catch {}
            try { localStorage.setItem('scrollMode', String(value)); } catch {}
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
  } catch {}

  return appStore;
}

// Create and expose a singleton by default so existing imports still work.
const appStoreSingleton = createAppStore();
export { appStoreSingleton as appStore };
