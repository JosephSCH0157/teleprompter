// src/ui/script-editor.ts
// Sidebar <-> Settings bridge for Saved Scripts + Load button.
// - Settings (#scriptSelect) is the single source of truth (fed by mapped-folder).
// - Sidebar (#scriptSelectSidebar) mirrors options + selection.
// - Sidebar changes push back into Settings and fire its `change`.
// - Load button just re-fires `change` on the active select.

function onReady(fn: () => void) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', () => fn(), { once: true });
  }
}

function syncSidebarFromSettings(settings: HTMLSelectElement, sidebar: HTMLSelectElement) {
  while (sidebar.firstChild) sidebar.removeChild(sidebar.firstChild);
  for (const opt of Array.from(settings.options)) {
    const clone = new Option(opt.text, opt.value);
    clone.disabled = opt.disabled;
    sidebar.add(clone);
  }
  sidebar.value = settings.value;
  try {
    console.debug('[SCRIPT-EDITOR] syncSidebarFromSettings', {
      settingsOptions: settings.options.length,
      sidebarOptions: sidebar.options.length,
      value: sidebar.value,
    });
  } catch {}
}

function installScriptEditorBridge() {
  if ((window as any).__tpScriptEditorBound) {
    try { console.debug('[SCRIPT-EDITOR] bridge already bound'); } catch {}
    return;
  }
  (window as any).__tpScriptEditorBound = true;

  const settings = document.getElementById('scriptSelect') as HTMLSelectElement | null;
  const sidebar = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  try {
    console.debug('[SCRIPT-EDITOR] bridge init', {
      hasSettings: !!settings,
      hasSidebar: !!sidebar,
      hasLoadBtn: !!loadBtn,
    });
  } catch {}

  if (!settings || !sidebar) {
    try { console.warn('[SCRIPT-EDITOR] missing selects; aborting bridge'); } catch {}
    return;
  }

  const observer = new MutationObserver(() => {
    syncSidebarFromSettings(settings, sidebar);
  });
  observer.observe(settings, { childList: true });

  syncSidebarFromSettings(settings, sidebar);

  settings.addEventListener('change', () => {
    syncSidebarFromSettings(settings, sidebar);
  });

  sidebar.addEventListener('change', () => {
    if (!sidebar.value) return;
    try { console.debug('[SCRIPT-EDITOR] sidebar change -> settings', { value: sidebar.value }); } catch {}
    settings.value = sidebar.value;
    settings.dispatchEvent(new Event('change', { bubbles: true }));
  });

  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      const active =
        (sidebar && sidebar.options.length > 0 && sidebar) ||
        (settings && settings.options.length > 0 && settings) ||
        null;

      if (!active) {
        try {
          console.warn('[SCRIPT-EDITOR] Load click: no active select with options', {
            hasSidebar: !!sidebar,
            sidebarOptions: sidebar?.options.length ?? 0,
            hasSettings: !!settings,
            settingsOptions: settings?.options.length ?? 0,
          });
        } catch {}
        return;
      }

      try {
        console.debug('[SCRIPT-EDITOR] Load click -> change', {
          activeId: active.id,
          value: active.value,
        });
      } catch {}

      active.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  try { console.debug('[SCRIPT-EDITOR] bridge wired'); } catch {}
}

onReady(installScriptEditorBridge);

export {};

