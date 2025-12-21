import { matchBatch } from '../../speech/orchestrator';
import { speechStore } from '../../state/speech-store';
import { getAsrSettings } from '../speech/speech-store';

type DriverOptions = {
  /** Minimum forward line delta before issuing a seek. */
  minLineAdvance?: number;
  /** Minimum milliseconds between seeks (throttle) */
  seekThrottleMs?: number;
  /** Scale applied to the confidence threshold when processing interim results. */
  interimConfidenceScale?: number;
};

type PendingMatch = {
  line: number;
  conf: number;
  isFinal: boolean;
  hasEvidence: boolean;
};

export interface AsrScrollDriver {
  ingest(text: string, isFinal: boolean): void;
  dispose(): void;
  setLastLineIndex(index: number): void;
  getLastLineIndex(): number;
}

const DEFAULT_MIN_LINE_ADVANCE = 1;
const DEFAULT_SEEK_THROTTLE_MS = 120;
const DEFAULT_INTERIM_SCALE = 0.6;
const DEFAULT_MATCH_BACKTRACK_LINES = 2;
const DEFAULT_MATCH_LOOKAHEAD_LINES = 50;
const DEFAULT_SAME_LINE_THROTTLE_MS = 500;
const DEFAULT_CREEP_PX = 8;
const DEFAULT_CREEP_NEAR_PX = 28;
const DEFAULT_CREEP_BUDGET_PX = 40;
const DEFAULT_DEADBAND_PX = 32;
const DEFAULT_MAX_VEL_PX_PER_SEC = 110;
const DEFAULT_MAX_VEL_MED_PX_PER_SEC = 170;
const DEFAULT_MAX_VEL_CATCHUP_PX_PER_SEC = 240;
const DEFAULT_MAX_ACCEL_PX_PER_SEC2 = 800;
const DEFAULT_MIN_STEP_PX = 6;
const DEFAULT_MAX_STEP_PX = 10;
const DEFAULT_CATCHUP_MED_MIN_PX = 80;
const DEFAULT_CATCHUP_FAST_MIN_PX = 250;
const DEFAULT_MAX_TARGET_JUMP_PX = 120;
const DEFAULT_STRONG_WINDOW_MS = 700;
const DEFAULT_FINAL_EVIDENCE_LEAD_LINES = 2;
const DEFAULT_BACK_RECOVERY_MAX_PX = 15;
const DEFAULT_BACK_RECOVERY_COOLDOWN_MS = 5000;
const DEFAULT_BACK_RECOVERY_HIT_LIMIT = 2;
const DEFAULT_BACK_RECOVERY_WINDOW_MS = 1200;
const DEFAULT_BACK_RECOVERY_STRONG_CONF = 0.75;
const DEFAULT_REALIGN_LEAD_LINES = 6;
const DEFAULT_REALIGN_LOOKBACK_LINES = 3;
const DEFAULT_REALIGN_SIM = 0.7;
const DEFAULT_RESYNC_WINDOW_MS = 1600;
const DEFAULT_RESYNC_LOOKAHEAD_BONUS = 20;
const DEFAULT_RESYNC_COOLDOWN_MS = 2500;
const DEFAULT_STRONG_BACK_SIM = 0.92;
const DEFAULT_BACK_CONFIRM_HITS = 2;
const DEFAULT_BACK_CONFIRM_WINDOW_MS = 1300;
const DEFAULT_AMBIGUITY_SIM_DELTA = 0.06;
const DEFAULT_AMBIGUITY_NEAR_LINES = 6;
const DEFAULT_AMBIGUITY_FAR_LINES = 20;
const DEFAULT_OFFSCRIPT_LOW_SIM = 0.45;
const DEFAULT_OFFSCRIPT_LOW_SIM_HITS = 6;
const DEFAULT_OFFSCRIPT_NO_EVIDENCE_MS = 2000;
const DEFAULT_OFFSCRIPT_SCATTER_SIM = 0.6;
const DEFAULT_OFFSCRIPT_SCATTER_JUMP_LINES = 10;
const DEFAULT_OFFSCRIPT_SCATTER_HITS = 3;
const DEFAULT_OFFSCRIPT_RECOVER_SIM = 0.7;
const DEFAULT_OFFSCRIPT_RECOVER_HITS = 2;
const DEFAULT_OFFSCRIPT_RECOVER_BEHIND_LINES = 1;
const DEFAULT_OFFSCRIPT_CREEP_PX = 4;
const DEFAULT_OFFSCRIPT_CREEP_MS = 400;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function resolveThreshold(): number {
  try {
    const stored = getAsrSettings();
    if (typeof stored.threshold === 'number') {
      return clamp(stored.threshold, 0, 1);
    }
  } catch {
    // ignore
  }
  return 0.55;
}

function isDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__tpAsrScrollDebug) return true;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    if (w.localStorage?.getItem('tp_dev_mode') === '1') return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.has('dev') || params.has('debug')) return true;
    const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    if (hash === 'dev' || hash === 'dev=1' || hash.includes('dev=1')) return true;
  } catch {
    // ignore
  }
  return false;
}

function logDev(...args: any[]) {
  if (!isDevMode()) return;
  try {
    console.debug('[ASR→SCROLL]', ...args);
  } catch {
    // ignore
  }
}

function getScroller(): HTMLElement | null {
  return (
    (document.getElementById('viewer') as HTMLElement | null) ||
    (document.querySelector('[data-role="viewer"]') as HTMLElement | null)
  );
}

function resolveTargetTop(scroller: HTMLElement, lineIndex: number): number | null {
  if (!scroller) return null;
  const idx = Math.max(0, Math.floor(lineIndex));
  const line =
    scroller.querySelector<HTMLElement>(`.line[data-i="${idx}"]`) ||
    scroller.querySelector<HTMLElement>(`.line[data-index="${idx}"]`);
  if (!line) return null;
  const offset = Math.max(0, (scroller.clientHeight - line.offsetHeight) / 2);
  const raw = (line.offsetTop || 0) - offset;
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  return clamp(raw, 0, max);
}

export function createAsrScrollDriver(options: DriverOptions = {}): AsrScrollDriver {
  const minLineAdvance = Number.isFinite(options.minLineAdvance ?? DEFAULT_MIN_LINE_ADVANCE)
    ? Math.max(0, options.minLineAdvance ?? DEFAULT_MIN_LINE_ADVANCE)
    : DEFAULT_MIN_LINE_ADVANCE;
  const seekThrottleMs = Number.isFinite(options.seekThrottleMs ?? DEFAULT_SEEK_THROTTLE_MS)
    ? Math.max(0, options.seekThrottleMs ?? DEFAULT_SEEK_THROTTLE_MS)
    : DEFAULT_SEEK_THROTTLE_MS;
  const interimScale = Number.isFinite(options.interimConfidenceScale ?? DEFAULT_INTERIM_SCALE)
    ? clamp(options.interimConfidenceScale ?? DEFAULT_INTERIM_SCALE, 0, 1)
    : DEFAULT_INTERIM_SCALE;

  let threshold = resolveThreshold();
  let lastLineIndex = -1;
  let lastSeekTs = 0;
  let lastSameLineNudgeTs = 0;
  let lastMoveAt = 0;
  let lastIngestAt = 0;
  let disposed = false;
  let desyncWarned = false;
  let resyncUntil = 0;
  let resyncAnchorIdx: number | null = null;
  let matchAnchorIdx = -1;
  let targetTopPx: number | null = null;
  let appliedTopPx = 0;
  let velPxPerSec = 0;
  let lastTickAt = 0;
  let controllerActive = false;
  let lastEvidenceAt = 0;
  let lastBackRecoverAt = 0;
  let lastBackRecoverIdx = -1;
  let lastBackRecoverHitAt = 0;
  let backRecoverStreak = 0;
  let creepBudgetLine = -1;
  let creepBudgetUsed = 0;
  let offScript = false;
  let offScriptSince = 0;
  let lowSimStreak = 0;
  let scatterStreak = 0;
  let lastBestIdx = -1;
  let lastForwardEvidenceAt = 0;
  let offScriptRecoverStreak = 0;
  let lastOffScriptCreepAt = 0;
  let lastResyncAt = 0;
  let lastBehindStrongIdx = -1;
  let lastBehindStrongAt = 0;
  let behindStrongCount = 0;
  let pendingMatch: PendingMatch | null = null;
  let pendingRaf = 0;

  const matchBacktrackLines = DEFAULT_MATCH_BACKTRACK_LINES;
  const matchLookaheadLines = DEFAULT_MATCH_LOOKAHEAD_LINES;
  const sameLineThrottleMs = DEFAULT_SAME_LINE_THROTTLE_MS;
  const creepPx = DEFAULT_CREEP_PX;
  const creepNearPx = DEFAULT_CREEP_NEAR_PX;
  const creepBudgetPx = DEFAULT_CREEP_BUDGET_PX;
  const deadbandPx = DEFAULT_DEADBAND_PX;
  const maxVelPxPerSec = DEFAULT_MAX_VEL_PX_PER_SEC;
  const maxVelMedPxPerSec = DEFAULT_MAX_VEL_MED_PX_PER_SEC;
  const maxVelCatchupPxPerSec = DEFAULT_MAX_VEL_CATCHUP_PX_PER_SEC;
  const maxAccelPxPerSec2 = DEFAULT_MAX_ACCEL_PX_PER_SEC2;
  const minStepPx = DEFAULT_MIN_STEP_PX;
  const maxStepPx = Math.max(DEFAULT_MAX_STEP_PX, minStepPx);
  const catchupMedMinPx = DEFAULT_CATCHUP_MED_MIN_PX;
  const catchupFastMinPx = DEFAULT_CATCHUP_FAST_MIN_PX;
  const maxTargetJumpPx = DEFAULT_MAX_TARGET_JUMP_PX;
  const strongWindowMs = DEFAULT_STRONG_WINDOW_MS;
  const finalEvidenceLeadLines = DEFAULT_FINAL_EVIDENCE_LEAD_LINES;
  const backRecoverMaxPx = DEFAULT_BACK_RECOVERY_MAX_PX;
  const backRecoverCooldownMs = DEFAULT_BACK_RECOVERY_COOLDOWN_MS;
  const backRecoverHitLimit = DEFAULT_BACK_RECOVERY_HIT_LIMIT;
  const backRecoverWindowMs = DEFAULT_BACK_RECOVERY_WINDOW_MS;
  const backRecoverStrongConf = DEFAULT_BACK_RECOVERY_STRONG_CONF;
  const realignLeadLines = DEFAULT_REALIGN_LEAD_LINES;
  const realignLookbackLines = DEFAULT_REALIGN_LOOKBACK_LINES;
  const realignSim = DEFAULT_REALIGN_SIM;
  const resyncWindowMs = DEFAULT_RESYNC_WINDOW_MS;
  const resyncLookaheadBonus = DEFAULT_RESYNC_LOOKAHEAD_BONUS;
  const resyncCooldownMs = DEFAULT_RESYNC_COOLDOWN_MS;
  const strongBackSim = DEFAULT_STRONG_BACK_SIM;
  const backConfirmHits = DEFAULT_BACK_CONFIRM_HITS;
  const backConfirmWindowMs = DEFAULT_BACK_CONFIRM_WINDOW_MS;
  const offScriptLowSim = DEFAULT_OFFSCRIPT_LOW_SIM;
  const offScriptLowSimHits = DEFAULT_OFFSCRIPT_LOW_SIM_HITS;
  const offScriptNoEvidenceMs = DEFAULT_OFFSCRIPT_NO_EVIDENCE_MS;
  const offScriptScatterSim = DEFAULT_OFFSCRIPT_SCATTER_SIM;
  const offScriptScatterJumpLines = DEFAULT_OFFSCRIPT_SCATTER_JUMP_LINES;
  const offScriptScatterHits = DEFAULT_OFFSCRIPT_SCATTER_HITS;
  const offScriptRecoverSim = DEFAULT_OFFSCRIPT_RECOVER_SIM;
  const offScriptRecoverHits = DEFAULT_OFFSCRIPT_RECOVER_HITS;
  const offScriptRecoverBehindLines = DEFAULT_OFFSCRIPT_RECOVER_BEHIND_LINES;
  const offScriptCreepPx = DEFAULT_OFFSCRIPT_CREEP_PX;
  const offScriptCreepMs = DEFAULT_OFFSCRIPT_CREEP_MS;
  const ambiguitySimDelta = DEFAULT_AMBIGUITY_SIM_DELTA;
  const ambiguityNearLines = DEFAULT_AMBIGUITY_NEAR_LINES;
  const ambiguityFarLines = DEFAULT_AMBIGUITY_FAR_LINES;
  const strongHits: Array<{ ts: number; idx: number; conf: number; isFinal: boolean }> = [];

  const unsubscribe = speechStore.subscribe((state) => {
    if (disposed) return;
    if (typeof state.threshold === 'number') {
      threshold = clamp(state.threshold, 0, 1);
    }
  });

  const syncMatchAnchor = (idx: number) => {
    if (!Number.isFinite(idx)) return;
    const next = Math.max(0, Math.floor(idx));
    matchAnchorIdx = matchAnchorIdx >= 0 ? Math.max(matchAnchorIdx, next) : next;
    try { (window as any).currentIndex = matchAnchorIdx; } catch {}
  };

  const updateDebugState = (tag: string) => {
    if (!isDevMode()) return;
    try {
      (window as any).__tpAsrScrollState = {
        tag,
        lastIngestAt,
        lastEvidenceAt,
        pendingEvidenceCount: strongHits.length,
        cursorLineIndex: lastLineIndex,
        matchAnchorIdx,
        targetTopPx,
        appliedTopPx,
        lastMoveAt,
        offScript,
        offScriptSince,
      };
    } catch {}
  };

  const freezeMotion = () => {
    velPxPerSec = 0;
    controllerActive = false;
    targetTopPx = null;
  };

  const enterOffScript = (now: number, reason: string) => {
    if (offScript) return;
    offScript = true;
    offScriptSince = now;
    offScriptRecoverStreak = 0;
    if (pendingRaf) {
      try { cancelAnimationFrame(pendingRaf); } catch {}
      pendingRaf = 0;
    }
    pendingMatch = null;
    freezeMotion();
    logDev('off-script enter', { reason });
    updateDebugState('off-script');
  };

  const exitOffScript = (now: number, reason: string) => {
    if (!offScript) return;
    offScript = false;
    offScriptSince = 0;
    lowSimStreak = 0;
    scatterStreak = 0;
    offScriptRecoverStreak = 0;
    lastOffScriptCreepAt = now;
    logDev('off-script exit', { reason });
    updateDebugState('off-script-exit');
  };

  const maybeOffScriptCreep = (scroller: HTMLElement, now: number) => {
    if (offScriptCreepPx <= 0 || offScriptCreepMs <= 0) return;
    if (now - lastOffScriptCreepAt < offScriptCreepMs) return;
    const current = scroller.scrollTop || 0;
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const next = clamp(current + offScriptCreepPx, 0, max);
    if (next > current) {
      scroller.scrollTop = next;
      lastMoveAt = Date.now();
      lastOffScriptCreepAt = now;
    }
  };

  const resolveMaxVel = (errPx: number) => {
    if (errPx >= catchupFastMinPx) return maxVelCatchupPxPerSec;
    if (errPx >= catchupMedMinPx) return maxVelMedPxPerSec;
    return maxVelPxPerSec;
  };

  const tickController = () => {
    if (!controllerActive || disposed) return;
    const scroller = getScroller();
    if (!scroller) {
      controllerActive = false;
      return;
    }

    const now = performance.now();
    const dt = Math.max(0.001, (now - (lastTickAt || now)) / 1000);
    lastTickAt = now;

    const current = scroller.scrollTop || 0;
    appliedTopPx = current;
    if (targetTopPx == null) {
      velPxPerSec = 0;
      controllerActive = false;
      return;
    }

    if (targetTopPx < current) {
      targetTopPx = current;
    }

    const err = targetTopPx - current;
    if (err <= deadbandPx) {
      velPxPerSec = 0;
      window.requestAnimationFrame(tickController);
      return;
    }

    const maxVelForErr = resolveMaxVel(err);
    if (velPxPerSec > maxVelForErr) {
      velPxPerSec = maxVelForErr;
    }
    velPxPerSec = Math.min(maxVelForErr, velPxPerSec + maxAccelPxPerSec2 * dt);
    let move = velPxPerSec * dt;
    move = Math.max(minStepPx, move);
    move = Math.min(err, move, maxStepPx);

    if (move > 0) {
      scroller.scrollTop = current + move;
      lastMoveAt = Date.now();
    }
    window.requestAnimationFrame(tickController);
  };

  const ensureControllerActive = () => {
    if (controllerActive) return;
    controllerActive = true;
    lastTickAt = performance.now();
    window.requestAnimationFrame(tickController);
  };

  const schedulePending = () => {
    if (pendingRaf) return;
    pendingRaf = window.requestAnimationFrame(() => {
      pendingRaf = 0;
      if (disposed) return;
      const pending = pendingMatch;
      if (!pending) return;
      pendingMatch = null;

      const scroller = getScroller();
      if (!scroller) return;
      if (offScript) return;

      const now = Date.now();
      const { line, conf, isFinal, hasEvidence } = pending;
      const requiredThreshold = isFinal ? threshold : Math.max(0, threshold * interimScale);
      const strongMatch = conf >= requiredThreshold;
      if (!strongMatch) return;

      const targetLine = Math.max(0, Math.floor(line));
      const targetTop = resolveTargetTop(scroller, targetLine);
      const currentTop = scroller.scrollTop || 0;
      const deltaPx = targetTop != null ? targetTop - currentTop : 0;

      if (targetTop == null) return;

      if (targetLine <= lastLineIndex) {
        if (targetLine === lastLineIndex) {
          if (deltaPx < 0 || deltaPx > creepNearPx) return;
          if (now - lastSameLineNudgeTs >= sameLineThrottleMs) {
            if (creepBudgetLine !== targetLine) {
              creepBudgetLine = targetLine;
              creepBudgetUsed = 0;
            }
            if (creepBudgetUsed >= creepBudgetPx) return;
            const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
            const base = targetTopPx == null ? currentTop : targetTopPx;
            const creepStep = Math.min(creepPx, creepBudgetPx - creepBudgetUsed);
            const creepTarget = clamp(base + creepStep, 0, max);
            const limitedTarget = Math.min(creepTarget, base + maxTargetJumpPx);
            if (limitedTarget > base) {
              targetTopPx = limitedTarget;
              lastSameLineNudgeTs = now;
              lastEvidenceAt = now;
              creepBudgetUsed += Math.max(0, limitedTarget - base);
              ensureControllerActive();
              logDev('same-line creep', { line: targetLine, px: creepStep, conf });
              updateDebugState('same-line-creep');
            }
          }
          return;
        }

        const strongBack = conf >= Math.max(backRecoverStrongConf, requiredThreshold);
        if (isFinal && strongBack && deltaPx < 0 && Math.abs(deltaPx) <= backRecoverMaxPx) {
          if (Math.abs(targetLine - lastBackRecoverIdx) <= 1 && now - lastBackRecoverHitAt <= backRecoverWindowMs) {
            backRecoverStreak += 1;
          } else {
            backRecoverStreak = 1;
          }
          lastBackRecoverIdx = targetLine;
          lastBackRecoverHitAt = now;
          if (backRecoverStreak >= backRecoverHitLimit && now - lastBackRecoverAt >= backRecoverCooldownMs) {
            scroller.scrollTop = currentTop + deltaPx;
            lastMoveAt = Date.now();
            lastBackRecoverAt = now;
            backRecoverStreak = 0;
            logDev('back-recovery nudge', { px: deltaPx, conf, line: targetLine });
            updateDebugState('back-recovery');
          }
        } else {
          backRecoverStreak = 0;
        }
        return;
      }

      if (!hasEvidence) {
        return;
      }

      if (targetLine - lastLineIndex < minLineAdvance) return;
      if (now - lastSeekTs < seekThrottleMs) return;

      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const base = targetTopPx == null ? currentTop : targetTopPx;
      const candidate = clamp(targetTop, 0, max);
      const limitedTarget = Math.min(candidate, base + maxTargetJumpPx);
      targetTopPx = Math.max(base, limitedTarget);
      lastLineIndex = Math.max(lastLineIndex, targetLine);
      creepBudgetLine = -1;
      creepBudgetUsed = 0;
      lastSeekTs = now;
      lastEvidenceAt = now;
      try { (window as any).currentIndex = lastLineIndex; } catch {}
      ensureControllerActive();
      logDev('target update', { line: targetLine, conf, pxDelta: deltaPx, targetTop: targetTopPx });
      updateDebugState('target-update');
    });
  };

  const ingest = (text: string, isFinal: boolean) => {
    if (disposed) return;
    const normalized = String(text || '').trim();
    if (!normalized) return;
    const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
    const now = Date.now();
    lastIngestAt = now;
    updateDebugState('ingest');

    const anchorIdx = matchAnchorIdx >= 0
      ? matchAnchorIdx
      : (lastLineIndex >= 0 ? lastLineIndex : Number((window as any)?.currentIndex ?? 0));
    const resyncActive = now < resyncUntil && Number.isFinite(resyncAnchorIdx ?? NaN);
    const effectiveAnchor = resyncActive
      ? Math.max(0, Math.floor(resyncAnchorIdx as number))
      : Math.max(0, Math.floor(anchorIdx));
    try { (window as any).currentIndex = effectiveAnchor; } catch {}

    const match = matchBatch(normalized, !!isFinal, {
      currentIndex: effectiveAnchor,
      windowBack: matchBacktrackLines,
      windowAhead: resyncActive ? matchLookaheadLines + resyncLookaheadBonus : matchLookaheadLines,
    });
    if (!match) return;
    const rawIdx = Number(match.bestIdx);
    const conf = Number.isFinite(match.bestSim) ? match.bestSim : 0;
    const requiredThreshold = isFinal ? threshold : Math.max(0, threshold * interimScale);
    const currentIdx = Number((window as any)?.currentIndex ?? -1);
    if (!Number.isFinite(rawIdx)) return;

    const cursorLine = lastLineIndex >= 0 ? lastLineIndex : effectiveAnchor;
    if (conf < offScriptLowSim) {
      lowSimStreak += 1;
    } else {
      lowSimStreak = 0;
    }
    const jump = lastBestIdx >= 0 ? Math.abs(rawIdx - lastBestIdx) : 0;
    if (conf < offScriptScatterSim && jump >= offScriptScatterJumpLines) {
      scatterStreak += 1;
    } else {
      scatterStreak = 0;
    }
    lastBestIdx = rawIdx;
    if (conf >= requiredThreshold && rawIdx >= cursorLine - offScriptRecoverBehindLines) {
      lastForwardEvidenceAt = now;
    }

    const noForwardEvidence =
      lastForwardEvidenceAt > 0 && now - lastForwardEvidenceAt >= offScriptNoEvidenceMs;
    if (!offScript && (lowSimStreak >= offScriptLowSimHits || noForwardEvidence || scatterStreak >= offScriptScatterHits)) {
      const reason = lowSimStreak >= offScriptLowSimHits
        ? 'low-sim'
        : (noForwardEvidence ? 'no-forward' : 'scatter');
      enterOffScript(now, reason);
      const scroller = getScroller();
      if (scroller) maybeOffScriptCreep(scroller, now);
      return;
    }
    if (offScript) {
      const recoverEligible =
        conf >= offScriptRecoverSim && rawIdx >= cursorLine - offScriptRecoverBehindLines;
      if (recoverEligible) {
        offScriptRecoverStreak += 1;
      } else {
        offScriptRecoverStreak = 0;
      }
      if (offScriptRecoverStreak < offScriptRecoverHits) {
        const scroller = getScroller();
        if (scroller) maybeOffScriptCreep(scroller, now);
        return;
      }
      exitOffScript(now, 'recover');
    }

    const topScores = Array.isArray(match.topScores) ? match.topScores : [];
    if (topScores.length >= 2) {
      let near: { idx: number; score: number; dist: number } | null = null;
      let far: { idx: number; score: number; dist: number } | null = null;
      for (const entry of topScores) {
        const idx = Number(entry.idx);
        const score = Number(entry.score);
        if (!Number.isFinite(idx) || !Number.isFinite(score)) continue;
        const dist = Math.abs(idx - cursorLine);
        if (dist <= ambiguityNearLines && (!near || score > near.score)) {
          near = { idx, score, dist };
        }
        if (dist >= ambiguityFarLines && (!far || score > far.score)) {
          far = { idx, score, dist };
        }
      }
      if (near && far && Math.abs(near.score - far.score) <= ambiguitySimDelta) {
        logDev('ambiguous match', { near, far, cursorLine });
        return;
      }
    }

    const behindBy = cursorLine - rawIdx;
    if (behindBy > 0) {
      const strongBehind = conf >= Math.max(strongBackSim, requiredThreshold);
      if (strongBehind) {
        if (
          Math.abs(rawIdx - lastBehindStrongIdx) <= 1 &&
          now - lastBehindStrongAt <= backConfirmWindowMs
        ) {
          behindStrongCount += 1;
        } else {
          behindStrongCount = 1;
        }
        lastBehindStrongIdx = rawIdx;
        lastBehindStrongAt = now;
      } else {
        behindStrongCount = 0;
      }
      if (!strongBehind || behindStrongCount < backConfirmHits) {
        logDev('behind match ignored', { line: rawIdx, conf, cursorLine, isFinal });
        return;
      }
    } else {
      behindStrongCount = 0;
    }

    const aheadBy = rawIdx - cursorLine;
    if (aheadBy >= realignLeadLines && conf >= realignSim) {
      if (now - lastResyncAt >= resyncCooldownMs) {
        resyncUntil = now + resyncWindowMs;
        resyncAnchorIdx = Math.max(0, Math.floor(rawIdx - realignLookbackLines));
        lastResyncAt = now;
        if (!desyncWarned) {
          desyncWarned = true;
          try { console.warn('[ASR] realigning matcher window', { targetLine: rawIdx, lastLineIndex, currentIndex: currentIdx }); } catch {}
        }
        logDev('realign matcher window', { anchor: resyncAnchorIdx, windowAhead: matchLookaheadLines + resyncLookaheadBonus });
      }
    }

    if (requiredThreshold > 0 && conf < requiredThreshold) {
      return;
    }
    if (tokenCount === 0) return;

    strongHits.push({ ts: now, idx: rawIdx, conf, isFinal });
    while (strongHits.length && strongHits[0].ts < now - strongWindowMs) {
      strongHits.shift();
    }
    syncMatchAnchor(rawIdx);
    updateDebugState('strong-hit');
    let hasPairEvidence = false;
    if (strongHits.length >= 2) {
      const a = strongHits[strongHits.length - 1];
      const b = strongHits[strongHits.length - 2];
      if (Math.abs(a.idx - b.idx) <= 1 && a.idx >= cursorLine + minLineAdvance && b.idx >= cursorLine + minLineAdvance) {
        hasPairEvidence = true;
      }
    }
    const hasEvidence =
      hasPairEvidence ||
      (isFinal && rawIdx >= cursorLine + finalEvidenceLeadLines);
    pendingMatch = {
      line: Math.max(0, Math.floor(rawIdx)),
      conf,
      isFinal,
      hasEvidence,
    };
    schedulePending();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      unsubscribe();
    } catch {
      // ignore
    }
  };

  const setLastLineIndex = (index: number) => {
    if (!Number.isFinite(index)) return;
    lastLineIndex = Math.max(0, Math.floor(index));
    lastSeekTs = 0;
    lastSameLineNudgeTs = 0;
    lastMoveAt = 0;
    lastIngestAt = 0;
    matchAnchorIdx = lastLineIndex;
    targetTopPx = null;
    velPxPerSec = 0;
    controllerActive = false;
    lastEvidenceAt = 0;
    lastBackRecoverAt = 0;
    lastBackRecoverIdx = -1;
    lastBackRecoverHitAt = 0;
    backRecoverStreak = 0;
    creepBudgetLine = -1;
    creepBudgetUsed = 0;
    offScript = false;
    offScriptSince = 0;
    lowSimStreak = 0;
    scatterStreak = 0;
    lastBestIdx = -1;
    lastForwardEvidenceAt = 0;
    offScriptRecoverStreak = 0;
    lastOffScriptCreepAt = 0;
    lastResyncAt = 0;
    lastBehindStrongIdx = -1;
    lastBehindStrongAt = 0;
    behindStrongCount = 0;
    strongHits.length = 0;
    try { (window as any).currentIndex = lastLineIndex; } catch {}
    updateDebugState('sync-index');
  };
  const getLastLineIndex = () => lastLineIndex;

  return { ingest, dispose, setLastLineIndex, getLastLineIndex };
}
