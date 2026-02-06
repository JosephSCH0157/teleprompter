export type AsrThresholds = {
  candidateMinSim: number;
  commitFinalMinSim: number;
  commitInterimMinSim: number;
  stickinessDelta: number;
  interimStreakNeeded: number;
  maxJumpsPerSecond: number;
  tieDelta: number;
  anchorMinSim: number;
  maxAnchorJumpLines: number;
  anchorStreakNeeded: number;
  maxLinesPerCommit: number;
  deltaSmoothingFactor: number;
  taperExponent: number;
  taperMin: number;
  glideMinMs: number;
  glideMaxMs: number;
  glideDefaultMs: number;
  microDeltaLineRatio: number;
  microPursuitMs: number;
  microPursuitMaxPxPerSec: number;
  minPursuitPxPerSec: number;
};

export const DEFAULT_ASR_THRESHOLDS: AsrThresholds = {
  candidateMinSim: 0.55,
  commitFinalMinSim: 0.22,
  commitInterimMinSim: 0.18,
  stickinessDelta: 0.08,
  interimStreakNeeded: 2,
  maxJumpsPerSecond: 4,
  tieDelta: 0.05,
  anchorMinSim: 0.7,
  maxAnchorJumpLines: 60,
  anchorStreakNeeded: 2,
  maxLinesPerCommit: 1.25,
  deltaSmoothingFactor: 0.3,
  taperExponent: 2.2,
  taperMin: 0.15,
  glideMinMs: 120,
  glideMaxMs: 250,
  glideDefaultMs: 180,
  microDeltaLineRatio: 0.8,
  microPursuitMs: 320,
  microPursuitMaxPxPerSec: 60,
  minPursuitPxPerSec: 18,
};

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function normalizeThresholds(thresholds: AsrThresholds): AsrThresholds {
  const glideMinMs = Math.max(50, Math.floor(thresholds.glideMinMs || DEFAULT_ASR_THRESHOLDS.glideMinMs));
  const glideMaxMs = Math.max(glideMinMs, Math.floor(thresholds.glideMaxMs || DEFAULT_ASR_THRESHOLDS.glideMaxMs));
  const glideDefaultMs = Math.max(
    glideMinMs,
    Math.min(
      glideMaxMs,
      Math.floor(thresholds.glideDefaultMs || DEFAULT_ASR_THRESHOLDS.glideDefaultMs),
    ),
  );
  return {
    ...thresholds,
    candidateMinSim: clamp01(thresholds.candidateMinSim),
    commitFinalMinSim: clamp01(thresholds.commitFinalMinSim),
    commitInterimMinSim: clamp01(thresholds.commitInterimMinSim),
    stickinessDelta: clamp01(thresholds.stickinessDelta),
    interimStreakNeeded: Math.max(1, Math.floor(thresholds.interimStreakNeeded || 1)),
    maxJumpsPerSecond: Math.max(1, Math.floor(thresholds.maxJumpsPerSecond || 1)),
    tieDelta: clamp01(thresholds.tieDelta),
    anchorMinSim: clamp01(thresholds.anchorMinSim),
    maxAnchorJumpLines: Math.max(1, Math.floor(thresholds.maxAnchorJumpLines || 1)),
    anchorStreakNeeded: Math.max(1, Math.floor(thresholds.anchorStreakNeeded || 1)),
    maxLinesPerCommit: Math.max(0.1, Number(thresholds.maxLinesPerCommit || DEFAULT_ASR_THRESHOLDS.maxLinesPerCommit)),
    deltaSmoothingFactor: clamp01(thresholds.deltaSmoothingFactor),
    taperExponent: Math.max(0.5, Math.min(5, Number(thresholds.taperExponent || DEFAULT_ASR_THRESHOLDS.taperExponent))),
    taperMin: clamp01(thresholds.taperMin),
    glideMinMs,
    glideMaxMs,
    glideDefaultMs,
    microDeltaLineRatio: Math.max(0.1, Math.min(2, Number(thresholds.microDeltaLineRatio || DEFAULT_ASR_THRESHOLDS.microDeltaLineRatio))),
    microPursuitMs: Math.max(100, Math.min(800, Math.floor(thresholds.microPursuitMs || DEFAULT_ASR_THRESHOLDS.microPursuitMs))),
    microPursuitMaxPxPerSec: Math.max(5, Math.min(400, Number(thresholds.microPursuitMaxPxPerSec || DEFAULT_ASR_THRESHOLDS.microPursuitMaxPxPerSec))),
    minPursuitPxPerSec: Math.max(0, Math.min(200, Number(thresholds.minPursuitPxPerSec || DEFAULT_ASR_THRESHOLDS.minPursuitPxPerSec))),
  };
}
