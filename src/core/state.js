// Minimal core state module (extracted stub)
// Keep this intentionally small: real logic will be migrated incrementally.

export async function init() {
  console.log('[src/core/state] init');
  // return a promise so callers can await readiness
  return Promise.resolve();
}

export function getState() {
  return { /* placeholder state */ };
}
