// IntersectionObserver-based anchor tracker
// Creates a dense-threshold observer rooted to the provided scroller element.
// Returns { observeAll(paragraphs), mostVisibleEl(), disconnect() }

const IO_THRESHOLDS: number[] = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

type RootGetter = () => Element | null;

export interface AnchorObserver {
  ensure(): void;
  observeAll(nodes: Iterable<Element>): void;
  disconnect(): void;
  mostVisibleEl(): Element | null;
}

export function createAnchorObserver(
  getRoot: RootGetter,
  onUpdate?: (el: Element | null) => void
): AnchorObserver {
  let io: IntersectionObserver | null = null;
  const ratios = new Map<Element, number>();
  let most: Element | null = null;

  function computeMostVisible(): void {
    let bestEl = most;
    let bestR = bestEl ? (ratios.get(bestEl) || 0) : 0;
    for (const [el, r] of ratios) {
      if (r > bestR) {
        bestR = r;
        bestEl = el;
      }
    }
    most = bestEl;
  }

  function ensure(): void {
    if (io) return;

    const root = getRoot();
    if (!root) return;

    try {
      io = new IntersectionObserver(
        (entries: IntersectionObserverEntry[]) => {
          for (const e of entries) {
            const target = e.target as Element;
            ratios.set(target, e.intersectionRatio || 0);
          }
          computeMostVisible();
          try {
            if (onUpdate) onUpdate(most);
          } catch {
            // swallow handler errors
          }
        },
        {
          root,
          threshold: IO_THRESHOLDS
        }
      );
    } catch {
      io = null;
    }
  }

  function observeAll(nodes: Iterable<Element>): void {
    if (!io) ensure();
    if (!io) return;
    for (const n of nodes) {
      io.observe(n);
    }
  }

  function disconnect(): void {
    try {
      io && io.disconnect();
    } catch {
      // ignore
    }
  }

  function mostVisibleEl(): Element | null {
    return most;
  }

  return { ensure, observeAll, disconnect, mostVisibleEl };
}
