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

let isSyncingScriptsSelect = false;

function syncSidebarFromSettings(): void {
  const settings = getSettingsSelect();
  const sidebar = getSidebarSelect();
  if (!settings || !sidebar) return;

  if (isSyncingScriptsSelect) return;
  isSyncingScriptsSelect = true;
  try {
    // If sidebar lost its options, rebuild from settings to keep in lockstep
    if (sidebar.options.length !== settings.options.length) {
      sidebar.innerHTML = settings.innerHTML;
      // Rehydrate handle/file metadata if present
      const sOpts = Array.from(settings.options);
      const tOpts = Array.from(sidebar.options);
      for (let i = 0; i < sOpts.length; i += 1) {
        const src = sOpts[i] as any;
        const dst = tOpts[i] as any;
        if (!src || !dst) continue;
        if (src.__handle) dst.__handle = src.__handle;
        if (src.__file) dst.__file = src.__file;
      }
    }
    sidebar.disabled = settings.disabled;
    sidebar.value = settings.value;
    if (sidebar.selectedIndex !== settings.selectedIndex) {
      sidebar.selectedIndex = settings.selectedIndex;
    }
  } finally {
    isSyncingScriptsSelect = false;
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
  if (!settings || !sidebar) return;
  if (!sidebar.value) {
    // If the sidebar is empty/out-of-sync, resync from settings and bail
    syncSidebarFromSettings();
    return;
  }
  if (isSyncingScriptsSelect) return;
  if (sidebar.value === settings.value) return;
  isSyncingScriptsSelect = true;
  try {
    settings.value = sidebar.value;
    try {
      console.debug('[SCRIPT-EDITOR] sidebar -> settings', {
        sidebarValue: sidebar.value,
        settingsOptions: settings.options.length,
      });
    } catch {}
    settings.dispatchEvent(new Event('change', { bubbles: true }));
  } finally {
    isSyncingScriptsSelect = false;
  }
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





