import { stepNext, stepPrev } from '../features/scroll/step-engine';

export function initStepControls(root: Document | HTMLElement = document): void {
  const prev = root.querySelector<HTMLButtonElement>('#stepPrevBtn');
  const next = root.querySelector<HTMLButtonElement>('#stepNextBtn');

  if (prev && prev.dataset.stepWired !== '1') {
    prev.dataset.stepWired = '1';
    prev.addEventListener('click', () => stepPrev());
  }
  if (next && next.dataset.stepWired !== '1') {
    next.dataset.stepWired = '1';
    next.addEventListener('click', () => stepNext());
  }
}
