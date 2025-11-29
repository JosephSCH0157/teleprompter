// src/ui/script-editor.ts
// Sidebar + Load button wiring:
// - Reads from ScriptStore (fed by mapped-folder-sync)
// - Dispatches tp:script-load with { name, text } so script-ingest applies it
// - Does NOT listen to tp:script-load (avoids loops)

import { ScriptStore } from '../features/scripts-store';

declare global {
  interface Window {
    __tpScriptEditorBound?: boolean;
    __tpCurrentName?: string;
  }
}

function installScriptEditor(): void {
  if (typeof document === 'undefined') return;

  const w = window as any;
  if (w.__tpScriptEditorBound) {
    try { console.debug('[SCRIPT-EDITOR] already wired'); } catch {}
    return;
  }
  w.__tpScriptEditorBound = true;

  const slots = document.getElementById('scriptSlots') as HTMLSelectElement | null;
  const sidebar = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const settings = document.getElementById('scriptSelect') as HTMLSelectElement | null;
  const titleInput = document.getElementById('scriptTitle') as HTMLInputElement | null;
  const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  // Mirror Settings scripts into Sidebar and propagate selection back
  const syncSidebarFromSettings = () => {
    if (!sidebar || !settings) return;

    sidebar.innerHTML = '';
    const opts = Array.from(settings.options || []);
    for (const opt of opts) {
      const clone = opt.cloneNode(true) as HTMLOptionElement;
      sidebar.appendChild(clone);
    }
    sidebar.value = settings.value;
  };

  if (settings && sidebar) {
    setTimeout(() => { try { syncSidebarFromSettings(); } catch {} }, 0);
    settings.addEventListener('change', () => { try { syncSidebarFromSettings(); } catch {} });
    sidebar.addEventListener('change', () => {
      if (!settings) return;
      settings.value = sidebar.value;
      settings.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function getActiveSelect(): HTMLSelectElement | null {
    if (sidebar && sidebar.options.length > 0) return sidebar;
    if (slots && slots.options.length > 0) return slots;
    return sidebar || slots;
  }

  async function loadById(id: string | null): Promise<void> {
    if (!id) {
      try { console.debug('[SCRIPT-EDITOR] loadById: no id'); } catch {}
      return;
    }

    try {
      const rec = await ScriptStore.get(id);
      if (!rec) {
        try { console.warn('[SCRIPT-EDITOR] loadById: no record for id', id); } catch {}
        return;
      }

      const name = rec.title || rec.id || 'Untitled';
      const text = rec.content || '';

      if (titleInput) {
        titleInput.value = name;
      }
      try { (window as any).__tpCurrentName = name; } catch {}

      try {
        window.dispatchEvent(
          new CustomEvent('tp:script-load', {
            detail: { name, text },
          }),
        );
        try { console.debug('[SCRIPT-EDITOR] dispatched tp:script-load', { name, length: text.length }); } catch {}
      } catch (err) {
        try { console.warn('[SCRIPT-EDITOR] dispatch tp:script-load failed', err); } catch {}
      }
    } catch (err) {
      try { console.warn('[SCRIPT-EDITOR] loadById error', err); } catch {}
    }
  }

  function wireSelect(sel: HTMLSelectElement | null): void {
    if (!sel) return;
    // Let mapped-folder binder own mapped-folder-driven selects.
    if (sel.id === 'scriptSelectSidebar' || sel.id === 'scriptSelect') {
      try { console.debug('[SCRIPT-EDITOR] skipping change wiring for mapped-folder select', { id: sel.id }); } catch {}
      return;
    }
    if ((sel as any).__tpScriptSelectWired) return;
    (sel as any).__tpScriptSelectWired = true;

    sel.addEventListener('change', () => {
      const id = sel.value || null;
      try { console.debug('[SCRIPT-EDITOR] select change → loadById', { id, from: sel.id }); } catch {}
      void loadById(id);
    });
  }

  wireSelect(slots);
  wireSelect(sidebar);

  if (loadBtn && !(loadBtn as any).__tpScriptLoadBtnWired) {
    (loadBtn as any).__tpScriptLoadBtnWired = true;
    loadBtn.addEventListener('click', () => {
      const sel = getActiveSelect();
      const id = sel ? sel.value || null : null;
      try { console.debug('[SCRIPT-EDITOR] Load button click → loadById', { id }); } catch {}
      void loadById(id);
    });
  }

  try { console.debug('[SCRIPT-EDITOR] minimal wiring complete'); } catch {}
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installScriptEditor(), { once: true });
  } else {
    installScriptEditor();
  }
}

export {};
