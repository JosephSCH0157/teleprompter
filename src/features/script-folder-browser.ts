// src/features/script-folder-browser.ts
import type { ScriptEntry } from '../adapters/folder-mapper';
import { EVT_FOLDER_CHANGED, getPersistedFolder, listScripts, readScriptFile } from '../adapters/folder-mapper';
import { readPrefsCookie, writePrefsCookie } from '../utils/cookies';

type OnLoad = (_text: string, _title?: string) => void;

export function initScriptFolderBrowser(onLoad: OnLoad) {
  try { if ((window as any).__tpScriptFolderBrowserWired) return; } catch {}

  const sel        = document.getElementById('folderScripts') as HTMLSelectElement | null;
  const refreshBtn = document.getElementById('refreshFolderBtn') as HTMLButtonElement | null;

  const state: { entries: ScriptEntry[]; hadDir: boolean } = { entries: [], hadDir: false };

  const hydrate = async () => {
    if (!sel) return;
    const dir = await getPersistedFolder();
    sel.disabled = !dir;
    if (refreshBtn) refreshBtn.disabled = !dir;
    if (!dir) {
      sel.innerHTML = '<option value="">— No folder mapped —</option>';
      state.entries = [];
      // Toast once when folder disappears (e.g., unplugged)
      try { if (state.hadDir) (window as any).HUD?.toast?.('Mapped folder not available. Check permissions or device.'); } catch {}
      state.hadDir = false;
      return;
    }
    state.entries = await listScripts(dir);
    const last = readPrefsCookie().lastFileName;
    const count = state.entries.length;
    sel.innerHTML = `<option value="">— Select file (${count}) —</option>` +
      state.entries.map((e, i) => `<option value="${i}" ${e.name===last?'selected':''}>${e.name}</option>`).join('');
    state.hadDir = true;
  };

  const loadSelected = async () => {
    if (!sel || sel.value === '') return;
    const idx = Number(sel.value);
    const entry = state.entries[idx];
    if (!entry) return;
    try {
      const text = await readScriptFile(entry);
      onLoad(text, entry.name.replace(/\.(txt|md|rtf|text|docx)$/i, ''));
      const p = readPrefsCookie();
      p.lastSource = 'folder'; p.lastFileName = entry.name;
      writePrefsCookie(p);
    } catch (e) {
      try { console.error(e); } catch {}
      try { (window as any).HUD?.toast?.('Failed to load file. Check permissions.'); } catch {}
    }
  };

  refreshBtn?.addEventListener('click', hydrate);
  sel?.addEventListener('change', loadSelected);
  addEventListener(EVT_FOLDER_CHANGED, hydrate as any);

  void hydrate();
  try { (window as any).__tpScriptFolderBrowserWired = true; } catch {}
}

// Optional global hook if legacy JS wants to invoke it
try { (window as any).initScriptFolderBrowser = initScriptFolderBrowser; } catch {}
