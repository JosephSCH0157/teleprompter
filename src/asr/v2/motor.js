// LEGACY HUD/ASR ENDPOINT
// This file is loaded directly as .js by script tags or dynamic imports.
// Source-of-truth logic now lives in TypeScript modules (src/asr/v2/*.ts, src/hud/*).
// DO NOT rename or remove this file without updating the HUD/ASR build pipeline
// to emit a matching .js artifact at the same URL.

// src/asr/v2/motor.js
// Minimal wrapper around Auto to expose a small motor API
import * as Auto from '../../features/autoscroll.js';

export function createMotor() {
  return {
    setEnabled(on) { try { Auto.setEnabled(!!on); } catch {} },
    setSpeed(pxPerSec) { try { Auto.setSpeed(Number(pxPerSec)||0); } catch {} },
    getState() { try { return Auto.getState ? Auto.getState() : { enabled:false, speed:0 }; } catch { return { enabled:false, speed:0 }; } }
  };
}
