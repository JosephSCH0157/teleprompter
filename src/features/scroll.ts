import { setMode as setScrollMode, getMode as getScrollMode } from '../scroll/router';
import type { ScrollMode } from '../scroll/scroll-brain';
import * as Auto from './autoscroll';

function bindAutoControls() {
  try {
    const btn = document.getElementById('autoToggle');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        try { Auto.toggle(); } catch {}
      });
    }
  } catch {}
  try {
    const inputs = [
      document.getElementById('autoSpeed') as HTMLInputElement | null,
      document.getElementById('autoScrollSpeed') as HTMLInputElement | null,
    ].filter(Boolean) as HTMLInputElement[];

    inputs.forEach((input) => {
      if (input.dataset.bound) return;
      input.dataset.bound = '1';

      const apply = (val: string) => {
        const next = Number(val);
        if (!Number.isFinite(next)) return;
        Auto.setSpeed(next);
      };

      input.addEventListener('change', (e) => {
        const tgt = e.target as HTMLInputElement | null;
        if (!tgt) return;
        apply(tgt.value);
      });

      input.addEventListener('input', (e) => {
        const tgt = e.target as HTMLInputElement | null;
        if (!tgt) return;
        apply(tgt.value);
      }, { passive: true });
    });
  } catch {}
}

function bindRouterControls() {
  try {
    const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
    if (sel && !sel.dataset.bound) {
      sel.dataset.bound = '1';
      sel.value = (getScrollMode() || '').toLowerCase();
      sel.addEventListener('change', () => {
        const mode = ((sel.value || '').toLowerCase() as ScrollMode);
        setScrollMode(mode);
      });
    }
  } catch {}
}

export function initScrollFeature() {
  bindAutoControls();
  bindRouterControls();
}

// Back-compat alias kept for legacy callers
export const initScroll = initScrollFeature;
