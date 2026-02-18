let displayScrollChannel: BroadcastChannel | null = null;
let scrollEventTrackerInstalled = false;

export type ScrollerRole = 'main' | 'display';

function shouldLogScrollWrite(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__tpScrollDebug === true) return true;
    if (w.__tpScrollWriteDebug === true) return true;
    const qs = new URLSearchParams(window.location.search || '');
    if (qs.has('scrollDebug') || qs.has('scrollWriteDebug')) return true;
  } catch {
    // ignore
  }
  return false;
}

function readLineIndex(el: Element | null): number | null {
  if (!el) return null;
  const line = (el as HTMLElement).closest ? (el as HTMLElement).closest('.line') as HTMLElement | null : null;
  if (!line) return null;
  const raw =
    line.dataset.i ||
    line.dataset.index ||
    line.dataset.lineIdx ||
    line.dataset.line ||
    line.getAttribute('data-line') ||
    line.getAttribute('data-line-idx');
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  const id = line.id || '';
  const m = /^tp-line-(\d+)$/.exec(id);
  if (m) return Math.max(0, Number(m[1]));
  return null;
}

function computeAnchorLineIndex(scroller: HTMLElement | null): number | null {
  if (!scroller) return null;
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  const rect = scroller.getBoundingClientRect();
  if (!rect.height || !rect.width) return null;
  const markerPct = typeof (window as any).__TP_MARKER_PCT === 'number'
    ? (window as any).__TP_MARKER_PCT
    : 0.4;
  const markerY = rect.top + rect.height * markerPct;
  const markerX = rect.left + rect.width * 0.5;
  const hit = document.elementFromPoint(markerX, markerY);
  const hitIdx = readLineIndex(hit);
  if (hitIdx != null) return hitIdx;
  const lines = Array.from(scroller.querySelectorAll<HTMLElement>('.line'));
  if (!lines.length) return null;
  let bestIdx: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const el = lines[i];
    const r = el.getBoundingClientRect();
    const y = r.top + r.height * 0.5;
    const d = Math.abs(y - markerY);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = readLineIndex(el) ?? i;
    }
  }
  return bestIdx != null ? Math.max(0, Math.floor(bestIdx)) : null;
}

function isElementLike(node: unknown): node is HTMLElement {
  return !!node && typeof node === 'object' && (node as any).nodeType === 1;
}

export function getDisplayViewerElement(): HTMLElement | null {
  if (typeof window === 'undefined') return null;
  try {
    const w = window as any;
    const direct = w.__tpDisplayViewerEl;
    if (isElementLike(direct)) return direct as HTMLElement;
    const opener = w.opener as any;
    const viaOpener = opener && !opener.closed ? opener.__tpDisplayViewerEl : null;
    if (isElementLike(viaOpener)) return viaOpener as HTMLElement;
  } catch {
    // ignore
  }
  return null;
}

export function getScrollerEl(role: ScrollerRole = 'main'): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (role === 'display') {
    return (
      getDisplayViewerElement() ||
      (document.getElementById('wrap') as HTMLElement | null)
    );
  }
  try {
    return (
      (document.querySelector('main#viewer.viewer, #viewer') as HTMLElement | null) ||
      (document.getElementById('viewer') as HTMLElement | null)
    );
  } catch {
    return document.getElementById('viewer') as HTMLElement | null;
  }
}

export function getScrollContainer(): HTMLElement | null {
  return getScrollerEl('main');
}

export function getViewerElement(): HTMLElement | null {
  try {
    return (
      getScrollerEl('main') ||
      (document.querySelector('[data-role="viewer"]') as HTMLElement | null) ||
      (document.getElementById('wrap') as HTMLElement | null) ||
      getDisplayViewerElement()
    );
  } catch {
    return getDisplayViewerElement();
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
      getScrollerEl('main') ||
      getScrollerEl('display') ||
      getScriptRoot() ||
      (document.getElementById('wrap') as HTMLElement | null)
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
  return getScrollerEl('main') || getScrollerEl('display');
}

export function resolveViewerRole(): ScrollerRole {
  if (typeof window === 'undefined') return 'main';
  try {
    const explicit = String((window as any).__TP_VIEWER_ROLE || '').toLowerCase();
    if (explicit === 'display') return 'display';
    if (explicit === 'main') return 'main';
    const bodyRole = String(window.document?.body?.dataset?.viewerRole || '').toLowerCase();
    if (bodyRole === 'display') return 'display';
    if (bodyRole === 'main') return 'main';
    if ((window as any).__TP_FORCE_DISPLAY) return 'display';
    const path = String(window.location?.pathname || '').toLowerCase();
    if (path.includes('display')) return 'display';
  } catch {
    // ignore
  }
  return 'main';
}

export function getRuntimeScroller(role: ScrollerRole = resolveViewerRole()): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const root = getScriptRoot();
  if (role === 'display') {
    const primary = getScrollerEl('display');
    const fallback = (document.getElementById('wrap') as HTMLElement | null) || root;
    return resolveActiveScroller(primary, fallback);
  }
  const primary = getScrollerEl('main') || root;
  const fallback = root || getScrollerEl('display');
  return resolveActiveScroller(primary, fallback);
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
  opts: { scroller?: HTMLElement | null; reason?: string; source?: string } = {},
): number {
  const scroller =
    opts.scroller ||
    resolveActiveScroller(getPrimaryScroller(), getScriptRoot() || getFallbackScroller());
  if (!scroller) return 0;
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const target = Math.max(0, Math.min(Number(topPx) || 0, max));
  const before = scroller.scrollTop || 0;
  try {
    scroller.scrollTop = target;
  } catch {
    // ignore
  }
  const after = scroller.scrollTop || target;
  const writerSource = opts.source ?? opts.reason ?? 'programmatic';
  try {
    scroller.dataset.tpLastWriter = writerSource;
  } catch {}
  if (shouldLogScrollWrite()) {
    try {
      console.info('[SCROLL_WRITE_DETAIL]', {
        source: writerSource,
        reason: opts.reason,
        target: Math.round(target),
        before: Math.round(before),
        after: Math.round(after),
        scroller: describeElement(scroller),
      });
    } catch {}
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

export function getScrollEl(): HTMLElement | null {
  return resolveActiveScroller(getPrimaryScroller(), getScriptRoot() || getFallbackScroller());
}

export function writeScrollTop(
  topPx: number,
  opts: { scroller?: HTMLElement | null; reason?: string } = {},
): number {
  return applyCanonicalScrollTop(topPx, { scroller: opts.scroller, reason: opts.reason ?? 'writeScrollTop' });
}

if (typeof window !== 'undefined') {
  try {
    const w = window as any;

    if (!isDisplayWindow()) {
      w.__tpScrollWrite = {
        scrollTo(top: number) {
          applyCanonicalScrollTop(top, { reason: 'writer:scrollTo', source: 'scroll-writer' });
        },
        scrollBy(delta: number) {
          const sc =
            resolveActiveScroller(getPrimaryScroller(), getScriptRoot() || getFallbackScroller());
          const cur = sc ? (sc.scrollTop || 0) : 0;
          applyCanonicalScrollTop(cur + (Number(delta) || 0), { reason: 'writer:scrollBy', source: 'scroll-writer' });
        },
      };
    }
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  try {
    if (!scrollEventTrackerInstalled) {
      const handler = (event: Event) => {
        if (!shouldLogScrollWrite()) return;
        const target = event.target as HTMLElement | null;
        if (!target) return;
        try {
          console.info('[SCROLL_EVENT]', {
            scrollTop: Math.round(target.scrollTop || 0),
            tpLastWriter: target.dataset.tpLastWriter ?? null,
            isTrusted: event.isTrusted,
            scroller: describeElement(target),
          });
        } catch {}
      };
      window.addEventListener('scroll', handler, { capture: true, passive: true });
      scrollEventTrackerInstalled = true;
    }
  } catch {}
}
