// src/hotkey.ts
// Legacy hotkey stub (TS): safe no-op module to satisfy legacy hotkey.js includes.

declare global {
  interface Window { __tpHotkeyLegacy?: string }
}

// Warn if loaded outside CI/dev
try {
  const params = typeof location !== 'undefined' ? location.search : '';
  const inCi = params.includes('ci=1') || (typeof navigator !== 'undefined' && (navigator as any).webdriver);
  if (!inCi) {
    try { console.warn('[stub] hotkey legacy stub loaded outside CI/dev'); } catch {}
  }
} catch {}

// Tiny safe surface
export function enable() { /* no-op */ }
export function disable() { /* no-op */ }
export function register(_: any) { /* no-op */ }
export function unregister(_: any) { /* no-op */ }

// Mark legacy presence
try { (window as any).__tpHotkeyLegacy = 'stub'; } catch {}

export { };

