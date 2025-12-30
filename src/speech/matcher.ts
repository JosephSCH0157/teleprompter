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
  bandStart?: number;
  bandEnd?: number;
  inBand?: boolean;
  bestSpan?: number;
  bestOverlap?: number;
  bestOverlapRatio?: number;
  windowBack?: number;
  windowAhead?: number;
};

// Minimal similarity helpers (kept pure for unit testing)
const NUMBER_TOKENS: Record<string, string> = {
  zero: '0',
  oh: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  sixty: '60',
  seventy: '70',
  eighty: '80',
  ninety: '90',
};

const FILLER_TOKENS = new Set([
  'um',
  'uh',
  'erm',
  'er',
  'ah',
  'hmm',
  'mm',
  'mmm',
  'uhh',
  'uhm',
]);

export function normTokens(s: string): string[] {
  // Align with sanitizeForMatch semantics: strip bracketed cues and normalize punctuation.
  const normalized = String(s || '')
    .toLowerCase()
    .replace(/\[[^\]]+]/g, ' ') // strip [pause]/[beat]/[note]
    .replace(/\([^)]*\)/g, ' ') // strip parentheticals
    .replace(/&/g, ' and ')
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'") // normalize apostrophes
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"') // normalize quotes
    .replace(/[\u2010-\u2015]/g, '-') // normalize dashes
    .replace(/[^a-z0-9\s'-]/g, ' ') // drop other punctuation
    .replace(/'/g, '') // drop apostrophes entirely
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((token) => NUMBER_TOKENS[token] ?? token)
    .filter((token) => !FILLER_TOKENS.has(token));
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

export function computeLineSimilarityFromTokens(spokenTokens: string[], scriptTokens: string[]) {
  const tfidf = computeTFIDFSimilarity(spokenTokens, scriptTokens);
  const jacc = computeJaccardSimilarity(spokenTokens, scriptTokens);
  const containment = (() => {
    if (!spokenTokens.length) return 0;
    const s1 = new Set(spokenTokens);
    const s2 = new Set(scriptTokens);
    let hit = 0;
    for (const tok of s1) {
      if (s2.has(tok)) hit += 1;
    }
    return s1.size ? hit / s1.size : 0;
  })();
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

  let score = 0.45 * tfidf + 0.25 * charF1 + 0.1 * jacc + 0.2 * containment;
  if (scriptTokens.length < 5) score -= 0.12;
  return Math.max(0, Math.min(1, score));
}

export function computeLineSimilarity(spokenTokens: string[], scriptText: string) {
  const scriptTokens = normTokens(scriptText);
  return computeLineSimilarityFromTokens(spokenTokens, scriptTokens);
}

// Top-level matching API. It expects precomputed scriptWords and paraIndex
// from the runtime and returns the best match for the spoken token batch.
export function matchBatch(
  spokenTokens: string[],
  _scriptWords: string[],
  paraIndex: Array<{ start: number; end: number; key: string; line?: number; isMeta?: boolean; isNonSpoken?: boolean }>,
  vParaIndex: string[] | null,
  cfg: MatchConfig,
  currentIndex: number,
  _viterbiState?: { path: number[]; pred?: number },
  opts?: { minTokenOverlap?: number; minTokenLen?: number; multiLineMaxLines?: number; multiLineMinLines?: number }
): MatchResult {
  const batch = spokenTokens.slice(-Math.max(3, spokenTokens.length));
  const scores: Record<number, number> = {};
  const spanByIdx: Record<number, number> = {};
  const overlapByIdx: Record<number, number> = {};
  const overlapRatioByIdx: Record<number, number> = {};
  const windowAhead = cfg.MATCH_WINDOW_AHEAD;
  const curIdx = Number.isFinite(currentIndex) ? Math.floor(currentIndex) : 0;
  const lastEntry = paraIndex.length ? paraIndex[paraIndex.length - 1] : null;
  const lineCount = vParaIndex
    ? vParaIndex.length
    : ((typeof lastEntry?.line === 'number' ? lastEntry.line + 1 : paraIndex.length));
  const safeLineCount = Math.max(0, lineCount);
  if (!safeLineCount) {
    return {
      bestIdx: -1,
      bestSim: 0,
      topScores: [],
      bandStart: 0,
      bandEnd: 0,
      inBand: false,
    };
  }
  const bandStart = Math.max(0, curIdx - cfg.MATCH_WINDOW_BACK);
  const bandEnd = Math.min(safeLineCount - 1, curIdx + windowAhead);
  if (bandEnd < bandStart) {
    return {
      bestIdx: -1,
      bestSim: 0,
      topScores: [],
      bandStart,
      bandEnd,
      inBand: false,
    };
  }
  const lineText: Array<string | null> = new Array(safeLineCount).fill(null);
  const lineMeta: boolean[] = new Array(safeLineCount).fill(false);
  const lineNonSpoken: boolean[] = new Array(safeLineCount).fill(false);
  if (vParaIndex) {
    for (let i = 0; i < safeLineCount; i++) {
      const text = vParaIndex[i];
      if (typeof text === 'string' && text) lineText[i] = text;
    }
  }
  for (let i = 0; i < paraIndex.length; i++) {
    const entry = paraIndex[i];
    const lineIdx = typeof entry?.line === 'number' ? entry.line : i;
    if (!Number.isFinite(lineIdx) || lineIdx < 0 || lineIdx >= safeLineCount) continue;
    if (!lineText[lineIdx]) {
      const text = entry?.key;
      if (typeof text === 'string' && text) lineText[lineIdx] = text;
    }
    if (entry?.isMeta) lineMeta[lineIdx] = true;
    if (entry?.isNonSpoken) lineNonSpoken[lineIdx] = true;
  }
  const minTokenOverlap = Number.isFinite(opts?.minTokenOverlap)
    ? Math.max(0, Math.floor(Number(opts?.minTokenOverlap)))
    : 0;
  const minTokenLen = Number.isFinite(opts?.minTokenLen)
    ? Math.max(1, Math.floor(Number(opts?.minTokenLen)))
    : 4;
  const overlapTokens = minTokenOverlap
    ? batch.filter((token) => token.length >= minTokenLen)
    : null;
  if (minTokenOverlap > 0 && (!overlapTokens || overlapTokens.length < minTokenOverlap)) {
    return {
      bestIdx: -1,
      bestSim: 0,
      topScores: [],
      bandStart,
      bandEnd,
      inBand: false,
    };
  }
  const multiLineMax = Number.isFinite(opts?.multiLineMaxLines)
    ? Math.max(1, Math.floor(Number(opts?.multiLineMaxLines)))
    : 1;
  const multiLineMin = Number.isFinite(opts?.multiLineMinLines)
    ? Math.max(1, Math.floor(Number(opts?.multiLineMinLines)))
    : 2;
  const allowMultiLine = multiLineMax > 1 && multiLineMin <= multiLineMax;
  for (let lineIdx = bandStart; lineIdx <= bandEnd; lineIdx++) {
    const baseText = lineText[lineIdx];
    if (!baseText) continue;
    const baseTokens = normTokens(baseText);
    if (!baseTokens.length) continue;
    const baseMeta = lineMeta[lineIdx];
    const baseNonSpoken = lineNonSpoken[lineIdx];
    const updateScore = (scriptTokens: string[], span: number, hasMeta: boolean, hasNonSpoken: boolean) => {
      if (overlapTokens && overlapTokens.length) {
        const scriptSet = new Set(scriptTokens);
        let hits = 0;
        for (const tok of overlapTokens) {
          if (scriptSet.has(tok)) hits += 1;
        }
        if (hits < minTokenOverlap) return;
        let sc = computeLineSimilarityFromTokens(batch, scriptTokens);
        if (hasNonSpoken) sc = sc - 0.6;
        else if (hasMeta) sc = sc * 0.5 - 0.2;
        const prev = scores[lineIdx];
        const ratio = overlapTokens.length ? hits / overlapTokens.length : 0;
        if (!Number.isFinite(prev) || sc > prev) {
          scores[lineIdx] = sc;
          spanByIdx[lineIdx] = span;
          overlapByIdx[lineIdx] = hits;
          overlapRatioByIdx[lineIdx] = ratio;
        }
        return;
      }
      let sc = computeLineSimilarityFromTokens(batch, scriptTokens);
      if (hasNonSpoken) sc = sc - 0.6;
      else if (hasMeta) sc = sc * 0.5 - 0.2;
      const prev = scores[lineIdx];
      if (!Number.isFinite(prev) || sc > prev) {
        scores[lineIdx] = sc;
        spanByIdx[lineIdx] = span;
      }
    };
    updateScore(baseTokens, 1, baseMeta, baseNonSpoken);
    if (!allowMultiLine) continue;
    for (let span = Math.max(2, multiLineMin); span <= multiLineMax; span++) {
      const end = lineIdx + span - 1;
      if (end > bandEnd) break;
      const parts: string[] = [];
      let hasMeta = baseMeta;
      let hasNonSpoken = baseNonSpoken;
      for (let i = lineIdx; i <= end; i++) {
        const text = lineText[i];
        if (!text) {
          parts.length = 0;
          break;
        }
        parts.push(text);
        if (lineMeta[i]) hasMeta = true;
        if (lineNonSpoken[i]) hasNonSpoken = true;
      }
      if (!parts.length) continue;
      const scriptTokens = normTokens(parts.join(' '));
      if (!scriptTokens.length) continue;
      updateScore(scriptTokens, span, hasMeta, hasNonSpoken);
    }
  }

  const top = Object.entries(scores)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 3)
    .map(([idx, score]) => ({ idx: Number(idx), score: Number((score as number).toFixed(3)) }));

  const best = top[0] || { idx: -1, score: 0 };
  const inBand = best.idx >= bandStart && best.idx <= bandEnd;
  const resolved = inBand ? best : { idx: -1, score: 0 };
  return {
    bestIdx: resolved.idx,
    bestSim: resolved.score as number,
    topScores: top,
    bandStart,
    bandEnd,
    inBand,
    bestSpan: resolved.idx >= 0 ? spanByIdx[resolved.idx] || 1 : undefined,
    bestOverlap: resolved.idx >= 0 ? overlapByIdx[resolved.idx] : undefined,
    bestOverlapRatio: resolved.idx >= 0 ? overlapRatioByIdx[resolved.idx] : undefined,
  };
}

