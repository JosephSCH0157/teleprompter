// ui/scripts-ui.js (runtime-safe)
let Scripts = null;
try {
  const _req = typeof globalThis !== 'undefined' ? globalThis['require'] : undefined;
  if (typeof _req === 'function') {
    try {
      Scripts = _req('../scriptsStore.js')?.Scripts || _req('../scriptsStore.js');
    } catch (e) {
      void e;
    }
  }
} catch (e) {
  void e;
}
try {
  if (!Scripts && typeof window !== 'undefined' && window.Scripts) Scripts = window.Scripts;
} catch (e) {
  void e;
}
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
    } catch (e) {
      void e;
    }
    try {
      importedToast =
        _req('./toasts.js')?.toast || (typeof window !== 'undefined' && window.toast) || null;
    } catch (e) {
      void e;
      importedToast = (typeof window !== 'undefined' && window.toast) || null;
    }
  } else {
    try {
      safeDOM = (typeof window !== 'undefined' && window.safeDOM) || null;
      importedToast = (typeof window !== 'undefined' && window.toast) || null;
    } catch (e) {
      void e;
    }
  }
} catch (e) {
  void e;
}

let currentScriptId = null;
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
  } catch (e) {
    console.debug('toastFn import failed', e);
  }
};

function getEditorContent() {
  return editor ? editor.value : '';
}
function setEditorContent(txt) {
  if (editor) editor.value = String(txt || '');
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
  } catch (e) {
    console.debug('refreshScriptsDropdown', e);
  }
}

function initScriptsUI() {
  try {
    Scripts && typeof Scripts.init === 'function' && Scripts.init();
    refreshScriptsDropdown();
  } catch (e) {
    console.debug('initScriptsUI', e);
  }
}

try {
  if (typeof window !== 'undefined') window.initScriptsUI = initScriptsUI;
} catch (e) {
  void e;
}

function onScriptSave() {
  try {
    const title = scriptTitle && scriptTitle.value ? scriptTitle.value : 'Untitled';
    currentScriptId =
      Scripts && typeof Scripts.save === 'function'
        ? Scripts.save({ id: currentScriptId, title, content: getEditorContent() })
        : null;
    refreshScriptsDropdown();
    toastFn('Script saved', { type: 'ok' });
  } catch (e) {
    console.debug('onScriptSave', e);
    toastFn('Save failed', { type: 'error' });
  }
}
function onScriptSaveAs() {
  currentScriptId = null;
  onScriptSave();
}
function onScriptLoad() {
  try {
    const id = scriptSlots && scriptSlots.value;
    if (!id) return;
    const s = Scripts && typeof Scripts.get === 'function' ? Scripts.get(id) : null;
    if (!s) return;
    currentScriptId = s.id;
    if (scriptTitle) scriptTitle.value = s.title || 'Untitled';
    setEditorContent(s.content || '');
    // Trigger the main app's render/update flow (editor input handler)
    try {
      if (editor) editor.dispatchEvent(new Event('input', { bubbles: true }));
      else if (typeof window.renderScript === 'function') window.renderScript(s.content || '');
    } catch (e) {
      console.debug('scripts-ui: trigger render failed', e);
    }
    toastFn('Script loaded', { type: 'ok' });
  } catch (e) {
    console.debug('onScriptLoad', e);
    toastFn('Load failed', { type: 'error' });
  }
}
function onScriptDelete() {
  try {
    if (!currentScriptId) return;
    Scripts && typeof Scripts.remove === 'function' && Scripts.remove(currentScriptId);
    currentScriptId = null;
    scriptTitle && (scriptTitle.value = '');
    refreshScriptsDropdown();
    toastFn('Script deleted');
  } catch (e) {
    console.debug('onScriptDelete', e);
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
      scriptTitle && (scriptTitle.value = t);
      refreshScriptsDropdown();
    }
  } catch (e) {
    console.debug('onScriptRename', e);
  }
}

// wire buttons
try {
  scriptSaveBtn && scriptSaveBtn.addEventListener('click', onScriptSave);
  scriptSaveAsBtn && scriptSaveAsBtn.addEventListener('click', onScriptSaveAs);
  scriptLoadBtn && scriptLoadBtn.addEventListener('click', onScriptLoad);
  scriptDeleteBtn && scriptDeleteBtn.addEventListener('click', onScriptDelete);
  scriptRenameBtn && scriptRenameBtn.addEventListener('click', onScriptRename);
} catch (e) {
  console.debug('scripts-ui wiring', e);
}

// autosave
if (editor) {
  let _autosaveTimer = null;
  editor.addEventListener('input', () => {
    clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => {
      if (currentScriptId) onScriptSave();
    }, 1000);
  });
}

// init after a short delay to let DOM settle
setTimeout(() => initScriptsUI(), 200);

// Note: no legacy window shim; callers should import { initScriptsUI } from this module
