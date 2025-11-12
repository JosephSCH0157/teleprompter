// src/obs.ts
// Legacy OBS stub (TS): no-op module to satisfy legacy obs.js includes.

declare global {
  interface Window { __tpObsLegacy?: string }
}

try {
  (window as any).__tpObsLegacy = 'stub';
  if ((window as any).__TP_DEV) {
    try { console.debug('[obs.ts] legacy obs stub active'); } catch {}
  }
} catch {}

export { };

