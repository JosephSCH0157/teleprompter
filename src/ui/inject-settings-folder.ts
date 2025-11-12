// src/ui/inject-settings-folder.ts
// Ensures the mapped-folder controls exist inside the Settings panel.
// Creates a compact row with: Choose Folder, Recheck, Scripts <select>, hidden fallback input.
export function ensureSettingsFolderControls() {
  // Host resolution: try Settings overlay body first (#settingsBody), then legacy panel fallbacks.
  const settingsBody = document.getElementById('settingsBody') as HTMLElement | null;
  const host = settingsBody || (document.querySelector('#settings, #settingsPanel, [data-panel="settings"], aside.settings, .settings-panel') as HTMLElement | null)
    || (document.querySelector('#menu, #sidebar, [data-role="settings"]') as HTMLElement | null);

  if (!host) return false;

  // Avoid duplicates if controls already exist anywhere in DOM.
  const already = document.querySelector('#chooseFolderBtn, #scriptSelect, #recheckFolderBtn');
  if (already) return true;

  // If legacy external scripts row exists in sidebar, hide it (will be relocated here).
  try {
    const legacyRow = document.getElementById('externalScriptsRow');
    if (legacyRow) legacyRow.style.display = 'none';
  } catch {}

  // Card wrapper (Settings overlay uses cards keyed by data-tab). Place under 'general' tab (primary visibility).
  const card = document.createElement('div');
  card.className = 'settings-card settings-card--scripts';
  card.id = 'scriptsFolderCard';
  (card as any).dataset.tab = 'general';

  card.innerHTML = `
    <h4>Scripts Folder</h4>
    <div class="settings-small">Map a directory of .txt / .md / .docx files; select to load instantly.</div>
    <div class="settings-row settings-mapped-folder">
      <div class="settings-row__controls">
        <button id="chooseFolderBtn" type="button">Choose Folder</button>
        <button id="recheckFolderBtn" type="button" title="Recheck permission">Recheck</button>
        <select id="scriptSelect" class="select-md" aria-label="Mapped folder scripts" style="min-width:240px"></select>
        <input id="folderFallback" type="file" webkitdirectory directory multiple hidden>
      </div>
    </div>
  `;

  host.appendChild(card);

  // Ensure visibility tracks the active tab, even if injected after initial tab wiring.
  try {
    const tabs = document.getElementById('settingsTabs');
  const desired = (card as any).dataset.tab || 'general';
    const update = () => {
      try {
        const activeBtn = document.querySelector('.settings-tab.active') as HTMLElement | null;
        const active = (activeBtn && (activeBtn as any).dataset.tab) || 'general';
        card.style.display = (active === desired ? 'flex' : 'none');
      } catch {}
    };
    update();
    if (tabs) tabs.addEventListener('click', () => { try { update(); } catch {} }, { capture: true });
  } catch {}

  try { (window as any).HUD?.log?.('settings:folder:injected', { late: false }); } catch {}
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
