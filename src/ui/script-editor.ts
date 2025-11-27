// Simple script editor wiring:
//
// - Uses window.Scripts as the source of truth (mapped folder + local scripts)
// - Drives #scriptSlots dropdown + Load/Save/Save As/Delete/Rename
// - Pushes text into #editor and renders via the TS tag-aware renderer into #script

import { renderScript as tsRenderScript } from '../render-script';
import { normalizeToStandardText, fallbackNormalizeText } from '../script/normalize';

type RenderScriptFn = (text: string) => void;

type ScriptMeta = {
  id: string;
  title: string;
  updated?: string;
};

type ScriptRecord = {
  id: string;
  title: string;
  content: string;
  updated?: string;
  created?: string;
};

type ScriptsApi = {
  list?: () => ScriptMeta[];
  get?: (id: string) => ScriptRecord | Promise<ScriptRecord | null> | null;
  save?: (data: { id?: string | null; title: string; content: string }) => string;
  rename?: (id: string, title: string) => void;
  remove?: (id: string) => void;
};

function getScriptsApi(): ScriptsApi | null {
  try {
    const anyWin = window as any;
    const api = anyWin.Scripts as ScriptsApi | undefined;
    if (!api) return null;
    return api;
  } catch {
    return null;
  }
}

function normalizeScriptText(raw: string): string {
  // TEMP: bypass heavy normalization so letters stop getting mangled.
  // Let the TS renderer do its own cleaning.
  return String(raw ?? '');
}

function getRenderScript(): RenderScriptFn {
  // 1) Prefer the TypeScript renderer (full tag-aware rendering)
  if (typeof tsRenderScript === 'function') {
    return tsRenderScript;
  }

  // 2) Fallback: any legacy global renderer (JS bundle / tests)
  const maybe = (window as any).renderScript as RenderScriptFn | undefined;
  if (typeof maybe === 'function') {
    return maybe;
  }

  // 3) Last-ditch: minimal renderer, so the UI never explodes
  return (text: string) => {
    const scriptEl = document.getElementById('script') as HTMLElement | null;
    if (!scriptEl) return;

    const lines = String(text || '')
      .split(/\n+/)
      .filter((l) => l.trim().length > 0);

    if (!lines.length) {
      scriptEl.innerHTML = '<p><em>Paste text in the editor to begin…</em></p>';
      return;
    }

    scriptEl.innerHTML = lines
      .map((line) => {
        const escaped = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<p>${escaped}</p>`;
      })
      .join('');
  };
}

let wired = false;

export function wireScriptEditor(): void {
  if (wired) {
    try { console.debug('[SCRIPT-EDITOR] already wired'); } catch {}
    return;
  }
  wired = true;

  const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
  const scriptEl = document.getElementById('script') as HTMLElement | null;
  const slots = document.getElementById('scriptSlots') as HTMLSelectElement | null;
  const scriptSelectSidebar = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const scriptSelect = document.getElementById('scriptSelect') as HTMLSelectElement | null;
  const titleInput = document.getElementById('scriptTitle') as HTMLInputElement | null;

  const saveBtn = document.getElementById('scriptSaveBtn') as HTMLButtonElement | null;
  const saveAsBtn = document.getElementById('scriptSaveAsBtn') as HTMLButtonElement | null;
  const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;
  const deleteBtn = document.getElementById('scriptDeleteBtn') as HTMLButtonElement | null;
  const renameBtn = document.getElementById('scriptRenameBtn') as HTMLButtonElement | null;

  if (!editor || !scriptEl) {
    try {
      console.warn('[SCRIPT-EDITOR] editor or script element missing', { editor: !!editor, scriptEl: !!scriptEl });
    } catch {}
    return;
  }

  const renderScript = getRenderScript();
  let currentId: string | null = null;

  const applyToViewer = (text: string) => {
    try {
      renderScript(text);
    } catch (err) {
      try { console.warn('[SCRIPT-EDITOR] renderScript failed', err); } catch {}
    }
  };

  // Listen for tp:script-load events (emitted by mapped-folder pipeline) and render
  if (editor) {
    window.addEventListener('tp:script-load', (ev: Event) => {
      try {
        const detail = (ev as CustomEvent<{ name?: string; text?: string }>).detail || {};
        const raw = detail.text || '';
        if (!raw) return;
        const normalized = normalizeScriptText(raw);
        editor.value = normalized;
        if (titleInput && detail.name) titleInput.value = detail.name;
        applyToViewer(normalized);
      } catch (err) {
        try { console.warn('[SCRIPT-EDITOR] tp:script-load handler failed', err); } catch {}
      }
    });
  }

  const resolveSelect = (): HTMLSelectElement | null => {
    const doc = document;
    const slotsEl = doc.getElementById('scriptSlots') as HTMLSelectElement | null;
    if (slotsEl && slotsEl.options.length) return slotsEl;

    const sidebar = doc.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
    if (sidebar && sidebar.options.length) return sidebar;

    const settings = doc.getElementById('scriptSelect') as HTMLSelectElement | null;
    return settings;
  };

  const refreshDropdown = () => {
    if (!slots) return;

    const api = getScriptsApi();
    let entries: ScriptMeta[] = [];
    if (api && typeof api.list === 'function') {
      try {
        entries = api.list() || [];
      } catch (err) {
        try { console.warn('[SCRIPT-EDITOR] Scripts.list failed', err); } catch {}
        entries = [];
      }
    }

    const prev = slots.value;
    slots.innerHTML = '';

    if (!entries.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(No saved scripts)';
      slots.appendChild(opt);
      return;
    }

    for (const e of entries) {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.title || e.id;
      slots.appendChild(opt);
    }

    if (prev && entries.some((e) => e.id === prev)) {
      slots.value = prev;
    } else {
      slots.value = entries[0].id;
    }
  };

  const onScriptsUpdated = () => {
    try { refreshDropdown(); } catch {}
  };

  const loadById = async (id: string | null) => {
    const trimmed = (id || '').trim();
    if (!trimmed) {
      try { (window as any)._toast?.('No script selected to load', { type: 'warn' }); } catch {}
      return;
    }

    const api = getScriptsApi();
    if (!api || typeof api.get !== 'function') {
      try { console.warn('[SCRIPT-EDITOR] Scripts.get not available'); } catch {}
      return;
    }

    let rec: ScriptRecord | null = null;
    try {
      rec = await Promise.resolve(api.get(trimmed));
    } catch (err) {
      try { console.warn('[SCRIPT-EDITOR] Scripts.get failed', err); } catch {}
      rec = null;
    }

    if (!rec) {
      try { console.warn('[SCRIPT-EDITOR] no script record for id', { id: trimmed }); } catch {}
      return;
    }

    const normalized = normalizeScriptText(rec.content || '');
    editor.value = normalized;
    applyToViewer(normalized);

    currentId = rec.id;
    if (slots) slots.value = rec.id;
    if (titleInput) titleInput.value = rec.title || rec.id;

    // Notify any listeners (display, HUD, etc.)
    try {
      const ev = new CustomEvent('tp:script-load', {
        detail: { id: rec.id, title: rec.title, text: normalized },
      });
      document.dispatchEvent(ev);
    } catch {
      // ignore
    }

    try {
      console.debug('[SCRIPT-EDITOR] loaded script', {
        id: rec.id,
        title: rec.title,
        length: normalized.length,
      });
    } catch {
      // ignore
    }
  };

  const doLoad = async () => {
    const sel = resolveSelect();
    if (!sel) {
      try { (window as any)._toast?.('No script selector found', { type: 'warn' }); } catch {}
      return;
    }
    const v = (sel.value || '').trim();
    if (!v) {
      try { (window as any)._toast?.('No script selected to load', { type: 'warn' }); } catch {}
      return;
    }
    try { console.debug('[SCRIPT-EDITOR] doLoad', { id: v }); } catch {}
    void loadById(v);
  };

  // Live typing should update the viewer using the TS renderer
  editor.addEventListener('input', () => {
    applyToViewer(editor.value || '');
  });

  // --- Sidebar "Saved Scripts" wiring ---
  if (slots) {
    slots.addEventListener('change', () => {
      try { console.debug('[SCRIPT-EDITOR] scriptSlots change', { value: slots.value }); } catch {}
      void doLoad();
    });
  }

  // Load button: explicit load of current dropdown selection
  if (loadBtn) {
    loadBtn.addEventListener('click', (ev) => {
      try { ev.preventDefault(); } catch {}
      try {
        console.debug('[SCRIPT-EDITOR] Load button click', {
          activeSelectValue: slots?.value,
        });
      } catch {}
      void doLoad();
    });
  }

  // Save existing script (or create if no id yet)
  if (saveBtn) {
    saveBtn.addEventListener('click', (ev) => {
      try { ev.preventDefault(); } catch {}
      const api = getScriptsApi();
      if (!api || typeof api.save !== 'function') {
        try { console.warn('[SCRIPT-EDITOR] Scripts.save not available'); } catch {}
        return;
      }

      const title = (titleInput?.value?.trim()) || 'Untitled';
      const content = editor.value || '';

      try {
        const id = api.save({ id: currentId, title, content });
        currentId = id;
        if (slots) {
          refreshDropdown();
          slots.value = id;
        }
        if (titleInput) titleInput.value = title;
        try { (window as any)._toast?.('Script saved', { type: 'ok' }); } catch {}
      } catch (err) {
        try {
          console.error('[SCRIPT-EDITOR] Scripts.save failed', err);
          (window as any)._toast?.('Save failed', { type: 'error' });
        } catch {
          // ignore
        }
      }
    });
  }

  // Save As: always prompt for new name and create a new script
  if (saveAsBtn) {
    saveAsBtn.addEventListener('click', (ev) => {
      try { ev.preventDefault(); } catch {}
      const api = getScriptsApi();
      if (!api || typeof api.save !== 'function') {
        try { console.warn('[SCRIPT-EDITOR] Scripts.save not available for Save As'); } catch {}
        return;
      }

      const suggested = (titleInput?.value?.trim()) || 'Untitled';
      const title = window.prompt('Save script as:', suggested);
      if (!title) return;

      const content = editor.value || '';

      try {
        const id = api.save({ id: null, title, content });
        currentId = id;
        if (slots) {
          refreshDropdown();
          slots.value = id;
        }
        if (titleInput) titleInput.value = title;
        try { (window as any)._toast?.('Script saved', { type: 'ok' }); } catch {}
      } catch (err) {
        try {
          console.error('[SCRIPT-EDITOR] Scripts.save (Save As) failed', err);
          (window as any)._toast?.('Save As failed', { type: 'error' });
        } catch {
          // ignore
        }
      }
    });
  }

  // Delete current script
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (ev) => {
      try { ev.preventDefault(); } catch {}
      const api = getScriptsApi();
      if (!api || typeof api.remove !== 'function') {
        try { console.warn('[SCRIPT-EDITOR] Scripts.remove not available'); } catch {}
        return;
      }

      if (!currentId) return;
      const ok = window.confirm('Delete this script permanently?');
      if (!ok) return;

      try {
        api.remove(currentId);
        currentId = null;
        if (slots) {
          refreshDropdown();
        }
        try { (window as any)._toast?.('Script deleted', { type: 'ok' }); } catch {}
      } catch (err) {
        try {
          console.error('[SCRIPT-EDITOR] Scripts.remove failed', err);
          (window as any)._toast?.('Delete failed', { type: 'error' });
        } catch {
          // ignore
        }
      }
    });
  }

  // Rename current script
  if (renameBtn) {
    renameBtn.addEventListener('click', (ev) => {
      try { ev.preventDefault(); } catch {}
      const api = getScriptsApi();
      if (!api || typeof api.rename !== 'function') {
        try { console.warn('[SCRIPT-EDITOR] Scripts.rename not available'); } catch {}
        return;
      }

      if (!currentId) return;

      const currentTitle = (titleInput?.value?.trim()) || 'Untitled';
      const nextTitle = window.prompt('Rename script to:', currentTitle);
      if (!nextTitle || nextTitle === currentTitle) return;

      try {
        api.rename(currentId, nextTitle);
        if (titleInput) titleInput.value = nextTitle;
        if (slots) refreshDropdown();
        try { (window as any)._toast?.('Script renamed', { type: 'ok' }); } catch {}
      } catch (err) {
        try {
          console.error('[SCRIPT-EDITOR] Scripts.rename failed', err);
          (window as any)._toast?.('Rename failed', { type: 'error' }); 
        } catch {
          // ignore
        }
      }
    });
  }

  // Initial dropdown + initial load
  refreshDropdown();
  try { window.addEventListener('tp:scripts-updated', onScriptsUpdated); } catch {}

  const initialSel = resolveSelect();
  if (initialSel && initialSel.value && initialSel.value.trim()) {
    // Auto-load the first/selected script
    void loadById(initialSel.value);
  } else {
    // No saved script yet - still render whatever is in the editor
    if (editor.value.trim()) {
      applyToViewer(editor.value);
    } else {
      applyToViewer('');
    }
  }

  try { console.debug('[SCRIPT-EDITOR] wiring complete'); } catch {}
}

// Auto-wire on DOM ready as a safety net
try {
  (window as any).__tpWireScriptEditor = wireScriptEditor;
} catch {
  // ignore
}

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
  // ignore
}

