// src/features/autoscroll.js (authoritative controller)
let enabled = false;
let speed = 16;          // px/sec default
let raf = 0;
let viewer = null;
let autoChip = null;

function applyLabel() {
  const btn = document.getElementById('autoToggle');
  if (btn) {
    // Validator expects strictly On/Off wording
    btn.textContent = enabled ? 'Auto-scroll: On' : 'Auto-scroll: Off';
    btn.setAttribute('aria-pressed', String(enabled));
  }
  try {
    autoChip = autoChip || document.getElementById('autoChip');
    if (autoChip) {
      autoChip.textContent = enabled ? 'Auto: On' : 'Auto: Manual';
      autoChip.setAttribute('aria-live','polite');
      autoChip.setAttribute('aria-atomic','true');
      autoChip.title = enabled ? 'Auto scroll is enabled' : 'Auto scroll is manual/off';
    }
  } catch {}
}

function loop() {
  cancelAnimationFrame(raf);
  if (!enabled || !viewer) return;
  let last = performance.now();
  const step = (now) => {
    const dt = (now - last) / 1000;
    last = now;
    try { viewer.scrollTop += speed * dt; } catch {}
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

export function initAutoScroll() {
  viewer = document.getElementById('viewer');
  autoChip = document.getElementById('autoChip');
  applyLabel();
  // keep resilient if viewer gets replaced
  const mo = new MutationObserver(() => {
    const v = document.getElementById('viewer');
    if (v !== viewer) { viewer = v; if (enabled) loop(); }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
}

export function toggle() {
  enabled = !enabled;
  applyLabel();
  loop();
}

export function setEnabled(v) {
  enabled = !!v;
  applyLabel();
  loop();
}

export function inc() { speed = Math.min(200, speed + 1); if (enabled) loop(); }
export function dec() { speed = Math.max(5, speed - 1);  if (enabled) loop(); }
export function getState() { return { enabled, speed }; }

export function setSpeed(pxPerSec) {
  const v = Number(pxPerSec);
  if (Number.isFinite(v)) speed = Math.max(5, Math.min(200, v));
}

export function nudge(pixels) {
  try {
    if (!viewer) viewer = document.getElementById('viewer');
    if (!viewer) return;
    viewer.scrollTop += Number(pixels) || 0;
  } catch {}
}
