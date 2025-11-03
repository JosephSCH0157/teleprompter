export type BiasState = { biasMs: number };

let state: BiasState = { biasMs: 0 };

export function getBias() {
  return state.biasMs;
}

export function adjustBias(deltaMs: number) {
  state.biasMs = Math.max(-1000, Math.min(1000, state.biasMs + deltaMs));
  try { window.dispatchEvent(new CustomEvent('pll:bias', { detail: { biasMs: state.biasMs } })); } catch {}
  return state.biasMs;
}

export function setBias(ms: number) {
  state.biasMs = Math.max(-1000, Math.min(1000, ms));
  try { window.dispatchEvent(new CustomEvent('pll:bias', { detail: { biasMs: state.biasMs } })); } catch {}
  return state.biasMs;
}

export { };

