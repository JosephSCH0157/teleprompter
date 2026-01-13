import { getMappedFolder, refreshMappedFolder } from './mapped-folder';
import { getCurrentScriptDoc, setCurrentScriptHandle } from './script-doc';
import { sanitizeScriptFilename, scriptBaseName } from './script-naming';
import { debugLog, hudLog } from '../env/logging';

const COLLISION_OVERLAY_ID = 'tp-save-conflict-overlay';
const COLLISION_STYLE_ID = 'tp-save-conflict-styles';

export type SaveMode = 'save' | 'saveAs';

export type SaveScriptSuccess = {
  ok: true;
  mode: SaveMode;
  name: string;
  bytes: number;
  overwrite: boolean;
};

export type SaveScriptFailure = {
  ok: false;
  mode: SaveMode;
  reason: 'nofolder' | 'cancelled' | 'error';
  name?: string;
  error?: Error;
};

export type SaveScriptResult = SaveScriptSuccess | SaveScriptFailure;

export async function saveCurrentScript(
  text: string,
  opts: { suggestedTitle?: string } = {},
): Promise<SaveScriptResult> {
  const doc = getCurrentScriptDoc();
  const bytes = computeByteLength(text);
  const safeName = sanitizeScriptFilename(opts.suggestedTitle || doc.filename || 'Untitled');

  if (doc.fileHandle) {
    try {
      await ensureWritePermission(doc.fileHandle);
      await writeText(doc.fileHandle, text);
      logSaveOk('save', doc.filename || safeName, bytes, true);
      notifySaveSuccess('save', doc.filename || safeName);
      refreshMappedFolder();
      return { ok: true, mode: 'save', name: doc.filename || safeName, bytes, overwrite: true };
    } catch (err) {
      const normalized = normalizeSaveError(err);
      logSaveFail('save', doc.filename || safeName, err as Error);
      showSaveError('Save failed', normalized.message);
      debugLog('[SAVE] falling back to Save As because saveCurrentScript failed', normalized);
    }
  }

  return saveScriptAs(text, { ...opts, suggestedTitle: safeName });
}

export async function saveScriptAs(
  text: string,
  opts: { suggestedTitle?: string; folder?: FileSystemDirectoryHandle | null } = {},
): Promise<SaveScriptResult> {
  const folder = opts.folder || getCurrentScriptDoc().folderHandle || getMappedFolder();
  const safeName = sanitizeScriptFilename(opts.suggestedTitle || scriptBaseName(getCurrentScriptDoc().filename) || 'Untitled');
  const bytes = computeByteLength(text);

  if (!folder) {
    const err = new Error('No mapped folder available for Save As');
    logSaveFail('saveAs', safeName, err);
    showSaveError('No folder mapped', 'Pick a scripts folder in Settings to save files.');
    return { ok: false, mode: 'saveAs', reason: 'nofolder', name: safeName, error: err };
  }

  const resolved = await resolveFilenameWithCollision(folder, safeName);
  if (!resolved) {
    return { ok: false, mode: 'saveAs', reason: 'cancelled', name: safeName };
  }

  try {
    const handle = await folder.getFileHandle(resolved.name, { create: true });
    await ensureWritePermission(handle);
    await writeText(handle, text);
    setCurrentScriptHandle(handle, folder, resolved.name);
    refreshMappedFolder();
    logSaveOk('saveAs', resolved.name, bytes, resolved.overwrite);
    notifySaveSuccess('saveAs', resolved.name);
    return { ok: true, mode: 'saveAs', name: resolved.name, bytes, overwrite: resolved.overwrite };
  } catch (err) {
    const normalized = normalizeSaveError(err);
    logSaveFail('saveAs', resolved.name, err as Error);
    showSaveError('Save As failed', normalized.message);
    return { ok: false, mode: 'saveAs', reason: 'error', name: resolved.name, error: err as Error };
  }
}

function computeByteLength(text: string): number {
  try {
    if (typeof TextEncoder === 'function') {
      return new TextEncoder().encode(text).length;
    }
  } catch {}
  return new Blob([text]).size;
}

async function writeText(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await (handle as any).createWritable();
  await writable.write(text);
  await writable.close();
}

async function ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  try {
    const opts = { mode: 'readwrite' as const };
    const query =
      typeof handle.queryPermission === 'function'
        ? await handle.queryPermission(opts)
        : 'granted';
    if (query === 'granted') return true;
    if (typeof handle.requestPermission === 'function') {
      const req = await handle.requestPermission(opts);
      return req === 'granted';
    }
  } catch {}
  return true;
}

async function resolveFilenameWithCollision(
  folder: FileSystemDirectoryHandle,
  name: string,
): Promise<{ name: string; overwrite: boolean } | null> {
  try {
    await folder.getFileHandle(name, { create: false });
    const action = await promptSaveCollision(name);
    if (action === 'cancel') {
      return null;
    }
    if (action === 'overwrite') {
      return { name, overwrite: true };
    }
    const nextName = await findAvailableCopyName(folder, name);
    return { name: nextName, overwrite: false };
  } catch (err) {
    if (isNotFoundError(err)) {
      return { name, overwrite: false };
    }
    throw err;
  }
}

async function findAvailableCopyName(folder: FileSystemDirectoryHandle, baseName: string): Promise<string> {
  const { base, ext } = splitName(baseName);
  for (let i = 2; i < 100; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (await isNameAvailable(folder, candidate)) {
      return candidate;
    }
  }
  return `${base}-${Date.now()}${ext}`;
}

async function isNameAvailable(folder: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await folder.getFileHandle(name, { create: false });
    return false;
  } catch (err) {
    return isNotFoundError(err);
  }
}

function splitName(name: string): { base: string; ext: string } {
  const idx = name.lastIndexOf('.');
  if (idx > 0) {
    return { base: name.substring(0, idx), ext: name.substring(idx) };
  }
  return { base: name, ext: '' };
}

function isNotFoundError(err: unknown): boolean {
  try {
    const name = (err as any)?.name;
    return name === 'NotFoundError';
  } catch {
    return false;
  }
}

function promptSaveCollision(name: string): Promise<'overwrite' | 'copy' | 'cancel'> {
  if (typeof document === 'undefined') {
    return Promise.resolve('cancel');
  }
  if (document.getElementById(COLLISION_OVERLAY_ID)) {
    return Promise.resolve('cancel');
  }
  ensureCollisionStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = COLLISION_OVERLAY_ID;
    overlay.className = 'tp-save-conflict-overlay';
    overlay.innerHTML = `
      <div class="tp-save-conflict-panel">
        <p class="tp-save-conflict-title">Save conflict</p>
        <p class="tp-save-conflict-message">The file "${name}" already exists.</p>
        <div class="tp-save-conflict-actions">
          <button data-action="overwrite">Overwrite</button>
          <button data-action="copy">Save as copy</button>
          <button data-action="cancel">Cancel</button>
        </div>
      </div>
    `;

    const cleanup = (choice: 'overwrite' | 'copy' | 'cancel') => {
      try { overlay.remove(); } catch {}
      resolve(choice);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup('cancel');
      }
    });
    overlay.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (!action) {
          cleanup('cancel');
          return;
        }
        if (action === 'overwrite' || action === 'copy' || action === 'cancel') {
          cleanup(action);
        } else {
          cleanup('cancel');
        }
      });
    });

    document.body.appendChild(overlay);
  });
}

function ensureCollisionStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(COLLISION_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = COLLISION_STYLE_ID;
  style.textContent = `
    .tp-save-conflict-overlay {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      padding: 24px;
    }
    .tp-save-conflict-panel {
      background: #0f172a;
      border: 1px solid rgba(148, 163, 184, 0.4);
      border-radius: 16px;
      padding: 24px;
      width: min(420px, 100%);
      color: #e2e8f0;
      box-shadow: 0 20px 40px rgba(2, 6, 23, 0.65);
      font-family: system-ui, 'Segoe UI', sans-serif;
    }
    .tp-save-conflict-title {
      margin: 0 0 6px;
      font-weight: 600;
      font-size: 18px;
    }
    .tp-save-conflict-message {
      margin: 0 0 16px;
      font-size: 14px;
      color: rgba(226, 232, 240, 0.8);
    }
    .tp-save-conflict-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tp-save-conflict-actions button {
      flex: 1 1 0px;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.6);
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }
    .tp-save-conflict-actions button:first-child {
      background: rgba(59, 130, 246, 0.95);
      border-color: rgba(59, 130, 246, 0.95);
      color: #fff;
    }
  `;
  document.head.appendChild(style);
}

function logSaveOk(mode: SaveMode, name: string, bytes: number, overwrite: boolean): void {
  try {
    console.log('[SAVE_OK]', { mode, name, bytes, overwrite });
  } catch {}
  hudLog('script:save:ok', { mode, name, bytes, overwrite });
}

function logSaveFail(mode: SaveMode, name: string, err: Error): void {
  try {
    console.warn('[SAVE_FAIL]', { mode, name, errorName: err?.name, message: err?.message });
  } catch {}
  hudLog('script:save:fail', { mode, name, errorName: err?.name, message: err?.message });
}

function notifySaveSuccess(mode: SaveMode, name: string): void {
  try {
    const toastFn = (window as any).toast as ((message: string, opts?: { type?: string }) => void) | undefined;
    if (typeof toastFn === 'function') {
      toastFn(`Saved ${name}`, { type: 'ok' });
    }
  } catch {}
}

function showSaveError(title: string, detail: string): void {
  hudLog('script:save:error', { title, detail });
  const toastFn = (window as any).toast as ((message: string, opts?: { type?: string }) => void) | undefined;
  const message = detail ? `${title}: ${detail}` : title;
  if (typeof toastFn === 'function') {
    toastFn(message, { type: 'error' });
    return;
  }
  try {
    alert(message);
  } catch {}
}

function normalizeSaveError(err: unknown): { reason: string; message: string } {
  const name = (err as any)?.name;
  if (name === 'NotAllowedError') {
    return { reason: 'permission', message: 'Write permission denied. Reopen the folder or re-grant access.' };
  }
  if (name === 'InvalidStateError') {
    return { reason: 'stale', message: 'The file handle is no longer valid. Re-select the folder and try again.' };
  }
  const message = (err as any)?.message || 'The save could not complete.';
  return { reason: 'unknown', message };
}
