// Recorder adapter stub

export async function init() {
  console.log('[src/adapters/recorder] init');
}

// A minimal in-memory recorder stub that exposes start/stop/status promises.
export function createRecorderAdapter() {
  let _running = false;
  return {
    id: 'recorder',
    label: 'Recorder (stub)',
    async isAvailable() {
      return true;
    },
    async start() {
      if (_running) return Promise.resolve({ ok: true, already: true });
      _running = true;
      // simulate async startup
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true };
    },
    async stop() {
      if (!_running) return Promise.resolve({ ok: true, already: false });
      _running = false;
      await new Promise((r) => setTimeout(r, 10));
      return { ok: true };
    },
    async status() {
      return { running: !!_running };
    },
  };
}
