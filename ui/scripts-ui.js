// ui/scripts-ui.js (ES module)
import { Scripts } from '../scriptsStore.js';
import { safeDOM } from '../utils/safe-dom.js';
import { toast as importedToast } from './toasts.js';

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
  } catch (e) {}
  try {
    if (window && window.toast) return window.toast(msg, opts);
  } catch (e) {}
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

export function initScriptsUI() {
  try {
    Scripts && typeof Scripts.init === 'function' && Scripts.init();
    refreshScriptsDropdown();
  } catch (e) {
    console.debug('initScriptsUI', e);
  }
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

// Backwards-compat: attach to window
try {
  if (typeof window !== 'undefined') window.initScriptsUI = initScriptsUI;
} catch (e) {
  console.debug('scripts-ui attach failed', e);
}
