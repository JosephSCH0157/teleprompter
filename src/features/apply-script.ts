import { renderScript } from '../render-script';
import { publishDisplayScript } from './display-sync';
import { normalizeToStandardText } from '../script/normalize';
import { validateStandardTagsText } from '../script/validate';

type ApplySource = 'load' | 'editor' | 'ingest' | 'hydrate' | 'sample';

declare global {
  interface Window {
    __tpRawScript?: string;
    __TP_LOADING_SCRIPT?: boolean;
    __TP_APPLY_IN_FLIGHT?: boolean;
    __TP_LAST_APPLIED_HASH?: string;
  }
}

// tiny stable hash (fast + good enough for dedupe)
function hashText(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function getEditorEl(): HTMLTextAreaElement | null {
  return document.getElementById('editor') as HTMLTextAreaElement | null;
}

export function applyScript(rawIn: string, source: ApplySource, opts?: { updateEditor?: boolean }) {
  const raw = String(rawIn ?? '');

  // Re-entrancy: prevents apply triggering apply via events/observers
  if (window.__TP_APPLY_IN_FLIGHT) return;
  window.__TP_APPLY_IN_FLIGHT = true;

  const normalized = (() => {
    try {
      return normalizeToStandardText(raw);
    } catch {
      return raw;
    }
  })();

  const validation = validateStandardTagsText(normalized);
  if (!validation.ok) {
    try {
      const msg = validation.report || 'Script validation failed.';
      (window as any).toast?.(msg, { type: 'error' });
    } catch {}
    window.__TP_APPLY_IN_FLIGHT = false;
    return;
  }

  // Optional dedupe: if identical normalized text keeps coming in, don’t spam render/publish
  const h = hashText(normalized);
  if (window.__TP_LAST_APPLIED_HASH === h) {
    window.__TP_APPLY_IN_FLIGHT = false;
    return;
  }
  window.__TP_LAST_APPLIED_HASH = h;

  if ((window as any).__TP_DEV || (window as any).__TP_DEV1) {
    console.debug('[applyScript]', { source, len: normalized.length, hash: h.slice(0, 8) });
  }

  const prevLoading = !!window.__TP_LOADING_SCRIPT;
  window.__TP_LOADING_SCRIPT = true;

  try {
    // 1) Canonical SSOT
    window.__tpRawScript = normalized;

    // 2) Keep editor in sync (only when appropriate)
    const updateEditor = opts?.updateEditor ?? (source === 'load' || source === 'ingest' || source === 'hydrate');
    if (updateEditor) {
      const ed = getEditorEl();
      if (ed && ed.value !== normalized) ed.value = normalized;
    }

    // 3) Render main viewer (pure render)
    renderScript(normalized);

    // 4) Publish display (raw text only)
    publishDisplayScript(normalized, { source });

    // 5) Notify listeners once (optional; keep if you rely on it)
    window.dispatchEvent(new CustomEvent('tp:scriptChanged', { detail: { source, text: normalized } }));
  } finally {
    window.__TP_LOADING_SCRIPT = prevLoading;
    window.__TP_APPLY_IN_FLIGHT = false;
  }
}
