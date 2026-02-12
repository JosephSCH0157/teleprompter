import {
  describeElement,
  getFallbackScroller,
  getPrimaryScroller,
  getScriptRoot,
  isWindowScroller,
  resolveActiveScroller,
} from '../../scroll/scroller';
import { getScrollWriter } from '../../scroll/scroll-writer';

const DEFAULT_KICK_DELTA_PX = 120;

export interface KickOptions {
  deltaPx?: number;
  reason?: string;
}

function normalizeDeltaPx(rawDelta: number | undefined): number {
  const next = Number(rawDelta);
  if (!Number.isFinite(next) || next === 0) return DEFAULT_KICK_DELTA_PX;
  return next;
}

function getResolvedScroller(): HTMLElement | null {
  return resolveActiveScroller(
    getPrimaryScroller(),
    getScriptRoot() || getFallbackScroller(),
  );
}

function readScrollTop(scroller: HTMLElement): number {
  if (isWindowScroller(scroller)) {
    return window.scrollY || window.pageYOffset || scroller.scrollTop || 0;
  }
  return scroller.scrollTop || 0;
}

function writeScrollTop(scroller: HTMLElement, top: number): void {
  const nextTop = Math.max(0, Number(top) || 0);
  try {
    if (isWindowScroller(scroller)) {
      window.scrollTo({ top: nextTop, behavior: 'auto' });
      return;
    }
    if (typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ top: nextTop, behavior: 'auto' });
      return;
    }
    scroller.scrollTop = nextTop;
  } catch {
    try { scroller.scrollTop = nextTop; } catch {}
  }
}

export function resolveKickScroller(): HTMLElement | null {
  return getResolvedScroller();
}

export function kick(options: KickOptions = {}): boolean {
  const scroller = getResolvedScroller();
  if (!scroller) return false;

  const deltaPx = normalizeDeltaPx(options.deltaPx);
  const reason = options.reason || 'kick';
  const from = readScrollTop(scroller);

  try {
    getScrollWriter().scrollBy(deltaPx, { behavior: 'auto' });
  } catch {
    // ignore writer errors, fallback below
  }

  let to = readScrollTop(scroller);
  if (Math.abs(to - from) < 0.5) {
    writeScrollTop(scroller, from + deltaPx);
    to = readScrollTop(scroller);
  }

  try { scroller.dataset.tpLastWriter = reason; } catch {}

  if (import.meta.env.DEV) {
    try {
      console.info('[kick]', {
        reason,
        deltaPx,
        from: Math.round(from),
        to: Math.round(to),
        scroller: describeElement(scroller),
      });
    } catch {}
  }

  return Math.abs(to - from) >= 0.5;
}
