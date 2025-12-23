// Local script manager for sidebar Save/Load buttons.
// Uses localStorage to persist a small list of scripts (title + text).

import { saveToMappedFolder } from '../fs/save-script-to-mapped-folder';
import { getMappedFolder } from '../fs/mapped-folder';

type ScriptEntry = { title: string; text: string; ts: number };

const STORAGE_KEY = 'tp_local_scripts_v1';
const TITLE_KEY = 'tp_last_script_title';

function readList(): ScriptEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScriptEntry[]).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeList(list: ScriptEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list || []));
  } catch {
    /* ignore */
  }
}

function getEditor(): HTMLTextAreaElement | HTMLInputElement | HTMLElement | null {
  return document.getElementById('editor') as any;
}

function getTitleInput(): HTMLInputElement | null {
  return document.getElementById('scriptTitle') as HTMLInputElement | null;
}

function getText(): string {
  const ed = getEditor();
  if (!ed) return '';
  if ('value' in ed && typeof ed.value === 'string') return ed.value;
  if (typeof ed.textContent === 'string') return ed.textContent;
  return '';
}

function dispatchLoad(name: string, text: string): void {
  try {
    window.dispatchEvent(new CustomEvent('tp:script-load', { detail: { name, text } }));
  } catch {
    /* ignore */
  }
}

function saveScript(name: string | null | undefined): void {
  const title = (name || '').trim() || 'Untitled';
  const text = getText();
  const now = Date.now();
  const list = readList();
  const existing = list.find((s) => s.title === title);
  if (existing) {
    existing.text = text;
    existing.ts = now;
  } else {
    list.push({ title, text, ts: now });
  }
  writeList(list);
  try {
    localStorage.setItem(TITLE_KEY, title);
  } catch {
    /* ignore */
  }
  dispatchLoad(title, text);
}

function deleteCurrent(): void {
  const list = readList();
  if (!list.length) return;
  let current: string | null = null;
  try {
    current = localStorage.getItem(TITLE_KEY);
  } catch {
    /* ignore */
  }
  if (!current) return;
  writeList(list.filter((s) => s.title !== current));
}

function renameCurrent(): void {
  const list = readList();
  if (!list.length) return;
  let current: string | null = null;
  try {
    current = localStorage.getItem(TITLE_KEY);
  } catch {
    /* ignore */
  }
  const next = prompt('Rename script to:', current || 'Untitled');
  if (!next) return;
  const entry = list.find((s) => s.title === current);
  if (!entry) return;
  entry.title = next;
  entry.ts = Date.now();
  writeList(list);
  try {
    localStorage.setItem(TITLE_KEY, next);
  } catch {
    /* ignore */
  }
}

function wireButton(id: string, handler: () => void): void {
  const btn = document.getElementById(id) as HTMLButtonElement | null;
  if (!btn || (btn as any).dataset?.wired === '1') return;
  try {
    (btn as any).dataset.wired = '1';
  } catch {
    /* ignore */
  }
  btn.addEventListener('click', handler);
}

function initScriptsLocal(): void {
  wireButton('scriptSaveBtn', () => {
    const t = getTitleInput();
    const title = t?.value || 'Untitled';

    if (getMappedFolder()) {
      void (async () => {
        const res = await saveToMappedFolder(title, getText());
        if (!res.ok) {
          saveScript(title);
        }
      })();
      return;
    }

    saveScript(title);
  });
  wireButton('scriptSaveAsBtn', () => {
    const nm = prompt('Save script as:', getTitleInput()?.value || 'Untitled');
    if (nm) {
      const t = getTitleInput();
      if (t) t.value = nm;
      if (getMappedFolder()) {
        void (async () => {
          const res = await saveToMappedFolder(nm, getText());
          if (!res.ok) {
            saveScript(nm);
          }
        })();
        return;
      }
      saveScript(nm);
    }
  });
  wireButton('scriptDeleteBtn', () => deleteCurrent());
  wireButton('scriptRenameBtn', () => renameCurrent());
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScriptsLocal, { once: true });
  } else {
    initScriptsLocal();
  }
}

export {};
