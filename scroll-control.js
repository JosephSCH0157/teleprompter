let rafId = null, prevErr = 0, active = false;

export function startAutoCatchup(getAnchorY, getTargetY, scrollByPx) {
  if (active) return;
  active = true; prevErr = 0;

  const kP = 0.09, kD = 0.12; // gentle + damped
  const vMin = 0.3, vMax = 8, bias = 0;

  function tick(){
    if (!active) return;
    try {
      const anchorY = Number(getAnchorY?.() ?? 0);
      const targetY = Number(getTargetY?.() ?? 0);
      const err = targetY - anchorY;
      const dErr = err - prevErr; prevErr = err;

      let v = (kP * err) + (kD * dErr) + bias;
      if (Math.abs(v) < vMin) v = 0;
      if (v >  vMax) v =  vMax;
      if (v < -vMax) v = -vMax;

      if (v) scrollByPx?.(v);
    } catch {
      active = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; return;
    }
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}

export function stopAutoCatchup(){ active = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; }
export function createScrollController(){ return { startAutoCatchup, stopAutoCatchup, isActive: () => active }; }
