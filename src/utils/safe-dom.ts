// src/utils/safe-dom.ts
//
// Minimal safe DOM helpers to reduce try/catch repetition in main code.
// Exposes a small, well-documented API and a window.safeDOM bridge
// for any remaining legacy callers.

export interface SafeDOM {
  get<T extends HTMLElement = HTMLElement>(id: string): T | null;
  q<T extends Element = Element>(sel: string): T | null;
  on(
    el: EventTarget | null | undefined,
    ev: string,
    fn: EventListenerOrEventListenerObject,
    opts?: boolean | AddEventListenerOptions,
  ): boolean;
  off(
    el: EventTarget | null | undefined,
    ev: string,
    fn: EventListenerOrEventListenerObject,
    opts?: boolean | EventListenerOptions,
  ): boolean;
}

function get<T extends HTMLElement = HTMLElement>(id: string): T | null {
  try {
    return (document.getElementById(id) as T | null) || null;
  } catch {
    try { console.debug('safeDOM.get failed', id); } catch { /* ignore */ }
    return null;
  }
}

function q<T extends Element = Element>(sel: string): T | null {
  try {
    return (document.querySelector(sel) as T | null) || null;
  } catch {
    try { console.debug('safeDOM.q failed', sel); } catch { /* ignore */ }
    return null;
  }
}

function on(
  el: EventTarget | null | undefined,
  ev: string,
  fn: EventListenerOrEventListenerObject,
  opts?: boolean | AddEventListenerOptions,
): boolean {
  try {
    if (!el) return false;
    el.addEventListener(ev, fn, opts ?? false);
    return true;
  } catch {
    try { console.debug('safeDOM.on failed', el, ev); } catch { /* ignore */ }
    return false;
  }
}

function off(
  el: EventTarget | null | undefined,
  ev: string,
  fn: EventListenerOrEventListenerObject,
  opts?: boolean | EventListenerOptions,
): boolean {
  try {
    if (!el) return false;
    el.removeEventListener(ev, fn, opts ?? false);
    return true;
  } catch {
    try { console.debug('safeDOM.off failed', el, ev); } catch { /* ignore */ }
    return false;
  }
}

export const safeDOM: SafeDOM = { get, q, on, off };

// --- Global bridge for any legacy callers ---------------------------------

declare global {
  interface Window {
    safeDOM?: SafeDOM;
  }
}

try {
  if (typeof window !== 'undefined') {
    if (!window.safeDOM) {
      window.safeDOM = safeDOM;
    }
  }
} catch {
  // ignore
}
