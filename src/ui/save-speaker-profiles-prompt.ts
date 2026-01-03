import type { SpeakerSlot } from '../types/speaker-profiles';
import type { LearnedPatch } from '../asr/asr-threshold-store';
import {
  createProfile,
  applyProfileToSlot,
  getSpeakerBindings,
  setProfileAsrTweaks,
  getProfile,
} from './speaker-profiles-store';
import { getSessionLearnedPatches, clearSessionLearnedPatches } from '../asr/asr-threshold-store';

const MODAL_ID = 'tp-save-speaker-profiles-modal';
const SLOT_LABELS: Record<SpeakerSlot, string> = {
  s1: 'Speaker 1 (S1)',
  s2: 'Speaker 2 (S2)',
  g1: 'Guest 1 (G1)',
  g2: 'Guest 2 (G2)',
};

function escapeHtml(value: string): string {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hasSessionPatches(patches: Partial<Record<SpeakerSlot, LearnedPatch>>): boolean {
  return Object.values(patches).some((patch) => !!patch && Object.keys(patch).length > 0);
}

function buildModalContent(entries: Array<{ slot: SpeakerSlot; label: string; name: string }>): string {
  const rows = entries
    .map(
      (entry) => `
      <div class="tp-save-speaker-row" data-slot="${entry.slot}">
        <label class="tp-save-speaker-label">${escapeHtml(entry.label)}</label>
        <input class="tp-save-speaker-input" type="text" value="${escapeHtml(entry.name)}" />
      </div>
    `,
    )
    .join('');
  return `
    <div class="tp-save-speaker-panel">
      <h2>Save speaker profiles from this session?</h2>
      <p class="tp-save-speaker-desc">
        We captured tuning tweaks for this read. Save them so the dropdown remembers your names next time.
      </p>
      <div class="tp-save-speaker-rows">
        ${rows}
      </div>
      <div class="tp-save-speaker-actions">
        <button type="button" class="tp-save-speaker-btn tp-save-speaker-save">Save</button>
        <button type="button" class="tp-save-speaker-btn tp-save-speaker-cancel">Not now</button>
      </div>
    </div>
  `;
}

function createModalOverlay(content: string): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = MODAL_ID;
  overlay.className = 'tp-save-speaker-overlay';
  overlay.innerHTML = content;
  overlay.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).id === MODAL_ID) {
      closeModal();
    }
  });
  return overlay;
}

function closeModal(): void {
  const existing = document.getElementById(MODAL_ID);
  if (existing && existing.parentElement) {
    existing.parentElement.removeChild(existing);
  }
}

function applyStyles(): void {
  if (document.getElementById('tp-save-speaker-styles')) return;
  const style = document.createElement('style');
  style.id = 'tp-save-speaker-styles';
  style.textContent = `
    #${MODAL_ID} {
      position: fixed;
      inset: 0;
      background: rgba(5,12,27,0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1600;
      padding: 20px;
    }
    #${MODAL_ID} .tp-save-speaker-panel {
      background: #0f172a;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 12px;
      padding: 20px;
      width: min(420px, 100%);
      color: #f8fafc;
      box-shadow: 0 16px 40px rgba(15,23,42,0.6);
      font-family: system-ui, 'Segoe UI', sans-serif;
    }
    #${MODAL_ID} h2 {
      margin: 0 0 8px;
      font-size: 20px;
    }
    #${MODAL_ID} .tp-save-speaker-desc {
      margin: 0 0 12px;
      font-size: 14px;
      color: rgba(226, 232, 240, 0.75);
    }
    #${MODAL_ID} .tp-save-speaker-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    #${MODAL_ID} .tp-save-speaker-label {
      flex: 0 0 130px;
      font-size: 13px;
      color: rgba(248, 250, 252, 0.9);
    }
    #${MODAL_ID} .tp-save-speaker-input {
      flex: 1;
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid rgba(148,163,184,0.6);
      background: rgba(15,23,42,0.85);
      color: #e2e8f0;
      font-size: 13px;
    }
    #${MODAL_ID} .tp-save-speaker-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 14px;
    }
    #${MODAL_ID} .tp-save-speaker-btn {
      padding: 6px 16px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.3);
      background: transparent;
      color: #e2e8f0;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }
    #${MODAL_ID} .tp-save-speaker-save {
      background: rgba(59,130,246,0.9);
      border-color: rgba(59,130,246,0.9);
    }
  `;
  document.head.appendChild(style);
}

export function maybePromptSaveSpeakerProfiles(mode: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const normalizedMode = (mode || '').toLowerCase();
  if (!['asr', 'hybrid'].includes(normalizedMode)) return;
  if (document.getElementById(MODAL_ID)) return;
  const patches = getSessionLearnedPatches();
  if (!hasSessionPatches(patches)) return;
  const entries: Array<{ slot: SpeakerSlot; label: string; name: string }> = [];

  const bindings = getSpeakerBindings();

  for (const slot of (Object.keys(patches) as SpeakerSlot[])) {
    const patch = patches[slot];
    if (!hasPatchValues(patch)) continue;
    const profileId = bindings[slot] || null;
    const profile = getProfile(profileId);
    const bindingLabel = profile?.name || SLOT_LABELS[slot] || slot.toUpperCase();
    entries.push({
      slot,
      label: SLOT_LABELS[slot] || slot.toUpperCase(),
      name: bindingLabel,
    });
  }
  if (!entries.length) return;

  applyStyles();
  const modal = createModalOverlay(buildModalContent(entries));
  const inputs: Record<string, HTMLInputElement> = {};
  entries.forEach((entry) => {
    const row = modal.querySelector<HTMLDivElement>(`.tp-save-speaker-row[data-slot="${entry.slot}"]`);
    if (!row) return;
    const input = row.querySelector<HTMLInputElement>('input');
    if (!input) return;
    inputs[entry.slot] = input;
  });

  const saveButton = modal.querySelector<HTMLButtonElement>('.tp-save-speaker-save');
  const cancelButton = modal.querySelector<HTMLButtonElement>('.tp-save-speaker-cancel');
  const patchMap = patches;

  const bindingsSnapshot = { ...bindings };

  function handleSave() {
    entries.forEach((entry) => {
      const input = inputs[entry.slot];
      const patch = patchMap[entry.slot];
      if (!patch || !hasPatchValues(patch)) return;
      const name = input?.value?.trim() || entry.label;
      const existingId = bindingsSnapshot[entry.slot] || null;
      if (existingId) {
        setProfileAsrTweaks(existingId, patch);
        applyProfileToSlot(entry.slot, existingId);
      } else {
        const profile = createProfile(name, patch);
        applyProfileToSlot(entry.slot, profile.id);
      }
    });
    clearSessionLearnedPatches();
    closeModal();
  }

  saveButton?.addEventListener('click', handleSave);
  cancelButton?.addEventListener('click', closeModal);

  document.body.appendChild(modal);
}
