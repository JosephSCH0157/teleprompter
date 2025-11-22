// Central core state module
// Small, well-tested store exported as an ES module.
// API:
//   init(initialState?) -> Promise<void>
//   get(path?) -> value
//   set(pathOrObj, value?) -> void
//   subscribe(pathOrCallback, callback?) -> unsubscribe()

type CoreState = {
  appVersion: string | null;
  ci: string | null;
  obs: { status: string; url: string | null };
  recorder: { status: string };
  scroll: { target: number; enabled: boolean; mode: string };
  [key: string]: unknown;
};

const DEFAULT: CoreState = {
  appVersion: null,
  ci: null,
  obs: { status: 'disconnected', url: null },
  recorder: { status: 'idle' },
  scroll: { target: 0, enabled: false, mode: 'auto' },
};

let _state: CoreState = { ...DEFAULT };
const _subs = new Set<(state: CoreState, changed: unknown) => void>();

function deepClone<T>(v: T): T {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
}

function pathGet(obj: unknown, path?: string | string[]): unknown {
  if (!path) return obj;
  const parts = typeof path === 'string' ? path.split('.') : path;
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function pathSet(obj: Record<string, any>, path: string | string[], value: unknown): void {
  const parts = typeof path === 'string' ? path.split('.') : path;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

export async function init(initial?: Partial<CoreState>): Promise<void> {
  if (initial && typeof initial === 'object') {
    _state = { ..._state, ...initial };
  }
  return Promise.resolve();
}

export function get(path?: string | string[]): unknown {
  return deepClone(pathGet(_state, path));
}

export function set(pathOrObj: string | Record<string, unknown>, value?: unknown): void {
  if (typeof pathOrObj === 'string') {
    pathSet(_state, pathOrObj, value);
  } else if (pathOrObj && typeof pathOrObj === 'object') {
    _state = { ..._state, ...pathOrObj };
  }
  const snapshot = deepClone(_state);
  for (const s of Array.from(_subs)) {
    try {
      s(snapshot, pathOrObj);
    } catch (err) {
      console.warn('[state] subscriber error', err);
    }
  }
}

export function subscribe(
  pathOrCallback: string | ((state: CoreState, changed: unknown) => void),
  cb?: (value: unknown, changed: unknown) => void,
): () => boolean {
  let path: string | null = null;
  let fn: ((v: unknown, changed: unknown) => void) | null = null;
  if (typeof pathOrCallback === 'function') {
    fn = pathOrCallback as (v: unknown, changed: unknown) => void;
  } else {
    path = pathOrCallback;
    fn = cb || null;
  }
  if (typeof fn !== 'function') throw new Error('subscribe requires a callback');

  const wrapper = (state: CoreState, changed: unknown) => {
    if (!path) return fn!(state, changed);
    const v = pathGet(state, path);
    return fn!(v, changed);
  };
  _subs.add(wrapper);
  try {
    wrapper(deepClone(_state), null);
  } catch (err) {
    console.warn('[state] subscriber init error', err);
  }
  return () => _subs.delete(wrapper);
}

export function getState(): CoreState {
  return deepClone(_state);
}

export const scroll = {
  setTarget(y: number) {
    set('scroll.target', Number(y) || 0);
  },
  enable() {
    set('scroll.enabled', true);
  },
  disable() {
    set('scroll.enabled', false);
  },
  setMode(m: string) {
    if (m === 'auto' || m === 'adaptive') set('scroll.mode', m);
  },
};

export default { init, get, set, subscribe, getState, scroll };
