// src/ui/mapped-folder-bind.ts
// Bind Choose Folder button + Scripts <select> to mapped-folder SSOT.
// Safe no-op if elements are missing.

import { initMappedFolder, pickMappedFolder, listScripts, onMappedFolder } from '../fs/mapped-folder';

type BindOpts = {
  button: string | HTMLElement; // Choose Folder button selector or element
  select: string | HTMLSelectElement; // Scripts dropdown selector or element
  fallbackInput?: string | HTMLInputElement; // optional <input type="file" webkitdirectory>
  onSelect?: (fileOrHandle: FileSystemFileHandle | File | null) => void; // callback when user picks a script
};

export async function bindMappedFolderUI(opts: BindOpts): Promise<() => void> {
  const btn = typeof opts.button === 'string' ? document.querySelector(opts.button) as HTMLButtonElement : opts.button as HTMLButtonElement;
  const sel = typeof opts.select === 'string' ? document.querySelector(opts.select) as HTMLSelectElement : opts.select as HTMLSelectElement;
  const fallback = opts.fallbackInput ? (typeof opts.fallbackInput === 'string' ? document.querySelector(opts.fallbackInput) as HTMLInputElement : opts.fallbackInput) : null;

  if (!btn || !sel) return () => {};

  await initMappedFolder();

  btn.addEventListener('click', async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const ok = await pickMappedFolder();
        if (ok) await refreshList();
      } else if (fallback) {
        fallback.click();
      } else {
        try { console.warn('[mapped-folder] File System Access API not supported; provide fallback input'); } catch {}
      }
    } catch {}
  });

  if (fallback) {
    fallback.addEventListener('change', () => {
      try {
        const files = Array.from(fallback.files || []);
        populateSelectFromFiles(files);
      } catch {}
    });
  }

  sel.addEventListener('change', async () => {
    try {
      const opt = sel.options[sel.selectedIndex];
      const handle = (opt as any)?._handle as FileSystemFileHandle | undefined;
      const file = (opt as any)?._file as File | undefined;
      if (handle && 'getFile' in handle) {
        opts.onSelect?.(handle);
      } else if (file) {
        opts.onSelect?.(file);
      } else {
        opts.onSelect?.(null);
      }
    } catch {}
  });

  const off = onMappedFolder(async () => { await refreshList(); });
  await refreshList();
  return () => { try { off(); } catch {}; };

  async function refreshList() {
    try {
      if ('showDirectoryPicker' in window) {
        const entries = await listScripts();
        populateSelect(entries);
      }
    } catch {}
  }

  function populateSelect(entries: { name: string; handle: FileSystemFileHandle }[]) {
    try {
      sel.innerHTML = '';
      if (!entries.length) {
        sel.disabled = true;
        sel.append(new Option('(No scripts found)', '', true, false));
        return;
      }
      sel.disabled = false;
      for (const e of entries) {
        const opt = new Option(e.name, e.name);
        (opt as any)._handle = e.handle;
        sel.append(opt);
      }
    } catch {}
  }

  function populateSelectFromFiles(files: File[]) {
    try {
      sel.innerHTML = '';
      const filtered = files.filter(f => /\.(txt|docx|md)$/i.test(f.name)).sort((a,b)=>a.name.localeCompare(b.name));
      if (!filtered.length) {
        sel.disabled = true;
        sel.append(new Option('(No scripts found)', '', true, false));
        return;
      }
      sel.disabled = false;
      for (const f of filtered) {
        const opt = new Option(f.name, f.name);
        (opt as any)._file = f;
        sel.append(opt);
      }
    } catch {}
  }
}
