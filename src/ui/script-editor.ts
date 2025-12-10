// src/ui/script-editor.ts
// Sidebar mirror + Load forwarder.
// - #scriptSelect (Settings) is the sole mapped-folder target.
// - #scriptSelectSidebar mirrors its options/selection.
// - #scriptLoadBtn re-fires change on the active select.
// No ScriptStore/tp:script-load involvement here.

declare global {
  interface Window {
    __tpScriptEditorBound?: boolean;
  }
}

function getSettingsSelect(): HTMLSelectElement | null {
  return document.getElementById('scriptSelect') as HTMLSelectElement | null;
}

function getSidebarSelect(): HTMLSelectElement | null {
  return document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
}

let syncing = false;

function syncSidebarFromSettings(): void {
  const settings = getSettingsSelect();
  const sidebar = getSidebarSelect();
  if (!settings || !sidebar) return;

  if (syncing) return;
  syncing = true;
  try {
    // Only mirror selection/value; options are managed by mapped-folder binding
    sidebar.value = settings.value;
    if (sidebar.selectedIndex !== settings.selectedIndex) {
      sidebar.selectedIndex = settings.selectedIndex;
    }
  } finally {
    syncing = false;
  }
  try {
    console.debug('[SCRIPT-EDITOR] syncSidebarFromSettings', {
      settingsOptions: settings.options.length,
      sidebarOptions: sidebar.options.length,
      value: sidebar.value,
    });
  } catch {}
}

function forwardSidebarChange(): void {
  const settings = getSettingsSelect();
  const sidebar = getSidebarSelect();
  if (!settings || !sidebar || !sidebar.value) return;
  if (syncing) return;
  syncing = true;
  settings.value = sidebar.value;
  try {
    console.debug('[SCRIPT-EDITOR] sidebar → settings', {
      sidebarValue: sidebar.value,
      settingsOptions: settings.options.length,
    });
  } catch {}
  settings.dispatchEvent(new Event('change', { bubbles: true }));
  syncing = false;
}

function handleLoadClick(): void {
  const sidebar = getSidebarSelect();
  const settings = getSettingsSelect();
  const active =
    (sidebar && sidebar.options.length > 0) ? sidebar :
    (settings && settings.options.length > 0) ? settings :
    null;
  try {
    console.debug('[SCRIPT-EDITOR] Load click', {
      activeId: active?.id || null,
      activeValue: active?.value || null,
      sidebarOptions: sidebar?.options.length ?? 0,
      settingsOptions: settings?.options.length ?? 0,
    });
  } catch {}
  if (!active) return;
  active.dispatchEvent(new Event('change', { bubbles: true }));
}

function installScriptEditor(): void {
  if (typeof document === 'undefined') return;
  if ((window as any).__tpScriptEditorBound) {
    try { console.debug('[SCRIPT-EDITOR] already bound'); } catch {}
    return;
  }
  (window as any).__tpScriptEditorBound = true;

  // Initial sync (in case Settings already populated)
  syncSidebarFromSettings();

  // React to mapped-folder population signal
  window.addEventListener('tp:folderScripts:populated' as any, syncSidebarFromSettings);

  // Observe Settings select option mutations (handles reinjection/rebuilds)
  try {
    const settings = getSettingsSelect();
    if (settings) {
      const obs = new MutationObserver(() => syncSidebarFromSettings());
      obs.observe(settings, { childList: true });
    }
  } catch {}

  // Document-level change handlers so we don't care if selects are replaced
  document.addEventListener('change', (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t) return;
    if (t.id === 'scriptSelect') {
      syncSidebarFromSettings();
    } else if (t.id === 'scriptSelectSidebar') {
      forwardSidebarChange();
    }
  });

  // Load button via delegation (handles late reinjection)
  document.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest('#scriptLoadBtn') as HTMLButtonElement | null;
    if (!btn) return;
    try { ev.preventDefault(); } catch {}
    handleLoadClick();
  }, { capture: true });

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
