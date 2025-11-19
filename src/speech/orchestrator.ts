import { emitAsrSyncFromLineDelta } from './asrSync';
import * as matcher from './matcher';
import type { Recognizer } from './recognizer';
import { createRecognizer } from './recognizer';

export interface MatchEvent {
  idx: number;
  sim: number;
  isFinal: boolean;
}

let _rec: Recognizer | null = null;
let _cb: ((_evt: MatchEvent) => void) | null = null;

// Lightweight cosine similarity for HUD transcript enrichment (dev only usage)
function simCosine(a: string, b: string): number {
  try {
    const tok = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter(Boolean);
    const A = tok(a), B = tok(b);
    if (!A.length || !B.length) return 0;
    const tf = (arr: string[]) => arr.reduce((m, w) => (m.set(w, (m.get(w) || 0) + 1), m), new Map<string, number>());
    const TA = tf(A), TB = tf(B);
    let dot = 0; let na = 0; let nb = 0;
    for (const [w, v] of TA) { na += v*v; if (TB.has(w)) dot += v * (TB.get(w) || 0); }
    for (const v of TB.values()) nb += v*v;
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom ? dot / denom : 0;
  } catch { return 0; }
}

function getExpectedLineText(): string | undefined {
  try { return (window as any).__tpScript?.currentExpectedText?.(); } catch { return undefined; }
}

function dispatchTranscript(text: string, final: boolean) {
  try {
    const expected = getExpectedLineText();
    const sim = expected ? simCosine(text, expected) : undefined;
    const detail = { text, final, ts: Date.now(), sim };
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', { detail }));
  } catch {}
}

function _getRuntimeScriptState() {
  // runtime stores these globals (legacy). Use safe access and sensible defaults.
  const w: any = window as any;
  const scriptWords: string[] = Array.isArray(w.scriptWords) ? w.scriptWords : [];
  const paraIndex: any[] = Array.isArray(w.paraIndex) ? w.paraIndex : [];
  const vParaIndex = Array.isArray(w.__vParaIndex) ? w.__vParaIndex : null;
  const cfg = {
    MATCH_WINDOW_AHEAD: typeof w.MATCH_WINDOW_AHEAD === 'number' ? w.MATCH_WINDOW_AHEAD : 240,
    MATCH_WINDOW_BACK: typeof w.MATCH_WINDOW_BACK === 'number' ? w.MATCH_WINDOW_BACK : 40,
    SIM_THRESHOLD: typeof w.SIM_THRESHOLD === 'number' ? w.SIM_THRESHOLD : 0.46,
    MAX_JUMP_AHEAD_WORDS: typeof w.MAX_JUMP_AHEAD_WORDS === 'number' ? w.MAX_JUMP_AHEAD_WORDS : 18,
  } as matcher.MatchConfig;
  const currentIndex = typeof (w.currentIndex) === 'number' ? w.currentIndex : 0;
  const viterbiState = w.__viterbiIPred || null;
  return { scriptWords, paraIndex, vParaIndex, cfg, currentIndex, viterbiState };
}

export function matchBatch(text: string, isFinal: boolean): matcher.MatchResult {
  try {
    const spokenTokens = matcher.normTokens(text || '');
    const { scriptWords, paraIndex, vParaIndex, cfg, currentIndex, viterbiState } = _getRuntimeScriptState();
    const res = matcher.matchBatch(spokenTokens, scriptWords, paraIndex, vParaIndex, cfg, currentIndex, viterbiState as any);

    // Convert line delta to px error so the adaptive governor can respond
    try {
      const deltaLines = Number(res.bestIdx) - Number(currentIndex || 0);
      if (deltaLines) {
        const conf = Math.max(0, Math.min(1, res.bestSim || 0)) * (isFinal ? 1 : 0.6);
        emitAsrSyncFromLineDelta(deltaLines, conf);
      }
    } catch {
      // non-fatal; continue flow
    }

    // notify consumer callback if present
    if (_cb) {
      try {
        _cb({ idx: res.bestIdx, sim: res.bestSim, isFinal });
      } catch (e) {
        try { console.warn('[TP] speech callback failed', e); } catch {}
      }
    }
    return res;
  } catch (err) {
    try { console.warn('[TP] matchBatch error', err); } catch {}
    // return a safe default
    return { bestIdx: 0, bestSim: 0, topScores: [] };
  }
}

export function startRecognizer(cb: (_evt: MatchEvent) => void, opts?: { lang?: string }) {
  if (_rec) {
    // already running; replace callback
    _cb = cb;
    return;
  }
  try {
    _rec = createRecognizer(opts as any);
    _cb = cb;
    _rec.start((transcript: string, isFinal: boolean) => {
      const text = transcript || '';
      matchBatch(text, isFinal);
      dispatchTranscript(text, isFinal);
    });
  } catch (err) {
    try { console.warn('[TP] startRecognizer failed', err); } catch {}
    _rec = null;
    _cb = null;
    throw err;
  }
}

export function stopRecognizer() {
  try {
    if (_rec) {
      try { _rec.stop(); } catch {}
      _rec = null;
    }
  } finally {
    _cb = null;
  }
}

// Attach a safe shim on window for legacy callers. Loader will import this file
// and wire the functions onto window.__tpSpeech.
(function attachShim() {
  try {
    const w: any = window as any;
    w.__tpSpeech = w.__tpSpeech || {};
    w.__tpSpeech.startRecognizer = startRecognizer;
    w.__tpSpeech.stopRecognizer = stopRecognizer;
    w.__tpSpeech.matchBatch = matchBatch;
  } catch {
    // noop
  }
})();
