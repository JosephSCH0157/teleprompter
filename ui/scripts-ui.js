// ui/scripts-ui.js
// Moves the scripts UI wiring out of teleprompter_pro.js to harden the main file.
// Uses global `Scripts` exposed by scriptsStore.js
let currentScriptId = null;
const scriptSlots = document.getElementById('scriptSlots');
const scriptTitle = document.getElementById('scriptTitle');
const scriptSaveBtn = document.getElementById('scriptSaveBtn');
const scriptSaveAsBtn = document.getElementById('scriptSaveAsBtn');
const scriptLoadBtn = document.getElementById('scriptLoadBtn');
const scriptDeleteBtn = document.getElementById('scriptDeleteBtn');
const scriptRenameBtn = document.getElementById('scriptRenameBtn');
const editor = document.getElementById('editor');

function getEditorContent() {
  return editor ? editor.value : '';
}
function setEditorContent(txt) {
  if (editor) editor.value = String(txt || '');
}

function refreshScriptsDropdown() {
  try {
    const list = (window.Scripts || {}).list
      ? window.Scripts.list().sort((a, b) => b.updated.localeCompare(a.updated))
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
    (window.Scripts || {}).init && window.Scripts.init();
    refreshScriptsDropdown();
  } catch (e) {
    console.debug('initScriptsUI', e);
  }
}

function onScriptSave() {
  try {
    const title = scriptTitle && scriptTitle.value ? scriptTitle.value : 'Untitled';
    currentScriptId = (window.Scripts || {}).save
      ? window.Scripts.save({ id: currentScriptId, title, content: getEditorContent() })
      : null;
    refreshScriptsDropdown();
    if (typeof window !== 'undefined' && typeof window.toast === 'function')
      window.toast('Script saved', { type: 'ok' });
  } catch (e) {
    console.debug('onScriptSave', e);
    if (window.toast) window.toast('Save failed', { type: 'error' });
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
    const s = (window.Scripts || {}).get ? window.Scripts.get(id) : null;
    if (!s) return;
    currentScriptId = s.id;
    if (scriptTitle) scriptTitle.value = s.title || 'Untitled';
    setEditorContent(s.content || '');
    if (window.toast) window.toast('Script loaded', { type: 'ok' });
  } catch (e) {
    console.debug('onScriptLoad', e);
    if (window.toast) window.toast('Load failed', { type: 'error' });
  }
}
function onScriptDelete() {
  try {
    if (!currentScriptId) return;
    (window.Scripts || {}).remove && window.Scripts.remove(currentScriptId);
    currentScriptId = null;
    scriptTitle && (scriptTitle.value = '');
    refreshScriptsDropdown();
    if (window.toast) window.toast('Script deleted');
  } catch (e) {
    console.debug('onScriptDelete', e);
    if (window.toast) window.toast('Delete failed', { type: 'error' });
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
      (window.Scripts || {}).rename && window.Scripts.rename(currentScriptId, t);
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
setTimeout(initScriptsUI, 200);
