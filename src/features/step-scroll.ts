// Step-by-line / Step-by-block scroller for the Teleprompter viewer.
// Non-invasive: uses existing #viewer, marker %, and scroll helpers if present.

export type StepMode = 'off' | 'on';

export interface StepScrollConfig {
  stepLines?: number;      // default 1
  pageLines?: number;      // default 4
  markerPct?: number;      // default from window.__TP_MARKER_PCT or 0.4
  spokenSelector?: string; // paragraphs considered "spoken"
  noteSelector?: string;   // paragraphs to skip as notes
  enableFKeys?: boolean;   // also handle F13/F14 as Up/Down (pedals)
}

export interface StepAPI {
  enable(): void;
  disable(): void;
  isEnabled(): boolean;
  stepLines(_delta: number): void;
  stepBlock(_delta: 1 | -1): void;
}

function getViewer(): HTMLElement | null {
  return document.getElementById('viewer');
}

function getMarkerPct(cfg?: StepScrollConfig): number {
  const fromWin = (window as any).__TP_MARKER_PCT;
  return typeof cfg?.markerPct === 'number'
    ? cfg.markerPct
    : typeof fromWin === 'number'
    ? fromWin
    : 0.4;
}

// Prefer existing scroll helpers if loaded (coalesced requestScroll/scrollToEl)
function getScrollHelpers() {
  const w = window as any;
  return w.__scrollHelpers || null;
}

function scrollToEl(el: HTMLElement, offsetPx: number) {
  const sh = getScrollHelpers();
  if (sh?.scrollToEl) {
    sh.scrollToEl(el, offsetPx);
  } else {
    const sc = getViewer();
    if (!sc) return;
    const y = (el.offsetTop || 0) - offsetPx;
    const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
    sc.scrollTop = Math.max(0, Math.min(y, max));
  }
}

function scrollByPx(px: number) {
  const sc = getViewer();
  if (!sc) return;
  const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
  const next = Math.max(0, Math.min(sc.scrollTop + px, max));
  const sh = getScrollHelpers();
  if (sh?.requestScroll) sh.requestScroll(next);
  else sc.scrollTop = next;
  // Mirror to display if available
  try {
    const top = (window as any).__lastScrollTarget ?? next;
    const ratio = max ? top / max : 0;
    (window as any).sendToDisplay?.({ type: 'scroll', top, ratio });
  } catch {}
}

// Current anchor paragraph: prefer IO anchor, else .current/.active, else first <p>
function currentAnchor(scriptRoot: HTMLElement): HTMLElement | null {
  const w = window as any;
  try {
    const vis = w.__anchorObs?.mostVisibleEl?.();
    if (vis) return vis as HTMLElement;
  } catch {}
  return (
    scriptRoot.querySelector('p.current, p.active') || scriptRoot.querySelector('p')
  ) as HTMLElement | null;
}

function markerOffsetPx(viewer: HTMLElement, markerPct: number): number {
  return Math.round(viewer.clientHeight * markerPct);
}

// Estimate a line height from the current anchor (fallback to viewer paragraph)
function estimateLineHeight(el: HTMLElement | null): number {
  const sample = (el as HTMLElement) || (document.querySelector('#viewer p') as HTMLElement | null);
  const lh = sample ? parseFloat(getComputedStyle(sample).lineHeight || '0') : 0;
  return Math.max(14, Math.floor(lh || 20));
}

// Block stepping: jump to next/prev "spoken" paragraph inside #script, skipping notes
function nextSpokenParagraph(
  from: HTMLElement,
  dir: 1 | -1,
  root: HTMLElement,
  spokenSel: string,
  noteSel: string
): HTMLElement | null {
  const stepFn = (node: Element | null): Element | null => {
    if (!node) return null;
    return dir > 0 ? (node.nextElementSibling || null) : (node.previousElementSibling || null);
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

export function installStepScroll(cfg: StepScrollConfig = {}): StepAPI {
  const stepLinesN = cfg.stepLines ?? 1;
  const pageLinesN = cfg.pageLines ?? 4;
  const spokenSel = cfg.spokenSelector ?? 'p:not([data-note="1"]):not(.note)';
  const noteSel = cfg.noteSelector ?? 'p[data-note="1"], p.note';
  const enableF = cfg.enableFKeys ?? true;
  let mode: StepMode = 'off';

  const root =
    (document.getElementById('script') as HTMLElement) ||
    (document.querySelector('#viewer .script') as HTMLElement) ||
    document.body;

  function stepLinesFn(sign: number, count = stepLinesN) {
    const viewer = getViewer();
    if (!viewer) return;
    const anchor = currentAnchor(root);
    const lh = estimateLineHeight(anchor);
    scrollByPx(sign * count * lh);
  }

  function stepBlockFn(sign: 1 | -1) {
    const viewer = getViewer();
    if (!viewer) return;
    const markerPct = getMarkerPct(cfg);
    const offset = markerOffsetPx(viewer, markerPct);
    const anchor = currentAnchor(root);
    if (!anchor) return;
    const target = nextSpokenParagraph(anchor, sign, root, spokenSel, noteSel) || anchor;
    scrollToEl(target, offset);
  }

  const onKey = (e: KeyboardEvent) => {
    if (mode !== 'on') return;
    // Central typing guard: rely on global helper if present
    try { if ((window as any).isTyping?.() || (e as any).__tpTyping) return; } catch {}

    // Do not fight auto-scroll / catch-up if they are active
    try { (window as any).__scrollCtl?.stopAutoCatchup?.(); } catch {}
    try { (window as any).stopAutoScroll?.(); } catch {}

    const key = e.key;
    // Optional pedal mapping: F13/F14 as ArrowUp/ArrowDown
    const isPedalUp = enableF && (e.code === 'F13');
    const isPedalDown = enableF && (e.code === 'F14');

    if (key === 'ArrowUp' || isPedalUp) {
      e.preventDefault();
      e.shiftKey ? stepBlockFn(-1) : stepLinesFn(-1);
    } else if (key === 'ArrowDown' || isPedalDown) {
      e.preventDefault();
      e.shiftKey ? stepBlockFn(+1) : stepLinesFn(+1);
    } else if (key === 'PageUp') {
      e.preventDefault();
      stepLinesFn(-1, pageLinesN);
    } else if (key === 'PageDown') {
      e.preventDefault();
      stepLinesFn(+1, pageLinesN);
    } else if (key === 'Home') {
      const v = getViewer(); if (!v) return;
      v.scrollTop = 0;
    } else if (key === 'End') {
      const v = getViewer(); if (!v) return;
      v.scrollTop = Math.max(0, v.scrollHeight - v.clientHeight);
    }
  };

  function enable() {
    if (mode === 'on') return;
    mode = 'on';
    document.addEventListener('keydown', onKey, { capture: true });
  }

  function disable() {
    if (mode === 'off') return;
    mode = 'off';
    document.removeEventListener('keydown', onKey, { capture: true } as any);
  }

  // Optional tiny UI chips if host page doesn’t add them
  (function ensureButtons() {
    try {
      const bar = (document.getElementById('topbar') as HTMLElement) || document.querySelector('.topbar') || null;
      if (!bar || (bar as HTMLElement).querySelector('[data-step-ui]')) return;
      const wrap = document.createElement('div');
      wrap.setAttribute('data-step-ui', '1');
      (wrap as any).style.cssText = 'display:inline-flex;gap:.4rem;margin-left:.5rem;';
      const mkBtn = (label: string, dir: 1 | -1) => {
        const b = document.createElement('button');
        b.className = 'btn-chip';
        b.textContent = label;
        b.title = 'Click = 1 line; Shift+Click = 1 block';
        b.addEventListener('click', (ev) => ((ev as MouseEvent).shiftKey ? stepBlockFn(dir) : stepLinesFn(dir)));
        return b;
      };
      wrap.appendChild(mkBtn('▲ Step', -1));
      wrap.appendChild(mkBtn('▼ Step', +1));
      (bar as HTMLElement).appendChild(wrap);
    } catch {}
  })();

  // Expose for debug/tests
  try { (window as any).__tpStep = { enable, disable, stepLines: stepLinesFn, stepBlock: stepBlockFn }; } catch {}

  return { enable, disable, isEnabled: () => mode === 'on', stepLines: stepLinesFn, stepBlock: stepBlockFn };
}
