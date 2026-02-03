// Central scroll writer shim.
// All code that moves the main script viewport should route through this helper.

export interface ScrollWriter {
  /** Absolute scroll in CSS px from top of script viewport. */
  scrollTo(top: number, opts?: { behavior?: ScrollBehavior }): void;
  /** Relative scroll in CSS px. Positive -> move text up (scroll down). */
  scrollBy(delta: number, opts?: { behavior?: ScrollBehavior }): void;
  /** Ensure a given y is visible (best-effort). */
  ensureVisible?(top: number, paddingPx?: number): void;
}

let cached: ScrollWriter | null = null;
let warned = false;

function withScrollWriteActive<T>(fn: () => T): T | undefined {
  try {
    (window as any).__tpScrollWriteActive = true;
  } catch {}
  try {
    return fn();
  } finally {
    try {
      (window as any).__tpScrollWriteActive = false;
    } catch {}
  }
}

export function getScrollWriter(): ScrollWriter {
  if (cached) return cached;

  if (typeof window !== 'undefined') {
    const maybe = (window as any).__tpScrollWrite;
    if (typeof maybe === 'function') {
      const fn = maybe as (_top: number) => void;
      const getScroller = () =>
        (document.getElementById('scriptScrollContainer') as HTMLElement | null) ||
        (document.getElementById('viewer') as HTMLElement | null) ||
        (document.scrollingElement as HTMLElement | null) ||
        (document.documentElement as HTMLElement | null) ||
        (document.body as HTMLElement | null);
      cached = {
        scrollTo(top: number) {
          try { withScrollWriteActive(() => fn(top)); } catch {}
        },
        scrollBy(delta: number) {
          try {
            const sc = getScroller();
            const cur = sc ? (sc.scrollTop || 0) : 0;
            withScrollWriteActive(() => fn(cur + (Number(delta) || 0)));
          } catch {}
        },
        ensureVisible(_top: number, _paddingPx?: number) {
          // not supported for bare function writers
        },
      };
      return cached;
    }
    if (maybe && typeof maybe === 'object') {
      const w = maybe as { scrollTo?: (_top: number, _opts?: any) => void; scrollBy?: (_delta: number, _opts?: any) => void; ensureVisible?: (_top: number, _pad?: number) => void };
      if (typeof w.scrollTo === 'function' && typeof w.scrollBy === 'function') {
        const writerImpl = w as { scrollTo: (_top: number, _opts?: any) => void; scrollBy: (_delta: number, _opts?: any) => void; ensureVisible?: (_top: number, _pad?: number) => void };
        cached = {
          scrollTo(top: number, opts?: { behavior?: ScrollBehavior }) {
            try { withScrollWriteActive(() => writerImpl.scrollTo(top, opts)); } catch {}
          },
          scrollBy(delta: number, opts?: { behavior?: ScrollBehavior }) {
            try { withScrollWriteActive(() => writerImpl.scrollBy(delta, opts)); } catch {}
          },
          ensureVisible(top: number, paddingPx = 80) {
            try {
              if (typeof writerImpl.ensureVisible === 'function') {
                withScrollWriteActive(() => writerImpl.ensureVisible!(top, paddingPx));
              } else {
                withScrollWriteActive(() => writerImpl.scrollTo(Math.max(0, top - paddingPx), { behavior: 'auto' }));
              }
            } catch {}
          },
        };
        return cached;
      }
    }
  }

  if (!warned) {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      try { console.warn('[scroll-writer] __tpScrollWrite missing or incomplete; scroll commands are no-ops.'); } catch {}
    }
    warned = true;
  }

  // No-op writer when SSOT writer is absent; avoids DOM fallbacks.
  cached = {
    scrollTo() { /* no-op: writer missing */ },
    scrollBy() { /* no-op: writer missing */ },
    ensureVisible() { /* no-op: writer missing */ },
  };
  return cached;
}
