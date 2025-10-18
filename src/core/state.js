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
  Object.assign(_state, patch);
  // notify subscribers with a clone
  const snapshot = get();
  for (const s of _subs) {
    try {
      s(snapshot);
    } catch (err) {
      console.warn('[src/core/state] subscriber error', err);
    }
  }
  return snapshot;
}

export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {};
  _subs.add(fn);
  // call immediately with current state
  try { fn(get()); } catch (err) {}
  return () => _subs.delete(fn);
}

export function clear() {
  _subs.clear();
}

// Convenience helpers for nested state
export const scroll = {
  setTarget(y) {
    set({ scroll: { ..._state.scroll, target: Number(y) || 0 } });
  },
  enable() {
    set({ scroll: { ..._state.scroll, enabled: true } });
  },
  disable() {
    set({ scroll: { ..._state.scroll, enabled: false } });
  },
  setMode(m) {
    if (m === 'auto' || m === 'adaptive') set({ scroll: { ..._state.scroll, mode: m } });
  },
};

export default { init, get, set, subscribe, clear, scroll };
