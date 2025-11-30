// src/ui/script-editor.ts
// Sidebar <-> Settings bridge for scripts.
//
// - #scriptSelect  : the real mapped-folder select (Settings).
// - #scriptSelectSidebar : sidebar mirror (does NOT own data).
// - #scriptLoadBtn : Load button that re-fires change on active select.

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
  const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  function copyOptions(from: HTMLSelectElement, to: HTMLSelectElement) {
    if (!from || !to) return;
    while (to.firstChild) to.removeChild(to.firstChild);
    for (let i = 0; i < from.options.length; i++) {
      const src = from.options[i];
      const opt = document.createElement('option');
      opt.value = src.value;
      opt.textContent = src.textContent;
      opt.selected = src.selected;
      to.appendChild(opt);
    }
    try {
      console.debug('[SCRIPT-EDITOR] syncSidebarFromSettings', {
        settingsOptions: from.options.length,
        sidebarOptions: to.options.length,
        value: from.value,
      });
    } catch {}
  }

  function syncSidebarFromSettings() {
    if (!settings || !sidebar) return;
    copyOptions(settings, sidebar);
  }

  window.addEventListener('tp:folderScripts:populated' as any, () => {
    syncSidebarFromSettings();
  });

  if (settings && sidebar) {
    settings.addEventListener('change', () => {
      for (let i = 0; i < sidebar.options.length; i++) {
        sidebar.options[i].selected = (sidebar.options[i].value === settings.value);
      }
    });
  }

  if (sidebar && settings) {
    sidebar.addEventListener('change', () => {
      settings.value = sidebar.value;
      try {
        console.debug('[SCRIPT-EDITOR] forwardChange', {
          from: 'sidebar',
          value: settings.value,
          options: settings.options.length,
        });
      } catch {}
      settings.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      const active =
        sidebar && sidebar.options.length > 0
          ? sidebar
          : settings;

      try {
        console.debug('[SCRIPT-EDITOR] Load click', {
          activeId: active && active.id,
          options: active && active.options.length,
          value: active && active.value,
        });
      } catch {}

      if (!active || active.options.length === 0) return;
      active.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  syncSidebarFromSettings();

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

