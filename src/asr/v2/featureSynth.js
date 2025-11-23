// LEGACY HUD/ASR ENDPOINT
// This file is loaded directly as .js by script tags or dynamic imports.
// Source-of-truth logic now lives in TypeScript modules (src/asr/v2/*.ts, src/hud/*).
// DO NOT rename or remove this file without updating the HUD/ASR build pipeline
// to emit a matching .js artifact at the same URL.

// src/asr/v2/featureSynth.js
// Minimal feature synth: track speaking and estimate a steady WPM
export function createFeatureSynth() {
  let speaking = false;
  let wpm = 160;
  return {
    setSpeaking(on) { speaking = !!on; },
    setWpm(val) { const v = Number(val); if (Number.isFinite(v)) wpm = v; },
    get() { return { speaking, wpm, pauseMs: speaking ? 0 : 500 }; }
  };
}
