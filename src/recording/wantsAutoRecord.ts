import type { AppStore } from '../state/app-store';
import { appStore as appStoreSingleton } from '../state/app-store';

function readBool(val: unknown): boolean | undefined {
  return typeof val === 'boolean' ? val : undefined;
}

function readStore(store: AppStore | null | undefined): boolean | undefined {
  if (!store) return undefined;
  try {
    const snap = typeof store.getSnapshot === 'function' ? store.getSnapshot() : null;
    const fromSnap = snap && readBool((snap as any).autoRecord);
    if (typeof fromSnap === 'boolean') return fromSnap;
  } catch {}
  try {
    if (store.state) {
      const fromState = readBool((store.state as any).autoRecord);
      if (typeof fromState === 'boolean') return fromState;
    }
  } catch {}
  try {
    if (typeof store.get === 'function') {
      const fromGet = readBool(store.get('autoRecord'));
      if (typeof fromGet === 'boolean') return fromGet;
    }
  } catch {}
  return undefined;
}

export function wantsAutoRecord(store?: AppStore | null): boolean {
  const s = store ?? appStoreSingleton;
  const val = readStore(s);
  return val === true;
}

// Expose a global helper for legacy JS callers.
try {
  if (typeof window !== 'undefined') {
    (window as any).wantsAutoRecord = wantsAutoRecord;
    (window as any).__tpWantsAutoRecord = wantsAutoRecord;
  }
} catch {}

export default wantsAutoRecord;
