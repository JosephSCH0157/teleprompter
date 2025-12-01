// Single source of truth for recorder settings (OBS, bridge, companion, etc.)
// Defaults are local-dev friendly and hydrate from localStorage (`tp_rec_settings_v1`).

// LocalStorage key
const STORAGE_KEY = 'tp_rec_settings_v1';

// Default OBS URL: fixed to localhost to align with CSP and first-run behavior
export const DEFAULT_OBS_URL = 'ws://127.0.0.1:4455';

export type RecorderId =
  | 'obs'
  | 'companion'
  | 'bridge'
  | 'descript'
  | 'capcut'
  | 'winmedia';

export interface ObsConfig {
  url: string;
  password: string;
}

export interface CompanionConfig {
  url: string;
  buttonId: string;
}

export interface BridgeConfig {
  startUrl: string;
  stopUrl: string;
}

export interface HotkeyConfig {
  startHotkey: string;
  via: 'bridge' | 'companion';
}

export interface RecorderConfigs {
  obs: ObsConfig;
  companion: CompanionConfig;
  bridge: BridgeConfig;
  descript: HotkeyConfig;
  capcut: HotkeyConfig;
  winmedia: HotkeyConfig;
}

export interface RecorderEnabled {
  obs: boolean;
  companion: boolean;
  bridge: boolean;
  descript: boolean;
  capcut: boolean;
  winmedia: boolean;
}

export interface RecorderSettingsState {
  enabled: RecorderEnabled;
  configs: RecorderConfigs;
}

// ---- defaults (only place they live) ----

const DEFAULT_STATE: RecorderSettingsState = {
  enabled: {
    obs: false,
    companion: false,
    bridge: false,
    descript: false,
    capcut: false,
    winmedia: false,
  },
  configs: {
    obs: { url: DEFAULT_OBS_URL, password: '' },
    companion: { url: 'http://127.0.0.1:8000', buttonId: '1.1' },
    bridge: {
      startUrl: 'http://127.0.0.1:5723/record/start',
      stopUrl: 'http://127.0.0.1:5723/record/stop',
    },
    descript: { startHotkey: 'Ctrl+R', via: 'bridge' },
    capcut: { startHotkey: 'Ctrl+R', via: 'companion' },
    winmedia: { startHotkey: 'Ctrl+R', via: 'bridge' },
  },
};

// ---- helpers ----

function cloneState<T>(value: T): T {
  try {
    // @ts-ignore structuredClone is available in modern browsers/Node 17+
    return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function deepMergeDefaults<T>(defaults: T, stored: unknown): T {
  if (typeof stored !== 'object' || stored === null) {
    return cloneState(defaults);
  }

  const result: any = cloneState(defaults);

  for (const [key, value] of Object.entries(stored)) {
    if (!(key in result)) continue;

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null
    ) {
      result[key] = deepMergeDefaults(result[key], value);
    } else {
      result[key] = value as any;
    }
  }

  return result as T;
}

function loadState(): RecorderSettingsState {
  try {
    if (typeof window === 'undefined') {
      return cloneState(DEFAULT_STATE);
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneState(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return deepMergeDefaults(DEFAULT_STATE, parsed);
  } catch {
    return cloneState(DEFAULT_STATE);
  }
}

function persistState(state: RecorderSettingsState): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // non-fatal; ignore
  }
}

// ---- store + listeners ----

let currentState: RecorderSettingsState = loadState();

type Listener = (state: Readonly<RecorderSettingsState>) => void;
const listeners = new Set<Listener>();

function notify() {
  const frozen = Object.freeze(cloneState(currentState));
  listeners.forEach((fn) => fn(frozen));
}

// ---- public API ----

export function getRecorderSettings(): Readonly<RecorderSettingsState> {
  return Object.freeze(cloneState(currentState));
}

export function subscribeRecorderSettings(listener: Listener): () => void {
  listeners.add(listener);
  try {
    listener(Object.freeze(cloneState(currentState)));
  } catch {
    // ignore listener errors
  }
  return () => listeners.delete(listener);
}

export function updateRecorderSettings(
  updater: Partial<RecorderSettingsState> | ((prev: RecorderSettingsState) => RecorderSettingsState),
): void {
  if (typeof updater === 'function') {
    currentState = (updater as (p: RecorderSettingsState) => RecorderSettingsState)(currentState);
  } else {
    currentState = deepMergeDefaults(currentState, updater);
  }
  persistState(currentState);
  notify();
}

export function setRecorderEnabled(id: RecorderId, enabled: boolean): void {
  updateRecorderSettings((prev) => ({
    ...prev,
    enabled: { ...prev.enabled, [id]: enabled },
  }));
}

export function setObsConfig(patch: Partial<ObsConfig>): void {
  updateRecorderSettings((prev) => ({
    ...prev,
    configs: {
      ...prev.configs,
      obs: { ...prev.configs.obs, ...patch },
    },
  }));
}
