// src/ui/script-editor.ts
// - Settings (#scriptSelect) is the only mapped-folder target.
// - Sidebar (#scriptSelectSidebar) mirrors Settings options + selection.
// - Load button re-fires change on whichever select is active.
// - No ScriptStore/tp:script-load usage here; mapped-folder binder owns loading.

function installScriptEditorBridge(doc: Document = document) {
  const settings = doc.getElementById('scriptSelect') as HTMLSelectElement | null;
  const sidebar  = doc.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const loadBtn  = doc.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  if (!settings && !sidebar && !loadBtn) {
    try { console.warn('[SCRIPT-EDITOR] no script selects or load button found'); } catch {}
    return;
  }

  function syncSidebarFromSettings() {
    if (!settings || !sidebar) return;

    while (sidebar.options.length > 0) sidebar.remove(0);

    for (let i = 0; i < settings.options.length; i++) {
      const src = settings.options[i];
      const opt = doc.createElement('option');
      opt.value = src.value;
      opt.text  = src.text;
      opt.selected = src.selected;
      sidebar.add(opt);
    }

    if (settings.value && sidebar.value !== settings.value) {
      sidebar.value = settings.value;
    }
  }

  if (settings && sidebar) {
    try { syncSidebarFromSettings(); } catch {}
    settings.addEventListener('change', () => {
      try { syncSidebarFromSettings(); } catch (err) { try { console.warn('[SCRIPT-EDITOR] syncSidebarFromSettings failed', err); } catch {} }
    });
  }

  if (sidebar && settings) {
    sidebar.addEventListener('change', () => {
      const value = sidebar.value;
      if (!value) return;
      if (settings.value !== value) settings.value = value;
      const ev = new Event('change', { bubbles: true });
      settings.dispatchEvent(ev);
    });
  }

  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      const active =
        (sidebar && sidebar.options.length > 0 ? sidebar :
         settings && settings.options.length > 0 ? settings :
         null);

      if (!active) {
        try { console.warn('[SCRIPT-EDITOR] Load click: no active select with options'); } catch {}
        return;
      }

      const ev = new Event('change', { bubbles: true });
      active.dispatchEvent(ev);
    });
  }

  try {
    console.info('[SCRIPT-EDITOR] bridge wired', {
      hasSettings: !!settings,
      hasSidebar: !!sidebar,
      hasLoadBtn: !!loadBtn,
    });
  } catch {}
}

declare global {
  interface Window {
    __tpScriptEditorBridgeBound?: boolean;
  }
}

if (typeof window !== 'undefined') {
  if (!window.__tpScriptEditorBridgeBound) {
    window.__tpScriptEditorBridgeBound = true;
    const run = () => installScriptEditorBridge(document);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }
}

export {};
