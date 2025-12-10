// src/ui/script-editor.ts
// Sidebar now mirrors the ScriptStore directly (mapped entries) and triggers loads via the store.
import { debugLog } from '../env/logging';
import { ScriptStore } from '../features/scripts-store';

declare global {
  interface Window {
    __tpScriptEditorBound?: boolean;
  }
}

const SIDEBAR_ID = 'scriptSelectSidebar';

function getSidebarSelect(): HTMLSelectElement | null {
  return document.getElementById(SIDEBAR_ID) as HTMLSelectElement | null;
}

type MappedEntry = { id: string; title: string; handle?: FileSystemFileHandle };

// Store -> sidebar sync (single source of truth)
export function syncSidebarFromSettings(): void {
  const select = getSidebarSelect();
  if (!select) {
    debugLog('[SCRIPT-EDITOR] syncSidebarFromSettings: no sidebar select found');
    return;
  }

  const entries = ScriptStore.getMappedEntries ? ScriptStore.getMappedEntries() as MappedEntry[] : [];
  const count = entries.length;

  if (!count) {
    select.innerHTML = '';
    select.value = '';
    debugLog('[SCRIPT-EDITOR] syncSidebarFromSettings (no entries)', {
      settingsOptions: 0,
      sidebarOptions: select.options.length,
      value: select.value,
    });
    return;
  }

  const prev = select.value;
  // Simple rebuild via HTML to avoid any weird DOM issues
  const html = entries
    .map((entry) => `<option value="${entry.id}">${entry.title || entry.id}</option>`)
    .join('');
  select.innerHTML = html;
  if (!prev || !entries.some((e) => e.id === prev)) {
    select.value = select.options.length ? select.options[0].value : '';
  } else {
    select.value = prev;
  }
  select.setAttribute('aria-busy', 'false');

  debugLog('[SCRIPT-EDITOR] syncSidebarFromSettings (post-rebuild)', {
    settingsOptions: count,
    sidebarOptions: select.options.length,
    value: select.value,
  });
}

function wireSidebarStoreSync(): void {
  const run = () => syncSidebarFromSettings();
  try { window.addEventListener('tp:scripts-updated', run as any); } catch {}
  run();
}

function wireSidebarHandlers(): void {
  const select = getSidebarSelect();
  if (!select) return;
  select.addEventListener('change', () => {
    debugLog('[SCRIPT-EDITOR] sidebar change', { value: select.value });
    if (!select.value) {
      syncSidebarFromSettings();
      return;
    }
  });
}

function getActiveScriptId(): string | null {
  const select = getSidebarSelect();
  const sidebarVal = select?.value || '';
  const entries = ScriptStore.getMappedEntries ? ScriptStore.getMappedEntries() as MappedEntry[] : [];
  if (sidebarVal && entries.some((e) => e.id === sidebarVal)) return sidebarVal;
  if (entries.length > 0) return entries[0].id;
  return null;
}

async function handleLoadClick(): Promise<void> {
  const id = getActiveScriptId();
  debugLog('[SCRIPT-EDITOR] Load click', { id });
  if (!id) return;
  try {
    const rec = await ScriptStore.get(id);
    if (rec && typeof rec.content === 'string') {
      window.dispatchEvent(new CustomEvent('tp:script-load', { detail: { name: rec.title, text: rec.content } }));
    }
  } catch {}
}

function wireLoadButton(): void {
  document.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest('#scriptLoadBtn') as HTMLButtonElement | null;
    if (!btn) return;
    try { ev.preventDefault(); } catch {}
    void handleLoadClick();
  }, { capture: true });
}

function installScriptEditor(): void {
  if (typeof document === 'undefined') return;
  if ((window as any).__tpScriptEditorBound) {
    try { console.debug('[SCRIPT-EDITOR] already bound'); } catch {}
    return;
  }
  (window as any).__tpScriptEditorBound = true;

  wireSidebarStoreSync();
  wireSidebarHandlers();
  wireLoadButton();

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





