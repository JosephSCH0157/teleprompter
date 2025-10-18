// Recorder adapter stub

export async function init() {
  console.log('[src/adapters/recorder] init');
}

export function createRecorderAdapter() {
  return {
    id: 'recorder',
    label: 'Recorder (stub)',
    async isAvailable() { return false; },
    async start() {},
    async stop() {},
  };
}
