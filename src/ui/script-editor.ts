// src/ui/script-editor.ts
// Bridge between the real "Saved scripts" select and the sidebar select.
//
// - Source: whichever <select> has aria-label="Saved scripts" and is NOT #scriptSelectSidebar.
// - Sidebar: #scriptSelectSidebar.
// - Load button: #scriptLoadBtn forwards a change onto the source select.

export function installScriptBridge() {
  try {
    const sidebar = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
    const loadBtn = document.getElementById('scriptLoadBtn') as HTMLButtonElement | null;

    const savedScriptSelects = Array.from(
      document.querySelectorAll('select[aria-label="Saved scripts"]')
    ) as HTMLSelectElement[];

    const source = savedScriptSelects.find((sel) => sel !== sidebar) || null;

    try {
      console.debug('[SCRIPT-EDITOR] bridge init', {
        sidebarId: sidebar?.id,
        sourceId: source?.id,
        savedScriptSelects: savedScriptSelects.map((s) => ({
          id: s.id,
          options: s.options.length,
        })),
      });
    } catch {}

    if (!sidebar || !source) {
      try {
        console.warn('[SCRIPT-EDITOR] bridge: missing sidebar or source select', {
          hasSidebar: !!sidebar,
          hasSource: !!source,
        });
      } catch {}
      return;
    }

    function syncSidebarFromSource() {
      try {
        const beforeValue = sidebar.value;
        sidebar.innerHTML = '';

        for (let i = 0; i < source.options.length; i++) {
          const opt = source.options[i];
          const clone = opt.cloneNode(true) as HTMLOptionElement;
          sidebar.appendChild(clone);
        }

        if (beforeValue && Array.from(sidebar.options).some((o) => o.value === beforeValue)) {
          sidebar.value = beforeValue;
        } else {
          sidebar.value = source.value;
        }

        console.debug('[SCRIPT-EDITOR] syncSidebarFromSource', {
          sourceId: source.id,
          sidebarId: sidebar.id,
          count: sidebar.options.length,
          value: sidebar.value,
        });
      } catch (err) {
        try {
          console.warn('[SCRIPT-EDITOR] syncSidebarFromSource failed', err);
        } catch {}
      }
    }

    source.addEventListener('change', () => {
      syncSidebarFromSource();
    });

    window.addEventListener('tp:folderScripts:populated' as any, () => {
      syncSidebarFromSource();
    });

    sidebar.addEventListener('change', () => {
      try {
        if (!sidebar.value) return;
        source.value = sidebar.value;
        console.debug('[SCRIPT-EDITOR] sidebar change → source change', {
          sourceId: source.id,
          sidebarId: sidebar.id,
          value: sidebar.value,
        });
        source.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) {
        try {
          console.warn('[SCRIPT-EDITOR] sidebar change handler failed', err);
        } catch {}
      }
    });

    if (loadBtn) {
      loadBtn.addEventListener('click', () => {
        try {
          const active = (sidebar.options.length > 0 ? sidebar : source) as HTMLSelectElement | null;

          if (!active || active.options.length === 0) {
            console.warn('[SCRIPT-EDITOR] Load click: no active select with options', {
              sidebarOptions: sidebar.options.length,
              sourceOptions: source.options.length,
            });
            return;
          }

          if (active === sidebar) {
            source.value = sidebar.value;
          }

          console.debug('[SCRIPT-EDITOR] Load click → change on source', {
            sourceId: source.id,
            value: source.value,
          });

          source.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (err) {
          try {
            console.warn('[SCRIPT-EDITOR] Load button handler failed', err);
          } catch {}
        }
      });
    }

    syncSidebarFromSource();
  } catch (err) {
    try {
      console.warn('[SCRIPT-EDITOR] bridge init failed', err);
    } catch {}
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installScriptBridge());
  } else {
    installScriptBridge();
  }
}
