function fallbackStep(deltaFactor = 0.9, sign: 1 | -1) {
  const scroller = (document.scrollingElement ||
    document.documentElement ||
    document.body) as HTMLElement;
  const viewport = window.innerHeight || scroller.clientHeight || 800;
  const delta = viewport * deltaFactor * sign;
  scroller.scrollTop += delta;
}

let enabled = false;

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
  if (!enabled) return;
  const step = (window as any).__tpStep;
  try {
    if (step?.stepBlock) return step.stepBlock(+1);
    if (step?.stepLines) return step.stepLines(+1);
  } catch {}
  fallbackStep(0.9, +1);
}

export function stepPrev() {
  if (!enabled) return;
  const step = (window as any).__tpStep;
  try {
    if (step?.stepBlock) return step.stepBlock(-1);
    if (step?.stepLines) return step.stepLines(-1);
  } catch {}
  fallbackStep(0.9, -1);
}
