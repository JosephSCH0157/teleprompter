// Typography bridge: unified wheel gestures for main and display
// - Ctrl/Cmd + Wheel anywhere: ±2px font size
// - Shift + Wheel over script container: ±2px font size
// Applies CSS vars and emits tp:lineMetricsDirty to reflow measurements.

const isDisplay = !!window.opener;
const root = document.documentElement;

function bumpFont(pxDelta) {
  try {
    const cs = getComputedStyle(root);
    const cur = parseFloat(cs.getPropertyValue('--tp-font-size')) || 56;
    const next = Math.max(24, Math.min(120, cur + pxDelta));
    root.style.setProperty('--tp-font-size', `${next}px`);
    window.dispatchEvent(new CustomEvent('tp:lineMetricsDirty'));
  } catch {}
}

// Ctrl/Cmd + wheel anywhere → ±2px
try {
  window.addEventListener(
    'wheel',
    (e) => {
      try {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        bumpFont(e.deltaY < 0 ? +2 : -2);
      } catch {}
    },
    { passive: false }
  );
} catch {}

// Shift + wheel over the script container → ±2px
const targetSel = isDisplay ? '#wrap' : '#viewer';
function bindShiftWheel() {
  try {
    const el = document.querySelector(targetSel);
    if (!el) return void setTimeout(bindShiftWheel, 200);
    el.addEventListener(
      'wheel',
      (e) => {
        try {
          if (!e.shiftKey) return;
          e.preventDefault();
          bumpFont(e.deltaY < 0 ? +2 : -2);
        } catch {}
      },
      { passive: false }
    );
  } catch {}
}
bindShiftWheel();
