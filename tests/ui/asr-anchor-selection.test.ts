import { pickStrongLongAnchorCandidate } from '../../src/features/asr/asr-scroll-driver';

describe('ASR long-anchor arbitration', () => {
  test('prefers strong long anchor over adjacent short-line pocket', () => {
    const cursorLine = 20;
    const candidate = pickStrongLongAnchorCandidate(cursorLine, [
      { idx: 21, score: 0.58, contentTokenCount: 4, sharedContentHits: 2, span: 1 },
      { idx: 22, score: 0.56, contentTokenCount: 4, sharedContentHits: 2, span: 1 },
      { idx: 24, score: 0.74, contentTokenCount: 14, sharedContentHits: 5, span: 2 },
    ]);

    expect(candidate).not.toBeNull();
    expect(candidate?.idx).toBe(24);
    expect(candidate?.score).toBeCloseTo(0.74, 3);
  });

  test('rejects long candidates that do not clear strong-anchor floor', () => {
    const cursorLine = 20;
    const candidate = pickStrongLongAnchorCandidate(cursorLine, [
      { idx: 24, score: 0.59, contentTokenCount: 16, sharedContentHits: 5, span: 2 },
    ]);

    expect(candidate).toBeNull();
  });
});
