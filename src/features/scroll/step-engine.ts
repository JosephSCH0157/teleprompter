import { getScrollerEl } from '../../scroll/scroller';

function fallbackStep(deltaFactor = 0.9, sign: 1 | -1) {
  const viewer = getScrollerEl('main');
  const scroller = (viewer || getScrollerEl('display')) as HTMLElement | null;
  if (!scroller) return;
  const viewport =
    viewer?.clientHeight || window.innerHeight || scroller.clientHeight || 800;
  const delta = viewport * deltaFactor * sign;
  if (viewer) {
    const max = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
    const next = Math.max(0, Math.min(viewer.scrollTop + delta, max));
    viewer.scrollTop = next;
    return;
  }
  scroller.scrollTop += delta;
}

let enabled = false;

function isStepModeActive(): boolean {
  try {
    const store = (window as any).__tpStore;
    const mode =
      store?.get?.('scrollMode') ?? (window as any).__tpScrollMode?.getMode?.();
    return String(mode || '').toLowerCase() === 'step';
  } catch {
    return false;
  }
}

function ensureStepEnabled(step: any): void {
  try {
    if (step?.isEnabled && !step.isEnabled()) step.enable?.();
  } catch {}
}

export const stepEngine = {
  setEnabled(on: boolean) {
    enabled = !!on;
    try {
      const step = (window as any).__tpStep;
      if (on) step?.enable?.();
      else step?.disable?.();
    } catch {}
  },
};

export function stepNext() {
  if (!enabled && !isStepModeActive()) return;
  const step = (window as any).__tpStep;
  try {
    ensureStepEnabled(step);
    if (step?.stepBlock) return step.stepBlock(+1);
    if (step?.stepLines) return step.stepLines(+1);
  } catch {}
  fallbackStep(0.9, +1);
}

export function stepPrev() {
  if (!enabled && !isStepModeActive()) return;
  const step = (window as any).__tpStep;
  try {
    ensureStepEnabled(step);
    if (step?.stepBlock) return step.stepBlock(-1);
    if (step?.stepLines) return step.stepLines(-1);
  } catch {}
  fallbackStep(0.9, -1);
}
