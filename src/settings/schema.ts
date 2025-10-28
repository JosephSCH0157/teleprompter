export type DisplayId = 'main' | 'display';

export type Typography = {
  fontFamily: string;      // e.g., 'system-ui, Segoe UI, Roboto, Arial, sans-serif'
  fontSizePx: number;      // 18..120 (teleprompter usually 42–72)
  lineHeight: number;      // 1.2..1.7
  weight: number;          // 300..900
  letterSpacingEm: number; // -0.02..0.1
  wordSpacingEm: number;   // 0..0.3
  color: string;           // '#e5e7eb'
  background: string;      // '#0b0f14'
  maxLineWidthCh: number;  // 20..90
  dimOthers: number;       // 0..0.7 opacity for non-active lines
};

export const DEFAULTS: Record<DisplayId, Typography> = {
  main: {
    fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
    fontSizePx: 56,
    lineHeight: 1.42,
    weight: 500,
    letterSpacingEm: 0.01,
    wordSpacingEm: 0.02,
    color: '#e5e7eb',
    background: '#0b0f14',
    maxLineWidthCh: 60,
    dimOthers: 0.25,
  },
  display: {
    fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
    fontSizePx: 64,
    lineHeight: 1.4,
    weight: 600,
    letterSpacingEm: 0.00,
    wordSpacingEm: 0.02,
    color: '#f3f4f6',
    background: '#05080c',
    maxLineWidthCh: 62,
    dimOthers: 0.2,
  },
};
