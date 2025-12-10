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

function ensureRecorderSurface() {
  // local-auto is now statically imported from index.ts and bridges to window.__tpRecording/__tpLocalRecorder.
  // Just resolve the surface synchronously from the available globals.
  try {
    const api = (window as any).__tpLocalRecorder || (window as any).__tpRecording || (window as any).__recorder;
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
        const recorder = await ensureRecorderSurface();
        try { console.debug('[core-recorder] isAvailable', { ok: !!recorder, keys: recorder ? Object.keys(recorder) : [] }); } catch {}
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
      try { console.debug('[core-recorder] start requested via registry', { hasStart: typeof recorder.start === 'function' }); } catch {}
      await recorder.start?.();
    },
    async stop() {
      const recorder = await ensureRecorderSurface();
      if (!recorder) return;
      try { console.debug('[core-recorder] stop requested via registry', { hasStop: typeof recorder.stop === 'function' }); } catch {}
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
