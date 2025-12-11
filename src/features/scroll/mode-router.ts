// src/features/scroll/mode-router.ts
// Central router that turns engines on/off based on scrollMode + session state.

export type ScrollMode = 'timed' | 'wpm' | 'hybrid' | 'asr' | 'step' | 'rehearsal' | 'auto';

export interface SessionState {
  state: 'idle' | 'preroll' | 'live' | 'stopping' | 'stopped';
  scrollAutoOnLive: boolean;
}

// Engines are deliberately loose so we can adapt to existing shapes.
export interface AutoEngine {
  setEnabled?(enabled: boolean): void;
  start?(): void;
  stop?(): void;
  setMode?(mode: ScrollMode): void;
}

export interface SimpleEngine {
  setEnabled?(enabled: boolean): void;
  enable?(): void;
  disable?(): void;
  start?(): void;
  stop?(): void;
  isActive?(): boolean;
}

export interface SessionSource {
  get(): SessionState;
  subscribe(cb: (sess: SessionState) => void): void;
}

export interface ScrollModeSource {
  get(): ScrollMode;
  subscribe(cb: (mode: ScrollMode) => void): void;
}

export interface ModeRouterDeps {
  auto: AutoEngine | null;
  asr: SimpleEngine | null;
  step: SimpleEngine | null;
  session: SessionSource;
  scrollMode: ScrollModeSource;
}

let currentMode: ScrollMode = 'hybrid';
let currentSession: SessionState = { state: 'idle', scrollAutoOnLive: false };

let autoEngine: AutoEngine | null = null;
let asrEngine: SimpleEngine | null = null;
let stepEngine: SimpleEngine | null = null;

let lastAuto = false;
let lastAsr = false;
let lastStep = false;

function shouldAutoRun(mode: ScrollMode, sess: SessionState): boolean {
  if (sess.state !== 'live') return false;
  if (!sess.scrollAutoOnLive) return false;
  // Auto engine drives px/s in these modes only.
  if (mode === 'timed' || mode === 'wpm' || mode === 'hybrid' || mode === 'auto') return true;
  return false;
}

function shouldAsrRun(mode: ScrollMode, sess: SessionState): boolean {
  if (sess.state !== 'live') return false;
  return mode === 'hybrid' || mode === 'asr';
}

function shouldStepRun(mode: ScrollMode, sess: SessionState): boolean {
  if (sess.state !== 'live') return false;
  return mode === 'step';
}

function applySimpleEngine(engine: SimpleEngine | null, enabled: boolean, last: boolean): boolean {
  if (!engine || enabled === last) return enabled;

  if (engine.setEnabled) {
    engine.setEnabled(enabled);
  } else if (enabled) {
    (engine.enable || engine.start || (() => {})).call(engine);
  } else {
    (engine.disable || engine.stop || (() => {})).call(engine);
  }

  return enabled;
}

function syncEngines() {
  const mode = currentMode;
  const sess = currentSession;

  const wantAuto = shouldAutoRun(mode, sess);
  const wantAsr = shouldAsrRun(mode, sess);
  const wantStep = shouldStepRun(mode, sess);

  if (autoEngine) {
    if (autoEngine.setMode) {
      autoEngine.setMode(mode);
    }
    if (wantAuto !== lastAuto) {
      if (autoEngine.setEnabled) {
        autoEngine.setEnabled(wantAuto);
      } else if (wantAuto) {
        autoEngine.start && autoEngine.start();
      } else {
        autoEngine.stop && autoEngine.stop();
      }
      lastAuto = wantAuto;
    }
  }

  lastAsr = applySimpleEngine(asrEngine, wantAsr, lastAsr);
  lastStep = applySimpleEngine(stepEngine, wantStep, lastStep);
}

export function initScrollModeRouter(deps: ModeRouterDeps) {
  autoEngine = deps.auto;
  asrEngine = deps.asr;
  stepEngine = deps.step;

  currentMode = deps.scrollMode.get();
  currentSession = deps.session.get();

  syncEngines();

  deps.scrollMode.subscribe((mode) => {
    if (!mode) return;
    currentMode = mode;
    syncEngines();
  });

  deps.session.subscribe((sess) => {
    currentSession = sess;
    syncEngines();
  });
}

// Back-compat wrapper for older call sites/tests expecting a router object.
export interface ScrollModeRouter {
  setMode(next: ScrollMode): void;
  getMode(): ScrollMode;
  dispose(): void;
}

export interface LegacyStoreLike {
  subscribe?(key: string, cb: (value: unknown) => void): () => void;
  get?(key: string): unknown;
  set?(key: string, value: unknown): void;
}

export interface LegacyDeps {
  store?: LegacyStoreLike | null;
  storeKey?: string;
  auto?: AutoEngine | null;
  step?: SimpleEngine | null;
  rehearsal?: SimpleEngine | null; // ignored in new router
  log?: (msg: string) => void;
}

export function createScrollModeRouter(deps: LegacyDeps): ScrollModeRouter {
  const store = deps.store || null;
  const key = deps.storeKey || 'scrollMode';
  let currentMode: ScrollMode = 'hybrid';
  const rehearsal = deps.rehearsal || null;

  const scrollModeSource: ScrollModeSource = {
    get(): ScrollMode {
      const raw = String(store?.get?.(key) ?? '').trim().toLowerCase();
      if (raw === 'auto') return 'auto';
      const allowed: ScrollMode[] = ['timed', 'wpm', 'hybrid', 'asr', 'step', 'rehearsal'];
      return allowed.includes(raw as ScrollMode) ? (raw as ScrollMode) : 'hybrid';
    },
    subscribe(cb: (mode: ScrollMode) => void) {
      store?.subscribe?.(key, () => cb(this.get()));
    },
  };

  const sessionSource: SessionSource = {
    get(): SessionState {
      return {
        state: 'live', // legacy wrapper assumes live to mirror previous behavior
        scrollAutoOnLive: true,
      };
    },
    subscribe(cb: (sess: SessionState) => void) {
      // legacy wrapper: no session subscriptions
      void cb;
    },
  };

  initScrollModeRouter({
    auto: deps.auto || null,
    asr: null,
    step: deps.step || null,
    session: sessionSource,
    scrollMode: scrollModeSource,
  });

  // Handle rehearsal enable/disable for legacy callers
  const syncRehearsal = (mode: ScrollMode) => {
    if (!rehearsal) return;
    const wants = mode === 'rehearsal';
    const on = rehearsal.isActive ? !!rehearsal.isActive() : false;
    if (wants && !on) rehearsal.enable?.();
    if (!wants && on) rehearsal.disable?.();
  };

  currentMode = scrollModeSource.get();
  syncRehearsal(currentMode);
  store?.subscribe?.(key, (v: unknown) => {
    const next = scrollModeSource.get();
    currentMode = next;
    syncRehearsal(next);
  });

  return {
    setMode(next: ScrollMode) {
      try { store?.set?.(key, next); } catch {}
    },
    getMode() {
      return currentMode;
    },
    dispose() {
      // no-op placeholder to satisfy legacy signature
    },
  };
}
