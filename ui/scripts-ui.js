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
  try {
    const title = scriptTitle && scriptTitle.value ? scriptTitle.value : 'Untitled';
    currentScriptId =
      Scripts && typeof Scripts.save === 'function'
        ? Scripts.save({ id: currentScriptId, title, content: getEditorContent() })
        : null;
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
    } catch {
      console.debug('scripts-ui: trigger render failed');
    }
    // Record cookie: resume from saved
    try {
      const p = (typeof window.readPrefsCookie === 'function' && window.readPrefsCookie()) || {};
      if (typeof window.writePrefsCookie === 'function') {
        window.writePrefsCookie({ ...p, lastSource: 'saved', lastFileName: '' });
      }
    } catch {}
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
    currentScriptId = null;
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
  scriptSaveAsBtn && scriptSaveAsBtn.addEventListener('click', onScriptSaveAs);
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
      if (currentScriptId) onScriptSave();
    }, 1000);
  });
}

// init after a short delay to let DOM settle
setTimeout(() => initScriptsUI(), 200);

// Note: no legacy window shim; callers should import { initScriptsUI } from this module

