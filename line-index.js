// line-index.js
// Utility to build a stable, O(1) lookup array of line elements by data-line-idx

/**
 * Build a stable array of line elements indexed by their data-line-idx attribute.
 * @param {HTMLElement} container - The container holding line elements.
 * @returns {Array<HTMLElement|null>} - Array where lineEls[idx] is the element for that index, or null if missing.
 */
export function buildLineIndex(container) {
  // Ensure every line has data-line-idx
  const els = Array.from(container.querySelectorAll('[data-line-idx]'));
  const maxIdx = Math.max(-1, ...els.map((el) => +el.dataset.lineIdx));
  const lineEls = new Array(maxIdx + 1);
  for (const el of els) lineEls[+el.dataset.lineIdx] = el;
  return lineEls;
}
