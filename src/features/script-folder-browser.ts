// src/features/script-folder-browser.ts
import { getPersistedFolder, listScripts, readScriptFile, ScriptEntry, EVT_FOLDER_CHANGED } from '../adapters/folder-mapper';
import { readPrefsCookie, writePrefsCookie } from '../utils/cookies';

type OnLoad = (text: string, title?: string) => void;

export function initScriptFolderBrowser(onLoad: OnLoad) {
  try { if ((window as any).__tpScriptFolderBrowserWired) return; } catch {}

  const sel        = document.getElementById('folderScripts') as HTMLSelectElement | null;
  const refreshBtn = document.getElementById('refreshFolderBtn') as HTMLButtonElement | null;

  const state: { entries: ScriptEntry[] } = { entries: [] };

  const hydrate = async () => {
    if (!sel) return;
    const dir = await getPersistedFolder();
    sel.disabled = !dir;
    if (!dir) {
      sel.innerHTML = '<option value="">— No folder mapped —</option>';
      state.entries = [];
      return;
    }
    state.entries = await listScripts(dir);
    const last = readPrefsCookie().lastFileName;
    sel.innerHTML = '<option value="">— Select file —</option>' +
      state.entries.map((e, i) => `<option value="${i}" ${e.name===last?'selected':''}>${e.name}</option>`).join('');
  };

  const loadSelected = async () => {
    if (!sel || sel.value === '') return;
    const idx = Number(sel.value);
    const entry = state.entries[idx];
    if (!entry) return;
    const text = await readScriptFile(entry);
    onLoad(text, entry.name.replace(/\.(txt|md|rtf|text|docx)$/i, ''));
    const p = readPrefsCookie();
    p.lastSource = 'folder'; p.lastFileName = entry.name;
    writePrefsCookie(p);
  };

  refreshBtn?.addEventListener('click', hydrate);
  sel?.addEventListener('change', loadSelected);
  addEventListener(EVT_FOLDER_CHANGED, hydrate as any);

  void hydrate();
  try { (window as any).__tpScriptFolderBrowserWired = true; } catch {}
}

// Optional global hook if legacy JS wants to invoke it
try { (window as any).initScriptFolderBrowser = initScriptFolderBrowser; } catch {}
