// ASR v2 — Types & Interfaces

export interface InputAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  onFeature(fn: (f: Features) => void): () => void; // subscribe/unsub
  status(): AdapterStatus;
}

export type AdapterStatus = {
  kind: 'webspeech' | 'vad' | 'streaming';
  ready: boolean;
  error?: string;
};

// WebSpeechAPIAdapter — emits tokens (+ timestamps best-effort)
export type WebSpeechFeature = {
  kind: 'tokens';
  tokens: Array<{ text: string; startMs?: number; endMs?: number }>;
  final: boolean;
};

// VADAdapter — energy gate only
export type VadFeature = {
  kind: 'gate';
  speaking: boolean;
  rmsDbfs: number;
  snrDb?: number;
};

// StreamingASRAdapter (future) — tokens with reliable timings
export type StreamingFeature = WebSpeechFeature;

export type Features = WebSpeechFeature | VadFeature | StreamingFeature;

// Derived layer
export type Tempo = {
  wpm: number | undefined; // EMA-smoothed; undefined when not available
  syllablesPerSec?: number;
  pauseMs: number;         // rolling silence since last token/gate-off
  confidence?: number;     // 0..1 when available
};

export interface FeatureSynth {
  push(f: Features): void;
  getTempo(): Tempo;
  getSpeaking(): boolean;
}

// Pace
export interface PaceCaps {
  minPxs: number;   // e.g., 10
  maxPxs: number;   // e.g., 220
  accelCap: number; // px/s²
  decayMs: number;  // silence decay cadence
}

export type PaceMode = 'assist' | 'align' | 'vad';

export interface PaceEngine {
  setMode(m: PaceMode): void;
  setCaps(c: Partial<PaceCaps>): void;
  setSensitivity(mult: number): void;      // 0.5..1.5
  setCatchupBias(level: 'off'|'low'|'med'): void;
  consume(tempo: Tempo, speaking: boolean): void;
  getTargetPxs(): number; // smoothed target
}

// Follower (alignment) — stubbed for 1.6.2
export type AlignStrategy = 'free' | 'paragraph' | 'line';
export interface Follower {
  setStrategy(s: AlignStrategy): void;
  suggestAnchor(anchorId: string): void;
  advanceOnTokenBurst(): void;
  release(): void;
}

// Motor
export interface Motor {
  setEnabled(on: boolean): void;
  setVelocity(pxs: number): void;
  tick(now: number): void;
}

// Orchestrator
export interface OrchestratorStatus {
  mode: PaceMode;
  wpm?: number;
  speaking: boolean;
  targetPxs: number;
  errors: string[];
}

export interface Orchestrator {
  start(adapter: InputAdapter): Promise<void>;
  stop(): Promise<void>;
  setMode(m: PaceMode): void;
  setGovernor(caps: Partial<PaceCaps>): void;
  setSensitivity(mult: number): void;
  setAlignStrategy(s: AlignStrategy): void;
  getStatus(): OrchestratorStatus;
}

// DOM event helpers
export function emitVadEvent(detail: { speaking: boolean; rmsDbfs: number }) {
  try { window.dispatchEvent(new CustomEvent('tp:vad', { detail })); } catch {}
}

export function emitTokensEvent(detail: { tokens: Array<{text: string; startMs?: number; endMs?: number}>; final: boolean }) {
  try { window.dispatchEvent(new CustomEvent('tp:asr:tokens', { detail })); } catch {}
}

export function emitAsrError(detail: { code: string; message: string }) {
  try { window.dispatchEvent(new CustomEvent('tp:asr:error', { detail })); } catch {}
}
