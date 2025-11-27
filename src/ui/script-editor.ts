// src/ui/script-editor.ts
// Script editor driven by window.Scripts SSOT.

import { renderScript } from '../render-script';

type ScriptRecord = { id: string; title: string; content: string; updated?: string; created?: string };

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

  // Apply tp:script-load events emitted by mapped-folder binder/settings
  try {
    window.addEventListener('tp:script-load', (ev: Event) => {
      const detail = (ev as CustomEvent<{ name?: string; text?: string }>).detail || {};
      const text = typeof detail.text === 'string' ? detail.text : '';
      const name = typeof detail.name === 'string' ? detail.name : '';
      if (!text) return;
      applyRecord({ id: name || 'Untitled', title: name || 'Untitled', content: text });
      // Keep selects in sync with loaded script name
      selects.forEach((sel) => {
        if (!sel || !name) return;
        const match = Array.from(sel.options).find((o) => o.value === name || o.text === name);
        if (match) sel.value = match.value;
      });
    });
  } catch {}

  // Sidebar/select changes are handled by mapped-folder binder; Load button should trigger the same change
  if (loadBtn && primary) {
    loadBtn.addEventListener('click', (ev) => {
      try { ev.preventDefault(); } catch {}
      try {
        const evt = new Event('change', { bubbles: true });
        primary.dispatchEvent(evt);
      } catch {}
    });
  }

  if (editor && !(editor as any).__tpEchoWired) {
    try { (editor as any).__tpEchoWired = 1; } catch {}
    editor.addEventListener('input', () => {
      if (isApplying) return;
      try { renderScript(editor.value || ''); } catch {}
    });
  }

  try { console.debug('[SCRIPT-EDITOR] event wiring complete'); } catch {}
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

