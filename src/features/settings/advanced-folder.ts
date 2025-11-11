// src/features/settings/advanced-folder.ts
import {
    EVT_FOLDER_CHANGED,
    forgetPersistedFolder,
    fsApiSupported,
    getPersistedFolder,
    setScriptsFolderFromPicker,
} from '../../adapters/folder-mapper';

export function initAdvancedFolderControls() {
  // Idempotent wiring guard
  try { if ((window as any).__tpAdvancedFolderWired) return; } catch {}

  const chooseBtn  = document.getElementById('btnChooseScriptsFolder') as HTMLButtonElement | null;
  const forgetBtn  = document.getElementById('btnForgetScriptsFolder') as HTMLButtonElement | null;
  const labelEl    = document.getElementById('scriptsFolderLabel') as HTMLSpanElement | null;
  const unsupported= document.getElementById('scriptsFolderUnsupported') as HTMLElement | null;

  const supported = fsApiSupported();
  if (chooseBtn) chooseBtn.style.display = supported ? '' : 'none';
  if (unsupported) unsupported.style.display = supported ? 'none' : '';

  let hadDir = false;
  const refreshLabel = async () => {
    const dir = await getPersistedFolder();
    if (labelEl) labelEl.textContent = dir ? (dir as any).name : 'None';
    if (forgetBtn) forgetBtn.disabled = !dir;
    // One-time toast when previously mapped folder becomes unavailable
    try {
      if (!dir && hadDir) { (window as any).HUD?.toast?.('Mapped folder not available. Check permissions or device.'); }
      hadDir = !!dir;
    } catch {}
  };

  if (chooseBtn && !chooseBtn.dataset.wired) {
    chooseBtn.dataset.wired = '1';
    chooseBtn.addEventListener('click', async () => {
      try { await setScriptsFolderFromPicker(); }
      catch (e) { try { console.error(e); } catch {}; try { (window as any).HUD?.toast?.('Could not access folder.'); } catch {} }
      await refreshLabel();
    });
  }
  if (forgetBtn && !forgetBtn.dataset.wired) {
    forgetBtn.dataset.wired = '1';
    forgetBtn.addEventListener('click', async () => {
      try { await forgetPersistedFolder(); }
      catch (e) { try { console.error(e); } catch {}; try { (window as any).HUD?.toast?.('Could not forget folder.'); } catch {} }
      await refreshLabel();
    });
  }

  addEventListener(EVT_FOLDER_CHANGED, refreshLabel as any);
  void refreshLabel();

  try { (window as any).__tpAdvancedFolderWired = true; } catch {}
}

// Expose globally for settings.js mount hooks
try { (window as any).initAdvancedFolderControls = initAdvancedFolderControls; } catch {}
