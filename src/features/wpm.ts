// src/features/wpm.ts
// Tiny WPM motor for constant-rate scrolling independent of speech.

type GetViewer = () => HTMLElement | null;
type LogFn = (tag: string, data?: any) => void;

export function createWpmScroller(getViewer: GetViewer, log: LogFn = () => {}) {
  let raf = 0;
  let running = false;
  let last = 0;
  let pxPerSec = 0;

  function setRateWpm(wpm: number) {
    const sc = getViewer();
    if (!sc) return;
    // Estimate line height from first likely line node; fallback to 28px
    const probe = sc.querySelector<HTMLElement>('[data-line], .line, p, span');
    const rect = probe?.getBoundingClientRect();
    const lineH = (rect && rect.height) || 28;
    // Approximate ~7 words per line
    pxPerSec = Math.max(0, (wpm / 60) * lineH * 7);
    try { log('wpm:rate', { wpm, lineH, pxPerSec }); } catch {}
  }

  function loop() {
    if (!running) return;
    const now = performance.now();
    const dt = Math.max(0, (now - last) / 1000);
    last = now;
    const sc = getViewer();
    if (sc) {
      const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
      const next = Math.min(max, sc.scrollTop + pxPerSec * dt);
      sc.scrollTop = next;
      try { log('wpm:tick', { dt, pxPerSec, top: next, max }); } catch {}
      if (next >= max) stop();
    }
    raf = requestAnimationFrame(loop);
  }

  function start(wpm: number) {
    if (running) return;
    setRateWpm(wpm);
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

  return { start, stop, setRateWpm, isRunning: () => running } as const;
}

export default createWpmScroller;
