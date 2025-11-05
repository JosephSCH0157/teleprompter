// =============================================================
// File: src/state/speech-store.ts
// (Local speech-only store. You can merge into your global store later.)
// =============================================================
export type SpeechState = {
  engine: 'webspeech' | 'vosk' | 'whisper';
  lang: string;
  interim: boolean;
  threshold: number;         // coverage × confidence
  endpointingMs: number;
  fillerFilter: boolean;
};

const state: SpeechState = {
  engine: 'webspeech',
  lang: 'en-US',
  interim: true,
  threshold: 0.60,
  endpointingMs: 700,
  fillerFilter: true,
};

const subs = new Set<(s: SpeechState) => void>();

export const speechStore = {
  get(): SpeechState { return { ...state }; },
  set(patch: Partial<SpeechState>) {
    Object.assign(state, patch);
    for (const fn of subs) fn({ ...state });
  },
  subscribe(fn: (s: SpeechState) => void) { subs.add(fn); return () => subs.delete(fn); },
};
