// @ts-nocheck
export {};

import { getScrollWriter, seekToBlockAnimated } from '../../../scroll/scroll-writer';
import { onScrollIntent } from '../../../scroll/scroll-intent-bus';
import { getViewportMetrics, computeAnchorLineIndex } from '../../../scroll/scroll-helpers';
import { getAsrBlockElements } from '../../../scroll/asr-block-store';
import { applyCanonicalScrollTop, getScrollerEl } from '../../../scroll/scroller';
import {
  DEFAULT_COMPLETION_POLICY,
  decideBlockCompletion,
  type CompletionEvidence,
} from '../../../scroll/asr-block-completion';
import { createTimedEngine } from '../../../scroll/autoscroll';
import { getScrollBrain } from '../../../scroll/brain-access';
import { createHybridWpmMotor } from '../hybrid-wpm-motor';
import { persistStoredAutoEnabled } from '../auto-state';
import { appStore } from '../../../state/app-store';
import type { DeepPartial, TpProfileV1 } from '../../../profile/profile-schema';
import { ProfileStore } from '../../../profile/profile-store';
import { createProfilePersister } from '../../../profile/profile-persist';
import { supabase, hasSupabaseConfig } from '../../../forge/supabaseClient';
import { hasActiveAsrProfile } from '../../../asr/store';
import { focusSidebarCalibrationSelect } from '../../../media/calibration-sidebar';
import { showToast } from '../../../ui/toasts';
import { DEFAULT_SCRIPT_FONT_PX } from '../../../ui/typography-ssot';

const isDevMode = (() => {
  let cache: boolean | null = null;
  return () => {
    if (cache !== null) return cache;
    try {
      if (typeof window === 'undefined') {
        cache = false;
        return cache;
      }
      const params = new URLSearchParams(window.location.search || '');
      if (params.has('dev')) {
        cache = true;
        return cache;
      }
      if (params.has('ci') || params.has('mockFolder') || params.has('uiMock')) {
        cache = true;
        return cache;
      }
      const storage = window.localStorage;
      if (storage?.getItem('tp_dev_mode') === '1') {
        cache = true;
        return cache;
      }
      const w = window as any;
      if (w.__TP_DEV || w.__TP_DEV1) {
        cache = true;
        return cache;
      }
    } catch {
      // ignore
    }
    cache = false;
    return cache;
  };
})();
const ASR_COMPLETION_GATE_KEY = 'tp_asr_completion_gate';
let asrCompletionGateBypassLogged = false;
function isAsrCompletionGateEnabled(): boolean {
  if (!isDevMode()) return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    const devParam = params.has('dev') || params.get('dev') === '1';
    if (!devParam) return false;
    return localStorage.getItem(ASR_COMPLETION_GATE_KEY) === '1';
  } catch {
    return false;
  }
}

// --- Hybrid Aggro flag -------------------------------------------------------
function isHybridAggroEnabled(): boolean {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('hybridAggro') === '1') return true;
    if (window.location.hash && window.location.hash.includes('hybridAggro')) return true;
    if (localStorage.getItem('tp_hybrid_aggro') === '1') return true;
  } catch {
    // ignore
  }
  return false;
}

type ViewerRole = 'main' | 'display';
const viewerRole: ViewerRole = (() => {
  if (typeof window === 'undefined') return 'main';
  const path = String(window.location?.pathname || '').toLowerCase();
  const bodyRole = String(window.document?.body?.dataset?.viewerRole || '').toLowerCase();
  if (path.includes('display') || bodyRole === 'display') return 'display';
  return 'main';
})();
function isMainViewer() {
  return viewerRole === 'main';
}
function ensureMainViewer(action: string) {
  if (isMainViewer()) return true;
  try {
    console.warn('[ROLE_GUARD] blocked', { action, viewerRole });
  } catch {}
  return false;
}
try {
  console.info('[VIEWER_ROLE]', {
    viewerRole,
    path: typeof window !== 'undefined' ? window.location?.pathname : '<unknown>',
  });
} catch {}

;(globalThis as any).__tp_router_stamp = ((globalThis as any).__tp_router_stamp ?? 0) + 1;
try {
  console.warn('[ROUTER_STAMP]', (globalThis as any).__tp_router_stamp);
} catch {}
export const ROUTER_STAMP = (globalThis as any).__tp_router_stamp;

if (typeof window !== 'undefined') {
  try {
    (window as any).__tp_router_probe = 'scroll-router loaded';
    console.info('[router-probe] scroll-router loaded');
  } catch {
    // ignore
  }
}

const AUTO_INTENT_WIRE_STAMP = 'v2026-01-07c';
export const __AUTO_INTENT_WIRE_SENTINEL = 'scroll-router-wire-v1';
let autoIntentListenerWired = false;
let autoIntentProcessor: ((detail: any) => void) | null = null;
let pendingAutoIntentDetail: any | null = null;
let scrollerEl: HTMLElement | null = null;
let auto: any | null = null;
let scrollIntentListenerWired = false;
const ASR_INTENT_DEBOUNCE_MS = 450;
const ASR_INTENT_STABLE_MS = 250;
const ASR_INTENT_FIRST_STABLE_MS = 600;
const ASR_INTENT_WARMUP_MS = 1400;
const ASR_INTENT_MIN_CONF = 0.5;
const ASR_TELEMETRY_MAX_REJECTS = 200;
const ASR_TELEMETRY_WINDOW_MS = 15000;
const ASR_MATCH_WINDOW_MS = 3000;
const ASR_MATCH_MAX = 120;
let asrIntentLiveSince = 0;
let committedBlockIdx = -1;
let lastCommitAt = 0;
let lastCandidate = -1;
let stableSince = 0;
let asrMotorConflictLogged = false;
let scrollWriteWarned = false;
let markHybridOffScriptFn: (() => void) | null = null;
let guardHandlerErrorLogged = false;
let hybridScrollGraceListenerInstalled = false;
let hybridModeMismatchLogged = false;
let recentAsrMatches: Array<{
  ts: number;
  blockIdx: number;
  lineIdx: number | null;
  isFinal: boolean;
  confidence: number | null;
}> = [];
let asrBlockLineCacheRef: HTMLElement[] | null = null;
const asrBlockLineCache = new Map<number, number[]>();
function logHybridModeMismatch(source: string) {
  if (!isDevMode()) return;
  if (hybridModeMismatchLogged) return;
  hybridModeMismatchLogged = true;
  try {
    console.warn('[HYBRID] activity blocked (mode mismatch)', {
      source,
      mode: getScrollMode(),
    });
  } catch {}
}

type AsrTelemetryDecision = 'accept' | 'reject';
type AsrRejectEvent = { ts: number; reason: string };
type AsrTelemetryLast = {
  ts: number;
  mode: string;
  phase: string;
  currentBlockIdx: number;
  candidateBlockIdx: number;
  decision: AsrTelemetryDecision;
  rejectReason?: string;
  completionEvidenceSummary?: string;
  completionOk?: boolean;
  completionReason?: string;
  completionConfidence?: number;
};
type AsrTelemetry = {
  intentsSeen: number;
  finalSeen: number;
  interimSeen: number;
  commitAccepted: number;
  commitRejected: number;
  rejectReasons: Record<string, number>;
  last: AsrTelemetryLast;
  last15sRejectTop3: Array<{ reason: string; count: number }>;
  completionEvidence: CompletionEvidence | null;
  completionEvidenceSummary: string;
  _rejectEvents: AsrRejectEvent[];
};

function getAsrTelemetry(): AsrTelemetry | null {
  if (!isDevMode()) return null;
  if (typeof window === 'undefined') return null;
  const w = window as any;
  if (!w.__tpAsrTelemetry) {
    w.__tpAsrTelemetry = {
      intentsSeen: 0,
      finalSeen: 0,
      interimSeen: 0,
      commitAccepted: 0,
      commitRejected: 0,
      rejectReasons: {},
      last: {
        ts: 0,
        mode: 'unknown',
        phase: 'unknown',
        currentBlockIdx: -1,
        candidateBlockIdx: -1,
        decision: 'reject',
        rejectReason: 'init',
        completionEvidenceSummary: '',
      },
      last15sRejectTop3: [],
      completionEvidence: null,
      completionEvidenceSummary: '',
      _rejectEvents: [],
    } as AsrTelemetry;
  }
  return w.__tpAsrTelemetry as AsrTelemetry;
}

function resolveAsrIntentCandidateBlockIdx(intent: any): number {
  const raw = Number(intent?.target?.blockIdx);
  if (!Number.isFinite(raw)) return -1;
  return Math.max(0, Math.floor(raw));
}

function updateAsrTelemetryTopRejects(telemetry: AsrTelemetry, now: number) {
  const cutoff = now - ASR_TELEMETRY_WINDOW_MS;
  const events = telemetry._rejectEvents;
  let pruneCount = 0;
  while (pruneCount < events.length && events[pruneCount].ts < cutoff) {
    pruneCount += 1;
  }
  if (pruneCount) {
    events.splice(0, pruneCount);
  }
  const counts = new Map<string, number>();
  for (const entry of events) {
    counts.set(entry.reason, (counts.get(entry.reason) || 0) + 1);
  }
  telemetry.last15sRejectTop3 = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => ({ reason, count }));
}

function recordAsrIntentTelemetry(telemetry: AsrTelemetry | null, intentReason: string) {
  if (!telemetry) return;
  telemetry.intentsSeen += 1;
  if (intentReason.includes('final')) telemetry.finalSeen += 1;
  else if (intentReason.includes('interim')) telemetry.interimSeen += 1;
}

function recordAsrMatchEvent(now: number, intent: any, intentReason: string) {
  const rawBlockIdx = Number(intent?.target?.blockIdx);
  if (!Number.isFinite(rawBlockIdx) || rawBlockIdx < 0) return;
  const rawLineIdx = Number(intent?.target?.lineIdx);
  const lineIdx = Number.isFinite(rawLineIdx) ? Math.max(0, Math.floor(rawLineIdx)) : null;
  const confidence = Number.isFinite(intent?.confidence) ? Number(intent.confidence) : null;
  const isFinal = intentReason.includes('final');
  recentAsrMatches.push({
    ts: now,
    blockIdx: Math.max(0, Math.floor(rawBlockIdx)),
    lineIdx,
    isFinal,
    confidence,
  });
  const cutoff = now - ASR_MATCH_WINDOW_MS;
  let pruneCount = 0;
  while (pruneCount < recentAsrMatches.length && recentAsrMatches[pruneCount].ts < cutoff) {
    pruneCount += 1;
  }
  if (pruneCount) {
    recentAsrMatches.splice(0, pruneCount);
  }
  if (recentAsrMatches.length > ASR_MATCH_MAX) {
    recentAsrMatches.splice(0, recentAsrMatches.length - ASR_MATCH_MAX);
  }
}

function parseLineIndexFromEl(el: HTMLElement): number | null {
  if (!el) return null;
  const raw =
    el.dataset.i ||
    el.dataset.index ||
    el.dataset.line ||
    el.dataset.lineIdx ||
    el.getAttribute('data-line') ||
    el.getAttribute('data-line-idx');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

function getBlockLineIndices(blockIdx: number): number[] | null {
  const blockEls = getAsrBlockElements();
  if (!blockEls || !blockEls.length) return null;
  if (asrBlockLineCacheRef !== blockEls) {
    asrBlockLineCacheRef = blockEls;
    asrBlockLineCache.clear();
  }
  const cached = asrBlockLineCache.get(blockIdx);
  if (cached) return cached;
  const blockEl = blockEls[blockIdx];
  if (!blockEl) return null;
  const lineEls = Array.from(blockEl.querySelectorAll<HTMLElement>('.line, .tp-line'));
  if (!lineEls.length) return null;
  const indices: number[] = [];
  for (const lineEl of lineEls) {
    const idx = parseLineIndexFromEl(lineEl);
    if (idx == null) continue;
    indices.push(idx);
  }
  if (!indices.length) return null;
  indices.sort((a, b) => a - b);
  asrBlockLineCache.set(blockIdx, indices);
  return indices;
}

function buildCompletionEvidence(
  currentBlockIdx: number,
  candidateBlockIdx: number,
  now = Date.now(),
): CompletionEvidence | null {
  if (!Number.isFinite(candidateBlockIdx) || candidateBlockIdx < 0) return null;
  const blockLineIndices = getBlockLineIndices(currentBlockIdx);
  if (!blockLineIndices || !blockLineIndices.length) return null;
  const totalLinesInBlock = blockLineIndices.length;
  if (totalLinesInBlock <= 0) return null;
  const lastLineIdx = blockLineIndices[blockLineIndices.length - 1];
  if (!Number.isFinite(lastLineIdx)) return null;
  const cutoff = now - ASR_MATCH_WINDOW_MS;
  const windowMatches = recentAsrMatches.filter((entry) => entry.ts >= cutoff);
  const hasFinal = windowMatches.some((entry) => entry.isFinal);
  const blockLineSet = new Set(blockLineIndices);
  const matchedLineSet = new Set<number>();
  for (const entry of windowMatches) {
    if (entry.lineIdx == null) continue;
    if (blockLineSet.has(entry.lineIdx)) {
      matchedLineSet.add(entry.lineIdx);
    }
  }
  const matchedLineIds = Array.from(matchedLineSet).sort((a, b) => a - b);
  const coverageRatio =
    totalLinesInBlock > 0 ? Math.min(1, matchedLineIds.length / totalLinesInBlock) : 0;
  const matchedLastLine = matchedLineSet.has(lastLineIdx);
  const trailingWindow = Math.max(1, DEFAULT_COMPLETION_POLICY.trailingLinesWindow);
  const trailingStart = Math.max(0, blockLineIndices.length - trailingWindow);
  const trailingLineSet = new Set(blockLineIndices.slice(trailingStart));
  let matchedTrailingLines = 0;
  for (const idx of matchedLineSet) {
    if (trailingLineSet.has(idx)) matchedTrailingLines += 1;
  }
  const boundaryCrossed = windowMatches.some((entry) => {
    if (entry.blockIdx < candidateBlockIdx) return false;
    if (entry.isFinal) return true;
    if (Number.isFinite(entry.confidence) && (entry.confidence as number) >= 0.6) return true;
    return false;
  });

  return {
    currentBlockIdx,
    candidateBlockIdx,
    matchedLineIds,
    totalLinesInBlock,
    matchedLastLine,
    matchedTrailingLines,
    coverageRatio: Math.min(1, Math.max(0, coverageRatio)),
    boundaryCrossed,
    hasFinal,
  };
}

function formatCompletionEvidenceSummary(evidence: CompletionEvidence | null): string {
  if (!evidence) return 'evidence_missing_block_index';
  const cov = Number.isFinite(evidence.coverageRatio) ? evidence.coverageRatio : 0;
  const covText = cov.toFixed(2);
  const last = evidence.matchedLastLine ? 1 : 0;
  const trail = Number.isFinite(evidence.matchedTrailingLines) ? evidence.matchedTrailingLines : 0;
  const finalFlag = evidence.hasFinal ? 1 : 0;
  const boundary = evidence.boundaryCrossed ? 1 : 0;
  return `cov=${covText} last=${last} trail=${trail} final=${finalFlag} bndry=${boundary}`;
}

function recordAsrReject(
  telemetry: AsrTelemetry | null,
  now: number,
  reasonKey: string,
  mode: string,
  phase: string,
  currentBlockIdx: number,
  candidateBlockIdx: number,
  completionEvidenceSummary?: string,
) {
  if (!telemetry) return;
  telemetry.commitRejected += 1;
  telemetry.rejectReasons[reasonKey] = (telemetry.rejectReasons[reasonKey] || 0) + 1;
  telemetry._rejectEvents.push({ ts: now, reason: reasonKey });
  if (telemetry._rejectEvents.length > ASR_TELEMETRY_MAX_REJECTS) {
    telemetry._rejectEvents.splice(0, telemetry._rejectEvents.length - ASR_TELEMETRY_MAX_REJECTS);
  }
  updateAsrTelemetryTopRejects(telemetry, now);
  telemetry.last = {
    ts: now,
    mode,
    phase,
    currentBlockIdx,
    candidateBlockIdx,
    decision: 'reject',
    rejectReason: reasonKey,
    completionEvidenceSummary: completionEvidenceSummary || telemetry.completionEvidenceSummary || '',
    completionOk: reasonKey.startsWith('reject_completion_') ? false : telemetry.last?.completionOk,
    completionReason: reasonKey.startsWith('reject_completion_')
      ? reasonKey.replace('reject_completion_', '')
      : telemetry.last?.completionReason,
  };
}

function recordAsrAccept(
  telemetry: AsrTelemetry | null,
  now: number,
  mode: string,
  phase: string,
  currentBlockIdx: number,
  candidateBlockIdx: number,
  completionEvidenceSummary?: string,
  completionConfidence?: number,
  completionStatus?: 'complete' | 'unknown',
  completionReason?: string,
) {
  if (!telemetry) return;
  telemetry.commitAccepted += 1;
  const resolvedStatus = completionStatus || 'complete';
  telemetry.last = {
    ts: now,
    mode,
    phase,
    currentBlockIdx,
    candidateBlockIdx,
    decision: 'accept',
    completionEvidenceSummary: completionEvidenceSummary || telemetry.completionEvidenceSummary || '',
    completionOk: resolvedStatus === 'complete',
    completionReason: completionReason || (resolvedStatus === 'complete' ? 'complete' : 'unknown'),
    completionConfidence: Number.isFinite(completionConfidence as number)
      ? (completionConfidence as number)
      : telemetry.last?.completionConfidence,
  };
}
const hybridSilence = {
  lastSpeechAtMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
  pausedBySilence: false,
  timeoutId: null as number | null,
  erroredOnce: false,
  offScriptActive: false,
};
let offScriptSinceMs: number | null = null;
let offScriptDurationMs = 0;
let hybridSilence2 = 0;
const HYBRID_CTRL_DEBUG_THROTTLE_MS = 500;
let lastHybridCtrlDebugTs = 0;
const HYBRID_TRUTH_THROTTLE_MS = 350;
let lastHybridTruthAt = 0;
const HYBRID_OFFSCRIPT_HUD_THROTTLE_MS = 350;
let lastHybridOffScriptHudAt = 0;
function setHybridSilence2(v: number) {
  hybridSilence2 = Number.isFinite(v) ? v : 0;
}

function resetOffScriptDuration() {
  offScriptSinceMs = null;
  offScriptDurationMs = 0;
}

function syncOffScriptDuration(now = nowMs()) {
  if (hybridSilence.offScriptActive) {
    if (offScriptSinceMs == null) {
      offScriptSinceMs = now;
      offScriptDurationMs = 0;
      return;
    }
    offScriptDurationMs = Math.max(0, now - offScriptSinceMs);
    return;
  }
  resetOffScriptDuration();
}

function computeOffScriptDecay(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
  if (durationMs < OFFSCRIPT_DECAY_T1_MS) return 1;
  if (durationMs < OFFSCRIPT_DECAY_T2_MS) return 0.5;
  if (durationMs < OFFSCRIPT_DECAY_T3_MS) return 0.25;
  if (durationMs < OFFSCRIPT_DECAY_T4_MS) return OFFSCRIPT_DECAY_CRAWL;
  return 0;
}

function logHybridOffScriptHud(payload: {
  bestSim: number | null;
  inBand: boolean;
  offScriptEvidence: number;
  offScriptActive: boolean;
  offScriptDurationMs: number;
  nextScale: number;
  effectiveScale: number;
}) {
  const now = nowMs();
  if (now - lastHybridOffScriptHudAt < HYBRID_OFFSCRIPT_HUD_THROTTLE_MS) return;
  lastHybridOffScriptHudAt = now;
  try { (window as any)?.HUD?.log?.('HYBRID_OFFSCRIPT', payload); } catch {}
}

function resetAsrIntentState(reason?: string) {
  committedBlockIdx = -1;
  lastCommitAt = 0;
  lastCandidate = -1;
  stableSince = 0;
  asrMotorConflictLogged = false;
  if (reason) {
    try { console.debug('[ASR_INTENT] reset', { reason }); } catch {}
  }
}

const profileStore = hasSupabaseConfig ? new ProfileStore(supabase) : null;
const profilePersister = profileStore ? createProfilePersister(profileStore) : null;

function persistProfilePatch(patch: DeepPartial<TpProfileV1>) {
  profilePersister?.persist(patch);
}

function flushProfilePersister() {
  profilePersister?.flush();
}
try {
  if (typeof window !== 'undefined') {
    window.addEventListener('tp:typographyChanged', (ev) => {
      try {
        const detail = (ev as CustomEvent)?.detail || {};
        if (detail.broadcast) return;
        const display = detail.display === 'display' ? 'display' : 'main';
        const settings = detail.settings;
        if (!settings || typeof settings !== 'object') return;
        persistProfilePatch({
          ui: {
            windows: {
              [display]: {
                typography: settings,
              },
            },
          },
        });
      } catch {}
    });
  }
} catch {}
function warnScrollWrite(payload: Record<string, unknown>) {
  if (scrollWriteWarned) return;
  scrollWriteWarned = true;
  try {
    console.warn('[AUTO] SCROLL_WRITE_FAILED', payload);
  } catch {}
}
const nowMs = () =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();

const KNOWN_SCROLL_MODES = new Set([
  'hybrid',
  'timed',
  'wpm',
  'asr',
  'step',
  'rehearsal',
]);

function normalizeScrollModeValue(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'manual' || raw === 'off') return 'step';
  if (raw === 'auto') return 'timed';
  return KNOWN_SCROLL_MODES.has(raw) ? raw : null;
}

function getScrollMode(): string {
  try {
    const w = typeof window !== 'undefined' ? (window as any) : null;
    const override = normalizeScrollModeValue(w?.__tpModeOverride);
    if (override) return override;
    const store = w?.__tpStore || appStore;
    const storeMode = normalizeScrollModeValue(store?.get?.('scrollMode'));
    if (storeMode) return storeMode;
    const uiMode = normalizeScrollModeValue(w?.__tpUiScrollMode);
    if (uiMode) return uiMode;
    const legacyMode = normalizeScrollModeValue(w?.__tpScrollMode);
    if (legacyMode) return legacyMode;
    const mode = normalizeScrollModeValue((state2 as any)?.mode);
    if (mode) return mode;
  } catch {
    // ignore
  }
  return 'hybrid';
}

function normalizePerfTimestamp(candidate?: number, referenceNow = nowMs()) {
  const perfNow = Number.isFinite(referenceNow) ? referenceNow : nowMs();
  if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < 0) {
    return perfNow;
  }
  if (candidate > perfNow + 5000) {
    return perfNow;
  }
  return candidate;
}

function resolveCurrentBlockIdx(): number | null {
  try {
    const anchorIdx = computeAnchorLineIndex(scrollerEl || undefined);
    if (!Number.isFinite(anchorIdx as number)) return null;
    const idx = Math.max(0, Math.floor(anchorIdx as number));
    const selector = `.line[data-i="${idx}"], .line[data-index="${idx}"], .line[data-line="${idx}"], .line[data-line-idx="${idx}"]`;
    const lineEl =
      (document.getElementById(`tp-line-${idx}`) as HTMLElement | null) ||
      (document.querySelector<HTMLElement>(selector) as HTMLElement | null);
    const blockEl = lineEl?.closest?.('.tp-asr-block') as HTMLElement | null;
    const raw = blockEl?.dataset?.tpBlock;
    const blockIdx = Number(raw);
    return Number.isFinite(blockIdx) ? blockIdx : null;
  } catch {
    return null;
  }
}

function runHybridVelocity(silence = hybridSilence) {
  if (state2.mode !== 'hybrid') {
    assertHybridStoppedIfNotHybrid('runHybridVelocity');
    return;
  }
  const target = typeof window !== 'undefined' ? window : globalThis;
  const fn = (target as any).__tpApplyHybridVelocity;
  if (typeof fn === 'function') {
    fn(silence);
    return;
  }
  if (typeof applyHybridVelocityCore === 'function') {
    applyHybridVelocityCore(silence);
  }
}

function getMarkerPercent() {
  try {
    if (typeof window === "undefined") return 0.4;
    const pct = (window as any).__TP_MARKER_PCT;
    return Number.isFinite(pct) ? pct : 0.4;
  } catch {
    return 0.4;
  }
}

function getMarkerLineIndex(scroller = scrollerEl, markerY: number | null = null) {
  try {
    const toCheck = scroller ?? undefined;
    const anchorIdx = computeAnchorLineIndex(toCheck);
    if (Number.isFinite(anchorIdx)) {
      return Math.max(0, Math.floor(anchorIdx));
    }
  } catch {}
  if (!scroller || markerY == null || !Number.isFinite(markerY)) return null;
  const linePx = getLinePx();
  if (!Number.isFinite(linePx) || linePx <= 0) return null;
  return Math.max(0, Math.round(markerY / linePx));
}

function computeHybridErrorPx(now = nowMs()) {
  const scroller = scrollerEl;
  const hint = hybridTargetHintState;
  if (!scroller || !hint) return null;
  const currentScrollTop = scroller.scrollTop || 0;
  const height = scroller.clientHeight || 0;
  const markerPct =
    Number.isFinite(hint.markerPct ?? NaN) && hint.markerPct != null
      ? hint.markerPct
      : getMarkerPercent();
  const markerY = currentScrollTop + height * markerPct;
  const anchorTopRaw = Number(hint.anchorTop);
  const hasAnchorTop = Number.isFinite(anchorTopRaw);
  const hintTopRaw = Number(hint.top);
  const hasHintTop = Number.isFinite(hintTopRaw);
  let targetTop: number | null = null;
  let targetTopSource: 'anchor' | 'hint' | 'sticky' | 'none' = 'none';
  if (hasAnchorTop) {
    targetTop = anchorTopRaw;
    targetTopSource = 'anchor';
  } else if (hasHintTop) {
    targetTop = hintTopRaw;
    targetTopSource = 'hint';
  } else if (Number.isFinite(hybridLastGoodTargetTop ?? NaN)) {
    targetTop = hybridLastGoodTargetTop;
    targetTopSource = 'sticky';
  } else {
    targetTopSource = 'none';
  }
  if (targetTop == null) return null;
  const anchorY = targetTop;
  const errorPx = anchorY - markerY;
  const anchorAgeMs = Math.max(0, now - hint.ts);
  const markerIdx = getMarkerLineIndex(scroller, markerY);
  const fallbackBestIdx =
    Number.isFinite(lastAsrMatch.bestIndex) && lastAsrMatch.bestIndex >= 0
      ? lastAsrMatch.bestIndex
      : null;
  const bestIdx =
    Number.isFinite(hint.lineIndex ?? NaN) && hint.lineIndex != null
      ? hint.lineIndex
      : fallbackBestIdx;
  const errorLines = bestIdx != null && markerIdx != null ? bestIdx - markerIdx : null;
  return {
    errorPx,
    targetScrollTop: targetTop,
    currentScrollTop,
    confidence: hint.confidence,
    anchorAgeMs,
    anchorTop: anchorY,
    markerY,
    markerIdx,
    bestIdx,
    errorLines,
    targetTopSource,
  };
}

function getSilenceMs(now = nowMs()) {
  const lastSpeech = hybridSilence.lastSpeechAtMs ?? now;
  return Math.max(0, now - lastSpeech);
}

type HybridEligibility = { eligible: boolean; reason: string };

function evaluateHybridEligibility(now = nowMs()): HybridEligibility {
  if (state2.mode !== "hybrid") return { eligible: false, reason: "mode" };
  if (getHybridSessionPhase() !== "live") return { eligible: false, reason: "phase" };
  const hint = hybridTargetHintState;
  if (!hint) return { eligible: false, reason: "no-hint" };
  if (hint.confidence < HYBRID_CTRL_CONF_MIN) return { eligible: false, reason: "low-confidence" };
  if (now - hint.ts > HYBRID_CTRL_ANCHOR_RECENCY_MS) return { eligible: false, reason: "stale-hint" };
  return { eligible: true, reason: "ok" };
}


function logHybridCtrlState(
  basePxps: number,
  baseWithCorrection: number,
  now: number,
  errorInfo: ReturnType<typeof computeHybridErrorPx> | null,
  silenceMs: number,
  eligible: boolean,
  eligibleReason: string,
  normalizedError: number,
  targetMult: number,
  targetMultSource: string,
  lineTargetMult: number | null,
  lineMult: number,
  appliedTargetMult: number,
  silenceCap: number,
  offScriptSeverity: number,
  offScriptCap: number,
  finalPxps: number,
  ctrlMultApplied: number,
  effectiveScaleApplied: number,
  modeHint: string,
) {
  if (!isDevMode()) return;
  if (!HYBRID_CTRL_ENABLED) return;
  if (now - lastHybridCtrlLogAt < HYBRID_CTRL_LOG_THROTTLE_MS) return;
  lastHybridCtrlLogAt = now;
  try {
    console.info("[HYBRID_CTRL]", {
      errorPx: errorInfo?.errorPx ?? null,
      anchorY: errorInfo?.anchorY ?? null,
      currentScrollTop: errorInfo?.currentScrollTop ?? null,
      targetScrollTop: errorInfo?.targetScrollTop ?? null,
      markerY: null,
      confidence: errorInfo?.confidence ?? null,
      anchorAgeMs: errorInfo?.anchorAgeMs ?? null,
      silenceMs,
      eligible,
      eligibleReason,
      basePxps,
      baseWithCorrection,
      normalizedError,
      targetMult,
      appliedTargetMult,
      silenceCap,
      offScriptSeverity,
      offScriptCap,
      hybridMult: hybridCtrl.mult,
      finalPxps,
      ctrlMultApplied,
      effectiveScaleApplied,
      modeHint,
      targetMultSource,
      lineTargetMult,
      lineMult,
      errorLines: errorInfo?.errorLines ?? null,
      markerIdx: errorInfo?.markerIdx ?? null,
      bestIdx: errorInfo?.bestIdx ?? null,
      writerSource: getLastWriterSource(),
    });
  } catch {}
}

function logHybridMultDebug(payload: {
  basePxps: number;
  errorLines: number | null;
  targetMult: number;
  lineMult: number;
  finalPxps: number;
  capReason?: string;
}) {
  if (!isDevMode()) return;
  if (!HYBRID_CTRL_ENABLED) return;
  const now = nowMs();
  if (now - lastHybridMultDebugAt < HYBRID_MULT_DEBUG_THROTTLE_MS) return;
  lastHybridMultDebugAt = now;
  const fmt = (value: number | null | undefined, digits = 2) =>
    value == null || !Number.isFinite(value) ? null : value.toFixed(digits);
  try {
    console.info("[HYBRID_CTRL] mult-debug", {
      basePxps: fmt(payload.basePxps),
      errorLines: fmt(payload.errorLines),
      targetMult: fmt(payload.targetMult, 3),
      lineMult: fmt(payload.lineMult, 3),
      finalPxps: fmt(payload.finalPxps),
      capReason: payload.capReason ?? "none",
    });
  } catch {}
}

function logHybridTruthLine(payload: {
  basePxps: number;
  finalPxps: number;
  errorPx?: number;
  errorLines?: number | null;
  effectiveErrorLines?: number | null;
  targetMult?: number;
  lineMult?: number;
  capReason?: string;
  scaleReason?: string | null;
  noMatch?: boolean | null;
  sawNoMatch?: boolean | null;
  hardNoMatch?: boolean | null;
  offScriptActive?: boolean | null;
  bestSim?: number | null;
  weakMatch?: boolean | null;
  driftWeak?: boolean | null;
  targetTopSource?: string | null;
}) {
  if (!isDevMode()) return;
  const now = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
  if (now - lastHybridTruthAt < HYBRID_TRUTH_THROTTLE_MS) return;
  lastHybridTruthAt = now;
  const fmt = (value: number | undefined | null, digits: number) =>
    value == null || !Number.isFinite(value) ? null : +value.toFixed(digits);
  try {
    const truthPayload = {
      basePxps: fmt(payload.basePxps, 2),
      finalPxps: fmt(payload.finalPxps, 2),
      errorPx: fmt(payload.errorPx, 1),
      errorLines: fmt(payload.errorLines, 2),
      effectiveErrorLines: fmt(payload.effectiveErrorLines, 2),
      targetMult: fmt(payload.targetMult, 3),
      lineMult: fmt(payload.lineMult, 3),
      capReason: payload.capReason ?? "none",
      scaleReason: payload.scaleReason ?? null,
      weakMatch: payload.weakMatch ?? null,
      driftWeak: payload.driftWeak ?? null,
      bestSim: fmt(payload.bestSim, 3),
      offScriptActive: payload.offScriptActive ?? null,
      noMatch: payload.noMatch ?? null,
      sawNoMatch: payload.sawNoMatch ?? null,
      hardNoMatch: payload.hardNoMatch ?? null,
      targetTopSource: payload.targetTopSource ?? null,
    };
    console.warn("[HYBRID_TRUTH]", JSON.stringify(truthPayload));
  } catch {}
}

type HybridCtrlHudState = {
  basePxps: number;
  errorPx: number | null;
  anchorAgeMs: number | null;
  normalizedError: number;
  targetMult: number;
  appliedTargetMult: number;
  mult: number;
  silenceMs: number;
  silenceCap: number;
  offScriptSeverity: number;
  offScriptCap: number;
  eligible: boolean;
  targetTop: number | null;
  currentTop: number | null;
  modeHint: string;
  ctrlMultApplied: number;
  effectiveScaleApplied: number;
  finalPxps: number;
  baseWithCorrection: number;
  eligibleReason: string;
  errorLines: number | null;
  markerIdx: number | null;
  bestIdx: number | null;
  writerSource: string | null;
  targetMultSource: string;
  lineTargetMult: number | null;
  lineMult: number;
  lineSource: HybridCtrlLineSource;
};

function formatHudNumber(value: number | null | undefined, digits = 2) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(digits) : 'n/a';
}

function computeHybridModeHint(errorLines: number | null, weakMatch?: boolean) {
  if (weakMatch) return 'WEAK MATCH';
  const lines = Number.isFinite(errorLines ?? NaN) ? Number(errorLines) : null;
  if (lines == null || Math.abs(lines) <= HYBRID_CTRL_MODE_DEADBAND_LINES) {
    return 'ON TARGET';
  }
  return lines > 0 ? 'CATCHING UP' : 'LETTING YOU CATCH UP';
}

function renderHybridCtrlHud(state: HybridCtrlHudState) {
  if (!HYBRID_CTRL_ENABLED) return;
  if (typeof document === 'undefined') return;
  const container = document.body || document.documentElement;
  if (!container) return;
  let hud = document.getElementById('tpHybridHud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'tpHybridHud';
    hud.style.position = 'fixed';
    hud.style.bottom = 'var(--tp-ui-pad-sm)';
    hud.style.right = 'var(--tp-ui-pad-sm)';
    hud.style.zIndex = '2147483647';
    hud.style.padding = 'calc(6px * var(--tp-ui-scale)) calc(8px * var(--tp-ui-scale))';
    hud.style.fontSize = 'var(--tp-ui-font-xs)';
    hud.style.fontFamily = 'system-ui, sans-serif';
    hud.style.background = 'rgba(0, 0, 0, 0.65)';
    hud.style.color = '#fff';
    hud.style.borderRadius = 'calc(4px * var(--tp-ui-scale))';
    hud.style.pointerEvents = 'none';
    hud.style.whiteSpace = 'nowrap';
    container.appendChild(hud);
  }
  const parts = [
    `mode=${state.modeHint}`,
    `target=${formatHudNumber(state.targetTop, 1)}`,
    `curr=${formatHudNumber(state.currentTop, 1)}`,
    `err=${formatHudNumber(state.errorPx, 1)}`,
    `errLines=${formatHudNumber(state.errorLines, 1)}`,
    `markerIdx=${formatHudNumber(state.markerIdx, 0)}`,
    `bestIdx=${formatHudNumber(state.bestIdx, 0)}`,
    `lineTarget=${formatHudNumber(state.lineTargetMult, 2)}`,
    `lineMult=${formatHudNumber(state.lineMult, 2)}`,
    `lineSrc=${state.lineSource}`,
    `base=${formatHudNumber(state.basePxps, 1)}`,
    `baseCorr=${formatHudNumber(state.baseWithCorrection, 1)}`,
    `mult=${formatHudNumber(state.mult, 2)}`,
    `ctrl=${formatHudNumber(state.ctrlMultApplied, 2)}`,
    `scale=${formatHudNumber(state.effectiveScaleApplied, 2)}`,
    `final=${formatHudNumber(state.finalPxps, 1)}`,
    `silence=${formatHudNumber(state.silenceMs, 0)}ms`,
    `silenceCap=${formatHudNumber(state.silenceCap, 2)}`,
    `off=${formatHudNumber(state.offScriptSeverity, 2)}`,
    `offCap=${formatHudNumber(state.offScriptCap, 2)}`,
    `eligible=${state.eligible ? 'yes' : 'no'}(${state.eligibleReason})`,
    `writer=${state.writerSource ?? 'n/a'}`,
  ];
  hud.textContent = parts.join(' | ');
}

function getLastWriterSource() {
  try {
    const scroller = scrollerEl;
    const datasetSource = scroller?.dataset?.tpLastWriter;
    if (datasetSource) return datasetSource;
    const globalWriter = (window as any).__tpLastWriter;
    if (globalWriter && typeof globalWriter.from === 'string') {
      return globalWriter.from;
    }
  } catch {}
  return null;
}

function classifyProgrammaticWriterKind(source: string | null | undefined, modeHint: string | null = null): ProgrammaticWriterKind {
  const raw = String(source || '').toLowerCase();
  const mode = String(modeHint || '').toLowerCase();
  if (raw.includes('asr') || mode === 'asr') return 'asr';
  if (
    raw.includes('writer') ||
    raw.includes('programmatic') ||
    raw.includes('scrollwrite')
  ) {
    return 'writer';
  }
  return 'other';
}

function noteProgrammaticWriterStamp(source: string, kind: ProgrammaticWriterKind, at: number = nowMs()) {
  if (kind === 'other') return;
  lastProgrammaticWriterStamp = {
    at,
    source: String(source || 'programmatic'),
    kind,
  };
}

function getRecentProgrammaticWriterStamp(
  scroller: HTMLElement | null,
  now: number = nowMs(),
): ProgrammaticWriterStamp | null {
  try {
    const w = window as any;
    const source = String(scroller?.dataset?.tpLastWriter || '');
    const globalWriter = w?.__tpLastWriter;
    const globalFrom = typeof globalWriter?.from === 'string' ? globalWriter.from : '';
    const globalAt = Number(globalWriter?.at);
    if (Number.isFinite(globalAt) && now - globalAt <= PROGRAMMATIC_WRITER_GRACE_MS) {
      const kind = classifyProgrammaticWriterKind(globalFrom || source, getScrollMode());
      noteProgrammaticWriterStamp(globalFrom || source || 'writer', kind, globalAt);
    } else if (w?.__tpScrollWriteActive === true) {
      const activeSource = source || globalFrom || 'writer-active';
      const kind = classifyProgrammaticWriterKind(activeSource, getScrollMode());
      noteProgrammaticWriterStamp(activeSource, kind, now);
    } else if (state2.mode === 'asr' && source) {
      const kind = classifyProgrammaticWriterKind(source, 'asr');
      noteProgrammaticWriterStamp(source, kind, now);
    }
  } catch {
    // ignore
  }
  if (!lastProgrammaticWriterStamp) return null;
  if (now - lastProgrammaticWriterStamp.at > PROGRAMMATIC_WRITER_GRACE_MS) return null;
  return lastProgrammaticWriterStamp;
}

function getLinePx() {
  try {
    const metrics = getViewportMetrics(() => scrollerEl);
    return Number.isFinite(metrics.pxPerLine) && metrics.pxPerLine > 0
      ? metrics.pxPerLine
      : HYBRID_CTRL_LINE_PX_DEFAULT;
  } catch {
    return HYBRID_CTRL_LINE_PX_DEFAULT;
  }
}

function normalizeHybridError(errorPx: number) {
  const linePx = getLinePx();
  const bandPx = linePx * 1.5;
  const deadbandPx = linePx * 0.45;
  if (Math.abs(errorPx) < deadbandPx) return 0;
  return clamp(errorPx / bandPx, -1, 1);
}

function computeOffScriptSeverity() {
  const bestSim = Number.isFinite(lastAsrMatch?.bestSim ?? NaN) ? lastAsrMatch.bestSim : NaN;
  const simSeverity =
    Number.isFinite(bestSim) && bestSim < HYBRID_CTRL_OFFSCRIPT_SIM_THRESHOLD
      ? (HYBRID_CTRL_OFFSCRIPT_SIM_THRESHOLD - bestSim) / HYBRID_CTRL_OFFSCRIPT_SIM_THRESHOLD
      : 0;
  const deltaLines =
    Number.isFinite(lastAsrMatch?.bestIndex) && Number.isFinite(lastAsrMatch?.currentIndex)
      ? Math.abs(lastAsrMatch.bestIndex - lastAsrMatch.currentIndex)
      : 0;
  const deltaSeverity = clamp(deltaLines / HYBRID_CTRL_OFFSCRIPT_LINE_DELTA, 0, 1);
  return Math.min(1, Math.max(simSeverity, deltaSeverity));
}

function computeTargetMultiplier(e: number) {
  const raw = 1 + HYBRID_CTRL_KP * e;
  return clamp(raw, HYBRID_CTRL_BRAKE_MIN, HYBRID_CTRL_ASSIST_MAX);
}

function mapErrorLinesToTargetMult(
  errorLines: number,
  deadbandLines: number,
  maxErrLines: number,
  minMult: number,
  maxMult: number,
) {
  if (!Number.isFinite(errorLines)) return 1;
  if (maxErrLines <= deadbandLines) return 1;
  const abs = Math.abs(errorLines);
  if (abs <= deadbandLines) return 1;
  const normalized = clamp((abs - deadbandLines) / (maxErrLines - deadbandLines), 0, 1);
  const shaped = Math.pow(Math.min(Math.max(normalized, 0), 1), HYBRID_CTRL_LINE_CURVE_EXP);
  if (errorLines > 0) {
    const delta = Math.min(HYBRID_CTRL_LINE_POS_MULT_DELTA, 1 - minMult);
    return clamp(1 - shaped * delta, minMult, 1);
  }
  const delta = Math.min(HYBRID_CTRL_LINE_NEG_MULT_DELTA, maxMult - 1);
  return clamp(1 + shaped * delta, 1, maxMult);
}

function computeLineTargetMultiplier(errorLines: number | null, eligible: boolean) {
  if (!eligible || errorLines == null || !Number.isFinite(errorLines)) return null;
  return mapErrorLinesToTargetMult(
    errorLines,
    HYBRID_CTRL_MODE_DEADBAND_LINES,
    HYBRID_CTRL_LINE_ERROR_RANGE,
    HYBRID_CTRL_LINE_MIN_MULT,
    HYBRID_CTRL_LINE_MAX_MULT,
  );
}

function updateHybridLineMult(targetMult: number | null, dtMs: number, allowFastUp = false) {
  const current = Number.isFinite(hybridCtrl.lineMult) ? hybridCtrl.lineMult : 1;
  const target = Number.isFinite(targetMult ?? NaN) ? Number(targetMult) : 1;
  if (!Number.isFinite(dtMs) || dtMs <= 0) {
    hybridCtrl.lineMult = target;
    return hybridCtrl.lineMult;
  }
  const alpha = 1 - Math.exp(-dtMs / HYBRID_CTRL_LINE_SMOOTH_TAU_MS);
  const next = current + (target - current) * alpha;
  const maxDeltaDown = HYBRID_CTRL_LINE_RATE_LIMIT_PER_SEC * (dtMs / 1000);
  const maxDeltaUp =
    HYBRID_CTRL_LINE_RATE_LIMIT_PER_SEC *
    (dtMs / 1000) *
    (allowFastUp ? HYBRID_CTRL_LINE_RATE_LIMIT_BEHIND_MULT : 1);
  const limited = clamp(next, current - maxDeltaDown, current + maxDeltaUp);
  hybridCtrl.lineMult = Number.isFinite(limited) ? limited : current;
  return hybridCtrl.lineMult;
}

function computeSilenceCapMultiplier(silenceMs: number) {
  if (silenceMs > HYBRID_CTRL_SILENCE_LONG_MS) {
    return HYBRID_CTRL_SILENCE_LONG_CAP;
  }
  if (silenceMs > HYBRID_CTRL_SILENCE_SHORT_MS) {
    return HYBRID_CTRL_SILENCE_SHORT_CAP;
  }
  return 1;
}

let hybridProgrammaticScrollUntilMs = 0;
function markHybridProgrammaticScroll(durationMs = 80) {
  hybridProgrammaticScrollUntilMs = nowMs() + durationMs;
}
function isHybridProgrammaticScroll() {
  return nowMs() < hybridProgrammaticScrollUntilMs;
}

function clearHybridSilenceTimer() {
  if (hybridSilence.timeoutId != null) {
    try {
      window.clearTimeout(hybridSilence.timeoutId);
    } catch {}
    hybridSilence.timeoutId = null;
  }
}

let tpLastWriter: { from: string; at: number; y: number } | null = null;
function describeEl(el: Element | null | undefined) {
  if (!el) {
    return {
      tag: 'null',
      id: null,
      cls: null,
    };
  }
  const e = el as HTMLElement;
  return {
    tag: (e.tagName || 'unknown').toLowerCase(),
    id: e.id || null,
    cls: (e.className && String(e.className)) || null,
  };
}
function scrollWrite(y: number, meta: { from: string; reason?: string }) {
  if (!isMainViewer()) {
    try {
      console.warn('[SCROLL_WRITE] denied (display role)', { y, meta });
    } catch {}
    return false;
  }
  const target =
    viewer ?? scrollerEl ?? (typeof document !== 'undefined' ? document.getElementById('viewer') : null);
  const targetInfo = describeEl(target);
  const beforeTop = target?.scrollTop ?? null;
  const requestedTop = y;
  let ok = false;
  try {
    const writeFn = (window as any).__tpScrollWrite;
    if (typeof writeFn === 'function') {
      writeFn(y);
      ok = true;
    } else if (target) {
      applyCanonicalScrollTop(y, {
        scroller: target,
        reason: meta.reason ?? 'router-scroll-write-fallback',
        source: meta.from || 'router-scroll-write-fallback',
      });
      ok = true;
    }
  } catch (err) {
    try {
      console.error('[SCROLL_WRITE] exception', { y, meta, err });
    } catch {}
  }
  const afterTop = target?.scrollTop ?? null;
  const writeAt = nowMs();
  tpLastWriter = { from: meta.from, at: writeAt, y };
  try {
    ((window as any).__tpLastWriter = tpLastWriter);
  } catch {}
  const stampSource = meta.reason || meta.from || 'writer';
  const stampKind = classifyProgrammaticWriterKind(stampSource, getScrollMode());
  noteProgrammaticWriterStamp(stampSource, stampKind, writeAt);
  try {
    console.info('[SCROLL_WRITE]', {
      ok,
      from: meta.from,
      reason: meta.reason ?? null,
      before: beforeTop,
      y,
      after: afterTop,
    });
  } catch {}
  const debugStack = isDevMode() ? (new Error().stack || null) : null;
  if (target && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    const targetEl = target as HTMLElement;
    window.requestAnimationFrame(() => {
      const afterTopRaf = targetEl.scrollTop ?? null;
      const changedNow =
        beforeTop != null && afterTop != null ? afterTop !== beforeTop : null;
      const snappedBack =
        afterTop != null && afterTopRaf != null ? afterTopRaf !== afterTop : null;
      try {
        console.warn('[SCROLL_WRITE_TRUTH]', {
          from: meta.from,
          reason: meta.reason ?? null,
          target: targetInfo,
          beforeTop,
          requestedTop,
          afterTop,
          afterTopRaf,
          changedNow,
          snappedBack,
          stack: debugStack,
        });
      } catch {}
    });
  }
  return ok;
}

function beginHybridLiveGraceWindow() {
  if (state2.mode !== "hybrid") return;
  const now = nowMs();
  seedHybridBaseSpeed();
  setHybridScale(RECOVERY_SCALE);
  liveGraceWindowEndsAt = now + LIVE_GRACE_MS;
  hybridSilence.lastSpeechAtMs = now;
  hybridSilence.pausedBySilence = false;
  clearHybridSilenceTimer();
  if (hybridWantedRunning) {
    armHybridSilenceTimer(LIVE_GRACE_MS);
  }
  const effectivePxps = Number.isFinite(hybridBasePxps) ? hybridBasePxps * hybridScale : 0;
  try {
    console.info("[HYBRID] live boot", {
      hybridBasePxps,
      phase: sessionPhase,
      hybridWantedRunning,
      lastSpeechAgeMs: 0,
      effectivePxps,
      scale: hybridScale,
      isSilent: false,
    });
  } catch {}
}

function onAutoIntent(e: Event) {
  const detail = (e as CustomEvent)?.detail || {};
  try {
    console.warn('[AUTO_INTENT] recv', { detail });
  } catch {}
  const hasProcessor = !!autoIntentProcessor;
  console.warn('[AUTO_INTENT] onAutoIntent route', { hasProcessor, buffered: !hasProcessor });
  if (!hasProcessor) {
    pendingAutoIntentDetail = detail;
    return;
  }
  try {
    console.warn('[AUTO_INTENT] onAutoIntent calling processor');
    autoIntentProcessor(detail);
  } catch {}
}

export function triggerWireAutoIntentListener(): void {
  try {
    console.warn('[AUTO_INTENT] triggerWireAutoIntentListener ENTER', __AUTO_INTENT_WIRE_SENTINEL);
  } catch {}
  try {
    console.warn('[AUTO_INTENT] TRIGGER body reached', { stamp: AUTO_INTENT_WIRE_STAMP, already: autoIntentListenerWired });
  } catch {}
    if (autoIntentListenerWired) {
      try {
        console.warn('[AUTO_INTENT] TRIGGER step=2 alreadyWired=true; skipping', { stamp: AUTO_INTENT_WIRE_STAMP });
      } catch {}
    } else {
      try { console.warn('[AUTO_INTENT] TRIGGER step=3 wiring now'); } catch {}
      autoIntentListenerWired = true;
      window.addEventListener('tp:auto:intent', onAutoIntent as EventListener);
      document.addEventListener('tp:auto:intent', onAutoIntent as EventListener);
    try {
      console.log(`[AUTO_INTENT] listener wired ${AUTO_INTENT_WIRE_STAMP}`, { target: 'window+document' });
    } catch {}
    try { console.warn('[AUTO_INTENT] TRIGGER step=4 wired ok'); } catch {}
    try {
      const counts = [
        (getEventListeners?.(window)?.['tp:auto:intent']?.length ?? 'noAPI'),
        (getEventListeners?.(document)?.['tp:auto:intent']?.length ?? 'noAPI'),
      ];
      console.warn('[AUTO_INTENT] TRIGGER step=5 post-wire sanity', { win: counts[0], doc: counts[1] });
    } catch {}
    try {
      window.dispatchEvent(
        new CustomEvent('tp:auto:intent', { detail: { enabled: false, reason: 'wire-selftest' } }),
      );
    } catch {}
    try { console.warn('[AUTO_INTENT] TRIGGER wired listeners (window+document)'); } catch {}
  }
  try {
    console.warn('[AUTO_INTENT] triggerWireAutoIntentListener EXIT', __AUTO_INTENT_WIRE_SENTINEL);
  } catch {}
}

// src/asr/v2/adapters/vad.ts
function createVadEventAdapter() {
  let ready = false;
  let error;
  const subs2 = /* @__PURE__ */ new Set();
  let unsub = null;
  function status() {
    return { kind: "vad", ready, error };
  }
  async function start() {
    try {
      if (unsub) return;
      const onEv = (e) => {
        try {
          const d = e?.detail || {};
          const f = { kind: "gate", speaking: !!d.speaking, rmsDbfs: Number(d.rmsDbfs) || -60 };
          subs2.forEach((fn) => {
            try {
              fn(f);
            } catch {
            }
          });
        } catch {
        }
      };
      const h = onEv;
      window.addEventListener("tp:vad", h);
      unsub = () => {
        try {
          window.removeEventListener("tp:vad", h);
        } catch {
        }
      };
      ready = true;
    } catch (e) {
      error = String(e?.message || e);
      ready = false;
    }
  }
  async function stop() {
    try {
      unsub?.();
      unsub = null;
    } catch {
    }
    ready = false;
  }
  function onFeature(fn) {
    subs2.add(fn);
    return () => subs2.delete(fn);
  }
  return { start, stop, onFeature, status };
}

// src/asr/v2/featureSynth.ts
function createFeatureSynth() {
  const TOK_WIN_MS = 5e3;
  let toks = [];
  let lastTokensKey = "";
  let speakingWanted = false;
  let speaking2 = false;
  let lastSpeakChange = 0;
  const ATTACK_MS = 80, RELEASE_MS = 300;
  let lastActivityMs = performance.now();
  let wpmEma;
  const ALPHA = 0.3;
  function dedupeKey(list) {
    return list.map((x) => x.text).join("|");
  }
  function wordsInWindow(now) {
    const start = now - TOK_WIN_MS;
    toks = toks.filter((t) => t.t >= start);
    let words = 0;
    for (const t of toks) {
      words += (t.text || "").trim().split(/\s+/).filter(Boolean).length;
    }
    return words;
  }
  function push(f) {
    const now = performance.now();
    if (f.kind === "tokens") {
      const key = dedupeKey(f.tokens);
      if (f.final || key !== lastTokensKey) {
        lastTokensKey = key;
        for (const tk of f.tokens) {
          toks.push({ text: tk.text, t: now });
        }
        lastActivityMs = now;
        speakingWanted = true;
      }
    } else if (f.kind === "gate") {
      speakingWanted = !!f.speaking;
      if (f.speaking) lastActivityMs = now;
    }
    if (speakingWanted && !speaking2) {
      if (now - lastSpeakChange >= ATTACK_MS) {
        speaking2 = true;
        lastSpeakChange = now;
      }
    } else if (!speakingWanted && speaking2) {
      if (now - lastSpeakChange >= RELEASE_MS) {
        speaking2 = false;
        lastSpeakChange = now;
      }
    }
    const words = wordsInWindow(now);
    const instWpm = words * 60 * (1e3 / TOK_WIN_MS);
    if (words > 0) {
      wpmEma = wpmEma == null ? instWpm : ALPHA * instWpm + (1 - ALPHA) * wpmEma;
    }
  }
  function getTempo() {
    const now = performance.now();
    const pauseMs = Math.max(0, now - lastActivityMs);
    return { wpm: wpmEma, pauseMs };
  }
  function getSpeaking() {
    return speaking2;
  }
  return { push, getTempo, getSpeaking };
}

// src/asr/v2/motor.ts
function createAutoMotor() {
  const brain = getScrollBrain();
  const timed = createTimedEngine(brain);
  let enabled = false;
  let currentSpeed = 0;
  let rafId: number | null = null;
  let lastTs = 0;
  let lastTickMoved = false;
  let carry = 0;
  const AUTO_TICK_DEBUG_MS = 3000;
  const AUTO_TICK_LOG_THROTTLE_MS = 250;
  let autoTickDebugStart = 0;
  let lastAutoTickLogAt = 0;

  function formatScroller(el: HTMLElement | null) {
    if (!el) return 'none';
    const tag = el.tagName?.toLowerCase() || 'el';
    const id = el.id ? `#${el.id}` : '';
    const classes = el.className ? `.${String(el.className).replace(/\s+/g, '.')}` : '';
    return `${tag}${id}${classes}`;
  }

  function logAutoTick(event: string, el: HTMLElement | null, pxPerSec: number, dtSec: number, reason: string, extra: Record<string, unknown> = {}) {
    if (!isDevMode()) return;
    const now = nowMs();
    if (autoTickDebugStart === 0) {
      autoTickDebugStart = now;
    }
    if (now - autoTickDebugStart > AUTO_TICK_DEBUG_MS) return;
    if (now - lastAutoTickLogAt < AUTO_TICK_LOG_THROTTLE_MS) return;
    lastAutoTickLogAt = now;
    try {
      const payload = {
        event,
        scroller: formatScroller(el),
        pxPerSec,
        dtSec,
        reason,
        scrollTop: el?.scrollTop ?? null,
        scrollHeight: el?.scrollHeight ?? null,
        clientHeight: el?.clientHeight ?? null,
        ...extra,
      };
      try {
        (window as any).__AUTO_DEBUG__ ??= [];
        (window as any).__AUTO_DEBUG__.push(payload);
      } catch {}
      console.warn('[AUTO_DEBUG]', payload);
    } catch {}
  }

  function setEnabled(on) {
    try {
      if (on) {
        timed.enable();
      } else {
        timed.disable();
      }
      enabled = !!on;
    } catch {
    }
  }

  function setSpeed(pxs) {
    const next = typeof pxs === 'number' ? pxs : Number(pxs);
    currentSpeed = Number.isFinite(next) ? next : 0;
    try {
      timed.setSpeedPxPerSec(currentSpeed);
    } catch {
    }
  }

  function setVelocity(pxs) {
    setSpeed(pxs);
  }

  function toggle() {
    if (enabled) {
      stop();
    } else {
      start();
    }
  }

  function cancelTick() {
    if (rafId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
    }
    rafId = null;
  }

  function scheduleTick() {
    if (rafId != null) return;
    lastTs = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
    rafId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(motorTick) : null;
  }

  function motorTick(ts: number) {
    rafId = null;
    if (!enabled) return;
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : ts || Date.now();
    const dtSec = lastTs ? Math.max(0, (now - lastTs) / 1000) : 0;
    lastTs = now;
    const pxPerSec = currentSpeed;
    const canonicalViewer = ensureViewerElement();
    if (canonicalViewer && scrollerEl !== canonicalViewer) {
      scrollerEl = canonicalViewer;
    }
    const el = canonicalViewer || scrollerEl;
    if (!el) {
      logAutoTick('tick', el, pxPerSec, dtSec, 'no-element');
      scheduleTick();
      return;
    }
    if (!Number.isFinite(dtSec) || dtSec <= 0 || pxPerSec <= 0) {
      scheduleTick();
      return;
    }
    logAutoTick('tick', el, pxPerSec, dtSec, 'pre-check');
    const style = getComputedStyle(el);
    if (!/(auto|scroll)/.test(style.overflowY || '')) {
      logAutoTick('tick', el, pxPerSec, dtSec, 'overflow-blocked', { overflowY: style.overflowY });
      scheduleTick();
      return;
    }
    const totalScrollHeight = el.scrollHeight || 0;
    const viewportHeight = el.clientHeight || 0;
    const room = Math.max(0, totalScrollHeight - viewportHeight);
    if (room <= 0) {
      logAutoTick('tick', el, pxPerSec, dtSec, 'no-room', { room });
      scheduleTick();
      return;
    }
    carry += pxPerSec * dtSec;
    const step = Math.trunc(carry);
    if (step <= 0) {
      scheduleTick();
      return;
    }
    carry -= step;
    const before = el.scrollTop || 0;
    const next = Math.min(room, before + step);
    markHybridProgrammaticScroll();
    el.scrollTop = next;
    const after = el.scrollTop || 0;
    if (after > before) {
      lastTickMoved = true;
      logAutoTick('tick', el, pxPerSec, dtSec, 'moved', { delta: after - before });
    } else {
      warnScrollWrite({
        id: el.id,
        className: el.className,
        before,
        after,
        room,
        overflowY: style.overflowY,
        position: style.position,
      });
    }
    scheduleTick();
  }

  function stop() {
    setEnabled(false);
    cancelTick();
  }

  function start() {
    if (enabled) {
      if (rafId == null) {
        autoTickDebugStart = 0;
        lastAutoTickLogAt = 0;
        logAutoTick('start', viewer ?? scrollerEl, currentSpeed, 0, 'already-enabled-resume');
        scheduleTick();
      }
      return;
    }
    setEnabled(true);
    lastTickMoved = false;
    carry = 0;
    autoTickDebugStart = 0;
    lastAutoTickLogAt = 0;
    logAutoTick('start', viewer ?? scrollerEl, currentSpeed, 0, 'enabled');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!enabled) return;
        scheduleTick();
      });
    });
  }

  function isRunning() {
    return enabled && lastTickMoved;
  }

  function getState() {
    return { enabled, speed: currentSpeed };
  }

  function tick(_now) {
    motorTick(_now);
  }

  return { setEnabled, setSpeed, setVelocity, stop, toggle, getState, tick, start, isRunning };
}

const HYBRID_LOG_THROTTLE_MS = 500;
const HYBRID_VERBOSE_FLAG = 'hybrid-dev';
let lastHybridScaleLogAt = 0;
let lastHybridPaceLogAt = 0;
let lastHybridBrakeLogAt = 0;
let lastHybridVelocityLogAt = 0;
const HYBRID_MOTOR_LOG_THROTTLE_MS = 500;
let lastHybridMotorVelocityLogAt = 0;
let lastHybridMotorVelocitySignature = '';
let lastHybridBrakeSignature = '';
let lastHybridVelocitySignature = '';
const isHybridVerboseDevMode = (() => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    return params.get(HYBRID_VERBOSE_FLAG) === '1';
  } catch {
    return false;
  }
})();

function logHybridPaceTelemetry(payload: any) {
  if (!isDevMode()) return;
  const now = nowMs();
  if (now - lastHybridPaceLogAt < HYBRID_LOG_THROTTLE_MS) return;
  lastHybridPaceLogAt = now;
  const summary = {
    mode: payload.mode,
    wpm: payload.wpm,
    finalTarget: payload.finalTarget,
    accelCap: payload.accelCap,
  };
  try {
    console.debug('[HYBRID_WPM]', summary);
  } catch {}
  if (isHybridVerboseDevMode) {
    try {
      console.debug(`[HYBRID_WPM] ${JSON.stringify(payload)}`);
    } catch {}
  }
}

function logHybridScaleDetail(obj: any) {
  if (!isDevMode()) return;
  if (state2.mode !== 'hybrid') return;
  const now = nowMs();
  if (now - lastHybridScaleLogAt < HYBRID_LOG_THROTTLE_MS) return;
  lastHybridScaleLogAt = now;
  const summary = {
    basePxps: obj.basePxps,
    chosenScale: obj.chosenScale,
    reason: obj.reason,
    graceActive: obj.graceActive,
    pauseLikely: !!obj.pauseLikely,
    offScriptActive: !!obj.offScriptActive,
    pausedBySilence: !!obj.pausedBySilence,
    onScriptStreak,
    onScriptLocked: !!obj.onScriptLocked,
  };
  try {
    console.info('[HYBRID] scale detail', summary);
  } catch {}
  if (isHybridVerboseDevMode) {
    try {
      console.info(`[HYBRID] scale detail ${JSON.stringify(obj)}`);
    } catch {}
  }
}

function logHybridBrakeEvent(payload: any) {
  if (!isDevMode()) return;
  if (state2.mode !== 'hybrid') return;
  const now = nowMs();
  const ttl = Math.max(0, (payload.brakeExpiresAt ?? 0) - (payload.now ?? now));
  const shouldLog = payload.graceActive || payload.brakeActive || ttl > 0;
  if (!shouldLog) return;
  const signature = `${payload.brakeFactor.toFixed(3)}|${payload.brakeReason ?? ''}|${payload.brakeActive ? '1' : '0'}|${payload.motorRunning ? 'r' : 's'}`;
  const changed = signature !== lastHybridBrakeSignature;
  if (!changed && now - lastHybridBrakeLogAt < HYBRID_LOG_THROTTLE_MS) return;
  lastHybridBrakeSignature = signature;
  lastHybridBrakeLogAt = now;
  const desc = [
    `brake=${payload.brakeFactor.toFixed(3)}`,
    `ttl=${Math.round(ttl)}`,
    `reason=${payload.brakeReason ?? 'none'}`,
  ];
  if (payload.graceActive) desc.push('grace');
  try {
    console.info(`[HYBRID_BRAKE] ${desc.join(' ')}`, payload);
  } catch {}
}

function logHybridVelocityEvent(payload: any) {
  if (!isDevMode()) return;
  if (state2.mode !== 'hybrid') return;
  const meaningful =
    payload.motorRunning ||
    payload.brakeTtl > 0 ||
    payload.assistBoost > 0 ||
    payload.graceActive ||
    payload.chosenScale < 0.999;
  if (!meaningful) return;
  const now = nowMs();
  const signature = `${payload.velocity.toFixed(2)}|${payload.brakeFactor.toFixed(3)}|${payload.assistBoost.toFixed(3)}|${payload.reason}|${payload.brakeActive ? 'b' : ''}|${payload.assistActive ? 'a' : ''}|${payload.motorRunning ? 'r' : 's'}`;
  const changed = signature !== lastHybridVelocitySignature;
  if (!changed && now - lastHybridVelocityLogAt < HYBRID_LOG_THROTTLE_MS) return;
  lastHybridVelocitySignature = signature;
  lastHybridVelocityLogAt = now;
  const clampState = payload.chosenScale < 0.999 ? 'clamped' : 'free';
  const summary = [
    `base=${payload.basePxps.toFixed(1)}`,
    `eff=${payload.velocity.toFixed(1)}`,
    `scale=${payload.chosenScale.toFixed(2)}`,
    `clamp=${clampState}`,
    `brake=${payload.brakeFactor.toFixed(2)}${payload.brakeActive ? ` ttl=${Math.round(payload.brakeTtl)}` : ''}`,
    `assist=${payload.assistBoost.toFixed(1)}${payload.assistActive ? ` ttl=${Math.round(payload.assistTtl)}` : ''}`,
    `reason=${payload.reason}`,
  ];
  try {
    console.info(`[HYBRID_VELOCITY] ${summary.join(' ')}`, payload);
  } catch {}
}

  function logHybridMotorEvent(evt: string, data?: any) {
    if (!isDevMode()) return;
    if (state2.mode !== 'hybrid') return;
    if (evt === 'velocity') {
      const now = nowMs();
      const signature = `${Number(data?.velocityPxPerSec ?? 0).toFixed(2)}`;
      if (signature === lastHybridMotorVelocitySignature && now - lastHybridMotorVelocityLogAt < HYBRID_MOTOR_LOG_THROTTLE_MS) return;
      lastHybridMotorVelocitySignature = signature;
      lastHybridMotorVelocityLogAt = now;
    }
    try {
      console.debug('[HybridMotor]', evt, data);
    } catch {}
  }

function convertWpmToPxPerSec(targetWpm: number) {
  try {
    const doc = document.documentElement;
    const cs = getComputedStyle(doc);
    const fsPx = parseFloat(cs.getPropertyValue("--tp-font-size")) || DEFAULT_SCRIPT_FONT_PX;
    const lhScale = parseFloat(cs.getPropertyValue("--tp-line-height")) || 1.4;
    const lineHeightPx = fsPx * lhScale;
    const wpl = parseFloat(localStorage.getItem("tp_wpl_hint") || "8") || 8;
    const pxPerSec = (targetWpm / 60 / wpl) * lineHeightPx;
    try {
      console.info(
        `[WPM_CONVERT] ${JSON.stringify({
          targetWpm,
          fsPx,
          lhScale,
          lineHeightPx,
          wpl,
          pxPerSec,
        })}`,
      );
    } catch {}
    return pxPerSec;
  } catch {
    return 0;
  }
}

// src/asr/v2/paceEngine.ts
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
function createPaceEngine() {
  let mode = "assist";
  let caps = {
    base: { minPxs: 8, maxPxs: 360 },
    final: { minPxs: 10, maxPxs: 220 },
    accelCap: 60,
    decayMs: 250,
  };
  let sens = 1;
  let _catchup = "off";
  let target = 0;
  let baseTarget = 0;
  let lastUpdate = performance.now();
  let lastWpm;
  const DEAD_WPM = 8;
  const ALPHA = 0.3;
  const SPEAKING_PXS = 45;
  function mapWpmToPxPerSec(wpm, doc) {
    try {
      const cs = getComputedStyle(doc.documentElement);
      const fsPx = parseFloat(cs.getPropertyValue("--tp-font-size")) || DEFAULT_SCRIPT_FONT_PX;
      const lhScale = parseFloat(cs.getPropertyValue("--tp-line-height")) || 1.4;
      const lineHeightPx = fsPx * lhScale;
      const wpl = parseFloat(localStorage.getItem("tp_wpl_hint") || "8") || 8;
      const linesPerSec = wpm / 60 / wpl;
      return linesPerSec * lineHeightPx;
    } catch {
      return wpm / 60 / 8 * (DEFAULT_SCRIPT_FONT_PX * 1.4);
    }
  }
  function setMode(m) {
    mode = m;
  }
  function setCaps(c) {
    const { base, final, minPxs, maxPxs, accelCap, decayMs } = c;
    if (base) {
      caps.base = { ...caps.base, ...base };
    }
    if (final) {
      caps.final = { ...caps.final, ...final };
    }
    if (typeof minPxs === "number") {
      caps.base.minPxs = minPxs;
      caps.final.minPxs = minPxs;
    }
    if (typeof maxPxs === "number") {
      caps.base.maxPxs = maxPxs;
      caps.final.maxPxs = maxPxs;
    }
    if (typeof accelCap === "number") caps.accelCap = accelCap;
    if (typeof decayMs === "number") caps.decayMs = decayMs;
  }
  function setSensitivity(mult) {
    sens = clamp(mult, 0.5, 1.5);
  }
  function setCatchupBias(level) {
    _catchup = level;
  }
  function consume(tempo, speaking2) {
    const now = performance.now();
    const dt = Math.max(1e-3, (now - lastUpdate) / 1e3);
    lastUpdate = now;
    if (mode === "vad") {
      const tgt = speaking2 ? SPEAKING_PXS : target * Math.pow(0.85, dt * (1e3 / caps.decayMs));
      const maxStep = caps.accelCap * dt;
      const next = target + clamp(tgt - target, -maxStep, maxStep);
      const nextBase = clamp(next, caps.base.minPxs, caps.base.maxPxs);
      baseTarget = nextBase;
      target = clamp(baseTarget, caps.final.minPxs, caps.final.maxPxs);
      return;
    }
    let wpm = tempo.wpm;
    if ((wpm == null || !isFinite(wpm)) && speaking2) {
      const baseline = parseFloat(localStorage.getItem("tp_baseline_wpm") || "120") || 120;
      wpm = baseline;
    }
    if (wpm == null || !isFinite(wpm)) return;
    if (!(lastWpm != null && Math.abs(wpm - lastWpm) < DEAD_WPM)) {
      lastWpm = wpm;
      const pxsRaw = mapWpmToPxPerSec(wpm, document) * sens;
      const smoothed = target === 0 ? pxsRaw : ALPHA * pxsRaw + (1 - ALPHA) * target;
      const maxStep = caps.accelCap * dt;
      const next = target + clamp(smoothed - target, -maxStep, maxStep);
      const nextBase = clamp(next, caps.base.minPxs, caps.base.maxPxs);
      baseTarget = nextBase;
      target = clamp(baseTarget, caps.final.minPxs, caps.final.maxPxs);
      logHybridPaceTelemetry({
        mode,
        wpm,
        pxsRaw: Number(pxsRaw.toFixed(2)),
        smoothed: Number(smoothed.toFixed(2)),
        baseTarget: Number(baseTarget.toFixed(2)),
        finalTarget: Number(target.toFixed(2)),
        baseCaps: { ...caps.base },
        finalCaps: { ...caps.final },
        accelCap: caps.accelCap,
      });
    }
  }
  function getTargetPxs() {
    return clamp(target, caps.final.minPxs, caps.final.maxPxs);
  }
  return { setMode, setCaps, setSensitivity, setCatchupBias, consume, getTargetPxs };
}

// src/asr/v2/orchestrator.ts
function createOrchestrator() {
  const synth = createFeatureSynth();
  const engine = createPaceEngine();
  const motor = createAutoMotor();
  let mode = "assist";
  let started = false;
  let adapter = null;
  let unsub = null;
  let asrErrUnsub = null;
  const errors = [];
  const ModeAliases = { wpm: "assist", asr: "assist", vad: "vad", align: "align", assist: "assist" };
  function setMode(m) {
    const norm = ModeAliases[m] || m;
    mode = norm;
    engine.setMode(mode);
  }
  function setGovernor(c) {
    engine.setCaps(c);
  }
  function setSensitivity(mult) {
    engine.setSensitivity(mult);
  }
  function setAlignStrategy(_s) {
  }
  function getStatus() {
    const tempo = synth.getTempo();
    return { mode, wpm: tempo.wpm, speaking: synth.getSpeaking(), targetPxs: engine.getTargetPxs(), errors: [...errors] };
  }
  async function start(a) {
    if (started) return;
    adapter = a;
    let restarts = 0;
    unsub = a.onFeature((f) => {
      try {
        synth.push(f);
        const tempo = synth.getTempo();
        const speaking2 = synth.getSpeaking();
        engine.consume(tempo, speaking2);
        const pxs = engine.getTargetPxs();
        try {
          motor.setVelocity(pxs);
        } catch {
        }
      } catch {
      }
    });
    await a.start();
    started = true;
    // Don't enable motor here - let applyGate() control it based on userEnabled and speechActive
    // This ensures proper pre-roll and speech lifecycle control
    // try {
    //   motor.setEnabled(true);
    // } catch {
    // }
    try {
      const onErr = () => {
        if (restarts++ === 0) {
          setTimeout(async () => {
            try {
              await adapter?.start();
              if (window.toast) window.toast("ASR restarted");
            } catch {
            }
          }, 300);
        } else {
          setMode("vad");
          try {
            if (window.toast) window.toast("ASR unstable \u2192 VAD fallback");
          } catch {
          }
        }
      };
      const h = onErr;
    window.addEventListener("tp:asr:error", h);
    asrErrUnsub = () => {
      try {
        window.removeEventListener("tp:asr:error", h);
        } catch {
        }
      };
    } catch {
    }
  }
  async function stop() {
    try {
      unsub?.();
      unsub = null;
    } catch {
    }
    try {
      await adapter?.stop();
    } catch {
    }
    try {
      asrErrUnsub?.();
      asrErrUnsub = null;
    } catch {
    }
    adapter = null;
    started = false;
  }
  return { start, stop, setMode, setGovernor, setSensitivity, setAlignStrategy, getStatus };
}

// src/settings/uiPrefs.ts
var KEY = "tp_ui_prefs_v1";
var state = (() => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    return { linkTypography: false, hybridGate: "db_or_vad", hybridUseProfileId: parsed.hybridUseProfileId || null, ...parsed };
  } catch {
    return { linkTypography: false, hybridGate: "db_or_vad", hybridUseProfileId: null };
  }
})();
var subs = /* @__PURE__ */ new Set();
var getUiPrefs = () => state;
var onUiPrefs = (fn) => (subs.add(fn), () => subs.delete(fn));

// src/features/scroll-router.ts
var LS_KEY = "scrollMode";
var LEGACY_LS_KEYS = ["tp_scroll_mode_v1", "tp_scroll_mode"];
var DEFAULTS = {
  mode: "hybrid",
  step: { holdCreep: 8 },
  hybrid: { attackMs: 150, releaseMs: 350, thresholdDb: -42, silenceStopMs: 1500 }
};
var state2 = { ...DEFAULTS };
var viewer = null;
function ensureViewerElement() {
  if (!viewer) {
    try {
      viewer = document.getElementById('viewer');
    } catch {
      viewer = null;
    }
  }
  return viewer;
}
function hasScrollableTarget() {
  const el = ensureViewerElement();
  if (!el) return false;
  try {
    return el.scrollHeight > el.clientHeight;
  } catch {
    return true;
  }
}
const scrollWriter = getScrollWriter();
try {
  const origScrollTo = scrollWriter?.scrollTo?.bind(scrollWriter);
  if (origScrollTo) {
    scrollWriter.scrollTo = (y: number, opts?: { behavior?: string }) => {
      scrollWrite(y, { from: 'scrollWriter.scrollTo', reason: 'hooked' });
      return origScrollTo(y, opts);
    };
  }
  const origScrollBy = scrollWriter?.scrollBy?.bind(scrollWriter);
  if (origScrollBy) {
    scrollWriter.scrollBy = (delta: number, opts?: { behavior?: string }) => {
      const target = (() => {
        try {
          const el = viewer ?? scrollerEl ?? (typeof document !== 'undefined' ? document.getElementById('viewer') : null);
          if (!el) return null;
          return Math.max(0, el.scrollTop + delta);
        } catch {
          return null;
        }
      })();
      if (typeof target === 'number') {
        scrollWrite(target, { from: 'scrollWriter.scrollBy', reason: 'hooked' });
      }
      return origScrollBy(delta, opts);
    };
  }
} catch (err) {
  try {
    console.warn('[SCROLL_WRITE] hook failed', err);
  } catch {}
}

function isCiAutoSmoke(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    const flags = ['ci', 'mockFolder', 'uiMock', 'noRelax'];
    for (const flag of flags) {
      if (params.get(flag) === '1') return true;
    }
    const hash = window.location.hash || '';
    if (hash.includes('ci=1') || hash.includes('mockFolder=1') || hash.includes('uiMock=1') || hash.includes('noRelax=1')) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

let smokeAutoMovementScheduled = false;
function scheduleCiAutoMovement(): void {
  if (!isCiAutoSmoke()) return;
  if (smokeAutoMovementScheduled) return;
  smokeAutoMovementScheduled = true;
  setTimeout(() => {
    smokeAutoMovementScheduled = false;
    try {
      scrollWriter.scrollBy?.(4, { behavior: 'auto' });
    } catch {}
    try {
      const viewer = typeof document !== 'undefined' ? document.getElementById('viewer') as HTMLElement | null : null;
      if (viewer) {
        const room = Math.max(0, (viewer.scrollHeight || 0) - (viewer.clientHeight || 0));
        if (room > 0) {
          const next = Math.min(room, (viewer.scrollTop || 0) + 4);
          viewer.scrollTop = next;
        }
      }
    } catch {}
  }, 150);
}
const hybridMotor = createHybridWpmMotor({
  getWriter: () => scrollWriter,
  getScrollTop: () => (viewer ? (viewer.scrollTop || 0) : 0),
  getMaxScrollTop: () => (viewer ? Math.max(0, viewer.scrollHeight - viewer.clientHeight) : Number.POSITIVE_INFINITY),
  log: isDevMode() ? logHybridMotorEvent : () => {},
});
try {
  (window as any).__tpHybridMotor = hybridMotor;
} catch {}
function refreshHybridWriter() {
  try {
    hybridMotor.setWriter(viewer ?? scrollerEl ?? null);
  } catch {}
}
const HYBRID_SILENCE_SOFT_MS = 3000;
const HYBRID_PAUSE_SILENCE_SOFT_MS = 7500;
const HYBRID_SILENCE_HARD_STOP_MS = 25000;
const LIVE_GRACE_MS = 1800;
const OFFSCRIPT_MILD = 0.75;
const OFFSCRIPT_DEEP = 0.55;
const RECOVERY_SCALE = 1;
const HYBRID_ON_SCRIPT_SIM = 0.32;
const HYBRID_OFFSCRIPT_MILD_SIM = 0.2;
const HYBRID_GRACE_DURATION_MS = 900;
const OFFSCRIPT_SCALE = 0.85;
const SILENCE_SCALE = 0.65;
const PAUSE_DRIFT_SCALE = 0.95;
const PAUSE_LOOKAHEAD_LINES = 10;
const HYBRID_PAUSE_TOKENS = ['[pause]', '[beat]', '[reflective pause]'] as const;
const GRACE_MIN_SCALE = 0.9;
const HYBRID_BASELINE_FLOOR_PXPS = 24;
const HYBRID_ASSIST_CAP_FRAC = 0.35;
const HYBRID_EVENT_TTL_MIN = 20;
const HYBRID_EVENT_TTL_MAX = 2000;
const HYBRID_BRAKE_DEFAULT_TTL = 320;
const HYBRID_ASSIST_DEFAULT_TTL = 320;
const HYBRID_ASSIST_MAX_BOOST = 420;
const OFFSCRIPT_EVIDENCE_THRESHOLD = 4;
const OFFSCRIPT_EVIDENCE_RESET_MS = 2200;
const OFFSCRIPT_DECAY_T1_MS = 2000;
const OFFSCRIPT_DECAY_T2_MS = 6000;
const OFFSCRIPT_DECAY_T3_MS = 10000;
const OFFSCRIPT_DECAY_T4_MS = 12000;
const OFFSCRIPT_DECAY_CRAWL = 0.1;
const ON_SCRIPT_LOCK_HOLD_MS = 1500;
const PAUSE_ASSIST_TAIL_MS = 2000;
const IGNORED_ASR_PURSUIT_LOG_THROTTLE_MS = 2000;
const MANUAL_SCROLL_LOG_THROTTLE_MS = 1500;
const PROGRAMMATIC_WRITER_GRACE_MS = 250;
const PROGRAMMATIC_WRITER_LOG_THROTTLE_MS = 1000;
const HYBRID_CTRL_LOG_THROTTLE_MS = 500;
const HYBRID_CTRL_CONF_MIN = 0.25;
const HYBRID_CTRL_ANCHOR_RECENCY_MS = 2500;
const HYBRID_CTRL_ENABLED = (() => {
  if (typeof window === 'undefined') return false;
  let manualOverride = false;
  try {
    const current = window.location.href || window.location.hash || window.location.search || '';
    const url = new URL(current, window.location.origin || undefined);
    const fromSearch = url.searchParams.get('hybridCtrl');
    const fromHash = new URLSearchParams((url.hash || '').replace(/^#/, '')).get('hybridCtrl');
    if (fromSearch === '1' || fromHash === '1') manualOverride = true;
    if ((window as any).__TP_HYBRID_CTRL === true) manualOverride = true;
  } catch {
    try {
      if ((window as any).__TP_HYBRID_CTRL === true) manualOverride = true;
    } catch {}
  }
  if (manualOverride) return true;
  return state2.mode === 'hybrid';
})();
try {
  if (typeof window !== 'undefined') {
    console.info('[HYBRID_CTRL] flag', {
      href: window.location.href,
      enabled: HYBRID_CTRL_ENABLED,
    });
  }
} catch {}
const HYBRID_CTRL_KP = 0.22;
const HYBRID_CTRL_ASSIST_MAX = 1.25;
const HYBRID_CTRL_BRAKE_MIN = 0.65;
const HYBRID_CTRL_MIN_MULT = 0.9;
const HYBRID_CTRL_SILENCE_SHORT_MS = 700;
const HYBRID_CTRL_SILENCE_LONG_MS = 2000;
const HYBRID_CTRL_SILENCE_SHORT_CAP = 0.75;
const HYBRID_CTRL_SILENCE_LONG_CAP = 0.6;
const HYBRID_CTRL_LINE_PX_DEFAULT = 56;
const HYBRID_CTRL_DRIFT_WEAK_PX = 160;
const HYBRID_CTRL_MIN_PXPS = 12;
const HYBRID_CTRL_OFFSCRIPT_SIM_THRESHOLD = 0.45;
const HYBRID_CTRL_OFFSCRIPT_LINE_DELTA = 3;
const HYBRID_CTRL_OFFSCRIPT_PENALTY = 0.35;
const HYBRID_CTRL_LINE_ERROR_RANGE = 16;
const HYBRID_CTRL_LINE_CURVE_EXP = 1.6;
const HYBRID_CTRL_LINE_POS_MULT_DELTA = 0.9;
const HYBRID_CTRL_LINE_NEG_MULT_DELTA = 0.5;
const HYBRID_CTRL_LINE_MAX_MULT = 1.9;
const HYBRID_CTRL_LINE_MIN_MULT = 0.5;
const HYBRID_CTRL_LINE_SMOOTH_TAU_MS = 450;
const HYBRID_CTRL_LINE_RATE_LIMIT_PER_SEC = 0.8;
const HYBRID_CTRL_LINE_RATE_LIMIT_BEHIND_MULT = 4;
const HYBRID_ON_TARGET_PX = 32;
const HYBRID_CTRL_ON_TARGET_STABLE_PX = 12;
const HYBRID_CTRL_ON_TARGET_MULT_MIN = 0.98;
const HYBRID_CTRL_ON_TARGET_MULT_MAX = 1.05;
const HYBRID_CTRL_ON_TARGET_VELOCITY_EPS = 12;
const HYBRID_CTRL_MODE_DEADBAND_LINES = 3;
const HYBRID_CTRL_BASE_MAX_MULT = 2.8;
const HYBRID_CTRL_AGGRO_MAX_MULT = 3.2;
const HYBRID_REACTIVE_BEHIND_BASE = 0.55;
const HYBRID_REACTIVE_BEHIND_ACC_THRESHOLD = 2;
const HYBRID_REACTIVE_BEHIND_ACC_BONUS = 0.25;
const HYBRID_CTRL_ASSIST_BEHIND_BOOST_FRAC = 0.15;
const HYBRID_ON_TARGET_LINES = 0.92;
const HYBRID_MULT_DEBUG_THROTTLE_MS = 500;
const HYBRID_ONSCRIPT_SIM_MIN = 0.74;
type HybridCtrlLineSource = 'lines' | 'px' | 'none';
const HYBRID_CTRL_PARAM_ENABLED = (() => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    return params.get('hybridCtrl') === '1';
  } catch {
    return false;
  }
})();
const HYBRID_CTRL_DEV_OVERRIDE_PHASES_MS = [3000, 6000, 10000];
const HYBRID_CTRL_DEV_OVERRIDE_MULTS = [1.4, 0.7, 1.0];
const HYBRID_CTRL_DEV_OVERRIDE_DURATION_MS = 10000;
let hybridCtrlDevOverrideStart: number | null = null;
let hybridCtrlDevOverrideDone = false;
let lastHybridMultDebugAt = 0;

function getHybridCtrlDevOverride(now: number) {
  if (
    !HYBRID_CTRL_ENABLED ||
    !HYBRID_CTRL_PARAM_ENABLED ||
    hybridCtrlDevOverrideDone ||
    typeof window === 'undefined'
  ) {
    return null;
  }
  if (hybridCtrlDevOverrideStart === null) {
    hybridCtrlDevOverrideStart = now;
  }
  const elapsed = Math.max(0, now - hybridCtrlDevOverrideStart);
  if (elapsed >= HYBRID_CTRL_DEV_OVERRIDE_DURATION_MS) {
    hybridCtrlDevOverrideDone = true;
    return null;
  }
  for (let i = 0; i < HYBRID_CTRL_DEV_OVERRIDE_PHASES_MS.length; i += 1) {
    if (elapsed < HYBRID_CTRL_DEV_OVERRIDE_PHASES_MS[i]) {
      return HYBRID_CTRL_DEV_OVERRIDE_MULTS[i];
    }
  }
  return null;
}
let lastHybridGateFingerprint: string | null = null;
let lastAsrMatch = { currentIndex: -1, bestIndex: -1, bestSim: NaN };
let hybridLastMatch: { bestIdx: number; bestSim: number; isFinal: boolean; ts: number } | null = null;
let hybridMatchSeen = false;
let hybridLastNoMatch: boolean | null = null;
const HYBRID_HARD_NOMATCH_SIM_MIN = 0.25;

function getHybridMatchState() {
  const matchSim =
    hybridMatchSeen && Number.isFinite(hybridLastMatch?.bestSim ?? NaN)
      ? hybridLastMatch!.bestSim
      : Number.isFinite(lastAsrMatch?.bestSim ?? NaN)
      ? lastAsrMatch.bestSim
      : null;
  const simFinite = Number.isFinite(matchSim ?? NaN);
  const simValue = simFinite ? (matchSim as number) : null;
  const sawNoMatch = hybridLastNoMatch === true;
  const hardNoMatch =
    sawNoMatch && (!simFinite || (simValue != null && simValue < HYBRID_HARD_NOMATCH_SIM_MIN));
  const weakMatch =
    hybridMatchSeen &&
    !hardNoMatch &&
    (!simFinite || (simValue != null && simValue < HYBRID_ONSCRIPT_SIM_MIN));
  return {
    bestSim: simValue,
    sawNoMatch,
    weakMatch,
    hardNoMatch,
  };
}

function isHybridDriftWeak(errorInfo: ReturnType<typeof computeHybridErrorPx> | null) {
  if (!errorInfo) return false;
  const deltaPx =
    Number.isFinite(errorInfo.errorPx ?? NaN) && errorInfo.errorPx != null
      ? errorInfo.errorPx
      : null;
  if (deltaPx == null) return false;
  const sameLineByHint =
    Number.isFinite(errorInfo.bestIdx ?? NaN) &&
    Number.isFinite(errorInfo.markerIdx ?? NaN) &&
    errorInfo.bestIdx === errorInfo.markerIdx;
  const bestIdx =
    Number.isFinite(lastAsrMatch.bestIndex ?? NaN) && lastAsrMatch.bestIndex >= 0
      ? lastAsrMatch.bestIndex
      : null;
  const currentIdx =
    Number.isFinite(lastAsrMatch.currentIndex ?? NaN) && lastAsrMatch.currentIndex >= 0
      ? lastAsrMatch.currentIndex
      : null;
  const sameLineByMatch = bestIdx != null && currentIdx != null && bestIdx === currentIdx;
  if (!sameLineByHint && !sameLineByMatch) return false;
  return Math.abs(deltaPx) >= HYBRID_CTRL_DRIFT_WEAK_PX;
}

let hybridBasePxps = 0;
let hybridScale = RECOVERY_SCALE;
let hybridBrakeState = { factor: 1, expiresAt: 0, reason: null as string | null };
let hybridAssistState = { boostPxps: 0, expiresAt: 0, reason: null as string | null };
let pauseAssistTailBoost = 0;
let pauseAssistTailUntil = 0;
let lastIgnoredAsrPursuitLogAt = 0;
let hybridVelocityRefreshRaf: number | null = null;
let hybridTargetHintState:
  | {
      top: number;
      confidence: number;
      reason?: string;
      ts: number;
      anchorTop?: number | null;
      markerPct?: number | null;
      lineIndex?: number | null;
    }
  | null = null;

// --- Hybrid commit boost window ---------------------------------------------
let hybridCommitBoostUntilMs = 0;

function armHybridCommitBoostWindow(reason?: string): void {
  if (reason !== 'asr-commit') return;
  const durMs = isHybridAggroEnabled() ? 1750 : 750;
  const until = nowMs() + durMs;
  if (until > hybridCommitBoostUntilMs) hybridCommitBoostUntilMs = until;
}

function isHybridCommitBoostActive(): boolean {
  return nowMs() < hybridCommitBoostUntilMs;
}
let hybridLastGoodTargetTop: number | null = null;
let hybridWantedRunning = false;
let liveGraceWindowEndsAt: number | null = null;
let lastManualScrollBrakeLogAt = 0;
type ProgrammaticWriterKind = 'asr' | 'writer' | 'other';
type ProgrammaticWriterStamp = { at: number; source: string; kind: ProgrammaticWriterKind };
let lastProgrammaticWriterStamp: ProgrammaticWriterStamp | null = null;
let lastProgrammaticWriterLogAt = 0;
let lastHybridCtrlLogAt = 0;
const hybridCtrl = {
  mult: 1,
  lastTs: 0,
  lastErrorPx: 0,
  lastAnchorTs: 0,
  engagedLogged: false,
  lineMult: 1,
  lineTargetMult: 1,
  lineSource: 'none' as HybridCtrlLineSource,
};
let hybridSessionPhase = 'idle';
function getHybridSessionPhase() {
  return hybridSessionPhase;
}
function isPauseTokenText(text?: string | null) {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return HYBRID_PAUSE_TOKENS.some((token) => normalized.includes(token));
}
function getAsrParaText(entry: any): string {
  if (!entry) return '';
  const candidates: Array<string | undefined> = [
    typeof entry.key === 'string' ? entry.key : undefined,
    typeof entry.text === 'string' ? entry.text : undefined,
    typeof entry.lineText === 'string' ? entry.lineText : undefined,
    typeof entry.paragraph === 'string' ? entry.paragraph : undefined,
    typeof entry.raw === 'string' ? entry.raw : undefined,
    typeof entry.html === 'string' ? entry.html : undefined,
    entry?.el?.textContent,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

function isPlannedPauseLikely() {
  if (typeof window === 'undefined') return false;
  const rawParaIndex = Array.isArray((window as any).paraIndex) ? (window as any).paraIndex : [];
  if (!rawParaIndex.length) return false;
  const bestIdx =
    Number.isFinite(lastAsrMatch.bestIndex) && lastAsrMatch.bestIndex >= 0
      ? Math.floor(lastAsrMatch.bestIndex)
      : -1;
  const currentIdx =
    Number.isFinite(lastAsrMatch.currentIndex) && lastAsrMatch.currentIndex >= 0
      ? Math.floor(lastAsrMatch.currentIndex)
      : -1;
  let baseIndex = bestIdx >= 0 ? bestIdx : currentIdx;
  if (baseIndex < 0) {
    const fallbackRaw = typeof (window as any).currentIndex === 'number' ? (window as any).currentIndex : -1;
    baseIndex = Number.isFinite(fallbackRaw) && fallbackRaw >= 0 ? Math.floor(fallbackRaw) : -1;
  }
  if (baseIndex < 0) return false;
  const lookahead = Math.max(1, PAUSE_LOOKAHEAD_LINES);
  const start = Math.max(0, Math.min(rawParaIndex.length - 1, baseIndex));
  const end = Math.min(rawParaIndex.length - 1, start + lookahead);
  for (let idx = start; idx <= end; idx++) {
    const entry = rawParaIndex[idx];
    const paragraphText = getAsrParaText(entry);
    if (isPauseTokenText(paragraphText)) {
      return true;
    }
  }
  return false;
}
function computeHybridSilenceDelayMs() {
  return isPlannedPauseLikely() ? HYBRID_PAUSE_SILENCE_SOFT_MS : HYBRID_SILENCE_SOFT_MS;
}
function getTranscriptText(detail: any) {
  const fromField = (detail?.transcript ?? detail?.text ?? detail?.transcriptText) as string | undefined;
  if (typeof fromField === 'string' && fromField.trim()) return fromField.trim();
  if (Array.isArray(detail?.nBest) && detail.nBest.length > 0) {
    const first = detail.nBest[0];
    if (typeof first?.transcript === 'string' && first.transcript.trim()) {
      return first.transcript.trim();
    }
  }
  if (detail?.bestTranscript) {
    const v = String(detail.bestTranscript).trim();
    if (v) return v;
  }
  if (detail?.result) {
    const candidate = detail.result.transcript ?? detail.result.text;
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}
function isWeakNoMatch(detail: any) {
  if (!detail) return true;
  const transcript = getTranscriptText(detail);
  if (!transcript) return true;
  const words = transcript.split(/\s+/).filter(Boolean).length;
  return words < 3 || transcript.length < 12;
}
let sliderTouchedThisSession = false;
let offScriptEvidence = 0;
let lastOffScriptEvidenceTs = 0;

function scheduleHybridVelocityRefresh() {
  if (!shouldHybridRefresh()) {
    stopHybridVelocityRefresh();
    return;
  }
  if (hybridVelocityRefreshRaf != null) return;
  if (typeof window === "undefined") return;
  hybridVelocityRefreshRaf = window.requestAnimationFrame(() => {
    hybridVelocityRefreshRaf = null;
    if (state2.mode !== "hybrid") return;
    const now = nowMs();
    if (!shouldHybridRefresh(now)) {
      stopHybridVelocityRefresh();
      return;
    }
      try {
        runHybridVelocity(hybridSilence);
      } catch (err) {
      if (isDevMode()) {
        try {
          console.warn('[HYBRID] velocity refresh failed', err);
        } catch {}
      }
    }
  });
}

function cancelHybridVelocityRefresh() {
  if (hybridVelocityRefreshRaf != null && typeof window !== "undefined") {
    try {
      window.cancelAnimationFrame(hybridVelocityRefreshRaf);
    } catch {
      // ignore
    }
  }
  hybridVelocityRefreshRaf = null;
  hybridBrakeState = { factor: 1, expiresAt: 0, reason: null };
  hybridAssistState = { boostPxps: 0, expiresAt: 0, reason: null };
  hybridTargetHintState = null;
}

function stopHybridVelocityRefresh() {
  if (hybridVelocityRefreshRaf != null && typeof window !== "undefined") {
    try {
      window.cancelAnimationFrame(hybridVelocityRefreshRaf);
    } catch {
      // ignore
    }
  }
  hybridVelocityRefreshRaf = null;
}

function shouldHybridRefresh(now: number = nowMs()) {
  if (state2.mode !== "hybrid") return false;
  if (hybridMotor.isRunning()) return true;
  if (isHybridGraceActive(now)) return true;
  const brakeActive = hybridBrakeState.expiresAt > now;
  if (brakeActive) return true;
  if (hybridAssistState.expiresAt > now) return true;
  if (hybridTargetHintState != null) return true;
  return false;
}
let offScriptStreak = 0;
let onScriptStreak = 0;
let lastGoodMatchAtMs = 0;
let hybridGraceUntil = 0;
const WPM_USER_DEDUPE_MS = 600;
let lastUserWpmPx = 0;
let lastUserWpmAt = 0;
  const WPM_USER_SOURCES = new Set(["slider-change", "slider-input", "sidebar"]);
let liveSessionWpmLocked = false;
let wpmSliderUserTouched = false;
let suppressWpmUiEcho = false;
let lastWpmIntent: { wpm: number; source?: string; at: number } | null = null;
let userWpmLocked = false;

function setHybridBrake(factor: number, ttlMs: number, reason: string | null = null) {
  const safeFactor = Number.isFinite(factor) ? clamp(factor, 0, 1) : 1;
  const rawTtl = Number.isFinite(ttlMs) ? ttlMs : 0;
  const ttl = Math.max(0, Math.min(HYBRID_EVENT_TTL_MAX, rawTtl));
  const now = nowMs();
  const expiresAt = ttl > 0 ? now + ttl : 0;
  hybridBrakeState = {
    factor: safeFactor,
    expiresAt,
    reason,
  };
  scheduleHybridVelocityRefresh();
  runHybridVelocity(hybridSilence);
  if (isDevMode()) {
    let shouldLogBrake = true;
    if (reason === 'manual-scroll') {
      const elapsed = now - lastManualScrollBrakeLogAt;
      if (elapsed < MANUAL_SCROLL_LOG_THROTTLE_MS) {
        shouldLogBrake = false;
      } else {
        lastManualScrollBrakeLogAt = now;
      }
    }
    if (shouldLogBrake) {
      try {
        console.info('[HYBRID_BRAKE] set', {
          factor: safeFactor,
          ttl,
          expiresAt: hybridBrakeState.expiresAt,
          reason: hybridBrakeState.reason,
        });
      } catch {}
    }
  }
}


function recordUserWpmPx(pxs: number) {
  lastUserWpmPx = pxs > 0 ? pxs : 0;
  lastUserWpmAt = nowMs();
}

function markSliderInteraction() {
  wpmSliderUserTouched = true;
}

function noteWpmIntent(wpm: number, source?: string) {
  lastWpmIntent = { wpm, source, at: nowMs() };
  if (!userWpmLocked && source === 'sidebar') {
    userWpmLocked = true;
    try {
      console.info('[WPM_INTENT] userWpmLocked=1 (first touch)', { wpm, source });
    } catch {}
  }
}

function scheduleWpmUiEventReset() {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(() => {
      suppressWpmUiEcho = false;
    });
  } else {
    setTimeout(() => {
      suppressWpmUiEcho = false;
    }, 0);
  }
}

function setSliderValueSilently(el: HTMLInputElement, value: string) {
  suppressWpmUiEcho = true;
  el.value = value;
  scheduleWpmUiEventReset();
}

function isSliderWpmSource(source?: unknown) {
  return typeof source === "string" && WPM_USER_SOURCES.has(source);
}

function startHybridGrace(reason: string) {
  const now = nowMs();
  setHybridBrake(1, 0, reason ?? 'grace-reset');
  hybridGraceUntil = now + HYBRID_GRACE_DURATION_MS;
  hybridSilence.pausedBySilence = false;
  hybridSilence.lastSpeechAtMs = now;
  hybridSilence.offScriptActive = false;
  resetOffScriptDuration();
  const timeoutId = hybridSilence.timeoutId;
  if (timeoutId != null) {
    try {
      window.clearTimeout(timeoutId);
    } catch {}
    hybridSilence.timeoutId = null;
  }
  if (hybridWantedRunning) {
    const delay = Math.max(1, HYBRID_GRACE_DURATION_MS);
    const handler = (window as any).__tp_handleHybridSilenceTimeout as (() => void) | undefined;
    if (typeof handler === 'function') {
      hybridSilence.timeoutId = window.setTimeout(() => handler(), delay);
    } else {
      hybridSilence.timeoutId = window.setTimeout(() => handleHybridSilenceTimeout(), delay);
    }
  }
  if (isDevMode()) {
    try {
      console.info('[HYBRID] grace window', { reason, until: hybridGraceUntil });
    } catch {}
  }
}

function isHybridGraceActive(now = nowMs()) {
  return hybridGraceUntil > now;
}
var isHybridBypass = () => {
  try {
    return localStorage.getItem("tp_hybrid_bypass") === "1";
  } catch {
    return false;
  }
};
function persistMode() {
  try {
    localStorage.setItem(LS_KEY, state2.mode);
    LEGACY_LS_KEYS.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {
      }
    });
  } catch {
  }
  try {
    window.addEventListener('pagehide', () => {
      try {
        flushProfilePersister();
      } catch {}
    });
  } catch {}
  try {
    document.addEventListener('visibilitychange', () => {
      try {
        if (document.visibilityState === 'hidden') {
          flushProfilePersister();
        }
      } catch {}
    });
  } catch {}
}
function restoreMode() {
  try {
    const legacy = LEGACY_LS_KEYS.map((k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    }).find(Boolean);
    const m = localStorage.getItem(LS_KEY) || legacy;
    if (m) {
      const normalized = normalizeScrollModeValue(m) || m;
      state2.mode = normalized;
      try {
        localStorage.setItem(LS_KEY, normalized);
        LEGACY_LS_KEYS.forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch {
          }
        });
      } catch {
      }
    }
  } catch {
  }
}
function findNextLine(offsetTop, dir) {
  if (!viewer) return null;
  const lines = viewer.querySelectorAll(".line");
  if (!lines || !lines.length) return null;
  const y = Number.isFinite(offsetTop) ? offsetTop : viewer.scrollTop;
  if (dir > 0) {
    for (let i = 0; i < lines.length; i++) {
      const el = lines[i];
      if (el.offsetTop > y + 2) return el;
    }
    return lines[lines.length - 1];
  } else {
    let prev = lines[0];
    for (let i = 0; i < lines.length; i++) {
      const el = lines[i];
      if (el.offsetTop >= y - 2) return prev;
      prev = el;
    }
    return prev;
  }
}
function stepOnce(dir) {
  if (!viewer) viewer = document.getElementById("viewer");
  if (!viewer) return;
  const next = findNextLine(viewer.scrollTop, dir);
  if (!next) return;
  const target = Math.max(0, next.offsetTop - 6);
  try {
    scrollWriter.scrollTo(target, { behavior: "auto" });
  } catch {
  }
}
var creepRaf = 0;
var creepLast = 0;
let enabledNow = false;
let activeMotorBrain: 'auto' | 'hybrid' | 'asr' | null = null;

function setActiveMotor(brain: 'auto' | 'hybrid' | 'asr', _mode: string) {
  activeMotorBrain = brain;
}

function clearActiveMotor(brain?: 'auto' | 'hybrid' | 'asr') {
  if (!brain || activeMotorBrain === brain) {
    activeMotorBrain = null;
  }
}

function holdCreepStart(pxPerSec = DEFAULTS.step.holdCreep, dir = 1) {
  if (!viewer) viewer = document.getElementById("viewer");
  if (!viewer) return;
  cancelAnimationFrame(creepRaf);
  creepLast = performance.now();
  const tick = (now) => {
    const dt = (now - creepLast) / 1e3;
    creepLast = now;
    try {
      scrollWriter.scrollBy(dir * pxPerSec * dt, { behavior: "auto" });
    } catch {
    }
    creepRaf = requestAnimationFrame(tick);
  };
  creepRaf = requestAnimationFrame(tick);
}
function holdCreepStop() {
  cancelAnimationFrame(creepRaf);
  creepRaf = 0;
}
var speaking = false;
var gateTimer;
function stopAutoMotor(reason?: string): boolean {
  const wasRunning =
    !!enabledNow || (typeof auto?.isRunning === 'function' ? !!auto.isRunning() : false);
  if (wasRunning) {
    try {
      auto.setEnabled?.(false);
      auto.stop?.();
    } catch {}
    enabledNow = false;
    clearActiveMotor('auto');
    try { emitMotorState("auto", false); } catch {}
    if (isDevMode() && reason) {
      try { console.info('[AUTO] forced stop', { reason }); } catch {}
    }
    return true;
  }
  enabledNow = false;
  clearActiveMotor('auto');
  return false;
}
function stopHybridMotor(reason?: string) {
  try {
    const wasHybridRunning = hybridMotor.isRunning();
    hybridMotor.stop();
    cancelHybridVelocityRefresh();
    hybridGraceUntil = 0;
    hybridSilence.pausedBySilence = false;
    hybridSilence.offScriptActive = false;
    resetOffScriptDuration();
    hybridSilence.lastSpeechAtMs = nowMs();
    pauseAssistTailBoost = 0;
    pauseAssistTailUntil = 0;
    clearHybridSilenceTimer();
    if (wasHybridRunning) {
      clearActiveMotor('hybrid');
      emitMotorState("hybridWpm", false);
      try {
        if (reason) console.debug("[HYBRID] forced stop", { reason });
      } catch {}
    }
  } catch (err) {
    if (isDevMode()) {
      try {
        console.warn("[HYBRID] stop failed", { reason, err });
      } catch {}
    }
  }
}
function stopAllMotors(reason: string) {
  try {
    if (reason) {
      try { console.debug("[ScrollRouter] stopAllMotors", reason); } catch {}
    }
  } catch {}
  stopAutoMotor(reason);
  stopHybridMotor(reason);
}
function stopAllMotorsExcept(mode: string, reason: string) {
  // For now, we stop all motors on mode change; motors re-arm based on mode.
  stopAllMotors(reason);
}
function assertHybridStoppedIfNotHybrid(reason: string) {
  if (state2.mode === 'hybrid') return;
  if (!hybridMotor.isRunning()) return;
  try {
    console.error('[HYBRID_ASSERT] motor running outside hybrid mode', {
      reason,
      mode: state2.mode,
    });
  } catch {}
  stopHybridMotor(`assert:${reason}`);
}
function setSpeaking(on, auto) {
  if (on === speaking) return;
  speaking = on;
  if (typeof auto.setEnabled === "function") auto.setEnabled(on);
  else auto.toggle();
}
function hybridHandleDb(db, auto) {
  if (state2.mode === 'hybrid') return;
  const { attackMs, releaseMs, thresholdDb } = DEFAULTS.hybrid;
  if (gateTimer) clearTimeout(gateTimer);
  if (db >= thresholdDb) gateTimer = setTimeout(() => setSpeaking(true, auto), attackMs);
  else gateTimer = setTimeout(() => setSpeaking(false, auto), releaseMs);
}
function applyMode(m) {
  const normalized = normalizeScrollModeValue(m) || m;
  try {
    try { console.debug("[ScrollRouter] stopAllMotors", `mode switch to ${normalized}`); } catch {}
  } catch {}
  stopAllMotorsExcept(normalized, `mode switch to ${normalized}`);
  if (normalized !== 'auto') {
    persistStoredAutoEnabled(false);
  }
  state2.mode = normalized;
  if (normalized === 'asr') {
    stopAutoMotor('enter-asr');
    try { (window as any).__tpScrollWriteActive = false; } catch {}
    resetAsrIntentState('mode-enter');
    try {
      const phase = String(appStore.get?.('session.phase') || '');
      if (phase === 'live') {
        asrIntentLiveSince = Date.now();
      } else {
        asrIntentLiveSince = 0;
      }
    } catch {}
  } else {
    asrIntentLiveSince = 0;
    resetAsrIntentState('mode-exit');
  }
  assertHybridStoppedIfNotHybrid('mode-change');
  persistMode();
  viewer = document.getElementById("viewer");
  refreshHybridWriter();
  
  // Toggle UI controls based on mode
  try {
    const autoRow = document.querySelector('.row:has(#autoSpeed)');
    const wpmRow = document.getElementById('wpmRow');
    const speedLabel = document.querySelector('[data-scroll-speed-label]') as HTMLElement | null;
    const speedHint = document.querySelector('[data-scroll-speed-hint]') as HTMLElement | null;
    const speedInput = document.getElementById('autoSpeed') as HTMLInputElement | null;
    const modeExplain = document.querySelector('[data-scroll-mode-explain]') as HTMLElement | null;

    const isWpmLike = normalized === 'wpm' || normalized === 'hybrid';
    if (isWpmLike) {
      if (wpmRow) {
        wpmRow.classList.remove('visually-hidden');
        wpmRow.removeAttribute('aria-hidden');
      }
      if (autoRow) {
        autoRow.classList.add('visually-hidden');
        autoRow.setAttribute('aria-hidden', 'true');
      }
      if (normalized === 'wpm') {
        if (speedLabel) speedLabel.textContent = 'Target speed (WPM)';
        if (speedHint) speedHint.textContent = 'Scroll speed is driven purely by this WPM value.';
      } else {
        if (speedLabel) speedLabel.textContent = 'Baseline speed (WPM)';
        if (speedHint) speedHint.textContent = 'Hybrid: uses this WPM as a floor while ASR can pull the text ahead as you speak.';
      }
      if (speedInput) { speedInput.disabled = false; speedInput.dataset.mode = normalized; }
    } else {
      if (wpmRow) {
        wpmRow.classList.add('visually-hidden');
        wpmRow.setAttribute('aria-hidden', 'true');
      }
      if (autoRow) {
        autoRow.classList.remove('visually-hidden');
        autoRow.removeAttribute('aria-hidden');
      }

      if (normalized === 'asr') {
        if (speedLabel) speedLabel.textContent = 'Scroll speed';
        if (speedHint) speedHint.textContent = 'ASR-only: scroll position is driven by your voice; speed slider is ignored.';
        if (speedInput) { speedInput.disabled = true; speedInput.dataset.mode = 'asr'; }
      } else {
        if (speedLabel) speedLabel.textContent = 'Scroll speed';
        if (speedHint) speedHint.textContent = '';
        if (speedInput) { speedInput.disabled = false; speedInput.dataset.mode = normalized; }
      }
    }

    // Mode explanation text
    if (modeExplain) {
      switch (normalized) {
        case 'wpm':
          modeExplain.textContent = 'WPM: scrolls at a fixed words-per-minute target; good for solo reads.';
          break;
        case 'hybrid':
          modeExplain.textContent = 'Hybrid: PLL between your voice and the WPM baseline; ASR nudges while the baseline keeps moving.';
          break;
        case 'asr':
          modeExplain.textContent = 'ASR: pure voice-locked mode - scroll position follows recognized speech; speed slider is ignored.';
          break;
        case 'timed':
          modeExplain.textContent = 'Timed: scrolls to hit your end time; useful for fixed-slot rehearsals.';
          break;
        default:
          modeExplain.textContent = '';
          break;
      }
    }
  } catch {
  }
}
function installScrollRouter(opts) {
  const { auto: autoMotor, viewer: viewerInstallFlag = false, hostEl = null } = opts;
  auto = autoMotor || auto || null;
  const canonicalScroller = getScrollerEl(viewerRole) || getScrollerEl('main');
  const docViewer = document.getElementById('viewer') as HTMLElement | null;
  if (!viewer) {
    if (docViewer) {
      viewer = docViewer;
    } else if (hostEl instanceof HTMLElement && hostEl.id === 'viewer') {
      viewer = hostEl;
    }
  }
  if (hostEl instanceof HTMLElement) {
    scrollerEl = canonicalScroller || docViewer || viewer || hostEl;
  }
  if (!scrollerEl) {
    scrollerEl =
      canonicalScroller ||
      docViewer ||
      document.querySelector<HTMLElement>('main#viewer.viewer, #viewer') ||
      document.querySelector<HTMLElement>('#script') ||
      (viewerRole === 'display' ? (document.getElementById('wrap') as HTMLElement | null) : null);
  }
  if (!hybridScrollGraceListenerInstalled) {
    try {
      const scrollHandler = (event: Event) => {
        if (!event.isTrusted) return;
        if (state2.mode === 'hybrid' && isHybridProgrammaticScroll()) {
          return;
        }
        const target = event.target as HTMLElement | null;
        const scroller = scrollerEl;
        if (!scroller || !target) return;
        if (scroller === target || scroller.contains(target)) {
          const now = nowMs();
          const writerStamp = getRecentProgrammaticWriterStamp(scroller, now);
          if (writerStamp && (writerStamp.kind === 'asr' || writerStamp.kind === 'writer')) {
            if (isDevMode() && now - lastProgrammaticWriterLogAt >= PROGRAMMATIC_WRITER_LOG_THROTTLE_MS) {
              lastProgrammaticWriterLogAt = now;
              try {
                console.info('[HYBRID_BRAKE] skip', {
                  reason: 'programmatic-writer',
                  source: writerStamp.source,
                  kind: writerStamp.kind,
                  ageMs: Math.max(0, Math.round(now - writerStamp.at)),
                  mode: state2.mode,
                });
              } catch {}
            }
            return;
          }
          setHybridBrake(1, 0, 'manual-scroll');
        }
      };
      window.addEventListener('scroll', scrollHandler, { capture: true, passive: true });
      hybridScrollGraceListenerInstalled = true;
    } catch {}
  }
  refreshHybridWriter();
  function setProcessorAndFlush() {
    autoIntentProcessor = (detail) => {
      try {
        processAutoIntent(detail);
      } catch (err) {
        console.error('[AUTO_INTENT] PROCESS crash', err);
        throw err;
      }
    };
    console.warn('[AUTO_INTENT] processor assigned', { hasPending: !!pendingAutoIntentDetail });
    if (pendingAutoIntentDetail) {
      console.warn('[AUTO_INTENT] flushing pending', pendingAutoIntentDetail);
      try {
        autoIntentProcessor(pendingAutoIntentDetail);
      } catch {
        // ignore
      }
      pendingAutoIntentDetail = null;
    }
  }
  setProcessorAndFlush();
  try {
    console.warn('[SCROLL_ROUTER] installScrollRouter ENTER', {
      viewerInstance: viewerInstallFlag,
      viewerEl: !!viewer,
      hostEl: hostEl ? (hostEl.id || hostEl.className || hostEl.tagName) : null,
      mode: state2.mode,
      autoIntentProcessorExists: !!autoIntentProcessor,
    });
  } catch {}
  try {
    window.__tpScrollRouterTsActive = true;
  } catch {
  }
  restoreMode();
  try {
    const store = (typeof window !== "undefined" ? (window as any).__tpStore : null) || appStore;
    const storeMode = normalizeScrollModeValue(store?.get?.("scrollMode"));
    if (storeMode && storeMode !== state2.mode) {
      state2.mode = storeMode;
    }
  } catch {}
  applyMode(state2.mode);
  emitScrollModeSnapshot("mode-change");
  try {
    const store = (typeof window !== "undefined" ? (window as any).__tpStore : null) || appStore;
    store?.subscribe?.("scrollMode", (next) => {
      const normalized = normalizeScrollModeValue(next);
      if (!normalized || normalized === state2.mode) return;
      applyMode(normalized);
      if (normalized === 'asr') {
        // Safety belt: entering ASR must always leave timed/wpm/hybrid motors fully off.
        try { stopAllMotors('mode switch to asr (safety)'); } catch {}
        try {
          window.dispatchEvent(new CustomEvent('tp:auto:intent', {
            detail: { enabled: false, reason: 'mode-enter-asr' },
          }));
        } catch {}
      }
      emitScrollModeSnapshot("store-change");
    });
  } catch {}
  if (state2.mode === "hybrid" || state2.mode === "wpm") {
    seedHybridBaseSpeed();
  }
  const orch = createOrchestrator();
  let orchRunning = false;
  let wpmUpdateInterval = null;
  
  // Update WPM display periodically when in WPM mode
  function updateWpmDisplay() {
    try {
      if (state2.mode !== 'wpm' || !orchRunning) return;
      const status = orch.getStatus();
      const wpmEl = document.getElementById('wpmPx');
      
      if (wpmEl && status) {
        const wpm = status.wpm;
        const pxs = status.targetPxs;
        
        if (wpm != null && isFinite(wpm) && pxs != null && isFinite(pxs)) {
          wpmEl.textContent = `≈ ${Math.round(wpm)} WPM → ${Math.round(pxs)} px/s`;
        } else {
          wpmEl.textContent = '≈ — WPM';
        }
      }
    } catch {
    }
  }
  
  async function ensureOrchestratorForMode() {
    try {
      const wantsOrchestrator =
        state2.mode === "wpm" ||
        state2.mode === "asr" ||
        (state2.mode === "hybrid" && hybridWantedRunning);
      if (wantsOrchestrator) {
        if (!orchRunning) {
          await orch.start(createVadEventAdapter());
          orch.setMode("assist");
          orchRunning = true;
          
          // Start WPM display updates for WPM mode
          if (state2.mode === "wpm") {
            if (wpmUpdateInterval) clearInterval(wpmUpdateInterval);
            wpmUpdateInterval = setInterval(updateWpmDisplay, 200);
          }
        }
      } else if (orchRunning) {
        await orch.stop();
        orchRunning = false;
        
        // Stop WPM display updates
        if (wpmUpdateInterval) {
          clearInterval(wpmUpdateInterval);
          wpmUpdateInterval = null;
        }
      }
    } catch {
    }
  }
  ensureOrchestratorForMode();
  
  // Initialize WPM target input from localStorage
  try {
    const wpmTargetInput = document.getElementById('wpmTarget') as HTMLInputElement | null;
      if (wpmTargetInput) {
        const stored = localStorage.getItem('tp_baseline_wpm');
        const parsed = stored != null ? Number(stored) : NaN;
        if (Number.isFinite(parsed) && parsed > 0) {
          setSliderValueSilently(wpmTargetInput, String(parsed));
        } else if (stored != null) {
          try {
            localStorage.removeItem('tp_baseline_wpm');
          } catch {}
        }
      }
  } catch {
  }
  
  let userEnabled = false;
  let userIntentOn = false;
  let dbGate = false;
  let vadGate = false;
  let gatePref = getUiPrefs().hybridGate;
  let speechActive = false;
  let sessionIntentOn = false;
  let sessionPhase = 'idle';
  hybridSessionPhase = sessionPhase;
  const HYBRID_AUTO_STOP_FATAL_REASONS = new Set(['session', 'session-stop', 'user-toggle']);
  function isFatalAutoStopReason(reason?: string | null): boolean {
    if (!reason) return false;
    try {
      return HYBRID_AUTO_STOP_FATAL_REASONS.has(reason.toLowerCase());
    } catch {
      return true;
    }
  }
  function shouldIgnoreHybridStop(reason: string | undefined, enabled: boolean): boolean {
    if (enabled) return false;
    if (state2.mode !== "hybrid") return false;
    if (sessionPhase !== "live") return false;
    return !isFatalAutoStopReason(reason);
  }
  try {
    const storedPhase = appStore.get?.('session.phase');
    if (storedPhase) {
      sessionPhase = String(storedPhase);
      hybridSessionPhase = sessionPhase;
    }
  } catch {
    // ignore
  }
  if (!scrollIntentListenerWired) {
    scrollIntentListenerWired = true;
    // TODO (ARCHITECTURE):
    // Forward ASR block commits must be gated on *block completion*, not mere detection.
    // “Completion” is a semantic invariant (e.g. last-line confirmation, coverage threshold,
    // boundary crossing, or post-line silence), not a heuristic.
    // Until this is implemented, first ASR commits may feel eager but remain truthful.
    // Do NOT implement completion logic in ASR; router is the commit authority (SSOT).
    onScrollIntent((intent) => {
      try {
        if (!intent || intent.source !== 'asr') return;
        const telemetry = getAsrTelemetry();
        const intentReason = typeof intent.reason === 'string' ? intent.reason : '';
        recordAsrIntentTelemetry(telemetry, intentReason);
        const now = Date.now();
        const mode = getScrollMode();
        recordAsrMatchEvent(now, intent, intentReason);
        if (telemetry) {
          telemetry.completionEvidence = null;
          telemetry.completionEvidenceSummary = 'evidence_missing_block_index';
        }
        if (intent.kind !== 'seek_block') {
          recordAsrReject(
            telemetry,
            now,
            'reject_kind',
            mode,
            sessionPhase,
            committedBlockIdx,
            resolveAsrIntentCandidateBlockIdx(intent),
            telemetry?.completionEvidenceSummary,
          );
          return;
        }
        if (mode !== 'asr') {
          recordAsrReject(
            telemetry,
            now,
            'reject_mode',
            mode,
            sessionPhase,
            committedBlockIdx,
            resolveAsrIntentCandidateBlockIdx(intent),
            telemetry?.completionEvidenceSummary,
          );
          return;
        }
        if (sessionPhase !== 'live') {
          recordAsrReject(
            telemetry,
            now,
            'reject_phase',
            mode,
            sessionPhase,
            committedBlockIdx,
            resolveAsrIntentCandidateBlockIdx(intent),
            telemetry?.completionEvidenceSummary,
          );
          return;
        }
        if (isDevMode()) {
          const autoEnabled = !!(auto?.getState?.().enabled || enabledNow);
          const autoRunning = !!auto?.isRunning?.();
          const hybridRunning = !!hybridMotor?.isRunning?.();
          if (autoEnabled || autoRunning || hybridRunning) {
            if (!asrMotorConflictLogged) {
              asrMotorConflictLogged = true;
              try {
                console.error('[ASR_ASSERT] motor running in ASR mode', {
                  autoEnabled,
                  autoRunning,
                  hybridRunning,
                  mode,
                  phase: sessionPhase,
                });
              } catch {}
            }
            stopAllMotors('asr-assert-motor-running');
          }
        }

        if (committedBlockIdx < 0) {
          const seed = resolveCurrentBlockIdx();
          if (seed != null) {
            committedBlockIdx = seed;
          }
        }
        if (telemetry && committedBlockIdx >= 0) {
          const candidateIdx = resolveAsrIntentCandidateBlockIdx(intent);
          const evidence = buildCompletionEvidence(committedBlockIdx, candidateIdx, now);
          telemetry.completionEvidence = evidence;
          telemetry.completionEvidenceSummary = formatCompletionEvidenceSummary(evidence);
        } else if (telemetry) {
          telemetry.completionEvidence = null;
          telemetry.completionEvidenceSummary = 'evidence_missing_block_index';
        }
        if (asrIntentLiveSince && now - asrIntentLiveSince < ASR_INTENT_WARMUP_MS) {
          recordAsrReject(
            telemetry,
            now,
            'reject_warmup',
            mode,
            sessionPhase,
            committedBlockIdx,
            resolveAsrIntentCandidateBlockIdx(intent),
            telemetry?.completionEvidenceSummary,
          );
          return;
        }
        const rawBlockIdx = Number(intent?.target?.blockIdx);
        if (!Number.isFinite(rawBlockIdx) || rawBlockIdx < 0) {
          recordAsrReject(
            telemetry,
            now,
            'reject_invalid_target',
            mode,
            sessionPhase,
            committedBlockIdx,
            resolveAsrIntentCandidateBlockIdx(intent),
            telemetry?.completionEvidenceSummary,
          );
          return;
        }
        const blockIdx = Math.min(rawBlockIdx, committedBlockIdx + 1);
        if (blockIdx <= committedBlockIdx) {
          const reasonKey = rawBlockIdx === committedBlockIdx ? 'reject_same_block' : 'reject_backward';
          recordAsrReject(
            telemetry,
            now,
            reasonKey,
            mode,
            sessionPhase,
            committedBlockIdx,
            blockIdx,
            telemetry?.completionEvidenceSummary,
          );
          return;
        }
        if (now - lastCommitAt < ASR_INTENT_DEBOUNCE_MS) {
          recordAsrReject(
            telemetry,
            now,
            'reject_debounce',
            mode,
            sessionPhase,
            committedBlockIdx,
            blockIdx,
            telemetry?.completionEvidenceSummary,
          );
          return;
        }
        if (Number.isFinite(intent.confidence) && intent.confidence < ASR_INTENT_MIN_CONF) {
          recordAsrReject(
            telemetry,
            now,
            'reject_low_confidence',
            mode,
            sessionPhase,
            committedBlockIdx,
            blockIdx,
            telemetry?.completionEvidenceSummary,
          );
          return;
        }

        const isFinal = intentReason.includes('final');
        const isInterim = intentReason.includes('interim') && !isFinal;
        const isRescue = intentReason.includes('rescue');
        if (isInterim) {
          if (blockIdx !== lastCandidate) {
            lastCandidate = blockIdx;
            stableSince = now;
          }
          recordAsrReject(
            telemetry,
            now,
            'reject_not_final',
            mode,
            sessionPhase,
            committedBlockIdx,
            blockIdx,
            telemetry?.completionEvidenceSummary,
          );
          return;
        }
        if (isRescue) {
          recentAsrMatches = [];
          lastCandidate = -1;
          stableSince = now;
          recordAsrReject(
            telemetry,
            now,
            'reject_rescue',
            mode,
            sessionPhase,
            committedBlockIdx,
            blockIdx,
            telemetry?.completionEvidenceSummary,
          );
          return;
        }
        if (blockIdx !== lastCandidate) {
          lastCandidate = blockIdx;
          stableSince = now;
          recordAsrReject(
            telemetry,
            now,
            'reject_stability',
            mode,
            sessionPhase,
            committedBlockIdx,
            blockIdx,
            telemetry?.completionEvidenceSummary,
          );
          return;
        }
        const requiredStable = committedBlockIdx < 0 ? ASR_INTENT_FIRST_STABLE_MS : ASR_INTENT_STABLE_MS;
        if (now - stableSince < requiredStable) {
          recordAsrReject(
            telemetry,
            now,
            'reject_stability',
            mode,
            sessionPhase,
            committedBlockIdx,
            blockIdx,
            telemetry?.completionEvidenceSummary,
          );
          return;
        }

        const completionGateEnabled = isAsrCompletionGateEnabled();
        let completionDecisionConfidence: number | undefined;
        let completionStatus: 'complete' | 'unknown' = 'complete';
        let completionReason: string | undefined;
        if (completionGateEnabled) {
          let completionEvidence = telemetry?.completionEvidence ?? null;
          if (!completionEvidence) {
            try {
              completionEvidence = buildCompletionEvidence(committedBlockIdx, blockIdx, now);
            } catch (err) {
              if (isDevMode()) {
                try {
                  console.warn('[ASR_COMPLETION] evidence build failed', { err });
                } catch {}
              }
              completionStatus = 'unknown';
              completionReason = 'exception';
            }
          }
          if (telemetry) {
            telemetry.completionEvidence = completionEvidence;
            telemetry.completionEvidenceSummary = formatCompletionEvidenceSummary(completionEvidence);
          }
          if (completionStatus === 'unknown' && completionReason === 'exception') {
            // fall through: unknown should not block
          } else if (!completionEvidence) {
            completionStatus = 'unknown';
            completionReason = 'insufficient_evidence';
          } else {
            let completionDecision;
            try {
              completionDecision = decideBlockCompletion(completionEvidence);
            } catch (err) {
              if (isDevMode()) {
                try {
                  console.warn('[ASR_COMPLETION] decision failed', { err });
                } catch {}
              }
              completionStatus = 'unknown';
              completionReason = 'exception';
            }
            if (completionDecision) {
              if (completionDecision.ok) {
                completionDecisionConfidence = completionDecision.confidence;
                completionStatus = 'complete';
                completionReason = completionDecision.reason;
              } else if (completionDecision.status === 'incomplete') {
                recordAsrReject(
                  telemetry,
                  now,
                  `reject_completion_${completionDecision.reason}`,
                  mode,
                  sessionPhase,
                  committedBlockIdx,
                  blockIdx,
                  telemetry?.completionEvidenceSummary,
                );
                return;
              } else {
                completionStatus = 'unknown';
                completionReason = completionDecision.reason;
              }
            }
          }
        } else if (isDevMode() && !asrCompletionGateBypassLogged) {
          asrCompletionGateBypassLogged = true;
          try {
            console.debug('[ASR_COMPLETION] gate bypassed (flag off)');
          } catch {}
        }

        seekToBlockAnimated(blockIdx, 'asr_commit');
        committedBlockIdx = blockIdx;
        lastCommitAt = now;
        recordAsrAccept(
          telemetry,
          now,
          mode,
          sessionPhase,
          committedBlockIdx,
          blockIdx,
          telemetry?.completionEvidenceSummary,
          completionDecisionConfidence,
          completionStatus,
          completionReason,
        );
      } catch {}
    });
    try { console.info('[scroll-router] tp:scroll:intent listener installed'); } catch {}
  }
  type AutoIntentDecision = 'motor-start-request' | 'motor-stop-request';
  type RequestedMotorKind = 'auto' | 'hybrid';
  interface AutoIntentMotorRequest {
    kind: RequestedMotorKind;
    source: string;
  }
  interface AutoIntentPayload {
    enabled: boolean;
    decision: AutoIntentDecision;
    pxs: number;
    reason?: string;
    motorKind: RequestedMotorKind;
    motorSource: string;
  }
  let lastAutoIntentMotorRequest: AutoIntentMotorRequest = { kind: 'auto', source: 'unknown' };
  function normalizeRequestedMotorKind(raw: unknown): RequestedMotorKind | null {
    const value = String(raw || '').toLowerCase();
    if (value === 'auto' || value === 'hybrid') return value;
    return null;
  }
  function resolveAutoIntentMotorRequest(
    detail: any,
    mode: string,
    reasonRaw?: string,
  ): AutoIntentMotorRequest {
    const source = typeof detail?.source === 'string'
      ? detail.source
      : (reasonRaw || 'unknown');
    // ASR mode is motorless: auto-intents may still arrive, but must never
    // resolve to a motor-specific request in this mode.
    if (mode === 'asr') return { kind: 'auto', source };
    const explicit =
      normalizeRequestedMotorKind(detail?.motorKind) ||
      normalizeRequestedMotorKind(detail?.kind) ||
      normalizeRequestedMotorKind(detail?.intent?.kind);
    if (explicit) return { kind: explicit, source };
    if (mode === 'hybrid') return { kind: 'hybrid', source };
    return { kind: 'auto', source };
  }
  function resolveAutoIntentEnabled(detail: any): boolean | undefined {
    if (typeof detail.enabled === 'boolean') return detail.enabled;
    if (typeof detail.on === 'boolean') return detail.on;
    return undefined;
  }
  function resolveAutoIntentReason(detail: any): string | undefined {
    return typeof detail.reason === 'string' ? detail.reason : undefined;
  }

  function setAutoIntentState(on: boolean, _reason?: string) {
    if (on && state2.mode === "hybrid" && !hasActiveAsrProfile()) {
      try { showToast('Select a saved mic calibration to use ASR/Hybrid.', { type: 'warning' }); } catch {}
      try { focusSidebarCalibrationSelect(); } catch {}
      return;
    }
    userIntentOn = on;
    userEnabled = on;
    hybridWantedRunning = on;
    sessionIntentOn = on;
    if (hybridWantedRunning && state2.mode === "hybrid") {
      seedHybridBaseSpeed();
      ensureOrchestratorForMode();
    }
    if (!hybridWantedRunning) {
      hybridSilence.pausedBySilence = false;
      clearHybridSilenceTimer();
    }
    persistStoredAutoEnabled(on);
    try { applyGate(); } catch {}
  }
  function handleAutoIntent(detail: any): AutoIntentPayload | null {
    try {
      const enabled = resolveAutoIntentEnabled(detail);
      if (typeof enabled !== 'boolean') return null;
      const reasonRaw = resolveAutoIntentReason(detail);
      if (shouldIgnoreHybridStop(reasonRaw, enabled)) {
        try {
          console.info('[AUTO_INTENT] hybrid stop ignored (live, non-fatal reason)', { reason: reasonRaw });
        } catch {}
        return null;
      }
      const mode = getScrollMode();
      const motorRequest = resolveAutoIntentMotorRequest(detail, mode, reasonRaw);
      lastAutoIntentMotorRequest = motorRequest;
      setAutoIntentState(enabled, reasonRaw);
      const allowAutoMotor = mode !== 'asr';
      const brain = String(appStore.get('scrollBrain') || 'auto');
      const baseDecision: AutoIntentDecision = enabled ? 'motor-start-request' : 'motor-stop-request';
      const decision: AutoIntentDecision = allowAutoMotor ? baseDecision : 'motor-stop-request';
      const pxPerSec = typeof getCurrentSpeed === 'function' ? getCurrentSpeed() : undefined;
      const currentPhase = String(appStore.get('session.phase') || sessionPhase);
      try {
        console.info(
          `[scroll-router] tp:auto:intent mode=${state2.mode} brain=${brain} phase=${sessionPhase} decision=${decision} userEnabled=${userEnabled} motorKind=${motorRequest.kind} source=${motorRequest.source}`,
        );
        console.warn(
          '[AUTO_INTENT]',
          'mode=', state2.mode,
          'enabled=', enabled,
          'motorKind=', motorRequest.kind,
          'source=', motorRequest.source,
          'pxPerSec=', pxPerSec,
          'sessionPhase=', currentPhase,
          'userEnabled=', userEnabled,
        );
      } catch {}
      const pxs = Number(pxPerSec) || 0;
      enabledNow = decision === 'motor-start-request';
      if (!allowAutoMotor) {
        clearActiveMotor('auto');
      }
      try { emitMotorState('auto', enabledNow); } catch {}
      try { emitAutoState(); } catch {}
      return {
        enabled,
        decision,
        pxs,
        reason: reasonRaw,
        motorKind: motorRequest.kind,
        motorSource: motorRequest.source,
      };
    } catch {}
    return null;
  }
	
  function processAutoIntent(detail: any) {
    const payload = handleAutoIntent(detail);
    if (!payload) return;
    const { enabled, decision, pxs, reason, motorKind, motorSource } = payload;
    const mode = getScrollMode();
      const currentPhase = String(appStore.get('session.phase') || sessionPhase);
      if (enabled && currentPhase !== 'live') {
        try {
          console.info('[AUTO_INTENT] start ignored: session not live', {
            mode,
            phase: currentPhase,
            reason: reason ?? 'unknown',
          });
        } catch {}
        return;
      }
      const pxps = typeof getCurrentSpeed === 'function' ? getCurrentSpeed() : undefined;
      const chosenMotor = mode === 'hybrid' ? 'hybrid' : 'auto';
      try {
        console.warn('[AUTO_INTENT] processor RUN', {
          enabled,
          mode,
          motorKind,
          source: motorSource,
          pxps,
          chosenMotor,
          viewerRole,
          lastWpm: lastWpmIntent?.wpm ?? null,
        });
      } catch {}
      if (mode === 'asr') {
        stopAutoMotor('auto-intent:asr');
        return;
      }
      if (mode === 'hybrid') {
        if (enabled) {
          if (!ensureMainViewer('hybrid.start')) {
            return;
          }
          if (!userEnabled) {
            try {
              console.info('[HYBRID_MOTOR] user disabled -> no actuation');
            } catch {}
            return;
          }
          if (sessionPhase !== 'live') {
            try {
              console.info('[HYBRID_MOTOR] not live -> no actuation', { phase: sessionPhase });
            } catch {}
            return;
          }
          if (!Number.isFinite(hybridBasePxps) || hybridBasePxps <= 0) {
            const fallbackWpm = lastWpmIntent?.wpm ?? 140;
            const fallbackPx = convertWpmToPxPerSec(fallbackWpm);
            try {
              console.warn('[HYBRID_MOTOR] basePxps missing -> seed from WPM', { fallbackWpm });
            if (Number.isFinite(fallbackPx) && fallbackPx > 0) {
                applyWpmBaselinePx(fallbackPx, 'hybrid-seed', fallbackWpm);
              }
            } catch (err) {
              try {
                console.error('[HYBRID_MOTOR] baseline seed FAILED', err);
              } catch {}
            }
          }
          try {
            seedHybridBaseSpeed();
            startHybridMotorFromSpeedChange();
            hybridMotor.setEnabled?.(true);
            hybridMotor.start?.();
            setActiveMotor('hybrid', 'hybrid');
            console.warn('[HYBRID_MOTOR] start/enable ok', {
              reason: reason ?? 'auto-intent',
              phase: sessionPhase,
              baselinePxps: hybridBasePxps,
            });
          } catch (err) {
            try {
              console.error('[HYBRID_MOTOR] start/enable FAILED', err);
            } catch {}
          }
        } else {
          try {
            if (hybridMotor.isRunning()) {
              hybridMotor.stop();
              clearActiveMotor('hybrid');
            emitMotorState('hybridWpm', false);
          }
          emitHybridSafety();
        } catch {}
      }
      return;
    }
    if (decision === 'motor-start-request') {
      try { auto.setSpeed?.(pxs); } catch {}
      try {
        if (!auto.isRunning?.()) {
          auto.start?.();
        }
      } catch {}
      try { auto.setEnabled?.(true); } catch {}
      setActiveMotor('auto', mode);
      scheduleCiAutoMovement();
    } else {
      stopAutoMotor('auto-intent:stop');
    }
  }

  autoIntentProcessor = (detail) => {
    try {
      processAutoIntent(detail);
    } catch (err) {
      console.error('[AUTO_INTENT] PROCESS crash', err);
      throw err;
    }
  };
  console.warn('[AUTO_INTENT] processor assigned', { hasPending: !!pendingAutoIntentDetail });
  if (pendingAutoIntentDetail) {
    console.warn('[AUTO_INTENT] flushing pending', pendingAutoIntentDetail);
    try {
      autoIntentProcessor(pendingAutoIntentDetail);
    } catch {
      // ignore
    }
    pendingAutoIntentDetail = null;
  }

  try { console.info('[scroll-router] tp:auto:intent listener installed'); } catch {}
  try {
    window.addEventListener("tp:speech-state", (e) => {
      try {
        const detail = (e as CustomEvent)?.detail || {};
        const running = !!(detail.running);
        const ts = typeof detail.ts === "number" ? detail.ts : nowMs();
        if (running) {
          noteHybridSpeechActivity(ts, { source: "speech-state" });
        }
      } catch {}
    });
  } catch {}
  enabledNow = (() => {
    try {
      return !!opts.auto.getState?.().enabled;
    } catch {
      return false;
    }
  })();
  try {
    if (enabledNow) {
      setActiveMotor('auto', getScrollMode());
    }
  } catch {}
  let silenceTimer;
  const chipEl = () => document.getElementById("autoChip");
  function emitAutoState(label = "Auto") {
    try {
      const chip = chipEl();
      const gate = userEnabled ? enabledNow ? "on" : "paused" : "manual";
      const speed = getCurrentSpeed();
      const payload = {
        mode: getScrollMode(),
        intentOn: !!userIntentOn,
        gate,
        speed,
        label,
        chip: (chip && chip.textContent || "").trim(),
      };
      try { (window.__tp_onAutoStateChange || null) && window.__tp_onAutoStateChange(payload); } catch {}
      try { document.dispatchEvent(new CustomEvent("tp:autoState", { detail: payload })); } catch {}
    } catch {}
  }
  function setAutoChip(state3, detail, label = "Auto") {
    const el = chipEl();
    if (!el) return;
    const stateLabel = state3 === "on" ? "On" : state3 === "paused" ? "Paused" : "Manual";
    el.textContent = `${label}: ${stateLabel}`;
    el.classList.remove("on", "paused", "manual");
    el.classList.add(state3);
    el.setAttribute("data-state", state3);
    if (detail) el.title = detail;
  }
  function emitMotorState(source, running) {
    try {
      const payload = { source, running };
      try {
        const handler = (window as any).__tp_onMotorStateChange;
        if (typeof handler === "function") handler(payload);
      } catch {}
      try { window.dispatchEvent(new CustomEvent("tp:motorState", { detail: payload })); } catch {}
      try { document.dispatchEvent(new CustomEvent("tp:motorState", { detail: payload })); } catch {}
      try { window.dispatchEvent(new CustomEvent("tp:motor:state", { detail: payload })); } catch {}
      try { document.dispatchEvent(new CustomEvent("tp:motor:state", { detail: payload })); } catch {}
      emitScrollModeSnapshot(`motor:${source}:${running ? "on" : "off"}`);
    } catch {}
  }

  function emitScrollModeSnapshot(reason: string) {
    try {
      const mode = getScrollMode();
      const payload = {
        reason: reason || "state",
        mode,
        phase: sessionPhase,
        brain: String(appStore.get("scrollBrain") || "auto"),
        clamp: mode === "hybrid" || mode === "asr" ? "follow" : "free",
        userEnabled: !!userEnabled,
        sessionIntentOn: !!sessionIntentOn,
        autoRunning: typeof auto?.isRunning === "function" ? !!auto.isRunning() : false,
        hybridRunning: hybridMotor?.isRunning?.() ?? false,
        hybridWantedRunning: !!hybridWantedRunning,
        speechActive: !!speechActive,
        hybridPausedBySilence: !!hybridSilence.pausedBySilence,
      };
      try { (window as any).__tp_onScrollModeChange?.(payload); } catch {}
      try { window.dispatchEvent(new CustomEvent("tp:scroll:mode", { detail: payload })); } catch {}
      try { document.dispatchEvent(new CustomEvent("tp:scroll:mode", { detail: payload })); } catch {}
    } catch {}
  }

function canRunHybridMotor() {
  try {
    const phase = appStore.get("session.phase");
    const allow = appStore.get("session.scrollAutoOnLive");
    if (phase !== "live") return false;
    return !!allow;
  } catch {
    return false;
  }
}
function isHybridSessionEligible() {
  return state2.mode === "hybrid" && sessionPhase === "live" && userEnabled;
}
function handleHybridSilenceTimeout() {
  hybridSilence.timeoutId = null;
  const now = nowMs();
  if (liveGraceWindowEndsAt != null && now >= liveGraceWindowEndsAt) {
    liveGraceWindowEndsAt = null;
  }
  if (liveGraceWindowEndsAt != null && now < liveGraceWindowEndsAt) {
    const delay = Math.max(0, liveGraceWindowEndsAt - now);
    armHybridSilenceTimer(delay || computeHybridSilenceDelayMs());
    return;
  }
  const softDelayMs = computeHybridSilenceDelayMs();
  const hardStopMs = HYBRID_SILENCE_HARD_STOP_MS;
  const lastSpeechAtMs = hybridSilence.lastSpeechAtMs > 0 ? hybridSilence.lastSpeechAtMs : now;
  const silentForMs = Math.max(0, now - lastSpeechAtMs);
  const eligible = isHybridSessionEligible();
  const motorRunning = hybridMotor.isRunning();
  if (!eligible) {
    if (motorRunning) {
      hybridMotor.stop();
      clearActiveMotor('hybrid');
      emitMotorState("hybridWpm", false);
    }
    hybridSilence.pausedBySilence = false;
    speechActive = false;
    emitHybridSafety();
    try { applyGate(); } catch {}
    return;
  }
  if (silentForMs >= hardStopMs) {
    if (motorRunning) {
      hybridMotor.stop();
      clearActiveMotor('hybrid');
      emitMotorState("hybridWpm", false);
    }
    hybridSilence.pausedBySilence = false;
    speechActive = false;
    emitHybridSafety();
    try { applyGate(); } catch {}
    return;
  }
  if (!motorRunning) return;
  hybridSilence.pausedBySilence = true;
  speechActive = false;
  runHybridVelocity(hybridSilence);
  emitHybridSafety();
  armHybridSilenceTimer(softDelayMs);
  try { applyGate(); } catch {}
}
  try {
    (window as any).__tp_handleHybridSilenceTimeout = handleHybridSilenceTimeout;
  } catch {}
function armHybridSilenceTimer(delay: number = computeHybridSilenceDelayMs()) {
    clearHybridSilenceTimer();
    if (!isHybridSessionEligible()) return;

    // Keep tracking silence while the motor is running, even if the intent flag flickers.
    if (!hybridMotor.isRunning() && !hybridWantedRunning) return;
    const nextDelay = Math.max(1, delay);
    hybridSilence.timeoutId = window.setTimeout(() => handleHybridSilenceTimeout(), nextDelay);
  }
  function ensureHybridMotorRunningForSpeech() {
    if (getScrollMode() !== "hybrid") {
      logHybridModeMismatch('ensureHybridMotorRunningForSpeech');
      return;
    }
    if (sessionPhase !== "live") return;
    if (!userEnabled || !hybridWantedRunning) return;
    runHybridVelocity(hybridSilence);
    if (!hybridMotor.isRunning()) {
      const startResult = hybridMotor.start();
      if (startResult.started) {
        emitMotorState("hybridWpm", true);
        setActiveMotor('hybrid', 'hybrid');
      }
    }
  }
  function startHybridMotorFromSpeedChange() {
    const modeNow = getScrollMode();
    if (modeNow !== "hybrid") {
      logHybridModeMismatch('startHybridMotorFromSpeedChange');
      return;
    }
    if (sessionPhase !== "live") return;
    if (!userEnabled || !hybridWantedRunning) return;
    hybridSilence.pausedBySilence = false;
    clearHybridSilenceTimer();
    ensureHybridMotorRunningForSpeech();
    armHybridSilenceTimer();
  }
  function isLiveGraceActive(now = nowMs()) {
    return liveGraceWindowEndsAt != null && now < liveGraceWindowEndsAt;
  }
  function noteHybridSpeechActivity(
    ts?: number,
    opts?: { source?: string; noMatch?: boolean; resumedFromSilence?: boolean },
  ) {
    if (getScrollMode() !== "hybrid") {
      logHybridModeMismatch(opts?.source ?? 'speech');
      return;
    }
    const perfNow = nowMs();
    const now = normalizePerfTimestamp(ts, perfNow);
    if (typeof opts?.noMatch === "boolean") {
      hybridLastNoMatch = opts.noMatch;
    }
    const wasSpeechActive = speechActive;
    speechActive = true;
    hybridSilence.lastSpeechAtMs = now;
    setHybridSilence2(now);
    liveGraceWindowEndsAt = null;
    const wasPausedBySilence =
      typeof opts?.resumedFromSilence === "boolean" ? opts.resumedFromSilence : hybridSilence.pausedBySilence;
    hybridSilence.pausedBySilence = false;
    clearHybridSilenceTimer();
    const shouldStartGrace = !opts?.noMatch && (wasPausedBySilence || !wasSpeechActive);
    if (shouldStartGrace) {
      startHybridGrace(opts?.source ?? "speech-result");
    }
    const effectivePxps = Number.isFinite(hybridBasePxps) ? hybridBasePxps * hybridScale : 0;
    const speechPayload = {
      source: opts?.source ?? 'unknown',
      noMatch: !!opts?.noMatch,
      pausedBySilence: wasPausedBySilence,
      offScriptActive: hybridSilence.offScriptActive,
      effectivePxPerSec: Number.isFinite(effectivePxps) ? Number(effectivePxps.toFixed(2)) : effectivePxps,
    };
    try {
      console.info('[HYBRID] speech activity', speechPayload);
    } catch {}
    try {
      console.info('[speech] activity', speechPayload);
    } catch {}
    if (wasPausedBySilence) {
      emitHybridSafety();
    }
      if (!hybridWantedRunning) return;
    ensureHybridMotorRunningForSpeech();
    armHybridSilenceTimer();
    try { applyGate(); } catch {}
  }
  function determineHybridScaleFromDetail(detail: { bestSim?: number; sim?: number; score?: number; inBand?: boolean | number | string }) {
    const simRaw = detail.bestSim ?? detail.sim ?? detail.score;
    const sim = Number.isFinite(simRaw) ? Number(simRaw) : NaN;
    const inBandValue = detail.inBand;
    const inBand = inBandValue === 1 || inBandValue === true || inBandValue === "1";
    if (inBand) return RECOVERY_SCALE;
    if (!Number.isFinite(sim)) return null;
    if (sim >= HYBRID_ON_SCRIPT_SIM) return RECOVERY_SCALE;
    if (sim >= HYBRID_OFFSCRIPT_MILD_SIM) return OFFSCRIPT_MILD;
    return OFFSCRIPT_DEEP;
  }
  function updateHybridScaleFromDetail(detail: { bestSim?: number; sim?: number; score?: number; inBand?: boolean | number }) {
    if (state2.mode !== "hybrid" || !hybridWantedRunning) return;
    const now = nowMs();
    const inBandValue = detail.inBand;
    const inBand = inBandValue === 1 || inBandValue === true || inBandValue === "1";
    const bestSimRaw = detail.bestSim ?? detail.sim ?? detail.score;
    const bestSim = Number.isFinite(bestSimRaw) ? Number(bestSimRaw) : null;
    if (bestSim !== null && bestSim >= HYBRID_HARD_NOMATCH_SIM_MIN) {
      hybridLastNoMatch = false;
    }
    const scaleDetail = { ...detail, bestSim, sim: bestSim ?? detail.sim };
    const nextScale = determineHybridScaleFromDetail(scaleDetail);
    if (nextScale == null) return;
    const logHud = () => {
      syncOffScriptDuration(now);
      const currentScale = Number.isFinite(hybridScale) ? hybridScale : 1;
      const decay = hybridSilence.offScriptActive ? computeOffScriptDecay(offScriptDurationMs) : 1;
      const effectiveScale = currentScale * decay;
      logHybridOffScriptHud({
        bestSim,
        inBand,
        offScriptEvidence,
        offScriptActive: hybridSilence.offScriptActive,
        offScriptDurationMs,
        nextScale,
        effectiveScale,
      });
    };
    const isNoMatch = detail.noMatch === true;
    const significantNoMatch = isNoMatch && !isWeakNoMatch(detail);
    const goodMatch = nextScale === RECOVERY_SCALE && !significantNoMatch;
    if (goodMatch) {
      onScriptStreak += 1;
      lastGoodMatchAtMs = now;
      offScriptEvidence = 0;
      lastOffScriptEvidenceTs = 0;
      setHybridScale(RECOVERY_SCALE);
      logHud();
      return;
    }
    if (significantNoMatch) {
      onScriptStreak = 0;
    }
    const offscriptCandidate = nextScale < RECOVERY_SCALE;
    const shouldCountOffscript = offscriptCandidate && (significantNoMatch || !isNoMatch);
    if (!shouldCountOffscript) {
      logHud();
      return;
    }
    onScriptStreak = 0;
    if (lastOffScriptEvidenceTs && now - lastOffScriptEvidenceTs > OFFSCRIPT_EVIDENCE_RESET_MS) {
      offScriptEvidence = 0;
    }
    lastOffScriptEvidenceTs = now;
    offScriptEvidence += 1;
    if (offScriptEvidence >= OFFSCRIPT_EVIDENCE_THRESHOLD) {
      offScriptEvidence = 0;
      setHybridScale(nextScale);
    }
    logHud();
  }
  function handleTranscriptEvent(detail: { timestamp?: number; source?: string; noMatch?: boolean; bestSim?: number; sim?: number; score?: number; inBand?: boolean | number }) {
    if (getScrollMode() !== "hybrid") return;
    const perfNow = nowMs();
    const now = normalizePerfTimestamp(detail.timestamp, perfNow);
    const isNoMatch = detail.noMatch === true;
    const wasSilent = hybridSilence.pausedBySilence;
    hybridSilence.lastSpeechAtMs = now;
    hybridSilence.pausedBySilence = false;
    clearHybridSilenceTimer();
    noteHybridSpeechActivity(now, {
      source: detail.source || "transcript",
      noMatch: isNoMatch,
      resumedFromSilence: wasSilent,
    });
    updateHybridScaleFromDetail(detail);
  }
  const handleHybridFatalOnce = (err: unknown) => {
    if (hybridSilence.erroredOnce) return;
    if (state2.mode !== "hybrid" || !hybridWantedRunning) return;
    hybridSilence.erroredOnce = true;
    try { console.error('[HYBRID] disabling due to handler error', err); } catch {}
    try { clearHybridSilenceTimer(); } catch {}
    try { hybridWantedRunning = false; } catch {}
    try { stopAllMotors('hybrid guard fatal'); } catch {}
    try { emitHybridSafety(); } catch {}
    try {
      applyMode('wpm');
      emitScrollModeSnapshot("mode-change");
    } catch {}
    try {
      if ((window as any).toast) {
        (window as any).toast('Hybrid disabled after runtime error');
      }
    } catch {}
  };
  try {
    window.addEventListener("tp:asr:sync", (ev) => {
      const detail = (ev as CustomEvent).detail || {};
      const ts = typeof detail.ts === "number" ? detail.ts : nowMs();
      if (getScrollMode() !== "hybrid") return;
      try {
        noteHybridSpeechActivity(ts, { source: "sync", noMatch: detail.noMatch === true });
      } catch (err) {
        handleHybridFatalOnce(err);
        return;
      }
      const simRaw = detail.bestSim ?? detail.sim ?? detail.score;
      const bestSim = Number.isFinite(simRaw) ? Number(simRaw) : NaN;
      const hasSim = Number.isFinite(bestSim);
      const bestIdxRaw = detail.bestIdx ?? detail.line;
      const bestIdx = Number.isFinite(bestIdxRaw) ? bestIdxRaw : -1;
      const currentIdxRaw = Number((window as any)?.currentIndex ?? -1);
      const currentIdx = Number.isFinite(currentIdxRaw) ? currentIdxRaw : -1;
      lastAsrMatch = {
        currentIndex: currentIdx,
        bestIndex: bestIdx,
        bestSim: Number.isFinite(bestSim) ? bestSim : Number.NaN,
      };
      updateHybridScaleFromDetail(detail);
      if (isDevMode()) {
        try {
          console.info('[HYBRID] sync', {
            ts,
            bestSim: hasSim ? Number(bestSim.toFixed(3)) : null,
            bestIdx,
            currentIdx,
            noMatch,
            offScriptActive: hybridSilence.offScriptActive,
            pausedBySilence: hybridSilence.pausedBySilence,
            effectivePxPerSec: Number.isFinite(hybridBasePxps)
              ? Number((hybridBasePxps * hybridScale).toFixed(2))
              : 0,
          });
        } catch {}
      }
    });
  } catch {}
  try {
    window.addEventListener("tp:asr:guard", () => {
      try {
        markHybridOffScriptFn?.();
      } catch (err) {
        if (!guardHandlerErrorLogged) {
          guardHandlerErrorLogged = true;
          try {
            console.error('[HYBRID] guard handler failed', err);
          } catch {}
        }
      }
    });
  } catch {}
  try {
    window.addEventListener("tp:speech:transcript", (ev) => {
      try {
        const detail = (ev as CustomEvent).detail || {};
        handleTranscriptEvent(detail);
      } catch {}
    });
  } catch {}
  try {
    window.addEventListener("tp:hybrid:matchState", (ev) => {
      const detail = (ev as CustomEvent).detail || {};
      const bestIdxRaw = detail.bestIdx;
      const bestSimRaw = detail.bestSim;
      const bestIdx = Number.isFinite(bestIdxRaw) ? bestIdxRaw : -1;
      const bestSimValue = Number.isFinite(bestSimRaw) ? bestSimRaw : Number.NaN;
      const ts = Number.isFinite(detail.ts) ? detail.ts : nowMs();
      hybridMatchSeen = true;
      hybridLastMatch = {
        bestIdx,
        bestSim: Number.isFinite(bestSimValue) ? bestSimValue : Number.NaN,
        isFinal: Boolean(detail.isFinal),
        ts,
      };
      const currentIdxRaw = Number((window as any)?.currentIndex ?? NaN);
      const currentIdx = Number.isFinite(currentIdxRaw) ? currentIdxRaw : lastAsrMatch.currentIndex;
      lastAsrMatch = {
        currentIndex: currentIdx,
        bestIndex: Number.isFinite(bestIdx) ? bestIdx : lastAsrMatch.bestIndex,
        bestSim: Number.isFinite(bestSimValue) ? bestSimValue : lastAsrMatch.bestSim,
      };
    });
  } catch {}
  try {
    window.addEventListener("tp:hybrid:brake", handleHybridBrakeEvent);
    window.addEventListener("tp:hybrid:assist", handleHybridAssistEvent);
    window.addEventListener("tp:hybrid:targetHint", handleHybridTargetHintEvent);
    if (typeof document !== 'undefined') {
      document.addEventListener("tp:hybrid:brake", handleHybridBrakeEvent as any);
      document.addEventListener("tp:hybrid:assist", handleHybridAssistEvent as any);
      document.addEventListener("tp:hybrid:targetHint", handleHybridTargetHintEvent as any);
    }
    try { (window as any).__tpHybridListenersReady = true; } catch {}
  } catch {}
  function setHybridScale(nextScale: number) {
    if (nextScale === RECOVERY_SCALE) {
      offScriptEvidence = 0;
      lastOffScriptEvidenceTs = 0;
    }
    const clamped = Math.max(0, Math.min(nextScale, 1));
    if (hybridScale === clamped) return false;
    const prevOffScript = hybridSilence.offScriptActive;
    hybridScale = clamped;
    const nextOffScript = clamped < RECOVERY_SCALE;
    hybridSilence.offScriptActive = nextOffScript;
    if (prevOffScript !== nextOffScript) {
      if (nextOffScript) {
        offScriptSinceMs = nowMs();
        offScriptDurationMs = 0;
      } else {
        resetOffScriptDuration();
      }
    }
    runHybridVelocity(hybridSilence);
    return true;
  }
  function getActiveBrakeFactor(now = nowMs()) {
    if (hybridBrakeState.expiresAt <= now) {
      if (hybridBrakeState.factor !== 1 || hybridBrakeState.expiresAt !== 0) {
        hybridBrakeState = { factor: 1, expiresAt: 0, reason: null };
      }
      return 1;
    }
    return hybridBrakeState.factor;
  }
  function getActiveAssistBoost(now = nowMs(), pauseTailEligible = false) {
    if (hybridAssistState.expiresAt > now) {
      return hybridAssistState.boostPxps;
    }
    const tailActive =
      pauseTailEligible && pauseAssistTailBoost > 0 && pauseAssistTailUntil > now;
    if (tailActive) {
      return pauseAssistTailBoost;
    }
    if (pauseAssistTailBoost !== 0 || pauseAssistTailUntil !== 0) {
      pauseAssistTailBoost = 0;
      pauseAssistTailUntil = 0;
    }
    if (hybridAssistState.boostPxps !== 0 || hybridAssistState.expiresAt !== 0) {
      hybridAssistState = { boostPxps: 0, expiresAt: 0, reason: null };
    }
    return 0;
  }


  function handleHybridBrakeEvent(ev: Event) {
    if (state2.mode !== "hybrid") return;
    const now = nowMs();
    const detail = (ev as CustomEvent)?.detail || {};
    const factorRaw = Number(detail.factor);
    const safeFactor = Number.isFinite(factorRaw) ? clamp(factorRaw, 0, 1) : 1;
    const ttlRaw = Number.isFinite(Number(detail.ttlMs)) ? Number(detail.ttlMs) : HYBRID_BRAKE_DEFAULT_TTL;
    const ttl = Math.max(HYBRID_EVENT_TTL_MIN, Math.min(HYBRID_EVENT_TTL_MAX, ttlRaw));
    const reason = typeof detail.reason === "string" ? detail.reason : null;
    if (reason === "asr-pursuit") {
      if (isDevMode()) {
        const elapsed = now - lastIgnoredAsrPursuitLogAt;
        if (elapsed >= IGNORED_ASR_PURSUIT_LOG_THROTTLE_MS) {
          lastIgnoredAsrPursuitLogAt = now;
          try {
            console.info(
              `[HYBRID_BRAKE] ignored asr-pursuit ${JSON.stringify({
                now,
                safeFactor,
                ttl,
                reason,
              })}`,
            );
          } catch {}
        }
      }
      return;
    }

    const prev = hybridBrakeState;
    const prevActive = prev.expiresAt > now;
    const prevFactor = prev.factor;
    const prevReason = prev.reason;
    const remaining = prev.expiresAt - now;
    const FACTOR_EPS = 0.01;
    const REFRESH_WINDOW_MS = 120;
    const sameFactor = Math.abs(prevFactor - safeFactor) <= FACTOR_EPS;
    const sameReason = prevReason === reason;

    if (prevActive && sameFactor && sameReason && remaining > REFRESH_WINDOW_MS) {
      if (isDevMode()) {
        try {
          console.info(
            `[HYBRID_BRAKE] ignore refresh ${JSON.stringify({
              now,
              safeFactor,
              ttl,
              reason,
              remaining,
            })}`,
          );
        } catch {}
      }
      return;
    }

    if (safeFactor >= 0.999) {
      setHybridBrake(1, 0, null);
    } else {
      setHybridBrake(safeFactor, ttl, reason);
    }

    if (isDevMode()) {
      try {
        console.warn(
          `[HYBRID_BRAKE_SET] ${JSON.stringify({
            now,
            factor: hybridBrakeState.factor,
            ttl,
            expiresAt: hybridBrakeState.expiresAt,
            reason,
            prevActive,
            prevFactor,
            prevReason,
            remaining,
          })}`,
        );
      } catch {}
    }
  }

  function handleHybridAssistEvent(ev: Event) {
    if (state2.mode !== "hybrid") return;
    const detail = (ev as CustomEvent)?.detail || {};
    const boostRaw = Number.isFinite(Number(detail.boostPxps)) ? Number(detail.boostPxps) : 0;
    const boost = boostRaw > 0 ? Math.min(HYBRID_ASSIST_MAX_BOOST, boostRaw) : 0;
    const ttlRaw = Number.isFinite(Number(detail.ttlMs)) ? Number(detail.ttlMs) : HYBRID_ASSIST_DEFAULT_TTL;
    const ttl = Math.max(HYBRID_EVENT_TTL_MIN, Math.min(HYBRID_EVENT_TTL_MAX, ttlRaw));
  if (boost <= 0) {
    hybridAssistState = { boostPxps: 0, expiresAt: 0, reason: null };
  } else {
    hybridAssistState = {
      boostPxps: boost,
      expiresAt: nowMs() + ttl,
      reason: typeof detail.reason === "string" ? detail.reason : null,
    };
  }
  pauseAssistTailBoost = 0;
  pauseAssistTailUntil = 0;
  scheduleHybridVelocityRefresh();
    runHybridVelocity(hybridSilence);
  }

  function handleHybridTargetHintEvent(ev: Event) {
    const detail = (ev as CustomEvent)?.detail || {};
    try {
      console.info('[HYBRID_CTRL] targetHint recv', {
        confidence: detail?.confidence,
        top: detail?.top,
        reason: detail?.reason,
      });
    } catch {}
    const topRaw = Number(detail.targetTop ?? detail.top);
    if (!Number.isFinite(topRaw)) return;
    const top = topRaw;
    const confidenceRaw = Number.isFinite(Number(detail.confidence)) ? Number(detail.confidence) : 0;
    const confidence = Math.max(0, Math.min(1, confidenceRaw));
    armHybridCommitBoostWindow(detail?.reason);
    const anchorTopRaw = Number(detail.anchorTop);
    const anchorTop = Number.isFinite(anchorTopRaw) ? anchorTopRaw : null;
    const markerPctRaw = Number(detail.markerPct);
    const markerPct =
      Number.isFinite(markerPctRaw) && markerPctRaw >= 0 && markerPctRaw <= 1 ? markerPctRaw : null;
    const lineIndexRaw = Number(detail.lineIndex ?? detail.anchorLine ?? detail.targetLine);
    const lineIndex =
      Number.isFinite(lineIndexRaw) && lineIndexRaw >= 0 ? lineIndexRaw : null;
    const resolvedTargetTop = Number.isFinite(anchorTopRaw) ? anchorTopRaw : top;
    if (Number.isFinite(resolvedTargetTop)) {
      hybridLastGoodTargetTop = resolvedTargetTop;
    }
    hybridTargetHintState = {
      top,
      confidence,
      reason: typeof detail.reason === "string" ? detail.reason : undefined,
      ts: nowMs(),
      anchorTop,
      markerPct,
      lineIndex,
    };
  }
  function computeEffectiveHybridScale(
    now: number,
    silence = hybridSilence,
    pauseLikelyOverride?: boolean,
    forceOffScript = false,
    candidateErrorLines?: number | null,
    weakMatch = false,
  ) {
    syncOffScriptDuration(now);
    const pauseLikely =
      typeof pauseLikelyOverride === "boolean" ? pauseLikelyOverride : isPlannedPauseLikely();
    const scaleFromSilence =
      silence.pausedBySilence && pauseLikely
        ? PAUSE_DRIFT_SCALE
        : silence.pausedBySilence
        ? SILENCE_SCALE
        : 1;
    const offScriptActive = forceOffScript || silence.offScriptActive;
    const offScriptDecay = silence.offScriptActive ? computeOffScriptDecay(offScriptDurationMs) : 1;
    const scaleFromOffscript = offScriptActive ? OFFSCRIPT_SCALE * offScriptDecay : 1;
    const graceActive = isHybridGraceActive(now);
    const scaleFromGrace = GRACE_MIN_SCALE;
    const nearTarget =
      Number.isFinite(candidateErrorLines ?? NaN) &&
      Math.abs(candidateErrorLines ?? 0) <= HYBRID_CTRL_MODE_DEADBAND_LINES;
    const onScriptLocked =
      onScriptStreak >= 2 &&
      now - lastGoodMatchAtMs < ON_SCRIPT_LOCK_HOLD_MS &&
      !weakMatch &&
      !offScriptActive &&
      nearTarget;
    if (onScriptLocked) {
      return {
        scale: 1,
        reason: 'on-script-lock',
        scaleFromSilence,
        scaleFromOffscript,
        scaleFromGrace,
        graceActive,
        pauseLikely,
        onScriptLocked,
        offScriptActive,
        pausedBySilence: silence.pausedBySilence,
        offScriptDurationMs: silence.offScriptActive ? offScriptDurationMs : 0,
        offScriptDecay,
      };
    }
    let chosenScale = 1;
    let reason: 'base' | 'grace' | 'offscript' | 'silence' | 'on-script-lock' = 'base';
    if (silence.pausedBySilence) {
      chosenScale = scaleFromSilence;
      reason = 'silence';
    } else if (silence.offScriptActive) {
      chosenScale = scaleFromOffscript;
      reason = 'offscript';
    } else if (graceActive) {
      chosenScale = scaleFromGrace;
      reason = 'grace';
    } else {
      chosenScale = 1;
      reason = 'base';
    }
    return {
      scale: chosenScale,
      reason,
      scaleFromSilence,
      scaleFromOffscript,
      scaleFromGrace,
      graceActive,
      pauseLikely,
      onScriptLocked,
      offScriptActive,
      pausedBySilence: silence.pausedBySilence,
      offScriptDurationMs: silence.offScriptActive ? offScriptDurationMs : 0,
      offScriptDecay,
    };
  }

function applyHybridVelocityCore(silence = hybridSilence) {
  const candidateBase = Number.isFinite(hybridBasePxps) ? hybridBasePxps : 0;
  const base = candidateBase > 0 ? candidateBase : HYBRID_BASELINE_FLOOR_PXPS;
  const now = nowMs();
  const matchState = getHybridMatchState();
  const { bestSim, sawNoMatch, weakMatch: baseWeakMatch, hardNoMatch } = matchState;
  const matchSimValue =
    Number.isFinite(bestSim ?? NaN) && bestSim != null ? (bestSim as number) : null;
  const matchKnown =
    hybridMatchSeen && matchSimValue != null && matchSimValue > 0 && !sawNoMatch;
  const matchReason = matchKnown
    ? hybridLastMatch?.isFinal
      ? 'asr-final'
      : 'asr'
    : 'unknown';
    if (isDevMode() && !hybridCtrl.engagedLogged) {
      hybridCtrl.engagedLogged = true;
      try {
        console.info('[HYBRID_CTRL] engaged', {
          hasTargetHint: !!hybridTargetHintState,
        });
      } catch {}
    }
    const silenceMs = getSilenceMs(now);
    const errorInfo = computeHybridErrorPx(now);
    const driftWeakMatch = isHybridDriftWeak(errorInfo);
    const weakMatch = baseWeakMatch || driftWeakMatch;
    const eligibility = evaluateHybridEligibility(now);
    const eligible = eligibility.eligible;
    const eligibleReason = eligibility.reason;
    const normalizedError = eligible && errorInfo ? normalizeHybridError(errorInfo.errorPx) : 0;
    const targetMultFromPx = eligible ? computeTargetMultiplier(normalizedError) : 1;
    const errorLines =
      Number.isFinite(errorInfo?.errorLines ?? NaN) && errorInfo?.errorLines != null
        ? errorInfo.errorLines
        : null;
    let effectiveErrorLines = errorLines;
    if (weakMatch) {
      const errorPxValue =
        Number.isFinite(errorInfo?.errorPx ?? NaN) && errorInfo?.errorPx != null
          ? errorInfo.errorPx
          : null;
      if (Number.isFinite(errorPxValue ?? NaN)) {
        const estimatedLines = errorPxValue! / HYBRID_CTRL_LINE_PX_DEFAULT;
        const clampedEstimated = Math.max(
          -HYBRID_CTRL_LINE_ERROR_RANGE,
          Math.min(HYBRID_CTRL_LINE_ERROR_RANGE, estimatedLines),
        );
        effectiveErrorLines = Number.isFinite(clampedEstimated) ? clampedEstimated : effectiveErrorLines;
      } else if (effectiveErrorLines == null) {
        effectiveErrorLines = 0;
      }
    }
    const lineTargetMultFromLines = computeLineTargetMultiplier(effectiveErrorLines, eligible);
    let candidateTargetMult: number | null = lineTargetMultFromLines;
    let targetMultSource: HybridCtrlLineSource = 'none';
    if (candidateTargetMult != null) {
      targetMultSource = 'lines';
    } else if (eligible) {
      candidateTargetMult = targetMultFromPx;
      targetMultSource = 'px';
    } else {
      candidateTargetMult = 1;
      targetMultSource = 'none';
    }
    hybridCtrl.lineTargetMult = Number.isFinite(candidateTargetMult ?? NaN)
      ? Number(candidateTargetMult)
      : null;
    hybridCtrl.lineSource = targetMultSource;
    const silenceCap = computeSilenceCapMultiplier(silenceMs);
    const dtMs = hybridCtrl.lastTs > 0 ? Math.max(0, now - hybridCtrl.lastTs) : 0;
    const errorLinesRaw =
      Number.isFinite(errorInfo?.errorLines ?? NaN) && errorInfo?.errorLines != null
        ? errorInfo.errorLines
        : Number.isFinite(effectiveErrorLines ?? NaN)
        ? effectiveErrorLines
        : 0;
    const lineMult = updateHybridLineMult(candidateTargetMult, dtMs, errorLinesRaw > 0);
    let appliedTargetMult = Number.isFinite(lineMult) ? lineMult : 1;
    const offScriptSeverity = computeOffScriptSeverity();
    const offScriptCap = Math.max(
      HYBRID_CTRL_MIN_MULT,
      1 - offScriptSeverity * HYBRID_CTRL_OFFSCRIPT_PENALTY,
    );
    appliedTargetMult = Math.min(appliedTargetMult, silenceCap);
    appliedTargetMult = Math.min(appliedTargetMult, offScriptCap);
    appliedTargetMult = Math.max(appliedTargetMult, HYBRID_CTRL_MIN_MULT);
    hybridCtrl.lastErrorPx = errorInfo?.errorPx ?? 0;
    hybridCtrl.lastAnchorTs = errorInfo?.anchorAgeMs ?? 0;
    hybridCtrl.lastTs = now;
    const targetMult = candidateTargetMult ?? 1;
    const devOverrideMult = getHybridCtrlDevOverride(now);
    const ctrlMultFinal = Number.isFinite(devOverrideMult) ? devOverrideMult : appliedTargetMult;
    hybridCtrl.mult = ctrlMultFinal;
    const ctrlMultApplied = ctrlMultFinal;
    const hybridScaleDetail = computeEffectiveHybridScale(
      now,
      silence,
      undefined,
      weakMatch,
      effectiveErrorLines,
      weakMatch,
    );
    const {
      scale: effectiveScaleRaw,
      reason,
      scaleFromSilence,
      scaleFromOffscript,
      scaleFromGrace,
      graceActive,
      pauseLikely,
      onScriptLocked,
      offScriptActive,
      pausedBySilence,
      offScriptDecay,
    } = hybridScaleDetail;

    // --- Hybrid Aggro policy -------------------------------------------------
    const aggro = isHybridAggroEnabled();
    const commitBoost = isHybridCommitBoostActive();
    let effectiveScale = effectiveScaleRaw;
    const offScriptScale =
      hybridSilence.offScriptActive && Number.isFinite(hybridScale)
        ? clamp(hybridScale, 0, 1)
        : 1;
    const offScriptMultiplier =
      offScriptActive && Number.isFinite(offScriptDecay) ? offScriptScale * offScriptDecay : 1;

    // Aggro tuning knobs (prove capability first; dial back later)
    const maxScale = aggro ? HYBRID_CTRL_AGGRO_MAX_MULT : HYBRID_CTRL_BASE_MAX_MULT;
    const confMin = (aggro && commitBoost) ? 0.35 : 0.65;
    const simMin = (aggro && commitBoost) ? 0.45 : 0.55;

    const needCatchUp = Number.isFinite(errorLinesRaw) ? errorLinesRaw > 0 : false;

    const conf = Number.isFinite(errorInfo?.confidence ?? NaN)
      ? (errorInfo!.confidence as number)
      : Number.isFinite(hybridTargetHintState?.confidence ?? NaN)
      ? (hybridTargetHintState!.confidence as number)
      : 0;

    const sim = Number.isFinite(bestSim ?? NaN) ? (bestSim as number) : 0;

    // Only apply aggro scaling when we're on-script-ish and actually behind.
    const eligibleForAggro =
      needCatchUp &&
      !pausedBySilence &&
      !offScriptActive &&
      reason !== 'silence' &&
      reason !== 'offscript' &&
      reason !== 'grace';

    if ((aggro || commitBoost) && eligibleForAggro) {
      // Respect gating unless we’re in the post-commit permission window.
      const gatingOk = (aggro && commitBoost) || (conf >= confMin && sim >= simMin);

      if (gatingOk) {
        // Map distance behind (in lines) directly into a scale boost.
        const errBoost = clamp(Math.abs(errorLinesRaw) / 6.0, 0, 1); // ~6 lines => full boost
        const distanceScale = 1 + errBoost * (maxScale - 1);

        // Open the throttle: take the higher of existing scale vs distance-driven scale.
        effectiveScale = Math.min(maxScale, Math.max(effectiveScale, distanceScale));

        if (isDevMode()) {
          try {
            console.warn('[HYBRID_TRUTH]', {
              aggro,
              commitBoost,
              needCatchUp,
              errorLines: Math.round(errorLinesRaw * 10) / 10,
              conf: Math.round(conf * 100) / 100,
              sim: Math.round(sim * 100) / 100,
              distanceScale: Math.round(distanceScale * 100) / 100,
              effectiveScale: Math.round(effectiveScale * 100) / 100,
              basePxps: Math.round(base * 10) / 10,
              writerSource: getLastWriterSource(),
            });
          } catch {}
        }
      }
    }

    const pauseTailEligible = pauseLikely && silence.pausedBySilence;
    if (pauseTailEligible && hybridAssistState.boostPxps > 0) {
      pauseAssistTailBoost = hybridAssistState.boostPxps;
      pauseAssistTailUntil = Math.max(pauseAssistTailUntil, now + PAUSE_ASSIST_TAIL_MS);
    } else if (!pauseTailEligible) {
      pauseAssistTailBoost = 0;
      pauseAssistTailUntil = 0;
    }
    logHybridScaleDetail({
      basePxps: base,
      scaleFromSilence,
      scaleFromOffscript,
      scaleFromGrace,
      graceActive,
      chosenScale: effectiveScale,
      reason,
      pauseLikely,
      onScriptLocked,
      offScriptActive,
      pausedBySilence,
    });
    const brakeActive = hybridBrakeState.expiresAt > now;
    const brakeTtl = Math.max(0, hybridBrakeState.expiresAt - now);
    const assistActive = hybridAssistState.expiresAt > now;
    const assistTtl = Math.max(0, hybridAssistState.expiresAt - now);
    const brakeRaw = getActiveBrakeFactor(now);
    const brakeFactor = graceActive ? 1 : brakeRaw;
    const motorRunning = hybridMotor.isRunning();
    logHybridBrakeEvent({
      now,
      brakeRaw,
      brakeFactor,
      graceActive,
      brakeExpiresAt: hybridBrakeState.expiresAt,
      brakeReason: hybridBrakeState.reason,
      brakeActive,
      brakeTtl,
      motorRunning,
    });
    const rawAssist = getActiveAssistBoost(now, pauseTailEligible);
    const suppressAssist = reason === 'silence' || effectiveScale <= OFFSCRIPT_SCALE || reason === 'grace';
    const assistCap = Math.max(0, base * HYBRID_ASSIST_CAP_FRAC);
    const assistBoost = suppressAssist ? 0 : Math.min(rawAssist, assistCap);
    const baseWithCorrection = base * ctrlMultApplied;

    const deltaLines = Number.isFinite(errorLinesRaw) ? errorLinesRaw : 0;
    const absDL = Math.abs(deltaLines);
    const deadbandLines = aggro ? 0.45 : 0.75;
    const kDown = aggro ? 0.26 : 0.14;
    let reactiveScale = 1.0;
    const reasons: string[] = [];
    if (absDL > deadbandLines) {
      if (deltaLines > 0) {
        const baseGain = deltaLines * HYBRID_REACTIVE_BEHIND_BASE;
        const bonusGain = Math.max(0, deltaLines - HYBRID_REACTIVE_BEHIND_ACC_THRESHOLD) * HYBRID_REACTIVE_BEHIND_ACC_BONUS;
        reactiveScale = 1 + baseGain + bonusGain;
      } else {
        const raw = 1 - kDown * (absDL - deadbandLines);
        const minReactive = aggro ? 0.50 : 0.65;
        const maxReactive = aggro ? 1.90 : 1.45;
        reactiveScale = clamp(raw, minReactive, maxReactive);
      }
      reasons.push(deltaLines > 0 ? 'behind' : 'ahead');
    } else {
      reasons.push('deadband');
    }

    let policyMult = 1.0;
    if (pausedBySilence || reason === 'silence') {
      const silenceMult = aggro ? 0.75 : 0.85;
      policyMult *= silenceMult;
      reasons.push('silence');
    }
    if (offScriptActive || reason === 'offscript') {
      const offscriptMult = aggro ? 0.80 : 0.90;
      policyMult *= offscriptMult;
      reasons.push('offscript');
    }

    const preClampScale = reactiveScale * policyMult;

    let scaleAfterBrake = preClampScale;
    if (brakeActive) {
      scaleAfterBrake = Math.min(scaleAfterBrake, brakeFactor);
      reasons.push('brakeCap');
    }

    let scaleAfterCaps = scaleAfterBrake;
    const assistFloorScale = suppressAssistScale(rawAssist, baseWithCorrection);
    const assistEligible = assistActive && assistFloorScale > 0 && needCatchUp && conf >= confMin;
    if (assistEligible) {
      scaleAfterCaps = Math.max(scaleAfterCaps, assistFloorScale);
      reasons.push('assistFloor');
    }

    const minScale = HYBRID_CTRL_MIN_MULT;
    const maxClampScale = Math.max(maxScale, minScale);
    const isBehind = deltaLines > 0;
    const clampOverride = isBehind || assistEligible;
    const scaleLimitedToMax = Math.min(scaleAfterCaps, maxClampScale);
    let finalScale = scaleLimitedToMax;
    let clampReason: 'minClamp' | 'maxClamp' | null = null;
    if (scaleAfterCaps > maxClampScale) {
      finalScale = maxClampScale;
      clampReason = 'maxClamp';
    } else if (!clampOverride && scaleLimitedToMax < minScale) {
      finalScale = minScale;
      clampReason = 'minClamp';
    }
    if (clampReason) {
      reasons.push(clampReason);
    }

    const errorPx =
      Number.isFinite(errorInfo?.errorPx ?? NaN) && errorInfo?.errorPx != null
        ? errorInfo.errorPx
        : null;
    const distancePx = errorPx != null ? Math.abs(errorPx) : null;
    const stableOnTarget =
      distancePx != null &&
      distancePx <= HYBRID_CTRL_ON_TARGET_STABLE_PX &&
      Math.abs(deltaLines) <= HYBRID_CTRL_MODE_DEADBAND_LINES;
    if (stableOnTarget) {
      finalScale = clamp(finalScale, HYBRID_CTRL_ON_TARGET_MULT_MIN, HYBRID_CTRL_ON_TARGET_MULT_MAX);
    }

    if (offScriptMultiplier !== 1) {
      finalScale *= offScriptMultiplier;
      reasons.push('offscriptDecay');
    }

    const minPxps = offScriptMultiplier < 1 ? 0 : HYBRID_CTRL_MIN_PXPS;
    const finalPxpsBase = Math.max(minPxps, baseWithCorrection * finalScale);
    const assistFloorBoostPx = assistEligible && isBehind ? base * HYBRID_CTRL_ASSIST_BEHIND_BOOST_FRAC : 0;
    const finalPxps = finalPxpsBase + assistFloorBoostPx * offScriptMultiplier;
    const velocityPxps = Number.isFinite(finalPxps) ? Math.abs(finalPxps) : 0;
    const targetTopSourceRaw = errorInfo?.targetTopSource ?? null;
    const targetTopAnchor = targetTopSourceRaw === 'anchor';
    const provisionalAnchor = matchKnown && targetTopAnchor;
    const nearError = distancePx != null && distancePx <= HYBRID_ON_TARGET_PX;
    const nearLines = Math.abs(deltaLines) <= HYBRID_ON_TARGET_LINES;
    const forceOnTarget =
      provisionalAnchor &&
      nearError &&
      nearLines &&
      matchKnown &&
      velocityPxps <= HYBRID_CTRL_ON_TARGET_VELOCITY_EPS &&
      brakeTtl > 0;
    const hintedErrorLines =
      Number.isFinite(errorInfo?.errorLines ?? NaN) && errorInfo?.errorLines != null
        ? errorInfo.errorLines
        : null;
    let modeHint = computeHybridModeHint(forceOnTarget ? 0 : hintedErrorLines, weakMatch);
    if (!matchKnown && (brakeActive || hybridSilence.pausedBySilence)) {
      modeHint = 'LETTING YOU CATCH UP';
    }
    const finalReasons = reasons.length > 0 ? reasons : ['base'];
    const capReason =
      finalReasons.includes('silence')
        ? 'silence'
        : finalReasons.includes('offscript')
        ? 'offscript'
        : undefined;

    logHybridMultDebug({
      basePxps: base,
      errorLines: errorInfo?.errorLines ?? null,
      targetMult: Number.isFinite(candidateTargetMult ?? NaN)
        ? Number(candidateTargetMult)
        : 1,
      lineMult: appliedTargetMult,
      finalPxps,
      capReason: finalReasons.join(','),
    });
    logHybridCtrlState(
      base,
      baseWithCorrection,
      now,
      errorInfo,
      silenceMs,
      eligible,
      eligibleReason,
      normalizedError,
      targetMult,
      targetMultSource,
      hybridCtrl.lineTargetMult,
      hybridCtrl.lineMult,
      appliedTargetMult,
      silenceCap,
      offScriptSeverity,
      offScriptCap,
      finalPxps,
      ctrlMultApplied,
      finalScale,
      modeHint,
    );
    renderHybridCtrlHud({
      basePxps: base,
      baseWithCorrection,
      errorPx: errorInfo?.errorPx ?? null,
      anchorAgeMs: errorInfo?.anchorAgeMs ?? null,
      normalizedError,
      targetMult,
      appliedTargetMult,
      mult: hybridCtrl.mult,
      silenceMs,
      silenceCap,
      offScriptSeverity,
      offScriptCap,
      eligible,
      targetTop: errorInfo?.targetScrollTop ?? null,
      currentTop: errorInfo?.currentScrollTop ?? null,
      modeHint,
      ctrlMultApplied,
      effectiveScaleApplied: finalScale,
      finalPxps,
      eligibleReason,
      errorLines: errorInfo?.errorLines ?? null,
      markerIdx: errorInfo?.markerIdx ?? null,
      bestIdx: errorInfo?.bestIdx ?? null,
      targetMultSource,
      lineTargetMult: hybridCtrl.lineTargetMult,
      lineMult: hybridCtrl.lineMult,
      lineSource: targetMultSource,
      writerSource: getLastWriterSource(),
    });
    const effectiveScaleApplied = finalScale;
    const effective = baseWithCorrection * effectiveScaleApplied;
    logHybridVelocityEvent({
      basePxps: base,
      chosenScale: finalScale,
      brakeFactor,
      effective,
      rawAssist,
      assistCap,
      assistBoost,
      suppressAssist,
      velocity: finalPxps,
      reason,
      brakeActive,
      brakeTtl,
      assistActive,
      assistTtl,
      graceActive,
      motorRunning,
    });

    logHybridTruthLine({
      basePxps: base,
      finalPxps,
      errorPx: errorInfo?.errorPx,
      errorLines: errorInfo?.errorLines ?? null,
      effectiveErrorLines,
      targetMult,
      lineMult,
      capReason,
      scaleReason: hybridScaleDetail.reason,
      sawNoMatch,
      hardNoMatch,
      offScriptActive: hybridScaleDetail.offScriptActive,
      bestSim,
      weakMatch,
      driftWeak: driftWeakMatch,
      targetTopSource: errorInfo?.targetTopSource ?? null,
    });
    const wantedPxps = Number.isFinite(base) ? base * finalScale : finalScale;
    const sentPxps = finalPxps;
    const clampStage =
      finalReasons.includes("maxClamp")
        ? "postScaleMaxClamp"
        : finalReasons.includes("minClamp")
        ? "postScaleMinClamp"
        : finalReasons.includes("brakeCap")
        ? "motorBrakeClamp"
        : finalReasons.includes("assistFloor")
        ? "assistFloorClamp"
        : "unknown_post_final_mile";
    if (isDevMode()) {
      try {
        const logParts = [
          `basePxps=${base.toFixed(2)}`,
          `deltaLines=${deltaLines.toFixed(2)}`,
          `errorPx=${errorPx?.toFixed(1) ?? "null"}`,
          `reactiveScale=${reactiveScale.toFixed(3)}`,
          `policyMult=${policyMult.toFixed(3)}`,
          `preClampScale=${preClampScale.toFixed(3)}`,
          `scaleAfterCaps=${scaleAfterCaps.toFixed(3)}`,
          `capMax=${maxClampScale.toFixed(3)}`,
          `floorMin=${minScale.toFixed(3)}`,
          `finalScale=${finalScale.toFixed(3)}`,
          `finalPxps=${finalPxps.toFixed(2)}`,
          `reasons=${finalReasons.join("|")}`,
        ];
        console.info("[HYBRID_FINAL_MILE]", logParts.join(" "));

        const matchSimLog = matchKnown ? matchSimValue : null;
        const stateParts = [
          `noMatch=${sawNoMatch || !matchKnown}`,
          `weakMatch=${weakMatch}`,
          `hardNoMatch=${hardNoMatch}`,
          `offScriptActive=${offScriptActive}`,
          `reason=${reason}`,
          `conf=${conf.toFixed(2)}`,
          `sim=${sim.toFixed(2)}`,
          `matchSim=${matchSimLog != null ? matchSimLog.toFixed(2) : "null"}`,
          `matchReason=${matchReason}`,
          `targetTopSrc=${matchKnown ? errorInfo?.targetTopSource ?? "unknown" : "unknown"}`,
        ];
        console.info("[HYBRID_FINAL_MILE_STATE]", stateParts.join(" "));
      } catch {}
    }
    if (wantedPxps !== sentPxps) {
      const clampPayload = {
        stage: clampStage,
        basePxps: base,
        finalScale,
        wantedPxps,
        finalPxps: sentPxps,
        deltaLines,
        reasons: finalReasons,
        capMax: maxClampScale,
        capMin: minScale,
      };
      try {
        console.warn("[HYBRID_POST_CLAMP]", JSON.stringify(clampPayload));
      } catch {}
    }

    hybridMotor.setVelocityPxPerSec(finalPxps);
    emitHybridSafety();
    scheduleHybridVelocityRefresh();
  }
  try {
    const target = typeof window !== 'undefined' ? window : globalThis;
    (target as any).__tpApplyHybridVelocity = applyHybridVelocityCore;
  } catch {}

  function _markHybridOffScript() {
    if (state2.mode !== "hybrid") return;
    const changed = setHybridScale(OFFSCRIPT_DEEP);
    if (!changed) emitHybridSafety();
  }
  markHybridOffScriptFn = _markHybridOffScript;
  function suppressAssistScale(boost: number, base: number) {
    if (!Number.isFinite(boost) || boost <= 0) return 0;
    if (!Number.isFinite(base) || base <= 0) return 0;
    const scale = 1 + boost / Math.max(base, HYBRID_CTRL_MIN_PXPS);
    return clamp(scale, 1, 2);
  }
  function emitHybridSafety() {
    try {
    const payload = {
      pausedBySilence: hybridSilence.pausedBySilence,
      offScriptStreak,
      onScriptStreak,
      scale: hybridScale,
      lastSpeechAtMs: hybridSilence.lastSpeechAtMs,
      targetHint: hybridTargetHintState ?? undefined,
      hybridSilenceStamp: hybridSilence2,
    };
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tp:hybridSafety", { detail: payload }));
      }
    } catch {}
  }
  function resetHybridSafetyState() {
    offScriptStreak = 0;
    onScriptStreak = 0;
    hybridSilence.pausedBySilence = false;
    clearHybridSilenceTimer();
    setHybridScale(RECOVERY_SCALE);
    cancelHybridVelocityRefresh();
    emitHybridSafety();
  }
  const AUTO_MIN = 1;
  const AUTO_MAX = 60;
  const AUTO_STEP_FINE = 1;
  const AUTO_STEP_COARSE = 5;
  const getStoredSpeed = () => {
    try {
      const raw = localStorage.getItem("tp_auto_speed");
      const v = raw != null ? parseFloat(raw) : NaN;
      if (!Number.isFinite(v)) return 21;
      return Math.min(AUTO_MAX, Math.max(AUTO_MIN, v));
    } catch {
      return 21;
    }
  };
  const getCurrentSpeed = () => {
    try {
      const fromApi = auto?.getState?.().speed;
      if (typeof fromApi === "number" && Number.isFinite(fromApi)) {
        return Math.min(AUTO_MAX, Math.max(AUTO_MIN, fromApi));
      }
    } catch {}
    return getStoredSpeed();
  };
  const setSpeed = (next) => {
    const clamped = Math.min(AUTO_MAX, Math.max(AUTO_MIN, Number(next) || 0));
    try { auto?.setSpeed?.(clamped); } catch {}
    try { localStorage.setItem("tp_auto_speed", String(clamped)); } catch {}
    return clamped;
  };
  const nudgeSpeed = (delta) => setSpeed(getCurrentSpeed() + delta);
  setSpeed(getStoredSpeed());

  function getStoredBaselineWpmPx(): number | null {
    try {
      const stored = localStorage.getItem("tp_baseline_wpm");
      const wpm = stored ? parseFloat(stored) : NaN;
      if (Number.isFinite(wpm) && wpm > 0) {
        const px = convertWpmToPxPerSec(wpm);
        if (px > 0) return px;
      }
    } catch {}
    return null;
  }
  function getSliderBaselinePx(): number | null {
    try {
      const sliderInput = document.getElementById("wpmTarget") as HTMLInputElement | null;
      const sliderVal = sliderInput ? Number(sliderInput.value) : NaN;
      if (Number.isFinite(sliderVal) && sliderVal > 0) {
        const px = convertWpmToPxPerSec(sliderVal);
        if (px > 0) return px;
      }
    } catch {}
    return null;
  }
  function getLastKnownAutoSpeed(): number | null {
    try {
      let pxFromAuto: number | undefined;
      if (typeof auto?.getState === "function") {
        pxFromAuto = auto.getState()?.speed;
      }
      const px = Number(pxFromAuto ?? getStoredSpeed());
      if (Number.isFinite(px) && px > 0) return px;
    } catch {}
    return null;
  }
  function resolveHybridSeedPx(): number {
    const slider = getSliderBaselinePx();
    if (slider && Number.isFinite(slider) && slider > 0) {
      sliderTouchedThisSession = true;
      return slider;
    }
    const stored = getStoredBaselineWpmPx();
    if (stored && Number.isFinite(stored) && stored > 0) {
      return stored;
    }
    if (!sliderTouchedThisSession) {
      const auto = getLastKnownAutoSpeed();
      if (auto && Number.isFinite(auto) && auto > 0) {
        return auto;
      }
    }
    return HYBRID_BASELINE_FLOOR_PXPS;
  }

  function resolveAutoPxPerSec(candidate?: number | null): number {
    let px = Number(candidate ?? NaN);
    if (!Number.isFinite(px) || px <= 0) {
      px = resolveHybridSeedPx();
    }
    if (!Number.isFinite(px) || px <= 0) {
      px = HYBRID_BASELINE_FLOOR_PXPS;
    }
    return px;
  }

  function logHybridBaselineState(source: string) {
    if (!isDevMode()) return;
    try {
      const base = Number.isFinite(hybridBasePxps) ? hybridBasePxps : 0;
      const scale = Number.isFinite(hybridScale) ? hybridScale : 0;
      const effective = base * scale;
      const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(1) : '0.0');
      console.info(`[HYBRID] baseline=${fmt(base)} scale=${fmt(scale)} effective=${fmt(effective)} source=${source}`);
    } catch {}
  }
  function setHybridBasePxps(nextPxps: number): number {
    const candidate = Number.isFinite(nextPxps) && nextPxps > 0 ? nextPxps : HYBRID_BASELINE_FLOOR_PXPS;
    if (hybridBasePxps === candidate) return candidate;
    const prev = hybridBasePxps;
    hybridBasePxps = candidate;
    if (isDevMode()) {
      try {
        const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(1) : '0.0');
        console.info(`[HYBRID] baseline updated from WPM: ${fmt(prev)} → ${fmt(candidate)}`);
      } catch {}
    }
      runHybridVelocity(hybridSilence);
    return candidate;
  }

  function seedHybridBaseSpeed(): number {
    const base = resolveHybridSeedPx();
    setHybridBasePxps(base);
    return hybridBasePxps;
  }

  try {
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (!w.__scrollCtl) w.__scrollCtl = {};
      w.__scrollCtl.setSpeed = (next: number) => {
        try { setSpeed(next); } catch {}
      };
      w.__scrollCtl.stopAutoCatchup = () => {
        try { auto?.stop?.(); } catch {}
      };
    }
  } catch {}

  try {
    window.addEventListener('tp:autoSpeed', (ev) => {
      try {
        const detail = (ev as CustomEvent)?.detail || {};
        const raw = detail.pxPerSec ?? detail.px ?? detail.speed ?? detail.value;
        const pxs = Number(raw);
        if (!Number.isFinite(pxs) || pxs <= 0) return;
        if (state2.mode === 'hybrid') {
          applyWpmBaselinePx(pxs, 'autoSpeed');
        } else {
          setSpeed(pxs);
        }
      } catch {}
    });
  } catch {}
  let applyGateRaf: number | null = null;
  const MOTOR_IGNORED_LOG_THROTTLE_MS = 2000;
  let lastMotorIgnoredLogAt = 0;
  let lastMotorIgnoredLogKey = '';
  function logAutoGateAction(action: string, mode: string, line: string, blockedReason = '') {
    if (mode === 'asr' && blockedReason === 'blocked:mode-asr-motorless') {
      return;
    }
    if (action !== 'MOTOR_IGNORED_OFF') {
      try { console.info(line); } catch {}
      return;
    }
    const now = Date.now();
    const dedupeKey = `${mode}|${blockedReason}`;
    if (dedupeKey === lastMotorIgnoredLogKey && now - lastMotorIgnoredLogAt < MOTOR_IGNORED_LOG_THROTTLE_MS) {
      return;
    }
    lastMotorIgnoredLogKey = dedupeKey;
    lastMotorIgnoredLogAt = now;
    try { console.debug(line); } catch {}
  }
  function scheduleApplyGate() {
    if (applyGateRaf != null) return;
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      try {
        applyGate();
      } catch {}
      return;
    }
    applyGateRaf = window.requestAnimationFrame(() => {
      applyGateRaf = null;
      try {
        applyGate();
      } catch {}
    });
  }

  function applyGate() {
    try {
    const mode = getScrollMode();
    if (mode !== "hybrid") {
      assertHybridStoppedIfNotHybrid('applyGate');
      if (silenceTimer) {
        try { clearTimeout(silenceTimer); } catch {}
        silenceTimer = void 0;
      }
      if (hybridMotor.isRunning()) {
        hybridMotor.stop();
        clearActiveMotor('hybrid');
        emitMotorState("hybridWpm", false);
      }
      clearHybridSilenceTimer();
      resetHybridSafetyState();
      const requestedAutoPx = getLastKnownAutoSpeed();
      const autoPxPerSec = resolveAutoPxPerSec(requestedAutoPx);
      if (
        isDevMode() &&
        (!Number.isFinite(requestedAutoPx ?? NaN) || (requestedAutoPx ?? 0) <= 0)
      ) {
        try {
          console.warn('[AUTO] fallback to default px/sec', {
            requestedAutoPx,
            autoPxPerSec,
          });
        } catch {}
      }
      const viewerReady = hasScrollableTarget();
      const requestedMotorKind = lastAutoIntentMotorRequest.kind;
      const requestedMotorSource = lastAutoIntentMotorRequest.source;
      const livePhase = sessionPhase === 'live';
      const sessionBlocked = !sessionIntentOn && !userEnabled;
      let autoBlocked = "blocked:sessionOff";
      if (mode === "step" || mode === "rehearsal") {
        autoBlocked = `blocked:mode-${mode}`;
      } else if (mode === "asr") {
        // ASR mode is motorless by design. ASR driver commits are the only mover.
        autoBlocked = "blocked:mode-asr-motorless";
      } else if (!livePhase) {
        autoBlocked = "blocked:livePhase";
      } else if (sessionBlocked) {
        autoBlocked = "blocked:sessionOff";
      } else if (!userEnabled) {
        autoBlocked = "blocked:userIntentOff";
      } else if (!viewerReady) {
        autoBlocked = "blocked:noScrollTarget";
      } else if (!Number.isFinite(autoPxPerSec) || autoPxPerSec <= 0) {
        autoBlocked = "blocked:pxZero";
      } else {
        autoBlocked = "none";
      }
      const want = autoBlocked === "none";
      const prevEnabled = ((enabledNow || !!auto?.getState?.().enabled) && activeMotorBrain === 'auto');
      const prevRunning = !!auto?.isRunning?.();
      const action = want
        ? prevRunning
          ? "MOTOR_ALREADY_RUNNING"
          : "MOTOR_START"
        : prevEnabled
          ? "MOTOR_STOP"
          : "MOTOR_IGNORED_OFF";
      logAutoGateAction(
        action,
        mode,
        `[scroll-router] ${action} mode=${mode} reqKind=${requestedMotorKind} reqSource=${requestedMotorSource} sessionPhase=${sessionPhase} sessionIntent=${sessionIntentOn} pxPerSec=${autoPxPerSec} blocked=${autoBlocked}`,
        autoBlocked,
      );
      let emittedAutoStop = false;
      if (want) {
        try { auto.setSpeed?.(autoPxPerSec); } catch {}
        try { auto.start?.(); } catch {}
        try { auto.setEnabled?.(true); } catch {}
        enabledNow = true;
        setActiveMotor('auto', mode);
      } else {
        emittedAutoStop = stopAutoMotor(mode === 'asr' ? 'enter-asr' : autoBlocked);
      }
      const detail2 = `Mode: ${mode} \u2022 Session:${sessionPhase} \u2022 Intent:${sessionIntentOn ? "on" : "off"} \u2022 User:${userEnabled ? "On" : "Off"}`;
      setAutoChip(userEnabled ? (enabledNow ? "on" : "paused") : "manual", detail2);
      if (!emittedAutoStop) {
        emitMotorState("auto", enabledNow);
      }
      try { emitAutoState(); } catch {}
      lastHybridGateFingerprint = null;
      return;
    }
    const computeGateWanted = () => {
      switch (gatePref) {
        case "db":
          return dbGate;
        case "vad":
          return vadGate;
        case "db_and_vad":
          return dbGate && vadGate;
        case "db_or_vad":
        default:
          return dbGate || vadGate;
      }
    };
    if (enabledNow) {
      stopAutoMotor('hybrid-gate');
    }
    const now = nowMs();
    const gateWanted = computeGateWanted();
    const phaseAllowed = canRunHybridMotor();
    const baseHybridPxPerSec = Number.isFinite(hybridBasePxps) ? Math.max(0, hybridBasePxps) : 0;
    const lastSpeechAgeMs = Math.max(0, now - hybridSilence.lastSpeechAtMs);
    const liveGraceActive = isLiveGraceActive(now);
    const errorInfo = computeHybridErrorPx(now);
    const silenceStopMs = computeHybridSilenceDelayMs();
    const isSilent = !liveGraceActive && lastSpeechAgeMs >= silenceStopMs;
    const speechAllowed = !isSilent;
    const gateSatisfied = isHybridBypass() ? true : gateWanted;
    const wantEnabled =
      hybridWantedRunning &&
      userEnabled &&
      phaseAllowed &&
      (speechAllowed || gateSatisfied);
    let hybridBlockedReason = "none";
    if (!userEnabled) {
      hybridBlockedReason = "blocked:userOff";
    } else if (!phaseAllowed) {
      hybridBlockedReason = "blocked:livePhase";
    } else if (!speechAllowed && !gateSatisfied) {
      hybridBlockedReason = "blocked:hybridGate";
    }
    const silencePaused = hybridSilence.pausedBySilence || isSilent;
    hybridSilence.pausedBySilence = silencePaused;
    if (silencePaused) {
      hybridBlockedReason = "blocked:silence";
    }
    const hybridRunning = hybridMotor.isRunning();
    const silenceSnapshot =
      (hybridSilence as any)?.getState?.() ?? hybridSilence ?? null;
    const safeSilence =
      silenceSnapshot ??
      {
        lastSpeechAtMs: now,
        pausedBySilence: false,
        timeoutId: null,
        erroredOnce: false,
        offScriptActive: false,
      };
    const matchState = getHybridMatchState();
    const driftWeakMatch = isHybridDriftWeak(errorInfo);
    const gateWeakMatch = matchState.weakMatch || driftWeakMatch;
    const gateEffectiveOffScript = (safeSilence.offScriptActive ?? false) || gateWeakMatch;
    const hybridScaleDetail = computeEffectiveHybridScale(
      now,
      safeSilence,
      undefined,
      gateEffectiveOffScript,
      null,
      gateWeakMatch,
    );
    const scale = hybridScaleDetail.scale;
    const brake = getActiveBrakeFactor(now);
    const pxCandidate = baseHybridPxPerSec * scale * brake;
    const fallback = Math.max(
      HYBRID_CTRL_MIN_PXPS,
      Number.isFinite(baseHybridPxPerSec) ? baseHybridPxPerSec : HYBRID_CTRL_MIN_PXPS,
    );
    const effectivePxPerSec =
      Number.isFinite(pxCandidate) && pxCandidate > 0 ? pxCandidate : fallback;
    if (isDevMode() && now - lastHybridCtrlDebugTs >= HYBRID_CTRL_DEBUG_THROTTLE_MS) {
      lastHybridCtrlDebugTs = now;
      const targetTop =
        Number.isFinite(errorInfo?.targetScrollTop ?? NaN) && errorInfo?.targetScrollTop != null
          ? errorInfo.targetScrollTop
          : null;
      const markerTop =
        Number.isFinite(errorInfo?.markerY ?? NaN) && errorInfo?.markerY != null ? errorInfo.markerY : null;
      const deltaPx =
        Number.isFinite(errorInfo?.errorPx ?? NaN) && errorInfo?.errorPx != null
          ? errorInfo.errorPx
          : null;
      const deltaLines =
        Number.isFinite(errorInfo?.errorLines ?? NaN) && errorInfo?.errorLines != null
          ? errorInfo.errorLines
          : null;
      try {
        console.info('[HYBRID_CTRL] px-debug', {
          baselinePxps: baseHybridPxPerSec,
          targetTop,
          markerTop,
          deltaPx,
          deltaLines,
          normalizedScale: hybridScale,
          computedScale: scale,
          brake,
          reason: hybridScaleDetail.reason,
          offScript: hybridSilence.offScriptActive,
          pausedBySilence: silencePaused,
          effectivePxPerSec,
          anchorTop: Number.isFinite(errorInfo?.anchorTop ?? NaN)
            ? errorInfo?.anchorTop
            : null,
          currentTop: Number.isFinite(errorInfo?.currentScrollTop ?? NaN)
            ? errorInfo?.currentScrollTop
            : null,
          targetTopSource: errorInfo?.targetTopSource ?? null,
        });
      } catch {}
    }
    const shouldRunHybrid = wantEnabled && effectivePxPerSec >= HYBRID_CTRL_MIN_PXPS;
    const viewerEl = viewer;
    const guardSlowActive = gateEffectiveOffScript;
    const snap = {
      mode: state2.mode,
      phase: sessionPhase,
      hybridWantedRunning,
      asrEnabled: speechActive,
      lastSpeechAgeMs,
      liveGraceActive,
      isSilent,
      pausedBySilence: silencePaused,
      offScript: gateEffectiveOffScript,
      basePxps: hybridBasePxps,
      scale: hybridScale,
      effectivePxps: effectivePxPerSec,
      sessionIntentOn,
      userEnabled,
      gatePref,
      gateWanted,
      phaseAllowed,
      blocked: hybridBlockedReason,
      viewer: {
        has: !!viewerEl,
        top: viewerEl?.scrollTop ?? -1,
        h: viewerEl?.clientHeight ?? -1,
        sh: viewerEl?.scrollHeight ?? -1,
        max: viewerEl ? Math.max(0, viewerEl.scrollHeight - viewerEl.clientHeight) : -1,
      },
      motor: {
        has: !!hybridMotor,
        running: hybridRunning,
        movedRecently: hybridMotor.movedRecently(),
      },
    };
    const fingerprintParts = [
      state2.mode,
      sessionPhase,
      hybridWantedRunning ? "1" : "0",
      userEnabled ? "1" : "0",
      speechActive ? "1" : "0",
      gatePref,
      gateWanted ? "1" : "0",
      phaseAllowed ? "1" : "0",
      guardSlowActive ? "1" : "0",
      silencePaused ? "1" : "0",
      hybridRunning ? "1" : "0",
      shouldRunHybrid ? "1" : "0",
      Number.isFinite(effectivePxPerSec) ? effectivePxPerSec.toFixed(1) : "0",
      Number.isFinite(hybridBasePxps) ? hybridBasePxps.toFixed(0) : "0",
    ];
    const gateFingerprint = fingerprintParts.join("|");
    if (gateFingerprint !== lastHybridGateFingerprint) {
      lastHybridGateFingerprint = gateFingerprint;
      try {
        console.warn("[HYBRID] gate", snap);
      } catch {}
    }
    if (shouldRunHybrid) {
      if (silenceTimer) {
        try { clearTimeout(silenceTimer); } catch {}
        silenceTimer = void 0;
      }
      try {
        applyHybridVelocityCore(safeSilence);
      } catch {}
      if (!hybridRunning) {
        try {
          console.info('[HYBRID] shouldRun true starting motor', {
            isRunningBefore: hybridRunning,
            pxPerSec: effectivePxPerSec,
            viewer: viewer ? (viewer.id || viewer.tagName || viewer.className) : null,
            scrollWriter: !!scrollWriter,
          });
        } catch {}
        const startResult = hybridMotor.start();
        if (startResult.started) {
          setActiveMotor('hybrid', 'hybrid');
        }
        if (!startResult.started) {
          try {
            console.debug('[HYBRID] start suppressed', startResult);
          } catch {}
        }
      }
      armHybridSilenceTimer();
    } else if (hybridRunning) {
      if (silenceTimer) {
        try { clearTimeout(silenceTimer); } catch {}
        silenceTimer = void 0;
      }
      hybridMotor.stop();
      clearActiveMotor('hybrid');
      emitMotorState("hybridWpm", false);
      clearHybridSilenceTimer();
    }
    const detail = `Mode: Hybrid \u2022 Pref: ${gatePref} \u2022 User: ${userEnabled ? "On" : "Off"} \u2022 Phase:${phaseAllowed ? "live" : "blocked"} \u2022 Speech:${speechActive ? "1" : "0"} \u2022 dB:${dbGate ? "1" : "0"} \u2022 VAD:${vadGate ? "1" : "0"}`;
    const chipState = userEnabled ? (hybridMotor.isRunning() ? "on" : "paused") : "manual";
    setAutoChip(chipState, detail, "Motor");
    emitMotorState("hybridWpm", hybridMotor.isRunning());
  } catch (err) {
    try {
      console.error('[HYBRID] gate error', err?.message ?? err, err);
    } catch {}
    return;
  }
  }
  onUiPrefs((p) => {
    gatePref = p.hybridGate;
    applyGate();
  });
  try {
      if (typeof appStore.subscribe === "function") {
        appStore.subscribe("session.phase", (phase) => {
          const prevPhase = sessionPhase;
          sessionPhase = String(phase || "idle");
          hybridSessionPhase = sessionPhase;
        if (sessionPhase === "live" && state2.mode === "asr") {
          asrIntentLiveSince = Date.now();
          resetAsrIntentState("session-live");
          try { (window as any).__tpScrollWriteActive = false; } catch {}
        }
        if (sessionPhase !== "live") {
          stopAllMotors("phase change");
          liveSessionWpmLocked = false;
          wpmSliderUserTouched = false;
          userWpmLocked = false;
          asrIntentLiveSince = 0;
          resetAsrIntentState("session-exit");
        } else if (prevPhase !== "live") {
          liveSessionWpmLocked = true;
          syncSliderWpmBeforeLiveStart();
            beginHybridLiveGraceWindow();
          }
          applyGate();
          emitScrollModeSnapshot(`phase:${sessionPhase}`);
        });
      appStore.subscribe("session.scrollAutoOnLive", () => {
        applyGate();
      });
      appStore.subscribe("scrollMode", (modeRaw) => {
        const normalized = normalizeScrollModeValue(modeRaw);
        if (normalized !== 'asr') return;
        stopAllMotors("mode-enter-asr");
        userEnabled = false;
        userIntentOn = false;
        sessionIntentOn = false;
        hybridWantedRunning = false;
        hybridSilence.pausedBySilence = false;
        clearHybridSilenceTimer();
        enabledNow = false;
        asrIntentLiveSince = 0;
        try { auto?.setEnabled?.(false); } catch {}
        persistStoredAutoEnabled(false);
        try { emitMotorState("auto", false); } catch {}
        try { emitMotorState("hybridWpm", false); } catch {}
        try { emitAutoState(); } catch {}
      });
    }
  } catch {}
  function syncSliderWpmBeforeLiveStart() {
    if (typeof document === "undefined") {
      liveSessionWpmLocked = false;
      return;
    }
    if (getScrollMode() === "asr") {
      liveSessionWpmLocked = false;
      return;
    }
    if (userWpmLocked) {
      liveSessionWpmLocked = false;
      return;
    }
    let nextWpm = Number.NaN;
    const store = (typeof window !== "undefined" ? (window as any).__tpStore : null) || appStore;
    try {
      const sliderInput = document.getElementById("wpmTarget") as HTMLInputElement | null;
      if (sliderInput) {
        const sliderVal = Number(sliderInput.value);
        if (Number.isFinite(sliderVal) && sliderVal > 0) {
          nextWpm = sliderVal;
        }
      }
      if (!Number.isFinite(nextWpm) || nextWpm <= 0) {
        const stored = typeof store?.get === "function" ? store.get("wpmTarget") : undefined;
        if (typeof stored === "number" && stored > 0) {
          nextWpm = stored;
        }
      }
      if (!Number.isFinite(nextWpm) || nextWpm <= 0) {
        nextWpm = 180;
      }
      if (sliderInput) {
        setSliderValueSilently(sliderInput, String(nextWpm));
      }
      if (typeof store?.set === "function") {
        try {
          store.set("wpmTarget", nextWpm);
        } catch {}
      }
      const pxs = convertWpmToPxPerSec(nextWpm);
      if (Number.isFinite(pxs) && pxs > 0) {
        applyWpmBaselinePx(pxs, "session-start");
      }
    } catch {
      // ignore
    } finally {
      liveSessionWpmLocked = false;
    }
  }
   type WpmIntentSource = 'sidebar' | 'restore' | 'script-load' | 'hotkey';
   const WPM_INTENT_EVENT = 'tp:wpm:intent';

  function applyWpmBaselinePx(pxs: number, source: string, wpmValue?: number) {
    if (!Number.isFinite(pxs) || pxs <= 0) return;
    if (getScrollMode() === "asr") return;
    const storeWpm = (() => {
      try {
        const raw = localStorage.getItem('tp_baseline_wpm');
        const num = raw ? Number(raw) : NaN;
        return Number.isFinite(num) ? num : NaN;
      } catch {
        return NaN;
      }
    })();
    const sliderValue = (() => {
      try {
        const slider = document.getElementById("wpmTarget") as HTMLInputElement | null;
        if (!slider) return NaN;
        const num = Number(slider.value);
        return Number.isFinite(num) ? num : NaN;
      } catch {
        return NaN;
      }
    })();
    try {
      console.info('[HYBRID] baseline writer', {
        pxPerSec: pxs,
        source,
        storeWpm,
        sliderValue,
        hybridBase: hybridBasePxps,
        hybridScale,
      });
    } catch {}
    sliderTouchedThisSession = true;
    recordUserWpmPx(pxs);
    setHybridScale(RECOVERY_SCALE);
    setHybridBasePxps(pxs);
    startHybridMotorFromSpeedChange();
    logHybridBaselineState(source);
    if (isDevMode()) {
      try {
        console.info('[HYBRID_BASE] set', {
          pxPerSec: pxs,
          wpm: Number.isFinite(wpmValue ?? NaN) ? wpmValue : undefined,
          source,
          hybridBase: hybridBasePxps,
          scale: hybridScale,
        });
      } catch {}
    }
    if (state2.mode === "wpm") {
      try { auto.setSpeed?.(pxs); } catch {}
    }
  }

  function emitWpmIntent(wpm: number, source: WpmIntentSource, pxPerSec: number) {
    if (!Number.isFinite(wpm) || wpm <= 0) return;
    if (!Number.isFinite(pxPerSec) || pxPerSec <= 0) return;
    if (typeof window === "undefined") return;
    if (lastWpmIntent && lastWpmIntent.wpm === wpm && lastWpmIntent.source === source) return;
    noteWpmIntent(wpm, source);
    const detail = { wpm, source };
    try {
      window.dispatchEvent(new CustomEvent(WPM_INTENT_EVENT, { detail }));
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent('tp:wpm:change', {
        detail: { wpm, source, pxPerSec },
      }));
    } catch {}
  }

  function handleSidebarWpmChange(val: number, label: 'slider-change' | 'slider-input') {
    if (suppressWpmUiEcho) return;
    if (!Number.isFinite(val) || val <= 0) return;
    try {
      localStorage.setItem('tp_baseline_wpm', String(val));
    } catch {}
    userWpmLocked = true;
    const pxs = convertWpmToPxPerSec(val);
    if (!Number.isFinite(pxs) || pxs <= 0) return;
    markSliderInteraction();
    emitWpmIntent(val, 'sidebar', pxs);
    applyWpmBaselinePx(pxs, label, val);
    persistProfilePatch({
      scroll: {
        mode: 'wpm',
        wpm: { value: val },
      },
    });
    if (state2.mode === 'wpm') {
      try {
        if (orchRunning) {
          const status = orch.getStatus();
          const detectedWpm = status.wpm;
          if (detectedWpm && isFinite(detectedWpm) && detectedWpm > 0) {
            const sensitivity = val / detectedWpm;
            orch.setSensitivity(sensitivity);
          } else {
            orch.setSensitivity(1.0);
          }
        }
      } catch {
      }
    }
  }

  function resolveWpmDetail(detail: Record<string, unknown>) {
    const pxRaw = Number(detail.pxPerSec);
    const incomingWpmRaw = Number(detail.wpm);
    const incomingWpm = Number.isFinite(incomingWpmRaw) ? incomingWpmRaw : undefined;
    if (Number.isFinite(pxRaw) && pxRaw > 0) {
      const source =
        typeof detail.source === "string" && detail.source.length > 0
          ? detail.source
          : "tp:wpm:change";
      return { pxPerSec: pxRaw, source, wpm: incomingWpm };
    }
    const wpm = Number(detail.wpm);
    if (Number.isFinite(wpm) && wpm > 0) {
      const pxFromWpm = convertWpmToPxPerSec(wpm);
      if (Number.isFinite(pxFromWpm) && pxFromWpm > 0) {
        const source =
          typeof detail.source === "string" && detail.source.length > 0
            ? detail.source
            : "tp:wpm:intent";
        return { pxPerSec: pxFromWpm, source, wpm };
      }
    }
    return null;
  }

  try {
    const handleWpmEvent = (detail: Record<string, unknown>, eventName: string) => {
      const resolved = resolveWpmDetail(detail);
      if (!resolved) return;
      const { pxPerSec, source, wpm } = resolved;
      if (eventName !== WPM_INTENT_EVENT && userWpmLocked) {
        try {
          console.warn('[WPM_LEGACY] ignored (userWpmLocked=1)', { eventName, source });
        } catch {}
        return;
      }
      if (eventName === "tp:wpm:change" && source === "sidebar") return;
      if (source === "store" && userWpmLocked) return;
      const sourceIsSlider = isSliderWpmSource(source);
      if (liveSessionWpmLocked && !sourceIsSlider) {
        return;
      }
      if (hybridMotor.isRunning() && !sourceIsSlider && wpmSliderUserTouched) {
        return;
      }
      const now = nowMs();
      const withinUserEvent = lastUserWpmPx > 0 && now - lastUserWpmAt <= WPM_USER_DEDUPE_MS;
      if (withinUserEvent && Math.abs(lastUserWpmPx - pxPerSec) < 0.5) {
        return;
      }
      applyWpmBaselinePx(pxPerSec, source, wpm);
    };

    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t?.id === "wpmTarget") {
        try {
          handleSidebarWpmChange(Number(t.value), 'slider-change');
        } catch {}
        flushProfilePersister();
      }
    }, { capture: true });

    document.addEventListener("input", (e) => {
      const t = e.target;
      if (t?.id === "wpmTarget") {
        try {
          handleSidebarWpmChange(Number(t.value), 'slider-input');
        } catch {}
      }
    }, { capture: true });

    window.addEventListener("tp:wpm:change", (ev) => {
      try {
        handleWpmEvent((ev as CustomEvent).detail || {}, "tp:wpm:change");
      } catch {}
    });

    window.addEventListener("tp:wpm:intent", (ev) => {
      try {
        const detail = (ev as CustomEvent)?.detail || {};
        const wpmValue = Number(detail.wpm);
        const source = typeof detail.source === "string" ? detail.source : "unknown";
        if (Number.isFinite(wpmValue) && wpmValue > 0) {
          noteWpmIntent(wpmValue, source);
        }
        try {
          console.info('[WPM_INTENT] recv', { wpm: wpmValue, source });
        } catch {}
        handleWpmEvent(detail, "tp:wpm:intent");
      } catch {}
    });
    document.addEventListener("pointerup", (ev) => {
      try {
        const target = ev.target as Element | null;
        if (target?.id !== "wpmTarget") return;
        flushProfilePersister();
      } catch {}
    }, { capture: true });
  } catch {
  }
  try {
    window.addEventListener("tp:asr:silence", (ev) => {
      try {
        const detail = (ev as CustomEvent).detail || {};
        const silent = !!detail.silent;
        const perfNow = nowMs();
        const rawTs = typeof detail.ts === "number" ? detail.ts : perfNow;
        const normalizedTs = normalizePerfTimestamp(rawTs, perfNow);
    if (silent) {
      hybridSilence.lastSpeechAtMs = normalizedTs;
      hybridSilence.pausedBySilence = true;
      speechActive = false;
      clearHybridSilenceTimer();
      runHybridVelocity(hybridSilence);
      armHybridSilenceTimer();
    } else {
      noteHybridSpeechActivity(normalizedTs, { source: "silence" });
    }
      } catch {}
    });
  } catch {
  }
  try {
    window.addEventListener("tp:preroll:done", () => {
      try {
        if (state2.mode !== "hybrid") return;
        if (!hybridWantedRunning) return;
        if (sessionPhase !== "live") return;
        seedHybridBaseSpeed();
        const now = nowMs();
        liveGraceWindowEndsAt = null;
        hybridSilence.lastSpeechAtMs = now;
        hybridSilence.pausedBySilence = false;
        setHybridScale(RECOVERY_SCALE);
        runHybridVelocity(hybridSilence);
        if (!hybridMotor.isRunning()) {
          hybridMotor.start();
          emitMotorState("hybridWpm", true);
        }
        armHybridSilenceTimer(computeHybridSilenceDelayMs());
        emitHybridSafety();
        applyGate();
        if (isDevMode()) {
          try {
            console.info('[HYBRID] preroll done baseline kick', {
              hybridBasePxps,
              scale: hybridScale,
            });
          } catch {}
        }
      } catch {}
    });
  } catch {}
  try {
    document.addEventListener("keydown", (e) => {
      // In Rehearsal Mode, block router key behaviors (wheel-only)
      try { if (window.__TP_REHEARSAL) return; } catch {}
      // Always support PageUp/PageDown stepping one line for usability and CI probe,
      // even when not in explicit step mode.
      if (e.key === "PageDown") {
        e.preventDefault();
        stepOnce(1);
        return;
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        stepOnce(-1);
        return;
      }
      // The press-and-hold creep behavior remains exclusive to step mode (Space bar)
      if (state2.mode === "step" && e.key === " ") {
        e.preventDefault();
        holdCreepStart(DEFAULTS.step.holdCreep, 1);
      }
    }, { capture: true });
    document.addEventListener("keyup", (e) => {
      try { if (window.__TP_REHEARSAL) return; } catch {}
      if (state2.mode !== "step") return;
      if (e.key === " ") {
        e.preventDefault();
        holdCreepStop();
      }
    }, { capture: true });
  } catch {
  }
  try {
    window.addEventListener("tp:db", (e) => {
      const db = e && e.detail && typeof e.detail.db === "number" ? e.detail.db : -60;
      hybridHandleDb(db, auto);
      dbGate = db >= DEFAULTS.hybrid.thresholdDb;
      scheduleApplyGate();
    });
    window.addEventListener("tp:vad", (e) => {
      const speaking = !!(e && e.detail && e.detail.speaking);
      vadGate = speaking;
      if (speaking) {
        noteHybridSpeechActivity(nowMs(), { source: "vad" });
      }
      scheduleApplyGate();
    });
  } catch {
  }
  // Allow external intent control (e.g., speech start/stop) to flip user intent deterministically
  try {
    window.addEventListener("tp:autoIntent", (e) => {
      try {
        const detail = (e as CustomEvent)?.detail || {};
        const on = !!(detail.on ?? detail.enabled);
        setAutoIntentState(on);
      } catch {}
    });
    try { console.info('[scroll-router] tp:autoIntent listener installed'); } catch {}
    const pending = (window as any).__tpAutoIntentPending;
    if (typeof pending === "boolean") {
      setAutoIntentState(pending);
      try {
        delete (window as any).__tpAutoIntentPending;
      } catch {}
    }
  } catch {}
  try {
      window.addEventListener("tp:session:intent", (e) => {
      try {
        const detail = (e as CustomEvent)?.detail || {};
        const active = detail.active === true;
        try {
          console.info(
            `[scroll-router] tp:session:intent active=${active} mode=${detail.mode || state2.mode} reason=${detail.reason || 'unknown'}`,
          );
        } catch {}
        setAutoIntentState(active);
      } catch {}
    });
    try { console.info('[scroll-router] tp:session:intent listener installed'); } catch {}
  } catch {}
  if (state2.mode === "hybrid" || state2.mode === "wpm") {
    userEnabled = true;
    hybridWantedRunning = true;
    try {
      if (state2.mode === "wpm") {
        const baselineWpm = parseFloat(localStorage.getItem("tp_baseline_wpm") || "120") || 120;
        const pxs = convertWpmToPxPerSec(baselineWpm);
        auto.setSpeed?.(pxs);
      } else {
        auto.setSpeed?.(getStoredSpeed());
      }
      seedHybridBaseSpeed();
      ensureOrchestratorForMode();
    } catch {}
    applyGate();
  } else {
    applyGate();
  }
  if (state2.mode === "wpm" || state2.mode === "asr") ensureOrchestratorForMode();
  try {
    document.addEventListener("keydown", (e) => {
      try {
        const target = e.target;
        if (!target) return;
        const tag = (target.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || target.isContentEditable) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const wantUp = e.key === "+" || e.code === "NumpadAdd" || e.key === "ArrowUp";
        const wantDown = e.key === "-" || e.code === "NumpadSubtract" || e.key === "ArrowDown";
        if (!wantUp && !wantDown) return;
        e.preventDefault();
        const step = wantUp ? AUTO_STEP_FINE : -AUTO_STEP_FINE;
        const delta = e.shiftKey ? step * AUTO_STEP_COARSE : step;
        const next = nudgeSpeed(delta);
        try { window.__scrollCtl?.setSpeed?.(next); } catch {}
        // Best-effort viewport nudge so hotkeys have visible effect even when auto is Off/paused
        try {
          const deltaPx = wantUp ? -24 : 24;
          scrollWriter.scrollBy(deltaPx, { behavior: "auto" });
        } catch {}
      } catch {
      }
    }, { capture: true });
  } catch {
  }
}

export {
    installScrollRouter,
    createAutoMotor,
};
