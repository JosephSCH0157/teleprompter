const STORAGE_KEY = 'tp_auto_enabled_v1';

export function readStoredAutoEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistStoredAutoEnabled(enabled: boolean): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage?.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore storage failures
  }
}
