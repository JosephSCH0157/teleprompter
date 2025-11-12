// src/ui/inject-settings-folder.js
// Ensures the mapped-folder controls exist inside the Settings panel (JS path).

export function ensureSettingsFolderControls() {
  try {
    const settingsBody = document.getElementById('settingsBody');
    const host = settingsBody || document.querySelector('#settings, #settingsPanel, [data-panel="settings"], aside.settings, .settings-panel') || document.querySelector('#menu, #sidebar, [data-role="settings"]');
    if (!host) return false;

    // Avoid duplicates
    const already = document.querySelector('#chooseFolderBtn, #scriptSelect, #recheckFolderBtn');
    if (already) return true;

    // Hide legacy external scripts row if present
    try { const legacyRow = document.getElementById('externalScriptsRow'); if (legacyRow) legacyRow.style.display = 'none'; } catch {}

    const card = document.createElement('div');
    card.className = 'settings-card settings-card--scripts';
    card.id = 'scriptsFolderCard';
    card.dataset.tab = 'general';
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

    // Track tab visibility
    try {
      const tabs = document.getElementById('settingsTabs');
      const desired = card.dataset.tab || 'general';
      const update = () => {
        try {
          const activeBtn = document.querySelector('.settings-tab.active');
          const active = (activeBtn && activeBtn.dataset && activeBtn.dataset.tab) || 'general';
          card.style.display = (active === desired ? 'flex' : 'none');
        } catch {}
      };
      update();
      if (tabs) tabs.addEventListener('click', () => { try { update(); } catch {} }, { capture: true });
    } catch {}

    try { (window.HUD || window.__tpHud)?.log?.('settings:folder:injected', { late: false }); } catch {}
    return true;
  } catch { return false; }
}

export function ensureSettingsFolderControlsAsync(timeoutMs = 6000) {
  try {
    if (ensureSettingsFolderControls()) { startPersistenceWatcher(); return; }
    const obs = new MutationObserver(() => {
      try {
        if (ensureSettingsFolderControls()) {
          obs.disconnect();
          try { (window.HUD || window.__tpHud)?.log?.('settings:folder:injected', { late: true }); } catch {}
          startPersistenceWatcher();
        }
      } catch {}
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { try { obs.disconnect(); } catch {} }, timeoutMs);
  } catch {}
}

function startPersistenceWatcher() {
  try {
    const WATCH_MS = 120000;
    const start = Date.now();
    const mo = new MutationObserver(() => {
      try {
        const present = document.getElementById('scriptsFolderCard');
        if (!present && Date.now() - start < WATCH_MS) {
          const host = document.getElementById('settingsBody');
          if (host) {
            const ok = ensureSettingsFolderControls();
            if (ok) { try { (window.HUD || window.__tpHud)?.log?.('settings:folder:reinjected', {}); } catch {} }
          }
        }
      } catch {}
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { try { mo.disconnect(); } catch {} }, WATCH_MS + 5000);
  } catch {}
}
