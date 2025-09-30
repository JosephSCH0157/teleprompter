// Minimal PID-like auto catch-up scroll controller
let rafId, prevErr = 0, active = false;

export function startAutoCatchup(getAnchorY, getTargetY, scrollBy) {
  if (active) return;
  active = true;
  prevErr = 0;

  // Dampened PD tuning
  const kP = 0.09;    // proportional gain
  const kD = 0.12;    // derivative gain
  const vMin = 0.3;   // px/frame deadzone
  const vMax = 8;     // px/frame cap
  const bias = 0;     // baseline offset

  function tick() {
    try {
      const anchorY = Number(getAnchorY?.()||0);
      const targetY = Number(getTargetY?.()||0);
      let err = targetY - anchorY;

      const deriv = err - prevErr;
      prevErr = err;

      let v = (kP * err) + (kD * deriv) + bias;
      if (Math.abs(v) < vMin) v = 0;
      v = Math.max(-vMax, Math.min(vMax, v));

      if (v !== 0) scrollBy(v);
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

export function createScrollController(){
  return {
    startAutoCatchup,
    stopAutoCatchup,
    isActive: () => active
  };
}
