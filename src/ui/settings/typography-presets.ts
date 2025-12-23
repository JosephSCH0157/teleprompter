// src/ui/settings/typography-presets.ts

export type PresetName = 'default' | 'easyRead' | 'smoothComfort';

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

function setActivePreset(rowEl: HTMLElement, preset: PresetName): void {
  rowEl.querySelectorAll<HTMLElement>('[data-typo-preset]').forEach((b) => {
    const isActive = b.getAttribute('data-typo-preset') === preset;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', String(isActive));
  });
}

export function applyTypographyPresetByName(preset: PresetName, opts?: { applyToMain?: boolean }) {
  const p = PRESETS[preset];
  if (!p) return;

  setNumber('typoLetter-display', p.letter);
  setNumber('typoWord-display', p.word);
  setNumber('typoMaxCh-display', p.maxCh);

  if (opts?.applyToMain) {
    setNumber('typoLetter-main', p.letter);
    setNumber('typoWord-main', p.word);
    setNumber('typoMaxCh-main', p.maxCh);
  }

  const rowEl = document.getElementById('typographyPresetsRow') as HTMLElement | null;
  if (rowEl) setActivePreset(rowEl, preset);
}

export function wireTypographyPresets(): void {
  const row = document.getElementById('typographyPresetsRow');
  if (!row) return;
  const rowEl = row as HTMLElement;
  // Prevent double-wiring if settings remounts or get re-injected
  if (rowEl.dataset.wired === '1') return;
  rowEl.dataset.wired = '1';
  const applyBoth = document.getElementById('typoPresetApplyBoth') as HTMLInputElement | null;

  rowEl.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest?.('[data-typo-preset]') as HTMLElement | null;
    if (!btn) return;
    const preset = btn.getAttribute('data-typo-preset') as PresetName | null;
    if (!preset) return;

    const both = !!applyBoth?.checked;

    applyTypographyPresetByName(preset, { applyToMain: both });
  });
}
