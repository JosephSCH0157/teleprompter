// Speaker Profiles
// - Optional: may be absent (feature-flag / future)
// - Persistent heuristics only (NO biometrics, NO voiceprints)
// - Read-only inputs at session start; updates happen only on session end.

export type SpeakerSlot = "s1" | "s2";

export type SpeakerHeuristics = {
  // Keep this intentionally vague/extendable.
  // Examples (optional): preferredWpm, pauseBias, relockSimFloor, backtrackTolerance, etc.
  // Use only derived session stats / tuning knobs, never biometric identifiers.
  [key: string]: unknown;
};

export interface SpeakerProfile {
  id: string; // stable UUID
  name: string; // user-visible label
  createdAt: number; // epoch ms
  lastUsedAt?: number; // epoch ms (optional)

  // Heuristics/tuning derived from prior sessions (ASR + Hybrid),
  // explicitly NOT biometrics.
  heuristics: SpeakerHeuristics;
}

/**
 * Session binding: maps the chosen profile(s) to the live speaker slots.
 * IMPORTANT: treat this as immutable for the duration of a session.
 * Mapping rule: menu selection resolves at session start; any learning/tuning
 * writes go to a pending buffer and only commit on session end (or Save Session
 * / Stop Recording).
 */
export interface SessionSpeakerBinding {
  s1?: SpeakerProfile;
  s2?: SpeakerProfile;
}
