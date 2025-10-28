// src/features/autoscroll.js
// Simple auto-scroll controller: toggles smooth scrolling of a scrollable container at px/s rate.

/**
 * Initialize auto-scroll feature for a given scroller getter.
 * @param {() => HTMLElement | null} getScroller
 */
export function initAutoScroll(getScroller) {
  let running = false;
  let ratePxPerSec = 60; // default; will be set from #autoSpeed
  let raf = 0;
  let last = 0;

  /** @type {undefined | ((state: 'On'|'Off') => void)} */
  let setBtnLabel;

  /** @param {number} t */
  const step = (t) => {
    if (!running) return;
    const sc = getScroller();
    if (!sc) { running = false; setBtnLabel && setBtnLabel('Off'); return; }
    const dt = Math.max(0, t - last) / 1000; // seconds
    last = t;

    // clamp within scroll range
    const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
    const next = Math.min(max, sc.scrollTop + ratePxPerSec * dt);
    sc.scrollTop = next;

    // stop at end
    if (next >= max) { running = false; setBtnLabel && setBtnLabel('Off'); return; }
    raf = requestAnimationFrame(step);
  };

  function start() {
    if (running) return;
    running = true;
    last = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    raf = requestAnimationFrame(step);
    setBtnLabel && setBtnLabel('On');
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    setBtnLabel && setBtnLabel('Off');
  }
  function toggle() { (running ? stop : start)(); }
  /** @param {number|string} px */
  function setRate(px) { ratePxPerSec = Math.max(0, Number(px) || 0); }

  /**
   * @param {HTMLElement|null} btn
   * @param {HTMLInputElement|null} input
   */
  function bindUI(btn, input) {
    setBtnLabel = (state) => { if (btn) btn.textContent = `Auto-scroll: ${state}`; };
    if (btn && typeof btn.addEventListener === 'function') btn.addEventListener('click', toggle);
    if (input) {
      setRate(input.value);
      input.addEventListener('change', () => setRate(input.value));
      input.addEventListener('input', () => setRate(input.value));
    }
    setBtnLabel && setBtnLabel('Off');
  }

  return { start, stop, toggle, setRate, bindUI };
}
