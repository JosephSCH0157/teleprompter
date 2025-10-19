// ui/upload.js
// Extracted upload handling from teleprompter_pro.js
// Exposes window._uploadFromFile(file) for legacy callers.
(async function () {
  async function ensureMammoth() {
    if (typeof window.mammoth !== 'undefined') return window.mammoth;
    // try to load via global vendor or CDN fallback (kept minimal here)
    try {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/mammoth/mammoth.browser.min.js';
      s.async = true;
      document.head.appendChild(s);
      await new Promise((res, rej) => { s.onload = res; s.onerror = rej; });
      return window.mammoth;
    } catch {
      return null;
    }
  }

  async function _uploadFromFileImpl(file) {
    const lower = (file.name || '').toLowerCase();
    const isDocx =
      lower.endsWith('.docx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    // Assume editor and renderScript are available globally as in the monolith
    if (isDocx) {
      try {
        const mammoth = await ensureMammoth();
        if (!mammoth) throw new Error('mammoth not available');
        const arrayBuffer = await file.arrayBuffer();
        const { value } = await mammoth.extractRawText({ arrayBuffer });
        const text = String(value || '')
          .replace(/\r\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        window.editor && (window.editor.value = text);
        let normalized = false;
        try {
          if (typeof window.normalizeToStandard === 'function') {
            window.normalizeToStandard();
            normalized = true;
          } else if (typeof window.fallbackNormalize === 'function') {
            window.fallbackNormalize();
            normalized = true;
          }
        } catch {}
        try { window.renderScript && window.renderScript(window.editor.value); } catch {}
        try { window.setStatus && window.setStatus(`Loaded "${file.name}" (.docx)${normalized ? ' and normalized' : ''}.`); } catch {}
      } catch (e) {
        try { window.err && window.err(e); } catch {}
        try { window.setStatus && window.setStatus('Failed to read .docx: ' + (e?.message || e)); } catch {}
      }
      return;
    }

    // default text handling
    try {
      const txt = await file.text();
      window.editor && (window.editor.value = txt);
      try { window.normalizeToStandard && window.normalizeToStandard(); } catch {}
      try { window.renderScript && window.renderScript(window.editor.value); } catch {}
      try { window.setStatus && window.setStatus(`Loaded "${file.name}"`); } catch {}
    } catch (e) {
      try { window.err && window.err(e); } catch {}
      try { window.setStatus && window.setStatus('Upload failed.'); } catch {}
    }
  }

  // Expose for legacy callers
  try {
    window._uploadFromFile = _uploadFromFileImpl;
  } catch (e) {
    // ignore
  }
})();
