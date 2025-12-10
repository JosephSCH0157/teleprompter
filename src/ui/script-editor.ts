// src/ui/script-editor.ts
// Sidebar mirror + Load forwarder.
// - #scriptSelect (Settings) is the sole mapped-folder target.
// - #scriptSelectSidebar mirrors its options/selection.
// - #scriptLoadBtn re-fires change on the active select.
// No ScriptStore/tp:script-load involvement here.
import { debugLog } from '../env/logging';

declare global {
  interface Window {
    __tpScriptEditorBound?: boolean;
  }
}

const SETTINGS_ID = 'scriptSelect';
const SIDEBAR_ID = 'scriptSelectSidebar';

function getSelect(id: string): HTMLSelectElement | null {
  return document.getElementById(id) as HTMLSelectElement | null;
}

function getSettingsSelect(): HTMLSelectElement | null { return getSelect(SETTINGS_ID); }
function getSidebarSelect(): HTMLSelectElement | null { return getSelect(SIDEBAR_ID); }

let isSyncingScriptsSelect = false;

function syncSidebarFromSettings(): void {
  const settings = getSettingsSelect();
  const sidebar = getSidebarSelect();
  if (!sidebar) {
    debugLog('[SCRIPT-EDITOR] sidebar select missing, cannot sync');
    return;
  }
  if (!settings || settings.options.length === 0) {
    debugLog('[SCRIPT-EDITOR] settings select empty, clearing sidebar');
    sidebar.innerHTML = '';
    sidebar.setAttribute('aria-busy', 'false');
    return;
  }

  if (isSyncingScriptsSelect) return;
  isSyncingScriptsSelect = true;
  try {
    const sOpts = Array.from(settings.options).map((o) => ({
      text: o.textContent || '',
      value: o.value,
      handle: (o as any).__handle,
      file: (o as any).__file,
    }));
    const sbOpts = Array.from(sidebar.options).map((o) => ({
      text: o.textContent || '',
      value: o.value,
    }));

    const needsRebuild =
      sOpts.length !== sbOpts.length ||
      sOpts.some((o, i) => !sbOpts[i] || o.value !== sbOpts[i].value || o.text !== sbOpts[i].text);

    if (needsRebuild) {
      debugLog('[SCRIPT-EDITOR] sidebar desynced from settings, rebuilding (S=%d, SB=%d)', sOpts.length, sbOpts.length);
      sidebar.innerHTML = '';
      for (const opt of sOpts) {
        const o = new Option(opt.text, opt.value);
        (o as any).__handle = opt.handle;
        (o as any).__file = opt.file;
        sidebar.appendChild(o);
      }
    }

    sidebar.disabled = settings.disabled;
    sidebar.value = settings.value;
    sidebar.selectedIndex = settings.selectedIndex;
    sidebar.setAttribute('aria-busy', 'false');
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
  if (isSyncingScriptsSelect) return;
  if (!sidebar.value) {
    debugLog('[SCRIPT-EDITOR] sidebar value empty on change, forcing resync from settings');
    syncSidebarFromSettings();
    return;
  }
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
    (settings && settings.options.length > 0 && settings.value) ? settings :
    (sidebar && sidebar.options.length > 0 && sidebar.value) ? sidebar :
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





