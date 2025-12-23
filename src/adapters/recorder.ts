export async function init(): Promise<void> {
  console.log('[src/adapters/recorder] init');
}

interface RecorderStatus {
  running: boolean;
}

interface RecorderAdapter {
  id: string;
  label: string;
  isAvailable(): Promise<boolean>;
  start(): Promise<{ ok: boolean; already?: boolean }>;
  stop(): Promise<{ ok: boolean; already?: boolean }>;
  status(): Promise<RecorderStatus>;
}

// A minimal in-memory recorder stub that exposes start/stop/status promises.
export function createRecorderAdapter(): RecorderAdapter {
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
