import type { DisplayId } from '../settings/schema';
import { getTypography } from '../settings/typographyStore';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveTypographyNumber(value: unknown, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

export function wpmToPxPerSec(targetWpm: number, display: DisplayId = 'main'): number {
  if (!Number.isFinite(targetWpm) || targetWpm <= 0) return 0;

  const typo = getTypography(display);
  const fontSize = resolveTypographyNumber(
    (typo as any)?.fontSizePx ?? (typo as any)?.fontSize,
    32,
  );
  const lineHeight = resolveTypographyNumber(
    (typo as any)?.lineHeight,
    1.4,
  );
  const maxCh = resolveTypographyNumber(
    (typo as any)?.maxLineWidthCh ?? (typo as any)?.maxCh,
    80,
  );

  const wordsPerLine = Math.max(1, maxCh / 5);
  const pxPerLine = fontSize * lineHeight;
  const linesPerMinute = targetWpm / wordsPerLine;
  const pxPerMinute = linesPerMinute * pxPerLine;
  const pxPerSec = pxPerMinute / 60;

  // Guard against runaway values when typography settings are extreme
  return clamp(pxPerSec, 0, 2000);
}
