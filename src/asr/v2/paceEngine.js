// src/asr/v2/paceEngine.js
// Improved pace mapping: WPM -> px/s using CSS vars, with a WPL hint
export function createPaceEngine() {
  function mapWpmToPxPerSec(wpm, doc) {
    try {
      const cs = doc.defaultView ? doc.defaultView.getComputedStyle(doc.documentElement) : getComputedStyle(document.documentElement);
      const fs = parseFloat(cs.getPropertyValue('--tp-font-size')) || 56;
      const lh = parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4;
      const lineHeightPx = fs * lh;
      const wpl = parseFloat(localStorage.getItem('tp_wpl_hint') || '8') || 8;
      const linesPerSec = (Number(wpm)||0) / 60 / wpl;
      return linesPerSec * lineHeightPx;
    } catch {
      return ((Number(wpm)||0) / 60) / 8 * (56 * 1.4);
    }
  }
  return { mapWpmToPx: (wpm) => mapWpmToPxPerSec(wpm, document) };
}
