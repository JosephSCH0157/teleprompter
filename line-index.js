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
  const indices = els.map((el) => +el.dataset.lineIdx).filter((idx) => !isNaN(idx));
  const maxIdx = indices.length > 0 ? Math.max(...indices) : -1;
  const lineEls = new Array(maxIdx + 1);
  for (const el of els) {
    const idx = +el.dataset.lineIdx;
    if (!isNaN(idx)) {
      lineEls[idx] = el;
    }
  }

  return {
    lineEls,
    nearestIdxAtY(y) {
      // Find the element whose top is closest to y (in container's coordinate system)
      let nearestIdx = 0;
      let minDist = Infinity;

      for (let i = 0; i < lineEls.length; i++) {
        const el = lineEls[i];
        if (el) {
          // Get position relative to container, accounting for container's scroll position
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const elTopRelativeToContainer = elRect.top - containerRect.top + container.scrollTop;
          const dist = Math.abs(elTopRelativeToContainer - y);
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
