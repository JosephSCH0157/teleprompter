export interface AsrBlockMetaV1 {
  schemaVersion: 1;
  blockCount: number;
  createdAt: number;
  source: 'render';
  units: Array<{
    blockIdx: number;
    unitStart: number;
    unitEnd: number;
    sentenceCount: number;
    charCount: number;
  }>;
  warnings?: string[];
}

export type AsrBlockUnit = {
  textNorm: string;
  sentenceCount: number;
  charCount: number;
};

export const ASR_MIN_SENTENCES_PER_BLOCK = 2;
export const ASR_MAX_SENTENCES_PER_BLOCK = 4;
export const ASR_MIN_CHARS_PER_BLOCK = 80;
export const ASR_MAX_CHARS_PER_BLOCK = 400;
