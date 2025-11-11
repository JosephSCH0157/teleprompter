// src/features/wpm.ts
// Tiny WPM motor for constant-rate scrolling independent of speech.
// Upgraded WPM motor with smoothed rate transitions, DOM/font recalibration, and px/s introspection.
// Provides gentle ramping to new targets to avoid jerk and exposes hooks for dynamic typography changes.
// Strongly typed surface (WpmMotor) for IDE help across router/features.

export interface WpmMotor {
  start(_wpm: number): void;
  stop(): void;
  setRateWpm(_wpm: number): void;
  setWordsPerLineHint(_n: number): void;
  recalcFromDom(_currentWpm: number): void;
  getPxPerSec(): number;
  isRunning(): boolean;
  didEnd(): boolean;
  setStallThreshold(_sec: number): void;
}

type GetViewer = () => HTMLElement | null;
type LogFn = (_tag: string, _data?: unknown) => void;

export function createWpmScroller(getViewer: GetViewer, log: LogFn = () => {}): WpmMotor {
  let raf = 0;
  let running = false;
  let last = 0;

  // Current & target rates in px/sec (smoothed toward target)
  let pxPerSec = 0;
  let targetPxPerSec = 0;

  // Words-per-line hint (router can tune)
  let wplHint = 7;
  // End-of-script flag (consumable via didEnd())
  let ended = false;

  // Configurable stall threshold (seconds)
  let stallThreshold = 0.33; // seconds; default

  function sampleLineHeight(): number {
    const sc = getViewer();
    if (!sc) return 28;
    const probe = sc.querySelector<HTMLElement>('[data-line]') || sc.querySelector<HTMLElement>('.line') || sc.querySelector<HTMLElement>('p, span');
    const h = probe?.getBoundingClientRect().height || 28;
    return Math.max(12, Math.min(96, h)); // clamp for sanity
  }

  function computePxPerSecFor(wpm: number): number {
    const lh = sampleLineHeight();
    // WPM → lines/sec = wpm / (60 * wplHint); px/sec = lines/sec * lineHeight
    const value = (wpm / (60 * Math.max(1, wplHint))) * lh;
    try { log('wpm:rate', { wpm, lineH: lh, wplHint, pxPerSec: value }); } catch {}
    return Math.max(0, value);
  }

  function setRateWpm(nextWpm: number) {
    targetPxPerSec = computePxPerSecFor(nextWpm);
  }

  function setWordsPerLineHint(n: number) {
    if (Number.isFinite(n) && n > 0 && n < 50) {
      wplHint = n;
      try { log('wpm:wpl', { wplHint }); } catch {}
    }
  }

  function recalcFromDom(currentWpm: number) {
    // Re-evaluate target based on updated DOM metrics
    targetPxPerSec = computePxPerSecFor(currentWpm);
  }

  function getPxPerSec() {
    return pxPerSec;
  }

  function loop() {
    if (!running) return;
    const now = performance.now();
    const dt = Math.max(0, (now - last) / 1000);
    last = now;

    // Exponential approach to target; tau ≈ 125ms -> alpha ≈ dt * 8 for small dt
    const alpha = Math.min(1, dt * 8);
    pxPerSec += (targetPxPerSec - pxPerSec) * alpha;
  // Stall watchdog: log if frame gap is large (browser throttling or heavy GC)
  try { if (dt > stallThreshold) { log('wpm:stall', { dt }); } } catch {}

    const sc = getViewer();
    if (sc) {
      const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
      const next = Math.min(max, sc.scrollTop + pxPerSec * dt);
      sc.scrollTop = next;
      try { log('wpm:tick', { dt, pxPerSec, top: next, max }); } catch {}
      if (next >= max) { ended = true; stop(); }
    }
    raf = requestAnimationFrame(loop);
  }

  function start(wpm: number) {
    if (running) return;
    const rate = computePxPerSecFor(wpm);
    targetPxPerSec = rate;
    pxPerSec = rate; // avoid initial jerk
    running = true;
    last = performance.now();
    try { log('wpm:start'); } catch {}
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
    try { log('wpm:stop'); } catch {}
  }

  function didEnd() {
    const e = ended; ended = false; return e;
  }

  function setStallThreshold(seconds: number) {
    if (Number.isFinite(seconds) && seconds > 0 && seconds < 5) stallThreshold = seconds;
  }

  const api: WpmMotor = {
    start,
    stop,
    setRateWpm,
    setWordsPerLineHint,
    recalcFromDom,
    getPxPerSec,
    isRunning: () => running,
    didEnd,
    setStallThreshold,
  };
  return api;
}

export default createWpmScroller;
