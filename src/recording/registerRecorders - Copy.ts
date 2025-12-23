import type { RecorderBackend } from './recorderRegistry';
import { registerRecorders } from './recorderRegistry';

declare const window: any;

async function coerceBoolean(value: unknown): Promise<boolean> {
  if (value instanceof Promise) {
    try {
      return !!(await value);
    } catch {
      return false;
    }
  }
  return !!value;
}

function resolveLegacyRecorder() {
  try {
    const api = window?.__tpRecording || window?.__recorder;
    if (!api) return null;
    if (typeof api.start !== 'function' || typeof api.stop !== 'function') return null;
    return api;
  } catch {
    return null;
  }
}

async function ensureRecorderSurface() {
  let rec = resolveLegacyRecorder();
  if (rec) return rec;
  try {
    // Load the TS core recorder shim (local-auto) which bridges itself to window.__tpRecording.
    await import('../recording/local-auto');
    rec = resolveLegacyRecorder();
  } catch {
    // ignore
  }
  return rec;
}

function createCoreRecorder(): RecorderBackend {
  return {
    id: 'core',
    label: 'Bridge / local recorder',
    async isAvailable() {
      try {
        const recorder = await ensureRecorderSurface();
        try { console.debug('[core-recorder] isAvailable', !!recorder); } catch {}
        if (!recorder) return false;
        if (typeof recorder.isAvailable === 'function') {
          return coerceBoolean(recorder.isAvailable());
        }
        return true; // start/stop exist; assume available
      } catch {
        return false;
      }
    },
    async start() {
      const recorder = await ensureRecorderSurface();
      if (!recorder) {
        try { console.warn('[core-recorder] start aborted: recorder surface unavailable'); } catch {}
        throw new Error('core recorder unavailable');
      }
      try { console.debug('[core-recorder] start requested via registry'); } catch {}
      await recorder.start?.();
    },
    async stop() {
      const recorder = await ensureRecorderSurface();
      if (!recorder) return;
      try { console.debug('[core-recorder] stop requested via registry'); } catch {}
      await recorder.stop?.();
    },
  };
}

function createObsRecorder(): RecorderBackend {
  return {
    id: 'obs',
    label: 'OBS WebSocket',
    async isAvailable() {
      try {
        const obs = window?.__tpObs;
        if (!obs) return false;
        const probe = typeof obs.isConnected === 'function' ? obs.isConnected() : obs.isConnected;
        return coerceBoolean(probe);
      } catch {
        return false;
      }
    },
    async start() {
      await window?.__tpObs?.startRecording?.();
    },
    async stop() {
      await window?.__tpObs?.stopRecording?.();
    },
  };
}

export function initRecorderBackends(): void {
  if (typeof window === 'undefined') return;

  try {
    const core = createCoreRecorder();
    let obs: RecorderBackend | undefined;

    try {
      if (window.__tpObs) {
        obs = createObsRecorder();
      }
    } catch {
      obs = undefined;
    }

    registerRecorders({ core, obs });
  } catch (err) {
    console.warn('[recording] failed to initialize recorder backends', err);
  }
}
