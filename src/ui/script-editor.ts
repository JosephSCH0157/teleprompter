// src/ui/script-editor.ts
// Minimal wiring so the sidebar + mapped-folder pipeline drive the TS renderer.
//
// - Listens for `tp:script-load` (emitted by mapped-folder/docx loader)
// - Updates the sidebar title + textarea
// - Renders via the TypeScript tag-aware renderer into #script
// - Wires the Load button to re-fire the sidebar <select> change event
//
// This deliberately does NOT use window.Scripts / ScriptStore yet.

import { renderScript as tsRenderScript } from '../render-script';
import { normalizeToStandardText } from '../script/normalize';

type RenderFn = (text: string) => void;

function getRenderFn(): RenderFn {
  // Prefer TS renderer
  if (typeof tsRenderScript === 'function') {
    return tsRenderScript;
  }

  // Fallback to any legacy global renderer if present
  const legacy = (window as any).renderScript as RenderFn | undefined;
  if (typeof legacy === 'function') {
    return legacy;
  }

  // Last-ditch: plain text into #script so UI never explodes
  return (text: string) => {
    const el = document.getElementById('script') as HTMLElement | null;
    if (!el) return;
    el.textContent = text ?? '';
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
  const viewer = document.getElementById('script') as HTMLElement | null;
  const titleInput = document.getElementById('scriptTitle') as HTMLInputElement | null;
  const sidebarSelect = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  if (!editor || !viewer) {
    try {
      console.warn('[SCRIPT-EDITOR] missing editor or script element', {
        hasEditor: !!editor,
        hasViewer: !!viewer,
      });
    } catch {}
    return;
  }

  const render = getRenderFn();

  const applyToEditorAndViewer = (raw: string) => {
    const text = normalizeToStandardText(raw ?? '');
    editor.value = text;
    try {
      render(text);
    } catch (err) {
      try { console.error('[SCRIPT-EDITOR] render failed', err); } catch {}
    }
  };

  // Live typing: keep viewer updated as you edit
  editor.addEventListener('input', () => {
    applyToEditorAndViewer(editor.value || '');
  });

  // When mapped-folder/docx loader fires tp:script-load, update UI + render
  const handleTpScriptLoad = (ev: Event) => {
    const detail = (ev as CustomEvent<{ name?: string; text?: string }>).detail || {};
    const rawText = detail.text ?? '';
    const rawName = detail.name ?? '';
    const name = typeof rawName === 'string' ? rawName : '';

    try {
      console.debug('[SCRIPT-EDITOR] tp:script-load received', {
        name,
        length: rawText ? String(rawText).length : 0,
      });
    } catch {}

    if (!rawText) return;

    applyToEditorAndViewer(String(rawText));

    if (titleInput && name) {
      titleInput.value = name;
    }

    if (sidebarSelect && name) {
      // Try to keep sidebar selection in sync with loaded script
      const options = Array.from(sidebarSelect.options);
      const match =
        options.find((o) => o.value === name) ||
        options.find((o) => o.text === name);
      if (match) {
        sidebarSelect.value = match.value;
      }
    }
  };

  try {
    window.addEventListener('tp:script-load', handleTpScriptLoad as EventListener);
    document.addEventListener('tp:script-load', handleTpScriptLoad as EventListener);
  } catch {}

  // Load button: just re-fire the sidebar select's change handler so the
  // mapped-folder pipeline does its normal docx â†’ text â†’ tp:script-load flow.
  if (loadBtn && sidebarSelect) {
    loadBtn.addEventListener('click', (ev) => {
      try { ev.preventDefault(); } catch {}
      try {
        console.debug('[SCRIPT-EDITOR] Load button click', {
          activeSelectValue: sidebarSelect.value,
        });
      } catch {}

      const evt = new Event('change', { bubbles: true });
      sidebarSelect.dispatchEvent(evt);
    });
  } else {
    try {
      console.warn('[SCRIPT-EDITOR] Load wiring incomplete', {
        hasLoadBtn: !!loadBtn,
        hasSidebarSelect: !!sidebarSelect,
      });
    } catch {}
  }

  try { console.debug('[SCRIPT-EDITOR] minimal wiring complete'); } catch {}
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
      try { wireScriptEditor(); } catch (err) {
        try { console.error('[SCRIPT-EDITOR] auto-wire failed', err); } catch {}
      }
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

