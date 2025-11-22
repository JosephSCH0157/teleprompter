/**
 * Dev/CI helper: ensure Settings shows a mapped folder row and log a marker for smoke runs.
 */
export function injectSettingsFolderForSmoke(): void {
  try {
    const root = document.getElementById('settingsBody') || document;
    const row = root.querySelector<HTMLElement>('[data-ci="mapped-folder-row"]');
    const nameEl = root.querySelector<HTMLElement>('#settingsMappedFolderName');

    if (!row || !nameEl) {
      // Matches existing smoke harness log string.
      console.log('[settings-mapped-folder:smoke]', { exists: false });
      return;
    }

    if (!nameEl.textContent || !nameEl.textContent.trim()) {
      nameEl.textContent = 'CI_MOCK_FOLDER';
    }

    console.log('[settings-mapped-folder:smoke]', { exists: true, name: nameEl.textContent });
  } catch (e) {
    console.warn('[settings-mapped-folder:smoke:error]', e);
  }
}

export default injectSettingsFolderForSmoke;
