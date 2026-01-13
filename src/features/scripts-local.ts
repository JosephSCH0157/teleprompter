// Local script manager for sidebar Save/Load buttons.
// Uses localStorage to persist a small list of scripts (title + text).

import { clearCurrentScriptHandle } from '../fs/script-doc';
import { saveCurrentScript, saveScriptAs } from '../fs/script-save';
import type { SaveScriptSuccess } from '../fs/script-save';
import { scriptBaseName } from '../fs/script-naming';

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

function updateTitleFromFilename(filename: string): void {
  const input = getTitleInput();
  if (!input) return;
  input.value = scriptBaseName(filename);
}

function applySavedState(result: SaveScriptSuccess, text: string): void {
  const displayName = scriptBaseName(result.name);
  try {
    localStorage.setItem(TITLE_KEY, displayName);
  } catch {}
  try {
    localStorage.setItem('tp_last_script_name', displayName);
  } catch {}
  updateTitleFromFilename(result.name);
  dispatchLoad(displayName, text);
}

async function handleSave({ asCopy }: { asCopy: boolean }): Promise<void> {
  const title = (getTitleInput()?.value || 'Untitled').trim();
  const text = getText();
  const result = asCopy
    ? await saveScriptAs(text, { suggestedTitle: title })
    : await saveCurrentScript(text, { suggestedTitle: title });

  if (result.ok) {
    applySavedState(result, text);
    return;
  }
  if (result.reason === 'cancelled') {
    return;
  }
  clearCurrentScriptHandle();
  saveScript(title);
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
    void handleSave({ asCopy: false });
  });
  wireButton('scriptSaveAsBtn', () => {
    void handleSave({ asCopy: true });
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
