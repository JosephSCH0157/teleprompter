// Minimal core state module (extracted stub)
// Keep this intentionally small: real logic will be migrated incrementally.


// Central application state store + tiny pub/sub
// Exposes: init(), get(), set(patch), subscribe(fn) -> unsubscribe()

const _state = {
  appVersion: null,
  obs: { connected: false, url: null },
  recorder: { running: false },
  scroll: { target: 0, mode: 'auto', enabled: false },
};

const _subs = new Set();

export async function init(initial = {}) {
  Object.assign(_state, initial);
  console.log('[src/core/state] init', _state);
  return Promise.resolve(_state);
}

export function get() {
  // return a shallow clone to avoid accidental mutation
  return JSON.parse(JSON.stringify(_state));
}

export function set(patch) {
  if (!patch || typeof patch !== 'object') return get();
  // Central state store + tiny pub/sub for the teleprompter app
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
    // Central state store + tiny pub/sub for the teleprompter app
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
      // No async work currently, but keep API extensible
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
      // notify subscribers with a shallow copy of state and path info
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
      // subscribe(fn) or subscribe('a.b', fn)
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
      return () => _subs.delete(wrapper);
    }

    export function getState() {
      return deepClone(_state);
    }

    // Central state store + tiny pub/sub for the teleprompter app
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
      // No async work currently, but keep API extensible
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
      // notify subscribers with a shallow copy of state and path info
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
      // subscribe(fn) or subscribe('a.b', fn)
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
      return () => _subs.delete(wrapper);
    }

    export function getState() {
      return deepClone(_state);
    }

    // Central state store + tiny pub/sub for the teleprompter app
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
      // No async work currently, but keep API extensible
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
      // notify subscribers with a shallow copy of state and path info
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
      // subscribe(fn) or subscribe('a.b', fn)
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
      return () => _subs.delete(wrapper);
    }

    export function getState() {
      return deepClone(_state);
    }

    // Convenience scroll helpers that mutate state via the set(...) API
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
