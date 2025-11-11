// src/features/script-folder-browser.js
// Lightweight folder-backed script picker/loader for .txt/.md/.rtf/.text/.docx
// - Injects a small UI row under the Saved Scripts section
// - Persists a chosen directory handle in IndexedDB (Chromium only)
// - Lists eligible files and loads into the main editor, triggering render

(function installScriptFolderBrowser() {
  try {
    if (window.__tpFolderBrowserInstalled) return;
    window.__tpFolderBrowserInstalled = true;
  } catch {}

  // Use central adapter API so Settings and Scripts panel stay in sync
  let Adapter = null;
  (async () => {
    try { Adapter = await import('../adapters/folder-mapper.js'); } catch {}
  })();

  const hasFS = typeof window !== 'undefined' && !!window.showDirectoryPicker;

  // Minimal toast shim
  const toast = (msg, opts) => { try { (window.toast || ((m)=>console.debug('[toast]', m)))(msg, opts); } catch {} };
  const setStatus = (s) => { try { const el = document.getElementById('status'); if (el) el.textContent = s; } catch {} };
  
  async function readFileToEditorByEntry(entry) {
    try {
      if (!Adapter) Adapter = await import('../adapters/folder-mapper.js');
      const text = await Adapter.readScriptFile(entry);
      const name = entry && entry.name ? String(entry.name) : 'File';
      const editor = document.getElementById('editor');
      if (editor) editor.value = text;
      try { editor && editor.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
      try { window.renderScript && window.renderScript(text); } catch {}
      setStatus(`Loaded "${name}" from folder`);
      toast('Script loaded from folder', { type: 'ok' });
      return true;
    } catch { toast('Failed to read file', { type: 'error' }); return false; }
  }

  // UI
  function ensureUi() {
    try {
      // Find insertion point near Saved Scripts dropdown; create the planned row/IDs
      const slots = document.getElementById('scriptSlots');
      const panel = (slots && slots.closest && slots.closest('.panel')) || document.querySelector('aside.panel');
      const ensureRow = () => {
        let row = document.getElementById('folderScriptsRow');
        if (!row) {
          row = document.createElement('div');
          row.className = 'row';
          row.id = 'folderScriptsRow';
          const refreshBtn = document.createElement('button');
          refreshBtn.id = 'refreshFolderBtn';
          refreshBtn.className = 'btn-chip';
          refreshBtn.textContent = 'Refresh';
          refreshBtn.disabled = !hasFS;
          const sel = document.createElement('select');
          sel.id = 'folderScripts';
          sel.className = 'select-md';
          sel.disabled = true;
          row.appendChild(refreshBtn);
          row.appendChild(sel);
          const anchor = (slots && slots.closest && slots.closest('.row')) || null;
          if (panel) {
            if (anchor && anchor.parentElement) anchor.parentElement.insertBefore(row, anchor.nextSibling);
            else panel.appendChild(row);
          } else {
            document.body.appendChild(row);
          }
        }
        return row;
      };
      const row = ensureRow();
      const refreshBtn = row.querySelector('#refreshFolderBtn');
      const sel = row.querySelector('#folderScripts');
      return { row, refreshBtn, sel };
    } catch {
      return null;
    }
  }

  const ui = ensureUi();
  if (!ui) return;

  const state = { entries: [], dir: null };

  async function refreshList() {
    try {
      if (!Adapter) Adapter = await import('../adapters/folder-mapper.js');
      const sel = ui.sel;
      if (!sel) return;
      sel.innerHTML = '';
      state.entries = [];
      const dir = await Adapter.getPersistedFolder();
      state.dir = dir;
      sel.disabled = !dir;
      if (!dir) {
        const opt = document.createElement('option');
        opt.value = ''; opt.textContent = '— No folder mapped —';
        sel.appendChild(opt);
        return;
      }
      state.entries = await Adapter.listScripts(dir);
      const head = document.createElement('option'); head.value = ''; head.textContent = '— Select file —'; sel.appendChild(head);
      for (let i = 0; i < state.entries.length; i++) {
        const e = state.entries[i];
        const opt = document.createElement('option'); opt.value = String(i); opt.textContent = e.name; sel.appendChild(opt);
      }
    } catch {}
  }

  async function loadSelected() {
    try {
      const sel = ui.sel;
      if (!sel) return;
      const val = sel.value;
      if (!val) return;
      const idx = Number(val);
      const entry = state.entries[idx];
      if (!entry) return;
      await readFileToEditorByEntry(entry);
    } catch {}
  }

  // Wire events
  try { ui.refreshBtn && ui.refreshBtn.addEventListener('click', refreshList); } catch {}
  try { ui.sel && ui.sel.addEventListener('change', loadSelected); } catch {}
  try {
    // Refresh when Settings maps/forgets a folder
    (async () => {
      try {
        if (!Adapter) Adapter = await import('../adapters/folder-mapper.js');
        window.addEventListener(Adapter.EVT_FOLDER_CHANGED, refreshList);
      } catch {}
    })();
  } catch {}

  // Restore previously chosen folder (if permission remains granted)
  (async () => {
    try {
      await refreshList();
    } catch {}
  })();
})();
