export type RecorderId = 'core' | 'obs' | string;

export interface RecorderBackend {
  id: RecorderId;
  label: string;
  isAvailable(): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

const registry = new Map<RecorderId, RecorderBackend>();
let sessionRecording = false;

function emitRecordingState(recording: boolean): void {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('tp:recording:state', { detail: { recording: !!recording } }),
      );
    }
  } catch {
    // best-effort only
  }
}

export function registerRecorder(backend: RecorderBackend): void {
  if (!backend) return;
  registry.set(backend.id, backend);
}

export function getRecorder(id: RecorderId): RecorderBackend | undefined {
  return registry.get(id);
}

export function listRecorders(): RecorderBackend[] {
  return [...registry.values()];
}

export function registerRecorders(options: {
  core: RecorderBackend;
  obs?: RecorderBackend;
}): void {
  if (options?.core) registerRecorder(options.core);
  if (options?.obs) registerRecorder(options.obs);
}

export async function startSessionRecording(opts: { obsEnabled: boolean }): Promise<void> {
  if (sessionRecording) return;

  const tasks: Promise<unknown>[] = [];

  const core = registry.get('core');
  if (core) {
    try {
      console.debug('[recording-session] startRecorders: core available, obsEnabled=', !!opts?.obsEnabled);
    } catch {}
    tasks.push(
      core
        .isAvailable()
        .then((ok) => (ok ? core.start() : undefined))
        .catch((err) => {
          console.warn('[recording] core start failed', err);
        }),
    );
  } else {
    console.warn('[recording] no "core" recorder registered');
  }

  if (opts?.obsEnabled) {
    const obs = registry.get('obs');
    if (obs) {
      try {
        console.debug('[recording-session] startRecorders: obs available');
      } catch {}
      tasks.push(
        obs
          .isAvailable()
          .then((ok) => (ok ? obs.start() : undefined))
          .catch((err) => {
            console.warn('[recording] obs start failed', err);
          }),
      );
    }
  }

  if (tasks.length === 0) return;
  try {
    console.debug('[recording-session] startRecorders', { count: tasks.length, enabled: true });
  } catch {}
  await Promise.all(tasks);
  sessionRecording = true;
  emitRecordingState(true);
}

export async function stopSessionRecording(): Promise<void> {
  if (!sessionRecording) return;

  const tasks = listRecorders().map((rec) =>
    rec
      .isAvailable()
      .then((ok) => (ok ? rec.stop() : undefined))
      .catch((err) => {
        console.warn('[recording] stop failed', rec.id, err);
      }),
  );

  await Promise.all(tasks);
  sessionRecording = false;
  emitRecordingState(false);
}

export function isSessionRecording(): boolean {
  return sessionRecording;
}
