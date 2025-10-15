// utils/safe-dom.js
// utils/safe-dom.js (ES module)
// Minimal safe DOM helpers to reduce try/catch repetition in main code.
// Exposes a small, well-documented API on `window.safeDOM` for legacy code to use.
function get(id) {
  try {
    return document.getElementById(id) || null;
  } catch (e) {
    console.debug('safeDOM.get failed', id, e);
    return null;
  }
}
function q(sel) {
  try {
    return document.querySelector(sel) || null;
  } catch (e) {
    console.debug('safeDOM.q failed', sel, e);
    return null;
  }
}
function on(el, ev, fn, opts) {
  try {
    if (!el) return false;
    el.addEventListener(ev, fn, opts || false);
    return true;
  } catch (e) {
    console.debug('safeDOM.on failed', el, ev, e);
    return false;
  }
}
function off(el, ev, fn, opts) {
  try {
    if (!el) return false;
    el.removeEventListener(ev, fn, opts || false);
    return true;
  } catch (e) {
    console.debug('safeDOM.off failed', el, ev, e);
    return false;
  }
}
export const safeDOM = { get, q, on, off };

// Backwards-compat: attach to window for existing non-module consumers
try {
  if (typeof window !== 'undefined') window.safeDOM = safeDOM;
} catch (e) {
  /* ignore */
}
