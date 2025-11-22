(function () {
  type DirHandle = FileSystemDirectoryHandle | null | undefined;
  type RecDirAPI = {
    init: () => Promise<void>;
    get: () => DirHandle | null;
    set: (h: DirHandle) => Promise<void>;
    clear: () => Promise<void>;
    pick: () => Promise<DirHandle | null>;
    supported: () => boolean;
  };

  const DB_NAME = 'tp-db';
  const STORE = 'fs-handles';
  const KEY = 'recordingDir';

  async function openDB() {
    return await new Promise<IDBDatabase>((resolve, reject) => {
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
      } catch (e) {
        reject(e);
      }
    });
  }
  async function idbGet(key: string) {
    try {
      const db = await openDB();
      return await new Promise<DirHandle | null>((resolve, reject) => {
        try {
          const tx = db.transaction(STORE, 'readonly');
          const st = tx.objectStore(STORE);
          const req = st.get(key);
          req.onsuccess = () => resolve((req.result as DirHandle) || null);
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      });
    } catch {
      return null;
    }
  }
  async function idbSet(key: string, val: unknown) {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        try {
          const tx = db.transaction(STORE, 'readwrite');
          const st = tx.objectStore(STORE);
          const req = st.put(val, key);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      });
    } catch {}
  }
  async function idbDel(key: string) {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        try {
          const tx = db.transaction(STORE, 'readwrite');
          const st = tx.objectStore(STORE);
          const req = st.delete(key);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      });
    } catch {}
  }

  function hasFsApi(): boolean {
    try {
      return !!(('showDirectoryPicker' in window) || (window.isSecureContext && 'FileSystemDirectoryHandle' in window));
    } catch {
      return false;
    }
  }

  let _dir: DirHandle = null;
  async function initRecordingDir() {
    try {
      const h = await idbGet(KEY);
      if (h) {
        // @ts-ignore
        const ok = (await h.queryPermission?.({ mode: 'readwrite' })) || (await h.requestPermission?.({ mode: 'readwrite' }));
        if (ok === 'granted' || ok === 'prompt') _dir = h;
        else _dir = h; // keep handle; permission can be re-requested on save
      }
    } catch {}
  }
  function getRecordingDir(): DirHandle | null {
    return _dir || null;
  }
  async function setRecordingDir(h: DirHandle) {
    _dir = h || null;
    if (h) await idbSet(KEY, h);
    else await idbDel(KEY);
  }
  async function clearRecordingDir() {
    _dir = null;
    await idbDel(KEY);
  }
  async function pickRecordingDir(): Promise<DirHandle | null> {
    if (!hasFsApi()) return null;
    try {
      // @ts-ignore
      const dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'tp-recordings' });
      // @ts-ignore
      const ok = (await dir?.requestPermission?.({ mode: 'readwrite' })) || (await dir?.queryPermission?.({ mode: 'readwrite' }));
      if (ok === 'granted' || ok === 'prompt') {
        await setRecordingDir(dir as DirHandle);
        return dir as DirHandle;
      }
      return null;
    } catch {
      return null;
    }
  }

  const api: RecDirAPI = {
    init: initRecordingDir,
    get: getRecordingDir,
    set: setRecordingDir,
    clear: clearRecordingDir,
    pick: pickRecordingDir,
    supported: hasFsApi,
  };

  try {
    (window as any).__tpRecDir = api;
  } catch {}
})();

export {};
