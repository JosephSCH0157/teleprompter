var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

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

// src/speech/recognizer.ts
var Recognizer = class {
  constructor(opts = {}) {
    __publicField(this, "recog", null);
    __publicField(this, "cb", null);
    __publicField(this, "opts");
    __publicField(this, "_lastInterimAt", 0);
    this.opts = Object.assign({ lang: "en-US", interimIntervalMs: 150, maxAlternatives: 2 }, opts);
  }
  available() {
    return Boolean(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);
  }
  start(cb) {
    this.cb = cb;
    const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!SR) throw new Error("SpeechRecognition not available");
    try {
      this.recog = new SR();
      this.recog.continuous = true;
      this.recog.interimResults = true;
      this.recog.lang = this.opts.lang;
      try {
        this.recog.maxAlternatives = Math.max(2, this.recog.maxAlternatives || 0, this.opts.maxAlternatives || 2);
      } catch {
      }
      this.recog.onstart = () => {
      };
      this.recog.onend = () => {
      };
      this.recog.onresult = (e) => {
        let interim = "";
        let finals = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finals += (r[0]?.transcript || "") + " ";
          else interim += (r[0]?.transcript || "") + " ";
        }
        if (finals && this.cb) this.cb(finals.trim(), true);
        const now = performance.now();
        if (interim && now - this._lastInterimAt > (this.opts.interimIntervalMs || 150)) {
          this._lastInterimAt = now;
          if (this.cb) this.cb(interim.trim(), false);
        }
      };
      try {
        this.recog.start();
      } catch (e) {
        throw e;
      }
    } catch (err) {
      this.recog = null;
      throw err;
    }
  }
  stop() {
    try {
      if (this.recog) {
        try {
          this.recog.stop();
        } catch {
        }
      }
    } finally {
      this.recog = null;
      this.cb = null;
    }
  }
};
function createRecognizer(opts) {
  return new Recognizer(opts);
}

// src/speech/orchestrator.ts
var _rec = null;
var _cb = null;
function simCosine(a, b) {
  try {
    const tok = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter(Boolean);
    const A = tok(a), B = tok(b);
    if (!A.length || !B.length) return 0;
    const tf = (arr) => arr.reduce((m, w) => (m.set(w, (m.get(w) || 0) + 1), m), /* @__PURE__ */ new Map());
    const TA = tf(A), TB = tf(B);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (const [w, v] of TA) {
      na += v * v;
      if (TB.has(w)) dot += v * (TB.get(w) || 0);
    }
    for (const v of TB.values()) nb += v * v;
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom ? dot / denom : 0;
  } catch {
    return 0;
  }
}
function getExpectedLineText() {
  try {
    return window.__tpScript?.currentExpectedText?.();
  } catch {
    return void 0;
  }
}
function dispatchTranscript(text, final) {
  try {
    const expected = getExpectedLineText();
    const sim = expected ? simCosine(text, expected) : void 0;
    const detail = { text, final, ts: Date.now(), sim };
    window.dispatchEvent(new CustomEvent("tp:speech:transcript", { detail }));
  } catch {
  }
}
function _getRuntimeScriptState() {
  const w = window;
  const scriptWords = Array.isArray(w.scriptWords) ? w.scriptWords : [];
  const paraIndex = Array.isArray(w.paraIndex) ? w.paraIndex : [];
  const vParaIndex = Array.isArray(w.__vParaIndex) ? w.__vParaIndex : null;
  const cfg = {
    MATCH_WINDOW_AHEAD: typeof w.MATCH_WINDOW_AHEAD === "number" ? w.MATCH_WINDOW_AHEAD : 240,
    MATCH_WINDOW_BACK: typeof w.MATCH_WINDOW_BACK === "number" ? w.MATCH_WINDOW_BACK : 40,
    SIM_THRESHOLD: typeof w.SIM_THRESHOLD === "number" ? w.SIM_THRESHOLD : 0.46,
    MAX_JUMP_AHEAD_WORDS: typeof w.MAX_JUMP_AHEAD_WORDS === "number" ? w.MAX_JUMP_AHEAD_WORDS : 18
  };
  const currentIndex = typeof w.currentIndex === "number" ? w.currentIndex : 0;
  const viterbiState = w.__viterbiIPred || null;
  return { scriptWords, paraIndex, vParaIndex, cfg, currentIndex, viterbiState };
}
function matchBatch2(text, isFinal) {
  try {
    const spokenTokens = normTokens(text || "");
    const { scriptWords, paraIndex, vParaIndex, cfg, currentIndex, viterbiState } = _getRuntimeScriptState();
    const res = matchBatch(spokenTokens, scriptWords, paraIndex, vParaIndex, cfg, currentIndex, viterbiState);
    if (_cb) {
      try {
        _cb({ idx: res.bestIdx, sim: res.bestSim, isFinal });
      } catch (e) {
        try {
          console.warn("[TP] speech callback failed", e);
        } catch {
        }
      }
    }
    return res;
  } catch (err) {
    try {
      console.warn("[TP] matchBatch error", err);
    } catch {
    }
    return { bestIdx: 0, bestSim: 0, topScores: [] };
  }
}
function startRecognizer(cb, opts) {
  if (_rec) {
    _cb = cb;
    return;
  }
  try {
    _rec = createRecognizer(opts);
    _cb = cb;
    _rec.start((transcript, isFinal) => {
      const text = transcript || "";
      matchBatch2(text, isFinal);
      dispatchTranscript(text, isFinal);
    });
  } catch (err) {
    try {
      console.warn("[TP] startRecognizer failed", err);
    } catch {
    }
    _rec = null;
    _cb = null;
    throw err;
  }
}
function stopRecognizer() {
  try {
    if (_rec) {
      try {
        _rec.stop();
      } catch {
      }
      _rec = null;
    }
  } finally {
    _cb = null;
  }
}
(function attachShim() {
  try {
    const w = window;
    w.__tpSpeech = w.__tpSpeech || {};
    w.__tpSpeech.startRecognizer = startRecognizer;
    w.__tpSpeech.stopRecognizer = stopRecognizer;
    w.__tpSpeech.matchBatch = matchBatch2;
  } catch {
  }
})();
export {
  matchBatch2 as matchBatch,
  startRecognizer,
  stopRecognizer
};
//# sourceMappingURL=orchestrator.js.map
