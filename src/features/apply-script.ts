import { renderScript } from '../render-script';
import { publishDisplayScript } from './display-sync';

type ApplySource = 'load' | 'editor' | 'ingest' | 'hydrate';

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

  // Optional dedupe: if identical text keeps coming in, don’t spam render/publish
  const h = hashText(raw);
  if (window.__TP_LAST_APPLIED_HASH === h) {
    window.__TP_APPLY_IN_FLIGHT = false;
    return;
  }
  window.__TP_LAST_APPLIED_HASH = h;

  const prevLoading = !!window.__TP_LOADING_SCRIPT;
  window.__TP_LOADING_SCRIPT = true;

  try {
    // 1) Canonical SSOT
    window.__tpRawScript = raw;

    // 2) Keep editor in sync (only when appropriate)
    const updateEditor = opts?.updateEditor ?? (source === 'load' || source === 'ingest' || source === 'hydrate');
    if (updateEditor) {
      const ed = getEditorEl();
      if (ed && ed.value !== raw) ed.value = raw;
    }

    // 3) Render main viewer (pure render)
    renderScript(raw);

    // 4) Publish display (raw text only)
    publishDisplayScript(raw, { source });

    // 5) Notify listeners once (optional; keep if you rely on it)
    window.dispatchEvent(new CustomEvent('tp:scriptChanged', { detail: { source, text: raw } }));
  } finally {
    window.__TP_LOADING_SCRIPT = prevLoading;
    window.__TP_APPLY_IN_FLIGHT = false;
  }
}
