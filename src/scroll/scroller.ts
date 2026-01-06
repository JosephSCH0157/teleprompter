import { computeAnchorLineIndex } from './scroll-helpers';

let displayScrollChannel: BroadcastChannel | null = null;

export function getScrollContainer(): HTMLElement | null {
  try {
    return document.getElementById('scriptScrollContainer') as HTMLElement | null;
  } catch {
    return null;
  }
}

export function getViewerElement(): HTMLElement | null {
  try {
    return (
      (document.getElementById('viewer') as HTMLElement | null) ||
      (document.querySelector('[data-role="viewer"]') as HTMLElement | null)
    );
  } catch {
    return null;
  }
}

export function getScriptRoot(): HTMLElement | null {
  try {
    return document.getElementById('script') as HTMLElement | null;
  } catch {
    return null;
  }
}

export function getFallbackScroller(): HTMLElement | null {
  try {
    return (
      (document.scrollingElement as HTMLElement | null) ||
      (document.documentElement as HTMLElement | null) ||
      (document.body as HTMLElement | null)
    );
  } catch {
    return null;
  }
}

export function isWindowScroller(sc: HTMLElement | null): boolean {
  return !!sc && (sc === document.scrollingElement || sc === document.documentElement || sc === document.body);
}

export function isScrollable(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.scrollHeight - el.clientHeight > 2) return true;
  try {
    const st = getComputedStyle(el);
    return /(auto|scroll)/.test(st.overflowY || '');
  } catch {
    return false;
  }
}

export function resolveActiveScroller(primary: HTMLElement | null, fallback: HTMLElement | null): HTMLElement | null {
  if (isScrollable(primary)) return primary;
  if (isScrollable(fallback)) return fallback;
  return primary || fallback;
}

export function describeElement(el: HTMLElement | null): string {
  if (!el) return 'none';
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls}` || el.tagName.toLowerCase();
}

export function getPrimaryScroller(): HTMLElement | null {
  return getScrollContainer() || getViewerElement();
}

function isDisplayWindow(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('display') === '1') return true;
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('display')) return true;
    if ((window as any).__TP_FORCE_DISPLAY) return true;
  } catch {
    // ignore
  }
  return false;
}

function isDevScrollSync(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__tpScrollDebug || w.__tpScrollSyncDebug) return true;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    if (w.localStorage?.getItem('tp_dev_mode') === '1') return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.has('scrollDebug') || params.has('dev') || params.has('debug')) return true;
  } catch {
    // ignore
  }
  return false;
}

export function applyCanonicalScrollTop(
  topPx: number,
  opts: { scroller?: HTMLElement | null; reason?: string } = {},
): number {
  const scroller =
    opts.scroller ||
    resolveActiveScroller(getPrimaryScroller(), getScriptRoot() || getFallbackScroller());
  if (!scroller) return 0;
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const target = Math.max(0, Math.min(Number(topPx) || 0, max));
  try {
    scroller.scrollTop = target;
  } catch {
    // ignore
  }
  try {
    let actualTop = target;
    try {
      actualTop = scroller.scrollTop || target;
    } catch {
      // ignore
    }
    const ratio = max > 0 ? actualTop / max : 0;
    const cursorLine = computeAnchorLineIndex(scroller);

    const payload = {
      type: 'scroll',
      top: actualTop,
      ratio,
      anchorRatio: ratio,
      cursorLine: cursorLine ?? undefined,
    };

    const send =
      (window as any).sendToDisplay ||
      (window as any).__tpSendToDisplay ||
      (window as any).__tpDisplay?.sendToDisplay;
    if (typeof send === 'function') {
      send(payload);
    } else {
      const displayWin = (window as any).__tpDisplayWindow as Window | null | undefined;
      if (displayWin && !displayWin.closed && typeof displayWin.postMessage === 'function') {
        displayWin.postMessage(payload, '*');
      } else if (typeof BroadcastChannel !== 'undefined') {
        if (!displayScrollChannel) {
          try { displayScrollChannel = new BroadcastChannel('tp_display'); } catch {}
        }
        try { displayScrollChannel?.postMessage(payload); } catch {}
      }
    }
  } catch {
    // ignore display sync failures
  }
  if (isDevScrollSync()) {
    try {
      console.debug('[SCROLL_SYNC]', {
        top: Math.round(target),
        scroller: describeElement(scroller),
        reason: opts.reason,
      });
    } catch {
      // ignore
    }
  }
  return target;
}

if (typeof window !== 'undefined') {
  try {
    const w = window as any;

    if (!isDisplayWindow()) {
      w.__tpScrollWrite = {
        scrollTo(top: number) {
          applyCanonicalScrollTop(top, { reason: 'writer:scrollTo' });
        },
        scrollBy(delta: number) {
          const sc =
            resolveActiveScroller(getPrimaryScroller(), getScriptRoot() || getFallbackScroller());
          const cur = sc ? (sc.scrollTop || 0) : 0;
          applyCanonicalScrollTop(cur + (Number(delta) || 0), { reason: 'writer:scrollBy' });
        },
      };
    }
  } catch {
    // ignore
  }
}
