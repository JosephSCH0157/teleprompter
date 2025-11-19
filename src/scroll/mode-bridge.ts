import { getScrollBrain } from '../index';
import type { ScrollMode } from './scroll-brain';

function resolveModeFromValue(value: string): ScrollMode {
  switch ((value || '').toLowerCase()) {
    case 'auto':
    case 'wpm':
      return 'auto';
    case 'hybrid':
      return 'hybrid';
    case 'step':
      return 'step';
    case 'rehearsal':
      return 'rehearsal';
    default:
      return 'manual';
  }
}

function wireElement(el: HTMLSelectElement, setMode: (mode: ScrollMode) => void) {
  if ((el as any)._tpScrollModeWired) return;
  (el as any)._tpScrollModeWired = true;

  const handler = () => {
    try {
      const mode = resolveModeFromValue(el.value);
      setMode(mode);
    } catch {}
  };

  el.addEventListener('change', handler, { capture: true });

  // Initial sync using current element value
  handler();
}

export function initScrollModeBridge(): void {
  try {
    const brain = getScrollBrain();
    if (!brain) return;

    const selectPrimary = document.getElementById('scrollModeSelect') as HTMLSelectElement | null;
    const selectInline = document.getElementById('scrollMode') as HTMLSelectElement | null;
    const elements = [selectPrimary, selectInline].filter(Boolean) as HTMLSelectElement[];

    if (!elements.length) return;

    elements.forEach((el) => wireElement(el, brain.setMode));
  } catch {}
}
