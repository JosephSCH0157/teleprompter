import type { DisplayId } from '../../settings/schema';
import { DEFAULTS } from '../../settings/schema';
import { getTypography, setTypography } from '../../settings/typographyStore';

function idFor(base: string, display: DisplayId) { return `${base}-${display}`; }

export function bindTypographyPanel(display: DisplayId) {
  const $ = (id: string) => document.getElementById(id) as HTMLInputElement | null;
  const t = getTypography(display);

  const fields = {
    fontFamily: $(idFor('typoFontFamily', display)),
    fontSizePx: $(idFor('typoFontSize', display)),
    lineHeight: $(idFor('typoLineHeight', display)),
    weight: $(idFor('typoWeight', display)),
    letterSpacingEm: $(idFor('typoLetter', display)),
    wordSpacingEm: $(idFor('typoWord', display)),
    color: $(idFor('typoColor', display)),
    background: $(idFor('typoBg', display)),
    maxLineWidthCh: $(idFor('typoMaxCh', display)),
    dimOthers: $(idFor('typoDim', display)),
  } as const;

  // init values
  if (fields.fontFamily) fields.fontFamily.value = t.fontFamily;
  if (fields.fontSizePx) fields.fontSizePx.value = String(t.fontSizePx);
  if (fields.lineHeight) fields.lineHeight.value = String(t.lineHeight);
  if (fields.weight) fields.weight.value = String(t.weight);
  if (fields.letterSpacingEm) fields.letterSpacingEm.value = String(t.letterSpacingEm);
  if (fields.wordSpacingEm) fields.wordSpacingEm.value = String(t.wordSpacingEm);
  if (fields.color) fields.color.value = t.color;
  if (fields.background) fields.background.value = t.background;
  if (fields.maxLineWidthCh) fields.maxLineWidthCh.value = String(t.maxLineWidthCh);
  if (fields.dimOthers) fields.dimOthers.value = String(t.dimOthers);

  // live update
  (Object.entries(fields) as [keyof typeof fields, HTMLInputElement | null][]) .forEach(([k, input]) => {
    if (!input) return;
    input.addEventListener('input', () => {
      const patch: any = {};
      const n = Number(input.value);
      patch[k] = isNaN(n) ? input.value : n;
      // A) Apply to main on input: update CSS vars immediately and notify reflow
      try {
        if (display === 'main') {
          const docEl = document.documentElement;
          if (k === 'fontSizePx' && typeof patch[k] === 'number') {
            docEl.style.setProperty('--tp-font-size', String(patch[k]) + 'px');
          }
          if (k === 'lineHeight' && typeof patch[k] === 'number') {
            docEl.style.setProperty('--tp-line-height', String(patch[k]));
          }
          if (k === 'fontSizePx' || k === 'lineHeight') {
            window.dispatchEvent(new CustomEvent('tp:lineMetricsDirty'));
          }
        }
      } catch {}
      setTypography(display, patch);
      // B) Always push Display updates to the external window (regardless of link toggle)
      try {
        if (display === 'display') {
          const msg = { kind: 'tp:typography', source: 'main', display: 'display', t: patch };
          try { new BroadcastChannel('tp_display').postMessage(msg as any); } catch {}
          try {
            const w = (window as any).__tpDisplayWindow;
            if (w && !w.closed) w.postMessage(msg, '*');
          } catch {}
        }
      } catch {}
      refreshFromStore();
    });
  });

  // Reset and Copy buttons
  try {
    const resetBtn = document.getElementById(display === 'main' ? 'typoResetMain' : 'typoResetDisplay');
    resetBtn?.addEventListener('click', () => { setTypography(display, DEFAULTS[display]); refreshFromStore(); });
  } catch {}
  try {
    const copyBtnId = display === 'main' ? 'typoCopyMainToDisplay' : 'typoCopyDisplayToMain';
    const copyBtn = document.getElementById(copyBtnId);
    copyBtn?.addEventListener('click', () => {
      const src: DisplayId = display;
      const dst: DisplayId = display === 'main' ? 'display' : 'main';
      setTypography(dst, getTypography(src));
    });
  } catch {}

  // Presets for this panel
  try {
    const PRESETS: Record<string, Partial<ReturnType<typeof getTypography>>> = {
      readable:  { fontSizePx: 56, lineHeight: 1.42, weight: 500, maxLineWidthCh: 60 },
      studio:    { fontSizePx: 48, lineHeight: 1.35, weight: 600, maxLineWidthCh: 70 },
      bigroom:   { fontSizePx: 72, lineHeight: 1.38, weight: 600, maxLineWidthCh: 62 },
    };
    document.querySelectorAll(`[data-typo-preset][data-display="${display}"]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = (btn as HTMLElement).getAttribute('data-typo-preset-name') || 'readable';
        const preset = PRESETS[name] || PRESETS.readable;
        setTypography(display, preset as any);
        refreshFromStore();
      });
    });
  } catch {}

  // Contrast check binders
  try {
    const warnEl = document.getElementById(`typoContrastWarn-${display}`);
    const colorEl = document.getElementById(`typoColor-${display}`) as HTMLInputElement | null;
    const bgEl = document.getElementById(`typoBg-${display}`) as HTMLInputElement | null;
    const srgb = (c: string) => {
      try {
        const n = c.startsWith('#') ? c.slice(1) : c;
        const v = n.length === 3 ? n.replace(/./g, (m) => m + m) : n;
        const r = parseInt(v.slice(0,2),16)/255, g=parseInt(v.slice(2,4),16)/255, b=parseInt(v.slice(4,6),16)/255;
        const L = (x: number) => x<=0.03928? x/12.92 : Math.pow((x+0.055)/1.055,2.4);
        return 0.2126*L(r)+0.7152*L(g)+0.0722*L(b);
      } catch { return 0; }
    };
    const contrastRatio = (fg: string, bg: string) => {
      const L1 = srgb(fg), L2 = srgb(bg); const a = Math.max(L1, L2), b = Math.min(L1, L2);
      return (a + 0.05) / (b + 0.05);
    };
    const updateContrast = () => {
      if (!warnEl || !colorEl || !bgEl) return;
      const cr = contrastRatio(colorEl.value, bgEl.value);
      (warnEl as HTMLElement).textContent = cr < 4.5 ? `Low contrast (${cr.toFixed(2)})` : '';
    };
    colorEl?.addEventListener('input', updateContrast);
    bgEl?.addEventListener('input', updateContrast);
    updateContrast();
  } catch {}

  function refreshFromStore() {
    try {
      const s = getTypography(display);
      if (fields.fontFamily) fields.fontFamily.value = s.fontFamily;
      if (fields.fontSizePx) fields.fontSizePx.value = String(s.fontSizePx);
      if (fields.lineHeight) fields.lineHeight.value = String(s.lineHeight);
      if (fields.weight) fields.weight.value = String(s.weight);
      if (fields.letterSpacingEm) fields.letterSpacingEm.value = String(s.letterSpacingEm);
      if (fields.wordSpacingEm) fields.wordSpacingEm.value = String(s.wordSpacingEm);
      if (fields.color) fields.color.value = s.color;
      if (fields.background) fields.background.value = s.background;
      if (fields.maxLineWidthCh) fields.maxLineWidthCh.value = String(s.maxLineWidthCh);
      if (fields.dimOthers) fields.dimOthers.value = String(s.dimOthers);
    } catch {}
  }
}
