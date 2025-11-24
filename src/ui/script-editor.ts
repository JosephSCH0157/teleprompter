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

async function ensureScriptsModule(): Promise<ScriptsApi | null> {
  // If a store is already on window (loaded via scriptsStore_fixed.js), use it.
  try {
    const win = window as any;
    if (win.Scripts && typeof win.Scripts.list === 'function') {
      scriptsModule = win.Scripts as ScriptsApi;
      return scriptsModule;
    }
  } catch {
    /* ignore */
  }

  // No module available
  if (scriptsModule) return scriptsModule;

  return null;
}

export function wireScriptEditor(): void {
  const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
  const scriptEl = document.getElementById('script') as HTMLDivElement | null;
  const scriptTitle = document.getElementById('scriptTitle') as HTMLInputElement | null;
  const scriptSelect = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const scriptLoadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  if (!editor) return;
  // Avoid duplicate listeners if called more than once.
  if (scriptLoadBtn && scriptLoadBtn.dataset.tsWired === '1') return;
  if (scriptLoadBtn) scriptLoadBtn.dataset.tsWired = '1';

  const renderScript = getRenderScript();

  const applyEditorToViewer = () => {
    try {
      renderScript(editor.value || '');
    } catch (e) {
      try {
        console.error('[script-editor] renderScript failed', e);
      } catch {
        /* noop */
      }
    }
  };

  // Live typing → viewer
  editor.addEventListener('input', applyEditorToViewer);

  // Paste → re-render on next tick
  editor.addEventListener('paste', () => {
    setTimeout(applyEditorToViewer, 0);
  });

  // Populate dropdown from Scripts store (if present)
  ensureScriptsModule()
    .then((mod) => {
      const S = mod || ((window as any).Scripts as ScriptsApi | undefined);
      if (!S || !S.list || !scriptSelect) return;
      try { S.init?.(); } catch {}
      const entries = S.list() || [];
      scriptSelect.innerHTML = '';
      if (!entries.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No saved scripts';
        opt.disabled = true;
        opt.selected = true;
        scriptSelect.appendChild(opt);
      } else {
        for (const s of entries) {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.title || 'Untitled';
          scriptSelect.appendChild(opt);
        }
      }
    })
    .catch(() => {});

  // Load button wiring (uses Scripts module if available, else localStorage fallback)
  if (scriptLoadBtn) {
    scriptLoadBtn.addEventListener('click', async () => {
      try {
        const mod = (await ensureScriptsModule()) || ((window as any).Scripts as ScriptsApi | null);
        if (mod && scriptSelect && scriptSelect.value) {
          const id = scriptSelect.value;
          const rec = mod.get ? mod.get(id) : null;
          if (!rec) return;

          if (scriptTitle) scriptTitle.value = rec.title || 'Untitled';
          editor.value = rec.content || '';
          applyEditorToViewer();
          try {
            (window as any)._toast?.('Script loaded', { type: 'ok' });
          } catch {
            /* noop */
          }
          return;
        }

        // Fallback: last-unsaved script from localStorage
        try {
          const raw = window.localStorage?.getItem('tp_last_unsaved_script');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (scriptTitle && parsed?.title) scriptTitle.value = parsed.title;
            editor.value = parsed?.content || '';
            applyEditorToViewer();
            (window as any)._toast?.('Loaded last unsaved script', { type: 'info' });
            return;
          }
        } catch {
          /* ignore */
        }

        (window as any)._toast?.('No script available to load', { type: 'warn' });
        try { console.warn('[script-editor] No script available to load'); } catch { /* noop */ }
      } catch (e) {
        try {
          console.error('[script-editor] Load failed', e);
        } catch {
          /* noop */
        }
        (window as any)._toast?.('Load failed', { type: 'error' });
      }
    });
  }

  // Initial render if editor already has content and viewer is empty
  try {
    if (scriptEl && !scriptEl.innerHTML.trim() && editor.value.trim()) {
      applyEditorToViewer();
    }
  } catch {
    /* noop */
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
