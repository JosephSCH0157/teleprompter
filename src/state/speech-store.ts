// src/state/speech-store.ts
// Typed speech state store with simple subscribe/set/get API.

export type SpeechEngine = 'webspeech' | 'whisper' | 'vad' | string;

export interface SpeechState {
  engine: SpeechEngine;
  lang: string;
  interim: boolean;
  threshold: number;
  endpointingMs: number;
  fillerFilter: boolean;
}

type Subscriber = (next: SpeechState) => void;

const state: SpeechState = {
  engine: 'webspeech',
  lang: 'en-US',
  interim: true,
  threshold: 0.6,
  endpointingMs: 700,
  fillerFilter: true,
};

const subs = new Set<Subscriber>();

export const speechStore = {
  get(): SpeechState {
    return { ...state };
  },

  set(patch: Partial<SpeechState>): void {
    Object.assign(state, patch);
    const snapshot = { ...state };
    for (const fn of subs) {
      try {
        fn(snapshot);
      } catch {
        // ignore bad subscribers
      }
    }
  },

  subscribe(fn: Subscriber): () => void {
    subs.add(fn);
    // Optionally emit current state immediately:
    // fn({ ...state });
    return () => subs.delete(fn);
  },
};
