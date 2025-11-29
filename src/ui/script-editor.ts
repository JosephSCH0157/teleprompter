// src/ui/script-editor.ts
// Sidebar + Load button wiring:
// - Sidebar mirrors the Settings scripts dropdown
// - Both sidebar changes and Load button clicks forward to the Settings select
// - Mapped-folder binder remains the single source of truth for actually loading scripts

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

  const settings = document.getElementById('scriptSelect') as HTMLSelectElement | null;
  const sidebar = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const slots   = document.getElementById('scriptSlots') as HTMLSelectElement | null;
  const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  function syncSidebarFromSettings(): void {
    if (!settings || !sidebar) return;

    sidebar.innerHTML = '';
    for (let i = 0; i < settings.options.length; i++) {
      const src = settings.options[i];
      const opt = new Option(src.text, src.value);
      sidebar.add(opt);
    }

    if (settings.value) {
      sidebar.value = settings.value;
    }
  }

  function forwardChange(sel: HTMLSelectElement | null): void {
    if (!sel) return;
    try {
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      try { console.debug('[SCRIPT-EDITOR] forwardChange', { id: sel.id, value: sel.value }); } catch {}
    } catch (err) {
      try { console.warn('[SCRIPT-EDITOR] forwardChange failed', err); } catch {}
    }
  }

  if (settings && sidebar) {
    setTimeout(() => {
      try { syncSidebarFromSettings(); } catch {}
    }, 0);

    settings.addEventListener('change', () => {
      try { syncSidebarFromSettings(); } catch {}
    });

    window.addEventListener('tp:folderScripts:populated' as any, () => {
      try { syncSidebarFromSettings(); } catch {}
    });
    window.addEventListener('tp:folderScripts:refresh' as any, () => {
      try { syncSidebarFromSettings(); } catch {}
    });

    sidebar.addEventListener('change', () => {
      if (!settings) return;
      settings.value = sidebar.value;
      forwardChange(settings);
    });
  }

  if (loadBtn && !(loadBtn as any).__tpScriptLoadBtnWired) {
    (loadBtn as any).__tpScriptLoadBtnWired = true;

    loadBtn.addEventListener('click', () => {
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

      if (active === sidebar && settings) {
        settings.value = sidebar.value;
        forwardChange(settings);
      } else {
        forwardChange(active);
      }
    });
  }

  try {
    console.debug('[SCRIPT-EDITOR] wiring complete', {
      hasSettings: !!settings,
      hasSidebar: !!sidebar,
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

