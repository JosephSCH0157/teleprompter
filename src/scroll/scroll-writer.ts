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

function findLegacyScroller(): HTMLElement | Window {
  try {
    const viewer =
      document.getElementById('scriptScrollContainer') ||
      document.getElementById('viewer');
    if (viewer) return viewer;
  } catch {
    // ignore
  }
  return window;
}

function currentTop(scroller: any): number {
  try {
    if (scroller === window) {
      return window.scrollY || window.pageYOffset || 0;
    }
    return scroller?.scrollTop || 0;
  } catch {
    return 0;
  }
}

export function getScrollWriter(): ScrollWriter {
  if (cached) return cached;

  // Preferred: wrap an injected writer (from the TS scroll brain / adapter).
  try {
    const maybe = (window as any).__tpScrollWrite;
    // If the writer is already an object with scrollTo/scrollBy, wrap it.
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

    // Legacy adapter shape: a bare function(top:number).
    if (typeof maybe === 'function') {
      const scroller = findLegacyScroller();
      cached = {
        scrollTo(top: number) {
          try { (maybe as (_top: number) => void)(top); } catch {}
        },
        scrollBy(delta: number) {
          const cur = currentTop(scroller);
          try { (maybe as (_top: number) => void)(cur + (Number(delta) || 0)); } catch {}
        },
        ensureVisible(top: number, paddingPx = 80) {
          try {
            const cur = currentTop(scroller);
            const h = (scroller as any)?.clientHeight || window.innerHeight || 0;
            const pad = Math.max(0, paddingPx | 0);
            const min = cur + pad;
            const max = cur + h - pad;
            if (top < min) (maybe as (_top: number) => void)(Math.max(0, top - pad));
            else if (top > max) (maybe as (_top: number) => void)(Math.max(0, top - h + pad));
          } catch {}
        },
      };
      return cached;
    }
  } catch {
    // fall through to legacy
  }

  // Legacy DOM-based implementation (safe fallback during migration).
  const legacy: ScrollWriter = {
    scrollTo(top: number, opts?: { behavior?: ScrollBehavior }) {
      const target = Math.max(0, top | 0);
      const scroller = findLegacyScroller() as any;
      try {
        if (scroller.scrollTo) {
          scroller.scrollTo({ top: target, behavior: opts?.behavior ?? 'auto' });
        } else {
          scroller.scrollTop = target;
        }
      } catch {
        try { (window as any).scrollTo?.(0, target); } catch {}
      }
    },
    scrollBy(delta: number, opts?: { behavior?: ScrollBehavior }) {
      const d = Number(delta) || 0;
      const scroller = findLegacyScroller() as any;
      try {
        if (scroller.scrollBy) {
          scroller.scrollBy({ top: d, behavior: opts?.behavior ?? 'auto' });
        } else {
          scroller.scrollTop = (scroller.scrollTop || 0) + d;
        }
      } catch {
        try { (window as any).scrollBy?.(0, d); } catch {}
      }
    },
    ensureVisible(top: number, paddingPx = 80) {
      const scroller = findLegacyScroller() as any;
      try {
        const cur = currentTop(scroller);
        const h = scroller.clientHeight || window.innerHeight || 0;
        const targetTop = top | 0;
        const pad = Math.max(0, paddingPx | 0);
        const min = cur + pad;
        const max = cur + h - pad;
        if (targetTop < min) {
          this.scrollTo(Math.max(0, targetTop - pad));
        } else if (targetTop > max) {
          this.scrollTo(Math.max(0, targetTop - h + pad));
        }
      } catch {
        // ignore
      }
    },
  };

  cached = legacy;
  return legacy;
}
