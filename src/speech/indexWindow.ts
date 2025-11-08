// indexWindow.ts — windowing helper around a center line index
// Radius-based inclusive window used to constrain candidate matching.
export const WINDOW = { radius: 40 };
export function visibleWindow(centerIdx: number, total: number) {
  const start = Math.max(0, Math.floor(centerIdx) - WINDOW.radius);
  const end = Math.min(total - 1, Math.floor(centerIdx) + WINDOW.radius);
  return { start, end };
}
try { (window as any).visibleWindow = visibleWindow; } catch {}
