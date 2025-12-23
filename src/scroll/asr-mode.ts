/**
 * ASR Alignment Engine (Phase 4.4)
 *
 * Responsibilities:
 * - Listen for cleaned ASR text fragments (delivered externally).
 * - Match each fragment to script lines.
 * - Compute best line index (shallow fuzzy match for now).
 * - Request alignment via scrollBrain.centerOnLine().
 *
 * Non-responsibilities:
 * - No continuous scrolling.
 * - No px-based motion (uses brain only).
 * - No mode selection (mode-router decides enable/disable).
 * - No ASR start/stop (speech-loader handles that).
 * - No DOM.
 * - No WPM/timed/step/hybrid logic.
 */

import type { ScrollBrain } from './scroll-brain';

export interface AsrAlignmentEngine {
  enable(): void;
  disable(): void;
  onAsrText(fragment: string): void; // external module pushes cleaned text
}

export function createAsrAlignmentEngine(
  scrollBrain: ScrollBrain,
  getScriptLines: () => string[],
): AsrAlignmentEngine {
  let enabled = false;
  let lastMatchIndex = 0;

  // Simple fuzzy scorer: counts how many words in frag appear in line.
  function scoreLine(line: string, fragWords: string[]): number {
    let score = 0;
    const lower = line.toLowerCase();
    for (const w of fragWords) {
      if (lower.includes(w)) score++;
    }
    return score;
  }

  function findBestLine(fragment: string): number | null {
    const lines = getScriptLines();
    if (!lines || !lines.length) return null;

    const fragWords = fragment
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (fragWords.length === 0) return null;

    const windowSize = 20;
    const start = Math.max(0, lastMatchIndex - windowSize);
    const end = Math.min(lines.length - 1, lastMatchIndex + windowSize);

    let bestIndex = -1;
    let bestScore = 0;

    for (let i = start; i <= end; i++) {
      const s = scoreLine(lines[i], fragWords);
      if (s > bestScore) {
        bestScore = s;
        bestIndex = i;
      }
    }

    return bestIndex >= 0 ? bestIndex : null;
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    lastMatchIndex = 0;
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
  }

  function onAsrText(fragment: string) {
    if (!enabled) return;
    if (!fragment || typeof fragment !== 'string') return;
    const idx = findBestLine(fragment);
    if (idx != null) {
      lastMatchIndex = idx;
      scrollBrain.centerOnLine(idx);
    }
  }

  return { enable, disable, onAsrText };
}

export default createAsrAlignmentEngine;
