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
