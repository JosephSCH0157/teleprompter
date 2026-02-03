// LEGACY HUD/ASR ENDPOINT
// This file is loaded directly as .js by script tags or dynamic imports.
// Source-of-truth logic now lives in TypeScript modules (src/asr/v2/*.ts, src/hud/*).
// DO NOT rename or remove this file without updating the HUD/ASR build pipeline
// to emit a matching .js artifact at the same URL.

// src/asr/v2/paceEngine.js
// Improved pace mapping: WPM -> px/s using CSS vars, with a WPL hint
const DEFAULT_SCRIPT_FONT_PX = 40; // Keep in sync with src/ui/typography-ssot.ts
export function createPaceEngine() {
  function mapWpmToPxPerSec(wpm, doc) {
    try {
      const cs = doc.defaultView ? doc.defaultView.getComputedStyle(doc.documentElement) : getComputedStyle(document.documentElement);
      const fs = parseFloat(cs.getPropertyValue('--tp-font-size')) || DEFAULT_SCRIPT_FONT_PX;
      const lh = parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4;
      const lineHeightPx = fs * lh;
      const wpl = parseFloat(localStorage.getItem('tp_wpl_hint') || '8') || 8;
      const linesPerSec = (Number(wpm)||0) / 60 / wpl;
      return linesPerSec * lineHeightPx;
    } catch {
      return ((Number(wpm)||0) / 60) / 8 * (DEFAULT_SCRIPT_FONT_PX * 1.4);
    }
  }
  return { mapWpmToPx: (wpm) => mapWpmToPxPerSec(wpm, document) };
}
