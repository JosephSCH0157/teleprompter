// Central scroll writer shim.
// All code that moves the main script viewport should route through this helper.

import { getAsrBlockElements } from './asr-block-store';
import {
  describeElement,
  getDisplayViewerElement,
  getRuntimeScroller,
  getScrollerEl,
  getViewerElement,
  resolveViewerRole,
} from './scroller';
import { shouldLogLevel } from '../env/dev-log';

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
let lastWriteMismatchAt = 0;
let lastWriteMismatchKey = '';
let lastNonFiniteGuardAt = 0;

const WRITE_MISMATCH_LOG_THROTTLE_MS = 2000;
const WRITE_MISMATCH_EPSILON_PX = 1;
const NON_FINITE_GUARD_THROTTLE_MS = 1000;
const ASR_SEEK_DEFAULT_LINES_PER_SEC = 1.25;
const ASR_SEEK_MIN_DURATION_MS = 220;
const ASR_SEEK_MAX_DURATION_MS = 650;
const ASR_SEEK_EPSILON_PX = 0.5;

type SeekAnimationOptions = {
  targetTop?: number | null;
  maxPxPerSecond?: number | null;
  minDurationMs?: number;
  maxDurationMs?: number;
};

function shouldWarnWrites(): boolean {
  return shouldLogLevel(1);
}

function shouldVerboseWrites(): boolean {
  return shouldLogLevel(2);
}

function shouldTraceWrites(): boolean {
  return shouldLogLevel(3);
}

function logNonFiniteGuard(reason: string, value: unknown, detail?: Record<string, unknown>): void {
  if (!shouldWarnWrites()) return;
  const now = Date.now();
  if (now - lastNonFiniteGuardAt < NON_FINITE_GUARD_THROTTLE_MS) return;
  lastNonFiniteGuardAt = now;
  try {
    console.warn('[scroll-writer] non-finite value', {
      reason,
      value,
      ...(detail || {}),
    });
  } catch {
    // ignore
  }
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

function findScroller(el: HTMLElement): HTMLElement {
  const runtime = getRuntimeScroller(resolveViewerRole());
  return (
    runtime ||
    getScrollerEl('main') ||
    getScrollerEl('display') ||
    getDisplayViewerElement() ||
    getViewerElement() ||
    el
  );
}

function elementTopRelativeTo(el: HTMLElement, scroller: HTMLElement): number {
  try {
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
  return scroller.scrollTop || 0;
}

function getDeltaScroller(): HTMLElement | null {
  return (
    getRuntimeScroller(resolveViewerRole()) ||
    getScrollerEl('main') ||
    getScrollerEl('display') ||
    getDisplayViewerElement() ||
    (document.getElementById('wrap') as HTMLElement | null)
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

function logWriteMismatch(scroller: HTMLElement, target: number, before: number, after: number, reason: string): void {
  if (!shouldWarnWrites()) return;
  if (Math.abs(after - target) <= WRITE_MISMATCH_EPSILON_PX) return;
  const now = Date.now();
  const key = `${reason}|${describeElement(scroller)}|${Math.round(target)}|${Math.round(after)}`;
  if (key === lastWriteMismatchKey && now - lastWriteMismatchAt < WRITE_MISMATCH_LOG_THROTTLE_MS) return;
  lastWriteMismatchKey = key;
  lastWriteMismatchAt = now;
  let overflow = '';
  let overflowY = '';
  try {
    const style = getComputedStyle(scroller);
    overflow = String(style.overflow || '');
    overflowY = String(style.overflowY || '');
  } catch {
    overflow = '';
    overflowY = '';
  }
  const maxTop = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
  const activeScroller = getRuntimeScroller(resolveViewerRole());
  try {
    console.warn('[scroll-writer] write mismatch', {
      reason,
      scroller: describeElement(scroller),
      targetTop: Math.round(target),
      before: Math.round(before),
      after: Math.round(after),
      deltaPx: Math.round(after - before),
      overflow,
      overflowY,
      scrollHeight: Math.round(scroller.scrollHeight || 0),
      clientHeight: Math.round(scroller.clientHeight || 0),
      maxTop: Math.round(maxTop),
      activeScroller: describeElement(activeScroller),
      isActiveScroller: activeScroller === scroller,
    });
  } catch {}
}

function writeScrollTop(scroller: HTMLElement, top: number, reason = 'writeScrollTop'): void {
  const rawFrom = scroller.scrollTop;
  const from = Number.isFinite(rawFrom) ? rawFrom : 0;
  if (!Number.isFinite(rawFrom)) {
    logNonFiniteGuard('writeScrollTop:from', rawFrom, {
      scroller: describeElement(scroller),
      reason,
    });
  }
  const rawTop = Number(top);
  if (!Number.isFinite(rawTop)) {
    logNonFiniteGuard('writeScrollTop:target', top, {
      scroller: describeElement(scroller),
      reason,
    });
    return;
  }
  const maxTop = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
  const target = Math.max(0, Math.min(rawTop, maxTop));
  const delta = target - from;
  withWriteEnabled(reason, delta, () => {
    if (typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ top: target, behavior: 'auto' });
    } else {
      scroller.scrollTop = target;
    }
  });
  const after = readScrollTop(scroller);
  logWriteMismatch(scroller, target, from, after, reason);
}

function resolveSeekTarget(blockIdx: number): {
  blockEl: HTMLElement;
  scroller: HTMLElement;
  top: number;
  blockTopPx: number;
  lineIdx: number | null;
} | null {
  const blocks = getAsrBlockElements();
  const el = blocks[blockIdx];
  if (!el) return null;
  const scroller = findScroller(el);
  const mode = getScrollMode();
  const blockTopPx = elementTopRelativeTo(el, scroller);
  if (!Number.isFinite(blockTopPx)) {
    logNonFiniteGuard('resolveSeekTarget:blockTopPx', blockTopPx, { blockIdx });
    return null;
  }
  const top = mode === 'asr'
    ? blockTopPx
    : blockTopPx - markerOffsetPx(scroller);
  if (!Number.isFinite(top)) {
    logNonFiniteGuard('resolveSeekTarget:top', top, { blockIdx, mode });
    return null;
  }
  let lineIdx: number | null = null;
  try {
    const firstLine = el.querySelector<HTMLElement>('.line[data-line], .line[data-line-idx], .line');
    const rawIdx = firstLine?.dataset?.line ?? firstLine?.dataset?.lineIdx;
    const parsed = Number(rawIdx);
    if (Number.isFinite(parsed)) lineIdx = Math.max(0, Math.floor(parsed));
  } catch {
    lineIdx = null;
  }
  return { blockEl: el, scroller, top, blockTopPx, lineIdx };
}

function resolveSeekLineHeightPx(target: { blockEl: HTMLElement; scroller: HTMLElement }): number {
  const lineEl = target.blockEl.querySelector<HTMLElement>('.line[data-line], .line[data-line-idx], .line');
  const lineRectH = lineEl?.getBoundingClientRect?.().height ?? 0;
  if (Number.isFinite(lineRectH) && lineRectH > 4) return lineRectH;
  const lineOffsetH = lineEl?.offsetHeight ?? 0;
  if (Number.isFinite(lineOffsetH) && lineOffsetH > 4) return lineOffsetH;
  try {
    const computed = lineEl ? Number.parseFloat(getComputedStyle(lineEl).lineHeight) : Number.NaN;
    if (Number.isFinite(computed) && computed > 4) return computed;
  } catch {
    // ignore
  }
  const scrollerRectH = target.scroller.getBoundingClientRect?.().height ?? 0;
  if (Number.isFinite(scrollerRectH) && scrollerRectH > 0) {
    return Math.max(24, Math.min(96, scrollerRectH * 0.09));
  }
  return 56;
}

export function getScrollWriter(): ScrollWriter {
  if (cached) return cached;

  if (typeof window !== 'undefined') {
    const maybe = (window as any).__tpScrollWrite;
    if (typeof maybe === 'function') {
      const fn = maybe as (_top: number) => void;
      const getScroller = () =>
        getRuntimeScroller(resolveViewerRole()) ||
        getScrollerEl('main') ||
        getScrollerEl('display') ||
        getDisplayViewerElement();
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
  const { scroller, top, blockTopPx, lineIdx } = target;

  try {
    if (shouldVerboseWrites()) {
      const currentScrollTop = readScrollTop(scroller);
      try {
        console.log('[scroll-writer] seek target', {
          blockIdx,
          lineIdx,
          blockTopPx: Math.round(blockTopPx),
          currentScrollTop: Math.round(currentScrollTop),
          targetTop: Math.round(top),
          deltaPx: Math.round(top - currentScrollTop),
          reason: reason || 'seekToBlock',
        });
      } catch {}
    }
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

export function seekToBlockAnimated(blockIdx: number, reason: string, opts: SeekAnimationOptions = {}) {
  cancelSeekAnimation();
  const mode = getScrollMode();
  if (mode !== 'asr' || prefersReducedMotion()) {
    seekToBlock(blockIdx, reason);
    return;
  }
  const target = resolveSeekTarget(blockIdx);
  if (!target) return;
  const { scroller, top: blockTargetTop, blockTopPx, lineIdx } = target;
  const startTop = readScrollTop(scroller);
  const maxTop = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
  const requestedTopRaw = Number(opts.targetTop);
  const hasRequestedTop = Number.isFinite(requestedTopRaw);
  const targetTop = hasRequestedTop
    ? Math.max(0, Math.min(requestedTopRaw, maxTop))
    : blockTargetTop;
  const lineHeightPx = resolveSeekLineHeightPx(target);
  const configuredMaxPxPerSecond = Number(opts.maxPxPerSecond);
  const maxPxPerSecond =
    Number.isFinite(configuredMaxPxPerSecond) && configuredMaxPxPerSecond > 0
      ? configuredMaxPxPerSecond
      : Math.max(36, lineHeightPx * ASR_SEEK_DEFAULT_LINES_PER_SEC);
  const minDurationMsRaw = Number(opts.minDurationMs);
  const maxDurationMsRaw = Number(opts.maxDurationMs);
  const minDurationMs =
    Number.isFinite(minDurationMsRaw) && minDurationMsRaw > 0
      ? minDurationMsRaw
      : ASR_SEEK_MIN_DURATION_MS;
  const maxDurationMs =
    Number.isFinite(maxDurationMsRaw) && maxDurationMsRaw > minDurationMs
      ? maxDurationMsRaw
      : Math.max(minDurationMs, ASR_SEEK_MAX_DURATION_MS);
  const deltaPx = targetTop - startTop;
  if (shouldVerboseWrites()) {
    try {
      console.log('[scroll-writer] seek target', {
        blockIdx,
        lineIdx,
        blockTopPx: Math.round(blockTopPx),
        lineHeightPx: Math.round(lineHeightPx),
        currentScrollTop: Math.round(startTop),
        targetTop: Math.round(targetTop),
        requestedTop: hasRequestedTop ? Math.round(requestedTopRaw) : null,
        maxPxPerSecond: Math.round(maxPxPerSecond),
        deltaPx: Math.round(deltaPx),
        reason: reason || 'seekToBlockAnimated',
      });
    } catch {}
  }
  if (!Number.isFinite(targetTop) || Math.abs(deltaPx) < ASR_SEEK_EPSILON_PX) {
    writeScrollTop(scroller, targetTop, reason || 'seekToBlockAnimated');
    return;
  }
  const durationMs = Math.max(
    minDurationMs,
    Math.min(maxDurationMs, (Math.abs(deltaPx) / maxPxPerSecond) * 1000),
  );
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
