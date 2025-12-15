// src/ui/script-editor.ts
// Sidebar now mirrors the ScriptStore directly (mapped entries) and triggers loads via the store.
import { debugLog } from '../env/logging';
import { ScriptStore } from '../features/scripts-store';
import { broadcastToDisplay } from '../features/script-ingest';

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
  try { window.addEventListener('tp:scripts-updated', run as any, { signal: sidebarAbort?.signal }); } catch {}
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
    const editorEl = document.getElementById('editor') as HTMLTextAreaElement | null;
    if (editorEl) {
      editorEl.value = raw;
    }
    try { (window as any).__tpRawScript = raw; } catch {}
    // Render locally so viewer + display snapshot are refreshed immediately
    try { (window as any).renderScript ? (window as any).renderScript(raw) : undefined; } catch {}
    if (editorEl) {
      try { editorEl.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
    }
    // Explicitly mirror to display for sidebar loads
    try { broadcastToDisplay(raw); } catch {}
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
