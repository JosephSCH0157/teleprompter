import { renderScript } from '../render-script';
// src/features/script-ingest.ts
// Wire mapped-folder file selection to teleprompter content.
// Reads File or FileSystemFileHandle; injects into target or emits events.

export type IngestOpts = {
  /** Where to inject the text (textarea or contenteditable). Optional if you handle tp:script-apply elsewhere. */
  target?: string | HTMLElement;
  /** If you already have a loader pipeline, use this instead of DOM injection. */
  onApply?: (_text: string, _name: string) => void;
};

function $(q: string): HTMLElement | null {
  try { return document.querySelector(q) as HTMLElement | null; } catch { return null; }
}
function pickTarget(sel?: string | HTMLElement): HTMLElement | null {
  if (!sel) {
    return (
      $('#scriptInput') ||
      $('#scriptText') ||
      $('#editor') ||
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
      const text = await docxToText(f);
      return {
        name,
        text: text || '[note]DOCX could not be parsed. Convert to .txt/.md or install a richer DOCX extractor.[/note]'
      };
    }
    return { name, text: '[note]Unsupported file type. Use .txt / .md / .docx[/note]' };
  } catch (e) {
    return { name, text: '[error] Failed to read file: ' + (e && (e as any).message || String(e)) + '[/error]' };
  }
}

// Lazy DOCX extractor (jszip). Keep light and resilient.
async function docxToText(file: File): Promise<string> {
  try {
    const mod: any = await import('jszip');
    const JSZip = mod?.default || mod;
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const part = zip.file('word/document.xml') || zip.file('/word/document.xml') || null;
    if (!part) throw new Error('document.xml missing');
    const xml = await part.async('string');
    const s1 = xml
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<w:br\b[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:p\b[^>]*>/g, '');
    const s2 = s1.replace(/<[^>]+>/g, '');
    return s2
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x0D;?/g, '\n')
      .replace(/&#13;?/g, '\n')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch (e) {
    try { (window as any).HUD?.log?.('docx:extract:fail', { msg: String(e) }); } catch {}
    return '';
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
        const d = e?.detail;
        // Support both { name, text } payloads and File/Handle payloads
        if (d && typeof d.text === 'string') {
          const name = typeof d.name === 'string' ? d.name : (function(){ try { return localStorage.getItem('tp_last_script_name') || 'Script.txt'; } catch { return 'Script.txt'; } })();
          const text = String(d.text);
          if (opts.onApply) opts.onApply(text, name);
          else if (tgt) applyToTarget(tgt, text);
          try { (window as any).HUD?.log?.('script:loaded', { name, chars: text.length }); } catch {}
          try { localStorage.setItem('tp_last_script_name', name); } catch {}
          try { window.dispatchEvent(new CustomEvent('tp:script-loaded', { detail: { name, length: text.length } })); } catch {}
          return;
        }
        const item = d?.file ?? d;
        if (!item) return;
        handle(item);
      } catch {}
    });
  } catch {}

  try { (window as any).__tpIngest = { handle }; } catch {}
}

// Idempotent global listener to mirror ingest into #editor for tests and DEV
try {
  const w: any = window as any;
  if (!w.__ingestWired) {
    document.addEventListener('tp:script-load', (ev: any) => {
      try {
        const d = ev?.detail || {};
        const ed = document.querySelector('#editor') as HTMLTextAreaElement | null;
        if (typeof d?.text === 'string') {
          const t = d.text as string; const name = d.name || 'Untitled';
          if (ed) ed.value = t;
          try { renderScript(t); } catch {}
          try { console.log('[INGEST] loaded', name || '(unnamed)'); } catch {}
          try { document.dispatchEvent(new CustomEvent('tp:script-loaded', { detail: { name, length: t.length } })); } catch {}
          return;
        }
        // Optional legacy: File or Handle under detail.fileOrHandle or detail.file
        (async () => {
          try {
            const fh = d?.fileOrHandle || d?.file || null;
            const file = fh && typeof fh.getFile === 'function' ? await fh.getFile() : fh;
            if (file && typeof file.text === 'function') {
              const t = await file.text();
              const name = file.name || 'Untitled';
              if (ed) ed.value = t;
              try { renderScript(t); } catch {}
              try { console.log('[INGEST] loaded (file)', name); } catch {}
              try { document.dispatchEvent(new CustomEvent('tp:script-loaded', { detail: { name, length: t.length } })); } catch {}
            }
          } catch (e) { try { console.warn('[INGEST] legacy path failed', e); } catch {} }
        })();
      } catch {}
    }, { once: false });
    w.__ingestWired = true;
  }
} catch {}
