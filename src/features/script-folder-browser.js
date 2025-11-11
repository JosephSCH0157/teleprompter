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

  const EXTS = new Set(['.txt', '.md', '.rtf', '.text', '.docx']);
  const DB_NAME = 'tp_fs_handles_v1';
  const STORE = 'dirs';
  const KEY = 'scriptsDir';

  const hasFS = typeof window !== 'undefined' && !!window.showDirectoryPicker;

  // Minimal toast shim
  const toast = (msg, opts) => {
    try { (window.toast || window.__toast || (()=>{}))(msg, opts); } catch {}
  };
  const setStatus = (s) => { try { const el = document.getElementById('status'); if (el) el.textContent = s; } catch {} };

  // IDB helpers (gracefully no-op when blocked)
  const openDb = () => new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        try { req.result.createObjectStore(STORE); } catch {}
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  const idbGet = async (key) => {
    try {
      const db = await openDb(); if (!db) return null;
      return await new Promise((res) => {
        try {
          const tx = db.transaction(STORE, 'readonly');
          const st = tx.objectStore(STORE);
          const r = st.get(key);
          r.onsuccess = () => res(r.result || null);
          r.onerror = () => res(null);
        } catch { res(null); }
      });
    } catch { return null; }
  };
  const idbPut = async (key, val) => {
    try {
      const db = await openDb(); if (!db) return false;
      return await new Promise((res) => {
        try {
          const tx = db.transaction(STORE, 'readwrite');
          const st = tx.objectStore(STORE);
          const r = st.put(val, key);
          r.onsuccess = () => res(true);
          r.onerror = () => res(false);
        } catch { res(false); }
      });
    } catch { return false; }
  };

  // File System helpers
  const getPerm = async (h) => {
    try {
      if (!h || typeof h.queryPermission !== 'function') return 'denied';
      const cur = await h.queryPermission({ mode: 'read' });
      if (cur === 'granted') return 'granted';
      if (typeof h.requestPermission === 'function') {
        return await h.requestPermission({ mode: 'read' });
      }
    } catch {}
    return 'denied';
  };

  const listEligibleFiles = async (dirHandle) => {
    const out = [];
    try {
      if (!dirHandle) return out;
      for await (const [name, handle] of dirHandle.entries()) {
        try {
          if (handle.kind !== 'file') continue;
          const lower = (name || '').toLowerCase();
          const ext = lower.slice(lower.lastIndexOf('.'));
          if (!EXTS.has(ext)) continue;
          out.push({ name, handle });
        } catch {}
      }
    } catch {}
    out.sort((a,b) => a.name.localeCompare(b.name));
    return out;
  };

  // Docx support via Mammoth (CDN)
  async function ensureMammoth() {
    try { if (window.mammoth) return window.mammoth; } catch {}
    try {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/mammoth/mammoth.browser.min.js';
      s.async = true; document.head.appendChild(s);
      await new Promise((res, rej) => { s.onload = res; s.onerror = rej; });
      return window.mammoth || null;
    } catch { return null; }
  }

  async function readFileToEditor(fileHandle) {
    try {
      const file = await fileHandle.getFile();
      const lower = (file.name || '').toLowerCase();
      const isDocx = lower.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      let text = '';
      if (isDocx) {
        try {
          const mammoth = await ensureMammoth();
          if (!mammoth) throw new Error('mammoth missing');
          const arrayBuffer = await file.arrayBuffer();
          const { value } = await mammoth.extractRawText({ arrayBuffer });
          text = String(value || '');
        } catch {
          toast('Failed to read .docx', { type: 'error' });
          return false;
        }
      } else {
        text = await file.text();
      }
      // Normalize line endings and mild cleanup
      text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      const editor = document.getElementById('editor');
      if (editor) editor.value = text;
      try { editor && editor.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
      try { window.renderScript && window.renderScript(text); } catch {}
      setStatus(`Loaded "${file.name}" from folder`);
      toast('Script loaded from folder', { type: 'ok' });
      return true;
    } catch {
      toast('Failed to read file', { type: 'error' });
      return false;
    }
  }

  // UI
  function createUi() {
    try {
      // Find insertion point near Saved Scripts dropdown
      const slots = document.getElementById('scriptSlots');
      const panel = (slots && slots.closest && slots.closest('.panel')) || document.querySelector('aside.panel');
      const row = document.createElement('div');
      row.className = 'row';
      row.id = 'folderScriptsRow';

      const label = document.createElement('label');
      label.textContent = 'Folder Scripts';

      const pickBtn = document.createElement('button');
      pickBtn.id = 'folderPickBtn';
      pickBtn.textContent = hasFS ? 'Choose Folder' : 'Folder (unsupported)';
      if (!hasFS) pickBtn.disabled = true;

      const refreshBtn = document.createElement('button');
      refreshBtn.id = 'folderRefreshBtn';
      refreshBtn.textContent = 'Refresh';
      if (!hasFS) refreshBtn.disabled = true;

      const sel = document.createElement('select');
      sel.id = 'folderFiles';
      sel.className = 'select-md';
      sel.ariaLabel = 'Folder files';

      const loadBtn = document.createElement('button');
      loadBtn.id = 'folderLoadBtn';
      loadBtn.textContent = 'Load from Folder';
      if (!hasFS) loadBtn.disabled = true;

      const folderName = document.createElement('span');
      folderName.id = 'folderNameLabel';
      folderName.className = 'chip';
      folderName.style.marginLeft = '8px';
      folderName.textContent = 'No folder';

      row.appendChild(label);
      row.appendChild(pickBtn);
      row.appendChild(refreshBtn);
      row.appendChild(sel);
      row.appendChild(loadBtn);
      row.appendChild(folderName);

      if (panel) {
        // Insert after Saved Scripts rows if possible
        const anchor = (slots && slots.closest && slots.closest('.row')) || null;
        if (anchor && anchor.parentElement) {
          anchor.parentElement.insertBefore(row, anchor.nextSibling);
        } else {
          panel.appendChild(row);
        }
      } else {
        document.body.appendChild(row);
      }

      return { row, pickBtn, refreshBtn, sel, loadBtn, folderName };
    } catch {
      return null;
    }
  }

  const ui = createUi();
  if (!ui) return;

  let currentDir = null; // FileSystemDirectoryHandle
  let filesIdx = new Map(); // name -> handle

  async function persistDir(h) {
    try { await idbPut(KEY, h); } catch {}
  }
  async function restoreDir() {
    if (!hasFS) return null;
    try {
      const h = await idbGet(KEY);
      return h || null;
    } catch { return null; }
  }

  async function setFolderName(h) {
    try {
      const name = h ? (h.name || 'folder') : 'No folder';
      ui.folderName.textContent = name;
    } catch { ui.folderName.textContent = 'No folder'; }
  }

  async function refreshList() {
    try {
      ui.sel.innerHTML = '';
      filesIdx.clear();
      if (!currentDir) return;
      const files = await listEligibleFiles(currentDir);
      for (const f of files) {
        const opt = document.createElement('option');
        opt.value = f.name; opt.textContent = f.name;
        ui.sel.appendChild(opt);
        filesIdx.set(f.name, f.handle);
      }
      if (!files.length) {
        const opt = document.createElement('option');
        opt.value = ''; opt.textContent = '(No supported files)';
        ui.sel.appendChild(opt);
      }
    } catch {}
  }

  async function pickFolderFlow() {
    if (!hasFS) return;
    try {
      const h = await window.showDirectoryPicker({ mode: 'read' });
      currentDir = h;
      await persistDir(h);
      await setFolderName(h);
      await refreshList();
      toast('Folder selected', { type: 'ok' });
    } catch {
      // user cancelled or blocked (silent)
      try { console.debug('[folder] pick cancelled/blocked'); } catch {}
    }
  }

  async function loadSelected() {
    try {
      const name = ui.sel.value;
      if (!name) { toast('Choose a file', { type: 'warn' }); return; }
      const h = filesIdx.get(name);
      if (!h) { toast('File not found', { type: 'error' }); return; }
      await readFileToEditor(h);
    } catch {}
  }

  // Wire events
  try { ui.pickBtn.addEventListener('click', pickFolderFlow); } catch {}
  try { ui.refreshBtn.addEventListener('click', refreshList); } catch {}
  try { ui.loadBtn.addEventListener('click', loadSelected); } catch {}

  // Restore previously chosen folder (if permission remains granted)
  (async () => {
    try {
      const h = await restoreDir();
      if (h) {
        const p = await getPerm(h);
        if (p === 'granted') {
          currentDir = h;
          await setFolderName(h);
          await refreshList();
        }
      }
    } catch {}
  })();
})();
