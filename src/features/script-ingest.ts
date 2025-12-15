import { publishDisplayScript } from './display-sync';
import { applyScript } from './apply-script';
// src/features/script-ingest.ts
// Wire mapped-folder file selection to teleprompter content.
// Reads File or FileSystemFileHandle; injects into target or emits events.

export type IngestOpts = {
  /** Where to inject the text (textarea or contenteditable). Optional if you handle tp:script-apply elsewhere. */
  target?: string | HTMLElement;
  /** If you already have a loader pipeline, use this instead of DOM injection. */
  onApply?: (_text: string, _name: string) => void;
};

// Cross-window document broadcast channel (idempotent creation)
let __ingestListening = false;
let __docCh: BroadcastChannel | null = null;
let __isRemote = false; // broadcast loop guard
const __isDisplayCtx = (() => {
  try { return (window as any).__TP_FORCE_DISPLAY === true; } catch { return false; }
})();

try {
  __docCh = (window as any).__tpDocCh || ((window as any).__tpDocCh = (new (window as any).BroadcastChannel ? new BroadcastChannel('tp-doc') : null));
  if (__docCh) {
    try {
      __docCh.onmessage = (ev: MessageEvent) => {
        try {
          const m = ev.data;
          // Respond to display hydration request
          if (m?.type === 'hello' && m.client === 'display') {
            if (__isDisplayCtx) return; // display should not echo hello
            try {
              const snap = getCurrentScriptSnapshot();
              __docCh?.postMessage({ type: 'script', ...snap });
              publishDisplayScript(snap.text || '', { force: true, source: 'hydrate' });
            } catch {}
            return;
          }
          if (m?.type === 'script' && typeof m.text === 'string') {
            __isRemote = true;
            try {
              try { (window as any).__tpCurrentName = m.name; } catch {}
              applyScript(m.text, 'hydrate', { updateEditor: true });
            } finally {
              __isRemote = false;
            }
          }
        } catch {}
      };
    } catch {}
  }
} catch { __docCh = null; }

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
      return;
    }
    if ((target as HTMLElement).isContentEditable) {
      (target as HTMLElement).innerText = text;
      return;
    }
  } catch {}
}

export function installScriptIngest(opts: IngestOpts = {}) {
  const tgt = pickTarget(opts.target);

  async function handle(item: File | FileSystemFileHandle) {
    const { name, text } = await readAny(item);
    try {
      if (opts.onApply) {
        opts.onApply(text, name);
      } else {
        applyScript(text, 'ingest', { updateEditor: true });
        if (tgt) applyToTarget(tgt, text);
      }
      (window as any).HUD?.log?.('script:loaded', { name, chars: text.length });
      try { localStorage.setItem('tp_last_script_name', name); } catch {}
      window.dispatchEvent(new CustomEvent('tp:script-loaded', { detail: { name, length: text.length } }));
    } catch {}
  }

  try {
    window.addEventListener('tp:script-load', (e: any) => {
      try {
        const d = e?.detail;
        // Ignore already-normalized echoes to avoid ingest loops
        if (d && d.skipNormalize) {
          return;
        }
        // Support both { name, text } payloads and File/Handle payloads
        if (d && typeof d.text === 'string') {
          const name = typeof d.name === 'string' ? d.name : (function(){ try { return localStorage.getItem('tp_last_script_name') || 'Script.txt'; } catch { return 'Script.txt'; } })();
          const text = String(d.text);
          if (opts.onApply) {
            opts.onApply(text, name);
          } else {
            applyScript(text, 'ingest', { updateEditor: true });
            if (tgt) applyToTarget(tgt, text);
          }
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

// Install a single global listener that mirrors tp:script-load into editor + render + broadcast
export function installGlobalIngestListener() {
  if (__ingestListening) return;
  __ingestListening = true;

  const ed = document.querySelector('#editor') as HTMLTextAreaElement | null;

  // 1) Primary ingest listener
  window.addEventListener('tp:script-load' as any, async (ev: any) => {
    try {
      if ((window as any).__TP_LOADING_SCRIPT) return;
      const d = ev?.detail || {};
      let name = d?.name || 'Untitled';
      let text: string | null = null;

      if (typeof d?.text === 'string') {
        text = String(d.text);
      } else {
        // Legacy path: File or Handle
        const fh = d?.fileOrHandle || d?.file || null;
        const file = fh && typeof fh.getFile === 'function' ? await fh.getFile() : fh;
        if (file && typeof file.text === 'function') {
          text = await file.text();
          name = file.name || name;
        }
      }

      if (typeof text !== 'string') return;

      // Apply normalization if available so any entry path produces standard markup
      const skipNormalize = !!d?.skipNormalize;
      if (skipNormalize) return;
      try {
        const runner = (window as any).__tpRequestScriptNormalization;
        if (typeof runner === 'function') {
          await runner('event:tp:script-load');
        }
      } catch {}

      try { (window as any).__tpCurrentName = name; } catch {}

      try { applyScript(text, 'ingest', { updateEditor: true }); } catch {}

      // Broadcast to other windows only if local origin
      if (!__isRemote) {
        try { __docCh?.postMessage({ type: 'script', name, text }); } catch {}
      }

      // Signals for any legacy listeners
      try { document.dispatchEvent(new CustomEvent('tp:script-rendered', { detail: { name, length: text.length } })); } catch {}
      try { window.dispatchEvent(new CustomEvent('tp:script:rendered', { detail: { name, length: text.length } })); } catch {}
    } catch {}
  });

  // 2) Debounced echo from editor back into ingest
  try {
    if (ed && !(ed as any).__echoWired) {
      (ed as any).__echoWired = 1;
      let tmr: any;
      ed.addEventListener('input', () => {
        try {
          if ((window as any).__tpNormalizingScript) return;
          clearTimeout(tmr);
          const text = ed.value || '';
          tmr = setTimeout(() => {
            try {
              // Treat editor input as local changes (do not set __isRemote)
              window.dispatchEvent(new CustomEvent('tp:script-load', {
                detail: { name: ((window as any).__tpCurrentName || 'Untitled'), text, skipNormalize: true },
              }));
            } catch {}
          }, 160);
        } catch {}
      });
    }
  } catch {}
}

function getCurrentScriptSnapshot(): { name: string; text: string } {
  try {
    const name = (window as any).__tpCurrentName || 'Untitled';
    const ed = document.querySelector('#editor,[data-editor]') as HTMLTextAreaElement | null;
    const text = (ed && ed.value) || '';
    return { name, text };
  } catch { return { name: 'Untitled', text: '' }; }
}

// Back-compat: keep previous behavior for environments that relied on auto-wiring
(() => { try { installGlobalIngestListener(); } catch {} })();
