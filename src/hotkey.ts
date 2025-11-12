// src/hotkey.ts
// Legacy hotkey stub (TS): no-op module to satisfy legacy hotkey.js includes.

declare global {
  interface Window { __tpHotkeyLegacy?: string }
}

try {
  (window as any).__tpHotkeyLegacy = 'stub';
  if ((window as any).__TP_DEV) {
    try { console.debug('[hotkey.ts] legacy hotkey stub active'); } catch {}
  }
} catch {}

export { };

