import type { ScrollBrain } from './scroll-brain';
import { wpmToPxPerSec } from './wpmSpeed';

type BrainGetter = () => ScrollBrain | undefined;

const INPUT_IDS = ['wpmTarget', 'settingsWpmTarget'] as const;
const wiredInputs = new WeakSet<HTMLInputElement>();
let bridgeInstalled = false;

function readStoredWpm(): number | null {
  const keys = ['tp_baseline_wpm', 'tp_wpm_target'];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const val = parseInt(raw, 10);
      if (Number.isFinite(val) && val > 0) {
        return val;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function persistWpm(wpm: number) {
  try { localStorage.setItem('tp_baseline_wpm', String(wpm)); } catch {}
  try { localStorage.setItem('tp_wpm_target', String(wpm)); } catch {}
}

function clampWpm(wpm: number) {
  if (!Number.isFinite(wpm)) return 0;
  return Math.max(0, Math.min(400, Math.round(wpm)));
}

function bindInput(input: HTMLInputElement, getBrain: BrainGetter) {
  if (wiredInputs.has(input)) return;
  const apply = () => {
    const brain = getBrain();
    if (!brain) return;
    const wpm = clampWpm(parseInt(input.value, 10));
    const pxPerSec = wpmToPxPerSec(wpm, 'main');
    brain.setBaseSpeedPx(pxPerSec);
    if (brain.getMode() === 'auto' || brain.getMode() === 'hybrid') {
      brain.onManualSpeedAdjust(pxPerSec);
    }
    if (wpm > 0) persistWpm(wpm);
  };

  input.addEventListener('input', apply, { passive: true });
  window.addEventListener('tp:typographyChanged', apply);

  try {
    if (input.value) {
      apply();
    } else {
      const stored = readStoredWpm();
      if (stored && stored > 0) {
        input.value = String(stored);
        apply();
      }
    }
  } catch {
    /* ignore */
  }

  wiredInputs.add(input);
}

function tryWireInputs(getBrain: BrainGetter) {
  if (typeof document === 'undefined') return;
  INPUT_IDS.forEach((id) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) bindInput(el, getBrain);
  });
}

function seedFromStorage(getBrain: BrainGetter) {
  const brain = getBrain();
  if (!brain) return;
  const stored = readStoredWpm();
  if (!stored || stored <= 0) return;
  brain.setBaseSpeedPx(wpmToPxPerSec(stored, 'main'));
}

export function installWpmSpeedBridge(getBrain: BrainGetter) {
  if (bridgeInstalled) return;
  bridgeInstalled = true;

  seedFromStorage(getBrain);

  const schedule = () => {
    tryWireInputs(getBrain);
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => schedule(), { once: true });
    } else {
      schedule();
    }

    const observer = new MutationObserver(() => {
      tryWireInputs(getBrain);
      const haveMain = document.getElementById('wpmTarget');
      const haveSettings = document.getElementById('settingsWpmTarget');
      if (haveMain && haveSettings) {
        try { observer.disconnect(); } catch {}
      }
    });
    try { observer.observe(document.body, { childList: true, subtree: true }); } catch {}

    window.addEventListener('tp:settings:open', schedule, { passive: true });
    document.addEventListener('tp:feature:init', schedule as EventListener, { capture: true });
  }
}
