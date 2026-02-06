const matchBatchStub = () => ({ bestIdx: 0, bestSim: 0, topScores: [] } as const);
const noop = () => undefined;

function hasSearchFlag(name: string, aliases: string[] = []): boolean {
  try {
    const search = typeof window !== 'undefined' && window.location ? window.location.search : '';
    if (!search) return false;
    const params = new URLSearchParams(search);
    if (params.get(name) === '1') return true;
    for (const alias of aliases) {
      if (params.get(alias) === '1') return true;
    }
  } catch {
    return false;
  }
  return false;
}

function hasStorageFlag(name: string): boolean {
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
    return storage?.getItem(name) === '1';
  } catch {
    return false;
  }
}

function flagEnabled(name: string, aliases: string[] = []): boolean {
  return hasSearchFlag(name, aliases) || hasStorageFlag(name);
}

export function isSpeechFeatureEnabled(): boolean {
  return flagEnabled('tp_speech') || flagEnabled('tp_speech_force');
}

export function isSpeechBackendAllowed(): boolean {
  return isSpeechFeatureEnabled() && flagEnabled('tp_probe_speech', ['probe']);
}

export function ensureSpeechGlobals(): void {
  if (typeof window === 'undefined') return;
  const win = window as Window & Record<string, any>;
  if (!win.__tpRecognizer) {
    win.__tpRecognizer = () => ({
      start: noop,
      stop: noop,
      abort: noop,
      on: noop,
      onend: null,
      onerror: null,
    });
  }
  if (!win.__tpMatcher) {
    win.__tpMatcher = {
      matchBatch: matchBatchStub,
      normTokens: () => [],
      computeLineSimilarity: () => 0,
    };
  } else {
    if (!win.__tpMatcher.matchBatch) win.__tpMatcher.matchBatch = matchBatchStub;
    if (!win.__tpMatcher.normTokens) win.__tpMatcher.normTokens = () => [];
    if (!win.__tpMatcher.computeLineSimilarity) win.__tpMatcher.computeLineSimilarity = () => 0;
  }
  if (!win.__tpSpeech) {
    win.__tpSpeech = {
      startRecognizer: async () => undefined,
      stopRecognizer: noop,
      matchBatch: matchBatchStub,
    };
  } else {
    if (!win.__tpSpeech.startRecognizer) win.__tpSpeech.startRecognizer = async () => undefined;
    if (!win.__tpSpeech.stopRecognizer) win.__tpSpeech.stopRecognizer = noop;
    if (!win.__tpSpeech.matchBatch) win.__tpSpeech.matchBatch = matchBatchStub;
  }
}
