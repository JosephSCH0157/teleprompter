// src/ui/mapped-folder-bind.ts
// Bind Choose Folder button + Scripts <select> to mapped-folder SSOT.
// Safe no-op if elements are missing.

import { initMappedFolder, listScripts, onMappedFolder, pickMappedFolder } from '../fs/mapped-folder';

type BindOpts = {
  button: string | HTMLElement; // Choose Folder button selector or element
  select: string | HTMLSelectElement; // Scripts dropdown selector or element
  fallbackInput?: string | HTMLInputElement; // optional <input type="file" webkitdirectory>
  onSelect?: (_fileOrHandle: FileSystemFileHandle | File | null) => void; // callback when user picks a script
};

export async function bindMappedFolderUI(opts: BindOpts): Promise<() => void> {
  const btn = typeof opts.button === 'string' ? document.querySelector(opts.button) as HTMLButtonElement : opts.button as HTMLButtonElement;
  const sel = typeof opts.select === 'string' ? document.querySelector(opts.select) as HTMLSelectElement : opts.select as HTMLSelectElement;
  const fallback = opts.fallbackInput ? (typeof opts.fallbackInput === 'string' ? document.querySelector(opts.fallbackInput) as HTMLInputElement : opts.fallbackInput) : null;

  if (!btn || !sel) return () => {};
  // Avoid double-binding across reinjections
  if ((btn as any).dataset && (btn as any).dataset.mappedFolderWired === '1') {
    return () => {};
  }

  await initMappedFolder();

  try { (btn as any).dataset.mappedFolderWired = '1'; } catch {}
  btn.addEventListener('click', async () => {
    try {
      if ('showDirectoryPicker' in window) {
        try {
          const ok = await pickMappedFolder();
          if (ok) {
            await refreshList();
            try { (window as any).HUD?.log?.('folder:mapped', { count: _lastCount }); } catch {}
          } else {
            // If picker returns falsy (cancel/no-op), do nothing
          }
        } catch (err: any) {
          // Handle non-user-activation environments (CI/automation) by falling back to hidden input when present
          const name = (err && (err.name || err.code)) || '';
          if (String(name) === 'NotAllowedError' && fallback) {
            try { (window as any).HUD?.log?.('folder:pick:not-allowed', { fallback: true }); } catch {}
            fallback.click();
          } else {
            try { console.warn('[mapped-folder] pick failed', err); } catch {}
          }
        }
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
        // If user canceled or automation triggered empty selection, ignore silently
        if (!files.length) { try { (window as any).HUD?.log?.('folder:fallback:empty'); } catch {}; return; }
        populateSelectFromFiles(files);
      } catch {}
    });
  }

  sel.addEventListener('change', async () => {
    try {
      const opt = sel.selectedOptions && sel.selectedOptions[0] ? sel.selectedOptions[0] : sel.options[sel.selectedIndex];
      if (!opt) return;
      sel.setAttribute('aria-busy','true');
      const handle = (opt as any)?.__handle || (opt as any)?._handle;
      const file = (opt as any)?.__file || (opt as any)?._file;
      if (handle || file) {
        const { name, text } = await readHandleOrFile(handle || file);
        try { (window as any).__tpCurrentName = name; } catch {}
        try { localStorage.setItem('tp_last_script_name', name); } catch {}
        window.dispatchEvent(new CustomEvent('tp:script-load', { detail: { name, text } }));
      } else {
        opts.onSelect?.(null);
        // In CI mock mode, emit a synthetic apply so smoke can assert content updates
        const mockMode = !!(window as any).__tpMockFolderMode;
        if (mockMode) {
          const name = opt?.text || 'Mock_Script.txt';
          const text = `This is a CI mock script for ${name}.\n\n- Line 1\n- Line 2\n- Line 3`;
          try { (window as any).HUD?.log?.('script:loaded:mock', { name, chars: text.length }); } catch {}
          try { localStorage.setItem('tp_last_script_name', name); } catch {}
          try { window.dispatchEvent(new CustomEvent('tp:script-load', { detail: { name, text } })); } catch {}
        }
        // Settings link sentinel (sidebar placeholder when no folder mapped)
        if ((opt as any).dataset && (opt as any).dataset.settingsLink === '1') {
          try { document.getElementById('settingsBtn')?.click(); } catch {}
          try { requestAnimationFrame(() => { try { document.getElementById('scriptsFolderCard')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch {} }); } catch {}
        }
      }
    } catch (e) { try { console.warn('[mapped-folder] mammoth parse failed', e); } catch {} }
    finally { try { sel.setAttribute('aria-busy','false'); } catch {} }
  });

  const off = onMappedFolder(async () => { await refreshList(); });
  const onRefresh: EventListener = () => { try { refreshList(); } catch {}; };
  try { window.addEventListener('tp:folderScripts:refresh', onRefresh); } catch {}
  await refreshList();
  return () => {
    try { off(); } catch {}
    try { window.removeEventListener('tp:folderScripts:refresh', onRefresh); } catch {}
  };

  async function refreshList() {
    try {
      // In deterministic CI mock mode, preserve pre-populated options (avoid wiping to "(No scripts found)")
      const mockMode = !!(window as any).__tpMockFolderMode;
      const hasPreMock = mockMode && sel && sel.options && sel.options.length > 1 && !(window as any).__tpFolder?.get?.();
      if (hasPreMock) {
        // Skip clearing; still emit populated event for parity
        try { window.dispatchEvent(new CustomEvent('tp:folderScripts:populated', { detail: { count: sel.options.length } })); } catch {}
        return;
      }
      try { sel.setAttribute('aria-busy','true'); } catch {}
      if ('showDirectoryPicker' in window) {
        const entries = await listScripts();
        populateSelect(entries);
        _lastCount = entries.length;
        try { announceCount(_lastCount); } catch {}
      }
    } catch {}
    finally { try { sel.setAttribute('aria-busy','false'); } catch {} }
  }

  function populateSelect(entries: { name: string; handle: FileSystemFileHandle }[]) {
    try {
      sel.innerHTML = '';
      try { sel.setAttribute('aria-busy','true'); } catch {}
      if (!entries.length) {
        // Sidebar gets a Settings link placeholder instead of disabled select
        if (sel.id === 'scriptSelectSidebar') {
          sel.disabled = false;
          const opt = new Option('Map script folder…', '__OPEN_SETTINGS__');
          (opt as any).dataset.settingsLink = '1';
          sel.append(opt);
        } else {
          sel.disabled = true;
          sel.append(new Option('(No scripts found)', '', true, false));
        }
        try { (window as any).HUD?.log?.('folder:cleared', {}); } catch {}
        try { window.dispatchEvent(new CustomEvent('tp:folderScripts:populated', { detail: { count: 0 } })); } catch {}
        try { announceCount(0); } catch {}
        return;
      }
      sel.disabled = false;
      for (const e of entries) {
        const opt = new Option(e.name, e.name);
        (opt as any)._handle = e.handle;
        sel.append(opt);
      }
      // Preselect last used script if present
      try {
        const last = getLastScriptName();
        if (last) {
          setSelectedByName(sel, last);
          (window as any).HUD?.log?.('script:last:preselect', { name: last });
        }
        maybeAutoLoad(sel);
      } catch {}
      const cnt = sel.options.length;
      try { window.dispatchEvent(new CustomEvent('tp:folderScripts:populated', { detail: { count: cnt } })); } catch {}
      try { announceCount(cnt); } catch {}
      try { sel.setAttribute('aria-busy','false'); } catch {}
    } catch {}
  }

  function populateSelectFromFiles(files: File[]) {
    try {
      const mockMode = !!(window as any).__tpMockFolderMode;
      const hasPreMock = mockMode && sel && sel.options && sel.options.length > 1 && !(window as any).__tpFolder?.get?.();
      if (hasPreMock) {
        // Preserve mock; skip replacing with fallback file list
        try { window.dispatchEvent(new CustomEvent('tp:folderScripts:populated', { detail: { count: sel.options.length } })); } catch {}
        return;
      }
      sel.innerHTML = '';
      try { sel.setAttribute('aria-busy','true'); } catch {}
      const filtered = files.filter(f => /\.(txt|docx|md)$/i.test(f.name)).sort((a,b)=>a.name.localeCompare(b.name));
      if (!filtered.length) {
        if (sel.id === 'scriptSelectSidebar') {
          sel.disabled = false;
          const opt = new Option('Map script folder…', '__OPEN_SETTINGS__');
          (opt as any).dataset.settingsLink = '1';
          sel.append(opt);
        } else {
          sel.disabled = true;
          sel.append(new Option('(No scripts found)', '', true, false));
        }
        try { (window as any).HUD?.log?.('folder:cleared', {}); } catch {}
        try { window.dispatchEvent(new CustomEvent('tp:folderScripts:populated', { detail: { count: 0 } })); } catch {}
        try { announceCount(0); } catch {}
        return;
      }
      sel.disabled = false;
      for (const f of filtered) {
        const opt = new Option(f.name, f.name);
        (opt as any)._file = f;
        sel.append(opt);
      }
      try { (window as any).HUD?.log?.('folder:mapped', { count: filtered.length }); } catch {}
      // Preselect last used script if present (fallback path) + maybe auto-load
      try {
        const last = getLastScriptName();
        if (last) {
          setSelectedByName(sel, last);
          (window as any).HUD?.log?.('script:last:preselect', { name: last });
        }
        maybeAutoLoad(sel);
      } catch {}
      const cnt = sel.options.length;
      try { window.dispatchEvent(new CustomEvent('tp:folderScripts:populated', { detail: { count: cnt } })); } catch {}
      try { announceCount(cnt); } catch {}
      try { sel.setAttribute('aria-busy','false'); } catch {}
    } catch {}
  }

  function announceCount(n: number) {
    try {
      // Ensure a small aria-live polite status next to the select
      const id = (sel && sel.id) ? ('scriptsStatus_' + sel.id) : 'scriptsStatus_generic';
      let s = document.getElementById(id) as HTMLElement | null;
      if (!s) {
        s = document.createElement('span');
        s.id = id;
        s.setAttribute('aria-live', 'polite');
        s.className = 'chip sidebar-hint';
        // Try to place after the select; fallback to append to its parent
        if (sel && sel.parentElement) {
          sel.parentElement.appendChild(s);
        } else {
          document.body.appendChild(s);
        }
      }
      s.textContent = n === 1 ? '1 script found' : `${n} scripts found`;
    } catch {}
  }
}

async function readHandleOrFile(handleOrFile: any): Promise<{ name: string; text: string }> {
  try {
    const file: File = handleOrFile?.getFile ? await handleOrFile.getFile() : handleOrFile;
    const name = file?.name || 'Untitled';
    if (file && /\.docx$/i.test(name)) {
      const text = await docxToTextViaMammoth(file);
      return { name, text };
    }
    const text = file ? await file.text() : '';
    return { name, text };
  } catch (e) {
    const name = 'Untitled';
    return { name, text: '[error] Failed to read file: ' + (e && (e as any).message || String(e)) + '[/error]' };
  }
}

async function docxToTextViaMammoth(file: File): Promise<string> {
  try {
    const ensure = (window as any).ensureMammoth as undefined | (() => Promise<any>);
    const mod = ensure ? await ensure() : null;
    const mammoth = (mod && (mod.mammoth || mod.default)) || (window as any).mammoth || null;
    if (!mammoth) throw new Error('mammoth not available');
    const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
    const raw = (res && (res.value || res.text || '')) || '';
    return String(raw).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  } catch (e) {
    try { console.warn('[mapped-folder] mammoth parse failed', e); } catch {}
    return '';
  }
}

let _lastCount = 0; // track last script count for HUD logging

export async function recheckMappedFolderPermissions() {
  try {
    const dir = (window as any).__tpFolder?.get?.();
    if (!dir) { toast('No folder mapped'); return false; }
    // @ts-ignore
    const res = await (dir as any).requestPermission?.({ mode: 'read' });
    const granted = res === 'granted';
    try { (window as any).HUD?.log?.('folder:permission', { granted }); } catch {}
    toast(granted ? 'Folder access granted' : 'Folder access denied');
    if (!granted) {
      try { await (window as any).__tpFolder?.clear?.(); } catch {}
    }
    return granted;
  } catch { return false; }
}

// tiny toast: HUD event first; alert fallback to ensure visibility
function toast(msg: string) {
  try { (window as any).HUD?.log?.('toast', { msg }); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:toast', { detail: { msg, ts: Date.now() } })); } catch {}
  try { if (!(window as any).HUD) alert(msg); } catch {}
}

// Optional binder for a recheck button; no-op if selector missing
export function bindPermissionButton(selector: string) {
  try {
    const btn = document.querySelector(selector) as HTMLButtonElement | null;
    if (!btn) return;
    btn.addEventListener('click', () => { try { recheckMappedFolderPermissions(); } catch {} });
  } catch {}
}

// "Last script" helpers
function getLastScriptName(): string | null {
  try { return localStorage.getItem('tp_last_script_name'); } catch { return null; }
}
function setSelectedByName(sel: HTMLSelectElement, name: string | null): void {
  if (!name) return;
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].text === name) { sel.selectedIndex = i; break; }
  }
}
function maybeAutoLoad(sel: HTMLSelectElement) {
  try {
    const s = (window as any).__tpSettings?.get?.() || (window as any).__tpSettingsStore || null;
    const auto = !!(s && s.autoLoadLastScript);
    if (auto && sel.selectedIndex >= 0) {
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      (window as any).HUD?.log?.('script:auto-load:last', { name: sel.options[sel.selectedIndex]?.text });
    }
  } catch {}
}
