// src/logic/normTokens.ts
// Pure token normalization extracted from monolith.

/**
 * Tokenize and normalize text for matching.
 * Mirrors legacy behavior (lowercase, remove punctuation, expand some contractions, split hyphens, numbers->words for 0..99)
 */
export function normTokens(text: string): string[] {
  let t = String(text)
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/\b(won't)\b/g, 'will not')
    .replace(/\b(can|do|does|is|are|was|were|has|have|had|would|should|could|did)n['’]t\b/g, '$1 not')
    .replace(/\b(\w+)'re\b/g, '$1 are')
    .replace(/\b(\w+)'ll\b/g, '$1 will')
    .replace(/\b(\w+)'ve\b/g, '$1 have')
    .replace(/\b(\w+)'d\b/g, '$1 would')
    .replace(/\b(\w+)'m\b/g, '$1 am')
    .replace(/\bit's\b/g, 'it is')
    .replace(/\bthat's\b/g, 'that is');

  t = t.replace(/(\d+)\s*[\u2010-\u2015-]\s*(\d+)/g, '$1 $2');
  t = t.replace(/%/g, ' percent');
  t = t.replace(/([a-z])[\u2010-\u2015-]([a-z])/gi, '$1 $2');

  try {
    t = t.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  } catch {
    t = t.replace(/[.,!?;:()"\[\]`]/g, ' ');
  }
  t = t.replace(/[\u2010-\u2015]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  const raw = t.split(/\s+/).filter(Boolean);

  const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const teens = ['ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const tens = ['','', 'twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  const numToWords = (n: number) => {
    if (!Number.isFinite(n) || n < 0 || n > 99) return null;
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    const t = Math.floor(n / 10), o = n % 10;
    return o ? `${tens[t]} ${ones[o]}` : tens[t];
  };

  const out: string[] = [];
  for (const w of raw) {
    if (/^\d{1,2}$/.test(w)) {
      const n = Number(w);
      const words = numToWords(n);
      if (words) {
        out.push(...words.split(' '));
        continue;
      }
    }
    out.push(w);
  }
  return out;
}

export default normTokens;
