// src/asr-types.ts
// Event detail types for ASR transcript and state events

export type TranscriptWord = {
  word: string;
  start?: number; // ms (if engine provides)
  end?: number;   // ms
  confidence?: number;
};

export type TranscriptEvent = {
  text: string;
  words?: TranscriptWord[];
  confidence?: number;   // engine summary, if present
  partial: boolean;      // interim result?
  final: boolean;        // true when finalized
  timestamp: number;     // performance.now()
  lineIndex?: number;    // matched line, if your matcher resolves it
  harness?: 'smoke';     // test harness marker (optional)
};

export type AsrStateEvent = {
  state: 'idle' | 'ready' | 'listening' | 'running' | 'error';
  reason?: string;
  timestamp: number;
};
