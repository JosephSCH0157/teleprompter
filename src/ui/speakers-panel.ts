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
    }, { once: true });
  } else {
    initSpeakersPanel();
  }
} catch {
  // ignore
}
