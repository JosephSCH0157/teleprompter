// line-index.js
// Utility to build a stable, O(1) lookup array of line elements by data-line-idx

/**
 * Build a stable array of line elements indexed by their data-line-idx attribute.
 * @param {HTMLElement} container - The container holding line elements.
 * @returns {Array<HTMLElement|null>} - Array where lineEls[idx] is the element for that index, or null if missing.
 */
export function buildLineIndex(container) {
  // Grab all elements that declare a numeric data-line-idx
  const els = Array.from(container.querySelectorAll('[data-line-idx]'));

  // Compute the max index so we can pre-size an array for O(1) lookups
  let maxIdx = -1;
  for (const el of els) {
    const raw = el.dataset.lineIdx;
    const idx = raw == null ? NaN : Number(raw);
    if (!Number.isFinite(idx)) continue;
    if (idx > maxIdx) maxIdx = idx;
  }

  const lineEls = new Array(Math.max(0, maxIdx + 1)).fill(null);

  // Place each element at its declared index; warn on duplicates
  for (const el of els) {
    const raw = el.dataset.lineIdx;
    const idx = raw == null ? NaN : Number(raw);
    if (!Number.isFinite(idx)) continue;
    if (lineEls[idx] && lineEls[idx] !== el) {
      // Duplicate indices—use first, warn once in console
      if (!lineEls.__dupWarned) {
        console.warn('Duplicate data-line-idx detected; using first occurrence.');
        lineEls.__dupWarned = true;
      }
      continue;
    }
    lineEls[idx] = el;
  }

  return lineEls;
}
