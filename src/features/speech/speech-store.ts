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

type MatchLike = {
  bestIdx?: number;
  bestSim?: number;
  idx?: number;
  sim?: number;
  topScores?: unknown[];
  candidates?: unknown[];
  noMatch?: boolean;
  [key: string]: unknown;
};

function normalizeMatchOneResult(input: unknown): MatchLike {
  const fallback: MatchLike = {
    bestIdx: -1,
    bestSim: 0,
    idx: -1,
    sim: 0,
    topScores: [],
    noMatch: true,
  };
  if (!input || typeof input !== 'object') return fallback;

  const raw = input as MatchLike;
  const bestIdxRaw = raw.bestIdx ?? raw.idx;
  const bestSimRaw = raw.bestSim ?? raw.sim;
  const bestIdx = Number.isFinite(Number(bestIdxRaw)) ? Math.floor(Number(bestIdxRaw)) : -1;
  const bestSim = Number.isFinite(Number(bestSimRaw)) ? Number(bestSimRaw) : 0;
  const topScores = Array.isArray(raw.topScores)
    ? raw.topScores
    : (Array.isArray(raw.candidates) ? raw.candidates : []);
  const idx = Number.isFinite(Number(raw.idx)) ? Math.floor(Number(raw.idx)) : bestIdx;
  const sim = Number.isFinite(Number(raw.sim)) ? Number(raw.sim) : bestSim;

  return {
    ...raw,
    bestIdx,
    bestSim,
    idx,
    sim,
    topScores,
    noMatch: typeof raw.noMatch === 'boolean' ? raw.noMatch : bestIdx < 0,
  };
}

function installMatchOneCompat(ns: any): void {
  if (!ns || typeof ns !== 'object') return;
  if (typeof ns.matchOne === 'function') return;
  if (typeof ns.matchBatch !== 'function') return;

  ns.matchOne = (text: unknown, arg1?: unknown, arg2?: unknown): MatchLike => {
    const source =
      typeof text === 'string'
        ? text
        : (text == null ? '' : String((text as any).text ?? text));
    const isFinal = typeof arg1 === 'boolean'
      ? arg1
      : (typeof (arg1 as any)?.isFinal === 'boolean' ? Boolean((arg1 as any).isFinal) : false);
    const opts = typeof arg1 === 'boolean' ? arg2 : arg1;

    try {
      const result = ns.matchBatch(String(source || ''), isFinal, opts);
      return normalizeMatchOneResult(result);
    } catch {
      // Legacy fallback in case a batch-style signature is still active.
      try {
        const legacyResult = ns.matchBatch([String(source || '')], opts);
        return normalizeMatchOneResult(legacyResult);
      } catch {
        return normalizeMatchOneResult(null);
      }
    }
  };

  if (isDevMode()) {
    try { console.info('[speech-store] installed __tpSpeech.matchOne compatibility shim'); } catch {}
  }
}

if (typeof window !== 'undefined') {
  const win = window as any;
  const ns = win.__tpSpeech || {};
  ns.store = speechStore;
  if (ns.store && typeof ns.store.getState !== 'function' && typeof ns.store.get === 'function') {
    ns.store.getState = ns.store.get.bind(ns.store);
  }
  installMatchOneCompat(ns);
  ns.getAsrSettings = getAsrSettings;
  ns.setAsrSettings = setAsrSettings;
  win.__tpSpeech = ns;
  if (isDevMode()) {
    win.__tpSpeechStore = speechStore;
  }
}
