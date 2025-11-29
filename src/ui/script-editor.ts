// src/ui/script-editor.ts
// Minimal bridge: Settings owns mapped folder; sidebar + Load just forward to it.

declare global {
  interface Window {
    __tpScriptEditorBound?: boolean;
  }
}

function installScriptEditorBridge() {
  if (window.__tpScriptEditorBound) {
    try { console.debug('[SCRIPT-EDITOR] already installed'); } catch {}
    return;
  }
  window.__tpScriptEditorBound = true;

  const doc = window.document;
  const settings = doc.getElementById('scriptSelect') as HTMLSelectElement | null;
  const sidebar = doc.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const loadBtn = doc.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  try {
    console.debug('[SCRIPT-EDITOR] install bridge', {
      hasSettings: !!settings,
      hasSidebar: !!sidebar,
      hasLoadBtn: !!loadBtn,
    });
  } catch {}

  if (!settings) {
    // If Settings isn’t there, nothing to do.
    return;
  }

  // Clone Settings options into sidebar
  const syncSidebarFromSettings = () => {
    if (!sidebar) return;
    try {
      const opts = Array.from(settings.options || []);
      sidebar.innerHTML = '';
      for (const opt of opts) {
        const clone = opt.cloneNode(true) as HTMLOptionElement;
        sidebar.appendChild(clone);
      }
      sidebar.value = settings.value;
      try {
        console.debug('[SCRIPT-EDITOR] syncSidebarFromSettings', {
          settingsValue: settings.value,
          settingsOptions: settings.options.length,
          sidebarOptions: sidebar.options.length,
        });
      } catch {}
    } catch (err) {
      try { console.warn('[SCRIPT-EDITOR] syncSidebarFromSettings failed', err); } catch {}
    }
  };

  // Initial sync – in case mapped folder already populated Settings
  syncSidebarFromSettings();
  // Fallback syncs to catch async folder mapping
  setTimeout(syncSidebarFromSettings, 250);
  setTimeout(syncSidebarFromSettings, 1000);

  // When Settings changes (user picks script or mapped-folder fires change),
  // resync the sidebar.
  settings.addEventListener('change', () => {
    syncSidebarFromSettings();
  });

  // When sidebar changes, drive Settings + its mapped-folder handler.
  if (sidebar) {
    sidebar.addEventListener('change', () => {
      try {
        if (!sidebar.value) return;
        settings.value = sidebar.value;
        try {
          console.debug('[SCRIPT-EDITOR] sidebar change → settings change', {
            value: sidebar.value,
          });
        } catch {}
        settings.dispatchEvent(
          new Event('change', { bubbles: true })
        );
      } catch (err) {
        try { console.warn('[SCRIPT-EDITOR] sidebar change handler failed', err); } catch {}
      }
    });
  }

  // Load button just re-fires change on the active select
  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      const active: HTMLSelectElement | null =
        (sidebar && sidebar.options.length > 0 ? sidebar : settings);

      const hasOptions = !!(active && active.options && active.options.length);

      try {
        console.debug('[SCRIPT-EDITOR] Load click', {
          useSidebar: !!sidebar && sidebar.options.length > 0,
          activeId: active && active.id,
          activeOptions: active && active.options && active.options.length,
        });
      } catch {}

      if (!active || !hasOptions) {
        try { console.warn('[SCRIPT-EDITOR] Load click: no active select with options'); } catch {}
        return;
      }

      // Re-fire change on whichever select we decided is active
      active.dispatchEvent(
        new Event('change', { bubbles: true })
      );
    });
  }
}

// Make sure we install once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    installScriptEditorBridge();
  });
} else {
  installScriptEditorBridge();
}

export {};

