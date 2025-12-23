import type { AppStore } from '../state/app-store';
import { registerObsAdapter, unregisterObsAdapter } from '../media/recorders-bridge-compat';

function resolveStore(store?: AppStore): AppStore | null {
  if (store) return store;
  try {
    return (window as any).__tpStore || null;
  } catch {
    return null;
  }
}

export function initObsBridge(store?: AppStore): void {
  const S = resolveStore(store);
  if (!S) return;

  const read = (): boolean => {
    try {
      const snap = typeof S.getSnapshot === 'function' ? S.getSnapshot() : S.state;
      if (snap && typeof snap.obsEnabled === 'boolean') return snap.obsEnabled;
      const val = S.get?.('obsEnabled');
      if (typeof val === 'boolean') return val;
    } catch {}
    return false;
  };

  const apply = () => {
    const on = !!read();
    if (on) {
      registerObsAdapter();
    } else {
      unregisterObsAdapter();
    }
  };

  try { S.subscribe?.('obsEnabled', apply); } catch {}
  apply();
}
