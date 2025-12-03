// scroll-router.ts
// Phase 3: UI/store/persistence wiring only. No engines, no scrolling.
import type { ScrollMode, ScrollBrain } from './scroll-brain';
import { createScrollBrain } from './scroll-brain';
import { createModeRouter, type ModeRouter } from './mode-router';
import createTimedEngine from './autoscroll';
import createWpmEngine from './wpm';
import createStepScrollEngine from './step-scroll';
import createRehearsalEngine from './rehearsal';
import createAsrAlignmentEngine from './asr-mode';

type Store = {
  get?: (_k: string) => any;
  set?: (_k: string, _v: any) => void;
  subscribe?: (_k: string, _fn: (v: any) => void) => () => void;
};

const MODE_KEY = 'scrollMode';
const PREFS_KEY = 'tp_ui_prefs_v1';
const LEGACY_KEY = 'tp_scroll_mode';

let currentMode: ScrollMode = 'rehearsal';

const normalizeMode = (mode: string | null | undefined): ScrollMode => {
  const m = String(mode || '').trim().toLowerCase() as ScrollMode;
  if (m === 'auto') return 'timed';
  if (m === 'manual' || m === 'off') return 'rehearsal';
  if (m === 'timed' || m === 'wpm' || m === 'hybrid' || m === 'asr' || m === 'step' || m === 'rehearsal') return m;
  return 'rehearsal';
};

function getStore(): Store | null {
  try { return (window as any).__tpStore || null; } catch { return null; }
}

function readPrefs(): Record<string, any> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writePrefs(mode: ScrollMode): void {
  try {
    const prefs = readPrefs();
    prefs[MODE_KEY] = mode;
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

function readInitialMode(store: Store | null): ScrollMode {
  try {
    const fromStore = store?.get?.(MODE_KEY);
    if (fromStore) return normalizeMode(fromStore);
  } catch {}
  try {
    const prefs = readPrefs();
    if (prefs && prefs[MODE_KEY]) return normalizeMode(prefs[MODE_KEY]);
  } catch {}
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return normalizeMode(legacy);
  } catch {}
  return 'rehearsal';
}

function formatModeLabel(mode: ScrollMode): string {
  switch (mode) {
    case 'timed':
      return 'Timed';
    case 'wpm':
      return 'WPM';
    case 'hybrid':
      return 'Hybrid';
    case 'asr':
      return 'ASR';
    case 'step':
      return 'Step';
    case 'rehearsal':
      return 'Rehearsal';
    default:
      return 'Manual';
  }
}

function updateUi(select: HTMLSelectElement | null, status: HTMLElement | null, mode: ScrollMode) {
  try {
    if (select) select.value = mode;
  } catch {}
  try {
    if (status) status.textContent = `Mode: ${formatModeLabel(mode)}`;
  } catch {}
}

let modeRouterInstance: ModeRouter | null = null;
let brainInstance: ScrollBrain | null = null;

export function initScrollRouter(): void {
  try {
    if ((window as any).__tp_scrollRouterInited) return;
    (window as any).__tp_scrollRouterInited = true;
    (window as any).__tp_legacy_scroll_disabled = true; // neutralize legacy JS
  } catch {}

  const store = getStore();
  brainInstance = createScrollBrain();
  const timedEngine = createTimedEngine(brainInstance);
  const wpmEngine = createWpmEngine(brainInstance);
  const stepEngine = createStepScrollEngine();
  const rehearsalEngine = createRehearsalEngine();
  const asrEngine = createAsrAlignmentEngine(brainInstance, () => []);

  modeRouterInstance = createModeRouter({
    scrollBrain: brainInstance,
    timedEngine,
    wpmEngine,
    asrEngine,
    stepEngine,
    rehearsalEngine,
  });

  const select = document.getElementById('scrollMode') as HTMLSelectElement | null;
  const status = document.getElementById('scrollModeStatus') as HTMLElement | null;

  const applyMode = (next: ScrollMode) => {
    const mode = normalizeMode(next);
    currentMode = mode;
    try { store?.set?.(MODE_KEY, mode); } catch {}
    writePrefs(mode);
    updateUi(select, status, mode);
    modeRouterInstance?.applyMode(mode);
    // Broadcast for any legacy or passive UI (mode chip, auto controls)
    try {
      window.dispatchEvent(new CustomEvent('tp:scrollModeChange', { detail: { mode } }));
    } catch {}
  };

  // UI -> store
  try {
    if (select && !select.dataset.wired) {
      select.dataset.wired = '1';
      select.addEventListener('change', () => {
        try { applyMode(normalizeMode(select.value)); } catch {}
      });
    }
  } catch {}

  // store -> UI
  try {
    const unsub = store?.subscribe?.(MODE_KEY, (v: any) => {
      try { applyMode(normalizeMode(v)); } catch {}
    });
    (window as any).__tp_scrollRouterUnsub = unsub;
  } catch {}

  // initial mode
  applyMode(readInitialMode(store));
}

export default initScrollRouter;

// Legacy export surface retained for existing callers
export function setMode(mode: ScrollMode): void {
  initScrollRouter();
  currentMode = normalizeMode(mode);
  try { modeRouterInstance?.setMode(currentMode); } catch {}
}

export function getMode(): ScrollMode {
  initScrollRouter();
  return currentMode;
}
