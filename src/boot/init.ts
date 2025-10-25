let _ready = false;
const _waiters: Array<() => void> = [];

export function markReady() {
  _ready = true;
  while (_waiters.length) {
    try { const w = _waiters.shift(); if (w) w(); } catch {}
  }
}

export function whenReady(cb: () => void) {
  if (_ready) cb(); else _waiters.push(cb);
}

// Attach minimal globals for backward compatibility (keep non-strict Function type to match existing codebase)
declare global { interface Window { _initCore?: Function | undefined; } }
window._initCore = window._initCore || function (cb: () => void) { whenReady(cb); } as any;

export { };

