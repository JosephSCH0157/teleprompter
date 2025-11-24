// Wires the plain textarea editor to the rendered script view (and display) via renderScript.
// Keeps legacy renderScript behavior if available; otherwise falls back to a simple line renderer.

type RenderScriptFn = (text: string) => void;

type ScriptsModule = {
  Scripts: {
    init?: () => void;
    list?: () => Array<{ id: string; title: string; updated: string }>;
    get?: (id: string) => { id: string; title: string; content: string } | null;
    save?: (data: { id?: string | null; title: string; content: string }) => string;
  };
};

let scriptsModule: ScriptsModule | null = null;

function getRenderScript(): RenderScriptFn {
  const fn = (window as any).renderScript as RenderScriptFn | undefined;
  if (typeof fn === 'function') return fn;

  // Fallback: minimal renderer
  return (text: string) => {
    const scriptEl = document.getElementById('script');
    if (!scriptEl) return;
    const lines = String(text || '').split(/\n+/).filter(Boolean);
    if (!lines.length) {
      scriptEl.innerHTML = '<p><em>Paste text in the editor to begin…</em></p>';
      return;
    }
    scriptEl.innerHTML = lines
      .map((line, idx) => `<div class="line" data-line-idx="${idx}">${line}</div>`)
      .join('');
  };
}

async function ensureScriptsModule(): Promise<ScriptsModule | null> {
  if (scriptsModule) return scriptsModule;

  // Try dynamic import first (legacy helper location)
  try {
    scriptsModule = (await import('../scriptsStore_fixed.js')) as unknown as ScriptsModule;
    return scriptsModule;
  } catch (impErr) {
    try {
      console.warn('[script-editor] scriptsStore_fixed import failed', impErr);
    } catch {
      /* noop */
    }
  }

  // Fallback: global Scripts (legacy)
  const win = window as any;
  if (win.Scripts) {
    scriptsModule = { Scripts: win.Scripts as ScriptsModule['Scripts'] };
    return scriptsModule;
  }

  return null;
}

export function wireScriptEditor(): void {
  const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
  const scriptTitle = document.getElementById('scriptTitle') as HTMLInputElement | null;
  const scriptSlots = document.getElementById('scriptSlots') as HTMLSelectElement | null;
  const scriptLoadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  if (!editor) return;

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

  // Load button wiring (uses Scripts module if available, else localStorage fallback)
  if (scriptLoadBtn) {
    scriptLoadBtn.addEventListener('click', async () => {
      try {
        const mod = await ensureScriptsModule();

        if (mod && scriptSlots && scriptSlots.value) {
          const id = scriptSlots.value;
          const s = mod.Scripts.get ? mod.Scripts.get(id) : null;
          if (!s) return;

          if (scriptTitle) scriptTitle.value = s.title || 'Untitled';
          editor.value = s.content || '';
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
    const scriptEl = document.getElementById('script');
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
