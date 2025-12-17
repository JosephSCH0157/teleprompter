import type { AsrProfile, AsrProfileId, AsrState } from './schema';
import { getAppStore } from '../state/appStore';

const KEY = 'tp_asr_profiles_v1';
const store = getAppStore();
const stateFromStore = (() => {
  if (!store) return null;
  try {
    const profiles = (store.get('asrProfiles') as Record<AsrProfileId, AsrProfile> | undefined) || {};
    const activeProfileId = (store.get('asrActiveProfileId') as string | undefined) || undefined;
    return { profiles, activeProfileId };
  } catch {
    return null;
  }
})();

let state: AsrState = (() => {
  try {
    if (stateFromStore) {
      return {
        profiles: stateFromStore.profiles || {},
        activeProfileId: stateFromStore.activeProfileId,
      };
    }
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<AsrState> : {};
    return { profiles: {}, ...parsed } as AsrState;
  } catch {
    return { profiles: {} } as AsrState;
  }
})();

const subs = new Set<(_s: AsrState) => void>();
let storeSyncSuppressed = false;

function syncAppStore() {
  if (!store) return;
  storeSyncSuppressed = true;
  try { store.set('asrProfiles', state.profiles); } catch {}
  try { store.set('asrActiveProfileId', state.activeProfileId ?? null); } catch {}
  storeSyncSuppressed = false;
}

function save(opts?: { fromStore?: boolean }) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  subs.forEach(fn => { try { fn(state); } catch {} });
  if (!opts?.fromStore) {
    syncAppStore();
  }
  try { window.dispatchEvent(new CustomEvent('tp:asrChanged', { detail: state })); } catch {}
}

export const getAsrState = (): AsrState => state;

export function upsertProfile(p: AsrProfile) {
  state.profiles[p.id] = { ...p, updatedAt: Date.now() };
  if (!state.activeProfileId) state.activeProfileId = p.id;
  save();
}

export function setActiveProfile(id: AsrProfileId) {
  state.activeProfileId = id;
  save();
}

export function onAsr(fn: (_s: AsrState) => void) {
  subs.add(fn);
  return () => subs.delete(fn);
}

if (store) {
  try {
    store.subscribe('asrProfiles', (next) => {
      if (storeSyncSuppressed) return;
      const profilesObj = next && typeof next === 'object' ? (next as Record<AsrProfileId, AsrProfile>) : {};
      state.profiles = { ...profilesObj };
      save({ fromStore: true });
    });
    store.subscribe('asrActiveProfileId', (next) => {
      if (storeSyncSuppressed) return;
      state.activeProfileId = typeof next === 'string' && next ? (next as AsrProfileId) : undefined;
      save({ fromStore: true });
    });
  } catch {
    // best-effort only
  }
  syncAppStore();
}

// storage-sync so Display picks up changes:
try {
  window.addEventListener('storage', (e: StorageEvent) => {
    try {
      if (e.key === KEY && e.newValue) {
        const next = JSON.parse(e.newValue) as AsrState;
        state = {
          ...next,
          profiles: next?.profiles || {},
        } as AsrState;
        save({ fromStore: true });
      }
    } catch {}
  });
} catch {}
