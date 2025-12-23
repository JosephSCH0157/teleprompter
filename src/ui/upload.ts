// src/ui/upload.ts
//
// Typed script upload helper.
// - Wires the upload button and file input
// - Reads text content and pushes it into the store/editor
// - Exposes window.initScriptUpload for legacy hooks

import { getAppStore } from '../state/appStore';
import { showToast } from './toasts';

const FILE_INPUT_SELECTOR = '[data-tp-script-upload-input]';
const BUTTON_SELECTOR = '[data-tp-script-upload-btn]';

async function readTextFile(file: File): Promise<string> {
  // Plain text for now; can extend to DOCX via Mammoth later.
  return file.text();
}

function pushScriptText(text: string): void {
  const store = getAppStore();
  try {
    if (store && typeof store.set === 'function') {
      store.set('scriptText', text);
    }
  } catch {
    // ignore store failures; fall back to DOM
  }

  try {
    const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
    if (editor) {
      editor.value = text;
      try {
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

export function initScriptUpload(): void {
  const input = document.querySelector<HTMLInputElement>(FILE_INPUT_SELECTOR);
  const btn = document.querySelector<HTMLButtonElement>(BUTTON_SELECTOR);

  if (!input && !btn) return;

  if (btn && input && !btn.dataset.tpUploadWired) {
    btn.dataset.tpUploadWired = '1';
    btn.addEventListener('click', (e) => {
      try { e.preventDefault(); } catch {}
      input.click();
    });
  }

  if (input && !input.dataset.tpUploadWired) {
    input.dataset.tpUploadWired = '1';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;

      try {
        const text = await readTextFile(file);
        if (!text || !text.trim()) {
          showToast?.('File contained no readable text.', { type: 'warning' });
          return;
        }
        pushScriptText(text);
        showToast?.(`Loaded script: ${file.name}`, { type: 'success' });
      } catch (err) {
        try { console.error('[upload] failed to load script', err); } catch {}
        showToast?.('Could not load script.', { type: 'error' });
      } finally {
        try { input.value = ''; } catch {}
      }
    });
  }
}

// Auto-init
(function autoInit() {
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        try { initScriptUpload(); } catch (e) { try { console.error('[upload] init failed', e); } catch {} }
      });
    } else {
      try { initScriptUpload(); } catch (e) { try { console.error('[upload] init failed', e); } catch {} }
    }
  } catch {
    // ignore
  }
})();

// Optional global for legacy
declare global {
  interface Window {
    initScriptUpload?: () => void;
  }
}

if (typeof window !== 'undefined' && !window.initScriptUpload) {
  window.initScriptUpload = initScriptUpload;
}
