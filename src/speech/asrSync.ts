import { DEFAULT_SCRIPT_FONT_PX } from '../ui/typography-ssot';

const MAX_ERR_ABS = 2400;
let cachedPxPerLine = 0;
let cachedAt = 0;
const CACHE_TTL_MS = 5_000;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function measurePxPerLine(): number {
  if (typeof window === 'undefined') return DEFAULT_SCRIPT_FONT_PX * 1.4;
  try {
    const doc = document.documentElement;
    const cs = getComputedStyle(doc);
    const fs = parseFloat(cs.getPropertyValue('--tp-font-size')) || DEFAULT_SCRIPT_FONT_PX;
    const lh = parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4;
    return fs * lh;
  } catch {
    return DEFAULT_SCRIPT_FONT_PX * 1.4;
  }
}

function pxPerLine(): number {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!cachedPxPerLine || (now - cachedAt) > CACHE_TTL_MS) {
    cachedPxPerLine = measurePxPerLine();
    cachedAt = now;
  }
  return cachedPxPerLine;
}

export function emitAsrSync(errPx: number, confidence?: number): void {
  if (typeof window === 'undefined') return;
  const value = Number(errPx);
  if (!Number.isFinite(value) || value === 0) return;
  const detail = {
    errPx: clamp(value, -MAX_ERR_ABS, MAX_ERR_ABS),
    conf: clamp(Number.isFinite(confidence ?? 1) ? Number(confidence) : 1, 0, 1),
  };
  try {
    window.dispatchEvent(new CustomEvent('tp:asr:sync', { detail }));
  } catch {
    // swallow dispatch errors
  }
}

export function emitAsrSyncFromLineDelta(deltaLines: number, confidence?: number): void {
  const px = Number(deltaLines) * pxPerLine();
  if (!Number.isFinite(px)) return;
  emitAsrSync(px, confidence);
}
