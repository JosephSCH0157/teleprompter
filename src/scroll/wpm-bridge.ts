import { wpmToPxPerSec } from './wpmSpeed';

export type ScrollSpeedApi = {
  setBaseSpeedPx(pxPerSec: number): void;
  onManualSpeedAdjust(deltaPxPerSec: number): void;
};

export interface WpmBridgeOptions {
  api: ScrollSpeedApi;
  mainInputId?: string;
  settingsInputId?: string;
}

const DEFAULT_MAIN_ID = 'wpmTarget';
const DEFAULT_SETTINGS_ID = 'settingsWpmTarget';

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

function bindInput(input: HTMLInputElement, api: ScrollSpeedApi) {
  if (wiredInputs.has(input)) return;
  const apply = () => {
    const wpm = clampWpm(parseInt(input.value, 10));
    const pxPerSec = wpmToPxPerSec(wpm, 'main');
    if (!Number.isFinite(pxPerSec) || pxPerSec <= 0) return;
    api.setBaseSpeedPx(pxPerSec);
    if (wpm > 0) persistWpm(wpm);
    try {
      if (typeof window !== 'undefined') {
        const detail = { wpm, pxPerSec };
        window.dispatchEvent(new CustomEvent('tp:wpm:change', { detail }));
      }
    } catch {
      /* ignore */
    }
  };

  input.addEventListener('input', apply, { passive: true });
  if (typeof window !== 'undefined') {
    window.addEventListener('tp:typographyChanged', apply);
  }

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

function tryWireInputs(ids: string[], api: ScrollSpeedApi) {
  if (typeof document === 'undefined') return;
  ids.forEach((id) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) bindInput(el, api);
  });
}

function seedFromStorage(api: ScrollSpeedApi) {
  const stored = readStoredWpm();
  if (!stored || stored <= 0) return;
  const pxPerSec = wpmToPxPerSec(stored, 'main');
  if (!Number.isFinite(pxPerSec) || pxPerSec <= 0) return;
  api.setBaseSpeedPx(pxPerSec);
}

export function installWpmSpeedBridge(options: WpmBridgeOptions) {
  if (bridgeInstalled) return;
  bridgeInstalled = true;

  const {
    api,
    mainInputId = DEFAULT_MAIN_ID,
    settingsInputId = DEFAULT_SETTINGS_ID,
  } = options;

  const inputIds = [mainInputId, settingsInputId];

  seedFromStorage(api);

  const schedule = () => {
    tryWireInputs(inputIds, api);
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => schedule(), { once: true });
    } else {
      schedule();
    }

    const observer = new MutationObserver(() => {
      tryWireInputs(inputIds, api);
      const haveMain = document.getElementById(mainInputId);
      const haveSettings = document.getElementById(settingsInputId);
      if (haveMain && haveSettings) {
        try { observer.disconnect(); } catch {}
      }
    });
    try { observer.observe(document.body, { childList: true, subtree: true }); } catch {}

    window.addEventListener('tp:settings:open', schedule, { passive: true });
    document.addEventListener('tp:feature:init', schedule as EventListener, { capture: true });

    const handleAutoSpeed = (ev: Event) => {
      const detail = (ev as CustomEvent).detail || {};
      let delta = 0;
      if (typeof detail.deltaPx === 'number') delta = detail.deltaPx;
      else if (typeof detail.delta === 'number') delta = detail.delta;
      else if (typeof detail.stepPx === 'number') delta = detail.stepPx;
      if (!delta || !Number.isFinite(delta)) return;
      api.onManualSpeedAdjust(delta);
    };

    window.addEventListener('tp:autoSpeed', handleAutoSpeed as EventListener, { passive: true });
  }
}
