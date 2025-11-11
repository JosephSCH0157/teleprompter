// src/features/settings/advanced-folder.ts
import {
  fsApiSupported,
  setScriptsFolderFromPicker,
  forgetPersistedFolder,
  getPersistedFolder,
  EVT_FOLDER_CHANGED,
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

  const refreshLabel = async () => {
    const dir = await getPersistedFolder();
    if (labelEl) labelEl.textContent = dir ? (dir as any).name : 'None';
    if (forgetBtn) forgetBtn.disabled = !dir;
  };

  if (chooseBtn && !chooseBtn.dataset.wired) {
    chooseBtn.dataset.wired = '1';
    chooseBtn.addEventListener('click', async () => { await setScriptsFolderFromPicker(); await refreshLabel(); });
  }
  if (forgetBtn && !forgetBtn.dataset.wired) {
    forgetBtn.dataset.wired = '1';
    forgetBtn.addEventListener('click', async () => { await forgetPersistedFolder(); await refreshLabel(); });
  }

  addEventListener(EVT_FOLDER_CHANGED, refreshLabel as any);
  void refreshLabel();

  try { (window as any).__tpAdvancedFolderWired = true; } catch {}
}

// Expose globally for settings.js mount hooks
try { (window as any).initAdvancedFolderControls = initAdvancedFolderControls; } catch {}
