// Show/hide any elements tagged as step-only based on scrollMode in the store.
import { appStore } from '../state/app-store';

export function bindStepControlsVisibility(): void {
  const stepEls = Array.from(
    document.querySelectorAll<HTMLElement>('[data-step-only]'),
  );
  if (!stepEls.length) return;

  const apply = (mode: string | undefined) => {
    const show = mode === 'step';
    stepEls.forEach((el) => {
      el.style.display = show ? '' : 'none';
    });
  };

  try {
    const initial = appStore.get?.('scrollMode') as string | undefined;
    apply(initial);
  } catch {
    // ignore
  }

  try {
    appStore.subscribe('scrollMode', (mode) => apply(mode as string | undefined));
  } catch {
    // ignore
  }
}

// Auto-bind on import
try {
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        try { bindStepControlsVisibility(); } catch {}
      }, { once: true });
    } else {
      bindStepControlsVisibility();
    }
  }
} catch {
  // ignore
}
