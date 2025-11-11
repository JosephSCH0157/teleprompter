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
  const db = await openDB();
  await db.delete(STORE, KEY);
  try { dispatchEvent(new CustomEvent(EVT_FOLDER_CHANGED, { detail: { dirName: null } })); } catch {}
}

export async function getPersistedFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    const dir = (await db.get(STORE, KEY)) as FileSystemDirectoryHandle | undefined;
    if (!dir) return null;
    const ok = await ensureRead(dir as unknown as FileSystemHandle);
    return ok ? dir : null;
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
  const db = await openDB();
  await db.put(STORE, dir, KEY);
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

async function ensureRead(handle: FileSystemHandle): Promise<boolean> {
  // @ts-ignore
  const q = await handle.queryPermission?.({ mode: 'read' });
  if (q === 'granted') return true;
  // @ts-ignore
  const r = await handle.requestPermission?.({ mode: 'read' });
  return r === 'granted';
}

// ---- ambient type for window.mammoth (quick fix; replace with proper d.ts if desired)
declare global {
  // eslint-disable-next-line no-var
  var mammoth: { extractRawText(x:{arrayBuffer:ArrayBuffer}): Promise<{value:string}> } | undefined;
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
