// src/features/pll.ts
// Placeholder PLL controller – real logic will be migrated from teleprompter_pro.js

export type PLLMode = 'idle' | 'seek' | 'locked' | 'coast' | 'lost';

export interface PLLState {
  mode: PLLMode;
  bias: number;   // -1 .. 1 where positive means script is leading speech
  locked: boolean;
}

const defaultState: PLLState = {
  mode: 'idle',
  bias: 0,
  locked: false,
};

export function createPLL() {
  let state: PLLState = { ...defaultState };

  return {
    getState(): PLLState {
      return state;
    },
    reset() {
      state = { ...defaultState };
    },
    // Stub: when we migrate the real math, this will update bias/mode/locked
    sample(_sim: number, _leadMs: number) {
      // no-op for now
      return state;
    },
  };
}
