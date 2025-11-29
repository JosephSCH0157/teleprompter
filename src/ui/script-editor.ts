// src/ui/script-editor.ts
// Dumb bridge between Settings scripts select and sidebar + Load button.
// - Mapped-folder owns loading (via #scriptSelect change).
// - This file just mirrors options and forwards user actions.

declare global {
  interface Window {
    __tpScriptEditorBound?: boolean;
  }
}

(function installScriptEditor() {
  if ((window as any).__tpScriptEditorBound) return;
  (window as any).__tpScriptEditorBound = true;

  function getSidebarSelect(): HTMLSelectElement | null {
    return document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  }

  function getSettingsSelect(): HTMLSelectElement | null {
    return document.getElementById('scriptSelect') as HTMLSelectElement | null;
  }

  function logDebug(msg: string, payload?: any) {
    try {
      console.debug('[SCRIPT-EDITOR]', msg, payload || {});
    } catch {
      // ignore
    }
  }

  function syncSidebarFromSettings() {
    const settings = getSettingsSelect();
    const sidebar = getSidebarSelect();

    if (!settings || !sidebar) {
      logDebug('syncSidebarFromSettings skipped', {
        hasSettings: !!settings,
        hasSidebar: !!sidebar,
      });
      return;
    }

    sidebar.innerHTML = '';
    for (const opt of Array.from(settings.options)) {
      const clone = opt.cloneNode(true) as HTMLOptionElement;
      sidebar.appendChild(clone);
    }
    sidebar.selectedIndex = settings.selectedIndex;

    logDebug('syncSidebarFromSettings applied', {
      count: sidebar.options.length,
      selectedIndex: sidebar.selectedIndex,
    });
  }

  window.addEventListener('tp:folderScripts:populated' as any, () => {
    syncSidebarFromSettings();
  });

  document.addEventListener('change', (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;

    const sidebar = getSidebarSelect();
    const settings = getSettingsSelect();
    if (!sidebar || !settings) return;

    if (target === settings) {
      logDebug('settings change → syncSidebarFromSettings', {
        value: settings.value,
      });
      syncSidebarFromSettings();
    } else if (target === sidebar) {
      settings.value = sidebar.value;
      logDebug('sidebar change → forward to settings', {
        value: settings.value,
      });
      settings.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  function handleLoadClick() {
    const sidebar = getSidebarSelect();
    const settings = getSettingsSelect();

    const sidebarHasOptions =
      !!sidebar && sidebar.options && sidebar.options.length > 0 && !!sidebar.value;
    const settingsHasOptions =
      !!settings && settings.options && settings.options.length > 0 && !!settings.value;

    const active: HTMLSelectElement | null = sidebarHasOptions
      ? sidebar!
      : settingsHasOptions
      ? settings!
      : null;

    if (!active) {
      logDebug('Load click: no active select with options', {
        hasSidebar: !!sidebar,
        sidebarOptions: sidebar?.options.length || 0,
        hasSettings: !!settings,
        settingsOptions: settings?.options.length || 0,
      });
      return;
    }

    logDebug('Load click → refire change', {
      id: active.id,
      value: active.value,
    });

    active.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function wireLoadButton() {
    const btn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;
    if (!btn) {
      logDebug('no scriptLoadBtn found');
      return;
    }

    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      handleLoadClick();
    });

    logDebug('load button wired');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      wireLoadButton();
    }, { once: true });
  } else {
    wireLoadButton();
  }

  logDebug('installed');
})();

export {};

