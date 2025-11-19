// === Scroll Controller Core ===
import { SpeedGovernor, adaptSample, type AdaptSample } from '../controllers/adaptiveSpeed';
import { createScrollerHelpers } from './scroll-helpers';

export type ScrollMode = 'manual' | 'auto' | 'hybrid' | 'step' | 'rehearsal';

let scrollMode: ScrollMode = 'manual';
let scrollTimer: number | null = null;

// Previous constant per-frame speed (px/frame @ ~60fps)
const CONSTANT_SPEED = 2.4;
// Interpret that as a baseline px/sec (~144px/s)
const DEFAULT_PX_PER_SEC = CONSTANT_SPEED * 60;

const governor = new SpeedGovernor({
  basePxPerSec: DEFAULT_PX_PER_SEC,
  minPxPerSec: 20,
  maxPxPerSec: 3000,
  asrGain: 1,
  smoothing: 0.5,
});

let governedSpeedPxPerSec = governor.getSpeedPxPerSec();

function syncEngineSpeed() {
  governedSpeedPxPerSec = governor.getSpeedPxPerSec();
}

let frameCount = 0;

// Scroller helpers ensure we go through the scheduler + single-writer pipeline
const scroller = createScrollerHelpers(
  () => document.getElementById('viewer') as HTMLElement | null
);

// Optional HUD logging
const log = (msg: string) => {
  try {
    (window as any).HUD?.log?.('scroll-brain', msg);
  } catch {
    // silent
  }
};

let lastFrameTs = performance.now();

// --- Mode control ---
function setScrollMode(mode: ScrollMode) {
  if (scrollMode === mode) return;
  scrollMode = mode;
  log(`Scroll mode → ${mode}`);

  if (mode === 'manual' || mode === 'rehearsal' || mode === 'step') {
    stopScrollEngine();
  } else {
    startScrollEngine();
  }
}

// --- Loop control ---
function startScrollEngine() {
  if (scrollTimer !== null) return;
  lastFrameTs = performance.now();
  scrollTimer = requestAnimationFrame(scrollTick);
}

function stopScrollEngine() {
  if (scrollTimer === null) return;
  cancelAnimationFrame(scrollTimer);
  scrollTimer = null;
}

function scrollBySpeedPxPerSec(pxPerSec: number, dtSec: number) {
  if (!Number.isFinite(pxPerSec) || dtSec <= 0) return;
  const dy = pxPerSec * dtSec;
  try {
    scroller.scrollByPx(dy);
  } catch {
    try {
      window.scrollBy(0, dy);
    } catch {}
  }
}

function scrollTick(now?: number) {
  const ts = typeof now === 'number' ? now : performance.now();
  const dt = Math.max(0.001, (ts - lastFrameTs) / 1000);
  lastFrameTs = ts;

  frameCount++;

  if (scrollMode === 'auto' || scrollMode === 'hybrid') {
    scrollBySpeedPxPerSec(governedSpeedPxPerSec, dt);
  }

  if (frameCount % 10 === 0) {
    try {
      const y = typeof window.scrollY === 'number'
        ? window.scrollY
        : (document.documentElement?.scrollTop || 0);
      log(`scroll[${scrollMode}]: y=${y.toFixed(1)}`);
    } catch {}
  }

  if (scrollMode === 'auto' || scrollMode === 'hybrid') {
    scrollTimer = requestAnimationFrame(scrollTick);
  } else {
    scrollTimer = null;
  }
}

// --- Governor hooks ---
function setBaseSpeedPx(pxPerSec: number) {
  const numeric = Number(pxPerSec);
  if (!Number.isFinite(numeric) || numeric <= 0) return;
  governor.setBaseSpeedPx(numeric);
  syncEngineSpeed();
}

function onManualSpeedAdjust(deltaPxPerSec: number) {
  const delta = Number(deltaPxPerSec);
  if (!Number.isFinite(delta) || delta === 0) return;
  governor.nudge(delta);
  syncEngineSpeed();
}

function onSpeechSample(sample: AdaptSample) {
  if (!sample) return;
  const safe = {
    errPx: Number(sample.errPx) || 0,
    conf: typeof sample.conf === 'number' ? sample.conf : 1,
  } satisfies AdaptSample;
  const { speedPxPerSec } = adaptSample(governor, safe);
  governedSpeedPxPerSec = speedPxPerSec;
}

// --- Public API ---
export interface ScrollBrain {
  setMode: (_mode: ScrollMode) => void;
  getMode: () => ScrollMode;
  setBaseSpeedPx: (_pxPerSec: number) => void;
  onManualSpeedAdjust: (_deltaPxPerSec: number) => void;
  onSpeechSample: (_sample: AdaptSample) => void;
}

export function createScrollBrain(): ScrollBrain {
  return {
    setMode: setScrollMode,
    getMode: () => scrollMode,
    setBaseSpeedPx,
    onManualSpeedAdjust,
    onSpeechSample,
  };
}

