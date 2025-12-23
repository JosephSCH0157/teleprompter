// Single-writer DOM scheduler: coalesce writes/reads into one rAF pass.
type Job = () => void;

let writeQueue: Job[] = [];
let readQueue: Job[] = [];
let rafId = 0 as number;

function flush() {
  rafId = 0 as number;

  const writes = writeQueue;
  const reads = readQueue;

  writeQueue = [];
  readQueue = [];

  // Writes first (DOM mutations)
  for (const fn of writes) {
    try { fn(); } catch (e) { try { console.error('[scheduler] write error', e); } catch {} }
  }

  // Then reads (measurements/layout reads)
  for (const fn of reads) {
    try { fn(); } catch (e) { try { console.error('[scheduler] read error', e); } catch {} }
  }
}

function ensureRaf() {
  if (rafId) return;
  rafId = requestAnimationFrame(flush) as unknown as number;
}

export function requestWrite(fn: Job): void {
  writeQueue.push(fn);
  ensureRaf();
}

export function requestRead(fn: Job): void {
  readQueue.push(fn);
  ensureRaf();
}

export function flushNow(): void {
  if (rafId) {
    cancelAnimationFrame(rafId);
    flush();
  }
}

export function hasPendingWrites(): boolean {
  return !!rafId || writeQueue.length > 0;
}

// Optional install hook expected by boot.ts; keep minimal/no-op here.
export function installScrollScheduler(): void {
  try {
    // Legacy/global bridge for scroll writers that don't import TS.
    // Provide an object shape with scrollTo/scrollBy so downstream callers
    // don't have to guard for a bare function.
    const existing = (window as any).__tpScrollWrite;
    if (existing && typeof existing === 'object' && typeof (existing as any).scrollTo === 'function') {
      return;
    }
    (window as any).__tpScrollWrite = {
      scrollTo(y: number) {
        try {
          const sc: any = document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body;
          if (!sc) return;
          requestWrite(() => {
            try { sc.scrollTo ? sc.scrollTo({ top: y, behavior: 'auto' }) : (sc.scrollTop = y); } catch {}
          });
        } catch {}
      },
      scrollBy(dy: number) {
        try {
          const sc: any = document.getElementById('viewer') || document.scrollingElement || document.documentElement || document.body;
          if (!sc) return;
          const next = (sc.scrollTop || 0) + (Number(dy) || 0);
          requestWrite(() => {
            try { sc.scrollTo ? sc.scrollTo({ top: next, behavior: 'auto' }) : (sc.scrollTop = next); } catch {}
          });
        } catch {}
      },
    };
  } catch {}
}

// Keep legacy alias in place for any callers still expecting a function.
try {
  const maybe = (window as any).__tpScrollWrite;
  if (typeof maybe === 'function') {
    (window as any).__tpScrollWrite = {
      scrollTo(y: number) { try { (maybe as any)(y); } catch {} },
      scrollBy(dy: number) {
      try {
        (maybe as any)(((Number(dy) || 0) as number) + 0);
      } catch {}
      },
    };
  }
} catch {}

// Install global request helpers for legacy JS callers
declare global {
  interface Window {
    __tpRequestWrite?: (fn: Job) => void;
    __tpRequestRead?: (fn: Job) => void;
  }
}

// Alias requested by newer wiring code; keep both names until legacy boot stops using the old one.
export const installScheduler = installScrollScheduler;

try {
  if (typeof window !== 'undefined') {
    (window as any).__tpRequestWrite = requestWrite;
    (window as any).__tpRequestRead = requestRead;
  }
} catch {}
