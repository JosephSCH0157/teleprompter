import { requestWrite } from '../boot/scheduler';

export interface ViewportMetrics {
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
  pxPerLine: number;
  pxPerWord: number;
  height?: number; // alias for viewportHeight
}

const defaultViewer = () =>
  (document.getElementById('viewer') as HTMLElement | null) ||
  (document.querySelector('[data-role=\"viewer\"]') as HTMLElement | null);

const SCROLL_CALLER_HINTS: Array<[string, string]> = [
  ['asr-scroll-driver', 'ASR'],
  ['hybrid-wpm-motor', 'Hybrid'],
  ['auto-motor', 'Auto'],
  ['scroll-router', 'Router'],
  ['autoscroll', 'Auto'],
];

type ScrollWriteLogPayload = {
  caller: string;
  target: number;
  current: number;
  accepted: boolean;
  reason: string;
};

function shouldLogScrollWrite(): boolean {
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

function detectScrollCaller(): string {
  try {
    const trace = (new Error().stack || '').toLowerCase();
    for (const [hint, tag] of SCROLL_CALLER_HINTS) {
      if (trace.includes(hint)) return tag;
    }
  } catch {
    // ignore
  }
  return 'unknown';
}

function logScrollWrite(payload: ScrollWriteLogPayload): void {
  try { console.info('[SCROLL_WRITE]', payload); } catch {}
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

export function computeAnchorLineIndex(scroller = defaultViewer()): number | null {
  if (!scroller) return null;
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

const clampGuard = (target: number, max: number): boolean => {
  try {
    const guard = (window as any).__tpClampGuard;
    if (typeof guard === 'function') return !!guard(target, max);
  } catch {}
  return true;
};

export function clampActive(): boolean {
  try { return (window as any).__tpClampActive === true; } catch { return false; }
}

export function setClampActive(on: boolean): void {
  try { (window as any).__tpClampActive = !!on; } catch {}
}

function clampScrollTop(sc: HTMLElement, y: number): { target: number; guardDenied: boolean; max: number } {
  const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
  const t = Math.max(0, Math.min(Number(y) || 0, max));
  const allowed = clampGuard(t, max);
  return { target: allowed ? t : (sc.scrollTop || 0), guardDenied: !allowed, max };
}

function mirrorToDisplay(sc: HTMLElement): void {
  try {
    const send = (window as any).sendToDisplay;
    if (typeof send !== 'function') return;
    const max = Math.max(0, (sc.scrollHeight || 0) - (sc.clientHeight || 0));
    const top = sc.scrollTop || 0;
    const ratio = max > 0 ? top / max : 0;
    const cursorLine = computeAnchorLineIndex(sc);
    send({
      type: 'scroll',
      top,
      ratio,
      anchorRatio: ratio,
      cursorLine: cursorLine ?? undefined,
    });
  } catch {
    // ignore display mirror errors
  }
}

export function scrollByPx(dy: number, getScroller = defaultViewer): void {
  const logEnabled = shouldLogScrollWrite();
  const caller = logEnabled ? detectScrollCaller() : 'unknown';
  if (clampActive()) {
    if (logEnabled) {
      logScrollWrite({ caller, target: Number(dy) || 0, current: 0, accepted: false, reason: 'clamp-active' });
    }
    return;
  }
  const sc = getScroller();
  if (!sc) {
    if (logEnabled) {
      logScrollWrite({ caller, target: Number(dy) || 0, current: 0, accepted: false, reason: 'no-scroller' });
    }
    return;
  }
  const current = sc.scrollTop || 0;
  const { target, guardDenied } = clampScrollTop(sc, current + (Number(dy) || 0));
  if (guardDenied) {
    if (logEnabled) {
      logScrollWrite({ caller, target, current, accepted: false, reason: 'clamp-guard' });
    }
    return;
  }
  if (logEnabled) {
    logScrollWrite({ caller, target, current, accepted: true, reason: 'scrollByPx' });
  }
  requestWrite(() => {
    try { sc.scrollTop = target; } catch {}
    mirrorToDisplay(sc);
    try {
      const win = window as any;
      const debug = win?.__tpScrollDebug === true || /scrollDebug=1/i.test(String(location.search || ''));
      if (debug) {
        const mode =
          (win.__tpScrollMode && typeof win.__tpScrollMode.getMode === 'function')
            ? win.__tpScrollMode.getMode()
            : undefined;
        const maxScrollTop = Math.max(0, (sc.scrollHeight || 0) - (sc.clientHeight || 0));
        win.HUD?.log?.('scroll-commit', {
          mode,
          delta: dy,
          targetTop: target,
          currentTop: sc.scrollTop,
          maxScrollTop,
        });
      }
      try {
        window.dispatchEvent(new CustomEvent('tp:scroll:commit', {
          detail: {
            delta: dy,
            targetTop: target,
            currentTop: sc.scrollTop,
            maxScrollTop: Math.max(0, (sc.scrollHeight || 0) - (sc.clientHeight || 0)),
          },
        }));
      } catch {
        // ignore
      }
    } catch {
      // ignore HUD/log errors
    }
  });
}

export function scrollByLines(n: number, getScroller = defaultViewer): void {
  if (clampActive()) return;
  const sc = getScroller();
  if (!sc) return;
  const metrics = getViewportMetrics(getScroller);
  const dy = (Number(n) || 0) * metrics.pxPerLine;
  scrollByPx(dy, getScroller);
}

export function centerLine(lineIndex: number, getScroller = defaultViewer): void {
  if (clampActive()) return;
  const sc = getScroller();
  if (!sc || !Number.isFinite(lineIndex)) return;
  const idx = Math.max(0, Math.floor(lineIndex));
  const line =
    sc.querySelector<HTMLElement>(`.line[data-i=\"${idx}\"]`) ||
    sc.querySelector<HTMLElement>(`.line[data-index=\"${idx}\"]`) ||
    sc.querySelector<HTMLElement>(`.line[data-line=\"${idx}\"]`) ||
    sc.querySelector<HTMLElement>(`.line[data-line-idx=\"${idx}\"]`) ||
    (document.getElementById(`tp-line-${idx}`) as HTMLElement | null);
  if (!line) return;
  const offset = Math.max(0, (sc.clientHeight - line.offsetHeight) / 2);
  const logEnabled = shouldLogScrollWrite();
  const caller = logEnabled ? detectScrollCaller() : 'unknown';
  const { target, guardDenied } = clampScrollTop(sc, (line.offsetTop || 0) - offset);
  if (guardDenied) {
    if (logEnabled) {
      logScrollWrite({ caller, target, current: sc.scrollTop || 0, accepted: false, reason: 'clamp-guard' });
    }
    return;
  }
  if (logEnabled) {
    logScrollWrite({ caller, target, current: sc.scrollTop || 0, accepted: true, reason: 'centerLine' });
  }
  requestWrite(() => {
    try { sc.scrollTop = target; } catch {}
  });
}

export function getViewportMetrics(getScroller = defaultViewer): ViewportMetrics {
  const sc = getScroller();
  const root = document.documentElement;
  const cs = root ? getComputedStyle(root) : null;
  const fontSize = cs ? parseFloat(cs.getPropertyValue('--tp-font-size')) || 56 : 56;
  const lineHeight = cs ? parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4 : 1.4;
  const pxPerLine = fontSize * lineHeight;
  const pxPerWord = pxPerLine / 6; // coarse default; refined later by typography integration
  if (!sc) {
    return {
      scrollTop: 0,
      viewportHeight: 0,
      scrollHeight: 0,
      pxPerLine,
      pxPerWord,
    };
  }
  return {
    scrollTop: sc.scrollTop || 0,
    viewportHeight: sc.clientHeight || 0,
    height: sc.clientHeight || 0,
    scrollHeight: sc.scrollHeight || 0,
    pxPerLine,
    pxPerWord,
  };
}

// Back-compat helper for legacy TS wiring; returns the same helpers but uses the provided getter.
export type ScrollerGetter = () => HTMLElement | null;
export function createScrollerHelpers(getScroller: ScrollerGetter) {
  return {
    getScroller,
    clampScrollTop: (y: number) => {
      const sc = getScroller();
      if (!sc) return 0;
      return clampScrollTop(sc, y);
    },
    scrollByPx: (px: number) => scrollByPx(px, () => getScroller()),
    scrollByLines: (n: number) => scrollByLines(n, () => getScroller()),
    centerLine: (i: number) => centerLine(i, () => getScroller()),
  requestScroll: (top: number) => {
    const logEnabled = shouldLogScrollWrite();
    const caller = logEnabled ? detectScrollCaller() : 'unknown';
    if (clampActive()) {
      if (logEnabled) {
        logScrollWrite({ caller, target: top, current: 0, accepted: false, reason: 'clamp-active' });
      }
      return;
    }
    const sc = getScroller();
    if (!sc) {
      if (logEnabled) {
        logScrollWrite({ caller, target: top, current: 0, accepted: false, reason: 'no-scroller' });
      }
      return;
    }
    const current = sc.scrollTop || 0;
    const { target, guardDenied } = clampScrollTop(sc, top);
    if (guardDenied) {
      if (logEnabled) {
        logScrollWrite({ caller, target, current, accepted: false, reason: 'clamp-guard' });
      }
      return;
    }
    if (logEnabled) {
      logScrollWrite({ caller, target, current, accepted: true, reason: 'requestScroll' });
    }
    requestWrite(() => {
      try { sc.scrollTop = target; } catch {}
      mirrorToDisplay(sc);
    });
  },
  };
}
