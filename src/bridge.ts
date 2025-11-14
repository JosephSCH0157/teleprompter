// src/bridge.ts
// Legacy bridge stub (TS): provides a no-op module to satisfy legacy includes.
// This will be bundled or emitted as a JS stub if referenced directly.

declare global {
  interface Window {
    __tpLegacyBridge?: string;
  }
}

try {
  // Mark presence for diagnostics; harmless in production
  (window as any).__tpLegacyBridge = 'stub';
  if ((window as any).__TP_DEV) {
    try { console.debug('[bridge.ts] legacy bridge stub active'); } catch {}
  }
} catch {}

export { }; // ensure this is a module

