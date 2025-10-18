// OBS adapter stub for src/adapters

export async function init() {
  console.log('[src/adapters/obs] init');
  // Initialize any module-level state if needed.
}

export function createOBSAdapter() {
  return {
    id: 'obs',
    label: 'OBS (stub)',
    async isAvailable() { return false; },
    async start() {},
    async stop() {},
  };
}
