// Simple script editor wiring:
// - Uses window.Scripts as the source of truth (mapped folder + local scripts)
// - Drives #scriptSlots dropdown + Load/Save/Save As/Delete/Rename
// - Pushes text into #editor and renders via the TS tag-aware renderer into #script

import { renderScript as tsRenderScript } from '../render-script';
import { normalizeToStandardText, fallbackNormalizeText } from '../script/normalize';

type RenderScriptFn = (text: string) => void;

type ScriptMeta = { id: string; title: string; updated?: string };
type ScriptRecord = { id: string; title: string; content: string; updated?: string; created?: string };

type ScriptsApi = {
  list?: () => ScriptMeta[];
  get?: (id: string) => ScriptRecord | null;
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
  const text = String(raw ?? '');

  try {
    const s = normalizeToStandardText(text);
    if (s && s.trim()) return s;
  } catch {
    // ignore
  }

  try {
    const s = fallbackNormalizeText(text);
    if (s && s.trim()) return s;
  } catch {
    // ignore
  }

  try {
    const anyWin = window as any;
    if (typeof anyWin.normalizeToStandard === 'function') {
      const s = anyWin.normalizeToStandard(text);
      if (typeof s === 'string' && s.trim()) return s;
    }
  } catch {
    // ignore
  }

  return text;
}

function getRenderScript(): RenderScriptFn {
  // Prefer TS renderer
  if (typeof tsRenderScript === 'function') {
    return tsRenderScript;
  }

  // Fallback: any legacy global renderer
  const maybe = (window as any).renderScript as RenderScriptFn | undefined;
  if (typeof maybe === 'function') return maybe;

  // Last-ditch: super simple line renderer
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
  const titleInput = document.getElementById('scriptTitle') as HTMLInputElement | null;

  const saveBtn = document.getElementById('scriptSaveBtn') as HTMLButtonElement | null;
  const saveAsBtn = document.getElementById('scriptSaveAsBtn') as HTMLButtonElement | null;
  const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;
  const deleteBtn = document.getElementById('scriptDeleteBtn') as HTMLButtonElement | null;
  const renameBtn = document.getElementById('scriptRenameBtn') as HTMLButtonElement | null;

  if (!editor || !scriptEl) {
    try { console.warn('[SCRIPT-EDITOR] editor or script element missing'); } catch {}
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

  const loadById = (id: string | null) => {
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
      rec = api.get(trimmed);
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
      window.dispatchEvent(ev);
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

  // Live typing should update the viewer using the TS renderer
  editor.addEventListener('input', () => {
    applyToViewer(editor.value || '');
  });

  // Sidebar dropdown: change = load immediately
  if (slots) {
    slots.addEventListener('change', () => {
      loadById(slots.value || null);
    });
  }

  // Load button: explicit load of current dropdown selection
  if (loadBtn && slots) {
    loadBtn.addEventListener('click', () => {
      loadById(slots.value || null);
    });
  }

  // Save existing script (or create if no id yet)
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
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
    saveAsBtn.addEventListener('click', () => {
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
    deleteBtn.addEventListener('click', () => {
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
    renameBtn.addEventListener('click', () => {
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

  if (slots && slots.value && slots.value.trim()) {
    // Auto-load the first/selected script
    loadById(slots.value);
  } else {
    // No saved script yet – still render whatever is in the editor
    if (editor.value.trim()) {
      applyToViewer(editor.value);
    } else {
      applyToViewer(''); // minimal placeholder
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
