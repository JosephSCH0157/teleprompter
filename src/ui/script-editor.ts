// src/ui/script-editor.ts
// Minimal script editor wiring:
// - Does NOT load scripts itself
// - Does NOT dispatch tp:script-load
// - Lets mapped-folder-bind.ts own the dropdowns
// - Owns only the Load button and re-fires change on the active select
// - Looks up the selects fresh on each click so it never holds stale references

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

  const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  function forwardChange(sel: HTMLSelectElement | null): void {
    if (!sel) return;
    try {
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      try {
        console.debug('[SCRIPT-EDITOR] forwardChange', {
          id: sel.id,
          value: sel.value,
          options: sel.options.length,
        });
      } catch {}
    } catch (err) {
      try { console.warn('[SCRIPT-EDITOR] forwardChange failed', err); } catch {}
    }
  }

  if (loadBtn && !(loadBtn as any).__tpScriptLoadBtnWired) {
    (loadBtn as any).__tpScriptLoadBtnWired = true;

    loadBtn.addEventListener('click', () => {
      const sidebar  = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
      const settings = document.getElementById('scriptSelect') as HTMLSelectElement | null;
      const slots    = document.getElementById('scriptSlots') as HTMLSelectElement | null;

      try {
        console.debug('[SCRIPT-EDITOR] Load click DOM snapshot', {
          hasSidebar: !!sidebar,
          sidebarOptions: sidebar?.options.length ?? 0,
          sidebarValue: sidebar?.value,
          hasSettings: !!settings,
          settingsOptions: settings?.options.length ?? 0,
          settingsValue: settings?.value,
          hasSlots: !!slots,
          slotsOptions: slots?.options.length ?? 0,
          slotsValue: slots?.value,
        });
      } catch {}

      const active =
        (sidebar && sidebar.options.length > 0 && sidebar.value && sidebar.value !== '__OPEN_SETTINGS__'
          ? sidebar
          : null) ||
        (settings && settings.options.length > 0 ? settings : null) ||
        (slots && slots.options.length > 0 ? slots : null);

      if (!active) {
        try { console.debug('[SCRIPT-EDITOR] Load click: no active select with options (post-snapshot)'); } catch {}
        return;
      }

      forwardChange(active);
    });
  }

  try {
    console.debug('[SCRIPT-EDITOR] wiring complete (minimal)', {
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

