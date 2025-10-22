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
