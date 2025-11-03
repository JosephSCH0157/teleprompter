// ui/normalize.js
// Runtime shim: delegate to TS logic when available (bundled via build) or provide a fallback.
(function () {
  // If the TS build provides a global, use it; else fallback to the legacy inline function.
  function legacyNormalizeSimpleTagTypos(text) {
    return String(text || '')
      .replace(/\[\s*(s1|s2|g1|g2)\s*\]/gi, '[$1]')
      .replace(/\[\s*\/(s1|s2|g1|g2)\s*\]/gi, '[/$1]');
  }

  try {
    if (window.normalizeSimpleTagTyposImpl && typeof window.normalizeSimpleTagTyposImpl === 'function') {
      window.normalizeSimpleTagTypos = window.normalizeSimpleTagTyposImpl;
    } else {
      window.normalizeSimpleTagTyposImpl = legacyNormalizeSimpleTagTypos;
      window.normalizeSimpleTagTypos = legacyNormalizeSimpleTagTypos;
    }
  } catch {}
})();
