// src/ui/typography.ts
//
// Typed typography helper for Anvil.
// - Applies CSS vars: --tp-font-size, --tp-line-height
// - Persists settings per "main" vs "display" window
// - Handles Ctrl/Cmd + Wheel for global zoom
// - Handles Shift + Wheel over viewer/wrap for local zoom
// - Bridges Settings via window.applyTypography for legacy callers

import { DEFAULT_SCRIPT_FONT_PX } from './typography-ssot';

const STORAGE_KEY = 'tp_typography_v1';
const MIN_SIZE = 18;
const MAX_SIZE = 120;
const DEFAULT_SIZE = DEFAULT_SCRIPT_FONT_PX;
const DEFAULT_LINE_HEIGHT = 1.4;

// main vs display window
const DISPLAY_ID: 'main' | 'display' = (() => {
  try {
    return window.opener ? 'display' : 'main';
  } catch {
    return 'main';
  }
})();

type TypographyPreset = {
  fontSizePx: number;
  lineHeight: number;
};

type TypographyStore = {
  main?: TypographyPreset;
  display?: TypographyPreset;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function readStore(): TypographyStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TypographyStore) : {};
  } catch {
    return {};
  }
}

function writeStore(st: TypographyStore): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(st || {}));
  } catch {
    // ignore
  }
}

function getCurrentPreset(): TypographyPreset {
  const st = readStore();
  const preset = (DISPLAY_ID === 'display' ? st.display : st.main) || ({} as TypographyPreset);
  const size = typeof preset.fontSizePx === 'number' ? preset.fontSizePx : DEFAULT_SIZE;
  const lh = typeof preset.lineHeight === 'number' ? preset.lineHeight : DEFAULT_LINE_HEIGHT;
  return {
    fontSizePx: clamp(size, MIN_SIZE, MAX_SIZE),
    lineHeight: lh || DEFAULT_LINE_HEIGHT,
  };
}

function applyTypographyVars(fontSizePx: number, lineHeight: number): void {
  const root = document.documentElement;
  const size = clamp(fontSizePx || DEFAULT_SIZE, MIN_SIZE, MAX_SIZE);
  const lh = lineHeight || DEFAULT_LINE_HEIGHT;

  root.style.setProperty('--tp-font-size', `${size}px`);
  root.style.setProperty('--tp-line-height', String(lh));

  const st = readStore();
  const key = DISPLAY_ID === 'display' ? 'display' : 'main';
  const next: TypographyStore = {
    ...st,
    [key]: { fontSizePx: size, lineHeight: lh },
  };
  writeStore(next);
}

// Initialize from stored values on boot
function initFromStore(): void {
  try {
    const preset = getCurrentPreset();
    applyTypographyVars(preset.fontSizePx, preset.lineHeight);
  } catch {
    // ignore
  }
}

// Ctrl/Cmd + Wheel anywhere → adjust font size (global)
function initGlobalWheelZoom(): void {
  try {
    window.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        try {
          if (!(e.ctrlKey || (e as any).metaKey)) return;

          const target = e.target as HTMLElement | null;
          const tag = target?.tagName ? target.tagName.toLowerCase() : '';
          if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
            return;
          }

          e.preventDefault();

          const root = document.documentElement;
          const cs = window.getComputedStyle(root);
          const curPx = parseFloat(cs.getPropertyValue('--tp-font-size')) || DEFAULT_SIZE;
          const next = clamp(curPx + (e.deltaY < 0 ? 2 : -2), MIN_SIZE, MAX_SIZE);
          const lh = parseFloat(cs.getPropertyValue('--tp-line-height')) || DEFAULT_LINE_HEIGHT;
          applyTypographyVars(next, lh);
        } catch {
          // ignore
        }
      },
      { passive: false },
    );
  } catch {
    // ignore
  }
}

// Shift + Wheel over viewer/wrap → local zoom for the reading area
function wireLocalWheelTargets(): void {
  try {
    const targetId = DISPLAY_ID === 'display' ? 'wrap' : 'viewer';
    const host = document.getElementById(targetId);
    if (!host) return;

    // Avoid duplicating listeners on re-wire: simple flag on the element
    const anyHost = host as HTMLElement & { __tpWheelBound?: boolean };
    if (anyHost.__tpWheelBound) return;
    anyHost.__tpWheelBound = true;

    host.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        try {
          if (!e.shiftKey) return;

          const target = e.target as HTMLElement | null;
          const tag = target?.tagName ? target.tagName.toLowerCase() : '';
          if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
            return;
          }

          e.preventDefault();

          const root = document.documentElement;
          const cs = window.getComputedStyle(root);
          const curPx = parseFloat(cs.getPropertyValue('--tp-font-size')) || DEFAULT_SIZE;
          const next = clamp(curPx + (e.deltaY < 0 ? 2 : -2), MIN_SIZE, MAX_SIZE);
          const lh = parseFloat(cs.getPropertyValue('--tp-line-height')) || DEFAULT_LINE_HEIGHT;
          applyTypographyVars(next, lh);
        } catch {
          // ignore
        }
      },
      { passive: false },
    );
  } catch {
    // ignore
  }
}

function initLocalWheelZoom(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        wireLocalWheelTargets();
      } catch {
        // ignore
      }
    });
  } else {
    wireLocalWheelTargets();
  }

  // If viewer/wrap nodes get replaced, re-wire
  try {
    const mo = new MutationObserver(() => {
      try {
        wireLocalWheelTargets();
      } catch {
        // ignore
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch {
    // ignore
  }
}

// --- Global bridge for Settings & legacy JS -------------------------------

export interface TypographyApplyOptions {
  fontSizePx: number;
  lineHeight: number;
}

export function applyTypography(opts: TypographyApplyOptions): void {
  applyTypographyVars(opts.fontSizePx, opts.lineHeight);
}

declare global {
  interface Window {
    applyTypography?: (fontSizePx: number, lineHeight: number) => void;
  }
}

// Install window.applyTypography if not already defined
if (typeof window !== 'undefined') {
  if (!window.applyTypography) {
    window.applyTypography = (fontSizePx: number, lineHeight: number) => {
      applyTypographyVars(fontSizePx, lineHeight);
    };
  }
}

// Initialize everything when this module is loaded
export function initTypography(): void {
  initFromStore();
  initGlobalWheelZoom();
  initLocalWheelZoom();
}

// Auto-init on import
try {
  initTypography();
} catch {
  // ignore
}
