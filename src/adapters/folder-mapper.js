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
    await idbDelete(KEY);
    try { dispatchEvent(new CustomEvent(EVT_FOLDER_CHANGED, { detail: { dirName: null } })); } catch {}
  } catch {}
}

export async function getPersistedFolder() {
  try {
    const dir = await idbGet(KEY);
    return dir || null;
  } catch { return null; }
}

export async function listScripts(dir) {
  const out = [];
  try {
    // for-await supported in Chromium; fallback silently otherwise
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
  const { value } = await (window.mammoth).extractRawText({ arrayBuffer: arrayBuf });
  return String(value || '');
}

// --- helpers ---
async function persistDirHandle(dir) {
  await idbPut(KEY, dir);
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

function idbPut(key, value){
  return openDB().then((db) => new Promise((res, rej) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put(value, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error || new Error('idbPut failed'));
      tx.onabort = () => rej(tx.error || new Error('idbPut aborted'));
    } catch (e) { rej(e); }
  }));
}

function idbGet(key){
  return openDB().then((db) => new Promise((res, rej) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error || new Error('idbGet failed'));
      tx.onerror = () => {/* per-request handled */};
    } catch (e) { rej(e); }
  }));
}

function idbDelete(key){
  return openDB().then((db) => new Promise((res, rej) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.delete(key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error || new Error('idbDelete failed'));
      tx.onabort = () => rej(tx.error || new Error('idbDelete aborted'));
    } catch (e) { rej(e); }
  }));
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
