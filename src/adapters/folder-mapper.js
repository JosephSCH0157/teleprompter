// src/adapters/folder-mapper.js
// Minimal File System Access adapter for .txt/.docx + persistence + events

export const EVT_FOLDER_CHANGED = 'anvil:scriptsFolderChanged';

const DB_NAME = 'anvil-fs';
const STORE = 'handles';
const KEY = 'scriptsDir';

export function fsApiSupported() {
  try { return typeof window !== 'undefined' && 'showDirectoryPicker' in window; } catch { return false; }
}

export async function setScriptsFolderFromPicker() {
  if (!fsApiSupported()) return null;
  try {
    const dir = await window.showDirectoryPicker({ mode: 'read' });
    await persistDirHandle(dir);
    try { dispatchEvent(new CustomEvent(EVT_FOLDER_CHANGED, { detail: { dirName: dir?.name || null } })); } catch {}
    return dir;
  } catch { return null; }
}

export async function forgetPersistedFolder() {
  try {
    const db = await openDB();
    await db.delete(STORE, KEY);
    try { dispatchEvent(new CustomEvent(EVT_FOLDER_CHANGED, { detail: { dirName: null } })); } catch {}
  } catch {}
}

export async function getPersistedFolder() {
  try {
    const db = await openDB();
    const dir = await db.get(STORE, KEY);
    return dir || null;
  } catch { return null; }
}

export async function listScripts(dir) {
  const out = [];
  try {
    // for-await supported in Chromium; fallback silently otherwise
    // eslint-disable-next-line no-restricted-syntax
    for await (const [name, handle] of dir.entries()) {
      try {
        if (handle.kind !== 'file') continue;
        const lower = String(name || '').toLowerCase();
        const ext = lower.endsWith('.txt') ? 'txt' : (lower.endsWith('.docx') ? 'docx' : null);
        if (!ext) continue;
        out.push({ name, ext, handle });
      } catch {}
    }
  } catch {}
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function readScriptFile(entry) {
  const file = await entry.handle.getFile();
  if (entry.ext === 'txt') return String(await file.text());
  await ensureMammoth();
  const arrayBuf = await file.arrayBuffer();
  // eslint-disable-next-line no-undef
  const { value } = await (window.mammoth).extractRawText({ arrayBuffer: arrayBuf });
  return String(value || '');
}

// --- helpers ---
async function persistDirHandle(dir) {
  const db = await openDB();
  await db.put(STORE, dir, KEY);
  try { await (navigator.storage && navigator.storage.persist && navigator.storage.persist()); } catch {}
}

async function openDB() {
  return new Promise((res, rej) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch {} };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    } catch (e) { rej(e); }
  });
}

async function ensureMammoth() {
  try { if (window.mammoth) return; } catch {}
  await new Promise((ok, err) => {
    try {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js';
      s.onload = () => ok();
      s.onerror = () => err(new Error('mammoth load failed'));
      document.head.appendChild(s);
    } catch (e) { err(e); }
  });
}

async function _ensureRead(handle) {
  try {
    const q = await (handle.queryPermission?.({ mode: 'read' }));
    if (q === 'granted') return true;
    const r = await (handle.requestPermission?.({ mode: 'read' }));
    return r === 'granted';
  } catch { return false; }
}
