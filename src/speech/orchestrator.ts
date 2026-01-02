import { emitAsrSyncFromLineDelta } from './asrSync';
import * as matcher from './matcher';
import type { Recognizer } from './recognizer';
import { createRecognizer } from './recognizer';
import { getAsrDriverThresholds } from '../asr/asr-threshold-store';

console.info('[ASR_ORCH] LIVE envelope v2025-12-30b');

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
  minTokenOverlap?: number;
  minTokenLen?: number;
  multiLineMaxLines?: number;
  multiLineMinLines?: number;
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
  /\bi(?:'m| am) going to\b/gi,
  /\bim going to\b/gi,
  /\bgoing to have to\b/gi,
  /\bsend (?:you|u)\b/gi,
  /\bscreenshots?\b/gi,
  /\bchatgpt\b/gi,
  /\bdev\b/gi,
  /\blogs?\b/gi,
  /\bdebug\b/gi,
];

let matchIdSeq = 0;
const nextMatchId = () => {
  matchIdSeq += 1;
  return `m${Date.now().toString(36)}-${matchIdSeq}`;
};

function isMetaTranscript(text: string): boolean {
  const input = String(text || '');
  if (!input) return false;
  for (const rx of META_PHRASES) {
    rx.lastIndex = 0;
    if (rx.test(input)) return true;
  }
  return false;
}

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

function isLogEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    if (w.localStorage?.getItem('tp_dev_mode') === '1') return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.has('dev') || params.has('debug')) return true;
  } catch {}
  return false;
}

type AsrEnvelope = {
  text: string;
  final: boolean;
  timestamp: number;
  source: string;
  matchId: string | null;
  noMatch: boolean;
  meta?: boolean;
  match?: matcher.MatchResult | null;
  sim?: number | null;
  line?: number | null;
  candidates?: Array<{ idx: number; score: number }> | [];
} & Partial<matcher.MatchResult>;

function buildTranscriptEnvelope(text: string, final: boolean, match?: matcher.MatchResult): AsrEnvelope {
  try {
    const expected = getExpectedLineText();
    const sim = expected ? simCosine(text, expected) : undefined;
    const hasMatch =
      !!match &&
      Number.isFinite(match.bestIdx) &&
      Number(match.bestIdx) >= 0;
    const meta = isMetaTranscript(text);
    const base = {
      text,
      final,
      timestamp: Date.now(),
      source: meta ? 'meta' : 'orchestrator',
    };
    const payload: AsrEnvelope = hasMatch
      ? {
        ...match,
        ...base,
        matchId: nextMatchId(),
        noMatch: false,
        sim: Number.isFinite(match?.bestSim) ? match?.bestSim : (typeof sim === 'number' ? sim : null),
        meta,
        match,
        line: match?.bestIdx ?? null,
        candidates: Array.isArray(match?.topScores) ? match?.topScores : [],
      }
      : {
        matchId: null,
        noMatch: true,
        ...base,
      };
    return payload;
  } catch {}
  return {
    text,
    final,
    timestamp: Date.now(),
    source: 'orchestrator',
    matchId: null,
    noMatch: true,
  };
}

function dispatchTranscript(env: AsrEnvelope) {
  try {
    if (env.matchId === undefined) {
      console.error('DISPATCH_MISSING_MATCHID', Object.keys(env));
    }
    if (env.noMatch === undefined) {
      console.error('DISPATCH_MISSING_NOMATCH', Object.keys(env));
    }
    if (isLogEnabled()) {
      try {
        console.debug(
          '[ASR] dispatchTranscript keys=',
          Object.keys(env),
          'matchId=',
          env.matchId,
          'noMatch=',
          env.noMatch,
        );
      } catch {}
    }
    try {
      if (!env.noMatch && env.matchId) {
        const anyEnv = env as any;
        console.log('[ASR] dispatchMatch', {
          matchId: env.matchId,
          line: Number.isFinite(anyEnv.bestIdx) ? anyEnv.bestIdx : anyEnv.line,
          sim: Number.isFinite(anyEnv.bestSim) ? anyEnv.bestSim : anyEnv.sim,
        });
      }
    } catch {}
    try { console.log('[ASR] dispatchTranscript', env); } catch {}
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', { detail: env }));
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
    rx.lastIndex = 0;
    out = out.replace(rx, ' ');
  }
  return out;
}

function resolveBandRange(
  currentIndex: number,
  paraIndex: Array<{ line?: number }>,
  vParaIndex: string[] | null,
  windowBack: number,
  windowAhead: number
) {
  const cur = Number.isFinite(currentIndex) ? Math.floor(currentIndex) : 0;
  const lastEntry = paraIndex.length ? paraIndex[paraIndex.length - 1] : null;
  const lineCount = vParaIndex
    ? vParaIndex.length
    : (typeof lastEntry?.line === 'number' ? lastEntry.line + 1 : paraIndex.length);
  const safeCount = Math.max(0, lineCount);
  const bandStart = Math.max(0, cur - windowBack);
  const bandEnd = safeCount ? Math.min(safeCount - 1, cur + windowAhead) : 0;
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
    const res = matcher.matchBatch(matchTokens, scriptWords, paraIndex, vParaIndex, cfg, currentIndex, viterbiState as any, {
      minTokenOverlap: opts?.minTokenOverlap,
      minTokenLen: opts?.minTokenLen,
      multiLineMaxLines: opts?.multiLineMaxLines,
      multiLineMinLines: opts?.multiLineMinLines,
    });

    // Compact matcher log (throttled)
    const now = Date.now();
    if (now - lastMatchLogAt >= MATCH_LOG_THROTTLE_MS) {
      lastMatchLogAt = now;
      const curIdx = Number.isFinite(currentIndex) ? Math.floor(currentIndex) : 0;
      const bestIdx = Number.isFinite(res?.bestIdx) ? Math.floor(res.bestIdx) : -1;
      const deltaLines = bestIdx - curIdx;
      const topScores = Array.isArray(res?.topScores) ? res.topScores : [];
      const clue = compactClue(matchTokens, 6);
      const fallbackBand = resolveBandRange(curIdx, paraIndex, vParaIndex, cfg.MATCH_WINDOW_BACK, cfg.MATCH_WINDOW_AHEAD);
      const bandStart =
        Number.isFinite((res as any)?.bandStart) ? Math.floor((res as any).bandStart) : fallbackBand.bandStart;
      const bandEnd =
        Number.isFinite((res as any)?.bandEnd) ? Math.floor((res as any).bandEnd) : fallbackBand.bandEnd;
      const inBand = bestIdx >= bandStart && bestIdx <= bandEnd;
      const line = [
        '🧠 ASR_MATCH',
        `current=${curIdx}`,
        `best=${bestIdx}`,
        `delta=${deltaLines}`,
        `sim=${formatMatchScore(res?.bestSim)}`,
        `top=${formatTopScores(topScores)}`,
        `winBack=${cfg.MATCH_WINDOW_BACK}`,
        `winAhead=${cfg.MATCH_WINDOW_AHEAD}`,
        `bandStart=${bandStart}`,
        `bandEnd=${bandEnd}`,
        `inBand=${inBand ? 1 : 0}`,
        clue ? `clue="${clue}"` : '',
      ].filter(Boolean).join(' ');
      try { console.log(line); } catch {}
      if (!inBand) {
        try {
          console.warn('[ASR] match out of band', {
            current: curIdx,
            best: bestIdx,
            bandStart,
            bandEnd,
            clue,
          });
        } catch {}
      }
    }
    try {
      const curIdx = Number.isFinite(currentIndex) ? Math.floor(currentIndex) : 0;
      const fallbackBand = resolveBandRange(curIdx, paraIndex, vParaIndex, cfg.MATCH_WINDOW_BACK, cfg.MATCH_WINDOW_AHEAD);
      const bandStart =
        Number.isFinite((res as any)?.bandStart) ? Math.floor((res as any).bandStart) : fallbackBand.bandStart;
      const bandEnd =
        Number.isFinite((res as any)?.bandEnd) ? Math.floor((res as any).bandEnd) : fallbackBand.bandEnd;
      const bestIdx = Number.isFinite(res?.bestIdx) ? Math.floor(res.bestIdx) : -1;
      const inBand = bestIdx >= bandStart && bestIdx <= bandEnd;
      (res as any).bandStart = bandStart;
      (res as any).bandEnd = bandEnd;
      (res as any).inBand = inBand;
      (res as any).windowBack = cfg.MATCH_WINDOW_BACK;
      (res as any).windowAhead = cfg.MATCH_WINDOW_AHEAD;
      if (!inBand) {
        res.bestIdx = -1;
        res.bestSim = 0;
      }
    } catch {}

    // Convert line delta to px error so the adaptive governor can respond
    try {
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
    return { bestIdx: -1, bestSim: 0, topScores: [] };
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
      const thresholds = getAsrDriverThresholds();
      const bestSim = Number.isFinite(match?.bestSim) ? match.bestSim : 0;
      const candidateMatch = bestSim >= thresholds.candidateMinSim ? match : undefined;
      const payload = buildTranscriptEnvelope(text, isFinal, candidateMatch);
      dispatchTranscript(payload);
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




