import type { PaceCaps, PaceEngine, PaceMode, Tempo } from './types';

function clamp(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)); }

// Removed unused getPxPerLine helper; mapping derives from document styles where needed.

export function createPaceEngine(): PaceEngine {
  let mode: PaceMode = 'assist';
  let caps: PaceCaps = { minPxs: 10, maxPxs: 220, accelCap: 60, decayMs: 250 };
  let sens = 1.0;
  let _catchup: 'off'|'low'|'med' = 'off';
  let target = 0; // px/s (smoothed)
  let lastUpdate = performance.now();
  let lastWpm: number | undefined;
  const DEAD_WPM = 8; // hysteresis dead-zone
  const ALPHA = 0.3; // EMA
  const SPEAKING_PXS = 45; // default speaking speed in VAD mode

  function mapWpmToPxPerSec(wpm: number, doc: Document): number {
    try {
      const cs = getComputedStyle(doc.documentElement);
      const fsPx = parseFloat(cs.getPropertyValue('--tp-font-size')) || 56;
      const lhScale = parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4;
      const lineHeightPx = fsPx * lhScale;
      const wpl = parseFloat(localStorage.getItem('tp_wpl_hint') || '8') || 8;
      const linesPerSec = (wpm / 60) / wpl;
      return linesPerSec * lineHeightPx;
    } catch { return (wpm / 60) / 8 * (56 * 1.4); }
  }

  function setMode(m: PaceMode) { mode = m; }
  function setCaps(c: Partial<PaceCaps>) { caps = { ...caps, ...c }; }
  function setSensitivity(mult: number) { sens = clamp(mult, 0.5, 1.5); }
  function setCatchupBias(level: 'off'|'low'|'med') { _catchup = level; }

  function consume(tempo: Tempo, speaking: boolean) {
    const now = performance.now();
    const dt = Math.max(0.001, (now - lastUpdate) / 1000);
    lastUpdate = now;

    if (mode === 'vad') {
      const tgt = speaking ? SPEAKING_PXS : target * Math.pow(0.85, dt * (1000 / caps.decayMs));
      // approach with accel cap
      const maxStep = caps.accelCap * dt;
      const next = target + clamp(tgt - target, -maxStep, maxStep);
      target = clamp(next, caps.minPxs, caps.maxPxs);
      return;
    }

    // assist/align mapping
    let wpm = tempo.wpm;
    if ((wpm == null || !isFinite(wpm)) && speaking) {
      const baseline = parseFloat(localStorage.getItem('tp_baseline_wpm') || '120') || 120;
      wpm = baseline;
    }
    if (wpm == null || !isFinite(wpm)) return; // keep previous target

    // Dead-zone on WPM to reduce jitter
    if (lastWpm != null && Math.abs(wpm - lastWpm) < DEAD_WPM) {
      // no update
    } else {
      lastWpm = wpm;
      // Map wpm -> px/s using layout + sensitivity
      const pxsRaw = mapWpmToPxPerSec(wpm, document) * sens;
      // EMA smoothing and accel-cap approach
      const smoothed = target === 0 ? pxsRaw : (ALPHA * pxsRaw + (1 - ALPHA) * target);
      const maxStep = caps.accelCap * dt;
      const next = target + clamp(smoothed - target, -maxStep, maxStep);
      target = clamp(next, caps.minPxs, caps.maxPxs);
    }
  }

  function getTargetPxs(): number { return clamp(target, caps.minPxs, caps.maxPxs); }

  return { setMode, setCaps, setSensitivity, setCatchupBias, consume, getTargetPxs };
}
