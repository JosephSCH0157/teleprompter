// @ts-nocheck
export {};

// Loader for speech recognizer/matcher. Attaches `window.__tpRecognizer` and `window.__tpMatcher`
// factories to allow gradual adoption by the legacy runtime.
(async function () {
  try {
    // Prefer JS builds; never import .ts in-browser
    const tryImport = async (spec) => { try { return await import(spec); } catch { return null; } };

    const pick = async (list) => {
      for (const s of list) { const m = await tryImport(s); if (m) return m; }
      return null;
    };

    const recMod = await pick([
      '/speech/recognizer.js',
      '/dist/speech/recognizer.js',
    ]);
    const matchMod = await pick([
      '/speech/matcher.js',
      '/dist/speech/matcher.js',
    ]);

    if (recMod) {
      try { (window).__tpRecognizer = (opts) => recMod.createRecognizer(opts); } catch {}
    }
    if (matchMod) {
      try {
        (window).__tpMatcher = {
          matchBatch: matchMod.matchBatch,
          normTokens: matchMod.normTokens,
          computeLineSimilarity: matchMod.computeLineSimilarity,
        };
      } catch {}
    }

    // high-level orchestrator (best-effort)
    const orch = await pick([
      '/speech/orchestrator.js',
      '/dist/speech/orchestrator.js',
    ]);
    if (orch) {
      (window).__tpSpeech = (window).__tpSpeech || {};
      try { (window).__tpSpeech.startRecognizer = orch.startRecognizer; } catch {}
      try { (window).__tpSpeech.stopRecognizer = orch.stopRecognizer; } catch {}
      try { (window).__tpSpeech.matchBatch = orch.matchBatch; } catch {}
    }
  } catch (e) {
    try { console.warn('[TP] speech loader failed', e); } catch {}
  }
})();
