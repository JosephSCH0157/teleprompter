// src/features/autoscroll.js (authoritative controller)
let enabled = false;
let speed = 21;          // px/sec default
let raf = 0;
let viewer = null;
let autoChip = null;
let _fracCarry = 0;      // fractional accumulator to avoid stalling at low speeds

function applyLabel() {
  const btn = document.getElementById('autoToggle');
  // If the Scroll Router is active and managing state (data-state present), don't override its labeling.
  const managedByRouter = !!(btn && btn.dataset && btn.dataset.state);
  if (btn && !managedByRouter) {
    // Fallback labeling only when router isn't present
    btn.textContent = enabled ? 'Auto-scroll: On' : 'Auto-scroll: Off';
    btn.setAttribute('aria-pressed', String(enabled));
  }
  try {
    autoChip = autoChip || document.getElementById('autoChip');
    // If router is managing the chip (it sets data-state), avoid fighting it.
    const chipManaged = !!(autoChip && autoChip.getAttribute && autoChip.getAttribute('data-state'));
    if (autoChip && !chipManaged) {
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
  // Respect Rehearsal Mode: do not auto-scroll
  try { if (window.__TP_REHEARSAL) return; } catch {}
  let last = performance.now();
  const step = (now) => {
    const dt = (now - last) / 1000;
    last = now;
    try {
      // Accumulate fractional sub-pixel deltas so very low speeds still advance consistently
      const delta = speed * dt + _fracCarry;
      const whole = (delta >= 0) ? Math.floor(delta) : Math.ceil(delta);
      _fracCarry = delta - whole;
      if (whole !== 0) viewer.scrollTop += whole;
    } catch {}
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

export function initAutoScroll() {
  viewer = document.getElementById('viewer');
  autoChip = document.getElementById('autoChip');
  // Warm speed from storage and reflect in the numeric input if present
  try {
    const s = Number(localStorage.getItem('tp_auto_speed') || '')
    if (Number.isFinite(s) && s > 0) {
      speed = Math.max(5, Math.min(200, s));
      try { const inp = document.getElementById('autoSpeed'); if (inp) inp.value = String(speed); } catch {}
    } else {
      // Initialize input to current default
      try { const inp2 = document.getElementById('autoSpeed'); if (inp2) inp2.value = String(speed); } catch {}
    }
  } catch {}
  applyLabel();
  // keep resilient if viewer gets replaced
  const mo = new MutationObserver(() => {
    const v = document.getElementById('viewer');
    if (v !== viewer) { viewer = v; if (enabled) loop(); }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
}

export function toggle() {
  const want = !enabled;
  // In rehearsal, deny enabling
  try {
    if (want && window.__TP_REHEARSAL) {
      enabled = false;
      try { window.toasts?.show?.('Auto-scroll disabled in Rehearsal Mode'); } catch {}
      applyLabel();
      return;
    }
  } catch {}
  enabled = want;
  applyLabel();
  loop();
}

export function setEnabled(v) {
  // In rehearsal, deny enabling
  try {
    if (v && window.__TP_REHEARSAL) {
      enabled = false;
      try { window.toasts?.show?.('Auto-scroll disabled in Rehearsal Mode'); } catch {}
      applyLabel();
      return;
    }
  } catch {}
  enabled = !!v;
  applyLabel();
  loop();
}

export function inc() { setSpeed(speed + 0.5); if (enabled) loop(); }
export function dec() { setSpeed(speed - 0.5);  if (enabled) loop(); }
export function getState() { return { enabled, speed }; }

let _setSpeedReentrant = false;
export function setSpeed(pxPerSec) {
  const v = Number(pxPerSec);
  if (!Number.isFinite(v)) return;
  const clamped = Math.max(1, Math.min(200, v));
  if (clamped === speed) return; // No change, skip
  speed = clamped;
  // Persist and notify engine if present
  try { localStorage.setItem('tp_auto_speed', String(speed)); } catch {}
  // Prevent recursion: only call __scrollCtl.setSpeed if not already inside it
  if (!_setSpeedReentrant) {
    try {
      _setSpeedReentrant = true;
      window.__scrollCtl?.setSpeed?.(speed);
    } finally {
      _setSpeedReentrant = false;
    }
  }
  // Tell listeners (router, UI) about speed change
  try { document.dispatchEvent(new CustomEvent('tp:autoSpeed', { detail: { speed } })); } catch {}
  // Reflect to numeric input, if present
  try { const inp = document.getElementById('autoSpeed'); if (inp) inp.value = String(speed); } catch {}
  // If UI is in 'on' state, reflect the current speed on the button
  try {
    const btn = document.getElementById('autoToggle');
    const st = btn?.dataset?.state || '';
    // Only adjust when router is managing state, to keep styles in sync
    if (btn && st) {
      const s1 = Number.isFinite(speed) ? Number(speed) : 0;
      const sFmt = (Math.round(s1 * 10) / 10).toFixed(1);
      if (st === 'on') btn.textContent = `Auto-scroll: On — ${sFmt} px/s`;
      else if (st === 'paused') btn.textContent = `Auto-scroll: Paused — ${sFmt} px/s`;
    }
  } catch {}
}

export function nudge(pixels) {
  try {
    if (!viewer) viewer = document.getElementById('viewer');
    if (!viewer) return;
    viewer.scrollTop += Number(pixels) || 0;
  } catch {}
}
