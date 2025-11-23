// @ts-nocheck
export {};

import { fallbackNormalizeText, normalizeToStandardText } from './normalize';
import { validateStandardTagsText } from './validate';

try {
  window.normalizeToStandardText = normalizeToStandardText;
  window.fallbackNormalizeText = fallbackNormalizeText;
  window.validateStandardTagsText = validateStandardTagsText;
  // Attach callable shims for backward-compatible window functions
  window.normalizeToStandard = function () {
    try {
      const ta = document.getElementById('editor');
      if (!ta) return;
      const out = normalizeToStandardText(ta.value || '');
      ta.value = out;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      try { if (typeof window.saveDraft === 'function') window.saveDraft(); } catch {}
      try { if (typeof window.setStatus === 'function') window.setStatus('Normalized to standard.'); } catch {}
    } catch {}
  };
  window.fallbackNormalize = function () {
    try {
      const ta = document.getElementById('editor');
      if (!ta) return;
      ta.value = fallbackNormalizeText(ta.value || '');
      ta.dispatchEvent(new Event('input'));
      alert('Basic normalization applied.');
    } catch (e) { alert('Normalize fallback failed: ' + (e && e.message)); }
  };
  window.validateStandardTags = function (silent = false) {
    try {
      const ta = document.getElementById('editor');
      const src = String(ta?.value || '');
      const out = validateStandardTagsText(src);
      if (!silent) {
        if (typeof window.showValidation === 'function') window.showValidation(out.report);
        else alert(out.report);
      }
      return out.report;
    } catch (e) {
      if (!silent) alert('Validation error: ' + (e && e.message));
      return 'Validation error';
    }
  };
} catch {}
