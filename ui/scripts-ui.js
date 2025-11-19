// ui/scripts-ui.js (runtime-safe)
let Scripts = null;
try {
  const _req = typeof globalThis !== 'undefined' ? globalThis['require'] : undefined;
  if (typeof _req === 'function') {
    try {
      Scripts = _req('../scriptsStore.js')?.Scripts || _req('../scriptsStore.js');
    } catch {
      void 0;
    }
  }
} catch {
  void 0;
}
try {
  if (!Scripts && typeof window !== 'undefined' && window.Scripts) Scripts = window.Scripts;
} catch {
  void 0;
}
// If Scripts isn't available at load time, attempt to dynamically import the fixed module as a fallback
(async function () {
  try {
    if (!Scripts && typeof window !== 'undefined') {
      try {
        const mod = await import('../scriptsStore_fixed.js');
        if (mod && mod.Scripts) Scripts = mod.Scripts;
      } catch {
        // ignore dynamic import failures here; the module may be loaded later by the main app
        void 0;
      }
    }
  } catch {
    void 0;
  }
})();
let safeDOM = null;
let importedToast = null;
// minimal safeDOM fallback
const _safeDOM_fallback = {
  get: (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null),
};
try {
  const _req = typeof globalThis !== 'undefined' ? globalThis['require'] : undefined;
  if (typeof _req === 'function') {
    try {
      safeDOM =
        _req('../utils/safe-dom.js')?.safeDOM ||
        (typeof window !== 'undefined' && window.safeDOM) ||
        _safeDOM_fallback;
    } catch {
      void 0;
    }
    try {
      importedToast =
        _req('./toasts.js')?.toast || (typeof window !== 'undefined' && window.toast) || null;
    } catch {
      void 0;
      importedToast = (typeof window !== 'undefined' && window.toast) || null;
    }
  } else {
    try {
      safeDOM = (typeof window !== 'undefined' && window.safeDOM) || null;
      importedToast = (typeof window !== 'undefined' && window.toast) || null;
    } catch {
    void 0;
  }

  // Ensure we always have a minimal safeDOM implementation
  try {
    if (!safeDOM) safeDOM = _safeDOM_fallback;
  } catch {
  void 0;
}
  }
} catch {
  void 0;
}

let currentScriptId = null;
/**
 * @typedef {{ id: string | null, name: string, backend: 'browser' | 'folder', handle?: FileSystemFileHandle | null }} ScriptRef
 */
/** @type {ScriptRef | null} */
let currentScript = null;
const scriptSlots = safeDOM.get('scriptSlots');
const scriptTitle = safeDOM.get('scriptTitle');
const scriptSaveBtn = safeDOM.get('scriptSaveBtn');
const scriptSaveAsBtn = safeDOM.get('scriptSaveAsBtn');
const scriptLoadBtn = safeDOM.get('scriptLoadBtn');
const scriptDeleteBtn = safeDOM.get('scriptDeleteBtn');
const scriptRenameBtn = safeDOM.get('scriptRenameBtn');
const editor = safeDOM.get('editor');

const toastFn = (msg, opts) => {
  try {
    if (typeof importedToast === 'function') return importedToast(msg, opts);
  } catch {
    console.debug('toastFn import failed');
  }
};

function setCurrentScript(ref) {
  currentScript = ref ? { ...ref, handle: ref?.handle || null } : null;
  currentScriptId = ref && ref.backend === 'browser' ? ref.id : null;
}

function getEditorContent() {
  return editor ? editor.value : '';
}
function setEditorContent(txt) {
  if (editor) editor.value = String(txt || '');
}

function getMappedFolderHandle() {
  try {
    if (typeof window === 'undefined') return null;
    // Prefer direct handle exposed by the main app; fall back to older facade if present
    const h1 = window.__tpFolderHandle || null;
    const h2 = window.__tpFolder?.get?.() || null;
    return h1 || h2 || null;
  } catch {
    return null;
  }
}

function requestFolderScriptsRefresh(reason) {
  try {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('tp:folderScripts:refresh', {
        detail: { reason: reason || 'unknown', ts: Date.now() },
      })
    );
  } catch {
    void 0;
  }
}

async function ensureHandleWritePermission(handle) {
  try {
    const state = await handle.queryPermission?.({ mode: 'readwrite' });
    if (state === 'granted') return true;
    const res = await handle.requestPermission?.({ mode: 'readwrite' });
    return res === 'granted';
  } catch {
    return false;
  }
}

async function writeHandle(handle, text) {
  if (!handle) return false;
  try {
    const ok = await ensureHandleWritePermission(handle);
    if (!ok) return false;
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

function stripExt(name) {
  try {
    return String(name || '').replace(/\.[^.]+$/, '');
  } catch {
    return 'Untitled';
  }
}
function getExt(name, fallback = '.txt') {
  try {
    const m = String(name || '').match(/(\.[^.]+)$/);
    return m ? m[1] : fallback;
  } catch {
    return fallback;
  }
}
function titleValue(fallback = 'Untitled') {
  try {
    const raw = scriptTitle && scriptTitle.value ? scriptTitle.value : '';
    return raw ? raw : fallback;
  } catch {
    return fallback;
  }
}
function ensureFileName(name) {
  const n = String(name || '').trim() || 'Untitled';
  return /\.[a-z0-9]+$/i.test(n) ? n : `${n}.txt`;
}
function updateTitleFromName(name) {
  try {
    if (scriptTitle) scriptTitle.value = stripExt(name || 'Untitled');
  } catch {
    void 0;
  }
}

function upsertFolderOption(name, handle) {
  try {
    const sels = [
      typeof document !== 'undefined' ? document.getElementById('scriptSelect') : null,
      typeof document !== 'undefined' ? document.getElementById('scriptSelectSidebar') : null,
    ].filter(Boolean);
    sels.forEach((sel) => {
      try {
        const optList = Array.from(sel.options || []);
        let opt = optList.find((o) => (o.textContent || '') === name);
        if (!opt) {
          opt = document.createElement('option');
          opt.value = String(sel.options.length || 0);
          opt.textContent = name;
          sel.appendChild(opt);
          sel.dataset.count = String(sel.options.length || 0);
        }
        try {
          opt.__handle = handle;
        } catch {
          void 0;
        }
        opt.selected = true;
        sel.disabled = sel.options.length === 0;
      } catch {
        void 0;
      }
    });
  } catch {
    void 0;
  }
}

function bindFolderSelect(sel) {
  if (!sel) return;
  try {
    if (sel.dataset && sel.dataset.folderSelectWired === '1') return;
    sel.dataset.folderSelectWired = '1';
  } catch {
    void 0;
  }
  sel.addEventListener('change', () => {
    try {
      const opt =
        sel.selectedOptions && sel.selectedOptions[0] ? sel.selectedOptions[0] : sel.options[sel.selectedIndex];
      if (!opt) return;
      const handle = opt.__handle || opt._handle || null;
      const name = opt.textContent || 'Untitled';
      if (handle) {
        setCurrentScript({ id: null, name, backend: 'folder', handle });
        updateTitleFromName(name);
      } else {
        setCurrentScript({ id: null, name, backend: 'browser' });
      }
    } catch {
      void 0;
    }
  });
}

function refreshScriptsDropdown() {
  try {
    const list =
      Scripts && typeof Scripts.list === 'function'
        ? Scripts.list().sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))
        : [];
    if (!scriptSlots) return;
    scriptSlots.innerHTML = list.map((s) => `<option value="${s.id}">${s.title}</option>`).join('');
    if (currentScriptId) scriptSlots.value = currentScriptId;
    else if (scriptSlots) scriptSlots.selectedIndex = -1;
  } catch {
    console.debug('refreshScriptsDropdown');
  }
}

function initScriptsUI() {
  try {
    Scripts && typeof Scripts.init === 'function' && Scripts.init();
    refreshScriptsDropdown();
  } catch {
    console.debug('initScriptsUI');
  }
}

try {
  if (typeof window !== 'undefined') window.initScriptsUI = initScriptsUI;
} catch {
  void 0;
}

function onScriptSave() {
  saveCurrent(getEditorContent());
}

async function saveCurrent(text) {
  try {
    if (!currentScript) {
      await saveAs(text);
      return;
    }
    if (currentScript.backend === 'folder') {
      const ok = await writeHandle(currentScript.handle, text);
      if (!ok) throw new Error('write-failed');
      requestFolderScriptsRefresh('saveCurrent');
      toastFn('Script saved', { type: 'ok' });
      return;
    }
    const title = titleValue(currentScript.name || 'Untitled');
    const id =
      Scripts && typeof Scripts.save === 'function'
        ? Scripts.save({ id: currentScript.id, title, content: text })
        : null;
    setCurrentScript({ id, name: title, backend: 'browser' });
    refreshScriptsDropdown();
    toastFn('Script saved', { type: 'ok' });
  } catch {
    try {
      console.error('onScriptSave error');
    } catch {
      void 0;
    }
    toastFn('Save failed', { type: 'error' });
  }
}
async function saveAs(text) {
  try {
    // Prefer suggesting a distinct name to avoid overwriting the selected file by default
    const curName = currentScript?.name || '';
    const baseTitle = stripExt(curName || titleValue('Untitled')) || 'Untitled';
    const ext = getExt(curName || titleValue('Untitled')) || '.txt';
    let suggested = `${baseTitle} (copy)`;
    const folder = getMappedFolderHandle();
    if (folder) {
      try {
        // If a folder is available, attempt to generate a unique suggestion under that folder
        async function existsInFolder(name) {
          try { await folder.getFileHandle(name, { create: false }); return true; } catch { return false; }
        }
        async function uniqueSuggestion(base, extName) {
          // Start with "Base (copy)" then increment
          let idx = 0;
          while (true) {
            const candidate = idx === 0 ? `${base} (copy)${extName}` : `${base} (copy ${idx+1})${extName}`;
            // Ensure we don't suggest the exact current selection
            if (candidate !== ensureFileName(curName) && !(await existsInFolder(candidate))) return candidate;
            idx += 1;
            if (idx > 200) return `${base}-${Date.now()}${extName}`; // safety valve
          }
        }
        suggested = await uniqueSuggestion(baseTitle, ext);

        if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
          const handle = await window.showSaveFilePicker({
            suggestedName: ensureFileName(suggested),
            startIn: folder,
          });
          const ok = await writeHandle(handle, text);
          if (ok) {
            setCurrentScript({ id: null, name: handle.name || suggested, backend: 'folder', handle });
            updateTitleFromName(handle.name || suggested);
            upsertFolderOption(handle.name || suggested, handle);
            requestFolderScriptsRefresh('saveAs-picker');
            toastFn('Script saved', { type: 'ok' });
            return;
          }
        } else {
          const toName = prompt('Save script as (File System):', ensureFileName(suggested));
          if (toName) {
            try {
              let finalName = ensureFileName(toName);
              // Avoid overwriting the currently selected file name by default
              if (curName && finalName === ensureFileName(curName)) {
                // Choose a unique variant automatically
                finalName = await (async () => {
                  const b = stripExt(curName);
                  const e = getExt(curName);
                  return await (async function next(base){
                    let i = 0;
                    while (true) {
                      const cand = i === 0 ? `${base} (copy)${e}` : `${base} (copy ${i+1})${e}`;
                      try { await folder.getFileHandle(cand, { create: false }); i += 1; }
                      catch { return cand; }
                      if (i > 200) return `${base}-${Date.now()}${e}`;
                    }
                  })(b);
                })();
              }
              const handle = await folder.getFileHandle(finalName, { create: true });
              const ok = await writeHandle(handle, text);
              if (ok) {
                const nm = handle.name || finalName;
                setCurrentScript({ id: null, name: nm, backend: 'folder', handle });
                updateTitleFromName(nm);
                upsertFolderOption(nm, handle);
                requestFolderScriptsRefresh('saveAs-prompt');
                toastFn('Script saved', { type: 'ok' });
                return;
              }
            } catch (e) {
              const name = (e && (e.name || e.code)) || '';
              if (name === 'AbortError' || name === 'NotAllowedError') return;
              // fall back to browser save below
            }
          } else {
            return; // user aborted
          }
        }
      } catch (e) {
        const name = (e && (e.name || e.code)) || '';
        if (name === 'AbortError' || name === 'NotAllowedError') return;
        // fall through to browser save for unexpected errors
      }
    }
    // Browser storage fallback: avoid overwriting the current browser script by default
    const name = prompt('Save script as:', suggested);
    if (!name) return;
    const title = String(name);
    const id =
      Scripts && typeof Scripts.save === 'function'
        ? Scripts.save({ id: null, title, content: text })
        : null;
    setCurrentScript({ id, name: title, backend: 'browser' });
    updateTitleFromName(title);
    refreshScriptsDropdown();
    toastFn('Script saved', { type: 'ok' });
  } catch {
    toastFn('Save failed', { type: 'error' });
  }
}
function onScriptLoad() {
  try {
    const id = scriptSlots && scriptSlots.value;
    if (!id) return;
    const s = Scripts && typeof Scripts.get === 'function' ? Scripts.get(id) : null;
    if (!s) return;
    setCurrentScript({ id: s.id, name: s.title || 'Untitled', backend: 'browser' });
    if (scriptTitle) scriptTitle.value = s.title || 'Untitled';
    setEditorContent(s.content || '');
    // Trigger the main app's render/update flow (editor input handler)
    try {
      if (editor) editor.dispatchEvent(new Event('input', { bubbles: true }));
      else if (typeof window.renderScript === 'function') window.renderScript(s.content || '');
    } catch {
      console.debug('scripts-ui: trigger render failed');
    }
    toastFn('Script loaded', { type: 'ok' });
  } catch {
    console.debug('onScriptLoad');
    toastFn('Load failed', { type: 'error' });
  }
}
function onScriptDelete() {
  try {
    if (!currentScriptId) return;
    Scripts && typeof Scripts.remove === 'function' && Scripts.remove(currentScriptId);
    setCurrentScript(null);
    scriptTitle && (scriptTitle.value = '');
    refreshScriptsDropdown();
    toastFn('Script deleted');
  } catch {
    console.debug('onScriptDelete');
    toastFn('Delete failed', { type: 'error' });
  }
}
function onScriptRename() {
  try {
    if (!currentScriptId) return;
    const t = prompt(
      'Rename script to:',
      scriptTitle ? scriptTitle.value || 'Untitled' : 'Untitled'
    );
    if (t) {
      Scripts && typeof Scripts.rename === 'function' && Scripts.rename(currentScriptId, t);
      setCurrentScript({ id: currentScriptId, name: t, backend: 'browser' });
      scriptTitle && (scriptTitle.value = t);
      refreshScriptsDropdown();
    }
  } catch {
    console.debug('onScriptRename');
  }
}

// wire buttons
try {
  scriptSaveBtn && scriptSaveBtn.addEventListener('click', onScriptSave);
  scriptSaveAsBtn &&
    scriptSaveAsBtn.addEventListener('click', () => {
      saveAs(getEditorContent());
    });
  scriptLoadBtn && scriptLoadBtn.addEventListener('click', onScriptLoad);
  scriptDeleteBtn && scriptDeleteBtn.addEventListener('click', onScriptDelete);
  scriptRenameBtn && scriptRenameBtn.addEventListener('click', onScriptRename);
} catch {
  console.debug('scripts-ui wiring');
}

// autosave
if (editor) {
  let _autosaveTimer = null;
  editor.addEventListener('input', () => {
    clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => {
      if (currentScript) saveCurrent(getEditorContent());
    }, 1000);
  });
}

// init after a short delay to let DOM settle
setTimeout(() => initScriptsUI(), 200);

// Also track mapped folder script selections if present
try {
  bindFolderSelect(typeof document !== 'undefined' ? document.getElementById('scriptSelect') : null);
  bindFolderSelect(typeof document !== 'undefined' ? document.getElementById('scriptSelectSidebar') : null);
} catch {
  void 0;
}

// Note: no legacy window shim; callers should import { initScriptsUI } from this module
