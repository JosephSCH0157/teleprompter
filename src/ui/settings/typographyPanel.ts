import type { DisplayId } from '../../settings/schema';
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
      setTypography(display, patch);
    });
  });
}
