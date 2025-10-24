// rAF-coalesced, single-writer scroll scheduler
// Usage:
//   import { installScheduler, scheduler } from '@scroll/scheduler';
//   installScheduler(); scheduler.write(1234);

declare global {
  interface Window {
    __tpScrollWrite?: (y: number) => void;
    __TP_SCROLLER?: HTMLElement | null;
  }
}

type Scroller = HTMLElement & {
  scrollTo?: (opts: { top: number; behavior?: ScrollBehavior }) => void;
};

let installed = false;
let pending: number | null = null;
let rafId = 0;

function getScroller(): Scroller {
  return (
    (window.__TP_SCROLLER as Scroller | null) ||
    (document.getElementById('viewer') as Scroller | null) ||
    (document.scrollingElement as unknown as Scroller) ||
    (document.documentElement as unknown as Scroller) ||
    (document.body as unknown as Scroller)
  ) as Scroller;
}

function clamp(y: number): number {
  const sc = getScroller();
  const max = Math.max(0, (sc?.scrollHeight ?? 0) - (sc?.clientHeight ?? 0));
  const n = Number.isFinite(y) ? Number(y) : 0;
  return Math.max(0, Math.min(n, max));
}

function flush() {
  const sc = getScroller();
  const t = pending;
  pending = null;
  rafId = 0;
  if (t == null || !sc) return;
  try {
    sc.scrollTo?.({ top: t, behavior: 'auto' });
  } catch {
    // legacy fallback
    (sc as any).scrollTop = t;
  }
}

export const scheduler = {
  /** Set/override the scroll container element (optional). */
  setScroller(el?: HTMLElement | null) {
    window.__TP_SCROLLER = (el ?? null) as HTMLElement | null;
  },
  /** Schedule a scrollTop write (coalesced to 1 rAF). */
  write(y: number) {
    pending = clamp(y);
    if (rafId) return;
    rafId = requestAnimationFrame(flush);
  },
  /** For tests/telemetry. */
  getLastPending(): number | null {
    return pending;
  },
};

export function installScheduler() {
  if (installed) return;
  installed = true;

  // Publish legacy hook for the monolith and any old call sites.
  window.__tpScrollWrite = (y: number) => scheduler.write(y);
}

// --- Lightweight coalescing requestWrite (DOM write queue) ---
// Keep the same API as the old boot scheduler so callers importing
// requestWrite from '../boot/scheduler' can be redirected here.
export type WriteFn = () => void;

let _pending = false;
let _queue: WriteFn[] = [];

export function requestWrite(fn: WriteFn) {
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

export function createScheduler() {
  let rafId: number | null = null;
  let pending: (() => void) | null = null;

  function schedule(task: () => void) {
    pending = task;
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        try {
          const t = pending;
          pending = null;
          rafId = null;
          if (t) t();
        } catch (err) {
          try { console.error('[scheduler] task failed', err); } catch {}
        }
      });
    }
  }

  function cancel() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      pending = null;
    }
  }

  return { schedule, cancel } as const;
}
