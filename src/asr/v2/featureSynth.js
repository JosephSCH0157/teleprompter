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
