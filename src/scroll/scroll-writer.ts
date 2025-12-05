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

export function getScrollWriter(): ScrollWriter {
  if (cached) return cached;

  const maybe = (window as any).__tpScrollWrite;
  if (maybe && typeof maybe === 'object') {
    const w = maybe as { scrollTo?: (_top: number, _opts?: any) => void; scrollBy?: (_delta: number, _opts?: any) => void; ensureVisible?: (_top: number, _pad?: number) => void };
    if (typeof w.scrollTo === 'function' && typeof w.scrollBy === 'function') {
      cached = {
        scrollTo(top: number, opts?: { behavior?: ScrollBehavior }) {
          try { w.scrollTo(top, opts); } catch {}
        },
        scrollBy(delta: number, opts?: { behavior?: ScrollBehavior }) {
          try { w.scrollBy(delta, opts); } catch {}
        },
        ensureVisible(top: number, paddingPx = 80) {
          try {
            if (typeof w.ensureVisible === 'function') {
              w.ensureVisible(top, paddingPx);
            } else {
              w.scrollTo(Math.max(0, top - paddingPx), { behavior: 'auto' });
            }
          } catch {}
        },
      };
      return cached;
    }
  }

  if (!warned) {
    try { console.warn('[scroll-writer] __tpScrollWrite missing or incomplete; scroll commands are no-ops.'); } catch {}
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
