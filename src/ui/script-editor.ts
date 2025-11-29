// src/ui/script-editor.ts
// Super-minimal bridge:
// - Mapped-folder owns #scriptSelect (Settings) and loads scripts.
// - We *only* mirror Settings → Sidebar and forward user actions.

declare global {
  interface Window {
    __tpScriptEditorBound?: boolean;
  }
}

function installScriptEditorBridge() {
  if ((window as any).__tpScriptEditorBound) {
    try { console.log('[SCRIPT-EDITOR] already installed'); } catch {}
    return;
  }
  (window as any).__tpScriptEditorBound = true;

  const doc = window.document;
  const settings = doc.getElementById('scriptSelect') as HTMLSelectElement | null;
  const sidebar = doc.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
  const loadBtn = doc.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

  try {
    console.log('[SCRIPT-EDITOR] bridge install', {
      hasSettings: !!settings,
      hasSidebar: !!sidebar,
      hasLoadBtn: !!loadBtn,
    });
  } catch {}

  if (!settings) {
    // No settings select → nothing we can reasonably do.
    return;
  }

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
        console.log('[SCRIPT-EDITOR] syncSidebarFromSettings', {
          settingsValue: settings.value,
          settingsOptions: settings.options.length,
          sidebarOptions: sidebar.options.length,
        });
      } catch {}
    } catch (err) {
      try { console.warn('[SCRIPT-EDITOR] syncSidebarFromSettings failed', err); } catch {}
    }
  };

  // 1) Run once immediately
  syncSidebarFromSettings();

  // 2) Poll a few times to catch async folder mapping
  let attempts = 0;
  const pollId = window.setInterval(() => {
    attempts += 1;
    syncSidebarFromSettings();
    // Stop once sidebar has options or after ~5 seconds
    if ((sidebar && sidebar.options.length > 0) || attempts > 20) {
      window.clearInterval(pollId);
      try {
        console.log('[SCRIPT-EDITOR] poll stopped', {
          sidebarOptions: sidebar ? sidebar.options.length : 0,
          attempts,
        });
      } catch {}
    }
  }, 250);

  // 3) Any time Settings changes, keep sidebar in sync
  settings.addEventListener('change', () => {
    syncSidebarFromSettings();
  });

  // 4) When user changes sidebar, drive Settings (and mapped-folder handler)
  if (sidebar) {
    sidebar.addEventListener('change', () => {
      try {
        if (!sidebar.value) return;
        settings.value = sidebar.value;
        console.log('[SCRIPT-EDITOR] sidebar change → settings change', {
          value: sidebar.value,
        });
        settings.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) {
        try { console.warn('[SCRIPT-EDITOR] sidebar change handler failed', err); } catch {}
      }
    });
  }

  // 5) Load button: re-fire change on the active select (sidebar preferred)
  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      const active: HTMLSelectElement | null =
        sidebar && sidebar.options.length > 0 ? sidebar : settings;

      const hasOptions = !!(active && active.options && active.options.length);

      console.log('[SCRIPT-EDITOR] Load click', {
        activeId: active && active.id,
        activeOptions: active && active.options && active.options.length,
      });

      if (!active || !hasOptions) {
        console.warn('[SCRIPT-EDITOR] Load click: no active select with options');
        return;
      }

      active.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
}

// Ensure it runs when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    installScriptEditorBridge();
  });
} else {
  installScriptEditorBridge();
}

export {};
