const DRAWER_KEY = 'tp_dev_drawer_open';
const ZEN_KEY = 'tp_dev_zen';

function readFlag(key: string, defaultValue = false): boolean {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = window.localStorage?.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    // ignore storage errors
  }
  return defaultValue;
}

function writeFlag(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(key, value ? '1' : '0');
  } catch {
    // ignore storage errors
  }
}

export function getDevDrawerOpen(): boolean {
  return readFlag(DRAWER_KEY, false);
}

export function setDevDrawerOpen(value: boolean): void {
  writeFlag(DRAWER_KEY, value);
}

export function getDevZen(): boolean {
  return readFlag(ZEN_KEY, false);
}

export function setDevZen(value: boolean): void {
  writeFlag(ZEN_KEY, value);
}
