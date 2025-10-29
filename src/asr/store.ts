import { AsrProfile, AsrProfileId, AsrState } from './schema';

const KEY = 'tp_asr_profiles_v1';

let state: AsrState = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<AsrState> : {};
    return { profiles: {}, ...parsed } as AsrState;
  } catch {
    return { profiles: {} } as AsrState;
  }
})();

const subs = new Set<(s: AsrState) => void>();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  subs.forEach(fn => { try { fn(state); } catch {} });
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

export function onAsr(fn: (s: AsrState) => void) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// storage-sync so Display picks up changes:
try {
  window.addEventListener('storage', (e: StorageEvent) => {
    try {
      if (e.key === KEY && e.newValue) {
        const next = JSON.parse(e.newValue) as AsrState;
        state = { ...next, profiles: next?.profiles || {} } as AsrState;
        subs.forEach(fn => { try { fn(state); } catch {} });
      }
    } catch {}
  });
} catch {}
