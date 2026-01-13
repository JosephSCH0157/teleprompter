// src/ui/script-editor.ts
// Sidebar now mirrors the ScriptStore directly (mapped entries) and triggers loads via the store.
import { debugLog } from '../env/logging';
import { ScriptStore } from '../features/scripts-store';
import { applyScript } from '../features/apply-script';

declare global {
  interface Window {
    __tpScriptEditorBound?: boolean;
  }
}

const SIDEBAR_ID = 'scriptSelectSidebar';
let loadInFlight = false;
let lastLoadTs = 0;
let sidebarAbort: AbortController | null = null;

function getSidebarSelect(): HTMLSelectElement | null {
  return document.getElementById(SIDEBAR_ID) as HTMLSelectElement | null;
}

type MappedEntry = { id: string; title: string; handle?: FileSystemFileHandle };

type SelectRole = 'sidebar' | 'settings';
const SETTINGS_SELECT_ID = 'scriptSelect';

function gatherScriptEntries(): MappedEntry[] {
  const entries = ScriptStore.getMappedEntries ? ScriptStore.getMappedEntries() as MappedEntry[] : [];
  return entries.map((entry) => ({ id: entry.id, title: entry.title || entry.id }));
}

function syncSelectFromStore(select: HTMLSelectElement | null, role: SelectRole, entries: MappedEntry[]): void {
  if (!select) {
    debugLog('[SCRIPT-EDITOR] syncSelectFromStore: missing select', { role });
    return;
  }
  const previous = select.value;
  select.innerHTML = '';
  if (!entries.length) {
    const placeholderText =
      role === 'sidebar'
        ? 'Map script folder...'
        : 'No existing scripts yet - map folder and save new ones here';
    const placeholder = new Option(placeholderText, role === 'sidebar' ? '__OPEN_SETTINGS__' : '', true, true);
    if (role === 'sidebar') {
      (placeholder as any).dataset.settingsLink = '1';
      select.disabled = false;
    } else {
      select.disabled = true;
    }
    select.append(placeholder);
    select.value = placeholder.value;
  } else {
    select.disabled = false;
    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.title || entry.id;
      fragment.appendChild(option);
    }
    select.append(fragment);
    if (previous && entries.some((entry) => entry.id === previous)) {
      select.value = previous;
    } else {
      select.value = entries[0].id;
    }
  }
  try { select.setAttribute('aria-busy', 'false'); } catch {}
  debugLog('[SCRIPT-EDITOR] syncSelectFromStore', {
    role,
    entries: entries.length,
    value: select.value,
  });
}

function syncScriptSelectsFromStore(): void {
  const entries = gatherScriptEntries();
  syncSelectFromStore(getSidebarSelect(), 'sidebar', entries);
  const settingsSelect = document.getElementById(SETTINGS_SELECT_ID) as HTMLSelectElement | null;
  syncSelectFromStore(settingsSelect, 'settings', entries);
}

function wireSidebarStoreSync(): void {
  const run = () => syncScriptSelectsFromStore();
  try { window.addEventListener('tp:scripts-updated', run as any, { signal: sidebarAbort?.signal }); } catch {}
  run();
}

function wireSidebarHandlers(): void {
  const select = getSidebarSelect();
  if (!select) return;
  select.addEventListener('change', () => {
    debugLog('[SCRIPT-EDITOR] sidebar change', { value: select.value });
    if (!select.value) {
      syncScriptSelectsFromStore();
      return;
    }
  }, { signal: sidebarAbort?.signal });
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
  const now = Date.now();
  if (now - lastLoadTs < 150) return; // debounce accidental multi-fire
  lastLoadTs = now;
  if (loadInFlight) return;
  loadInFlight = true;
  const w = window as any;
  const id = getActiveScriptId();
  debugLog('[SCRIPT-EDITOR] Load click', { id });
  if (!id) {
    loadInFlight = false;
    return;
  }
  const resetFlag = () => { try { w.__TP_LOADING_SCRIPT = false; } catch {} };
  try { w.__TP_LOADING_SCRIPT = true; } catch {}
  try {
    const rec = await ScriptStore.get(id);
    if (!rec || typeof rec.content !== 'string') return;
    const raw = rec.content ?? '';
    applyScript(raw, 'load', { updateEditor: true });
    // Still emit tp:script-load for any listeners that rely on the event path
    try { window.dispatchEvent(new CustomEvent('tp:script-load', { detail: { name: rec.title, text: raw } })); } catch {}
  } catch {}
  finally {
    loadInFlight = false;
    resetFlag();
  }
}

function onLoadButtonClick(ev: Event): void {
  const btn = (ev.target as HTMLElement | null)?.closest('#scriptLoadBtn') as HTMLButtonElement | null;
  if (!btn) return;
  const n = Number(btn.dataset.tpBoundLoad ?? '0') + 1;
  btn.dataset.tpBoundLoad = String(n); // stamp for debug visibility (dev-only)
  try { ev.preventDefault(); } catch {}
  void handleLoadClick();
}

function wireLoadButton(): void {
  document.addEventListener('click', onLoadButtonClick, { capture: true, signal: sidebarAbort?.signal });
}

function installScriptEditor(): void {
  if (typeof document === 'undefined') return;
  const g = window as any;
  g.__tpInit = g.__tpInit || {};
  if (g.__tpInit.scriptSidebarWired) {
    try { console.debug('[SCRIPT-EDITOR] already bound'); } catch {}
    return;
  }
  g.__tpInit.scriptSidebarWired = true;

  // Abort any lingering listeners from previous inits, then create a fresh scope
  try { sidebarAbort?.abort(); } catch {}
  sidebarAbort = new AbortController();

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
