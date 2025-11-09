// =============================================================
// File: src/speech/asr-engine.ts
// =============================================================
export type AsrEvent =
  | { type: 'ready' }
  | { type: 'listening' }
  | { type: 'partial'; text: string; confidence?: number }
  | { type: 'final'; text: string; confidence?: number }
  | { type: 'error'; code: string; message?: string }
  | { type: 'stopped' };

export interface AsrEngineOptions {
  lang: string;            // e.g. "en-US"
  interim: boolean;        // emit partials
  endpointingMs: number;   // VAD/endpointing target (hint)
  profanityFilter: boolean;
}

export interface AsrEngine {
  name: string;
  start(_opts: AsrEngineOptions): Promise<void>;
  stop(): Promise<void>;
  on(_cb: (_e: AsrEvent) => void): void;
}

export type AsrEngineName = 'webspeech' | 'vosk' | 'whisper';

// Lightweight event emitter to keep engines framework-agnostic
export class Emitter<T> {
  private ls = new Set<(_e: T) => void>();
  on(fn: (_e: T) => void) { this.ls.add(fn); }
  off(fn: (_e: T) => void) { this.ls.delete(fn); }
  emit(e: T) { for (const fn of this.ls) fn(e); }
}

// Shared helpers
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const FILLERS = new Set([
  'um','uh','like','you','know','er','ah','hmm','mm','okay','ok','right','so','well'
]);

export function stripFillers(s: string): string {
  const toks = normalizeText(s).split(' ');
  return toks.filter(t => !FILLERS.has(t)).join(' ');
}
