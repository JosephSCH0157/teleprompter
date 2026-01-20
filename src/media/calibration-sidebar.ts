import { getAsrState, onAsr, setActiveProfile } from '../asr/store';

const SELECT_ID = 'sidebarCalSelect';
const STATUS_ID = 'sidebarCalStatus';
const CHIP_ID = 'asrCalChip';
const MANAGE_ID = 'sidebarCalManage';

function getSelect(): HTMLSelectElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(SELECT_ID) as HTMLSelectElement | null;
}

function getStatusEl(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(STATUS_ID);
}

function getChip(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(CHIP_ID);
}

function getManageBtn(): HTMLButtonElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(MANAGE_ID) as HTMLButtonElement | null;
}

function formatStatus(activeLabel?: string | null) {
  return activeLabel ? `✅ Active: ${activeLabel}` : '⚠️ No calibration selected';
}

function formatChip(activeLabel?: string | null) {
  return activeLabel ? `ASR: Calibrated (${activeLabel})` : 'ASR: No calibration';
}

function renderOptions(): void {
  const select = getSelect();
  if (!select) return;
  const state = getAsrState();
  const entries = Object.entries(state.profiles || {});
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = entries.length ? 'Select calibration...' : 'No saved calibrations yet';
  select.appendChild(placeholder);
  entries
    .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
    .forEach(([id, profile]) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = profile.label || id;
      select.appendChild(opt);
    });
  const activeId = state.activeProfileId || '';
  const hasActive = activeId && entries.some(([id]) => id === activeId);
  if (!hasActive && activeId) {
    setActiveProfile('');
    return;
  }
  if (hasActive) {
    select.value = activeId;
  } else {
    select.value = '';
  }
  updateStatusElements(hasActive ? state.profiles[activeId] : null);
}

function updateStatusElements(activeProfile: { label?: string } | null) {
  const statusEl = getStatusEl();
  const chipEl = getChip();
  const label = activeProfile?.label || '';
  if (statusEl) {
    statusEl.textContent = formatStatus(label || null);
  }
  if (chipEl) {
    chipEl.textContent = formatChip(label || null);
  }
}

let wired = false;

export function wireSidebarCalibrationUI(): void {
  if (wired) return;
  wired = true;
  const select = getSelect();
  const manageBtn = getManageBtn();
  if (select) {
    renderOptions();
    select.addEventListener('change', () => {
      const value = select.value || '';
      setActiveProfile(value || '');
    });
  }
  if (manageBtn) {
    manageBtn.addEventListener('click', () => {
      try {
        const openAsr = (window as any).openSettingsToAsr;
        if (typeof openAsr === 'function') {
          openAsr(false);
          return;
        }
        document.getElementById('settingsBtn')?.click();
      } catch {}
    });
  }
  onAsr(() => renderOptions());
  renderOptions();
}

export function focusSidebarCalibrationSelect(): boolean {
  const select = getSelect();
  if (!select) return false;
  try {
    select.focus({ preventScroll: true });
  } catch {}
  try {
    select.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } catch {}
  try {
    select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  } catch {}
  try {
    select.click();
  } catch {}
  return true;
}
