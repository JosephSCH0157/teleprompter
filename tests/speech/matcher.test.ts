import { matchBatch, computeTFIDFSimilarity, computeJaccardSimilarity, normTokens } from '../../src/speech/matcher';

describe('TS matcher parity', () => {
  test('computeTFIDFSimilarity: identical token lists => 1', () => {
    const a = ['quick', 'brown', 'fox'];
    const b = ['quick', 'brown', 'fox'];
    const v = computeTFIDFSimilarity(a, b);
    expect(v).toBeGreaterThanOrEqual(0.999);
  });

  test('computeJaccardSimilarity: identical sets => 1', () => {
    const a = ['hello', 'world'];
    const b = ['hello', 'world'];
    const v = computeJaccardSimilarity(a, b);
    expect(v).toBeCloseTo(1);
  });

  test('matchBatch picks correct paragraph using paraIndex keys', () => {
    const scriptWords = ['hello', 'world', 'foo', 'bar'];
    const paraIndex = [
      { start: 0, end: 1, key: 'hello world', isMeta: false },
      { start: 2, end: 3, key: 'foo bar', isMeta: false },
    ];
    const cfg = { MATCH_WINDOW_AHEAD: 10, MATCH_WINDOW_BACK: 5, SIM_THRESHOLD: 0.2, MAX_JUMP_AHEAD_WORDS: 50 };
    const spoken = normTokens('hello world');
    const res = matchBatch(spoken, scriptWords, paraIndex as any, null, cfg as any, 0);
    expect(res.bestIdx).toBe(0);
    expect(res.bestSim).toBeGreaterThan(0);
  });

  test('matchBatch uses vParaIndex when provided', () => {
    const scriptWords = ['hello', 'world', 'foo', 'bar'];
    const paraIndex = [
      { start: 0, end: 1, key: 'hello world' },
      { start: 2, end: 3, key: 'foo bar' },
    ];
    const vParaIndex = ['hello world', 'foo bar'];
    const cfg = { MATCH_WINDOW_AHEAD: 10, MATCH_WINDOW_BACK: 5, SIM_THRESHOLD: 0.2, MAX_JUMP_AHEAD_WORDS: 50 };
    const spoken = normTokens('foo bar');
    const res = matchBatch(spoken, scriptWords, paraIndex as any, vParaIndex, cfg as any, 0);
    expect(res.bestIdx).toBe(1);
    expect(res.bestSim).toBeGreaterThan(0);
  });
});
