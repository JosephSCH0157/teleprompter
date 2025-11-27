// src/ui/script-editor.ts
// Script editor driven by window.Scripts SSOT.

import { renderScript } from '../render-script';
import { ScriptStore } from '../features/scripts-store';

type ScriptMeta = { id: string; title: string; updated?: string };
type ScriptRecord = { id: string; title: string; content: string; updated?: string; created?: string };

type ScriptsApi = {
  list(): ScriptMeta[];
  get(id: string): Promise<ScriptRecord | null> | ScriptRecord | null;
};

declare global {
  interface Window {
    __tpScriptEditorBound?: boolean;
    Scripts?: ScriptsApi;
    getScriptsApi?: () => ScriptsApi;
    __tpCurrentName?: string;
  }
}

function resolveScriptsApi(): ScriptsApi | null {
  const w = window as any;
  const fromGlobal = w.Scripts;
  if (fromGlobal && typeof fromGlobal.list === 'function' && typeof fromGlobal.get === 'function') {
    return fromGlobal as ScriptsApi;
  }
  if (typeof w.getScriptsApi === 'function') {
    try {
      const api = w.getScriptsApi();
      if (api && typeof api.list === 'function' && typeof api.get === 'function') {
        return api as ScriptsApi;
      }
    } catch {
      /* ignore */
    }
  }
  // Fallback to module singleton
  if (ScriptStore && typeof ScriptStore.list === 'function' && typeof ScriptStore.get === 'function') {
    return ScriptStore as ScriptsApi;
  }
  return null;
}

function normalizeScriptText(raw: string): string {
  return String(raw ?? '').replace(/\r\n/g, '\n');
}

export function wireScriptEditor(): void {
  if (typeof document === 'undefined') return;
  if ((window as any).__tpScriptEditorBound) {
    try { console.debug('[SCRIPT-EDITOR] already wired'); } catch {}
    return;
  }
  (window as any).__tpScriptEditorBound = true;

  const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
  const slots = document.getElementById('scriptSlots') as HTMLSelectElement | null;
  const sidebar = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const settings = document.getElementById('scriptSelect') as HTMLSelectElement | null;
  const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;
  const titleInput = document.getElementById('scriptTitle') as HTMLInputElement | null;

  const selects = [slots, sidebar, settings].filter(Boolean) as HTMLSelectElement[];
  const primary = slots || sidebar || settings;

  const refreshDropdown = () => {
    const api = resolveScriptsApi();
    if (!selects.length || !api) return;
    const metas = (() => {
      try { return api.list() || []; } catch { return []; }
    })();
    selects.forEach((sel) => {
      const prev = sel.value;
      sel.innerHTML = '';
      if (!metas.length) {
        const opt = new Option('(No saved scripts)', '', true, true);
        opt.disabled = true;
        sel.append(opt);
        return;
      }
      metas.forEach((m) => {
        if (!m || !m.id) return;
        sel.append(new Option(m.title || m.id, m.id));
      });
      if (prev && metas.some((m) => m.id === prev)) {
        sel.value = prev;
      } else {
        sel.value = metas[0].id;
      }
    });
  };

  let isApplying = false;

  const applyRecord = (rec: ScriptRecord) => {
    const text = normalizeScriptText(rec.content || '');
    const name = rec.title || rec.id;
    isApplying = true;
    if (editor) editor.value = text;
    try { renderScript(text); } catch {}
    if (titleInput) titleInput.value = name;
    try { window.__tpCurrentName = name; } catch {}
    try {
      window.dispatchEvent(new CustomEvent('tp:script-load', {
        detail: { id: rec.id, name, text, skipNormalize: true },
      }));
    } catch {}
    isApplying = false;
  };

  const loadSelected = async () => {
    const api = resolveScriptsApi();
    if (!primary || !api) return;
    const id = (primary.value || '').trim();
    if (!id) return;
    let rec: ScriptRecord | null = null;
    try {
      const res = api.get(id);
      rec = res instanceof Promise ? await res : res;
    } catch {}
    if (rec && typeof rec.content === 'string') {
      applyRecord(rec);
    } else {
      try { console.warn('[SCRIPT-EDITOR] no content for id', id); } catch {}
    }
  };

  selects.forEach((sel) => {
    sel.addEventListener('change', () => { void loadSelected(); });
  });

  if (loadBtn && primary) {
    loadBtn.addEventListener('click', (ev) => {
      try { ev.preventDefault(); } catch {}
      void loadSelected();
    });
  }

  if (editor && !(editor as any).__tpEchoWired) {
    try { (editor as any).__tpEchoWired = 1; } catch {}
    editor.addEventListener('input', () => {
      if (isApplying) return;
      try { renderScript(editor.value || ''); } catch {}
    });
  }

  try { window.addEventListener('tp:scripts-updated', refreshDropdown); } catch {}
  refreshDropdown();
  if (primary && primary.value) {
    void loadSelected();
  }

  try { console.debug('[SCRIPT-EDITOR] SSOT wiring complete'); } catch {}
}

// Auto-wire on DOM ready
if (typeof document !== 'undefined') {
  const run = () => { try { wireScriptEditor(); } catch {} };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}

