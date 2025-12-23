const SPEAKER_COLOR_SELECTORS: Array<readonly [string, string]> = [
  ['s1', '#color-s1'],
  ['s2', '#color-s2'],
  ['g1', '#color-g1'],
  ['g2', '#color-g2'],
];

function applySpeakerColorVars(): void {
  try {
    const root = document.documentElement;
    const colors: Record<string, string> = {};
    for (const [key, selector] of SPEAKER_COLOR_SELECTORS) {
      const input = document.querySelector<HTMLInputElement>(selector);
      const value = input?.value?.trim();
      if (!value) continue;
      root.style.setProperty(`--tp-speaker-${key}`, value);
      root.style.setProperty(`--${key}-color`, value);
      colors[key] = value;
    }
    if (Object.keys(colors).length) {
      try {
        window.sendToDisplay?.({ type: 'speaker-colors', colors });
      } catch {}
    }
  } catch {
    // best-effort
  }
}

function wireSpeakerColorPickers(): void {
  try {
    for (const [, selector] of SPEAKER_COLOR_SELECTORS) {
      const el = document.querySelector<HTMLInputElement>(selector);
      if (!el) continue;
      el.addEventListener('input', applySpeakerColorVars);
      el.addEventListener('change', applySpeakerColorVars);
    }
    applySpeakerColorVars();
  } catch {}
}

// Simple show/hide toggle for the Speakers panel using data hooks.
export function initSpeakersPanel(): void {
  const panel = document.querySelector<HTMLElement>('[data-tp-speakers-panel]');
  if (!panel) return;

  const toggle = panel.querySelector<HTMLButtonElement>('[data-tp-toggle-speakers]');
  const body = panel.querySelector<HTMLElement>('.settings-card-body') || panel.querySelector<HTMLElement>('[data-panel="speakers"]');
  if (!toggle || !body) return;

  let visible = true;

  const apply = () => {
    if (visible) {
      body.style.display = '';
      toggle.textContent = 'Hide speakers menu';
      toggle.setAttribute('aria-expanded', 'true');
    } else {
      body.style.display = 'none';
      toggle.textContent = 'Show speakers menu';
      toggle.setAttribute('aria-expanded', 'false');
    }
  };

  toggle.addEventListener('click', () => {
    visible = !visible;
    apply();
  });

  apply();

  try {
    (window as any).tpToggleSpeakers = () => {
      visible = !visible;
      apply();
    };
  } catch {
    // ignore
  }
}

// Auto-init on DOM ready for sidebar usage
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try { initSpeakersPanel(); } catch {}
      try { wireSpeakerColorPickers(); } catch {}
    }, { once: true });
  } else {
    initSpeakersPanel();
    wireSpeakerColorPickers();
  }
} catch {
  // ignore
}
