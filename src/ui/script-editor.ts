// src/ui/script-editor.ts
// Goal: Keep this file stupid-simple.
//
// - Only #scriptSelect (Settings) is bound to mapped-folder.
// - Sidebar #scriptSelectSidebar is just a visual mirror.
// - Load button just re-fires a change on whichever select is active.
// - No ScriptStore, no tp:script-load handlers, no extra brains.

declare global {
  interface Window {
    __tpScriptEditorBound?: boolean;
  }
}

function installScriptEditor(): void {
  if (typeof document === 'undefined') return;
  if ((window as any).__tpScriptEditorBound) {
    try { console.debug('[SCRIPT-EDITOR] already bound'); } catch {}
    return;
  }
  (window as any).__tpScriptEditorBound = true;

  const sidebar = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const settings = document.getElementById('scriptSelect') as HTMLSelectElement | null;
  const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  try {
    console.debug('[SCRIPT-EDITOR] wiring', {
      hasSidebar: !!sidebar,
      hasSettings: !!settings,
      hasLoadBtn: !!loadBtn,
    });
  } catch {}

  if (!sidebar && !settings && !loadBtn) return;

  // --- helpers --------------------------------------------------------------

  function syncSidebarFromSettings(): void {
    if (!sidebar || !settings) return;
    // Clear sidebar
    while (sidebar.firstChild) sidebar.removeChild(sidebar.firstChild);

    // Clone options from Settings into sidebar
    const opts = Array.from(settings.options);
    for (const opt of opts) {
      const clone = opt.cloneNode(true) as HTMLOptionElement;
      sidebar.appendChild(clone);
    }

    // Mirror selected index
    sidebar.selectedIndex = settings.selectedIndex;

    try {
      console.debug('[SCRIPT-EDITOR] syncSidebarFromSettings', {
        settingsOptions: settings.options.length,
        sidebarOptions: sidebar.options.length,
        selectedIndex: settings.selectedIndex,
      });
    } catch {}
  }

  function getActiveSelect(): HTMLSelectElement | null {
    // Prefer sidebar if it exists and has options
    if (sidebar && sidebar.options.length > 0) return sidebar;
    if (settings && settings.options.length > 0) return settings;
    return null;
  }

  function forwardSidebarChange(): void {
    if (!sidebar || !settings) return;
    if (!sidebar.value) return;

    // Push sidebar’s chosen value into Settings and fire change
    settings.value = sidebar.value;
    try {
      console.debug('[SCRIPT-EDITOR] sidebar → settings', {
        sidebarValue: sidebar.value,
        settingsValue: settings.value,
      });
    } catch {}

    const ev = new Event('change', { bubbles: true });
    settings.dispatchEvent(ev);
  }

  function handleLoadClick(): void {
    const active = getActiveSelect();
    try {
      console.debug('[SCRIPT-EDITOR] Load click', {
        activeId: active?.id || null,
        activeValue: active?.value || null,
        sidebarOptions: sidebar?.options.length ?? 0,
        settingsOptions: settings?.options.length ?? 0,
      });
    } catch {}

    if (!active) return;

    const ev = new Event('change', { bubbles: true });
    active.dispatchEvent(ev);
  }

  // --- event wiring ---------------------------------------------------------

  // When mapped-folder populates scripts, Settings’ select gets options.
  // We mirror from Settings into sidebar on that signal and on Settings change.
  if (settings && sidebar) {
    // Initial sync (in case Settings is already populated)
    syncSidebarFromSettings();

    // Settings changed (either value or options)
    settings.addEventListener('change', () => {
      syncSidebarFromSettings();
    });

    // Folder-populated signal from mapped-folder-bind.ts
    window.addEventListener('tp:folderScripts:populated' as any, () => {
      syncSidebarFromSettings();
    });

    // Sidebar change: drive Settings + mapped-folder load
    sidebar.addEventListener('change', () => {
      forwardSidebarChange();
    });
  }

  // Load button: fire change on whichever select is active
  if (loadBtn) {
    loadBtn.addEventListener('click', (ev) => {
      try { ev.preventDefault(); } catch {}
      handleLoadClick();
    });
  }

  try { console.debug('[SCRIPT-EDITOR] wiring complete'); } catch {}
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installScriptEditor(), { once: true });
  } else {
    installScriptEditor();
  }
}

export {};
