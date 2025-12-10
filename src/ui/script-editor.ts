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

function rebuildSidebarFromMapped(entries: MappedEntry[]): void {
  const select = getSidebarSelect();
  if (!select) {
    debugLog('[SCRIPT-EDITOR] rebuildSidebarFromMapped: sidebar select missing');
    return;
  }
  const prev = select.value;
  select.innerHTML = '';

  for (const entry of entries) {
    const opt = document.createElement('option') as HTMLOptionElement & { __handle?: FileSystemFileHandle };
    opt.value = entry.id;
    opt.textContent = entry.title;
    if (entry.handle) opt.__handle = entry.handle;
    select.appendChild(opt);
  }

  if (entries.length > 0) {
    const hasPrev = entries.some((e) => e.id === prev);
    select.value = hasPrev ? prev : entries[0].id;
  }
  select.setAttribute('aria-busy', 'false');

  debugLog('[SCRIPT-EDITOR] rebuildSidebarFromMapped', {
    options: select.options.length,
    value: select.value,
  });
}

function getMappedSnapshot(): MappedEntry[] {
  try { return ScriptStore.getMappedEntries?.() || []; } catch { return []; }
}

function wireSidebarStoreSync(): void {
  const run = () => rebuildSidebarFromMapped(getMappedSnapshot());
  try { window.addEventListener('tp:scripts-updated', run as any); } catch {}
  run();
}

function wireSidebarHandlers(): void {
  const select = getSidebarSelect();
  if (!select) return;
  select.addEventListener('change', () => {
    debugLog('[SCRIPT-EDITOR] sidebar change', { value: select.value });
    if (!select.value) {
      rebuildSidebarFromMapped(getMappedSnapshot());
      return;
    }
  });
}

function getActiveScriptId(): string | null {
  const select = getSidebarSelect();
  const entries = getMappedSnapshot();
  const sidebarVal = select?.value || '';
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





