import { applyScript } from './apply-script';
import { ScriptStore } from './scripts-store';

const LAST_SCRIPT_KEY = 'tp:last_script_id';
let restoreAttempted = false;
let restoreDeadlineAt = 0;

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

const now = () =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();

export function consumeLastScriptId(entries: Array<{ id: string }>): string | null {
  if (restoreAttempted) return null;
  const curr = now();
  if (!restoreDeadlineAt) {
    restoreDeadlineAt = curr + 5000;
  }
  if (curr > restoreDeadlineAt) {
    restoreAttempted = true;
    return null;
  }
  const last = getLastScriptId();
  if (!last) return null;
  const found = entries?.some((entry) => entry.id === last);
  if (!found) {
    try {
      console.info('[script-selection] restore defer (not in entries yet)', {
        last,
        entries: entries?.length ?? 0,
      });
    } catch {}
    return null;
  }
  restoreAttempted = true;
  try {
    console.info('[script-selection] restore hit', { last, entries: entries.length });
  } catch {}
  return last;
}

export function restoreStillPossible(): boolean {
  if (restoreAttempted) return false;
  if (!restoreDeadlineAt) return true;
  return now() <= restoreDeadlineAt;
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
