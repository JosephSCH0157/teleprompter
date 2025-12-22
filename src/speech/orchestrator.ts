import { emitAsrSyncFromLineDelta } from './asrSync';
import * as matcher from './matcher';
import type { Recognizer } from './recognizer';
import { createRecognizer } from './recognizer';

const SILENCE_HOLD_MS = 1200;

let lastAsrWordTs = 0;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let silenceActive = true;

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function dispatchAsrSilence(silent: boolean, ts: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent, ts } }));
  } catch {
    // swallow dispatch errors
  }
}

function emitSpeechState(running: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running } }));
  } catch {
    // non-fatal in case window is weird
  }
}

function setSilenceState(nextSilent: boolean, ts: number): void {
  if (silenceActive === nextSilent) return;
  silenceActive = nextSilent;
  dispatchAsrSilence(silenceActive, ts);
}

function scheduleSilenceCheck(): void {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  silenceTimer = setTimeout(() => {
    silenceTimer = null;
    const now = nowMs();
    if (!silenceActive && now - lastAsrWordTs >= SILENCE_HOLD_MS) {
      setSilenceState(true, now);
    }
  }, SILENCE_HOLD_MS);
}

function noteAsrSpeechActivity(text: string): void {
  if (!text || !text.trim()) return;
  const now = nowMs();
  lastAsrWordTs = now;
  if (silenceActive) {
    setSilenceState(false, now);
  }
  scheduleSilenceCheck();
}

if (typeof window !== 'undefined') {
  dispatchAsrSilence(true, nowMs());
}

export interface MatchEvent {
  idx: number;
  sim: number;
  isFinal: boolean;
}

export type MatchBatchOptions = {
  currentIndex?: number;
  windowBack?: number;
  windowAhead?: number;
};

let _rec: Recognizer | null = null;
let _cb: ((_evt: MatchEvent) => void) | null = null;

const MATCH_LOG_THROTTLE_MS = 250;
let lastMatchLogAt = 0;
const MATCH_TOKEN_WINDOW = 18;

const META_PHRASES: RegExp[] = [
  /\bit(?:'s| is) not keeping up\b/gi,
  /\bit(?:'s| is) not moving\b/gi,
  /\bit(?:'s| is) not scrolling\b/gi,
  /\bhas(?:n't| not) moved\b/gi,
  /\bokay so\b/gi,
  /\byou know\b/gi,
  /\bi think\b/gi,
  /\blet(?:'s| us) see\b/gi,
];

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

function dispatchTranscript(text: string, final: boolean, match?: matcher.MatchResult) {
  try {
    const expected = getExpectedLineText();
    const sim = expected ? simCosine(text, expected) : undefined;
    const detail = {
      text,
      final,
      timestamp: Date.now(),
      sim: match?.bestSim ?? sim,
      line: match?.bestIdx,
      candidates: match?.topScores,
      source: 'orchestrator' as const,
    };
    try { if (match) { console.log('[ASR] dispatchMatch', { line: match.bestIdx, sim: match.bestSim }); } } catch {}
    try { console.log('[ASR] dispatchTranscript', detail); } catch {}
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', { detail }));
  } catch {}
}

function _getRuntimeScriptState(opts?: MatchBatchOptions) {
  // runtime stores these globals (legacy). Use safe access and sensible defaults.
  const w: any = window as any;
  const scriptWords: string[] = Array.isArray(w.scriptWords) ? w.scriptWords : [];
  const paraIndex: any[] = Array.isArray(w.paraIndex) ? w.paraIndex : [];
  const vParaIndex = Array.isArray(w.__vParaIndex) ? w.__vParaIndex : null;
  const cfg = {
    MATCH_WINDOW_AHEAD: typeof opts?.windowAhead === 'number'
      ? opts.windowAhead
      : (typeof w.MATCH_WINDOW_AHEAD === 'number' ? w.MATCH_WINDOW_AHEAD : 240),
    MATCH_WINDOW_BACK: typeof opts?.windowBack === 'number'
      ? opts.windowBack
      : (typeof w.MATCH_WINDOW_BACK === 'number' ? w.MATCH_WINDOW_BACK : 40),
    SIM_THRESHOLD: typeof w.SIM_THRESHOLD === 'number' ? w.SIM_THRESHOLD : 0.46,
    MAX_JUMP_AHEAD_WORDS: typeof w.MAX_JUMP_AHEAD_WORDS === 'number' ? w.MAX_JUMP_AHEAD_WORDS : 18,
  } as matcher.MatchConfig;
  const currentIndex = typeof opts?.currentIndex === 'number'
    ? opts.currentIndex
    : (typeof (w.currentIndex) === 'number' ? w.currentIndex : 0);
  const viterbiState = w.__viterbiIPred || null;
  return { scriptWords, paraIndex, vParaIndex, cfg, currentIndex, viterbiState };
}

function formatMatchScore(value: number | null | undefined): string {
  return Number.isFinite(value as number) ? (value as number).toFixed(2) : '?';
}

function formatTopScores(topScores: Array<{ idx: number; score: number }>): string {
  if (!topScores.length) return '[]';
  return `[${topScores.map((entry) => {
    const idx = Number.isFinite(entry.idx) ? Math.floor(entry.idx) : '?';
    const score = Number.isFinite(entry.score) ? entry.score.toFixed(2) : '?';
    return `${idx}:${score}`;
  }).join(',')}]`;
}

function compactClue(tokens: string[], maxTokens: number): string {
  if (!tokens.length) return '';
  return tokens
    .slice(Math.max(0, tokens.length - maxTokens))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/"/g, '')
    .trim();
}

function stripMetaPhrases(text: string): string {
  let out = String(text || '');
  for (const rx of META_PHRASES) {
    out = out.replace(rx, ' ');
  }
  return out;
}

function resolveBandRange(
  currentIndex: number,
  paraIndex: Array<{ line?: number }>,
  vParaIndex: string[] | null,
  radius: number
) {
  const cur = Number.isFinite(currentIndex) ? Math.floor(currentIndex) : 0;
  const lastEntry = paraIndex.length ? paraIndex[paraIndex.length - 1] : null;
  const lineCount = vParaIndex
    ? vParaIndex.length
    : (typeof lastEntry?.line === 'number' ? lastEntry.line + 1 : paraIndex.length);
  const safeCount = Math.max(0, lineCount);
  const bandStart = Math.max(0, cur - radius);
  const bandEnd = safeCount ? Math.min(safeCount - 1, cur + radius) : 0;
  return { bandStart, bandEnd };
}

export function matchBatch(text: string, isFinal: boolean, opts?: MatchBatchOptions): matcher.MatchResult {
  try {
    const scrubbed = stripMetaPhrases(text || '');
    const spokenTokens = matcher.normTokens(scrubbed);
    const matchTokens = spokenTokens.slice(-MATCH_TOKEN_WINDOW);
    if (spokenTokens.length) {
      noteAsrSpeechActivity(text);
    }
    const { scriptWords, paraIndex, vParaIndex, cfg, currentIndex, viterbiState } = _getRuntimeScriptState(opts);
    const res = matcher.matchBatch(matchTokens, scriptWords, paraIndex, vParaIndex, cfg, currentIndex, viterbiState as any);

    // Compact matcher log (throttled)
    const now = Date.now();
    if (now - lastMatchLogAt >= MATCH_LOG_THROTTLE_MS) {
      lastMatchLogAt = now;
      const curIdx = Number.isFinite(currentIndex) ? Math.floor(currentIndex) : 0;
      const bestIdx = Number.isFinite(res?.bestIdx) ? Math.floor(res.bestIdx) : 0;
      const deltaLines = bestIdx - curIdx;
      const topScores = Array.isArray(res?.topScores) ? res.topScores : [];
      const clue = compactClue(matchTokens, 6);
      const bandRadius = 40;
      const { bandStart, bandEnd } = resolveBandRange(curIdx, paraIndex, vParaIndex, bandRadius);
      const line = [
        '🧠 ASR_MATCH',
        `current=${curIdx}`,
        `best=${bestIdx}`,
        `delta=${deltaLines}`,
        `sim=${formatMatchScore(res?.bestSim)}`,
        `top=${formatTopScores(topScores)}`,
        `winBack=${cfg.MATCH_WINDOW_BACK}`,
        `winAhead=${cfg.MATCH_WINDOW_AHEAD}`,
        `band=${bandRadius}`,
        `bandStart=${bandStart}`,
        `bandEnd=${bandEnd}`,
        clue ? `clue="${clue}"` : '',
      ].filter(Boolean).join(' ');
      try { console.log(line); } catch {}
    }

    // Convert line delta to px error so the adaptive governor can respond
    try {
      const currentIdx = Number((window as any).currentIndex ?? 0);
      const bestIdx = Number(res.bestIdx ?? 0);
      const deltaLines = Number(res.bestIdx) - Number(currentIndex || 0);
      const simScore = Number(res.bestSim);
      const allowSync = Number.isFinite(simScore) && simScore >= cfg.SIM_THRESHOLD;
      if (deltaLines && allowSync) {
        const conf = Math.max(0, Math.min(1, simScore || 0)) * (isFinal ? 1 : 0.6);
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
  try { console.log('[ASR] startRecognizer invoked with opts:', opts); } catch {}
  if (_rec) {
    // already running; replace callback
    _cb = cb;
    return;
  }
  try {
    _rec = createRecognizer(opts as any);
    try {
      console.log('[ASR] createRecognizer returned:', _rec ? 'ok' : 'null');
    } catch {}
    _cb = cb;
    if (!_rec) {
      try { console.warn('[ASR] startRecognizer: recognizer is null; createRecognizer probably failed'); } catch {}
      return;
    }
    try {
      try {
        console.debug('[ASR] willStartRecognizer', {
          phase: 'startRecognizer',
          mode: (window as any).__tpUiScrollMode,
          hasSR: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
        });
      } catch {}
      console.log('[ASR] calling recognizer.start()');
      _rec.start((transcript: string, isFinal: boolean) => {
        try { console.log('[ASR] raw recognizer result', { transcript, isFinal }); } catch {}
      const text = transcript || '';
      const match = matchBatch(text, isFinal);
      dispatchTranscript(text, isFinal, match);
      });
      try { console.log('[ASR] recognizer.start() returned without throwing'); } catch {}
    } catch (err) {
      try { console.error('[ASR] recognizer.start() threw', err); } catch {}
      throw err;
    }
    emitSpeechState(true);
  } catch (err) {
    try { console.error('[ASR] createRecognizer/startRecognizer failed', err); } catch {}
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
      emitSpeechState(false);
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
    try { console.log('[ASR] orchestrator global shim installing'); } catch {}
    w.__tpSpeech = w.__tpSpeech || {};
    w.__tpSpeech.startRecognizer = startRecognizer;
    w.__tpSpeech.stopRecognizer = stopRecognizer;
    w.__tpSpeech.matchBatch = matchBatch;
  } catch {
    // noop
  }
})();
