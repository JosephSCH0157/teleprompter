import {
  getSpeakerProfiles,
  setSpeakerBinding,
  getSpeakerBindings,
  subscribeSpeakerBindings,
  upsertSpeakerProfile,
  deleteSpeakerProfile,
  getProfileById,
  getActiveSpeakerSlot,
  setActiveSpeakerSlot,
  subscribeActiveSpeaker,
  type SpeakerSlot,
} from './speaker-profiles-store';

const SPEAKER_COLOR_SELECTORS: Array<readonly [string, string]> = [
  ['s1', '#color-s1'],
  ['s2', '#color-s2'],
  ['g1', '#color-g1'],
  ['g2', '#color-g2'],
];

const PROFILE_SELECTORS: Array<{ slot: SpeakerSlot; selector: string }> = [
  { slot: 's1', selector: '[data-tp-profile-s1]' },
  { slot: 's2', selector: '[data-tp-profile-s2]' },
  { slot: 'g1', selector: '[data-tp-profile-g1]' },
  { slot: 'g2', selector: '[data-tp-profile-g2]' },
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

  const profileManager = panel.querySelector<HTMLElement>('#speakerProfilesManager');
  const profilesList = panel.querySelector<HTMLElement>('[data-tp-profiles-list]');
  const activeLabel = panel.querySelector<HTMLElement>('[data-tp-active-speaker-label]');
  const activeButtons = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-tp-active-speaker-slot]'));
  const profileInputs: Array<{ slot: SpeakerSlot; el: HTMLSelectElement | null }> = PROFILE_SELECTORS.map(({ slot, selector }) => ({
    slot,
    el: panel.querySelector<HTMLSelectElement>(selector),
  }));
  activeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const slot = button.dataset.tpActiveSpeakerSlot as SpeakerSlot | undefined;
      if (!slot) return;
      setActiveSpeakerSlot(slot);
    });
  });
  const refreshProfileSelectors = () => {
    const profiles = getSpeakerProfiles();
    const bindings = getSpeakerBindings();
    const options = [
      { value: '', label: 'Default' },
      ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
    ];
    profileInputs.forEach(({ slot, el }) => {
      if (!el) return;
      const current = bindings[slot] || '';
      el.innerHTML = options
        .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
        .join('');
      el.value = current;
    });
  };

  const highlightActiveSlot = (slot: SpeakerSlot) => {
    activeButtons.forEach((button) => {
      const btnSlot = button.dataset.tpActiveSpeakerSlot as SpeakerSlot | undefined;
      if (!btnSlot) return;
      const isActive = btnSlot === slot;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.classList.toggle('is-active', isActive);
    });
  };

  const updateActiveLabel = (slot: SpeakerSlot) => {
    if (!activeLabel) return;
    const bindings = getSpeakerBindings();
    const profile = getProfileById(bindings[slot] || null);
    const slotName = slot.toUpperCase();
    activeLabel.textContent = `Reading now: ${slotName}${profile ? ` (${profile.name})` : ''}`;
  };

  const renderActiveSpeaker = (slot: SpeakerSlot) => {
    highlightActiveSlot(slot);
    updateActiveLabel(slot);
  };

  const renderProfileList = () => {
    if (!profilesList) return;
    const profiles = getSpeakerProfiles();
    profilesList.innerHTML = profiles
      .map((profile) => `
        <div class="chip">
          ${profile.name}
          ${profile.system ? '' : `<button type="button" data-tp-profile-delete="${profile.id}" class="chip chip-xs">Remove</button>`}
        </div>
      `)
      .join('');
    profilesList.querySelectorAll<HTMLButtonElement>('[data-tp-profile-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.tpProfileDelete;
        if (id) {
          deleteSpeakerProfile(id);
          refreshProfileSelectors();
          renderProfileList();
        }
      });
    });
  };

  const handleBindingsChange = () => {
    refreshProfileSelectors();
    renderActiveSpeaker(getActiveSpeakerSlot());
  };
  subscribeSpeakerBindings(handleBindingsChange);
  subscribeActiveSpeaker(renderActiveSpeaker);

  const manageBtn = panel.querySelector<HTMLButtonElement>('[data-tp-manage-speaker-profiles]');
  const profileNameInput = panel.querySelector<HTMLInputElement>('[data-tp-profile-new-name]');
  const profileCreateBtn = panel.querySelector<HTMLButtonElement>('[data-tp-profile-create]');

  manageBtn?.addEventListener('click', () => {
    if (profileManager?.hasAttribute('hidden')) {
      renderProfileList();
    }
    profileManager?.toggleAttribute('hidden');
  });

  profileCreateBtn?.addEventListener('click', () => {
    const name = profileNameInput?.value?.trim();
    if (!name) return;
    upsertSpeakerProfile({ id: '', name });
    if (profileNameInput) profileNameInput.value = '';
    refreshProfileSelectors();
    renderProfileList();
  });

  profileInputs.forEach(({ slot, el }) => {
    el?.addEventListener('change', () => {
      setSpeakerBinding(slot, el.value || null);
    });
  });

  refreshProfileSelectors();
  renderProfileList();

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
