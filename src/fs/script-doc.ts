import { sanitizeScriptFilename } from './script-naming';

export type CurrentScriptDoc = {
  fileHandle: FileSystemFileHandle | null;
  folderHandle: FileSystemDirectoryHandle | null;
  filename: string;
};

const DEFAULT_FILENAME = sanitizeScriptFilename('Untitled');
let currentDoc: CurrentScriptDoc = {
  fileHandle: null,
  folderHandle: null,
  filename: DEFAULT_FILENAME,
};

export function getCurrentScriptDoc(): CurrentScriptDoc {
  return { ...currentDoc };
}

export function setCurrentScriptDoc(doc: Partial<CurrentScriptDoc>): void {
  currentDoc = {
    ...currentDoc,
    ...doc,
    filename: doc.filename ? sanitizeScriptFilename(doc.filename) : currentDoc.filename,
  };
}

export function setCurrentScriptHandle(
  handle: FileSystemFileHandle | null,
  folderHandle: FileSystemDirectoryHandle | null,
  filename?: string,
): void {
  currentDoc = {
    fileHandle: handle,
    folderHandle,
    filename: filename ? sanitizeScriptFilename(filename) : currentDoc.filename,
  };
}

export function clearCurrentScriptHandle(): void {
  currentDoc = {
    ...currentDoc,
    fileHandle: null,
    folderHandle: null,
  };
}

export function updateCurrentScriptFilename(filename: string): void {
  currentDoc.filename = sanitizeScriptFilename(filename);
}
