import type { DisplayId } from '../settings/schema';
import { isMaxChManual } from '../settings/typographyStore';

type AutoMaxChOptions = {
  win?: Window;
  display?: DisplayId;
};

function getRootFontPx(doc: Document): number {
  try {
    const root = doc.documentElement;
    const cs = getComputedStyle(root);
    const fromVar = parseFloat(cs.getPropertyValue('--tp-font-size'));
    const fromRoot = parseFloat(cs.fontSize);
    const n = Number.isFinite(fromVar) && fromVar > 0 ? fromVar : fromRoot;
    if (Number.isFinite(n) && n > 0) return n;
  } catch {}
  return 16;
}

function computeMaxCh(win: Window): number {
  const vw = Math.max(320, win.innerWidth || 0);
  const rootFont = getRootFontPx(win.document);
  const approxChPx = rootFont * 0.62;
  if (!Number.isFinite(approxChPx) || approxChPx <= 0) return 95;
  const ch = Math.floor(vw / approxChPx);
  return Math.min(160, Math.max(60, ch));
}

export function applyAutoMaxCh(opts: AutoMaxChOptions = {}): void {
  const win = opts.win || window;
  const display = opts.display || 'main';
  if (isMaxChManual(display)) return;
  try {
    const ch = computeMaxCh(win);
    win.document.documentElement.style.setProperty('--tp-maxch', String(ch));
  } catch {}
}

export function installAutoMaxCh(opts: AutoMaxChOptions = {}): () => void {
  const win = opts.win || window;
  const display = opts.display || 'main';
  let raf = 0;

  const schedule = () => {
    if (isMaxChManual(display)) return;
    if (raf) win.cancelAnimationFrame(raf);
    raf = win.requestAnimationFrame(() => applyAutoMaxCh({ win, display }));
  };

  schedule();
  const onResize = () => schedule();
  const onTypography = () => schedule();

  win.addEventListener('resize', onResize, { passive: true });
  win.addEventListener('tp:typographyChanged', onTypography as EventListener);
  win.addEventListener('tp:lineMetricsDirty', onTypography as EventListener);

  return () => {
    win.removeEventListener('resize', onResize);
    win.removeEventListener('tp:typographyChanged', onTypography as EventListener);
    win.removeEventListener('tp:lineMetricsDirty', onTypography as EventListener);
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
  };
}
