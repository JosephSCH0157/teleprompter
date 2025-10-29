import type { PaceCaps, PaceEngine, PaceMode, Tempo } from './types';

function clamp(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)); }

function getPxPerLine(): number {
  try {
    const cs = getComputedStyle(document.documentElement);
    const fs = parseFloat(cs.getPropertyValue('--tp-font-size')) || 56;
    const lh = parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4;
    return fs * lh;
  } catch { return 56 * 1.4; }
}

export function createPaceEngine(): PaceEngine {
  let mode: PaceMode = 'assist';
  let caps: PaceCaps = { minPxs: 10, maxPxs: 220, accelCap: 60, decayMs: 250 };
  let sens = 1.0;
  let catchup: 'off'|'low'|'med' = 'off';
  let target = 0; // px/s
  let lastUpdate = performance.now();
  let lastWpm: number | undefined;
  const DEAD_WPM = 8; // hysteresis dead-zone
  const ALPHA = 0.3; // EMA
  const SPEAKING_PXS = 45; // default speaking speed in VAD mode

  function setMode(m: PaceMode) { mode = m; }
  function setCaps(c: Partial<PaceCaps>) { caps = { ...caps, ...c }; }
  function setSensitivity(mult: number) { sens = clamp(mult, 0.5, 1.5); }
  function setCatchupBias(level: 'off'|'low'|'med') { catchup = level; }

  function consume(tempo: Tempo, speaking: boolean) {
    const now = performance.now();
    const dt = Math.max(0.001, (now - lastUpdate) / 1000);
    lastUpdate = now;

    if (mode === 'vad') {
      const tgt = speaking ? SPEAKING_PXS : target * Math.pow(0.85, dt * (1000 / caps.decayMs));
      target = clamp(tgt, caps.minPxs, caps.maxPxs);
      return;
    }

    // assist/align mapping
    const wpm = tempo.wpm;
    if (wpm == null || !isFinite(wpm)) return; // keep previous target

    // Dead-zone on WPM to reduce jitter
    if (lastWpm != null && Math.abs(wpm - lastWpm) < DEAD_WPM) {
      // no update
    } else {
      lastWpm = wpm;
      // Map wpm -> px/s using layout
      const wordsPerLine = 8; // default, upgrade to live-derive later
      const pxPerLine = getPxPerLine();
      const pxs = clamp(((wpm / wordsPerLine) * pxPerLine) / 60, caps.minPxs, caps.maxPxs);
      const pxsAdj = pxs * sens;
      // EMA smoothing
      target = target === 0 ? pxsAdj : (ALPHA * pxsAdj + (1 - ALPHA) * target);
    }
  }

  function getTargetPxs(): number { return clamp(target, caps.minPxs, caps.maxPxs); }

  return { setMode, setCaps, setSensitivity, setCatchupBias, consume, getTargetPxs };
}
