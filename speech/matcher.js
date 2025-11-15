// src/speech/matcher.ts
function normTokens(s) {
  return String(s || "").toLowerCase().replace(/\[[^\]]+]/g, "").replace(/[“”"']/g, "").replace(/[—–]/g, "-").replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}
function getNgrams(tokens, n) {
  const out = [];
  for (let i = 0; i <= tokens.length - n; i++) out.push(tokens.slice(i, i + n).join(" "));
  return out;
}
function cosineSimilarity(vec1, vec2) {
  let dot = 0, n1 = 0, n2 = 0;
  for (let i = 0; i < vec1.length; i++) {
    dot += vec1[i] * vec2[i];
    n1 += vec1[i] * vec1[i];
    n2 += vec2[i] * vec2[i];
  }
  return n1 && n2 ? dot / (Math.sqrt(n1) * Math.sqrt(n2)) : 0;
}
function computeTFIDFSimilarity(tokens1, tokens2) {
  const ngrams1 = getNgrams(tokens1, 2).concat(getNgrams(tokens1, 3));
  const ngrams2 = getNgrams(tokens2, 2).concat(getNgrams(tokens2, 3));
  const all = Array.from(/* @__PURE__ */ new Set([...ngrams1, ...ngrams2]));
  const v1 = all.map((ng) => ngrams1.filter((x) => x === ng).length);
  const v2 = all.map((ng) => ngrams2.filter((x) => x === ng).length);
  return cosineSimilarity(v1, v2);
}
function computeJaccardSimilarity(tokens1, tokens2) {
  const s1 = new Set(tokens1.map((t) => t.toLowerCase()));
  const s2 = new Set(tokens2.map((t) => t.toLowerCase()));
  const inter = new Set([...s1].filter((x) => s2.has(x)));
  const union = /* @__PURE__ */ new Set([...s1, ...s2]);
  return union.size ? inter.size / union.size : 0;
}
function computeLineSimilarity(spokenTokens, scriptText) {
  const scriptTokens = normTokens(scriptText);
  const tfidf = computeTFIDFSimilarity(spokenTokens, scriptTokens);
  const jacc = computeJaccardSimilarity(spokenTokens, scriptTokens);
  const charsA = spokenTokens.join(" ");
  const charsB = scriptTokens.join(" ");
  const charF1 = (() => {
    const setA = new Set(charsA.split(""));
    const setB = new Set(charsB.split(""));
    const inter = new Set([...setA].filter((x) => setB.has(x)));
    const p = setA.size ? inter.size / setA.size : 0;
    const r = setB.size ? inter.size / setB.size : 0;
    return p + r > 0 ? 2 * p * r / (p + r) : 0;
  })();
  let score = 0.5 * tfidf + 0.3 * charF1 + 0.2 * jacc;
  if (scriptTokens.length < 5) score -= 0.12;
  return Math.max(0, Math.min(1, score));
}
function matchBatch(spokenTokens, scriptWords, paraIndex, vParaIndex, cfg, currentIndex, _viterbiState) {
  const batch = spokenTokens.slice(-Math.max(3, spokenTokens.length));
  const candidates = /* @__PURE__ */ new Set();
  const windowAhead = cfg.MATCH_WINDOW_AHEAD;
  const candidateStart = Math.max(0, Math.floor(currentIndex) - cfg.MATCH_WINDOW_BACK);
  const candidateEnd = Math.min(scriptWords.length - 1, Math.floor(currentIndex) + windowAhead);
  for (let i = candidateStart; i <= candidateEnd; i++) candidates.add(i);
  const scores = {};
  const candidateArray = Array.from(candidates);
  for (const j of candidateArray) {
    const para = vParaIndex ? vParaIndex[j] : paraIndex[j]?.key;
    if (!para) continue;
    let sc = computeLineSimilarity(batch, String(para));
    if (paraIndex[j]?.isMeta) sc = sc * 0.5 - 0.2;
    else if (paraIndex[j]?.isNonSpoken) sc = sc - 0.6;
    scores[j] = sc;
  }
  const top = Object.entries(scores).sort(([, a], [, b]) => b - a).slice(0, 3).map(([idx, score]) => ({ idx: Number(idx), score: Number(score.toFixed(3)) }));
  const radius = 40;
  const bandStart = Math.max(0, Math.floor(currentIndex) - radius);
  const bandEnd = Math.min((vParaIndex ? vParaIndex.length : paraIndex.length) - 1, Math.floor(currentIndex) + radius);
  let best = top[0] || { idx: Math.max(0, currentIndex), score: 0 };
  if (best && (best.idx < bandStart || best.idx > bandEnd) && best.score < 0.82) {
    const inBand = top.find((t) => t.idx >= bandStart && t.idx <= bandEnd);
    if (inBand) best = inBand;
  }
  return { bestIdx: best.idx, bestSim: best.score, topScores: top };
}
export {
  computeJaccardSimilarity,
  computeLineSimilarity,
  computeTFIDFSimilarity,
  cosineSimilarity,
  getNgrams,
  matchBatch,
  normTokens
};
//# sourceMappingURL=matcher.js.map
