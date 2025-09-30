// Minimal PD-like auto catch-up scroll controller (clean single export set)
let rafId, prevErr = 0, active = false;

export function startAutoCatchup(getAnchorY, getTargetY, scrollBy) {
  if (active) return;
  active = true;
  prevErr = 0;
  // Slightly softer, more damped profile to reduce jitter
  const kP = 0.09;      // proportional gain (gentler)
  const kD = 0.12;      // derivative gain (more damping)
  const vMin = 0.3;     // px/frame (deadzone)
  const vMax = 8;       // px/frame cap
  const bias = 0;       // baseline offset

  function tick() {
    if (!active) return;
    try {
      const anchorY = getAnchorY?.();     // current line Y within viewport
      const targetY = getTargetY?.();     // desired Y (e.g., 0.4 * viewportHeight)
      if (typeof anchorY !== 'number' || typeof targetY !== 'number') {
        // If inputs aren’t ready yet, try again next frame
        rafId = requestAnimationFrame(tick);
        return;
      }
      let err = targetY - anchorY;        // positive => line is below target (we need to scroll down)
      const deriv = err - prevErr;
      let v = (kP*err) + (kD*deriv) + bias;

      // Clamp + deadzone
      if (Math.abs(v) < vMin) v = 0;
      v = Math.max(-vMax, Math.min(vMax, v));

      if (v !== 0) {
        try { scrollBy?.(v); } catch {}
      }
      prevErr = err;
    } catch {}
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}

export function stopAutoCatchup() {
  active = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

// Factory so caller can treat this as a controller instance
export function createScrollController(){
  return {
    startAutoCatchup,
    stopAutoCatchup,
    isActive: () => active
  };
}
