// Central core state module
// Small, well-tested store exported as an ES module.
// API:
//   init(initialState?) -> Promise<void>
//   get(path?) -> value
//   set(pathOrObj, value?) -> void
//   subscribe(pathOrCallback, callback?) -> unsubscribe()

const DEFAULT = {
  appVersion: null,
  ci: null,
  obs: { status: 'disconnected', url: null },
  recorder: { status: 'idle' },
  scroll: { target: 0, enabled: false, mode: 'auto' },
};

let _state = { ...DEFAULT };
const _subs = new Set();

function deepClone(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
}

function pathGet(obj, path) {
  if (!path) return obj;
  const parts = typeof path === 'string' ? path.split('.') : path;
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function pathSet(obj, path, value) {
  const parts = typeof path === 'string' ? path.split('.') : path;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

export async function init(initial) {
  if (initial && typeof initial === 'object') {
    _state = { ..._state, ...initial };
  }
  return Promise.resolve();
}

export function get(path) {
  return deepClone(pathGet(_state, path));
}

export function set(pathOrObj, value) {
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

export function subscribe(pathOrCallback, cb) {
  let path = null;
  let fn = null;
  if (typeof pathOrCallback === 'function') {
    fn = pathOrCallback;
  } else {
    path = pathOrCallback;
    fn = cb;
  }
  if (typeof fn !== 'function') throw new Error('subscribe requires a callback');

  const wrapper = (state, changed) => {
    if (!path) return fn(state, changed);
    const v = pathGet(state, path);
    return fn(v, changed);
  };
  _subs.add(wrapper);
  try { wrapper(deepClone(_state), null); } catch (err) { console.warn('[state] subscriber init error', err); }
  return () => _subs.delete(wrapper);
}

export function getState() {
  return deepClone(_state);
}

export const scroll = {
  setTarget(y) {
    set('scroll.target', Number(y) || 0);
  },
  enable() {
    set('scroll.enabled', true);
  },
  disable() {
    set('scroll.enabled', false);
  },
  setMode(m) {
    if (m === 'auto' || m === 'adaptive') set('scroll.mode', m);
  },
};

export default { init, get, set, subscribe, getState, scroll };
