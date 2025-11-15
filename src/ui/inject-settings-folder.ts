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

  // Prefer inserting inside the General tab content container if present
  const generalContainer = document.querySelector('[data-tab-content="general"]') as HTMLElement | null;
  if (generalContainer) generalContainer.appendChild(card); else host.appendChild(card);

  // Ensure visibility tracks the active tab, even if injected after initial tab wiring.
  // If we managed to place it inside the General tab content, we don't need custom visibility wiring.

  try { (window as any).HUD?.log?.('settings:folder:injected', { late: false }); } catch {}
  return true;
}

// Async variant: observes DOM for late-mounted Settings panel up to timeoutMs.
export function ensureSettingsFolderControlsAsync(timeoutMs = 6000) {
  try {
    if (ensureSettingsFolderControls()) {
      // Also start persistence watcher in case another script removes the card later.
      startPersistenceWatcher();
      return;
    }
    const obs = new MutationObserver(() => {
      try {
        if (ensureSettingsFolderControls()) {
          obs.disconnect();
          try { (window as any).HUD?.log?.('settings:folder:injected', { late: true }); } catch {}
          startPersistenceWatcher();
        }
      } catch {}
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { try { obs.disconnect(); } catch {} }, timeoutMs);
  } catch {}
}

// Persistence watcher: if scripts folder card is removed after injection, re-inject it.
function startPersistenceWatcher() {
  try {
    const WATCH_MS = 120000; // cap auto-reinjection window (2 min) to avoid infinite loops
    const start = Date.now();
    const mo = new MutationObserver(() => {
      try {
        const present = document.getElementById('scriptsFolderCard');
        if (!present && Date.now() - start < WATCH_MS) {
          // Only attempt reinjection if host (#settingsBody) still exists
          const host = document.getElementById('settingsBody');
          if (host) {
            const ok = ensureSettingsFolderControls();
            if (ok) {
              try { (window as any).HUD?.log?.('settings:folder:reinjected', {}); } catch {}
            }
          }
        }
      } catch {}
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { try { mo.disconnect(); } catch {} }, WATCH_MS + 5000);
  } catch {}
}
