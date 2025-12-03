import type { ScrollBrain, ScrollMode } from './scroll-brain';

type ToggleEngine = { enable: () => void; disable: () => void };
type StepEngine = { enablePrimary: () => void; enableHelper: () => void; disable: () => void };
type ClampEngine = { enableClamp: () => void; disableClamp: () => void };
type Store = { get?: (_k: string) => any; subscribe?: (_k: string, _fn: (v: any) => void) => () => void };

export type ModeRouterOptions = {
  brain: ScrollBrain;
  store?: Store | null;
  autoscroll?: ToggleEngine;
  wpm?: ToggleEngine;
  asr?: ToggleEngine;
  step?: StepEngine;
  rehearsal?: ClampEngine;
  legacyGuard?: (_on: boolean) => void;
  onModeChange?: (_mode: ScrollMode) => void;
  log?: (_msg: string) => void;
};

export type ModeRouter = {
  setMode: (_mode: ScrollMode) => void;
  dispose: () => void;
};

const normalizeMode = (mode: ScrollMode): ScrollMode => {
  // Accept legacy aliases; map to the canonical matrix modes.
  if (mode === 'auto') return 'timed';
  if (mode === 'manual' || mode === 'off') return 'rehearsal';
  return mode;
};

export function createModeRouter(opts: ModeRouterOptions): ModeRouter {
  const {
    brain,
    store = null,
    autoscroll,
    wpm,
    asr,
    step,
    rehearsal,
    legacyGuard,
    onModeChange,
    log = () => {},
  } = opts;

  const disableAll = () => {
    try { autoscroll?.disable(); } catch {}
    try { wpm?.disable(); } catch {}
    try { asr?.disable(); } catch {}
    try { step?.disable(); } catch {}
    try { rehearsal?.disableClamp(); } catch {}
    try { brain.stopEngine(); } catch {}
  };

  const applyMode = (nextMode: ScrollMode) => {
    const mode = normalizeMode(nextMode);
    disableAll();
    try { legacyGuard?.(true); } catch {}
    try { brain.setMode(mode); } catch {}

    switch (mode) {
      case 'timed':
        try { autoscroll?.enable(); } catch {}
        try { brain.startEngine(); } catch {}
        try { step?.enableHelper(); } catch {}
        break;
      case 'wpm':
        try { wpm?.enable(); } catch {}
        try { brain.startEngine(); } catch {}
        try { step?.enableHelper(); } catch {}
        break;
      case 'asr':
        try { asr?.enable(); } catch {}
        try { step?.enableHelper(); } catch {}
        break;
      case 'hybrid':
        try { wpm?.enable(); } catch {}
        try { asr?.enable(); } catch {}
        try { brain.startEngine(); } catch {}
        try { step?.enableHelper(); } catch {}
        break;
      case 'step':
        try { step?.enablePrimary(); } catch {}
        break;
      case 'rehearsal':
        try { rehearsal?.enableClamp(); } catch {}
        break;
      default:
        // Unknown -> safest: everything off + clamp if present
        try { rehearsal?.enableClamp(); } catch {}
        break;
    }

    try { onModeChange?.(mode); } catch {}
    try { log(`mode-router → ${mode}`); } catch {}
  };

  let unsubscribe: (() => void) | null = null;
  if (store?.subscribe) {
    try {
      unsubscribe = store.subscribe('scrollMode', (v: any) => {
        const m = typeof v === 'string' ? (v as ScrollMode) : 'rehearsal';
        applyMode(m);
      });
    } catch {}
  }

  return {
    setMode: applyMode,
    dispose: () => {
      try { unsubscribe?.(); } catch {}
      disableAll();
    },
  };
}

export default createModeRouter;
