// Loader for speech recognizer/matcher. Attaches `window.__tpRecognizer` and `window.__tpMatcher`
// factories to allow gradual adoption by the legacy runtime.
(async function () {
  try {
    // NOTE: tooling may compile .ts -> .js; dynamic import of .ts will work in dev setups
    const recMod = await import('./speech/recognizer.ts');
    const matchMod = await import('./speech/matcher.ts');

    try {
      (window).__tpRecognizer = (opts) => recMod.createRecognizer(opts);
    } catch {}

    try {
      (window).__tpMatcher = {
        matchBatch: matchMod.matchBatch,
        normTokens: matchMod.normTokens,
        computeLineSimilarity: matchMod.computeLineSimilarity,
      };
    } catch {}
  } catch (e) {
    try { console.warn('[TP] speech loader failed', e); } catch {}
  }
})();
