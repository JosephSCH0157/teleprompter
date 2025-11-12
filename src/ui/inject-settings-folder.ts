// src/ui/inject-settings-folder.ts
// Ensures the mapped-folder controls exist inside the Settings panel.
// Creates a compact row with: Choose Folder, Recheck, Scripts <select>, hidden fallback input.
export function ensureSettingsFolderControls() {
  const host = (document.querySelector('#settings, #settingsPanel, [data-panel="settings"], aside.settings, .settings-panel') as HTMLElement | null)
    || (document.querySelector('#menu, #sidebar, [data-role="settings"]') as HTMLElement | null);

  if (!host) return false;

  // Avoid duplicates if controls already exist anywhere in DOM.
  const already = document.querySelector('#chooseFolderBtn, #scriptSelect, #recheckFolderBtn');
  if (already) return true;

  // Prefer an Advanced section if present
  const advanced = (host.querySelector('[data-section="advanced"], .settings-advanced, #settingsAdvanced') as HTMLElement | null) || host;

  const wrap = document.createElement('div');
  wrap.className = 'settings-row settings-mapped-folder';
  wrap.innerHTML = `
    <div class="settings-row__label">Scripts Folder</div>
    <div class="settings-row__controls">
      <button id="chooseFolderBtn" type="button">Choose Folder</button>
      <button id="recheckFolderBtn" type="button" title="Recheck permission">Recheck</button>
      <select id="scriptSelect" class="select-md" aria-label="Mapped folder scripts" style="min-width: 240px;"></select>
      <input id="folderFallback" type="file" webkitdirectory directory multiple hidden>
    </div>
  `;

  advanced.appendChild(wrap);
  return true;
}

// Async variant: observes DOM for late-mounted Settings panel up to timeoutMs.
export function ensureSettingsFolderControlsAsync(timeoutMs = 6000) {
  try {
    if (ensureSettingsFolderControls()) return;
    const obs = new MutationObserver(() => {
      try {
        if (ensureSettingsFolderControls()) {
          obs.disconnect();
          try { (window as any).HUD?.log?.('settings:folder:injected', { late: true }); } catch {}
        }
      } catch {}
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { try { obs.disconnect(); } catch {} }, timeoutMs);
  } catch {}
}
