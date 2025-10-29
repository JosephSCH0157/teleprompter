// src/asr/v2/orchestrator.js
// Minimal orchestrator: VAD assist → enable/disable Auto; WPM assist → set speed
import { createMotor } from './motor.js';
import { createPaceEngine } from './paceEngine.js';
import { createFeatureSynth } from './featureSynth.js';
import { createVadAdapter } from './adapters/vad.js';

export function createOrchestrator() {
  const motor = createMotor();
  const pace = createPaceEngine();
  const synth = createFeatureSynth();
  const vad = createVadAdapter();
  let running = false;
  let tickId = 0;

  function apply() {
    try {
      const f = synth.get();
      motor.setEnabled(!!f.speaking);
      const px = pace.mapWpmToPx(f.wpm);
      motor.setSpeed(px);
    } catch {}
  }

  function start(_mode = 'assist') {
    if (running) return;
    running = true;
    try { vad.start(); } catch {}
    try { vad.onSpeaking((on) => { try { synth.setSpeaking(on); } catch {} }); } catch {}
    // periodic apply
    tickId = setInterval(apply, 150);
  }
  function stop() {
    if (!running) return;
    running = false;
    clearInterval(tickId); tickId = 0;
    try { vad.stop(); } catch {}
    try { motor.setEnabled(false); } catch {}
  }
  function status() {
    return { running };
  }

  return { start, stop, status };
}
