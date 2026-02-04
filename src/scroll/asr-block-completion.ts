// ASR block completion contract (router-owned).
// This encodes a semantic invariant, not a heuristic; enforcement occurs in the router.

export type CompletionEvidence = {
  currentBlockIdx: number;
  candidateBlockIdx: number;
  matchedLineIds: number[]; // line indices within current block matched in the evidence window
  totalLinesInBlock: number; // count of line elements within current block
  matchedLastLine: boolean; // did we match the last line of current block?
  matchedTrailingLines: number; // how many of the last N lines are matched (N defaults to 3)
  coverageRatio: number; // 0..1
  boundaryCrossed: boolean; // evidence of speech entering candidate block
  hasFinal: boolean; // final evidence exists in the window
};

export type CompletionDecision =
  | { ok: true; reason: "complete"; confidence: number }
  | {
      ok: false;
      reason:
        | "incomplete_last_line"
        | "incomplete_coverage"
        | "no_boundary"
        | "not_final"
        | "insufficient_evidence";
    };

export type CompletionPolicy = {
  minCoverageFinal: number; // e.g. 0.70
  minCoverageNoFinal: number; // e.g. 0.85
  trailingLinesWindow: number; // e.g. 3
  minTrailingLinesMatched: number; // e.g. 2
  requireBoundaryCross: boolean; // default false for now (keep conservative)
};

export const DEFAULT_COMPLETION_POLICY: CompletionPolicy = {
  minCoverageFinal: 0.7,
  minCoverageNoFinal: 0.85,
  trailingLinesWindow: 3,
  minTrailingLinesMatched: 2,
  requireBoundaryCross: false,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function decideBlockCompletion(
  e: CompletionEvidence,
  policy: Partial<CompletionPolicy> = {},
): CompletionDecision {
  const resolved: CompletionPolicy = { ...DEFAULT_COMPLETION_POLICY, ...policy };
  const totalLines = Number.isFinite(e.totalLinesInBlock) ? e.totalLinesInBlock : 0;
  if (totalLines <= 0) return { ok: false, reason: "insufficient_evidence" };
  if (resolved.requireBoundaryCross && !e.boundaryCrossed) {
    return { ok: false, reason: "no_boundary" };
  }

  const coverage = clamp01(Number(e.coverageRatio) || 0);
  const trailingMatched = Number.isFinite(e.matchedTrailingLines) ? e.matchedTrailingLines : 0;

  if (!e.hasFinal) {
    if (coverage >= resolved.minCoverageNoFinal) {
      const confidence = clamp01(coverage);
      return { ok: true, reason: "complete", confidence };
    }
    return { ok: false, reason: "not_final" };
  }

  if (e.matchedLastLine) {
    let confidence = clamp01(coverage + 0.2);
    if (trailingMatched >= resolved.minTrailingLinesMatched) confidence = clamp01(confidence + 0.1);
    return { ok: true, reason: "complete", confidence };
  }
  if (trailingMatched >= resolved.minTrailingLinesMatched) {
    const confidence = clamp01(coverage + 0.1);
    return { ok: true, reason: "complete", confidence };
  }
  if (coverage >= resolved.minCoverageFinal) {
    const confidence = clamp01(coverage);
    return { ok: true, reason: "complete", confidence };
  }

  if (trailingMatched <= 0) {
    return { ok: false, reason: "incomplete_last_line" };
  }
  return { ok: false, reason: "incomplete_coverage" };
}

// Dev-only self-check (example):
// decideBlockCompletion(
//   {
//     currentBlockIdx: 12,
//     candidateBlockIdx: 13,
//     matchedLineIds: [0, 1, 2],
//     totalLinesInBlock: 4,
//     matchedLastLine: true,
//     matchedTrailingLines: 2,
//     coverageRatio: 0.78,
//     boundaryCrossed: true,
//     hasFinal: true,
//   },
//   { minCoverageFinal: 0.7 },
// );
