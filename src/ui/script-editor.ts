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

type ScriptMeta = { id: string; title: string };
type ScriptRecord = { id: string; title: string; content: string };

type ScriptsApi = {
  list?: () => ScriptMeta[];
  get?: (id: string) => Promise<ScriptRecord | null> | ScriptRecord | null;
};

function getScriptsApi(): ScriptsApi | null {
  try {
    const api = (window as any).Scripts as ScriptsApi | undefined;
    if (!api) return null;
    return api;
  } catch {
    return null;
  }
}

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
let lastLoadName = '';
let lastLoadText = '';
let lastPayloadKey: string | null = null;

declare global {
  interface Window {
    __tpScriptEditorBound?: boolean;
  }
}

export function wireScriptEditor(): void {
  if (wired || (typeof window !== 'undefined' && window.__tpScriptEditorBound)) {
    try { console.debug('[SCRIPT-EDITOR] already wired'); } catch {}
    return;
  }
  wired = true;
  try { (window as any).__tpScriptEditorBound = true; } catch {}

  const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
  const viewer = document.getElementById('script') as HTMLElement | null;
  const titleInput = document.getElementById('scriptTitle') as HTMLInputElement | null;
  const sidebarSlots = document.getElementById('scriptSlots') as HTMLSelectElement | null;
  const sidebarSelect = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const settingsSelect = document.getElementById('scriptSelect') as HTMLSelectElement | null;
  const selects = [sidebarSlots, sidebarSelect, settingsSelect].filter(Boolean) as HTMLSelectElement[];
  const primarySelect = sidebarSlots || sidebarSelect || settingsSelect;
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

  const attachTpScriptLoadHandler = (
    ed: HTMLTextAreaElement,
    scriptTitleEl: HTMLInputElement | null,
    sidebar: HTMLSelectElement | null,
    sidebarLegacy: HTMLSelectElement | null,
  ) => {
    let handling = false;
    const handler = (ev: Event) => {
      if (handling) return;
      const detail = (ev as CustomEvent<{ name?: string; text?: string }>).detail || {};
      const rawText = detail.text ?? '';
      const rawName = detail.name ?? '';
      const name = typeof rawName === 'string' ? rawName : '';
      const textStr = typeof rawText === 'string' ? rawText : '';
      const payloadKey = JSON.stringify({ name, textStr });
      if (payloadKey === lastPayloadKey) return;
      lastPayloadKey = payloadKey;

      try {
        console.debug('[SCRIPT-EDITOR] tp:script-load received', {
          name,
          length: textStr ? String(textStr).length : 0,
        });
      } catch {}

      if (!textStr) return;
      // Avoid loops if some other listener echoes the same payload back
      if (lastLoadName === name && lastLoadText === textStr) return;
      lastLoadName = name;
      lastLoadText = textStr;

      handling = true;
      applyToEditorAndViewer(textStr);
      handling = false;

      if (scriptTitleEl && name) {
        scriptTitleEl.value = name;
      }

      const syncSelect = (sel: HTMLSelectElement | null) => {
        if (!sel || !name) return;
        const options = Array.from(sel.options);
        const match =
          options.find((o) => o.value === name) ||
          options.find((o) => o.text === name);
        if (match) {
          sel.value = match.value;
        }
      };

      syncSelect(sidebar);
      syncSelect(sidebarLegacy);
    };

    try {
      window.addEventListener('tp:script-load', handler as EventListener);
      document.addEventListener('tp:script-load', handler as EventListener);
    } catch {}
  };

  // When mapped-folder/docx loader fires tp:script-load, update UI + render
  attachTpScriptLoadHandler(editor, titleInput, primarySelect, sidebarSelect);

  const refreshDropdowns = () => {
    const api = getScriptsApi();
    const entries: ScriptMeta[] = api && typeof api.list === 'function' ? (api.list() || []) : [];
    if (!selects.length) return;
    selects.forEach((sel) => {
      const prev = sel.value;
      sel.innerHTML = '';
      if (!entries.length) {
        const opt = new Option('(No saved scripts)', '', true, true);
        opt.disabled = true;
        sel.append(opt);
        return;
      }
      entries.forEach((e) => {
        const opt = new Option(e.title || e.id, e.id);
        sel.append(opt);
      });
      if (prev && entries.some((e) => e.id === prev)) {
        sel.value = prev;
      } else {
        sel.value = entries[0].id;
      }
    });
  };

  const loadById = async (id: string | null) => {
    const trimmed = (id || '').trim();
    if (!trimmed) return;
    const api = getScriptsApi();
    const rec = api && typeof api.get === 'function' ? await Promise.resolve(api.get(trimmed)) : null;
    if (!rec || typeof rec.content !== 'string') return;
    applyToEditorAndViewer(rec.content);
    if (titleInput) titleInput.value = rec.title || rec.id;
    lastLoadName = rec.id;
    lastLoadText = rec.content;
    try {
      window.dispatchEvent(new CustomEvent('tp:script-load', {
        detail: { id: rec.id, name: rec.title || rec.id, text: rec.content, skipNormalize: true },
      }));
    } catch {}
  };

  selects.forEach((sel) => {
    sel.addEventListener('change', () => {
      void loadById(sel.value || null);
    });
  });

  // Load button: just re-fire the sidebar select's change handler so the
  // mapped-folder pipeline does its normal docx â†’ text â†’ tp:script-load flow.
  if (loadBtn && primarySelect) {
    loadBtn.addEventListener('click', (ev) => {
      try { ev.preventDefault(); } catch {}
      try {
        console.debug('[SCRIPT-EDITOR] Load button click', {
          activeSelectValue: primarySelect.value,
        });
      } catch {}

      void loadById(primarySelect.value || null);
    });
  } else {
    try {
      console.warn('[SCRIPT-EDITOR] Load wiring incomplete', {
        hasLoadBtn: !!loadBtn,
        hasSidebarSelect: !!sidebarSelect,
      });
    } catch {}
  }

  try { window.addEventListener('tp:scripts-updated', refreshDropdowns); } catch {}
  refreshDropdowns();
  if (primarySelect && primarySelect.value) {
    void loadById(primarySelect.value);
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

