// scroll-router.ts
// Phase 3: UI/store/persistence wiring only. No engines, no scrolling.
import type { ScrollMode, ScrollBrain } from './scroll-brain';
import { createScrollBrain } from './scroll-brain';
import createModeRouter from './mode-router';
import createTimedEngine from './autoscroll';
import createWpmEngine from './wpm';
import createStepScrollEngine from './step-scroll';
import createRehearsalEngine from './rehearsal';
import createAsrAlignmentEngine from './asr-mode';

const isScrollDebug = (): boolean => {
  try {
    const w = window as any;
    if (w.__tpScrollDebug === true) return true;
    const qs = new URLSearchParams(location.search || '');
    return qs.has('scrollDebug');
  } catch {
    return false;
  }
};

type Store = {
  get?: (_k: string) => any;
  set?: (_k: string, _v: any) => void;
  subscribe?: (_k: string, _fn: (v: any) => void) => () => void;
};

const MODE_KEY = 'scrollMode';
const PREFS_KEY = 'tp_ui_prefs_v1';
const LEGACY_KEY = 'tp_scroll_mode';

let currentMode: ScrollMode = 'rehearsal';
let isScrollRunning = false;

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

function setControlVisibility(mode: ScrollMode): void {
  try {
    const autoRow = document.getElementById('autoSpeed')?.closest('.row') as HTMLElement | null;
    const wpmRow = document.getElementById('wpmRow') as HTMLElement | null;

    const show = (el: HTMLElement | null) => {
      if (!el) return;
      el.classList.remove('visually-hidden');
      el.removeAttribute('aria-hidden');
    };
    const hide = (el: HTMLElement | null) => {
      if (!el) return;
      el.classList.add('visually-hidden');
      el.setAttribute('aria-hidden', 'true');
    };

    // Default: hide both, then enable what we need per mode
    hide(autoRow);
    hide(wpmRow);

    switch (mode) {
      case 'timed':
        show(autoRow);
        break;
      case 'wpm':
      case 'hybrid':
        show(wpmRow);
        break;
      case 'asr':
      case 'step':
      case 'rehearsal':
      default:
        // keep both hidden
        break;
    }
  } catch {
    // best-effort only
  }
}

function updateUi(select: HTMLSelectElement | null, status: HTMLElement | null, mode: ScrollMode) {
  try {
    if (select) select.value = mode;
  } catch {}
  try {
    if (status) status.textContent = `Mode: ${formatModeLabel(mode)}`;
  } catch {}
  setControlVisibility(mode);

  // Update any passive mode labels (e.g., top-bar pill with data-scroll-mode-label)
  try {
    const pills = document.querySelectorAll<HTMLElement>('[data-scroll-mode-label]');
    pills.forEach((el) => {
      el.textContent = formatModeLabel(mode);
      el.setAttribute('data-mode', mode);
    });
  } catch {}
}

let modeRouterInstance: ReturnType<typeof createModeRouter> | null = null;
let brainInstance: ScrollBrain | null = null;
let enginesArmed = false;

const armEngines = (): void => {
  if (enginesArmed) return;
  enginesArmed = true;
  try {
    const desired = isScrollRunning ? currentMode : 'rehearsal';
    modeRouterInstance?.applyMode(desired);
  } catch {
    // ignore
  }
};

function emitScrollStatus(payload: {
  mode: ScrollMode;
  strategy: string;
  running: boolean;
  activeIdx?: number;
  lineCount?: number;
}) {
  try {
    (window as any).__tpScrollRunning = payload.running;
    window.dispatchEvent(new CustomEvent('tp:scroll:status', { detail: payload }));
  } catch {
    // ignore
  }
}

export function setScrollRunning(next: boolean): void {
  if (isScrollRunning === next) return;
  isScrollRunning = next;
  try {
    if (!enginesArmed && next) {
      armEngines();
    }
    const desired = enginesArmed && isScrollRunning ? currentMode : 'rehearsal';
    modeRouterInstance?.applyMode(desired);
    if (isScrollDebug()) {
      (window as any).HUD?.log?.('scroll-router', { tag: 'run-state', running: isScrollRunning, appliedMode: desired });
    }
  } catch {
    // ignore
  }
}

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
    const desired = enginesArmed && isScrollRunning ? mode : 'rehearsal';
    modeRouterInstance?.applyMode(desired);
    // Debug/diagnostic HUD log
    try {
      if (isScrollDebug()) {
        const strategy =
          mode === 'timed' ? 'timed' :
          mode === 'wpm' ? 'wpm' :
          mode === 'hybrid' ? 'hybrid-pll' :
          mode === 'asr' ? 'asr-lock' :
          mode === 'step' ? 'step' :
          mode === 'rehearsal' ? 'clamp' : 'unknown';
        (window as any).HUD?.log?.('scroll-router', { mode, appliedMode: desired, strategy, running: isScrollRunning });
      }
      emitScrollStatus({
        mode,
        strategy:
          mode === 'timed' ? 'timed' :
          mode === 'wpm' ? 'wpm' :
          mode === 'hybrid' ? 'hybrid-pll' :
          mode === 'asr' ? 'asr-lock' :
          mode === 'step' ? 'step' :
          mode === 'rehearsal' ? 'clamp' : 'unknown',
        running: isScrollRunning,
      });
    } catch {}
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

  // Arm engines once the session starts (start speech sync)
  try {
    window.addEventListener('tp:session:start', () => {
      try { armEngines(); } catch {}
      try { setScrollRunning(false); } catch {}
    }, { once: true });
  } catch {}

  // Start scroll when speech sync reports ready (post pre-roll)
  try {
    const onReady = () => {
      try {
        armEngines();
        setScrollRunning(true);
      } catch {}
    };
    window.addEventListener('tp:speechSync:ready', onReady);
    window.addEventListener('tp:preroll:done', onReady);
  } catch {}

  // Auto-start autoscroll after pre-roll in applicable modes by "clicking" the single owned toggle
  try {
    type PrerollDetail = { seconds?: number; source?: string };
    const isAutoCapable = (mode: string): boolean => {
      const m = (mode || '').toLowerCase();
      return m === 'timed' || m === 'wpm' || m === 'hybrid' || m === 'asr' || m === 'auto' || m === 'assist';
    };
    const getModeForPreroll = (): string => {
      try {
        const storeMode = (window as any).__tpStore?.get?.('scrollMode') || (window as any).__tpStore?.get?.('mode');
        if (storeMode) return String(storeMode);
      } catch {}
      try {
        const sel = document.getElementById('scrollMode') as HTMLSelectElement | null;
        if (sel && typeof sel.value === 'string') return sel.value;
      } catch {}
      return currentMode;
    };
    const handlePrerollDone = (_ev?: CustomEvent<PrerollDetail>) => {
      const mode = normalizeMode(getModeForPreroll());
      if (mode === 'rehearsal') return;
      if (!isAutoCapable(mode)) return;
      const btn = document.getElementById('autoToggle') as HTMLButtonElement | null;
      if (!btn) return;
      const pressed = btn.getAttribute('aria-pressed') === 'true';
      if (!pressed) {
        try { btn.click(); } catch {}
      }
    };
    window.addEventListener('tp:preroll:done', (ev: Event) => {
      try { handlePrerollDone(ev as CustomEvent<PrerollDetail>); } catch {}
    });
  } catch {}

  // Honor explicit auto intent (auto toggle) to start/stop running
  try {
    window.addEventListener('tp:autoIntent', (ev: Event) => {
      const detail = (ev as CustomEvent<{ on?: boolean; enabled?: boolean }>).detail || {};
      const on = detail.on ?? detail.enabled;
      if (typeof on === 'boolean') {
        setScrollRunning(on);
      }
    });
  } catch {}

  // Expose a small legacy-compatible surface so existing HUD/mode-chip readers see the new mode names
  try {
    (window as any).__tpScrollMode = {
      getMode: () => currentMode,
      setMode: (m: ScrollMode) => applyMode(m),
    };
  } catch {}

  // If some other part of the app fires tp:scrollModeChange, mirror the UI visibility
  try {
    window.addEventListener('tp:scrollModeChange', (ev: Event) => {
      const detail = (ev as CustomEvent<{ mode?: ScrollMode }>).detail;
      if (!detail || !detail.mode) return;
      const mode = normalizeMode(detail.mode);
      updateUi(select, status, mode);
    });
  } catch {}
}

export default initScrollRouter;

// Legacy export surface retained for existing callers
export function setMode(mode: ScrollMode): void {
  initScrollRouter();
  currentMode = normalizeMode(mode);
  try { modeRouterInstance?.applyMode(currentMode); } catch {}
}

export function getMode(): ScrollMode {
  initScrollRouter();
  return currentMode;
}
