// Typed script upload pipeline: supports .txt and .docx (via Mammoth) and updates editor + render.

export type ScriptRenderFn = (text: string) => void;

export interface UploadDeps {
  editor: HTMLTextAreaElement;
  renderScript?: ScriptRenderFn;
  normalize?: () => void | Promise<void>;
  setStatus?: (msg: string) => void;
}

async function ensureMammoth(): Promise<any | null> {
  if (typeof window === 'undefined') return null;
  const win = window as any;

  if (win.mammoth) return win.mammoth;

  try {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/mammoth/mammoth.browser.min.js';
    s.async = true;
    document.head.appendChild(s);

    await new Promise<void>((resolve, reject) => {
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('mammoth load failed'));
    });

    return win.mammoth || null;
  } catch {
    return null;
  }
}

async function readFileAsText(file: File): Promise<string> {
  const lower = (file.name || '').toLowerCase();
  const isDocx =
    lower.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (!isDocx) {
    return file.text();
  }

  const mammoth = await ensureMammoth();
  if (!mammoth) {
    throw new Error('mammoth not available');
  }

  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  const value = String(result?.value || '');

  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function uploadFromFile(file: File, deps: UploadDeps): Promise<void> {
  const { editor, renderScript, normalize, setStatus } = deps;

  try {
    const text = await readFileAsText(file);

    // Push into editor
    editor.value = text;

    // Normalize if available
    try {
      await normalize?.();
    } catch {
      // ignore
    }

    // Render into viewer/display
    try {
      renderScript?.(text);
    } catch {
      // ignore
    }

    try {
      setStatus?.(`Loaded "${file.name}"`);
    } catch {
      // ignore
    }
  } catch (err) {
    try {
      setStatus?.('Upload failed.');
    } catch {
      // ignore
    }
    try {
      console.error('[uploadFromFile] failed', err);
    } catch {
      // ignore
    }
  }
}

/**
 * Convenience helper to wire an <input type="file"> and optional button trigger.
 * Does not hard-code element IDs; caller passes real elements.
 */
export function wireUpload(
  fileInput: HTMLInputElement,
  deps: UploadDeps,
  trigger?: HTMLButtonElement | null,
): void {
  const handleFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    void uploadFromFile(files[0], deps);
  };

  fileInput.addEventListener('change', () => handleFiles(fileInput.files));

  if (trigger) {
    trigger.addEventListener('click', () => {
      try { fileInput.click(); } catch {}
    });
  }
}
