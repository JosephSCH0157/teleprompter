import { wantsAutoRecord } from '../recording/wantsAutoRecord';

declare global {
  interface Window {
    __tpRecording?: {
      wantsAuto?: () => unknown;
      setAuto?: (on: boolean) => unknown;
      setWantsAuto?: (on: boolean) => unknown;
    };
    __tpStore?: {
      get?: (key: string) => unknown;
      set?: (key: string, value: unknown) => unknown;
      state?: Record<string, unknown>;
    };
    getAutoRecordEnabled?: () => boolean;
    setAutoRecordEnabled?: (on: boolean) => boolean;
  }
}

function getStoreBoolean(): boolean | undefined {
  try {
    const store = typeof window !== 'undefined' ? window.__tpStore : null;
    if (!store) return undefined;
    if (store.state && typeof store.state.autoRecord === 'boolean') {
      return !!store.state.autoRecord;
    }
    if (typeof store.get === 'function') {
      const val = store.get('autoRecord');
      if (typeof val === 'boolean') return val;
    }
  } catch {}
  return undefined;
}

export function getAutoRecordEnabled(): boolean {
  // Prefer store/SSOT value
  const storeVal = getStoreBoolean();
  if (typeof storeVal === 'boolean') return storeVal;

  // Fallback to shared helper (covers snapshot/state/get)
  try {
    const wants = wantsAutoRecord();
    if (typeof wants === 'boolean') return wants;
  } catch {}

  // Optional: ask TS core as a fallback
  try {
    const core = typeof window !== 'undefined' ? window.__tpRecording : null;
    if (core && typeof core.wantsAuto === 'function') {
      return !!core.wantsAuto();
    }
  } catch {}

  return false;
}

export function setAutoRecordEnabled(on: boolean): boolean {
  const enabled = !!on;

  // Inform TS core if it exposes a setter
  try {
    const core = typeof window !== 'undefined' ? window.__tpRecording : null;
    if (core) {
      if (typeof core.setAuto === 'function') core.setAuto(enabled);
      else if (typeof core.setWantsAuto === 'function') core.setWantsAuto(enabled);
    }
  } catch {}

  // Keep store in sync if available
  try {
    const store = typeof window !== 'undefined' ? window.__tpStore : null;
    if (store && typeof store.set === 'function') {
      store.set('autoRecord', enabled);
    } else if (store && store.state) {
      store.state.autoRecord = enabled;
    }
  } catch {}

  return enabled;
}

try { if (typeof window !== 'undefined') window.getAutoRecordEnabled = getAutoRecordEnabled; } catch {}
try { if (typeof window !== 'undefined') window.setAutoRecordEnabled = setAutoRecordEnabled; } catch {}

export { };
