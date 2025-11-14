// === Scroll Controller Core ===
export type ScrollMode = 'manual' | 'auto' | 'hybrid' | 'step' | 'rehearsal';

let scrollMode: ScrollMode = 'manual';
let scrollTimer: number | null = null;

// Tune later: px per frame at 60fps ⇒ ~144 px/sec
const CONSTANT_SPEED = 2.4;

let frameCount = 0;

// Optional HUD logging
const log = (msg: string) => {
  try {
    (window as any).HUD?.log?.('scroll-brain', msg);
  } catch {
    // silent
  }
};

// --- Mode control ---
function setScrollMode(mode: ScrollMode) {
  if (scrollMode === mode) return;
  scrollMode = mode;
  log(`Scroll mode → ${mode}`);

  // Only the brain decides whether the engine should run.
  if (mode === 'manual' || mode === 'rehearsal') {
    stopScrollEngine();
  } else {
    startScrollEngine();
  }
}

// --- Loop control ---
function startScrollEngine() {
  if (scrollTimer !== null) return; // already running
  scrollTimer = requestAnimationFrame(scrollTick);
}

function stopScrollEngine() {
  if (scrollTimer === null) return;
  cancelAnimationFrame(scrollTimer);
  scrollTimer = null;
}

// --- Scroll behavior ---
function scrollTick() {
  frameCount++;

  if (scrollMode === 'auto') {
    scrollBySpeed(CONSTANT_SPEED);
  } else if (scrollMode === 'hybrid') {
    applyHybridScroll();
  } else if (scrollMode === 'step') {
    // In step mode the engine can either:
    //   a) stay off and step is purely discrete, or
    //   b) enforce a target Y if we ever add easing.
    // For now, step is fully discrete; no per-frame work needed.
    // So we can no-op here.
  }

  if (frameCount % 10 === 0) {
    log(`scroll[${scrollMode}]: y=${window.scrollY.toFixed(1)}`);
  }

  // Only keep ticking when a mode that uses the engine is active
  if (scrollMode === 'auto' || scrollMode === 'hybrid') {
    scrollTimer = requestAnimationFrame(scrollTick);
  } else {
    scrollTimer = null;
  }
}

// --- Simple auto scroll ---
function scrollBySpeed(speed: number) {
  window.scrollBy(0, speed);
}

// Stub: hybrid scroll (to be implemented)
function applyHybridScroll() {
  // TODO: integrate with ASR tick data
  scrollBySpeed(CONSTANT_SPEED);
}

// --- Public API ---
export interface ScrollBrain {
  setMode: (_mode: ScrollMode) => void;
  getMode: () => ScrollMode;
}

export function createScrollBrain(): ScrollBrain {
  return {
    setMode: setScrollMode,
    getMode: () => scrollMode,
  };
}
