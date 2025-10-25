// src/logic/normalize.ts
// Pure logic extracted from teleprompter_pro.js: normalizeSimpleTagTypos

/**
 * Normalize simple tag typos used by the teleprompter (pure function).
 * @param {string} text
 * @returns {string}
 */
export function normalizeSimpleTagTypos(text: string): string {
  return String(text || '')
    .replace(/\[\s*(s1|s2|g1|g2)\s*\]/gi, '[$1]')
    .replace(/\[\s*\/(s1|s2|g1|g2)\s*\]/gi, '[/$1]');
}

export default normalizeSimpleTagTypos;
