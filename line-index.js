// line-index.js
// Utility to build a stable, O(1) lookup array of line elements by data-line-idx

/**
 * Build a stable array of line elements indexed by their data-line-idx attribute.
 * @param {HTMLElement} container - The container holding line elements.
 * @returns {Object} - Object with lineEls array and nearestIdxAtY function.
 */
export function buildLineIndex(container) {
  // Ensure every line has data-line-idx
  const els = Array.from(container.querySelectorAll('[data-line-idx]'));
  const maxIdx = Math.max(-1, ...els.map((el) => +el.dataset.lineIdx));
  const lineEls = new Array(maxIdx + 1);
  for (const el of els) lineEls[+el.dataset.lineIdx] = el;

  return {
    lineEls,
    nearestIdxAtY(y) {
      // Find the element whose top is closest to y
      let nearestIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < lineEls.length; i++) {
        const el = lineEls[i];
        if (el) {
          const dist = Math.abs(el.offsetTop - y);
          if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
          }
        }
      }
      return nearestIdx;
    },
  };
}
