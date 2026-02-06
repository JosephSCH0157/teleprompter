// Central scroll writer shim.
// All code that moves the main script viewport should route through this helper.

import { getAsrBlockElements } from './asr-block-store';
import { getDisplayViewerElement, getViewerElement } from './scroller';

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
let activeSeekAnim: { cancel: () => void } | null = null;

function shouldTraceWrites(): boolean {
  try {
    const w = window as any;
    if (w.__TP_DEV || w.__TP_DEV1) return true;
    const qs = new URLSearchParams(String(location.search || ''));
    if (qs.get('dev') === '1' || qs.has('dev')) return true;
    if (w.localStorage?.getItem('tp_dev_mode') === '1') return true;
  } catch {}
  return false;
}

function withWriteEnabled<T>(reason: string, delta: number, fn: () => T): T {
  const w = window as any;
  const prev = w.__tpScrollWriteActive;
  w.__tpScrollWriteActive = true;
  if (shouldTraceWrites()) {
    try { console.trace('[scroll-write]', reason, delta); } catch {}
  }
  try { return fn(); }
  finally { w.__tpScrollWriteActive = prev; }
}

function isWindowScroller(scroller: HTMLElement): boolean {
  return (
    scroller === document.scrollingElement ||
    scroller === document.documentElement ||
    scroller === document.body
  );
}

function findScroller(el: HTMLElement): HTMLElement {
  let node = el?.parentElement as HTMLElement | null;
  while (node) {
    try {
      const st = getComputedStyle(node);
      if (/(auto|scroll)/.test(st.overflowY || '')) return node;
    } catch {
      // ignore
    }
    node = node.parentElement as HTMLElement | null;
  }
  return (
    (document.scrollingElement as HTMLElement | null) ||
    (document.documentElement as HTMLElement | null) ||
    (document.body as HTMLElement | null) ||
    el
  );
}

function elementTopRelativeTo(el: HTMLElement, scroller: HTMLElement): number {
  try {
    const isWin =
      scroller === document.scrollingElement ||
      scroller === document.documentElement ||
      scroller === document.body;
    if (isWin) {
      const rect = el.getBoundingClientRect();
      const scrollTop =
        window.scrollY || window.pageYOffset || scroller.scrollTop || 0;
      return rect.top + scrollTop;
    }
    const rect = el.getBoundingClientRect();
    const scRect = scroller.getBoundingClientRect();
    return rect.top - scRect.top + scroller.scrollTop;
  } catch {
    return el.offsetTop || 0;
  }
}

function markerOffsetPx(fallbackScroller: HTMLElement): number {
  const markerPct =
    typeof (window as any).__TP_MARKER_PCT === 'number'
      ? (window as any).__TP_MARKER_PCT
      : 0.4;
  const viewer = getViewerElement();
  const host = viewer || fallbackScroller;
  const h = host?.clientHeight || window.innerHeight || 0;
  return Math.max(0, Math.round(h * markerPct));
}

function getScrollMode(): string {
  try {
    const store = (window as any).__tpStore;
    if (store && typeof store.get === 'function') {
      const scrollMode = store.get('scrollMode');
      if (scrollMode != null) return String(scrollMode).toLowerCase();
      const legacyMode = store.get('mode');
      if (legacyMode != null) return String(legacyMode).toLowerCase();
    }
    const router: any = (window as any).__tpScrollMode;
    if (router && typeof router.getMode === 'function') {
      const mode = router.getMode();
      if (mode != null) return String(mode).toLowerCase();
    }
    if (typeof router === 'string') return router.toLowerCase();
  } catch {}
  return '';
}

function asrLandingBiasPx(fallbackScroller: HTMLElement): number {
  const viewer = getViewerElement();
  const host = viewer || fallbackScroller;
  const h = host?.clientHeight || window.innerHeight || 0;
  const overridePx = (window as any).__TP_ASR_LANDING_BIAS_PX;
  if (typeof overridePx === 'number' && Number.isFinite(overridePx)) {
    return Math.max(0, Math.round(overridePx));
  }
  const overridePct = (window as any).__TP_ASR_LANDING_BIAS_PCT;
  const pctRaw = typeof overridePct === 'number' ? overridePct : 0.12;
  const pct = Math.max(0, Math.min(0.5, pctRaw));
  return Math.max(0, Math.round(h * pct));
}

function prefersReducedMotion(): boolean {
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  } catch {
    return false;
  }
}

function cancelSeekAnimation(): void {
  if (!activeSeekAnim) return;
  try { activeSeekAnim.cancel(); } catch {}
  activeSeekAnim = null;
}

function readScrollTop(scroller: HTMLElement): number {
  if (isWindowScroller(scroller)) {
    return window.scrollY || window.pageYOffset || scroller.scrollTop || 0;
  }
  return scroller.scrollTop || 0;
}

function getDeltaScroller(): HTMLElement | null {
  return (
    (document.getElementById('scriptScrollContainer') as HTMLElement | null) ||
    (document.getElementById('viewer') as HTMLElement | null) ||
    (document.getElementById('wrap') as HTMLElement | null) ||
    getDisplayViewerElement() ||
    (document.scrollingElement as HTMLElement | null) ||
    (document.documentElement as HTMLElement | null) ||
    (document.body as HTMLElement | null)
  );
}

function estimateDelta(targetTop: number): number {
  try {
    const sc = getDeltaScroller();
    const cur = sc ? readScrollTop(sc) : 0;
    return (Number(targetTop) || 0) - (Number(cur) || 0);
  } catch {
    return Number(targetTop) || 0;
  }
}

function writeScrollTop(scroller: HTMLElement, top: number, reason = 'writeScrollTop'): void {
  const from = readScrollTop(scroller);
  const delta = (Number(top) || 0) - (Number(from) || 0);
  withWriteEnabled(reason, delta, () => {
    if (isWindowScroller(scroller)) {
      window.scrollTo({ top, behavior: 'auto' });
    } else {
      scroller.scrollTo({ top, behavior: 'auto' });
    }
  });
}

function resolveSeekTarget(blockIdx: number): { scroller: HTMLElement; top: number } | null {
  const blocks = getAsrBlockElements();
  const el = blocks[blockIdx];
  if (!el) return null;
  const scroller = findScroller(el);
  const baseOffset = markerOffsetPx(scroller);
  const mode = getScrollMode();
  const bias = mode === 'asr' ? asrLandingBiasPx(scroller) : 0;
  const top = elementTopRelativeTo(el, scroller) - (baseOffset + bias);
  return { scroller, top };
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
          try {
            const sc = getScroller();
            const cur = sc ? (sc.scrollTop || 0) : 0;
            const next = Number(top) || 0;
            withWriteEnabled('scrollTo', next - cur, () => fn(next));
          } catch {}
        },
        scrollBy(delta: number) {
          try {
            const sc = getScroller();
            const cur = sc ? (sc.scrollTop || 0) : 0;
            const d = Number(delta) || 0;
            withWriteEnabled('scrollBy', d, () => fn(cur + d));
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
            try { withWriteEnabled('scrollTo', estimateDelta(top), () => writerImpl.scrollTo(top, opts)); } catch {}
          },
          scrollBy(delta: number, opts?: { behavior?: ScrollBehavior }) {
            try { withWriteEnabled('scrollBy', Number(delta) || 0, () => writerImpl.scrollBy(delta, opts)); } catch {}
          },
          ensureVisible(top: number, paddingPx = 80) {
            try {
              if (typeof writerImpl.ensureVisible === 'function') {
                withWriteEnabled('ensureVisible', estimateDelta(top), () => writerImpl.ensureVisible!(top, paddingPx));
              } else {
                const next = Math.max(0, top - paddingPx);
                withWriteEnabled('ensureVisible', estimateDelta(next), () => writerImpl.scrollTo(next, { behavior: 'auto' }));
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

export function seekToBlock(blockIdx: number, reason: string) {
  cancelSeekAnimation();
  const target = resolveSeekTarget(blockIdx);
  if (!target) return;
  const { scroller, top } = target;

  try {
    writeScrollTop(scroller, top, reason || 'seekToBlock');
    try {
      if (reason && typeof console !== 'undefined') {
        (console as any).debug?.('[scroll-writer] seekToBlock', { blockIdx, reason });
      }
    } catch {}
  } catch {
    // ignore
  }
}

export function seekToBlockAnimated(blockIdx: number, reason: string) {
  cancelSeekAnimation();
  const mode = getScrollMode();
  if (mode !== 'asr' || prefersReducedMotion()) {
    seekToBlock(blockIdx, reason);
    return;
  }
  const target = resolveSeekTarget(blockIdx);
  if (!target) return;
  const { scroller, top: targetTop } = target;
  const startTop = readScrollTop(scroller);
  if (!Number.isFinite(targetTop) || Math.abs(targetTop - startTop) < 0.5) {
    writeScrollTop(scroller, targetTop, reason || 'seekToBlockAnimated');
    return;
  }
  const durationMs = 200;
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let cancelled = false;
  activeSeekAnim = {
    cancel() {
      cancelled = true;
      activeSeekAnim = null;
    },
  };
  const tick = (now: number) => {
    if (cancelled) return;
    const elapsed = now - start;
    const t = Math.max(0, Math.min(1, elapsed / durationMs));
    const eased = 1 - Math.pow(1 - t, 3);
    const next = startTop + (targetTop - startTop) * eased;
    writeScrollTop(scroller, next, reason || 'seekToBlockAnimated');
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      activeSeekAnim = null;
    }
  };
  requestAnimationFrame(tick);
}
