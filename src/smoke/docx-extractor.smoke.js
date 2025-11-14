(async function () {
  try {
    if (!window.__tpIngest?.handle) {
      (window.HUD || console).log('docx:smoke', { ok: false, reason: '__tpIngest missing' });
      return;
    }
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const para = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `${para('Hello')} ${para('from')} ${para('smoke test')}` +
      `</w:document>`;
    zip.file('word/document.xml', xml);
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = new File([blob], 'smoke.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    const done = new Promise((resolve) => {
      const h = (e) => {
        try {
          const len = e?.detail?.length || 0;
          (window.HUD || console).log('docx:smoke', { ok: len > 0, length: len });
        } finally {
          window.removeEventListener('tp:script-loaded', h);
          resolve();
        }
      };
      window.addEventListener('tp:script-loaded', h);
    });
    await window.__tpIngest.handle(file);
    await done;
  } catch (e) {
    (window.HUD || console).log('docx:smoke', { ok: false, error: String(e) });
  }
})();
