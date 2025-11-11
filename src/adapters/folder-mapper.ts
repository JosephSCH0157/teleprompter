// src/adapters/folder-mapper.ts
export type SupportedExt = 'txt' | 'md' | 'rtf' | 'text' | 'docx';
export type ScriptEntry = { name: string; ext: SupportedExt; handle: FileSystemFileHandle };

const DB_NAME = 'anvil-fs';
const STORE = 'handles';
const KEY = 'scriptsDir';
export const EVT_FOLDER_CHANGED = 'anvil:scriptsFolderChanged' as const;

export function fsApiSupported(): boolean {
  try { return 'showDirectoryPicker' in window; } catch { return false; }
}

export async function setScriptsFolderFromPicker(): Promise<FileSystemDirectoryHandle | null> {
  if (!fsApiSupported()) return null;
  // @ts-ignore
  const dir: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
  await persistDirHandle(dir);
  try { dispatchEvent(new CustomEvent(EVT_FOLDER_CHANGED, { detail: { dirName: (dir as any).name } })); } catch {}
  return dir;
}

export async function forgetPersistedFolder(): Promise<void> {
  await idbDelete(KEY);
  try { dispatchEvent(new CustomEvent(EVT_FOLDER_CHANGED, { detail: { dirName: null } })); } catch {}
}

export async function getPersistedFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const dir = (await idbGet<FileSystemDirectoryHandle>(KEY)) as FileSystemDirectoryHandle | undefined;
    return dir || null;
  } catch { return null; }
}

export async function listScripts(dir: FileSystemDirectoryHandle): Promise<ScriptEntry[]> {
  const out: ScriptEntry[] = [];
  const allow = new Set<SupportedExt>(['txt','md','rtf','text','docx']);
  // @ts-ignore for-await works in Chromium
  for await (const [name, handle] of (dir as any).entries()) {
    if (handle.kind !== 'file') continue;
    const ext = (name.split('.').pop() || '').toLowerCase() as SupportedExt;
    if (!allow.has(ext)) continue;
    out.push({ name, ext, handle });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function readScriptFile(entry: ScriptEntry): Promise<string> {
  const file = await entry.handle.getFile();
  if (entry.ext === 'docx') {
    await ensureMammoth();
    const arrayBuf = await file.arrayBuffer();
    // @ts-ignore (ambient types below)
    const { value } = await mammoth.extractRawText({ arrayBuffer: arrayBuf });
    return String(value || '');
  }
  const text = await file.text();
  return entry.ext === 'rtf' ? rtfToText(text) : text;
}

// ----------------- helpers -----------------
async function persistDirHandle(dir: FileSystemDirectoryHandle) {
  await idbPut(KEY, dir);
  try { await (navigator as any).storage?.persist?.(); } catch {}
}

function openDB(): Promise<any> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

// Lightweight wrappers providing the previously (incorrectly) assumed convenience API
function idbPut(key: string, value: any): Promise<void> {
  return new Promise(async (res, rej) => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put(value, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error || new Error('idbPut failed'));
      tx.onabort = () => rej(tx.error || new Error('idbPut aborted'));
    } catch (e) { rej(e); }
  });
}

function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  return new Promise(async (res, rej) => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => res(req.result as T | undefined);
      req.onerror = () => rej(req.error || new Error('idbGet failed'));
      tx.onerror = () => {/* handled per request */};
    } catch (e) { rej(e); }
  });
}

function idbDelete(key: string): Promise<void> {
  return new Promise(async (res, rej) => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.delete(key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error || new Error('idbDelete failed'));
      tx.onabort = () => rej(tx.error || new Error('idbDelete aborted'));
    } catch (e) { rej(e); }
  });
}

async function ensureMammoth() {
  // @ts-ignore
  if (typeof mammoth !== 'undefined') return;
  await new Promise<void>((ok, err) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js';
    s.onload = () => ok();
    s.onerror = () => err(new Error('mammoth load failed'));
    document.head.appendChild(s);
  });
}

// Legacy helper kept for potential future permission prompts (currently unused).
async function _ensureRead(handle: FileSystemHandle): Promise<boolean> {
  try {
    // @ts-ignore
    const q = await handle.queryPermission?.({ mode: 'read' });
    if (q === 'granted') return true;
    // @ts-ignore
    const r = await handle.requestPermission?.({ mode: 'read' });
    return r === 'granted';
  } catch { return false; }
}

// ---- ambient type for window.mammoth (quick fix; replace with proper d.ts if desired)
declare global {
  var mammoth: { extractRawText(_x:{arrayBuffer:ArrayBuffer}): Promise<{value:string}> } | undefined;
}

// Minimal, "good enough" RTF → text stripper
function rtfToText(rtf: string): string {
  try {
    const decoded = rtf.replace(/\\'([0-9a-f]{2})/gi, (_: string, h: string) => String.fromCharCode(parseInt(h, 16)));
    return decoded
      .replace(/\\[a-z]+-?\d*(?:\s|)/gi, '') // control words like \par, \fs24, \b0
      .replace(/[{}]/g, '')                     // groups
      .replace(/\r\n?/g, '\n')                // normalize EOL
      .trim();
  } catch { return rtf; }
}
