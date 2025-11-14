// src/obs.ts
// Legacy OBS stub (TS): safe no-op module to satisfy legacy obs.js includes.

declare global {
  interface Window { __tpObsLegacy?: string }
}

// Warn if loaded outside CI/dev
try {
  const params = typeof location !== 'undefined' ? location.search : '';
  const inCi = params.includes('ci=1') || (typeof navigator !== 'undefined' && (navigator as any).webdriver);
  if (!inCi) {
    try { console.warn('[stub] obs legacy stub loaded outside CI/dev'); } catch {}
  }
} catch {}

// Tiny safe surface
export async function connect() { return { ok: false, reason: 'stub' as const }; }
export function configure(_: any) { /* no-op */ }
export async function test() { return true; }

// Mark legacy presence
try { (window as any).__tpObsLegacy = 'stub'; } catch {}

export { };

