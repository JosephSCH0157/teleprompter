import { speechStore, type SpeechState } from '../../state/speech-store';
export type { SpeechState } from '../../state/speech-store';

type AsrSettingsPatch = Partial<SpeechState>;

const MIN_ENDPOINT_MS = 100;
const MAX_ENDPOINT_MS = 900000;

function clampEndpoint(value?: number | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  const candidate = Math.round(Number(value) || 0);
  if (!Number.isFinite(candidate)) return undefined;
  return Math.max(MIN_ENDPOINT_MS, Math.min(MAX_ENDPOINT_MS, candidate));
}

export function getSpeechStore() {
  return speechStore;
}

export function getAsrSettings(): SpeechState {
  return speechStore.get();
}

export function setAsrSettings(patch: AsrSettingsPatch): void {
  const normalized: AsrSettingsPatch = { ...patch };
  if (Object.prototype.hasOwnProperty.call(normalized, 'endpointingMs')) {
    normalized.endpointingMs = clampEndpoint(normalized.endpointingMs as number) ?? undefined;
  }
  speechStore.set(normalized);
}

function isDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    if (w.localStorage?.getItem('tp_dev_mode') === '1') return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.has('dev')) return true;
    const hash = (window.location.hash || '').toLowerCase();
    if (hash === '#dev' || hash === '#dev=1' || hash.includes('dev=1')) return true;
  } catch {
    return false;
  }
  return false;
}

if (typeof window !== 'undefined') {
  const win = window as any;
  const ns = win.__tpSpeech || {};
  ns.store = speechStore;
  if (ns.store && typeof ns.store.getState !== 'function' && typeof ns.store.get === 'function') {
    ns.store.getState = ns.store.get.bind(ns.store);
  }
  ns.getAsrSettings = getAsrSettings;
  ns.setAsrSettings = setAsrSettings;
  win.__tpSpeech = ns;
  if (isDevMode()) {
    win.__tpSpeechStore = speechStore;
  }
}
