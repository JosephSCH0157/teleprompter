// Lightweight coalescing write scheduler (JS runtime wrapper for the TS source)
let _pending = false;
let _queue = [];
export function requestWrite(fn) {
  if (typeof fn !== 'function') return;
  _queue.push(fn);
  if (_pending) return;
  _pending = true;
  requestAnimationFrame(() => {
    const q = _queue.slice(0);
    _queue.length = 0;
    _pending = false;
    for (const f of q) {
      try {
        f();
      } catch {}
    }
  });
}

export function hasPendingWrites() {
  return _pending || _queue.length > 0;
}
