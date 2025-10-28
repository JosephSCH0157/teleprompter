// Loader for speech recognizer/matcher. Attaches `window.__tpRecognizer` and `window.__tpMatcher`
// factories to allow gradual adoption by the legacy runtime.
(async function () {
  try {
    // NOTE: tooling may compile .ts -> .js; dynamic import of .ts will work in dev setups
    const recMod = await import('./recognizer.ts');
    const matchMod = await import('./matcher.ts');

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

    try {
      // high-level orchestrator (wires recognizer -> matcher -> consumer)
      const orch = await import('./orchestrator.ts');
      (window).__tpSpeech = (window).__tpSpeech || {};
      try { (window).__tpSpeech.startRecognizer = orch.startRecognizer; } catch {}
      try { (window).__tpSpeech.stopRecognizer = orch.stopRecognizer; } catch {}
      try { (window).__tpSpeech.matchBatch = orch.matchBatch; } catch {}
    } catch {
      // orchestrator import is best-effort
    }
  } catch (e) {
    try { console.warn('[TP] speech loader failed', e); } catch {}
  }
})();
