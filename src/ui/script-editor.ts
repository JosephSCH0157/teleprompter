// src/ui/script-editor.ts
// - Settings (#scriptSelect) is the only mapped-folder target.
// - Sidebar (#scriptSelectSidebar) mirrors Settings options + selection.
// - Load button re-fires change on whichever select is active.

declare global {
  interface Window {
    __tpScriptEditorBound?: boolean;
  }
}

function onReady(fn: () => void) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => fn(), { once: true });
  } else {
    fn();
  }
}

function installScriptEditorBridge() {
  if ((window as any).__tpScriptEditorBound) {
    try {
      console.debug('[SCRIPT-EDITOR] bridge already installed');
    } catch {}
    return;
  }
  (window as any).__tpScriptEditorBound = true;

  const sidebar = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const settings = document.getElementById('scriptSelect') as HTMLSelectElement | null;
  const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  try {
    console.debug('[SCRIPT-EDITOR] bridge init', {
      hasSidebar: !!sidebar,
      hasSettings: !!settings,
      hasLoadBtn: !!loadBtn,
    });
  } catch {}

  // Copy all options from Settings into Sidebar and keep the same selection
  const syncSidebarFromSettings = () => {
    if (!sidebar || !settings) return;
    sidebar.innerHTML = '';

    for (let i = 0; i < settings.options.length; i++) {
      const src = settings.options[i];
      const clone = src.cloneNode(true) as HTMLOptionElement;
      sidebar.appendChild(clone);
    }

    sidebar.value = settings.value;

    try {
      console.debug('[SCRIPT-EDITOR] syncSidebarFromSettings', {
        settingsOptions: settings.options.length,
        sidebarOptions: sidebar.options.length,
        value: sidebar.value,
      });
    } catch {}
  };

  // Run a few times around boot so we don't depend on exact event timing
  syncSidebarFromSettings();
  setTimeout(syncSidebarFromSettings, 0);
  setTimeout(syncSidebarFromSettings, 500);

  // Whenever mapped-folder changes the Settings select, resync sidebar
  window.addEventListener('tp:folderScripts:refresh' as any, syncSidebarFromSettings);
  window.addEventListener('tp:folderScripts:populated' as any, syncSidebarFromSettings);

  if (settings) {
    settings.addEventListener('change', () => {
      syncSidebarFromSettings();
    });
  }

  // When you change the sidebar, push the value back into Settings and let
  // mapped-folder's change handler do the actual loading.
  if (sidebar && settings) {
    sidebar.addEventListener('change', () => {
      settings.value = sidebar.value;
      try {
        console.debug('[SCRIPT-EDITOR] sidebar → settings change', {
          value: sidebar.value,
        });
      } catch {}
      settings.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  // Load button just re-fires change on whichever select currently has options
  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      const active =
        (sidebar && sidebar.options.length > 0 && sidebar.value) ? sidebar :
        (settings && settings.options.length > 0 && settings.value) ? settings :
        null;

      try {
        console.debug('[SCRIPT-EDITOR] Load click', {
          hasSidebar: !!sidebar,
          sidebarOptions: sidebar?.options.length ?? 0,
          sidebarValue: sidebar?.value ?? '',
          hasSettings: !!settings,
          settingsOptions: settings?.options.length ?? 0,
          settingsValue: settings?.value ?? '',
        });
      } catch {}

      if (!active) {
        try {
          console.warn('[SCRIPT-EDITOR] Load click: no active select with options');
        } catch {}
        return;
      }

      active.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
}

onReady(installScriptEditorBridge);

export {};
