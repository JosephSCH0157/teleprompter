// Minimal PID-like auto catch-up scroll controller
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

  function tick() {
    try {
      const anchorY = getAnchorY();     // current line Y within viewport
      const targetY = getTargetY();     // desired Y (e.g., 0.4 * viewportHeight)
      let err = targetY - anchorY;      // positive => line is below target (we need to scroll down)
      const deriv = err - prevErr;
      let v = (kP*err) + (kD*deriv) + bias;

      // Clamp + deadzone
      if (Math.abs(v) < vMin) v = 0;
      v = Math.max(-vMax, Math.min(vMax, v));

      if (v !== 0) scrollBy(v);
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
}
