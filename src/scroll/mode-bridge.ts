import { getScrollBrain } from '../index';
import { appStore } from '../state/app-store';
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
      try { appStore.set?.('scrollMode', mode); } catch {}
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

    const select = document.getElementById('scrollMode') as HTMLSelectElement | null;
    const elements = select ? [select] : [];

    if (!elements.length) return;

    const storedMode = (() => {
      try {
        const storeMode = (window as any).__tpStore?.get?.('scrollMode');
        if (storeMode) return String(storeMode);
      } catch {}
      try { return localStorage.getItem('tp_scroll_mode_v1') || localStorage.getItem('scrollMode') || undefined; } catch { return undefined; }
    })();

    if (storedMode) {
      elements.forEach((el) => {
        try {
          if (Array.from(el.options).some((o) => o.value === storedMode)) {
            el.value = storedMode;
          }
        } catch {}
      });
    }

    elements.forEach((el) => wireElement(el, brain.setMode));
  } catch {}
}
