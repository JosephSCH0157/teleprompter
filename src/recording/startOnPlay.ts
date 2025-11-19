import type { AppStore } from '../state/appStore';
import { isSessionRecording, startSessionRecording, stopSessionRecording } from './recorderRegistry';

function readStoreBoolean(store: AppStore | null | undefined, key: 'autoRecord' | 'obsEnabled'): boolean {
  try {
    if (!store) return false;
    if (typeof store.getSnapshot === 'function') {
      const snap = store.getSnapshot();
      if (snap && typeof snap[key] === 'boolean') return !!snap[key];
    }
    if (store.state && typeof store.state[key] === 'boolean') {
      return !!store.state[key];
    }
    if (typeof store.get === 'function') {
      const val = store.get(key);
      if (typeof val === 'boolean') return val;
    }
  } catch {}
  return false;
}

function resolveStore(initial?: AppStore | null): AppStore | null {
  if (initial) return initial;
  if (typeof window === 'undefined') return null;
  try {
    return (window as any).__tpStore || null;
  } catch {
    return null;
  }
}

export function createStartOnPlay(store?: AppStore | null) {
  async function onSessionStart(): Promise<void> {
    const activeStore = resolveStore(store);
    const autoRecord = readStoreBoolean(activeStore, 'autoRecord');
    const obsEnabled = readStoreBoolean(activeStore, 'obsEnabled');

    if (!autoRecord) {
      console.info('[Anvil][Recording] autoRecord=false → not starting recording');
      return;
    }

    await startSessionRecording({ obsEnabled });
  }

  async function onSessionStop(): Promise<void> {
    if (!isSessionRecording()) return;
    await stopSessionRecording();
  }

  return { onSessionStart, onSessionStop } as const;
}

export type StartOnPlay = ReturnType<typeof createStartOnPlay>;
