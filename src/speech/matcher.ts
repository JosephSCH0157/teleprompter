// Matcher: alignment, scoring and commit logic for speech-sync
// This module is a conservative port/encapsulation of the inline matcher logic
// found in the legacy runtime. It focuses on pure computational logic and
// exposes a small procedural API the runtime can call from event handlers.

export type MatchConfig = {
  MATCH_WINDOW_AHEAD: number;
  MATCH_WINDOW_BACK: number;
  SIM_THRESHOLD: number;
  MAX_JUMP_AHEAD_WORDS: number;
};

export type MatchResult = {
  bestIdx: number;
  bestSim: number;
  topScores: Array<{ idx: number; score: number }>;
};

// Minimal similarity helpers (kept pure for unit testing)
export function normTokens(s: string): string[] {
  // Align with sanitizeForMatch semantics: strip bracketed cues and normalize punctuation.
  return String(s || '')
    .toLowerCase()
    .replace(/\[[^\]]+]/g, '')      // strip [pause]/[beat]/[note]
    .replace(/[“”"']/g, '')          // remove quotes
    .replace(/[—–]/g, '-')            // normalize dashes
    .replace(/[^\w\s-]/g, ' ')      // drop other punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export function getNgrams(tokens: string[], n: number) {
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) out.push(tokens.slice(i, i + n).join(' '));
  return out;
}

export function cosineSimilarity(vec1: number[], vec2: number[]) {
  let dot = 0,
    n1 = 0,
    n2 = 0;
  for (let i = 0; i < vec1.length; i++) {
    dot += vec1[i] * vec2[i];
    n1 += vec1[i] * vec1[i];
    n2 += vec2[i] * vec2[i];
  }
  return n1 && n2 ? dot / (Math.sqrt(n1) * Math.sqrt(n2)) : 0;
}

// Simplified TF-IDF-ish similarity using ngram counts (cheap, deterministic)
export function computeTFIDFSimilarity(tokens1: string[], tokens2: string[]) {
  const ngrams1 = getNgrams(tokens1, 2).concat(getNgrams(tokens1, 3));
  const ngrams2 = getNgrams(tokens2, 2).concat(getNgrams(tokens2, 3));
  const all = Array.from(new Set([...ngrams1, ...ngrams2]));
  const v1 = all.map((ng) => ngrams1.filter((x) => x === ng).length);
  const v2 = all.map((ng) => ngrams2.filter((x) => x === ng).length);
  return cosineSimilarity(v1, v2);
}

export function computeJaccardSimilarity(tokens1: string[], tokens2: string[]) {
  const s1 = new Set(tokens1.map((t) => t.toLowerCase()));
  const s2 = new Set(tokens2.map((t) => t.toLowerCase()));
  const inter = new Set([...s1].filter((x) => s2.has(x)));
  const union = new Set([...s1, ...s2]);
  return union.size ? inter.size / union.size : 0;
}

export function computeLineSimilarity(spokenTokens: string[], scriptText: string) {
  const scriptTokens = normTokens(scriptText);
  const tfidf = computeTFIDFSimilarity(spokenTokens, scriptTokens);
  const jacc = computeJaccardSimilarity(spokenTokens, scriptTokens);
  // Simple char overlap as fallback
  const charsA = spokenTokens.join(' ');
  const charsB = scriptTokens.join(' ');
  const charF1 = (() => {
    const setA = new Set(charsA.split(''));
    const setB = new Set(charsB.split(''));
    const inter = new Set([...setA].filter((x) => setB.has(x)));
    const p = setA.size ? inter.size / setA.size : 0;
    const r = setB.size ? inter.size / setB.size : 0;
    return p + r > 0 ? (2 * p * r) / (p + r) : 0;
  })();

  let score = 0.5 * tfidf + 0.3 * charF1 + 0.2 * jacc;
  if (scriptTokens.length < 5) score -= 0.12;
  return Math.max(0, Math.min(1, score));
}

// Top-level matching API. It expects precomputed scriptWords and paraIndex
// from the runtime and returns the best match for the spoken token batch.
export function matchBatch(
  spokenTokens: string[],
  scriptWords: string[],
  paraIndex: Array<{ start: number; end: number; key: string; line?: number; isMeta?: boolean; isNonSpoken?: boolean }>,
  vParaIndex: string[] | null,
  cfg: MatchConfig,
  currentIndex: number,
  _viterbiState?: { path: number[]; pred?: number }
): MatchResult {
  const batch = spokenTokens.slice(-Math.max(3, spokenTokens.length));
  const candidates = new Set<number>();
  const windowAhead = cfg.MATCH_WINDOW_AHEAD;

  const candidateStart = Math.max(0, Math.floor(currentIndex) - cfg.MATCH_WINDOW_BACK);
  const candidateEnd = Math.min(scriptWords.length - 1, Math.floor(currentIndex) + windowAhead);
  for (let i = candidateStart; i <= candidateEnd; i++) candidates.add(i);

  const scores: Record<number, number> = {};
  const candidateArray = Array.from(candidates);
  for (const j of candidateArray) {
    const entry = paraIndex[j];
    const lineIdx = typeof entry?.line === 'number' ? entry.line : j;
    if (scores[lineIdx] != null) continue;
    const para = vParaIndex ? vParaIndex[j] : entry?.key;
    if (!para) continue;
    let sc = computeLineSimilarity(batch, String(para));
    if (entry?.isMeta) sc = sc * 0.5 - 0.2;
    else if (entry?.isNonSpoken) sc = sc - 0.6;
    scores[lineIdx] = sc;
  }

  const top = Object.entries(scores)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 3)
    .map(([idx, score]) => ({ idx: Number(idx), score: Number((score as number).toFixed(3)) }));

  // Windowed matching band around the currently visible/expected line.
  // Unless the top candidate is very strong (>= 0.82), prefer a candidate within ±40.
  const radius = 40;
  const bandStart = Math.max(0, Math.floor(currentIndex) - radius);
  const lastEntry = paraIndex.length ? paraIndex[paraIndex.length - 1] : null;
  const lineCount = vParaIndex ? vParaIndex.length : ((typeof lastEntry?.line === 'number' ? lastEntry.line + 1 : paraIndex.length));
  const bandEnd = Math.min(lineCount - 1, Math.floor(currentIndex) + radius);
  let best = top[0] || { idx: Math.max(0, currentIndex), score: 0 };
  if (best && (best.idx < bandStart || best.idx > bandEnd) && (best.score as number) < 0.82) {
    const inBand = top.find(t => t.idx >= bandStart && t.idx <= bandEnd);
    if (inBand) best = inBand;
  }
  return { bestIdx: best.idx, bestSim: best.score as number, topScores: top };
}
