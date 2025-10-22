import * as matcher from './matcher';

declare global {
  interface Window {
    __tpMatcher?: any;
  }
}

// Attach a thin adapter so legacy code can call matchBatch synchronously.
window.__tpMatcher = window.__tpMatcher || {};
window.__tpMatcher.matchBatch = function (spokenTokens: string[], scriptWords: string[], paraIndex: any[], vParaIndex: string[] | null, cfg: matcher.MatchConfig, currentIndex: number, viterbiState?: any) {
  return matcher.matchBatch(spokenTokens, scriptWords, paraIndex, vParaIndex, cfg, currentIndex, viterbiState);
};

export {};
