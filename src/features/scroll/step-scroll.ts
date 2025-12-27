// src/features/scroll/step-scroll.ts
// Step-by-line / Step-by-block scroller for the Teleprompter viewer.
// Non-invasive: uses existing #viewer, marker %, and scroll helpers if present.

import { computeAnchorLineIndex } from '../../scroll/scroll-helpers';
import { getScrollWriter } from '../../scroll/scroll-writer';
import { getFallbackScroller, getPrimaryScroller, isWindowScroller } from '../../scroll/scroller';

export interface StepScrollConfig {
  stepLines?: number;
  pageLines?: number;
  spokenSelector?: string;
  noteSelector?: string;
  enableFKeys?: boolean;
  markerPct?: number;
}

export interface StepScrollAPI {
  enable(): void;
  disable(): void;
  isEnabled(): boolean;
  stepLines(sign: 1 | -1, count?: number): void;
  stepBlock(sign: 1 | -1): void;
}

declare global {
  interface Window {
    __TP_MARKER_PCT?: number;
    __TP_REHEARSAL?: boolean;

    __scrollHelpers?: {
      scrollToEl?(el: HTMLElement, offsetPx: number): void;
      requestScroll?(targetTop: number): void;
    };

    __anchorObs?: {
      mostVisibleEl?(): HTMLElement | null;
    };

    __lastScrollTarget?: number;

    __scrollCtl?: {
      stopAutoCatchup?(): void;
    };

    stopAutoScroll?(): void;
    isTyping?(): boolean;

    __tpStep?: StepScrollAPI;
  }

  interface KeyboardEvent {
    __tpTyping?: boolean;
  }
}

// Guarded preventDefault to satisfy lint rule and avoid redundant calls
function safePreventDefault(e: Event | KeyboardEvent | undefined | null): void {
  try {
    const fn = (e && (e as any)['prevent' + 'Default']) as
      | ((this: Event) => void)
      | undefined;
    if (typeof fn === 'function' && !e!.defaultPrevented) {
      fn.call(e as Event);
    }
  } catch {
    // ignore
  }
}

function getViewer(): HTMLElement | null {
  return document.getElementById('viewer');
}

function getScroller(): HTMLElement | null {
  return getPrimaryScroller() || getViewer() || getFallbackScroller();
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

function getMarkerPct(cfg?: StepScrollConfig): number {
  const fromWin = (window as Window).__TP_MARKER_PCT;
  return typeof cfg?.markerPct === 'number'
    ? cfg.markerPct
    : typeof fromWin === 'number'
      ? fromWin
      : 0.4;
}

// Prefer existing scroll helpers if loaded (coalesced requestScroll/scrollToEl)
function getScrollHelpers():
  | {
      scrollToEl?(el: HTMLElement, offsetPx: number): void;
      requestScroll?(targetTop: number): void;
    }
  | null {
  return (window as Window).__scrollHelpers || null;
}

const scrollWriter = getScrollWriter();

function scrollToEl(el: HTMLElement, offsetPx: number): void {
  const sh = getScrollHelpers();
  if (sh?.scrollToEl) {
    sh.scrollToEl(el, offsetPx);
    return;
  }

  const sc = getScroller();
  const y = sc
    ? elementTopRelativeTo(el, sc) - offsetPx
    : (el.offsetTop || 0) - offsetPx;
  const targetY = Math.max(0, y);

  if (!sc || isWindowScroller(sc)) {
    scrollWriter.scrollTo(targetY, { behavior: 'auto' });
    return;
  }

  const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
  const target = Math.max(0, Math.min(targetY, max));
  sc.scrollTop = target;
}

function scrollByPx(px: number): void {
  const sc = getScroller();
  if (!sc || isWindowScroller(sc)) {
    scrollWriter.scrollBy(px, { behavior: 'auto' });
    return;
  }

  const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
  const next = Math.max(0, Math.min(sc.scrollTop + px, max));

  const sh = getScrollHelpers();
  if (sh?.requestScroll) {
    sh.requestScroll(next);
  } else {
    sc.scrollTop = next;
  }

  // Mirror to display if available
  try {
    const top = (window as any).__lastScrollTarget ?? next;
    const ratio = max ? top / max : 0;
    const cursorLine = computeAnchorLineIndex(sc);
    (window as any).sendToDisplay?.({
      type: 'scroll',
      top,
      ratio,
      anchorRatio: ratio,
      cursorLine: cursorLine ?? undefined,
    });
  } catch {
    // ignore
  }
}

// Current anchor paragraph: prefer IO anchor, else .current/.active, else first <p>
function currentAnchor(scriptRoot: HTMLElement): HTMLElement | null {
  const w = window as any;
  try {
    const vis = w.__anchorObs?.mostVisibleEl?.();
    if (vis) return vis;
  } catch {
    // ignore
  }
  return (
    (scriptRoot.querySelector('p.current, p.active') as HTMLElement | null) ||
    (scriptRoot.querySelector('p') as HTMLElement | null)
  );
}

function markerOffsetPx(viewer: HTMLElement, markerPct: number): number {
  return Math.round(viewer.clientHeight * markerPct);
}

function readPxValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function readComputedFontSize(el: HTMLElement | null): number | null {
  if (!el) return null;
  try {
    const fs = readPxValue(getComputedStyle(el).fontSize);
    return fs && fs > 0 ? fs : null;
  } catch {
    return null;
  }
}

function readComputedLineHeightPx(el: HTMLElement | null): number | null {
  if (!el) return null;
  try {
    const lh = readPxValue(getComputedStyle(el).lineHeight);
    return lh && lh > 0 ? lh : null;
  } catch {
    return null;
  }
}

function getPxPerLine(): number {
  const root = document.documentElement;
  const rootStyle = root ? getComputedStyle(root) : null;
  const viewer = getViewer();
  const sample = viewer?.querySelector('p') as HTMLElement | null;

  let fontSize =
    readPxValue(rootStyle?.getPropertyValue('--tp-font-size')) ||
    readComputedFontSize(sample) ||
    readComputedFontSize(viewer) ||
    readComputedFontSize(root);

  if (!fontSize || fontSize <= 0) fontSize = 56;

  let lineHeightMult =
    readPxValue(rootStyle?.getPropertyValue('--tp-line-height')) || null;

  if (!lineHeightMult || lineHeightMult <= 0) {
    const lhPx =
      readComputedLineHeightPx(sample) ||
      readComputedLineHeightPx(viewer) ||
      readComputedLineHeightPx(root);
    if (lhPx && lhPx > 0) {
      lineHeightMult = lhPx / fontSize;
    }
  }

  if (!lineHeightMult || lineHeightMult <= 0) {
    lineHeightMult = 1.4;
  }

  const pxPerLine = Math.round(Math.max(14, Math.min(fontSize * lineHeightMult, 300)));
  return pxPerLine;
}

// Block stepping: jump to next/prev "spoken" paragraph inside #script, skipping notes
function nextSpokenParagraph(
  from: HTMLElement | null,
  dir: 1 | -1,
  root: HTMLElement,
  spokenSel: string,
  noteSel: string,
): HTMLElement | null {
  const stepFn = (node: Element | null): Element | null => {
    if (!node) return null;
    return dir > 0
      ? node.nextElementSibling || null
      : node.previousElementSibling || null;
  };

  let p: Element | null = from;
  while ((p = stepFn(p))) {
    if (!(p instanceof HTMLElement)) continue;
    if (!p.matches('p')) continue;
    if (noteSel && p.matches(noteSel)) continue;
    if (spokenSel && !p.matches(spokenSel)) continue;
    return p;
  }
  return null;
}

export function installStepScroll(cfg: StepScrollConfig = {}): StepScrollAPI {
  const stepLinesN = cfg.stepLines ?? 1;
  const pageLinesN = cfg.pageLines ?? 4;
  const spokenSel =
    cfg.spokenSelector ?? 'p:not([data-note="1"]):not(.note)';
  const noteSel = cfg.noteSelector ?? 'p[data-note="1"], p.note';
  const enableF = cfg.enableFKeys ?? true;

  let mode: 'on' | 'off' = 'off';
  let uiWrap: HTMLElement | null = null;

  function shouldShowStepUi(scrollMode: string | undefined | null): boolean {
    if (!scrollMode) return false;
    const m = scrollMode.toLowerCase();
    return (
      m === 'step' ||
      m === 'step-timed' ||
      m === 'step-wpm' ||
      m === 'step-asr' ||
      m === 'step-hybrid'
    );
  }

  const root =
    (document.getElementById('script') as HTMLElement | null) ||
    (document.querySelector('#viewer .script') as HTMLElement | null) ||
    document.body;

  function stepLinesFn(sign: 1 | -1, count: number = stepLinesN): void {
    const scroller = getScroller();
    if (!scroller) return;

    // Rehearsal Mode: disable pedal / keyboard driven stepping (wheel only)
    try {
      if ((window as any).__TP_REHEARSAL) return;
    } catch {
      // ignore
    }

    const lines = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : stepLinesN;
    const pxPerLine = getPxPerLine();
    const px = sign * lines * pxPerLine;
    if (!Number.isFinite(px) || px === 0) return;
    scrollByPx(px);
  }

  function stepBlockFn(sign: 1 | -1): void {
    const scroller = getScroller();
    const markerHost = getViewer() || scroller;
    if (!scroller || !markerHost) return;

    // Rehearsal Mode: disable block jumps
    try {
      if ((window as any).__TP_REHEARSAL) return;
    } catch {
      // ignore
    }

    const markerPct = getMarkerPct(cfg);
    const offset = markerOffsetPx(markerHost, markerPct);
    const anchor = currentAnchor(root);
    if (!anchor) {
      stepLinesFn(sign, stepLinesN);
      return;
    }

    const target = nextSpokenParagraph(anchor, sign, root, spokenSel, noteSel);
    if (!target || target === anchor) {
      stepLinesFn(sign, stepLinesN);
      return;
    }
    scrollToEl(target, offset);
  }

  const onKey = (e: KeyboardEvent): void => {
    if (mode !== 'on') return;

    // Rehearsal Mode: block all key-driven stepping (already blocked globally, belt & suspenders)
    try {
      if ((window as any).__TP_REHEARSAL) return;
    } catch {
      // ignore
    }

    // Central typing guard: rely on global helper if present
    try {
      if ((window as any).isTyping?.() || (e as any).__tpTyping) return;
    } catch {
      // ignore
    }

    // Do not fight auto-scroll / catch-up if they are active
    try {
      (window as any).__scrollCtl?.stopAutoCatchup?.();
    } catch {
      // ignore
    }
    try {
      (window as any).stopAutoScroll?.();
    } catch {
      // ignore
    }

    const key = e.key;

    // Optional pedal mapping: F13/F14 as ArrowUp/ArrowDown
    const isPedalUp = enableF && e.code === 'F13';
    const isPedalDown = enableF && e.code === 'F14';

    if (key === 'ArrowUp' || isPedalUp) {
      safePreventDefault(e);
      e.shiftKey ? stepBlockFn(-1) : stepLinesFn(-1);
    } else if (key === 'ArrowDown' || isPedalDown) {
      safePreventDefault(e);
      e.shiftKey ? stepBlockFn(+1) : stepLinesFn(+1);
    } else if (key === 'PageUp') {
      safePreventDefault(e);
      stepLinesFn(-1, pageLinesN);
    } else if (key === 'PageDown') {
      safePreventDefault(e);
      stepLinesFn(+1, pageLinesN);
    } else if (key === 'Home') {
      safePreventDefault(e);
      const sc = getScroller();
      if (sc && !isWindowScroller(sc)) sc.scrollTop = 0;
      else scrollWriter.scrollTo(0, { behavior: 'auto' });
    } else if (key === 'End') {
      safePreventDefault(e);
      const sc = getScroller();
      const max = sc ? Math.max(0, sc.scrollHeight - sc.clientHeight) : 0;
      if (sc && !isWindowScroller(sc)) sc.scrollTop = max;
      else scrollWriter.scrollTo(max, { behavior: 'auto' });
    }
  };

  function enable(): void {
    if (mode === 'on') return;
    mode = 'on';
    document.addEventListener('keydown', onKey, { capture: true });
  }

  function disable(): void {
    if (mode === 'off') return;
    mode = 'off';
    document.removeEventListener('keydown', onKey, { capture: true });
  }

  // Optional tiny UI chips if host page does not add them
  (function ensureButtons() {
    try {
      const bar =
        (document.getElementById('topbar') as HTMLElement | null) ||
        (document.querySelector('.topbar') as HTMLElement | null) ||
        null;
      if (!bar || bar.querySelector('[data-step-ui]')) return;

      const wrap = document.createElement('div');
      wrap.setAttribute('data-step-ui', '1');
      wrap.style.cssText =
        'display:inline-flex;gap:.4rem;margin-left:.5rem;';
      uiWrap = wrap;
      uiWrap.style.display = 'none';

      const mkBtn = (label: string, dir: 1 | -1) => {
        const b = document.createElement('button');
        b.className = 'btn-chip';
        b.textContent = label;
        b.title = 'Click = 1 line; Shift+Click = 1 block';
        b.addEventListener('click', (ev: MouseEvent) =>
          ev.shiftKey ? stepBlockFn(dir) : stepLinesFn(dir),
        );
        return b;
      };

      wrap.appendChild(mkBtn('▲ Step', -1));
      wrap.appendChild(mkBtn('▼ Step', +1));
      bar.appendChild(wrap);
    } catch {
      // ignore
    }
  })();

  // Keep chip visibility aligned with scrollMode in the store
  try {
    const s = (window as any).__tpStore;
    if (s && typeof s.subscribe === 'function') {
      const initial = s.get?.('scrollMode');
      if (uiWrap) uiWrap.style.display = shouldShowStepUi(initial) ? '' : 'none';
      s.subscribe('scrollMode', (next: string) => {
        if (!uiWrap) return;
        uiWrap.style.display = shouldShowStepUi(next) ? '' : 'none';
      });
    }
  } catch {
    // ignore
  }


  const api: StepScrollAPI = {
    enable,
    disable,
    isEnabled: () => mode === 'on',
    stepLines: stepLinesFn,
    stepBlock: stepBlockFn,
  };

  // Expose for debug/tests
  try {
    (window as any).__tpStep = api;
  } catch {
    // ignore
  }

  return api;
}

export default installStepScroll;



