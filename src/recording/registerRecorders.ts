import { RecorderBackend, registerRecorders } from './recorderRegistry';

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

function createCoreRecorder(): RecorderBackend {
  return {
    id: 'core',
    label: 'Bridge / local recorder',
    async isAvailable() {
      try {
        const bridge = window?.__tpBridge;
        if (!bridge) return false;
        const probe = typeof bridge.isAvailable === 'function' ? bridge.isAvailable() : bridge.isAvailable;
        return coerceBoolean(probe);
      } catch {
        return false;
      }
    },
    async start() {
      await window?.__tpBridge?.startRecording?.();
    },
    async stop() {
      await window?.__tpBridge?.stopRecording?.();
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
