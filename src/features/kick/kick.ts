import {
  describeElement,
  getScrollerEl,
  getScriptRoot,
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
  const role = resolveKickRole();
  const primary = getScrollerEl(role);
  const fallback =
    role === 'display'
      ? ((document.getElementById('wrap') as HTMLElement | null) || getScriptRoot())
      : getScriptRoot();
  return resolveActiveScroller(primary, fallback);
}

function resolveKickRole(): 'main' | 'display' {
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

function readScrollTop(scroller: HTMLElement): number {
  return scroller.scrollTop || 0;
}

function writeScrollTop(scroller: HTMLElement, top: number): void {
  const nextTop = Math.max(0, Number(top) || 0);
  try {
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
