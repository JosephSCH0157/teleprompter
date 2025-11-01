export type AsrProfileId = string; // `${deviceId}::${roomAlias}`
export type RoomAlias = 'Studio A' | 'Desk' | 'On-Cam' | string;

export type CaptureFlags = {
  sampleRateHz: 48000 | 44100 | number;
  channelCount: 1;                 // force mono
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  deviceId: string;                // MediaDeviceInfo.deviceId
};

export type CalMetrics = {
  noiseRmsDbfs: number;            // Silence RMS
  noisePeakDbfs: number;
  speechRmsDbfs: number;           // Speech RMS
  speechPeakDbfs: number;
  snrDb: number;                   // speechRmsDbfs - noiseRmsDbfs
};

export type VadThresholds = {
  tonDb: number;                   // VAD on threshold
  toffDb: number;                  // VAD off threshold (hysteresis)
  attackMs: number;                // gate-on min duration
  releaseMs: number;               // gate-off min duration
};

export type FrontEndFilters = {
  hpfHz?: number;                  // e.g. 80
  mainsNotchHz?: 50 | 60 | null;   // add when detected
  limiterDbfs?: -3;                // soft-clip guard
};

export type AsrProfile = {
  id: AsrProfileId;
  label: RoomAlias;                // e.g. "Studio A • MV7 • no AEC"
  capture: CaptureFlags;
  cal: CalMetrics;
  vad: VadThresholds;
  filters: FrontEndFilters;
  createdAt: number;
  updatedAt: number;
  notes?: string;
};

export type AsrState = {
  activeProfileId?: AsrProfileId;
  profiles: Record<AsrProfileId, AsrProfile>;
  lastDeviceId?: string;
};
