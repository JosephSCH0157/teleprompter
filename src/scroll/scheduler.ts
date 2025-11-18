// src/boot/scheduler.ts
// Single-writer DOM scheduler: coalesce writes/reads into one rAF pass.

type Job = () => void;

let writeQueue: Job[] = [];
let readQueue: Job[] = [];
let rafId = 0;

function flush() {
  rafId = 0;

  const writes = writeQueue;
  const reads = readQueue;

  writeQueue = [];
  readQueue = [];

  // Writes first (DOM mutations)
  for (const fn of writes) {
    try {
      fn();
    } catch (e) {
      console.error('[scheduler] write error', e);
    }
  }

  // Then reads (measurements/layout reads)
  for (const fn of reads) {
    try {
      fn();
    } catch (e) {
      console.error('[scheduler] read error', e);
    }
  }
}

function ensureRaf() {
  if (rafId) return;
  rafId = requestAnimationFrame(flush);
}

export function requestWrite(fn: Job): void {
  writeQueue.push(fn);
  ensureRaf();
}

export function requestRead(fn: Job): void {
  readQueue.push(fn);
  ensureRaf();
}

// Handy for tests/dev HUD if you ever need it
export function flushNow(): void {
  if (rafId) {
    cancelAnimationFrame(rafId);
    flush();
  }
}

// Install on window for legacy/global callers (e.g. scroll-control.js)
declare global {
  interface Window {
    __tpRequestWrite?: (fn: Job) => void;
    __tpRequestRead?: (fn: Job) => void;
  }
}

if (typeof window !== 'undefined') {
  window.__tpRequestWrite = requestWrite;
  window.__tpRequestRead = requestRead;
}
