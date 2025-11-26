// Wires the plain textarea editor to the rendered script view (and display) via renderScript.
// Keeps legacy renderScript behavior if available; otherwise falls back to a simple line renderer.

import { normalizeToStandardText, fallbackNormalizeText } from '../script/normalize';
import { renderScript as tsRenderScript } from '../render-script';

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
      try {
        S.init?.();
      } catch {}
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

function normalizeScriptText(raw: string): string {
  try {
    const normalized = normalizeToStandardText(raw);
    if (normalized && normalized.trim()) return normalized;
  } catch {
    // ignore
  }
  try {
    const gentle = fallbackNormalizeText(raw);
    if (gentle && gentle.trim()) return gentle;
  } catch {
    // ignore
  }
  try {
    const anyWin = window as any;
    if (typeof anyWin.normalizeToStandard === 'function') {
      const out = anyWin.normalizeToStandard(raw);
      if (typeof out === 'string' && out.trim()) return out;
    }
  } catch {
    // ignore normalize failures
  }
  return raw;
}

function wrapSelectionWithBlockTags(
  editor: HTMLTextAreaElement,
  tag: 's1' | 's2' | 'guest1' | 'guest2',
): void {
  const value = editor.value || '';
  const start = editor.selectionStart ?? 0;
  const end = editor.selectionEnd ?? 0;

  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);

  const openTag = `[${tag}]`;
  const closeTag = `[/${tag}]`;

  const needsLeadingNewline = before.length > 0 && !before.endsWith('\n');
  const needsTrailingNewline = after.length > 0 && !after.startsWith('\n');

  const prefix = needsLeadingNewline ? '\n' : '';
  const suffix = needsTrailingNewline ? '\n' : '';

  let wrapped = '';

  if (selected && selected.trim().length > 0) {
    wrapped = `${prefix}${openTag}\n${selected}\n${closeTag}${suffix}`;
  } else {
    wrapped = `${prefix}${openTag}\n\n${closeTag}${suffix}`;
  }

  const newText = before + wrapped + after;
  editor.value = newText;

  if (!selected || selected.trim().length === 0) {
    const caretPos = (before + prefix + openTag + '\n').length;
    editor.selectionStart = editor.selectionEnd = caretPos;
  } else {
    const newStart = (before + prefix + openTag + '\n').length;
    const newEnd = newStart + selected.length;
    editor.selectionStart = newStart;
    editor.selectionEnd = newEnd;
  }

  // Fire input so existing handlers (store sync, render, etc.) run
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertInlineTag(
  editor: HTMLTextAreaElement,
  tag: 'note' | 'b' | 'i' | 'u',
): void {
  const value = editor.value || '';
  const start = editor.selectionStart ?? 0;
  const end = editor.selectionEnd ?? 0;

  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);

  const openTag = `[${tag}]`;
  const closeTag = `[/${tag}]`;

  const newText = before + openTag + selected + closeTag + after;
  editor.value = newText;

  const newStart = (before + openTag).length;
  const newEnd = newStart + selected.length;
  editor.selectionStart = newStart;
  editor.selectionEnd = newEnd;

  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertColorTag(
  editor: HTMLTextAreaElement,
  kind: 'color' | 'bg',
  value: string,
): void {
  const text = editor.value || '';
  const start = editor.selectionStart ?? 0;
  const end = editor.selectionEnd ?? 0;

  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);

  const tag = kind === 'color' ? 'color' : 'bg';
  const openTag = `[${tag}=${value}]`;
  const closeTag = `[/${tag}]`;

  const newText = before + openTag + selected + closeTag + after;
  editor.value = newText;

  const newStart = (before + openTag).length;
  const newEnd = newStart + selected.length;
  editor.selectionStart = newStart;
  editor.selectionEnd = newEnd;

  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function getRenderScript(): RenderScriptFn {
  if (typeof tsRenderScript === 'function') {
    return tsRenderScript;
  }

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
    opt.textContent = 'Scripts unavailable';
    scriptSelect.appendChild(opt);
    return;
  }

  let entries: ScriptMeta[] = [];
  try {
    entries = api.list?.() ?? [];
  } catch {
    entries = [];
  }

  const snap = snapshotScripts(entries);
  if (snap === lastScriptsSnapshot && !quiet) {
    // No changes; keep as-is
    return;
  }
  lastScriptsSnapshot = snap;

  scriptSelect.innerHTML = '';

  if (!entries.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(No mapped scripts)';
    scriptSelect.appendChild(opt);
    return;
  }

  for (const entry of entries) {
    const opt = document.createElement('option');
    opt.value = entry.id;
    opt.textContent = entry.title || entry.id;
    scriptSelect.appendChild(opt);
  }

  if (preserveSelection && prevSelected && entries.some((e) => e.id === prevSelected)) {
    scriptSelect.value = prevSelected;
  } else if (!hasLoadedInitialScript && entries.length === 1) {
    // Auto-select the single script on first poll
    scriptSelect.value = entries[0].id;
  } else if (!scriptSelect.value && entries.length) {
    scriptSelect.value = entries[0].id;
  }

  if (!hasLoadedInitialScript) {
    hasLoadedInitialScript = true;
  }
}

async function loadScriptById(id: string): Promise<void> {
  const editor = document.getElementById('scriptInput') as HTMLTextAreaElement | null;
  const scriptSelect = document.getElementById('scriptSelect') as HTMLSelectElement | null;
  if (!editor || !scriptSelect) return;

  let api: ScriptsApi | null = null;
  try {
    api = await ensureScriptsModule();
  } catch {
    api = null;
  }
  if (!api || typeof api.get !== 'function') return;

  let record: ScriptRecord | null = null;
  try {
    record = api.get(id);
  } catch {
    record = null;
  }
  if (!record) return;

  const normalized = normalizeScriptText(record.content || '');
  editor.value = normalized;
  scriptSelect.value = id;
  lastLoadedId = id;

  // Fire input to sync viewer & any autosave
  editor.dispatchEvent(new Event('input', { bubbles: true }));

  console.debug('[SCRIPT-EDITOR] loaded script text length', {
    id: record.id,
    length: normalized.length,
  });

  try {
    const ev = new CustomEvent('tp:script-load', {
      detail: { id: record.id, title: record.title, length: normalized.length },
    });
    document.dispatchEvent(ev);
  } catch {
    // ignore
  }
}

function startScriptsPolling(scriptSelect: HTMLSelectElement): void {
  if (scriptsPollTimer !== null) {
    window.clearInterval(scriptsPollTimer);
    scriptsPollTimer = null;
  }

  const poll = async () => {
    try {
      await refreshScriptsDropdown(scriptSelect, { preserveSelection: true, quiet: true });
    } catch (err) {
      console.warn('[SCRIPT-EDITOR] scripts polling failed', err);
    }
  };

  // Initial refresh
  void poll();

  scriptsPollTimer = window.setInterval(() => {
    void poll();
  }, 5000);
}

function stopScriptsPolling(): void {
  if (scriptsPollTimer !== null) {
    window.clearInterval(scriptsPollTimer);
    scriptsPollTimer = null;
  }
}

function setupScriptEditorBindings(): void {
  const editor = document.getElementById('scriptInput') as HTMLTextAreaElement | null;
  const scriptEl = document.getElementById('script');
  const scriptSelect = document.getElementById('scriptSelect') as HTMLSelectElement | null;
  const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;
  const saveBtn = document.getElementById('scriptSaveBtn') as HTMLButtonElement | null;
  const renameBtn = document.getElementById('scriptRenameBtn') as HTMLButtonElement | null;
  const deleteBtn = document.getElementById('scriptDeleteBtn') as HTMLButtonElement | null;
  const newBtn = document.getElementById('scriptNewBtn') as HTMLButtonElement | null;

  const speakerBtns = {
    s1: document.getElementById('btnSpeakerS1') as HTMLButtonElement | null,
    s2: document.getElementById('btnSpeakerS2') as HTMLButtonElement | null,
    guest1: document.getElementById('btnSpeakerGuest1') as HTMLButtonElement | null,
    guest2: document.getElementById('btnSpeakerGuest2') as HTMLButtonElement | null,
  };

  const tagBtns = {
    note: document.getElementById('btnTagNote') as HTMLButtonElement | null,
    bold: document.getElementById('btnTagBold') as HTMLButtonElement | null,
    italic: document.getElementById('btnTagItalic') as HTMLButtonElement | null,
    underline: document.getElementById('btnTagUnderline') as HTMLButtonElement | null,
  };

  const colorSelect = document.getElementById('scriptColorSelect') as HTMLSelectElement | null;
  const bgSelect = document.getElementById('scriptBgSelect') as HTMLSelectElement | null;

  if (!editor || !scriptEl) return;

  const renderScript = getRenderScript();

  const applyEditorToViewer = () => {
    const text = editor.value || '';
    try {
      renderScript(text);
      console.debug('[SCRIPT-EDITOR] render applied', { id: scriptSelect?.value });
    } catch (err) {
      console.warn('[SCRIPT-EDITOR] render failed', err);
    }
  };

  editor.addEventListener('input', () => {
    applyEditorToViewer();
  });

  if (scriptSelect) {
    startScriptsPolling(scriptSelect);

    scriptSelect.addEventListener('change', () => {
      const id = scriptSelect.value;
      if (!id) return;
      void loadScriptById(id);
    });
  }

  if (loadBtn && scriptSelect) {
    loadBtn.addEventListener('click', () => {
      const id = scriptSelect.value;
      if (!id) return;
      void loadScriptById(id);
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const text = editor.value || '';
      let api: ScriptsApi | null = null;
      try {
        api = await ensureScriptsModule();
      } catch {
        api = null;
      }
      if (!api || typeof api.save !== 'function') return;

      const titleInput = document.getElementById('scriptTitleInput') as HTMLInputElement | null;
      const title = titleInput?.value?.trim() || 'Untitled';

      let id = scriptSelect?.value || null;
      try {
        const newId = api.save({ id, title, content: text });
        if (newId) {
          id = newId;
          if (scriptSelect) {
            scriptSelect.value = newId;
          }
          lastLoadedId = newId;
        }
      } catch (err) {
        console.warn('[SCRIPT-EDITOR] save failed', err);
      }

      if (scriptSelect) {
        await refreshScriptsDropdown(scriptSelect, { preserveSelection: true, quiet: false });
      }
    });
  }

  if (renameBtn && scriptSelect) {
    renameBtn.addEventListener('click', async () => {
      const id = scriptSelect.value;
      if (!id) return;

      const titleInput = document.getElementById('scriptTitleInput') as HTMLInputElement | null;
      const currentTitle = titleInput?.value?.trim() || '';

      const newTitle = window.prompt('Rename script to:', currentTitle || 'Untitled');
      if (!newTitle) return;

      let api: ScriptsApi | null = null;
      try {
        api = await ensureScriptsModule();
      } catch {
        api = null;
      }
      if (!api || typeof api.rename !== 'function') return;

      try {
        api.rename(id, newTitle);
      } catch (err) {
        console.warn('[SCRIPT-EDITOR] rename failed', err);
      }

      if (titleInput) {
        titleInput.value = newTitle;
      }

      await refreshScriptsDropdown(scriptSelect, { preserveSelection: true, quiet: false });
    });
  }

  if (deleteBtn && scriptSelect) {
    deleteBtn.addEventListener('click', async () => {
      const id = scriptSelect.value;
      if (!id) return;

      if (!window.confirm('Delete this script permanently?')) return;

      let api: ScriptsApi | null = null;
      try {
        api = await ensureScriptsModule();
      } catch {
        api = null;
      }
      if (!api || typeof api.remove !== 'function') return;

      try {
        api.remove(id);
      } catch (err) {
        console.warn('[SCRIPT-EDITOR] delete failed', err);
      }

      lastLoadedId = null;

      await refreshScriptsDropdown(scriptSelect, { preserveSelection: false, quiet: false });

      if (scriptSelect.value) {
        void loadScriptById(scriptSelect.value);
      } else {
        editor.value = '';
        applyEditorToViewer();
      }
    });
  }

  if (newBtn && scriptSelect) {
    newBtn.addEventListener('click', async () => {
      const titleInput = document.getElementById('scriptTitleInput') as HTMLInputElement | null;
      const suggestedTitle = titleInput?.value?.trim() || 'Untitled';

      const title = window.prompt('New script title:', suggestedTitle);
      if (!title) return;

      let api: ScriptsApi | null = null;
      try {
        api = await ensureScriptsModule();
      } catch {
        api = null;
      }
      if (!api || typeof api.save !== 'function') return;

      let id: string | null = null;
      try {
        id = api.save({ id: null, title, content: '' });
      } catch (err) {
        console.warn('[SCRIPT-EDITOR] new script save failed', err);
      }

      if (id && scriptSelect) {
        await refreshScriptsDropdown(scriptSelect, { preserveSelection: false, quiet: false });
        scriptSelect.value = id;
        lastLoadedId = id;
      }

      if (titleInput) {
        titleInput.value = title;
      }

      editor.value = '';
      applyEditorToViewer();
    });
  }

  if (speakerBtns.s1) {
    speakerBtns.s1.addEventListener('click', () => wrapSelectionWithBlockTags(editor, 's1'));
  }
  if (speakerBtns.s2) {
    speakerBtns.s2.addEventListener('click', () => wrapSelectionWithBlockTags(editor, 's2'));
  }
  if (speakerBtns.guest1) {
    speakerBtns.guest1.addEventListener('click', () => wrapSelectionWithBlockTags(editor, 'guest1'));
  }
  if (speakerBtns.guest2) {
    speakerBtns.guest2.addEventListener('click', () => wrapSelectionWithBlockTags(editor, 'guest2'));
  }

  if (tagBtns.note) {
    tagBtns.note.addEventListener('click', () => insertInlineTag(editor, 'note'));
  }
  if (tagBtns.bold) {
    tagBtns.bold.addEventListener('click', () => insertInlineTag(editor, 'b'));
  }
  if (tagBtns.italic) {
    tagBtns.italic.addEventListener('click', () => insertInlineTag(editor, 'i'));
  }
  if (tagBtns.underline) {
    tagBtns.underline.addEventListener('click', () => insertInlineTag(editor, 'u'));
  }

  if (colorSelect) {
    colorSelect.addEventListener('change', () => {
      const val = colorSelect.value;
      if (!val) return;
      insertColorTag(editor, 'color', val);
      colorSelect.value = '';
    });
  }

  if (bgSelect) {
    bgSelect.addEventListener('change', () => {
      const val = bgSelect.value;
      if (!val) return;
      insertColorTag(editor, 'bg', val);
      bgSelect.value = '';
    });
  }

  // Initial render
  applyEditorToViewer();

  // Listen for external script load events (e.g., from other parts of the app)
  try {
    document.addEventListener('tp:script-load', (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { id?: string; title?: string } | undefined;
      const id = detail?.id || scriptSelect?.value || null;
      const title = detail?.title || '';
      if (id && scriptSelect) {
        scriptSelect.value = id;
      }
      if (title) {
        const titleInput = document.getElementById('scriptTitleInput') as HTMLInputElement | null;
        if (titleInput) {
          titleInput.value = title;
        }
      }
      applyEditorToViewer();
      console.debug('[SCRIPT-EDITOR] render applied from tp:script-load', {
        id,
        title,
        length: editor.value.length,
      });
    });
  } catch {
    // ignore
  }
}

export function wireScriptEditor(): void {
  try {
    setupScriptEditorBindings();
  } catch (err) {
    console.warn('[SCRIPT-EDITOR] wireScriptEditor failed', err);
  }
}

// Convenience: expose a global hook for any legacy callers
try {
  (window as any).__tpWireScriptEditor = wireScriptEditor;
} catch {
  /* noop */
}

try {
  if (typeof document !== 'undefined') {
    const run = () => {
      try {
        wireScriptEditor();
      } catch {}
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
