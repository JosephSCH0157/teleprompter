// src/env/logging.ts
// Central logging helpers with a CI/uiMock quiet mode gate.

export function isQuietEnv(): boolean {
  try {
    const env = (window as any).__tpEnv || {};
    return !!(env.ci || env.uiMock);
  } catch {
    return false;
  }
}

export function debugLog(...args: any[]): void {
  if (isQuietEnv()) return;
  try { console.log(...args); } catch {}
}

export function hudLog(event: string, payload?: any): void {
  if (isQuietEnv()) return;
  // keep console logs but kill DOM logs
  try { console.debug(event, payload); } catch {}
}
