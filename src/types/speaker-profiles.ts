import type { AsrThresholds } from '../asr/asr-thresholds';

export type SpeakerSlot = 's1' | 's2' | 'g1' | 'g2';

export type SpeakerProfile = {
  id: string;
  name: string;
  note?: string;
  asrTweaks?: Partial<AsrThresholds>;
  system?: boolean;
};

export type SpeakerBindingsSettings = {
  s1?: string | null;
  s2?: string | null;
  g1?: string | null;
  g2?: string | null;
  activeSlot?: SpeakerSlot;
};
