import type { FeatureSynth, Features, Tempo } from './types';

export function createFeatureSynth(): FeatureSynth {
  // Sliding window of last ~5s tokens
  const TOK_WIN_MS = 5000;
  type Tok = { text: string; t: number };
  let toks: Tok[] = [];
  let lastTokensKey = '';
  let speakingWanted = false;
  let speaking = false;
  let lastSpeakChange = 0;
  const ATTACK_MS = 80, RELEASE_MS = 300; // debounce
  let lastActivityMs = performance.now();
  let wpmEma: number | undefined;
  const ALPHA = 0.3;

  function dedupeKey(list: {text: string}[]) { return list.map(x => x.text).join('|'); }
  function wordsInWindow(now: number): number {
    const start = now - TOK_WIN_MS;
    toks = toks.filter(t => t.t >= start);
    let words = 0;
    for (const t of toks) {
      words += (t.text || '').trim().split(/\s+/).filter(Boolean).length;
    }
    return words;
  }

  function push(f: Features) {
    const now = performance.now();
    if (f.kind === 'tokens') {
      const key = dedupeKey(f.tokens);
      if (!f.final && key === lastTokensKey) {
        // duplicate interim, ignore
      } else {
        lastTokensKey = key;
        for (const tk of f.tokens) {
          toks.push({ text: tk.text, t: now });
        }
        lastActivityMs = now;
        speakingWanted = true;
      }
    } else if (f.kind === 'gate') {
      speakingWanted = !!f.speaking;
      if (f.speaking) lastActivityMs = now;
    }

    // Debounce speaking
    if (speakingWanted && !speaking) {
      if (now - lastSpeakChange >= ATTACK_MS) { speaking = true; lastSpeakChange = now; }
    } else if (!speakingWanted && speaking) {
      if (now - lastSpeakChange >= RELEASE_MS) { speaking = false; lastSpeakChange = now; }
    }

    // Update WPM EMA from window
    const words = wordsInWindow(now);
    const instWpm = words * 60 * (1000 / TOK_WIN_MS);
    if (words > 0) {
      wpmEma = wpmEma == null ? instWpm : (ALPHA * instWpm + (1 - ALPHA) * wpmEma);
    }
  }

  function getTempo(): Tempo {
    const now = performance.now();
    const pauseMs = Math.max(0, now - lastActivityMs);
    return { wpm: wpmEma, pauseMs };
  }

  function getSpeaking(): boolean { return speaking; }

  return { push, getTempo, getSpeaking };
}
