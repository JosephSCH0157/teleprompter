// src/ui/script-editor.ts
// Thin bridge: sidebar + Load button proxy into the working Settings loader.
// Script ingest (src/features/script-ingest.ts) remains the source of truth
// for applying tp:script-load into #editor + renderScript.

declare global {
  interface Window {
    __tpScriptEditorBound?: boolean;
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
  const settingsSelect = document.getElementById('scriptSelect') as HTMLSelectElement | null;
  const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  let lastPayloadKey: string | null = null;

  // Optional: observe tp:script-load without changing behavior.
  // script-ingest already applies text to #editor + renderScript.
  try {
    window.addEventListener('tp:script-load', (ev: Event) => {
      try {
        const e = ev as CustomEvent<any>;
        const d = e.detail || {};
        const name = typeof d.name === 'string' ? d.name : 'Untitled';
        const txt = typeof d.text === 'string' ? String(d.text) : '';
        const key = `${name}|${txt.length}`;
        if (key === lastPayloadKey) return;
        lastPayloadKey = key;
        console.debug('[SCRIPT-EDITOR] tp:script-load received', { name, length: txt.length });
      } catch (err) {
        try { console.warn('[SCRIPT-EDITOR] tp:script-load handler failed', err); } catch {}
      }
    });
  } catch {}

  function proxyToSettingsSelect(targetId: string | null): void {
    if (!settingsSelect) {
      try { console.warn('[SCRIPT-EDITOR] proxyToSettingsSelect: no #scriptSelect present'); } catch {}
      return;
    }

    if (targetId) {
      settingsSelect.value = targetId;
    }

    const ev = new Event('change', { bubbles: true });
    settingsSelect.dispatchEvent(ev);
  }

  // When the sidebar Saved Scripts select changes, mirror it into Settings
  // so the mapped-folder binder on #scriptSelect does the actual load.
  if (sidebar && !(sidebar as any).__tpSidebarProxyWired) {
    (sidebar as any).__tpSidebarProxyWired = true;
    sidebar.addEventListener('change', () => {
      const id = sidebar.value || null;
      try { console.debug('[SCRIPT-EDITOR] sidebar change → proxyToSettingsSelect', { id }); } catch {}
      proxyToSettingsSelect(id);
    });
  }

  // Load button: use the current sidebar selection if available, otherwise
  // fall back to Settings, otherwise (legacy) scriptSlots.
  if (loadBtn && !(loadBtn as any).__tpSidebarLoadWired) {
    (loadBtn as any).__tpSidebarLoadWired = true;
    loadBtn.addEventListener('click', () => {
      const id =
        (sidebar && sidebar.value) ||
        (settingsSelect && settingsSelect.value) ||
        (slots && slots.value) ||
        null;

      try { console.debug('[SCRIPT-EDITOR] Load button click → proxyToSettingsSelect', { id }); } catch {}
      proxyToSettingsSelect(id);
    });
  }

  try { console.debug('[SCRIPT-EDITOR] minimal wiring complete'); } catch {}
}

// Auto-install
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installScriptEditor, { once: true });
  } else {
    installScriptEditor();
  }
}

export {};
