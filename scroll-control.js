// Minimal PID-like auto catch-up scroll controller
function _dbg(ev){
  try {
    if (typeof debug === 'function') debug(ev);
    else if (window && window.HUD) HUD.log(ev.tag || 'log', ev);
  } catch {}
}
let rafId, prevErr = 0, active = false;

export function startAutoCatchup(getAnchorY, getTargetY, scrollBy) {
  if (active) return;
  active = true;
  prevErr = 0;
  const kP = 0.12;      // proportional gain (gentle)
  const kD = 0.10;      // derivative gain (damping)
  const vMin = 0.2;     // px/frame (deadzone)
  const vMax = 12;      // px/frame cap
  const bias = 0;       // baseline offset

  _dbg({ tag:'match:catchup:start' });

  function tick() {
    try {
      const anchorY = getAnchorY();     // current line Y within viewport
      const targetY = getTargetY();     // desired Y (e.g., 0.4 * viewportHeight)
      let err = targetY - anchorY;      // positive => line is below target (we need to scroll down)
      const deriv = err - prevErr;
      const vRaw = (kP*err) + (kD*deriv) + bias;
      let v = vRaw;

      // Clamp + deadzone
      if (Math.abs(v) < vMin) v = 0;
      v = Math.max(-vMax, Math.min(vMax, v));

      if (v === 0 && Math.abs(vRaw) >= 0) {
        // Deadzone or clamped to zero
        _dbg({ tag:'match:catchup:deadzone', err, deriv, vRaw: Number(vRaw.toFixed(3)), v: 0, vMin, vMax, anchorY, targetY });
      }

      if (v !== 0) {
        try { scrollBy(v); } catch {}
        _dbg({ tag:'match:catchup:apply', err, deriv, vRaw: Number(vRaw.toFixed(3)), v: Number(v.toFixed(3)), vMin, vMax, anchorY, targetY });
      }
      prevErr = err;
    } catch {}
    if (active) rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}

export function stopAutoCatchup() {
  active = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  _dbg({ tag:'match:catchup:stop' });
}

// Factory so caller can treat this as a controller instance
export function createScrollController(){
  return {
    startAutoCatchup,
    stopAutoCatchup,
    isActive: () => active
  };
}
