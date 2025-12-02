// @ts-nocheck
export {};

// src/script/normalize.ts
// Minimal, dependency-free normalizers used by tools-loader in dev/module boot.

/**
 * Strict normalizer: canonicalize markup to the standard used by the app.
 * Safe rules only: normalize quotes/newlines, canonicalize core tags,
 * and collapse blank lines. No aggressive reflow or block rewriting.
 */
export function normalizeToStandardText(input = '') {
  let text = String(input ?? '');

  // Normalize common Unicode punctuation to ASCII
  text = text
    .replace(/[\u2018\u2019\u201B]/g, "'")  // curly single quotes → '
    .replace(/[\u201C\u201D]/g, '"')       // curly double quotes → "
    .replace(/\u00A0/g, ' ');              // non-breaking space → regular space

  // Canonicalize speaker/note tags: lowercase + trim spaces inside brackets
  text = text
    .replace(/\[\s*(s1|s2|note)\s*\]/gi, (_, tag) => `[${String(tag).toLowerCase()}]`)
    .replace(/\[\s*\/\s*(s1|s2|note)\s*\]/gi, (_, tag) => `[/${String(tag).toLowerCase()}]`);

  // Normalize line endings and trim stray BOM
  text = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Trim trailing whitespace on each line
  text = text.replace(/[ \t]+$/gm, '');

  // Collapse excessive blank lines (3+ → 2)
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
