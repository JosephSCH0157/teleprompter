// src/features/wpm.ts
// Tiny WPM motor for constant-rate scrolling independent of speech.

// Upgraded WPM motor with smoothed rate transitions, DOM/font recalibration, and px/s introspection.
// Provides gentle ramping to new targets to avoid jerk and exposes hooks for dynamic typography changes.

type GetViewer = () => HTMLElement | null;
type LogFn = (_tag: string, _data?: unknown) => void;

export function createWpmScroller(getViewer: GetViewer, log: LogFn = (_tag?: string, _data?: any) => {}) {
  let raf = 0;
  let running = false;
  let last = 0;

  // Current & target rates in px/sec (smoothed toward target)
  let pxPerSec = 0;
  let targetPxPerSec = 0;

  // Words-per-line hint (router can tune)
  let wplHint = 7;

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

  function setRateWpm(wpm: number) {
    targetPxPerSec = computePxPerSecFor(wpm);
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

    const sc = getViewer();
    if (sc) {
      const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
      const next = Math.min(max, sc.scrollTop + pxPerSec * dt);
      sc.scrollTop = next;
      try { log('wpm:tick', { dt, pxPerSec, top: next, max }); } catch {}
      if (next >= max) {
        try { (window as any).__tpWpmEnded = true; } catch {}
        stop();
      }
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

  return {
    start,
    stop,
    setRateWpm,
    setWordsPerLineHint,
    recalcFromDom,
    getPxPerSec,
    isRunning: () => running,
  } as const;
}

export default createWpmScroller;
