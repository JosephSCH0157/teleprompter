// Minimal, single-writer scroll scheduler (rAF-coalesced)
declare global {
  interface Window {
    __tpScrollWrite?: (_y: number) => void;
    __lastScrollTarget?: number | null;
    __TP_SCROLLER?: HTMLElement;
    __tpTinySchedulerInstalled?: boolean;
  }
}

export function installScrollScheduler() {
  if ((window as any).__tpTinySchedulerInstalled) return;
  (window as any).__tpTinySchedulerInstalled = true;

  let pending: number | null = null;
  let rafId = 0;

  const getScroller = () =>
    (window as any).__TP_SCROLLER ||
    document.getElementById('viewer') ||
    (document.scrollingElement as any) ||
    (document.documentElement as any) ||
    (document.body as any);

  const clamp = (y: number) => {
    const sc: any = getScroller();
    if (!sc) return 0;
    const max = Math.max(0, (sc.scrollHeight || 0) - (sc.clientHeight || 0));
    return Math.max(0, Math.min(Number(y) || 0, max));
  };

  function requestScrollTop(y: number) {
    const sc: any = getScroller();
    if (!sc) return;

    pending = clamp(y);
    try { (window as any).__lastScrollTarget = pending; } catch {}

    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      const t = pending;
      pending = null;
      rafId = 0;
      try { sc.scrollTo && sc.scrollTo({ top: t, behavior: 'auto' }); }
      catch { try { sc.scrollTop = t as any; } catch {} }
      try { (window as any).__lastScrollTarget = null; } catch {}
    });
  }

  (window as any).__tpScrollWrite = requestScrollTop;

  // Optional: wrap direct scrollTop writes into the scheduler
  try {
    const sc: any = getScroller();
    if (sc && !sc.__tpWriteWrapped) {
      sc.__tpWriteWrapped = true;
      try {
        const proto = Object.getPrototypeOf(sc);
        const desc = Object.getOwnPropertyDescriptor(proto, 'scrollTop');
        const origSet = desc && desc.set;
        if (origSet) {
          Object.defineProperty(sc, 'scrollTop', {
            configurable: true,
            set(v: number) { requestScrollTop(v); },
          });
        }
      } catch {}
    }
  } catch {}
}

export default installScrollScheduler;
// Lightweight coalescing write scheduler
// Ensures callers schedule DOM write work through a single rAF writer.
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
// Small rAF coalescing scheduler intended as a drop-in replacement for
// the legacy single-writer scroll scheduler. Keep it minimal and deterministic
// so the legacy call sites can be ported incrementally.

export type Task = () => void;

export function createScheduler() {
  let rafId: number | null = null;
  let pending: Task | null = null;

  function schedule(task: Task) {
    pending = task;
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        try {
          const t = pending;
          pending = null;
          rafId = null;
          if (t) t();
        } catch (err) {
          // swallow to avoid bubbling into legacy global handlers
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
