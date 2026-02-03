export type ScrollIntentSource = 'asr' | 'ui' | 'timed' | 'wpm' | 'hybrid' | 'step';
export type ScrollIntentKind = 'seek_block' | 'hold' | 'stop';

export interface ScrollIntent {
  source: ScrollIntentSource;
  kind: ScrollIntentKind;
  ts: number;
  target?: { blockIdx?: number };
  confidence?: number;
  reason?: string;
}
