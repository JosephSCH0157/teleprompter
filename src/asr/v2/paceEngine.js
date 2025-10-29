// src/asr/v2/paceEngine.js
// Minimal pace engine: map WPM to px/s with a rough coefficient
export function createPaceEngine(opts = {}) {
  const cfg = { wpl: 8, lh: 1.35, pxPerLine: 28, ...opts };
  const coef = (cfg.pxPerLine || 28) / (cfg.wpl || 8);
  return {
    mapWpmToPx(wpm) {
      const w = Math.max(60, Math.min(240, Number(wpm)||0));
      return Math.round(w * coef);
    }
  };
}
