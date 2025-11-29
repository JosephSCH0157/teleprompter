// src/ui/script-editor.ts
// Sidebar + Load button wiring, piggybacking on the mapped-folder binder.
//
// Design:
// - #scriptSelect (Settings) is the *only* select bound to bindMappedFolderUI.
// - This file mirrors its options into #scriptSelectSidebar.
// - Changing the sidebar select updates #scriptSelect and fires "change" on it.
// - Clicking Load re-fires "change" on the active select (prefer sidebar if populated).

declare global {
  interface Window {
    __tpScriptEditorBound?: boolean;
  }
}

function installScriptEditor(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if ((window as any).__tpScriptEditorBound) {
    try {
      console.debug('[SCRIPT-EDITOR] already wired');
    } catch {}
    return;
  }
  (window as any).__tpScriptEditorBound = true;

  const sidebar = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const settings = document.getElementById('scriptSelect') as HTMLSelectElement | null;
  const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  function syncSidebarFromSettings() {
    if (!sidebar || !settings) return;

    sidebar.innerHTML = settings.innerHTML;
    sidebar.selectedIndex = settings.selectedIndex;

    try {
      console.debug('[SCRIPT-EDITOR] syncSidebarFromSettings', {
        settingsOptions: settings.options.length,
        sidebarOptions: sidebar.options.length,
        value: settings.value,
      });
    } catch {}
  }

  window.addEventListener('tp:folderScripts:populated' as any, () => {
    syncSidebarFromSettings();
  });

  if (settings) {
    settings.addEventListener('change', () => {
      syncSidebarFromSettings();
    });
  }

  if (sidebar && settings) {
    sidebar.addEventListener('change', () => {
      settings.value = sidebar.value;

      try {
        console.debug('[SCRIPT-EDITOR] sidebar change → settings change', {
          value: sidebar.value,
          options: sidebar.options.length,
        });
      } catch {}

      settings.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      const active =
        (sidebar && sidebar.options.length > 0 ? sidebar : null) ||
        (settings && settings.options.length > 0 ? settings : null);

      if (!active) {
        try {
          console.debug('[SCRIPT-EDITOR] Load click: no active select with options');
        } catch {}
        return;
      }

      try {
        console.debug('[SCRIPT-EDITOR] Load click: firing change on', {
          id: active.id,
          value: active.value,
          options: active.options.length,
        });
      } catch {}

      active.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  try {
    console.debug('[SCRIPT-EDITOR] wiring complete');
  } catch {}
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        installScriptEditor();
      },
      { once: true },
    );
  } else {
    installScriptEditor();
  }
}

export {};

