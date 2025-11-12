// src/features/script-ingest.ts
// Wire mapped-folder file selection to teleprompter content.
// Reads File or FileSystemFileHandle; injects into target or emits events.

export type IngestOpts = {
  /** Where to inject the text (textarea or contenteditable). Optional if you handle tp:script-apply elsewhere. */
  target?: string | HTMLElement;
  /** If you already have a loader pipeline, use this instead of DOM injection. */
  onApply?: (text: string, name: string) => void;
};

function $(q: string): HTMLElement | null {
  try { return document.querySelector(q) as HTMLElement | null; } catch { return null; }
}
function pickTarget(sel?: string | HTMLElement): HTMLElement | null {
  if (!sel) {
    return (
      $('#scriptInput') ||
      $('#scriptText') ||
      $('[data-role="script-input"]') ||
      $('[data-script="input"]') ||
      ($('#teleprompterText') as HTMLElement | null) ||
      null
    );
  }
  return typeof sel === 'string' ? $(sel) : (sel as HTMLElement);
}

async function readAny(item: File | FileSystemFileHandle): Promise<{ name: string; text: string }> {
  try {
    if (item && typeof (item as any).getFile === 'function') {
      const f = await (item as FileSystemFileHandle).getFile();
      return readFile(f);
    }
  } catch {}
  return readFile(item as File);
}

async function readFile(f: File): Promise<{ name: string; text: string }> {
  const name = f?.name || 'script.txt';
  const lower = name.toLowerCase();
  try {
    if (/\.(txt|md)$/i.test(lower)) {
      const text = await f.text();
      return { name, text };
    }
    if (/\.docx$/i.test(lower)) {
      return { name, text: '[note]DOCX import needs a text extractor. Convert to .txt/.md or add an extractor.[/note]' };
    }
    return { name, text: '[note]Unsupported file type. Use .txt / .md / .docx[/note]' };
  } catch (e) {
    return { name, text: '[error] Failed to read file: ' + (e && (e as any).message || String(e)) + '[/error]' };
  }
}

function applyToTarget(target: HTMLElement, text: string) {
  try {
    if (target instanceof HTMLTextAreaElement || target.tagName === 'TEXTAREA') {
      (target as HTMLTextAreaElement).value = text;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if ((target as HTMLElement).isContentEditable) {
      (target as HTMLElement).innerText = text;
      return;
    }
  } catch {}
  // Fallback broadcast
  try { window.dispatchEvent(new CustomEvent('tp:script-apply', { detail: { text } })); } catch {}
}

export function installScriptIngest(opts: IngestOpts = {}) {
  const tgt = pickTarget(opts.target);

  async function handle(item: File | FileSystemFileHandle) {
    const { name, text } = await readAny(item);
    try {
      if (opts.onApply) opts.onApply(text, name);
      else if (tgt) applyToTarget(tgt, text);
      (window as any).HUD?.log?.('script:loaded', { name, chars: text.length });
      try { localStorage.setItem('tp_last_script_name', name); } catch {}
      window.dispatchEvent(new CustomEvent('tp:script-loaded', { detail: { name, length: text.length } }));
    } catch {}
  }

  try {
    window.addEventListener('tp:script-load', (e: any) => {
      try {
        const item = e?.detail?.file ?? e?.detail;
        if (!item) return;
        handle(item);
      } catch {}
    });
  } catch {}

  try { (window as any).__tpIngest = { handle }; } catch {}
}
