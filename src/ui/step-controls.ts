import { stepNext, stepPrev } from '../features/scroll/step-engine';

export function initStepControls(root: Document | HTMLElement = document): void {
  const prev = root.querySelector<HTMLButtonElement>('#stepPrevBtn');
  const next = root.querySelector<HTMLButtonElement>('#stepNextBtn');

  prev?.addEventListener('click', () => stepPrev());
  next?.addEventListener('click', () => stepNext());
}
