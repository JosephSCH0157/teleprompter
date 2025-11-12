// src/fs/mapped-folder.ts
// Manage a user-mapped scripts folder using the File System Access API.
// Persists directory handle in IndexedDB, lists script files, and syncs across tabs.

export type ScriptEntry = {
  name: string;
  handle: FileSystemFileHandle;
  kind: 'file';
};

const DB_NAME = 'tp-db';
const STORE = 'fs-handles';
const KEY = 'scriptsRoot';
const BCAST = 'tp-mapped-folder';
const STORAGE_KEY = 'tp_mapped_folder_bcast';

let _dir: FileSystemDirectoryHandle | null = null;
let _bc: BroadcastChannel | null = null;
const _listeners = new Set<(_h: FileSystemDirectoryHandle | null, _why: 'init'|'pick'|'clear'|'sync'|'error') => void>();

// ---------------- IndexedDB helpers ----------------
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        } catch {}
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e as any); }
  });
}
async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const st = tx.objectStore(STORE);
        const req = st.get(key);
        req.onsuccess = () => resolve((req.result as T) || null);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e as any); }
    });
  } catch { return null; }
}
async function idbSet<T>(key: string, val: T): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        const st = tx.objectStore(STORE);
        const req = st.put(val as any, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e as any); }
    });
  } catch {}
}
async function idbDel(key: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        const st = tx.objectStore(STORE);
        const req = st.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e as any); }
    });
  } catch {}
}

// ---------------- Permissions ----------------
async function verifyPermission(handle: FileSystemHandle, mode: 'read'|'readwrite'='read'): Promise<boolean> {
  try {
    // @ts-ignore - not yet typed in all TS lib versions
    const state = await (handle as any).queryPermission?.({ mode });
    if (state === 'granted') return true;
    // @ts-ignore
    const req = await (handle as any).requestPermission?.({ mode });
    return req === 'granted';
  } catch { return false; }
}

// ---------------- Public API ----------------
export function onMappedFolder(cb: (_h: FileSystemDirectoryHandle | null, _why: 'init'|'pick'|'clear'|'sync'|'error') => void): () => void {
  _listeners.add(cb); return () => _listeners.delete(cb);
}
function emit(why: 'init'|'pick'|'clear'|'sync'|'error') {
  for (const cb of _listeners) { try { cb(_dir, why); } catch {} }
  try { window.dispatchEvent(new CustomEvent('tp:mapped-folder', { detail: { dir: _dir, why, ts: Date.now() } })); } catch {}
}
export function getMappedFolder(): FileSystemDirectoryHandle | null { return _dir; }

export async function initMappedFolder(): Promise<void> {
  try {
    const h = await idbGet<FileSystemDirectoryHandle>(KEY);
    if (h && await verifyPermission(h, 'read')) { _dir = h; ensureBroadcast(); emit('init'); return; }
  } catch {}
  _dir = null; ensureBroadcast(); emit('init');
}

export async function pickMappedFolder(): Promise<boolean> {
  try {
    const hasPicker = typeof (window as any).showDirectoryPicker === 'function';
    if (!hasPicker) return false; // fallback handled externally
    const h: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ id: 'tp-scripts' });
    if (await verifyPermission(h, 'read')) { _dir = h; await idbSet(KEY, h); broadcast(); emit('pick'); return true; }
    return false;
  } catch (e) {
    try { console.warn('[mapped-folder] pick failed', e); } catch {}
    emit('error');
    return false;
  }
}

export async function clearMappedFolder(): Promise<void> {
  _dir = null; await idbDel(KEY); broadcast(); emit('clear');
}

export async function listScripts(extensions = ['.txt', '.docx', '.md']): Promise<ScriptEntry[]> {
  const out: ScriptEntry[] = [];
  const dir = _dir; if (!dir) return out;
  try {
    // Iterate directory entries; FileSystemDirectoryHandle implements values() async iterator in supporting browsers
    // @ts-ignore
    for await (const entry of (dir as any).values?.() || []) {
      if (entry?.kind === 'file') {
        const name: string = entry.name || '';
        const lower = name.toLowerCase();
        if (extensions.some(ext => lower.endsWith(ext))) out.push({ name, handle: entry, kind: 'file' });
      }
    }
  } catch {}
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
}

// ---------------- Cross-tab sync ----------------
function ensureBroadcast() {
  try {
    if (!_bc) {
      _bc = new BroadcastChannel(BCAST);
      _bc.onmessage = async (e) => {
        try {
          if (!e?.data) return;
          if (e.data.type === 'tp-mapped-folder:refresh') {
            const h = await idbGet<FileSystemDirectoryHandle>(KEY);
            if (h && await verifyPermission(h, 'read')) { _dir = h; emit('sync'); }
          }
        } catch {}
      };
      window.addEventListener('storage', async (ev) => {
        try {
          if (ev.key === STORAGE_KEY && ev.newValue) {
            const h = await idbGet<FileSystemDirectoryHandle>(KEY);
            if (h && await verifyPermission(h, 'read')) { _dir = h; emit('sync'); }
          }
        } catch {}
      });
    }
  } catch {}
}
function broadcast() {
  try { _bc?.postMessage({ type: 'tp-mapped-folder:refresh' }); } catch {}
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setTimeout(() => { try { localStorage.removeItem(STORAGE_KEY); } catch {} }, 500);
  } catch {}
}

// Optional global shim
try {
  (window as any).__tpFolder = { get: getMappedFolder, pick: pickMappedFolder, clear: clearMappedFolder, list: listScripts };
} catch {}

export const _internals = { _listeners }; // test/debug only
