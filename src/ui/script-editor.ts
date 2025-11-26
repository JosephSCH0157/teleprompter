// Wires the plain textarea editor to the rendered script view (and display) via renderScript.
// Keeps legacy renderScript behavior if available; otherwise falls back to a simple line renderer.

type RenderScriptFn = (text: string) => void;

type ScriptMeta = { id: string; title: string; updated: string };
type ScriptRecord = { id: string; title: string; content: string; updated: string; created?: string };

type ScriptsApi = {
  init?: () => void;
  list?: () => ScriptMeta[];
  get?: (id: string) => ScriptRecord | null;
  save?: (data: { id?: string | null; title: string; content: string }) => string;
  rename?: (id: string, title: string) => void;
  remove?: (id: string) => void;
};

let scriptsModule: ScriptsApi | null = null;

function resolveScriptsModule(): ScriptsApi | null {
  if (scriptsModule) return scriptsModule;

  try {
    const win = window as any;
    const S = win.Scripts as ScriptsApi | undefined;
    if (S && typeof S.list === 'function') {
      try { S.init?.(); } catch {}
      scriptsModule = S;
      return scriptsModule;
    }
  } catch {
    // ignore
  }
  return null;
}

// Keep async signature so existing callers using `await ensureScriptsModule()` still work
async function ensureScriptsModule(): Promise<ScriptsApi | null> {
  return resolveScriptsModule();
}

// --- Scripts dropdown polling state ---
let scriptsPollTimer: number | null = null;
let lastScriptsSnapshot: string | null = null;
let hasLoadedInitialScript = false;
let lastLoadedId: string | null = null;

function snapshotScripts(entries: ScriptMeta[]): string {
  return JSON.stringify(
    entries.map((e) => ({
      id: e.id,
      title: e.title,
      updated: e.updated,
    })),
  );
}

type RefreshOptions = {
  preserveSelection?: boolean;
  quiet?: boolean;
};

let scriptEditorWired = false;
async function readFileAsScriptText(file: File): Promise<string> {
  try {
    const name = (file && file.name || '').toLowerCase();
    if (name.endsWith('.docx')) {
      try {
        const ensure = (window as any).ensureMammoth as undefined | (() => Promise<any>);
        const mod = ensure ? await ensure() : null;
        const mammoth = (mod && (mod.mammoth || mod.default)) || (window as any).mammoth || null;
        if (!mammoth) throw new Error('mammoth not available');
        const buf = await file.arrayBuffer();
        const res = await (mammoth.extractRawText ? mammoth.extractRawText({ arrayBuffer: buf }) : mammoth.convertToHtml({ arrayBuffer: buf }));
        const raw = (res && (res.value || res.text || '')) || '';
        const text = String(raw).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        try { console.debug('[SCRIPT-EDITOR] mammoth converted DOCX', { length: text.length }); } catch {}
        return text;
      } catch (err) {
        try { console.error('[SCRIPT-EDITOR] DOCX conversion failed', err); } catch {}
        return '';
      }
    }
    const txt = await file.text();
    try { console.debug('[SCRIPT-EDITOR] read plain text file', { length: txt.length }); } catch {}
    return txt;
  } catch {
    return '';
  }
}

async function readOptionTextFromDropdown(id: string): Promise<string | null> {
  try {
    const selects: (HTMLSelectElement | null)[] = [
      document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null,
      document.getElementById('scriptSelect') as HTMLSelectElement | null,
      document.getElementById('scriptSlots') as HTMLSelectElement | null,
    ];

    let optionWithHandle: HTMLOptionElement | null = null;
    let firstOption: HTMLOptionElement | null = null;

    for (const sel of selects) {
      if (!sel) continue;
      const opt = Array.from(sel.options).find((o) => o.value === id) as HTMLOptionElement | undefined;
      if (!opt) continue;

      if (!firstOption) firstOption = opt;

      const anyOpt = opt as any;
      if (anyOpt.__file || anyOpt._file || anyOpt.__fileHandle || anyOpt._handle) {
        optionWithHandle = opt;
        break;
      }
    }

    const target = optionWithHandle || firstOption;
    if (!target) {
      try { console.debug('[SCRIPT-EDITOR] readOptionText: no option for id', { id }); } catch {}
      return null;
    }

    const anyOpt = target as any;
    if (anyOpt.__file instanceof File || anyOpt._file instanceof File) {
      const file = (anyOpt.__file || anyOpt._file) as File;
      const text = await readFileAsScriptText(file);
      try { console.debug('[SCRIPT-EDITOR] readOptionText: read from __file/_file', { id, length: text.length }); } catch {}
      return text;
    }

    const handle = anyOpt.__fileHandle || anyOpt._handle;
    if (handle && typeof handle.getFile === 'function') {
      const f: File = await handle.getFile();
      const text = await readFileAsScriptText(f);
      try { console.debug('[SCRIPT-EDITOR] readOptionText: read from handle', { id, length: text.length }); } catch {}
      return text;
    }

    try {
      console.debug('[SCRIPT-EDITOR] readOptionText: option has no file handle', {
        id,
        keys: Object.keys(anyOpt || {}),
      });
    } catch {}
  } catch (err) {
    try { console.warn('[SCRIPT-EDITOR] readOptionText failed', err); } catch {}
  }
  return null;
}

function getRenderScript(): RenderScriptFn {
  const fn = (window as any).renderScript as RenderScriptFn | undefined;
  if (typeof fn === 'function') return fn;

  // Fallback: minimal renderer
  return (text: string) => {
    const scriptEl = document.getElementById('script');
    if (!scriptEl) return;
    const lines = String(text || '').split(/\n+/).filter(Boolean);
    if (!lines.length) {
      scriptEl.innerHTML = '<p><em>Paste text in the editor to begin...</em></p>';
      return;
    }
    scriptEl.innerHTML = lines
      .map((line, idx) => `<div class="line" data-line-idx="${idx}">${line}</div>`)
      .join('');
  };
}

async function refreshScriptsDropdown(
  scriptSelect: HTMLSelectElement,
  opts: RefreshOptions = {},
): Promise<void> {
  const { preserveSelection = true, quiet = false } = opts;
  const prevSelected = scriptSelect.value;

  let api: ScriptsApi | null = null;
  try {
    api = await ensureScriptsModule();
  } catch {
    api = null;
  }

  if (!api || typeof api.list !== 'function') {
    scriptSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No Scripts folder found';
    opt.disabled = true;
    opt.selected = true;
    scriptSelect.appendChild(opt);
    lastScriptsSnapshot = null;
    if (!quiet) {
      (window as any)._toast?.('No Scripts folder yet. Map a Scripts folder in Settings -> Media.', {
        type: 'warn',
      });
    }
    return;
  }

  let entries: ScriptMeta[] = [];
  try {
    entries = api.list?.() || [];
  } catch (err) {
    try { console.warn('[script-editor] scripts list failed', err); } catch {}
    scriptSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Scripts folder unavailable';
    opt.disabled = true;
    opt.selected = true;
    scriptSelect.appendChild(opt);
    lastScriptsSnapshot = null;
    if (!quiet) {
      (window as any)._toast?.(
        'Scripts folder unavailable. Check the mapped folder in Settings -> Media.',
        { type: 'error' },
      );
    }
    return;
  }

  const snapshot = snapshotScripts(entries);
  if (snapshot === lastScriptsSnapshot && preserveSelection) {
    return;
  }
  lastScriptsSnapshot = snapshot;
  lastLoadedId = null;
  hasLoadedInitialScript = false;

  scriptSelect.innerHTML = '';

  if (!entries.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No scripts in folder';
    opt.disabled = true;
    opt.selected = true;
    scriptSelect.appendChild(opt);
    return;
  }

  for (const s of entries) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.title || 'Untitled';
    scriptSelect.appendChild(opt);
  }

  if (preserveSelection && prevSelected && scriptSelect.querySelector(`option[value="${prevSelected}"]`)) {
    scriptSelect.value = prevSelected;
  } else if (!preserveSelection && entries.length) {
    scriptSelect.value = entries[0].id;
  }

  // Auto-load a single script the first time we see it
  try {
    const realIds = entries
      .map((e) => (e.id || '').trim())
      .filter((v) => v);
    if (!hasLoadedInitialScript && realIds.length === 1) {
      hasLoadedInitialScript = true;
      scriptSelect.value = realIds[0];
      scriptSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch {
    // ignore
  }
}

function startScriptsPolling(scriptSelect: HTMLSelectElement): void {
  if (scriptsPollTimer !== null) {
    window.clearInterval(scriptsPollTimer);
    scriptsPollTimer = null;
  }
  void refreshScriptsDropdown(scriptSelect, { preserveSelection: false, quiet: false });
  scriptsPollTimer = window.setInterval(() => {
    void refreshScriptsDropdown(scriptSelect, { preserveSelection: true, quiet: true });
  }, 3000);
}

export function wireScriptEditor(): void {
  if (scriptEditorWired) {
    try { console.debug('[SCRIPT-EDITOR] wireScriptEditor() already wired, skipping'); } catch {}
    return;
  }
  scriptEditorWired = true;
  try { console.debug('[SCRIPT-EDITOR] wireScriptEditor() called'); } catch {}
  const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
  const scriptEl = document.getElementById('script') as HTMLDivElement | null;
  const scriptTitle = document.getElementById('scriptTitle') as HTMLInputElement | null;
  const scriptSelect =
    (document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null)
    || (document.getElementById('scriptSlots') as HTMLSelectElement | null);
  const scriptLoadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;
  const scriptRefreshBtn = document.getElementById('scriptRefreshBtn') as HTMLButtonElement | null;

  try { console.debug('[SCRIPT-EDITOR] elements', { editor, scriptEl, scriptTitle, scriptSelect, scriptLoadBtn, scriptRefreshBtn }); } catch {}

  if (!editor) return;
  if (editor.dataset.tsScriptWired === '1') return;
  editor.dataset.tsScriptWired = '1';

  const store = (() => {
    try { return (window as any).__tpStore as { get?: (_k: string) => unknown; set?: (_k: string, _v: unknown) => void } | null; } catch { return null; }
  })();

  const renderScript = getRenderScript();

  let renderTimer: number | null = null;
  let autosaveTimer: number | null = null;

  const syncStoreText = (text: string) => {
    try { store?.set?.('scriptText', text); } catch {}
  };

  const applyPasteHint = (text: string) => {
    try {
      const hint = document.querySelector<HTMLElement>('[data-tp-paste-hint]');
      if (!hint) return;
      const empty = !text || !text.trim();
      hint.hidden = !empty;
    } catch {
      // ignore
    }
  };

  const resolveSelect = (): HTMLSelectElement | null => {
    return (
      (document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null) ||
      (document.getElementById('scriptSelect') as HTMLSelectElement | null) ||
      (document.getElementById('scriptSlots') as HTMLSelectElement | null) ||
      null
    );
  };

  const loadScriptById = async (id: string) => {
    try { console.debug('[SCRIPT-EDITOR] loadScriptById called', { id }); } catch {}
    const trimmed = (id || '').trim();
    if (!trimmed) {
      (window as any)._toast?.('No script selected to load', { type: 'warn' });
      return;
    }

    let api: ScriptsApi | null = null;
    try {
      api = await ensureScriptsModule();
    } catch {
      api = null;
    }

    let rec: ScriptRecord | null = null;
    if (api && typeof api.get === 'function') {
      try {
        rec = api.get(trimmed);
      } catch (err) {
        try { console.warn('[script-editor] scripts get failed', err); } catch {}
        rec = null;
      }
    }

    let title = rec?.title || trimmed;
    let content = rec?.content || '';

    if (!content) {
      const fallbackText = await readOptionTextFromDropdown(trimmed);
      if (fallbackText) content = fallbackText;
    }

    try { console.debug('[SCRIPT-EDITOR] loaded script text length', { id: trimmed, length: content.length }); } catch {}
    if (!content) {
      try { window.toast && window.toast('That script appears to be empty or could not be read.', { type: 'error' }); } catch {}
      try { console.warn('[SCRIPT-EDITOR] loadScriptById: empty text after all fallbacks', { id: trimmed }); } catch {}
      return;
    }

    lastLoadedId = trimmed;
    const sel = resolveSelect();
    if (sel && sel.value !== trimmed) {
      try { sel.value = trimmed; } catch {}
    }
    editor.value = content;
    if (scriptTitle) {
      scriptTitle.value = title || '';
    }

    applyEditorToViewer();
    try { console.debug('[SCRIPT-EDITOR] render applied', { id }); } catch {}
    syncStoreText(editor.value || '');

    try {
      localStorage.setItem('tp_last_unsaved_script', editor.value || '');
      if (scriptTitle?.value) {
        localStorage.setItem('tp_last_script_title', scriptTitle.value);
      }
    } catch {
      /* ignore */
    }
  };

  const doLoad = async (id: string | null) => {
    try { console.debug('[SCRIPT-EDITOR] doLoad', { id, lastLoadedId }); } catch {}
    if (!id) {
      try { console.warn('[SCRIPT-EDITOR] no script id selected'); } catch {}
      return;
    }
    lastLoadedId = id;
    try {
      try { console.debug('[SCRIPT-EDITOR] loadScriptById() start', { id }); } catch {}
      await loadScriptById(id);
      try { console.debug('[SCRIPT-EDITOR] loadScriptById() done', { id }); } catch {}
    } catch (err) {
      try { console.error('[SCRIPT-EDITOR] loadScriptById() failed', { id, err }); } catch {}
    }
  };

  const applyEditorToViewer = () => {
    try {
      renderScript(editor.value || '');
      syncStoreText(editor.value || '');
      applyPasteHint(editor.value || '');
    } catch (e) {
      try {
        console.warn('[script-editor] renderScript failed, using fallback', e);
      } catch {
        /* noop */
      }
      try {
        const fallback = getRenderScript();
        fallback(editor.value || '');
      } catch {
        /* ignore */
      }
    }
  };

  const scheduleRender = () => {
    if (renderTimer !== null) window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(applyEditorToViewer, 120);
  };

  const scheduleAutosave = () => {
    if (autosaveTimer !== null) window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem('tp_last_unsaved_script', JSON.stringify({
          title: scriptTitle?.value || 'Untitled',
          content: editor.value || '',
        }));
      } catch {
        /* ignore */
      }
    }, 800);
  };

  // Live typing + viewer
  editor.addEventListener('input', () => {
    scheduleRender();
    scheduleAutosave();
    try {
      localStorage.setItem('tp_last_unsaved_script', editor.value || '');
      if (scriptTitle?.value) {
        localStorage.setItem('tp_last_script_title', scriptTitle.value);
      }
    } catch {
      /* ignore */
    }
  });

  // Paste + re-render on next tick
  editor.addEventListener('paste', () => {
    setTimeout(scheduleRender, 0);
  });

  // Delegate wiring to tolerate select/button replacements
  document.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t || t.id !== 'scriptLoadBtn') return;
    try { ev.preventDefault(); } catch {}
    try { console.debug('[SCRIPT-EDITOR] Load button click'); } catch {}
    const sel = resolveSelect();
    const id = sel ? sel.value : null;
    void doLoad(id);
  }, { capture: true });

  document.addEventListener('change', (ev) => {
    const t = ev.target as HTMLSelectElement | null;
    if (!t) return;
    if (t.id !== 'scriptSelectSidebar' && t.id !== 'scriptSelect' && t.id !== 'scriptSlots') return;
    try { console.debug('[SCRIPT-EDITOR] select change', { value: t.value }); } catch {}
    void doLoad(t.value);
  }, { capture: true });

  if (scriptSelect) {
    if (scriptRefreshBtn) {
      scriptRefreshBtn.onclick = () => {
        try { console.debug('[SCRIPT-EDITOR] refresh click'); } catch {}
        void refreshScriptsDropdown(scriptSelect, { preserveSelection: true, quiet: false });
      };
    }

    startScriptsPolling(scriptSelect);
  }

  // Initial render if editor already has content and viewer is empty
  try {
    const storedText = (() => { try { return store?.get?.('scriptText') as string | null; } catch { return null; } })();
    if (storedText && editor.value !== storedText) editor.value = storedText;
    if (scriptEl && !scriptEl.innerHTML.trim() && editor.value.trim()) {
      applyEditorToViewer();
    }
    applyPasteHint(editor.value || '');
    try { console.debug('[SCRIPT-EDITOR] wiring complete'); } catch {}
  } catch {
    /* noop */
  }

  // Also honor tp:script-load events (e.g., from mapped-folder fallback) as a data source.
  try {
    window.addEventListener('tp:script-load', (e: Event) => {
      try {
        const ce = e as CustomEvent<any>;
        const detail = ce.detail || {};
        const text: string = typeof detail.text === 'string' ? detail.text : '';
        const id = detail.id ?? detail.scriptId ?? undefined;
        const title = detail.title ?? detail.name ?? 'Untitled';

        const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
        const current = editor?.value ?? '';
        if (current === text) {
          try { console.debug('[SCRIPT-EDITOR] tp:script-load duplicate (same editor text), skipping', { id, title, length: text.length }); } catch {}
          return;
        }
        console.debug('[SCRIPT-EDITOR] tp:script-load', { id, title, length: text.length });
        if (editor) editor.value = text;
        if (scriptTitle) {
          scriptTitle.value = title;
        }
        lastLoadedId = null; // allow dropdown load to reapply after external events
        applyEditorToViewer();
        console.debug('[SCRIPT-EDITOR] render applied from tp:script-load', { id, title, length: text.length });
      } catch (err) {
        console.warn('[SCRIPT-EDITOR] tp:script-load handler failed', err);
      }
    });
  } catch {
    // ignore
  }
}

// Convenience: expose a global hook for any legacy callers
try {
  (window as any).__tpWireScriptEditor = wireScriptEditor;
} catch {
  /* noop */
}

// Auto-wire on DOM ready as a safety net (in case boot misses it)
try {
  if (typeof document !== 'undefined') {
    const run = () => {
      try { wireScriptEditor(); } catch {}
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }
} catch {
  /* noop */
}
