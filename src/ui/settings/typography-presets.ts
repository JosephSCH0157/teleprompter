// src/ui/settings/typography-presets.ts

type PresetName = 'default' | 'easyRead' | 'smoothComfort';

type Preset = {
  letter: number;
  word: number;
  maxCh: number;
};

const PRESETS: Record<PresetName, Preset> = {
  default: { letter: 0.0, word: 0.0, maxCh: 90 },
  easyRead: { letter: 0.0, word: 0.01, maxCh: 84 },
  smoothComfort: { letter: 0.01, word: 0.03, maxCh: 75 },
};

function setNumber(id: string, value: number) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.value = String(value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function wireTypographyPresets(): void {
  const row = document.getElementById('typographyPresetsRow');
  if (!row) return;
  const applyBoth = document.getElementById('typoPresetApplyBoth') as HTMLInputElement | null;

  row.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest?.('[data-typo-preset]') as HTMLElement | null;
    if (!btn) return;
    const preset = btn.getAttribute('data-typo-preset') as PresetName | null;
    if (!preset) return;

    const p = PRESETS[preset];
    const both = !!applyBoth?.checked;

    setNumber('typoLetter-display', p.letter);
    setNumber('typoWord-display', p.word);
    setNumber('typoMaxCh-display', p.maxCh);

    if (both) {
      setNumber('typoLetter-main', p.letter);
      setNumber('typoWord-main', p.word);
      setNumber('typoMaxCh-main', p.maxCh);
    }

    row.querySelectorAll<HTMLElement>('[data-typo-preset]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-typo-preset') === preset);
    });
  });
}
