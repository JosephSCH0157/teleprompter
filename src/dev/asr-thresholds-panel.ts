import type { AsrThresholds } from '../asr/asr-thresholds';
import { getAsrDriverThresholds, getBaseAsrThresholds, setAsrDriverThresholds } from '../asr/asr-threshold-store';
import { saveDevAsrThresholds } from './dev-thresholds';
import type {
  SpeakerProfile,
  SpeakerSlot,
} from '../types/speaker-profiles';
import {
  getActiveSpeakerSlot,
  getProfileById,
  getSpeakerBindings,
  subscribeActiveSpeaker,
  subscribeSpeakerBindings,
  subscribeSpeakerProfileState,
  setProfileAsrTweaks,
} from '../ui/speaker-profiles-store';

type ThresholdControl = {
  key: keyof AsrThresholds;
  label: string;
  min: number;
  max: number;
  step: number;
  isInt?: boolean;
};

const CONTROLS: ThresholdControl[] = [
  { key: 'candidateMinSim', label: 'Candidate gate', min: 0, max: 1, step: 0.01 },
  { key: 'commitFinalMinSim', label: 'Commit final sim', min: 0, max: 1, step: 0.01 },
  { key: 'commitInterimMinSim', label: 'Commit interim sim', min: 0, max: 1, step: 0.01 },
  { key: 'stickinessDelta', label: 'Stickiness delta', min: 0, max: 0.3, step: 0.01 },
  { key: 'tieDelta', label: 'Tie margin', min: 0, max: 0.2, step: 0.01 },
  { key: 'anchorMinSim', label: 'Anchor min sim', min: 0, max: 1, step: 0.01 },
  { key: 'anchorStreakNeeded', label: 'Anchor streak', min: 1, max: 6, step: 1, isInt: true },
  { key: 'maxAnchorJumpLines', label: 'Anchor max jump', min: 10, max: 200, step: 5, isInt: true },
  { key: 'interimStreakNeeded', label: 'Interim streak', min: 1, max: 5, step: 1, isInt: true },
  { key: 'maxJumpsPerSecond', label: 'Max jumps/sec', min: 1, max: 8, step: 1, isInt: true },
];

const OVERRIDE_CONTROLS: ThresholdControl[] = [
  { key: 'commitInterimMinSim', label: 'Commit interim sim', min: 0, max: 1, step: 0.01 },
  { key: 'stickinessDelta', label: 'Stickiness delta', min: 0, max: 0.3, step: 0.01 },
  { key: 'tieDelta', label: 'Tie margin', min: 0, max: 0.2, step: 0.01 },
  { key: 'interimStreakNeeded', label: 'Interim streak', min: 1, max: 5, step: 1, isInt: true },
  { key: 'maxJumpsPerSecond', label: 'Max jumps/sec', min: 1, max: 10, step: 1, isInt: true },
];

function isDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__TP_DEV || w.__TP_DEV1) return true;
    if (w.localStorage?.getItem('tp_dev_mode') === '1') return true;
    if (/[?&]dev=1/.test(window.location.search || '')) return true;
    return false;
  } catch {
    return false;
  }
}

if (!isDevMode() || typeof document === 'undefined') {
  // nothing to do in production
} else {
  const panel = document.createElement('div');
  panel.id = 'asr-thresholds-panel';
  panel.style.cssText = [
    'position:fixed',
    'bottom:8px',
    'left:8px',
    'padding:10px',
    'background:rgba(0,0,0,0.65)',
    'border:1px solid rgba(255,255,255,0.1)',
    'border-radius:8px',
    'font:12px/1.4 system-ui,Segoe UI,Roboto,Arial,sans-serif',
    'color:#e5ecfb',
    'max-width:320px',
    'z-index:1200',
    'box-shadow:0 12px 32px rgba(0,0,0,0.5)',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'ASR thresholds (dev)';
  title.style.fontWeight = '600';
  title.style.marginBottom = '6px';
  panel.appendChild(title);

  const controlMap: Record<string, { input: HTMLInputElement; value: HTMLElement }> = {};

  const updateDisplayValue = (key: string, value: number, cfg: ThresholdControl) => {
    const entry = controlMap[key];
    if (!entry) return;
    const display = cfg.isInt ? String(Math.round(value)) : value.toFixed(2);
    entry.value.textContent = display;
    entry.input.value = String(value);
  };

  const syncControls = () => {
    const thresholds = getAsrDriverThresholds();
    CONTROLS.forEach((cfg) => {
      const value = thresholds[cfg.key];
      if (!Number.isFinite(value)) return;
      updateDisplayValue(cfg.key, value, cfg);
    });
  };

  const handleInput = (cfg: ThresholdControl, value: number) => {
    const normalized = cfg.isInt ? Math.max(cfg.min, Math.min(cfg.max, Math.round(value))) : value;
    setAsrDriverThresholds({ [cfg.key]: normalized });
    saveDevAsrThresholds(getAsrDriverThresholds());
    updateDisplayValue(cfg.key, normalized, cfg);
  };

  CONTROLS.forEach((cfg) => {
    const line = document.createElement('label');
    line.style.display = 'flex';
    line.style.alignItems = 'center';
    line.style.marginBottom = '6px';
    line.style.gap = '6px';
    const label = document.createElement('span');
    label.textContent = cfg.label;
    label.style.flex = '1';
    const value = document.createElement('span');
    value.style.minWidth = '42px';
    value.style.textAlign = 'right';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(cfg.min);
    input.max = String(cfg.max);
    input.step = String(cfg.step);
    input.style.flex = '1';
    input.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      const parsed = Number.parseFloat(target.value);
      if (Number.isNaN(parsed)) return;
      handleInput(cfg, parsed);
    });
    controlMap[cfg.key] = { input, value };
    line.appendChild(label);
    line.appendChild(input);
    line.appendChild(value);
    panel.appendChild(line);
  });

  const overrideSection = document.createElement('div');
  overrideSection.style.marginTop = '12px';
  overrideSection.style.paddingTop = '10px';
  overrideSection.style.borderTop = '1px solid rgba(255,255,255,0.1)';
  panel.appendChild(overrideSection);

  const overrideHeader = document.createElement('div');
  overrideHeader.textContent = 'Profile overrides (Active slot)';
  overrideHeader.style.fontWeight = '600';
  overrideHeader.style.marginBottom = '6px';
  overrideSection.appendChild(overrideHeader);

  const slotSelector = document.createElement('div');
  slotSelector.style.display = 'flex';
  slotSelector.style.gap = '4px';
  slotSelector.style.flexWrap = 'wrap';
  slotSelector.style.marginBottom = '8px';
  overrideSection.appendChild(slotSelector);

  const overrideButtons: Record<string, HTMLButtonElement> = {};
  const SLOT_KEYS: Array<'active' | SpeakerSlot> = ['active', 's1', 's2', 'g1', 'g2'];
  let overrideTarget: 'active' | SpeakerSlot = 'active';
  let activeSlot: SpeakerSlot = getActiveSpeakerSlot();
  const highlightOverrideTarget = () => {
    SLOT_KEYS.forEach((slotKey) => {
      const btn = overrideButtons[slotKey];
      if (!btn) return;
      const isActive = slotKey === overrideTarget;
      btn.style.background = isActive ? 'rgba(255,255,255,0.2)' : 'transparent';
      btn.style.borderColor = isActive ? '#fff' : 'rgba(255,255,255,0.3)';
    });
  };

  SLOT_KEYS.forEach((slotKey) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = slotKey === 'active' ? 'Active slot' : slotKey.toUpperCase();
    button.style.padding = '4px 8px';
    button.style.border = '1px solid rgba(255,255,255,0.3)';
    button.style.borderRadius = '6px';
    button.style.background = slotKey === overrideTarget ? 'rgba(255,255,255,0.2)' : 'transparent';
    button.style.color = '#e5ecfb';
    button.style.cursor = 'pointer';
    button.style.fontSize = '11px';
    button.style.fontWeight = '600';
    button.addEventListener('click', () => {
      overrideTarget = slotKey;
      highlightOverrideTarget();
      refreshOverrideHeader();
      refreshOverrideControls();
    });
    slotSelector.appendChild(button);
    overrideButtons[slotKey] = button;
  });

  const overrideActions = document.createElement('div');
  overrideActions.style.display = 'flex';
  overrideActions.style.gap = '6px';
  overrideActions.style.marginBottom = '8px';
  overrideSection.appendChild(overrideActions);

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'btn';
  resetButton.textContent = 'Reset overrides';
  resetButton.style.flex = '1';
  overrideActions.appendChild(resetButton);

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'btn';
  copyButton.textContent = 'Copy base → overrides';
  copyButton.style.flex = '1';
  overrideActions.appendChild(copyButton);

  const overrideControlsWrapper = document.createElement('div');
  overrideSection.appendChild(overrideControlsWrapper);

  const overrideControlMap: Record<string, { input: HTMLInputElement; value: HTMLElement }> = {};

  const getTargetSlot = (): SpeakerSlot | null => {
    const slot = overrideTarget === 'active' ? activeSlot : overrideTarget;
    return slot;
  };

  const getTargetProfileId = (): string | null => {
    const slot = getTargetSlot();
    if (!slot) return null;
    const bindings = getSpeakerBindings();
    return bindings[slot] || null;
  };

  const getTargetProfile = () => getProfileById(getTargetProfileId());

  const refreshOverrideHeader = () => {
    const slot = getTargetSlot();
    const profile = getTargetProfile();
    const slotLabel = slot ? slot.toUpperCase() : '—';
    const profileLabel = profile ? ` (${profile.name})` : ' (unbound)';
    const targetLabel = overrideTarget === 'active' ? `Active slot: ${slotLabel}` : slotLabel;
    overrideHeader.textContent = `Profile overrides (${targetLabel}${profile ? profileLabel : (overrideTarget === 'active' ? ' (no profile)' : ' (unbound)')})`;
    const hasProfile = Boolean(profile);
    const hasTweaks = Boolean(profile?.asrTweaks && Object.keys(profile.asrTweaks).length);
    resetButton.disabled = !hasProfile || !hasTweaks;
    copyButton.disabled = !hasProfile;
  };

  const refreshOverrideControls = () => {
    const profile = getTargetProfile();
    const overrides = profile?.asrTweaks || {};
    const base = getBaseAsrThresholds();
    OVERRIDE_CONTROLS.forEach((cfg) => {
      const entry = overrideControlMap[cfg.key];
      if (!entry) return;
      const storedRaw = overrides[cfg.key];
      const baseValue = base[cfg.key];
      const value =
        typeof storedRaw === 'number' && Number.isFinite(storedRaw)
          ? storedRaw
          : baseValue;
      entry.input.value = String(value);
      entry.value.textContent = cfg.isInt ? String(Math.round(value)) : value.toFixed(2);
      entry.input.disabled = !profile;
    });
  };

  const applyOverrideChange = (cfg: ThresholdControl, value: number) => {
    const normalized = cfg.isInt ? Math.max(cfg.min, Math.min(cfg.max, Math.round(value))) : value;
    const profileId = getTargetProfileId();
    const profile = getTargetProfile();
    if (!profileId || !profile) return;
    const base = getBaseAsrThresholds();
    const next: Partial<SpeakerProfile['asrTweaks']> = { ...(profile.asrTweaks || {}) };
    const baseValue = base[cfg.key];
    if (Math.abs(normalized - baseValue) < 0.00001) {
      delete next[cfg.key];
    } else {
      next[cfg.key] = normalized;
    }
    setProfileAsrTweaks(profileId, next);
  };

  resetButton.addEventListener('click', () => {
    const profileId = getTargetProfileId();
    if (!profileId) return;
    setProfileAsrTweaks(profileId, undefined);
  });

  copyButton.addEventListener('click', () => {
    const profileId = getTargetProfileId();
    if (!profileId) return;
    const base = getBaseAsrThresholds();
    const payload: Partial<SpeakerProfile['asrTweaks']> = {};
    OVERRIDE_CONTROLS.forEach((cfg) => {
      payload[cfg.key] = base[cfg.key];
    });
    setProfileAsrTweaks(profileId, payload);
  });

  OVERRIDE_CONTROLS.forEach((cfg) => {
    const line = document.createElement('label');
    line.style.display = 'flex';
    line.style.alignItems = 'center';
    line.style.marginBottom = '6px';
    line.style.gap = '6px';
    const label = document.createElement('span');
    label.textContent = cfg.label;
    label.style.flex = '1';
    const value = document.createElement('span');
    value.style.minWidth = '42px';
    value.style.textAlign = 'right';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(cfg.min);
    input.max = String(cfg.max);
    input.step = String(cfg.step);
    input.style.flex = '1';
    input.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      const parsed = Number.parseFloat(target.value);
      if (Number.isNaN(parsed)) return;
      applyOverrideChange(cfg, parsed);
    });
    overrideControlMap[cfg.key] = { input, value };
    line.appendChild(label);
    line.appendChild(input);
    line.appendChild(value);
    overrideControlsWrapper.appendChild(line);
  });

  const handleOverrideStateUpdate = () => {
    refreshOverrideHeader();
    refreshOverrideControls();
  };

  subscribeActiveSpeaker((slot) => {
    activeSlot = slot;
    handleOverrideStateUpdate();
  });

  subscribeSpeakerBindings(() => {
    handleOverrideStateUpdate();
  });

  subscribeSpeakerProfileState(() => {
    handleOverrideStateUpdate();
  });

  document.body.appendChild(panel);

  const onWindowThreshold = () => {
    syncControls();
  };
  window.addEventListener('tp:asr:thresholds', onWindowThreshold as EventListener);
  syncControls();
}
