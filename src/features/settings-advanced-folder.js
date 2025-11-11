// src/features/settings-advanced-folder.js
// Wiring for Settings → Advanced panel folder mapping controls.
import { fsApiSupported, setScriptsFolderFromPicker, forgetPersistedFolder, getPersistedFolder, EVT_FOLDER_CHANGED } from '../adapters/folder-mapper.js';

export function initAdvancedFolderControls() {
  try {
    const chooseBtn = document.getElementById('btnChooseScriptsFolder');
    const forgetBtn = document.getElementById('btnForgetScriptsFolder');
    const label = document.getElementById('scriptsFolderLabel');
    const unsupported = document.getElementById('scriptsFolderUnsupported');
    const supported = fsApiSupported();
    if (chooseBtn) chooseBtn.style.display = supported ? '' : 'none';
    if (unsupported) unsupported.style.display = supported ? 'none' : '';

    const refreshLabel = async () => {
      try {
        const dir = await getPersistedFolder();
        if (label) label.textContent = dir ? dir.name : 'None';
        if (forgetBtn) forgetBtn.disabled = !dir;
      } catch {}
    };

    chooseBtn && chooseBtn.addEventListener('click', async () => { await setScriptsFolderFromPicker(); await refreshLabel(); });
    forgetBtn && forgetBtn.addEventListener('click', async () => { await forgetPersistedFolder(); await refreshLabel(); });
    window.addEventListener(EVT_FOLDER_CHANGED, refreshLabel);
    refreshLabel();
  } catch {}
}

// Auto-init if panel already in DOM (defensive; boot will also call this)
try { if (document.readyState !== 'loading') { setTimeout(() => { try { initAdvancedFolderControls(); } catch {} }, 0); } } catch {}
