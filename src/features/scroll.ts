import { setMode as setScrollMode, getMode as getScrollMode } from '../scroll/router';
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
    const input = document.getElementById('autoSpeed') as HTMLInputElement | null;
    if (input && !input.dataset.bound) {
      input.dataset.bound = '1';
      input.addEventListener('change', (e) => {
        const tgt = e.target as HTMLInputElement | null;
        if (!tgt) return;
        const next = Number(tgt.value);
        Auto.setSpeed(next);
      });
    }
  } catch {}
}

function bindRouterControls() {
  try {
    const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
    if (sel && !sel.dataset.bound) {
      sel.dataset.bound = '1';
      sel.value = (getScrollMode() || '').toLowerCase();
      sel.addEventListener('change', () => {
        const mode = (sel.value || '').toLowerCase();
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
