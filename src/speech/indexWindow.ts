// indexWindow.ts — windowing helper around a center line index
// Radius-based inclusive window used to constrain candidate matching.
export const WINDOW = { radius: 40, dynRadius: 40 };

/**
 * Calculate visible window with adaptive radius based on scroll lag
 * @param centerIdx - Center line index
 * @param total - Total number of lines
 * @param errPx - Scroll error in pixels (optional, for adaptive widening)
 * @returns {start, end} - Inclusive window range
 */
export function visibleWindow(centerIdx: number, total: number, errPx?: number) {
  // Adaptive window unlock: widen when scroll is >120px behind
  const LAG_THRESHOLD = 120;
  const WIDE_RADIUS = 120;
  const radius = errPx && errPx > LAG_THRESHOLD ? WIDE_RADIUS : WINDOW.radius;
  WINDOW.dynRadius = radius; // expose for debugging
  
  const start = Math.max(0, Math.floor(centerIdx) - radius);
  const end = Math.min(total - 1, Math.floor(centerIdx) + radius);
  return { start, end };
}
try { (window as any).visibleWindow = visibleWindow; } catch {}
