// src/script/normalize.js
// Minimal, dependency-free normalizers used by tools-loader in dev/module boot.

/**
 * Strict normalizer: canonicalize markup to the standard used by the app.
 * - Normalize newlines and spaces
 * - Normalize quotes
 * - Canonicalize speaker/note tags (case/spacing)
 * - Ensure speaker open/close are on their own lines
 * - Ensure notes are standalone blocks
 */
export function normalizeToStandardText(input = '') {
  let txt = String(input || '');
  // Newlines/whitespace/quotes
  txt = txt
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[’]/g, "'");

  // Canonicalize tags: [s1],[s2],[note] and closers
  txt = txt
    .replace(/\[\s*(s1|s2|note)\s*\]/gi, (_, x) => `[${x.toLowerCase()}]`)
    .replace(/\[\s*\/\s*(s1|s2|note)\s*\]/gi, (_, x) => `[/${x.toLowerCase()}]`);

  // Speaker tags standalone lines
  txt = txt
    .replace(/\[(s1|s2)\]\s*(?=\S)/gi, (_, r) => `[${r}]\n`)
    .replace(/([^\n])\s*\[\/(s1|s2)\](?=\s*$)/gim, (_, ch, r) => `${ch}\n[/${r}]`);

  // Notes as standalone blocks
  txt = txt.replace(/\n?(\[note\][\s\S]*?\[\/note\])\n?/gi, '\n$1\n');

  // Collapse extra blank lines and trim once
  txt = txt.replace(/\n{3,}/g, '\n\n').trim();
  if (!txt.endsWith('\n')) txt += '\n';
  return txt;
}

/**
 * Gentle fallback normalizer: basic whitespace and quote cleanup.
 */
export function fallbackNormalizeText(input = '') {
  let txt = String(input || '');
  txt = txt
    .replace(/\r\n?/g, '\n')
    .replace(/ +\n/g, '\n')
    .replace(/[’]/g, "'")
    .replace(/\[\s*\/(s1|s2|note)\s*\]/gi, (_, x) => `[/${x.toLowerCase()}]`);
  return txt;
}
