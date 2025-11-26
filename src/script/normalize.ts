// @ts-nocheck
export {};

// src/script/normalize.ts
// Minimal, dependency-free normalizers used by tools-loader in dev/module boot.

/**
 * Strict normalizer: canonicalize markup to the standard used by the app.
 * Safe rules only: normalize quotes/newlines and collapse blank lines.
 */
export function normalizeToStandardText(input = '') {
  let text = String(input ?? '');

  // Normalize common Unicode punctuation to ASCII
  text = text
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');

  // Normalize line endings and trim stray BOM
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Collapse excessive blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  return text;
}

/**
 * Gentle fallback normalizer: basic whitespace and quote cleanup.
 */
export function fallbackNormalizeText(input = '') {
  let text = String(input ?? '');
  text = text
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  return text;
}
