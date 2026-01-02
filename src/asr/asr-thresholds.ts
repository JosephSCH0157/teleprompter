export type AsrThresholds = {
  candidateMinSim: number;
  commitFinalMinSim: number;
  commitInterimMinSim: number;
  stickinessDelta: number;
  interimStreakNeeded: number;
  maxJumpsPerSecond: number;
  tieDelta: number;
};

export const DEFAULT_ASR_THRESHOLDS: AsrThresholds = {
  candidateMinSim: 0.46,
  commitFinalMinSim: 0.69,
  commitInterimMinSim: 0.77,
  stickinessDelta: 0.08,
  interimStreakNeeded: 2,
  maxJumpsPerSecond: 3,
  tieDelta: 0.05,
};

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function normalizeThresholds(thresholds: AsrThresholds): AsrThresholds {
  return {
    ...thresholds,
    candidateMinSim: clamp01(thresholds.candidateMinSim),
    commitFinalMinSim: clamp01(thresholds.commitFinalMinSim),
    commitInterimMinSim: clamp01(thresholds.commitInterimMinSim),
    stickinessDelta: clamp01(thresholds.stickinessDelta),
    interimStreakNeeded: Math.max(1, Math.floor(thresholds.interimStreakNeeded || 1)),
    maxJumpsPerSecond: Math.max(1, Math.floor(thresholds.maxJumpsPerSecond || 1)),
    tieDelta: clamp01(thresholds.tieDelta),
  };
}
