import {
  describeElement,
  getRuntimeScroller,
  resolveViewerRole,
} from '../../scroll/scroller';
import { getAsrBlockElements } from '../../scroll/asr-block-store';
import { getScrollWriter, seekToBlockAnimated } from '../../scroll/scroll-writer';

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
  return getRuntimeScroller(resolveViewerRole());
}

function getScrollMode(): string {
  if (typeof window === 'undefined') return '';
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
    if (typeof router === 'string') return String(router).toLowerCase();
  } catch {
    // ignore
  }
  return '';
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

function parseLineIndexFromElement(lineEl: HTMLElement): number | null {
  const raw =
    lineEl.dataset.line ||
    lineEl.dataset.lineIdx ||
    lineEl.dataset.i ||
    lineEl.dataset.index ||
    lineEl.getAttribute('data-line-idx');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

function getBlockLineRange(blockEl: HTMLElement): { start: number; end: number } | null {
  const lineEls = Array.from(blockEl.querySelectorAll<HTMLElement>('.line'));
  if (!lineEls.length) return null;
  const indices = lineEls
    .map((lineEl) => parseLineIndexFromElement(lineEl))
    .filter((idx): idx is number => Number.isFinite(idx))
    .sort((a, b) => a - b);
  if (indices.length) {
    return {
      start: indices[0],
      end: indices[indices.length - 1],
    };
  }
  try {
    const allLines = Array.from(document.querySelectorAll<HTMLElement>('.line'));
    const start = allLines.indexOf(lineEls[0]);
    const end = allLines.indexOf(lineEls[lineEls.length - 1]);
    if (start >= 0 && end >= 0) {
      return {
        start: Math.min(start, end),
        end: Math.max(start, end),
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function getCurrentLineIndex(): number | null {
  if (typeof window === 'undefined') return null;
  const current = Number((window as any).currentIndex);
  if (Number.isFinite(current)) return Math.max(0, Math.floor(current));
  try {
    const driver = (window as any).__tpAsrScrollDriver;
    const fromDriver = Number(driver?.getLastLineIndex?.());
    if (Number.isFinite(fromDriver)) return Math.max(0, Math.floor(fromDriver));
  } catch {
    // ignore
  }
  return null;
}

function elementTopRelativeToScroller(el: HTMLElement, scroller: HTMLElement): number {
  try {
    const rect = el.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    return rect.top - scrollerRect.top + (scroller.scrollTop || 0);
  } catch {
    return el.offsetTop || 0;
  }
}

function resolveCurrentAsrBlockIdx(scroller: HTMLElement, blocks: HTMLElement[]): number | null {
  const currentLine = getCurrentLineIndex();
  if (Number.isFinite(currentLine as number)) {
    for (let i = 0; i < blocks.length; i += 1) {
      const range = getBlockLineRange(blocks[i]);
      if (!range) continue;
      if ((currentLine as number) >= range.start && (currentLine as number) <= range.end) {
        return i;
      }
    }
  }
  const scrollTop = readScrollTop(scroller);
  let bestIdx = 0;
  let bestTop = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < blocks.length; i += 1) {
    const top = elementTopRelativeToScroller(blocks[i], scroller);
    if (top <= scrollTop + 8 && top >= bestTop) {
      bestTop = top;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function kickAsrForward(scroller: HTMLElement, deltaPx: number, reason: string): boolean {
  const blocks = getAsrBlockElements();
  const from = readScrollTop(scroller);
  if (blocks.length) {
    const currentBlockIdx = resolveCurrentAsrBlockIdx(scroller, blocks);
    const nextBlockIdx =
      currentBlockIdx == null
        ? 0
        : Math.min(blocks.length - 1, Math.max(0, currentBlockIdx + 1));
    if (currentBlockIdx == null || nextBlockIdx !== currentBlockIdx) {
      try { seekToBlockAnimated(nextBlockIdx, `${reason}:asr`); } catch {}
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          try {
            const afterFrame = readScrollTop(scroller);
            if (Math.abs(afterFrame - from) < 0.5) {
              writeScrollTop(scroller, from + deltaPx);
            }
          } catch {
            // ignore
          }
        });
      } else {
        const immediate = readScrollTop(scroller);
        if (Math.abs(immediate - from) < 0.5) {
          writeScrollTop(scroller, from + deltaPx);
        }
      }
      return true;
    }
  }
  writeScrollTop(scroller, from + deltaPx);
  return Math.abs(readScrollTop(scroller) - from) >= 0.5;
}

export function kick(options: KickOptions = {}): boolean {
  const scroller = getResolvedScroller();
  if (!scroller) return false;

  const deltaPx = normalizeDeltaPx(options.deltaPx);
  const reason = options.reason || 'kick';
  const mode = getScrollMode();
  const from = readScrollTop(scroller);

  let moved: boolean;
  if (mode === 'asr') {
    moved = kickAsrForward(scroller, deltaPx, reason);
  } else {
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
    moved = Math.abs(to - from) >= 0.5;
  }
  const to = readScrollTop(scroller);

  try { scroller.dataset.tpLastWriter = reason; } catch {}

  if (import.meta.env.DEV) {
    try {
      console.info('[kick]', {
        reason,
        mode,
        deltaPx,
        from: Math.round(from),
        to: Math.round(to),
        moved,
        scroller: describeElement(scroller),
      });
    } catch {}
  }

  return moved;
}
