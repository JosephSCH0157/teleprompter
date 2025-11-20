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

function createCoreRecorder(): RecorderBackend {
  return {
    id: 'core',
    label: 'Bridge / local recorder',
    async isAvailable() {
      try {
        const recorder = resolveLegacyRecorder();
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
      const recorder = resolveLegacyRecorder();
      if (!recorder) throw new Error('core recorder unavailable');
      await recorder.start?.();
    },
    async stop() {
      const recorder = resolveLegacyRecorder();
      if (!recorder) return;
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
