// src/logic/ngrams.ts
// Pure helper: getNgrams(tokens, n)

/**
 * Return array of n-gram strings for an array of tokens.
 * @param {string[]} tokens
 * @param {number} n
 * @returns {string[]}
 */
export function getNgrams(tokens: string[], n: number): string[] {
  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

export default getNgrams;
