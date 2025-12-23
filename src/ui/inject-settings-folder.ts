// src/ui/inject-settings-folder.ts
// Ensures the mapped-folder controls exist inside the Settings panel.
// Creates a compact row with: Choose Folder, Recheck, Scripts <select>, hidden fallback input.
export function ensureSettingsFolderControls() {
  // Host resolution: prefer the Media settings panel; bail if it isn't present yet.
  const settingsBody = document.getElementById('settingsBody') as HTMLElement | null;
  const mediaPanel =
    (settingsBody?.querySelector<HTMLElement>('[data-settings-panel="media"]')
      ?? document.querySelector<HTMLElement>('[data-settings-panel="media"]'))
    || document.querySelector<HTMLElement>('[data-tab-content="media"]');

  if (!mediaPanel) {
    return false;
  }

  // If legacy external scripts row exists in sidebar, hide it (will be relocated here).
  try {
    const legacyRow = document.getElementById('externalScriptsRow');
    if (legacyRow) legacyRow.style.display = 'none';
  } catch {}

  // Reuse an existing card/controls if they already exist, but move them under the Media panel.
  const existingControls = document.querySelector('#chooseFolderBtn, #scriptSelect, #recheckFolderBtn');
  let card = (document.getElementById('scriptsFolderCard') || existingControls?.closest<HTMLElement>('.settings-card, [data-settings-panel]')) as HTMLElement | null;

  // Card wrapper (Settings overlay uses cards keyed by data-tab). Place under 'media' tab alongside recording controls.
  if (!card) {
    card = document.createElement('div');
    card.className = 'settings-card settings-card--scripts';
    card.id = 'scriptsFolderCard';
    (card as any).dataset.tab = 'media';

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
  } else {
    // Normalize id/classes on reused nodes
    if (!card.id) card.id = 'scriptsFolderCard';
    card.classList.add('settings-card');
    card.classList.add('settings-card--scripts');
    (card as any).dataset.tab = 'media';
  }

  // Always insert inside the Media panel (Recording/Media tab)
  if (card.parentElement !== mediaPanel) mediaPanel.appendChild(card);
  signalSettingsFolderReady('injected');

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
              signalSettingsFolderReady('reinjected');
            }
          }
        }
      } catch {}
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { try { mo.disconnect(); } catch {} }, WATCH_MS + 5000);
  } catch {}
}

function signalSettingsFolderReady(reason: 'injected'|'reinjected') {
  try {
    window.dispatchEvent(new CustomEvent('tp:settings-folder:ready', {
      detail: { reason, ts: Date.now() }
    }));
  } catch {}
}
