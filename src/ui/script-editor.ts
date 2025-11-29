// src/ui/script-editor.ts
// Minimal script editor wiring:
// - Does NOT load scripts itself
// - Does NOT dispatch tp:script-load
// - Lets mapped-folder-bind.ts own the dropdowns
// - Owns only the Load button and re-fires change on the active select

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

  const sidebar  = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const settings = document.getElementById('scriptSelect') as HTMLSelectElement | null;
  const slots    = document.getElementById('scriptSlots') as HTMLSelectElement | null;
  const loadBtn  = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  function forwardChange(sel: HTMLSelectElement | null): void {
    if (!sel) return;
    try {
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      try { console.debug('[SCRIPT-EDITOR] forwardChange', { id: sel.id, value: sel.value }); } catch {}
    } catch (err) {
      try { console.warn('[SCRIPT-EDITOR] forwardChange failed', err); } catch {}
    }
  }

  if (loadBtn && !(loadBtn as any).__tpScriptLoadBtnWired) {
    (loadBtn as any).__tpScriptLoadBtnWired = true;

    loadBtn.addEventListener('click', () => {
      // Prefer sidebar if it has options; fall back to settings; then to slots
      const active =
        (sidebar && sidebar.options.length > 0 && sidebar.value && sidebar.value !== '__OPEN_SETTINGS__'
          ? sidebar
          : null) ||
        (settings && settings.options.length > 0 ? settings : null) ||
        (slots && slots.options.length > 0 ? slots : null);

      if (!active) {
        try { console.debug('[SCRIPT-EDITOR] Load click: no active select with options'); } catch {}
        return;
      }

      forwardChange(active);
    });
  }

  try {
    console.debug('[SCRIPT-EDITOR] wiring complete', {
      hasSidebar: !!sidebar,
      hasSettings: !!settings,
      hasSlots: !!slots,
      hasLoadBtn: !!loadBtn,
    });
  } catch {}
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installScriptEditor(), { once: true });
  } else {
    installScriptEditor();
  }
}

export {};

