import { applyScript } from './apply-script';
import { ScriptStore } from './scripts-store';

const LAST_SCRIPT_KEY = 'tp:last_script_id';
let restoreAttempted = false;

export function persistLastScriptId(id: string): void {
  if (!id) return;
  try {
    localStorage.setItem(LAST_SCRIPT_KEY, id);
  } catch {
    // ignore storage failures
  }
}

export function getLastScriptId(): string | null {
  try {
    return localStorage.getItem(LAST_SCRIPT_KEY);
  } catch {
    return null;
  }
}

export function consumeLastScriptId(entries: Array<{ id: string }>): string | null {
  if (restoreAttempted) return null;
  restoreAttempted = true;
  const last = getLastScriptId();
  if (!last) return null;
  if (!entries.some((entry) => entry.id === last)) return null;
  return last;
}

export async function loadScriptById(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const rec = await ScriptStore.get(id);
    if (!rec || typeof rec.content !== 'string') return false;
    const text = rec.content;
    applyScript(text, 'load', { updateEditor: true });
    try {
      window.dispatchEvent(
        new CustomEvent('tp:script-load', {
          detail: { name: rec.title, text, skipNormalize: true },
        })
      );
    } catch {
      // ignore dispatch failures
    }
    try {
      (window as any).__tpCurrentName = rec.title;
    } catch {
      // ignore
    }
    persistLastScriptId(id);
    return true;
  } catch (err) {
    try {
      console.warn('[script-selection] loadScriptById failed', err);
    } catch {
      // ignore
    }
    return false;
  }
}

export function resetScriptRestoreState(): void {
  restoreAttempted = false;
}
