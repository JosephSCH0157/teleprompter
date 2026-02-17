import {
  clearSessionLearnedPatches,
  getSessionLearnedPatches,
} from '../asr/asr-threshold-store';
import { DEFAULT_ASR_THRESHOLDS, clamp01 } from '../asr/asr-thresholds';
import { bootTrace } from '../boot/boot-trace';
import { shouldLogLevel, shouldLogTag } from '../env/dev-log';
import {
  createAsrScrollDriver,
  type AsrScrollDriver,
  type AsrScrollDriverStats,
} from '../features/asr/asr-scroll-driver';
import { getAsrBlockElements, getAsrBlockIndex } from '../scroll/asr-block-store';
import {
  describeElement,
  getPrimaryScroller,
  getRuntimeScroller,
  getScriptRoot,
  getScrollerEl,
  isWindowScroller,
  resolveActiveScroller,
} from '../scroll/scroller';
import { ensureSpeechGlobals, isSpeechBackendAllowed } from '../speech/backend-guard';
import { normTokens } from '../speech/matcher';
import { stopAsrRuntime } from '../speech/runtime-control';
import type { AppStore } from '../state/app-store';
import { getSession, setSessionPhase } from '../state/session';
import type { SpeakerSlot } from '../types/speaker-profiles';
import { maybePromptSaveSpeakerProfiles } from '../ui/save-speaker-profiles-prompt';
import {
  applyProfileToSlot,
  createProfile,
  getActiveSpeakerSlot,
  getProfile,
  getSpeakerBindings,
  setProfileAsrTweaks,
} from '../ui/speaker-profiles-store';
import { completePrerollSession } from './preroll-session';

ensureSpeechGlobals();

type AnyFn = (...args: any[]) => any;

type RecognizerLike = {
  start?: AnyFn;
  stop?: AnyFn;
  abort?: AnyFn;
  on?: AnyFn;
  onstart?: ((ev: Event) => void) | null;
  onaudiostart?: ((ev: Event) => void) | null;
  onaudioend?: ((ev: Event) => void) | null;
  onspeechstart?: ((ev: Event) => void) | null;
  onspeechend?: ((ev: Event) => void) | null;
  onend?: ((ev: Event) => void) | null;
  onerror?: ((ev: Event) => void) | null;
  onresult?: AnyFn;
};

type SpeechRecognition = {
  start: AnyFn;
  stop: AnyFn;
  abort?: AnyFn;
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
  onstart?: ((ev: Event) => void) | null;
  onaudiostart?: ((ev: Event) => void) | null;
  onaudioend?: ((ev: Event) => void) | null;
  onspeechstart?: ((ev: Event) => void) | null;
  onspeechend?: ((ev: Event) => void) | null;
  onend?: ((ev: Event) => void) | null;
  onerror?: ((ev: Event) => void) | null;
  onresult?: AnyFn;
};

type TranscriptPayload = {
  text: string;
  final: boolean;
  timestamp: number;
  source: string;
  mode: string;
  isFinal: boolean;
  matchId?: string | null;
  match?: unknown;
  meta?: boolean;
  line?: number;
  candidates?: unknown;
  sim?: number;
  noMatch?: boolean;
  currentIdx?: number | null;
};

type HudSnapshotPayload = {
  reason: string;
  ts: number;
  scrollMode: string;
  sessionPhase: string;
  speechRunning: boolean;
  speechRunningActual: boolean;
  asrDesired: boolean;
  asrArmed: boolean;
  driver: boolean;
  driverId: string | null;
  lastLineIndex: number | null;
  lastOnResultTs: number | null;
  lastIngestTs: number | null;
  lastCommitTs: number | null;
};

type AsrHeartbeatPayload = {
  reason: string;
  ts: number;
  scrollMode: string;
  sessionPhase: string;
  asrArmed: boolean;
  speechRunning: boolean;
  speechRunningActual: boolean;
  recognizerAttached: boolean;
  lastOnResultTs: number | null;
  lastIngestTs: number | null;
  lastCommitTs: number | null;
  sinceOnResultMs: number | null;
  sinceIngestMs: number | null;
  sinceCommitMs: number | null;
  commitCount: number;
  lifecycleEvent: string;
  lifecycleEventTs: number | null;
};

declare global {
  interface Window {
    __tpBus?: { emit?: AnyFn };
    HUD?: { bus?: { emit?: AnyFn }; log?: AnyFn };
    __tpHud?: { log?: AnyFn };
    __tpStore?: AppStore;
    __tpScrollMode?: { getMode?: () => string };
    __tpMic?: {
      isOpen?: () => boolean;
      requestMic?: () => Promise<MediaStream>;
      releaseMic?: () => void;
    } & Record<string, unknown>;
    __tpRecording?: {
      start?: () => unknown;
      stop?: () => unknown;
      getAdapter?: () => unknown;
      wantsAuto?: () => unknown;
      setAuto?: (on: boolean) => unknown;
      setWantsAuto?: (on: boolean) => unknown;
    };
    __tpObs?: { armed?: () => boolean; ensureRecording?: (on: boolean) => Promise<unknown> | unknown };
    __tpAutoRecord?: { start?: () => Promise<unknown> | unknown; stop?: () => Promise<unknown> | unknown };
    __tpSpeechOrchestrator?: { start?: () => Promise<RecognizerLike | void> | RecognizerLike | void };
    __tpSpeechCanDynImport?: boolean;
    __tpAsrRunKey?: string | null;
    __tpAsrLastEndedRunKey?: string | null;
    __tpAsrLastEndedRunAt?: number | null;
    __tpSpeech?: {
      store?: {
        getState?: () => unknown;
        get?: () => unknown;
        subscribe?: ((listener: (...args: any[]) => void) => (() => void) | void) | undefined;
      } | null;
      startRecognizer?: (cb: AnyFn, opts?: { lang?: string }) => void;
      stopRecognizer?: () => void;
      matchOne?: AnyFn;
      matchBatch?: AnyFn;
    };
    __tpEmitSpeech?: (t: unknown, final?: boolean) => void;
    __tpSendToDisplay?: (payload: unknown) => void;
    __tpGetActiveRecognizer?: () => RecognizerLike | null;
    __tpHardResetSpeech?: (reason?: string) => void;
    SpeechRecognition?: { new (): SpeechRecognition };
    webkitSpeechRecognition?: { new (): SpeechRecognition };
    getAutoRecordEnabled?: () => boolean;
    recAutoRestart?: unknown;
    speechOn?: boolean;
    enumerateDevices?: () => Promise<MediaDeviceInfo[]>;
    __tpAsrHeartbeatLast?: AsrHeartbeatPayload;
    __tpAsrLifecycleLast?: Record<string, unknown>;
  }
}

async function _enumerateDevices(): Promise<MediaDeviceInfo[]> {
  try {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
    return await navigator.mediaDevices.enumerateDevices();
  } catch {
    return [];
  }
}

function _hasKind(devs: MediaDeviceInfo[], kind: MediaDeviceKind): boolean {
  return devs.some((d) => d.kind === kind);
}

function _showToast(msg: string) {
  try { (window as any).toasts?.show?.(msg); } catch {}
}

// One entry point for speech. Uses Web Speech by default.
// If /dist/speech/orchestrator.real.js exists (built from TS), we load it instead.
// Autoscroll is managed externally; buffered stop handled in index listener

let running = false;
let rec: RecognizerLike | null = null; // SR instance or orchestrator handle
let lastScrollMode = '';
let lastResultTs = 0;
let speechRunningActual = false;
let lastRecognizerOnResultTs = 0;
let lastAsrIngestTs = 0;
let lastAsrCommitTs = 0;
let lastAsrCommitCount = 0;
let lastRecognizerLifecycleEvent = '';
let lastRecognizerLifecycleAt = 0;
let speechWatchdogTimer: number | null = null;
let asrHeartbeatTimer: number | null = null;
let activeRecognizer: RecognizerLike | null = null;
let pendingManualRestartCount = 0;
let lifecycleRestartTimer: number | null = null;
let lastLifecycleRestartAt = 0;
let suppressRecognizerAutoRestart = false;
let lastHudSnapshotFingerprint = '';
let lastHudSnapshotAt = 0;

const WATCHDOG_INTERVAL_MS = 5000;
const WATCHDOG_THRESHOLD_MS = 15000;
const ASR_WATCHDOG_THRESHOLD_MS = 4000;
const ASR_HEARTBEAT_INTERVAL_MS = 1000;
const LIFECYCLE_RESTART_DELAY_MS = 120;
const LIFECYCLE_RESTART_COOLDOWN_MS = 350;
const HUD_SNAPSHOT_THROTTLE_MS = 120;

function inRehearsal(): boolean {
  try { return !!document.body?.classList?.contains('mode-rehearsal'); } catch { return false; }
}

// Scroll/mic state helpers for gating transcript capture
function getScrollMode(): string {
  try {
    const store = window.__tpStore;
    if (store && typeof store.get === 'function') {
      const scrollMode = store.get('scrollMode');
      if (scrollMode != null) return String(scrollMode).toLowerCase();
      const legacyMode = store.get('mode');
      if (legacyMode != null) return String(legacyMode).toLowerCase();
    }

    const router: any = window.__tpScrollMode;
    if (router && typeof router.getMode === 'function') {
      const mode = router.getMode();
      if (mode != null) return String(mode).toLowerCase();
    }

  if (typeof router === 'string') return router.toLowerCase();
  } catch {}
  return '';
}

function getSpeechStoreState(store: any): any {
  if (!store) return undefined;

  // Redux-ish / Zustand vanilla
  if (typeof store.getState === 'function') return store.getState();

  // Atom-ish local store
  if (typeof store.get === 'function') return store.get();

  return undefined;
}

function subscribeSpeechStore(store: any, fn: (s: any) => void): () => void {
  if (!store) return () => {};

  // Redux-ish
  if (typeof store.subscribe === 'function' && typeof store.getState === 'function') {
    const unsub = store.subscribe(() => fn(store.getState()));
    return typeof unsub === 'function' ? unsub : () => {};
  }

  // Atom-ish with get()
  if (typeof store.subscribe === 'function' && typeof store.get === 'function') {
    const unsub = store.subscribe(() => fn(store.get()));
    return typeof unsub === 'function' ? unsub : () => {};
  }

  // Atom-ish subscribe passes value directly
  if (typeof store.subscribe === 'function') {
    const unsub = store.subscribe((v: any) => fn(v));
    return typeof unsub === 'function' ? unsub : () => {};
  }

  return () => {};
}

let speechStoreShimmed = false;
let speechStoreSubscribed = false;
let latestSpeechStoreState: any = undefined;

function getTpSpeechNamespace(): any {
  if (typeof window === 'undefined') return null;
  const ns = (window as any).__tpSpeech;
  if (!ns || typeof ns !== 'object') return null;
  const store = ns.store;
  if (store && !speechStoreShimmed && typeof store.getState !== 'function' && typeof store.get === 'function') {
    try {
      store.getState = store.get.bind(store);
    } catch {
      try { store.getState = () => store.get(); } catch {}
    }
    speechStoreShimmed = true;
  }
  if (store && !speechStoreSubscribed) {
    speechStoreSubscribed = true;
    try { latestSpeechStoreState = getSpeechStoreState(store); } catch {}
    try {
      subscribeSpeechStore(store, (state) => {
        latestSpeechStoreState = state;
      });
    } catch {}
  }
  return ns;
}

function getTpSpeechStoreSnapshot(): any {
  try {
    const ns = getTpSpeechNamespace();
    return getSpeechStoreState(ns?.store) ?? latestSpeechStoreState;
  } catch {
    return latestSpeechStoreState;
  }
}

function resolveAsrDriverRef(): any {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return asrScrollDriver || w.__tpAsrScrollDriver || w.__tpAsrDriver || null;
}

function normalizeTimestamp(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(0, Math.floor(raw));
}

function readAsrDriverStats(driverRef: any): AsrScrollDriverStats | null {
  if (!driverRef || typeof driverRef !== 'object') return null;
  try {
    const stats = driverRef.getStats?.();
    if (stats && typeof stats === 'object') {
      const snapshot = stats as AsrScrollDriverStats;
      return {
        lastIngestAt: normalizeTimestamp(snapshot.lastIngestAt),
        lastCommitAt: normalizeTimestamp(snapshot.lastCommitAt),
        commitCount: Math.max(0, Math.floor(Number(snapshot.commitCount) || 0)),
        eventsSinceCommit: Math.max(0, Math.floor(Number(snapshot.eventsSinceCommit) || 0)),
        finalsSinceCommit: Math.max(0, Math.floor(Number(snapshot.finalsSinceCommit) || 0)),
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function syncAsrDriverStats(driverRef?: any): void {
  const stats = readAsrDriverStats(driverRef ?? resolveAsrDriverRef());
  if (!stats) return;
  lastAsrIngestTs = Math.max(lastAsrIngestTs, stats.lastIngestAt);
  lastAsrCommitTs = Math.max(lastAsrCommitTs, stats.lastCommitAt);
  lastAsrCommitCount = Math.max(lastAsrCommitCount, stats.commitCount);
}

function toMaybeTimestamp(ts: number): number | null {
  return ts > 0 ? ts : null;
}

function elapsedSince(ts: number, now: number): number | null {
  if (ts <= 0) return null;
  return Math.max(0, now - ts);
}

function buildHudSnapshot(reason: string): HudSnapshotPayload {
  const session = getSession();
  const driverRef = resolveAsrDriverRef();
  const mode = String(getScrollMode() || '').toLowerCase() || 'unknown';
  syncAsrDriverStats(driverRef);
  let lastLineIndex: number | null = null;
  let driverId: string | null = null;
  try {
    const raw = Number(driverRef?.getLastLineIndex?.());
    if (Number.isFinite(raw)) lastLineIndex = Math.max(0, Math.floor(raw));
  } catch {
    lastLineIndex = null;
  }
  try {
    const rawId = (driverRef as any)?.__instanceId ?? (driverRef as any)?._instanceId;
    if (rawId != null && String(rawId).trim()) driverId = String(rawId).trim();
  } catch {
    driverId = null;
  }
  return {
    reason: String(reason || 'state'),
    ts: Date.now(),
    scrollMode: mode,
    sessionPhase: String(session.phase || 'idle').toLowerCase() || 'idle',
    speechRunning: !!running,
    speechRunningActual: !!speechRunningActual,
    asrDesired: !!session.asrDesired,
    asrArmed: !!session.asrArmed,
    driver: !!driverRef,
    driverId,
    lastLineIndex,
    lastOnResultTs: toMaybeTimestamp(lastRecognizerOnResultTs || lastResultTs),
    lastIngestTs: toMaybeTimestamp(lastAsrIngestTs),
    lastCommitTs: toMaybeTimestamp(lastAsrCommitTs),
  };
}

function emitHudSnapshot(reason: string, opts?: { force?: boolean }): void {
  if (typeof window === 'undefined') return;
  const payload = buildHudSnapshot(reason);
  const fingerprint = [
    payload.scrollMode,
    payload.sessionPhase,
    payload.speechRunning ? 1 : 0,
    payload.speechRunningActual ? 1 : 0,
    payload.asrDesired ? 1 : 0,
    payload.asrArmed ? 1 : 0,
    payload.driver ? 1 : 0,
    payload.driverId || '',
    payload.lastLineIndex ?? -1,
    payload.lastOnResultTs ?? -1,
    payload.lastIngestTs ?? -1,
    payload.lastCommitTs ?? -1,
  ].join('|');
  const now = Date.now();
  if (!opts?.force) {
    if (fingerprint === lastHudSnapshotFingerprint && now - lastHudSnapshotAt < HUD_SNAPSHOT_THROTTLE_MS) {
      return;
    }
  }
  lastHudSnapshotFingerprint = fingerprint;
  lastHudSnapshotAt = now;
  try { (window as any).__tpHudSnapshotLast = payload; } catch {}
  try { window.__tpBus?.emit?.('tp:hud:snapshot', payload); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:hud:snapshot', { detail: payload })); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:hud:snapshot', { detail: payload })); } catch {}
}

function shouldEmitAsrHeartbeatPayload(): boolean {
  const mode = String(lastScrollMode || getScrollMode() || '').toLowerCase();
  if (mode !== 'asr') return false;
  const session = getSession();
  return !!session.asrArmed;
}

function buildAsrHeartbeat(reason: string): AsrHeartbeatPayload {
  const now = Date.now();
  const mode = String(lastScrollMode || getScrollMode() || '').toLowerCase() || 'unknown';
  const session = getSession();
  const driverRef = resolveAsrDriverRef();
  syncAsrDriverStats(driverRef);
  const lastOnResult = Math.max(lastRecognizerOnResultTs, lastResultTs);
  return {
    reason: String(reason || 'tick'),
    ts: now,
    scrollMode: mode,
    sessionPhase: String(session.phase || 'idle').toLowerCase() || 'idle',
    asrArmed: !!session.asrArmed,
    speechRunning: !!running,
    speechRunningActual: !!speechRunningActual,
    recognizerAttached: !!activeRecognizer,
    lastOnResultTs: toMaybeTimestamp(lastOnResult),
    lastIngestTs: toMaybeTimestamp(lastAsrIngestTs),
    lastCommitTs: toMaybeTimestamp(lastAsrCommitTs),
    sinceOnResultMs: elapsedSince(lastOnResult, now),
    sinceIngestMs: elapsedSince(lastAsrIngestTs, now),
    sinceCommitMs: elapsedSince(lastAsrCommitTs, now),
    commitCount: Math.max(0, Math.floor(lastAsrCommitCount || 0)),
    lifecycleEvent: lastRecognizerLifecycleEvent || '',
    lifecycleEventTs: toMaybeTimestamp(lastRecognizerLifecycleAt),
  };
}

function emitAsrHeartbeat(reason: string, opts?: { force?: boolean }): void {
  if (typeof window === 'undefined') return;
  if (!opts?.force && !shouldEmitAsrHeartbeatPayload()) return;
  const payload = buildAsrHeartbeat(reason);
  try { window.__tpAsrHeartbeatLast = payload; } catch {}
  try { window.__tpBus?.emit?.('tp:asr:heartbeat', payload); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:asr:heartbeat', { detail: payload })); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:asr:heartbeat', { detail: payload })); } catch {}
  if (isDevMode() && shouldLogTag('ASR_HEARTBEAT', 2, ASR_HEARTBEAT_INTERVAL_MS)) {
    try { console.info('[ASR_HEARTBEAT]', payload); } catch {}
  }
}

function _stopAsrHeartbeat(): void {
  if (asrHeartbeatTimer != null) {
    window.clearInterval(asrHeartbeatTimer);
    asrHeartbeatTimer = null;
  }
}

function startAsrHeartbeat(): void {
  if (asrHeartbeatTimer != null) return;
  asrHeartbeatTimer = window.setInterval(() => {
    emitAsrHeartbeat('tick');
  }, ASR_HEARTBEAT_INTERVAL_MS);
}

function dispatchSessionIntent(active: boolean, detail?: { source?: string; reason?: string; mode?: string; phase?: string }): void {
  try {
    const payload: Record<string, unknown> = {
      active,
      source: detail?.source,
      reason: detail?.reason,
      mode: detail?.mode ?? getScrollMode(),
      phase: detail?.phase,
      intentSource: 'session-intent',
    };
    window.dispatchEvent(new CustomEvent('tp:session:intent', { detail: payload }));
  } catch {
    // ignore
  }
}

function armAsrForSessionStart(mode: string, source: string): void {
  const normalizedMode = String(mode || '').toLowerCase();
  if (normalizedMode !== 'asr') return;
  const store = window.__tpStore;
  if (!store || typeof store.set !== 'function') return;
  try { store.set('session.asrDesired' as any, true as any); } catch {}
  try { store.set('session.asrArmed' as any, true as any); } catch {}
  try { store.set('session.asrReady' as any, true as any); } catch {}
  // Arm must immediately trigger an attach attempt in the same tick so we do
  // not depend on a later mode-change event to wire ASR transcript handling.
  try { ensureAsrDriverLifecycleHooks(); } catch {}
  try {
    const reason = `arm:${source || 'unknown'}`;
    attachAsrScrollDriver({ reason, mode: normalizedMode, allowCreate: true });
    syncAsrDriverFromBlocks(reason, { mode: normalizedMode, allowCreate: true });
    bootTrace('speech-loader:arm:attach-attempt', {
      source,
      mode: normalizedMode,
      reason,
    });
  } catch {}
  try {
    console.info('[ASR] armed for session start', { source, mode: normalizedMode });
  } catch {}
  emitHudSnapshot('asr-arm', { force: true });
}

function rememberMode(mode: string): void {
  if (typeof mode === 'string') {
    lastScrollMode = mode;
  }
}
function micActive(): boolean {
  try { return !!window.__tpMic?.isOpen?.(); } catch {}
  try { return !!window.__tpStore?.get?.('micEnabled'); } catch {}
  return false;
}
function shouldEmitTranscript(): boolean {
  if (inRehearsal()) return false;
  const mode = getScrollMode();
  rememberMode(mode);
  if (mode !== 'asr' && mode !== 'hybrid') return false;
  if (!running) return false;
  const micOpen = micActive();
  if (!micOpen) {
    try { window.__tpHud?.log?.('[speech-loader]', 'mic inactive (soft gate)'); } catch {}
  }
  return true;
}

function isAutoRestartEnabled(): boolean {
  try {
    const flag = window.recAutoRestart;
    if (flag === undefined || flag === null) return true;
    if (typeof flag === 'string') {
      const normalized = flag.trim().toLowerCase();
      if (normalized === 'false' || normalized === '0') return false;
      if (normalized === 'true' || normalized === '1') return true;
    }
    return !!flag;
  } catch {}
  return true;
}

function emitTranscriptEvent(payload: TranscriptPayload): void {
  try { window.__tpBus?.emit?.('tp:speech:transcript', payload); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:speech:transcript', { detail: payload })); } catch {}
}

function markResultTimestamp(): void {
  lastResultTs = Date.now();
}

function setSpeechRunningActual(next: boolean, reason: string): void {
  const normalized = !!next;
  if (speechRunningActual === normalized) return;
  speechRunningActual = normalized;
  emitHudSnapshot(`speech-running-actual:${reason}`, { force: true });
}

function clearLifecycleRestartTimer(): void {
  if (lifecycleRestartTimer != null) {
    try { window.clearTimeout(lifecycleRestartTimer); } catch {}
    lifecycleRestartTimer = null;
  }
}

function markWebSpeechLifecycle(
  eventName: string,
  event: Event,
  detail?: Record<string, unknown>,
): void {
  const now = Date.now();
  lastRecognizerLifecycleEvent = eventName;
  lastRecognizerLifecycleAt = now;
  if (eventName === 'onresult') {
    lastRecognizerOnResultTs = now;
    markResultTimestamp();
  }
  const session = getSession();
  const payload: Record<string, unknown> = {
    event: eventName,
    ts: now,
    mode: String(lastScrollMode || getScrollMode() || '').toLowerCase(),
    phase: String(session.phase || 'idle').toLowerCase(),
    asrArmed: !!session.asrArmed,
    speechRunning: !!running,
    speechRunningActual: !!speechRunningActual,
    recognizerAttached: !!activeRecognizer,
    ...detail,
  };
  try { window.__tpAsrLifecycleLast = payload; } catch {}
  try { window.__tpBus?.emit?.('tp:asr:lifecycle', payload); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:asr:lifecycle', { detail: payload })); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:asr:lifecycle', { detail: payload })); } catch {}
  if (isDevMode()) {
    try { console.info('[ASR_LIFECYCLE]', payload); } catch {}
  }
  if (eventName !== 'onresult') {
    emitAsrHeartbeat(`lifecycle:${eventName}`, { force: true });
  }
}

function isRestartableWebSpeechError(event: Event): boolean {
  const code = String((event as any)?.error || '').toLowerCase();
  if (!code) return true;
  if (code === 'not-allowed' || code === 'service-not-allowed') return false;
  return true;
}

function scheduleRecognizerLifecycleRestart(
  trigger: 'onend' | 'onaudioend' | 'onerror',
  opts?: { abortFirst?: boolean },
): void {
  if (!shouldAutoRestartSpeech()) return;
  if (lifecycleRestartTimer != null) return;
  const now = Date.now();
  const elapsed = now - lastLifecycleRestartAt;
  const delay = elapsed >= LIFECYCLE_RESTART_COOLDOWN_MS
    ? LIFECYCLE_RESTART_DELAY_MS
    : Math.max(LIFECYCLE_RESTART_DELAY_MS, LIFECYCLE_RESTART_COOLDOWN_MS - elapsed);
  lifecycleRestartTimer = window.setTimeout(() => {
    lifecycleRestartTimer = null;
    if (!shouldAutoRestartSpeech()) return;
    const abortFirst = opts?.abortFirst === true;
    const restarted = requestRecognizerRestart(`lifecycle:${trigger}`, {
      abortFirst,
    });
    if (restarted) {
      lastLifecycleRestartAt = Date.now();
      emitHudSnapshot(`recognition-restart:${trigger}`, { force: true });
      emitAsrHeartbeat(`restart:${trigger}`, { force: true });
      return;
    }
    emitAsrState('idle', `recognition-restart-failed:${trigger}`);
    running = false;
    setActiveRecognizer(null);
    emitHudSnapshot(`recognition-restart-failed:${trigger}`, { force: true });
  }, delay);
}

function stopSpeechWatchdog(): void {
  if (speechWatchdogTimer != null) {
    window.clearInterval(speechWatchdogTimer);
    speechWatchdogTimer = null;
  }
}

function startSpeechWatchdog(): void {
  stopSpeechWatchdog();
  speechWatchdogTimer = window.setInterval(() => {
    if (!shouldAutoRestartSpeech()) return;
    if (!activeRecognizer || typeof activeRecognizer.start !== 'function') return;
    const idleFor = Date.now() - (lastResultTs || 0);
    const mode = lastScrollMode || getScrollMode();
    const thresholdMs = (mode === 'asr' || mode === 'hybrid') ? ASR_WATCHDOG_THRESHOLD_MS : WATCHDOG_THRESHOLD_MS;
    if (lastResultTs && idleFor > thresholdMs) {
      try { console.warn('[speech] watchdog: no results for', idleFor, 'ms; restarting recognition'); } catch {}
      const restarted = requestRecognizerRestart('idle-watchdog');
      if (!restarted) {
        emitAsrState('idle', 'recognition-watchdog-failed');
        running = false;
        setActiveRecognizer(null);
        emitHudSnapshot('watchdog-failed', { force: true });
        _showToast('ASR recovery failed: recognizer restart blocked.');
      } else {
        _showToast('ASR recovered (no results).');
      }
    }
  }, WATCHDOG_INTERVAL_MS);
}
function setActiveRecognizer(instance: RecognizerLike | null): void {
  activeRecognizer = instance && typeof instance.start === 'function' ? instance : null;
  pendingManualRestartCount = 0;
  clearLifecycleRestartTimer();
  if (activeRecognizer) {
    markResultTimestamp();
    startSpeechWatchdog();
  } else {
    stopSpeechWatchdog();
    setSpeechRunningActual(false, 'detach');
  }
}

function clearRecognizerHandlers(instance: any): void {
  if (!instance || typeof instance !== 'object') return;
  try { instance.onstart = null; } catch {}
  try { instance.onresult = null; } catch {}
  try { instance.onend = null; } catch {}
  try { instance.onerror = null; } catch {}
  try { instance.onspeechstart = null; } catch {}
  try { instance.onspeechend = null; } catch {}
  try { instance.onaudiostart = null; } catch {}
  try { instance.onaudioend = null; } catch {}
  try { instance.onsoundstart = null; } catch {}
  try { instance.onsoundend = null; } catch {}
  try { instance.onnomatch = null; } catch {}
}

function stopAndAbortRecognizer(instance: any): void {
  if (!instance) return;
  clearRecognizerHandlers(instance);
  try { instance.abort?.(); } catch {}
  try { instance.stop?.(); } catch {}
}

function hardResetSpeechEngine(reason?: string): void {
  const why = String(reason || 'script-reset');
  suppressRecognizerAutoRestart = true;
  asrSessionIntentActive = false;
  resetAsrInterimStabilizer();
  fallbackTranscriptMatchSeq = 0;
  lastResultTs = 0;
  lastRecognizerOnResultTs = 0;
  lastAsrIngestTs = 0;
  lastAsrCommitTs = 0;
  lastAsrCommitCount = 0;
  pendingManualRestartCount = 0;
  clearAsrRunKey(`hard-reset:${why}`);
  clearLifecycleRestartTimer();
  stopSpeechWatchdog();

  const candidates = new Set<any>();
  const remember = (value: any) => {
    if (!value) return;
    candidates.add(value);
  };
  remember(activeRecognizer);
  remember(rec);
  try { remember(window.__tpGetActiveRecognizer?.()); } catch {}
  try { remember((window as any).recog); } catch {}
  try { remember((window as any).__tpRecognizer); } catch {}

  try { stopAsrRuntime(); } catch {}
  try { getTpSpeechNamespace()?.stopRecognizer?.(); } catch {}

  for (const recognizer of candidates) {
    stopAndAbortRecognizer(recognizer);
  }

  rec = null;
  setActiveRecognizer(null);
  running = false;
  setSpeechRunningActual(false, 'hard-reset');
  asrBrainLogged = false;
  lastAsrBlockSyncAt = 0;
  lastAsrBlockSyncLogAt = 0;
  lastAsrBlockSyncCompleteFingerprint = '';
  lastAsrBlockSyncUnchangedAt = 0;
  lastAsrSyncLogAtByType = { 'block sync': 0, 'index sync': 0 };
  lastAsrSyncFingerprintByType = { 'block sync': '', 'index sync': '' };
  detachAsrScrollDriver();
  try { window.__tpMic?.releaseMic?.(); } catch {}
  try { (window as any).__tpEmitSpeech = undefined; } catch {}
  try { (window as any).__tpRecognizer = null; } catch {}
  try { (window as any).recog = null; } catch {}
  try { (window as any).currentIndex = 0; } catch {}
  try { (window as any).__lastScrollTarget = 0; } catch {}
  try { window.speechOn = false; } catch {}
  try { document.body.classList.remove('listening'); } catch {}
  try { window.HUD?.bus?.emit?.('speech:toggle', false); } catch {}
  setListeningUi(false);
  setReadyUi();
  try {
    window.dispatchEvent(
      new CustomEvent('tp:speech-state', { detail: { running: false, reason: `hard-reset:${why}` } }),
    );
  } catch {}
  emitHudSnapshot(`speech-hard-reset:${why}`, { force: true });
  emitAsrHeartbeat(`hard-reset:${why}`, { force: true });
}

function requestRecognizerRestart(
  reasonTag?: string,
  opts?: { abortFirst?: boolean },
): boolean {
  if (!activeRecognizer || typeof activeRecognizer.start !== 'function') return false;
  const abortFirst = opts?.abortFirst !== false;
  if (abortFirst) {
    pendingManualRestartCount += 1;
  }
  markResultTimestamp();
  if (abortFirst) {
    try { activeRecognizer.abort?.(); } catch {}
  }
  try {
    activeRecognizer.start();
    try { window.debug?.({ tag: 'speech:watchdog:restart', reason: reasonTag || 'watchdog', hasRecognizer: true }); } catch {}
    try { console.log('[speech] watchdog: restarted recognition'); } catch {}
    return true;
  } catch (err) {
    if (abortFirst) {
      pendingManualRestartCount = Math.max(pendingManualRestartCount - 1, 0);
    }
    try { console.warn('[speech] watchdog: restart failed', err); } catch {}
    return false;
  }
}

try {
  window.__tpGetActiveRecognizer = () => activeRecognizer;
  window.__tpHardResetSpeech = (reason?: string) => hardResetSpeechEngine(reason);
} catch {}

let fallbackTranscriptMatchSeq = 0;
let __asrLastInterimText = '';
let __asrLastInterimAt = 0;
let __asrInterimRepeatCount = 0;

function resetAsrInterimStabilizer(): void {
  __asrLastInterimText = '';
  __asrLastInterimAt = 0;
  __asrInterimRepeatCount = 0;
}

function shouldPromoteInterimToFinal(text: string): boolean {
  const now = Date.now();
  const t = String(text || '').trim();
  if (!t) return false;

  const same = t === __asrLastInterimText;
  if (same && now - __asrLastInterimAt < 1200) {
    __asrInterimRepeatCount += 1;
  } else {
    __asrInterimRepeatCount = 0;
  }

  __asrLastInterimText = t;
  __asrLastInterimAt = now;

  if (__asrInterimRepeatCount >= 2) return true;
  if (t.length >= 60 && /[.!?]$/.test(t)) return true;
  if (t.length >= 90) return true;
  return false;
}

function normalizeComparableText(value: string): string {
  return normTokens(String(value || '')).join(' ');
}

const CUE_LINE_BRACKET_RE = /^\s*[\[(][^\])]{0,120}[\])]\s*$/;
const CUE_LINE_WORD_RE = /\b(pause|beat|silence|breath|breathe|hold|wait|reflective)\b/i;
const SPEAKER_TAG_ONLY_RE = /^\s*\[\s*\/?\s*(s1|s2|guest1|guest2|g1|g2)\s*\]\s*$/i;
const NOTE_TAG_ONLY_RE = /^\s*\[\s*\/?\s*note(?:[^\]]*)\]\s*$/i;
const NOTE_INLINE_BLOCK_RE = /^\s*\[\s*note(?:[^\]]*)\][\s\S]*\[\s*\/\s*note\s*\]\s*$/i;

function isCueOnlyLineText(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return true;
  const normalized = normalizeComparableText(raw);
  if (!normalized) return true;
  if (CUE_LINE_BRACKET_RE.test(raw)) return true;
  const tokenCount = normalized.split(' ').filter(Boolean).length;
  return tokenCount <= 4 && CUE_LINE_WORD_RE.test(normalized);
}

function isSpeakerTagOnlyLineText(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return SPEAKER_TAG_ONLY_RE.test(raw);
}

function isNoteOnlyLineText(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return NOTE_TAG_ONLY_RE.test(raw) || NOTE_INLINE_BLOCK_RE.test(raw) || /\[\s*\/?\s*note\b/i.test(raw);
}

function isSpeakableLineText(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (isSpeakerTagOnlyLineText(raw)) return false;
  if (isNoteOnlyLineText(raw)) return false;
  if (isCueOnlyLineText(raw)) return false;
  return true;
}

function nextFallbackTranscriptMatchId(): string {
  fallbackTranscriptMatchSeq += 1;
  return `sl-${Date.now().toString(36)}-${fallbackTranscriptMatchSeq}`;
}

function normalizeRecognizerTranscriptPayload(input: unknown, defaultFinal: boolean): TranscriptPayload | null {
  if (typeof input === 'string') {
    const text = String(input || '');
    if (!text) return null;
    return {
      text,
      final: !!defaultFinal,
      isFinal: !!defaultFinal,
      timestamp: performance.now(),
      source: 'speech-loader',
      mode: lastScrollMode || getScrollMode(),
    };
  }
  if (!input || typeof input !== 'object') {
    const text = String(input || '');
    if (!text) return null;
    return {
      text,
      final: !!defaultFinal,
      isFinal: !!defaultFinal,
      timestamp: performance.now(),
      source: 'speech-loader',
      mode: lastScrollMode || getScrollMode(),
    };
  }
  const incoming = input as Record<string, unknown>;
  const textRaw = incoming.text ?? incoming.transcript ?? incoming.value;
  const text = typeof textRaw === 'string' ? textRaw : String(textRaw || '');
  if (!text) return null;
  const finalFromInput = incoming.isFinal ?? incoming.final;
  const final =
    typeof finalFromInput === 'boolean'
      ? finalFromInput
      : !!defaultFinal;
  return {
    ...(incoming as Partial<TranscriptPayload>),
    text,
    final,
    isFinal: final,
    timestamp: typeof incoming.timestamp === 'number' ? incoming.timestamp : performance.now(),
    source: typeof incoming.source === 'string' ? incoming.source : 'speech-loader',
    mode: typeof incoming.mode === 'string' ? incoming.mode : (lastScrollMode || getScrollMode()),
  } as TranscriptPayload;
}

function normalizeMatcherResult(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const bestIdxRaw = raw.bestIdx ?? raw.idx;
  const bestSimRaw = raw.bestSim ?? raw.sim;
  const bestIdx = Number.isFinite(Number(bestIdxRaw)) ? Math.floor(Number(bestIdxRaw)) : -1;
  const bestSim = Number.isFinite(Number(bestSimRaw)) ? Number(bestSimRaw) : 0;
  const topScores = Array.isArray(raw.topScores)
    ? raw.topScores
    : (Array.isArray(raw.candidates) ? raw.candidates : []);
  return {
    ...raw,
    bestIdx,
    bestSim,
    topScores,
    noMatch: typeof raw.noMatch === 'boolean' ? raw.noMatch : bestIdx < 0,
  };
}

function deriveFallbackMatch(payload: TranscriptPayload): Record<string, unknown> | null {
  const raw = payload as any;
  const speechNs = getTpSpeechNamespace();
  const speechStoreState = getTpSpeechStoreSnapshot();
  if (raw?.match && typeof raw.match === 'object') {
    return raw.match as Record<string, unknown>;
  }
  const bestIdxRaw = raw?.bestIdx ?? raw?.line ?? raw?.idx;
  const bestSimRaw = raw?.bestSim ?? raw?.sim ?? raw?.score;
  const hasStructuredHint = Number.isFinite(Number(bestIdxRaw)) || raw?.noMatch === true;
  if (!hasStructuredHint) {
    const transcript = String(payload.text || '');
    const finalFlag = Boolean(payload.isFinal ?? payload.final);
    try {
      const matchOne = speechNs?.matchOne;
      if (typeof matchOne === 'function') {
        const result = normalizeMatcherResult(matchOne(transcript, finalFlag));
        if (result) return result;
      }
    } catch {}
    try {
      const matchBatch = speechNs?.matchBatch;
      if (typeof matchBatch === 'function') {
        const result = normalizeMatcherResult(matchBatch(transcript, finalFlag));
        if (result) return result;
      }
    } catch {}
    return null;
  }
  const bestIdx = Number.isFinite(Number(bestIdxRaw)) ? Math.floor(Number(bestIdxRaw)) : -1;
  const bestSim = Number.isFinite(Number(bestSimRaw)) ? Number(bestSimRaw) : 0;
  const topScores = Array.isArray(raw?.topScores)
    ? raw.topScores
    : (Array.isArray(raw?.candidates) ? raw.candidates : []);
  const currentIdxRaw =
    raw?.currentIdx ??
    (window as any)?.currentIndex ??
    (speechStoreState as any)?.currentIdx ??
    (speechStoreState as any)?.currentIndex;
  const currentIdx = Number.isFinite(Number(currentIdxRaw)) ? Math.floor(Number(currentIdxRaw)) : null;
  return {
    bestIdx,
    bestSim,
    topScores,
    currentIdx,
  };
}

function enrichTranscriptPayloadForAsr(payload: TranscriptPayload): TranscriptPayload {
  const next: TranscriptPayload = { ...payload };
  const mode = String(next.mode || lastScrollMode || getScrollMode() || '').toLowerCase();
  const asrLike = mode === 'asr' || mode === 'hybrid';
  if (!asrLike) return next;

  const match = deriveFallbackMatch(next);
  if (match && (!next.match || typeof next.match !== 'object')) {
    next.match = match;
  }

  const bestIdxRaw = (match as any)?.bestIdx;
  const hasForwardMatch = Number.isFinite(Number(bestIdxRaw)) && Number(bestIdxRaw) >= 0;
  if (next.noMatch == null) {
    next.noMatch = !hasForwardMatch;
  }
  if (next.matchId == null || next.matchId === '') {
    next.matchId = next.noMatch ? null : nextFallbackTranscriptMatchId();
  }
  if (next.currentIdx == null) {
    const idxRaw = Number((window as any)?.currentIndex ?? (match as any)?.currentIdx);
    next.currentIdx = Number.isFinite(idxRaw) ? Math.max(0, Math.floor(idxRaw)) : null;
  }
  if (next.line == null && hasForwardMatch) {
    next.line = Math.floor(Number(bestIdxRaw));
  }
  const simRaw = (match as any)?.bestSim ?? (payload as any)?.bestSim;
  if (next.sim == null && Number.isFinite(Number(simRaw))) {
    next.sim = Number(simRaw);
  }
  if (next.candidates == null && Array.isArray((match as any)?.topScores)) {
    next.candidates = (match as any).topScores;
  }
  return next;
}

function routeRecognizerTranscript(input: unknown, defaultFinal: boolean): void {
  const payload = normalizeRecognizerTranscriptPayload(input, defaultFinal);
  if (!payload) return;
  routeTranscript(payload, Boolean(payload.isFinal ?? payload.final ?? defaultFinal));
}

// Small router to bridge transcripts to both legacy and modern paths
function routeTranscript(input: string | (Partial<TranscriptPayload> & { text?: string }), isFinal?: boolean): void {
  try {
    const incoming = typeof input === 'string' ? null : input;
    const inputText = typeof input === 'string' ? input : '';
    const finalFlag =
      typeof isFinal === 'boolean'
        ? isFinal
        : Boolean(incoming?.isFinal ?? incoming?.final);
    const payload: TranscriptPayload = incoming ? { ...(incoming as TranscriptPayload) } : {
      text: inputText,
      final: !!finalFlag,
      isFinal: !!finalFlag,
      timestamp: performance.now(),
      source: 'speech-loader',
      mode: lastScrollMode || getScrollMode(),
    };
    const text = typeof payload.text === 'string'
      ? payload.text
      : inputText;
    if (!text) return;
    markResultTimestamp();
    if (payload.text == null) payload.text = text;
    if (payload.final == null) payload.final = !!finalFlag;
    if (payload.isFinal == null) payload.isFinal = !!finalFlag;
    if (payload.timestamp == null) payload.timestamp = performance.now();
    if (payload.source == null) payload.source = 'speech-loader';
    if (payload.mode == null) payload.mode = lastScrollMode || getScrollMode();
    const rawFinal = Boolean(payload.isFinal ?? payload.final ?? finalFlag);
    const normalizedMode = String(payload.mode || '').toLowerCase();
    const asrLike = normalizedMode === 'asr' || normalizedMode === 'hybrid';
    const promotedFinal = rawFinal || (asrLike ? shouldPromoteInterimToFinal(text) : false);
    if (rawFinal) {
      resetAsrInterimStabilizer();
    }
    payload.final = promotedFinal;
    payload.isFinal = promotedFinal;
    const enriched = enrichTranscriptPayloadForAsr(payload);
    const eventFinal = Boolean(enriched.isFinal ?? enriched.final ?? promotedFinal);
    try {
      console.debug(
        '[ASR_ROUTE] keys=',
        Object.keys(enriched as Record<string, unknown>),
        'matchId=',
        (enriched as any).matchId,
        'noMatch=',
        (enriched as any).noMatch,
      );
    } catch {}

    // Always emit to HUD bus (unconditional for debugging/monitoring)
    try { window.HUD?.bus?.emit?.(eventFinal ? 'speech:final' : 'speech:partial', enriched); } catch {}

    pushAsrTranscript(text, eventFinal, enriched as any);

    // In rehearsal, never steer; only HUD logging
    if (inRehearsal()) return;

    // Legacy monolith path
    if (typeof window.advanceByTranscript === 'function') {
      try { window.advanceByTranscript(text, !!eventFinal); } catch {}
    }

    // Dispatch window event only when gated (ASR/Hybrid mode + mic active)
    if (shouldEmitTranscript()) {
      try { (enriched as any).__tpDirectIngest = true; } catch {}
      try { console.log('[speech-loader] emit tp:speech:transcript', enriched); } catch {}
      emitTranscriptEvent(enriched);
    }
  } catch {}
}

// (dynamic import of '/dist/speech/orchestrator.real.js' is performed inline where needed)

// Minimal Web Speech fallback
function _startWebSpeech(): { stop: () => void } | null {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    try { console.warn('[speech] Web Speech not available'); } catch {}
    return { stop: () => {} };
  }
  const r = new SR();
  r.continuous = true;
  r.interimResults = true;
  r.lang = 'en-US';
  attachWebSpeechLifecycle(r, {
    onError: (e: Event) => { try { console.warn('[speech] error', e); } catch {} },
  });
  setActiveRecognizer(r);
  try { r.start(); } catch {}
  return { stop: () => { try { r.stop(); } catch {} } };
}

function setReadyUi(): void {
  try {
    const btn = document.getElementById('recBtn') as HTMLButtonElement | null;
    const chip = document.getElementById('speechStatus') || document.getElementById('recChip');
    if (btn) {
      btn.disabled = false;
      btn.title = 'Start speech sync';
      try { btn.textContent = 'Start speech sync'; } catch {}
    }
    if (chip) chip.textContent = 'Speech: ready';
    try { document.body.classList.add('speech-ready'); } catch {}
  } catch {}
}

function setUnsupportedUi(): void {
  try {
    const btn = document.getElementById('recBtn') as HTMLButtonElement | null;
    const chip = document.getElementById('speechStatus') || document.getElementById('recChip');
    if (btn) {
      btn.disabled = true;
      btn.title = 'Speech not supported in this browser';
    }
    if (chip) chip.textContent = 'Speech: unsupported';
    try { document.body.classList.remove('speech-ready', 'speech-listening', 'listening'); } catch {}
  } catch {}
}

// Update UI when speech is actively listening or stopped
function setListeningUi(listening: boolean): void {
  try {
    const btn = document.getElementById('recBtn') as HTMLButtonElement | null;
    const chip = document.getElementById('speechStatus') || document.getElementById('recChip');
    if (btn) {
      // Keep the button enabled/disabled state managed by callers; update labels
      btn.title = listening ? 'Stop speech sync' : 'Start speech sync';
      try { btn.textContent = listening ? 'Stop speech sync' : 'Start speech sync'; } catch {}
    }
    if (chip) chip.textContent = listening ? 'Speech: listening' : 'Speech: ready';
    try {
      if (listening) {
        document.body.classList.add('listening');
      } else {
        document.body.classList.remove('listening');
      }
    } catch {}
  } catch {}
}

// … (keep your existing helper functions unchanged above installSpeech)

function beginCountdownThen(sec: number, cb: () => Promise<void> | void, source = 'speech'): Promise<void> {
  // Run a simple seconds countdown (emit optional HUD events) then call the callback.
  // Resolves even if the callback throws; non-blocking and tolerant to environment failures.
  // Overlay helpers (local so they don't leak globals if loader is re-imported)
  function showPreroll(n: number) {
    try {
      const overlay = document.getElementById('countOverlay');
      const num = document.getElementById('countNum');
      if (overlay) overlay.style.display = 'flex';
      if (num) num.textContent = String(n);
      // Send to display window if available
      if (typeof window.sendToDisplay === 'function') {
        window.sendToDisplay({ type: 'preroll', show: true, n });
      }
    } catch {}
  }
  function hidePreroll() {
    try {
      const overlay = document.getElementById('countOverlay');
      if (overlay) overlay.style.display = 'none';
      // Send to display window if available
      if (typeof window.sendToDisplay === 'function') {
        window.sendToDisplay({ type: 'preroll', show: false });
      }
    } catch {}
  }
  return new Promise((resolve) => {
    (async () => {
      let done = false;
      try {
        const s = Number(sec) || 0;
        if (s <= 0) {
          hidePreroll();
          try { await cb(); } catch {}
          completePrerollSession({ seconds: s, source });
          done = true;
          return;
        }
        for (let i = s; i > 0; i--) {
          showPreroll(i);
          try { window.HUD?.bus?.emit?.('speech:countdown', { remaining: i }); } catch {}
          await new Promise(r => setTimeout(r, 1000));
        }
        hidePreroll();
        try { await cb(); } catch {}
        completePrerollSession({ seconds: s, source });
        done = true;
      } catch {}
      finally {
        if (!done) hidePreroll();
      }
    })().then(() => resolve()).catch(() => { try { hidePreroll(); } catch {}; resolve(); });
  });
}

function emitAsrState(state: string, reason?: string): void {
  const payload = { state, reason };
  try { window.__tpBus?.emit?.('tp:asr:state', payload); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:asr:state', { detail: payload })); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:asr:state', { detail: payload })); } catch {}
  emitHudSnapshot(`asr-state:${String(state || '').toLowerCase() || 'unknown'}`);
  emitAsrHeartbeat(`state:${String(state || '').toLowerCase() || 'unknown'}`, { force: true });
}

function shouldAutoRestartSpeech(): boolean {
  if (!running) return false;
  if (suppressRecognizerAutoRestart) return false;
  const mode = String(lastScrollMode || getScrollMode() || '').toLowerCase();
  rememberMode(mode);
  if (!isAutoRestartEnabled()) return false;
  if (mode === 'hybrid') return true;
  if (mode !== 'asr') return false;
  const session = getSession();
  return !!session.asrArmed;
}

function isDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    if (w.localStorage?.getItem('tp_dev_mode') === '1') return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.has('dev')) return true;
    const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    if (hash === 'dev' || hash === 'dev=1' || hash.includes('dev=1')) return true;
  } catch {}
  return false;
}

function installAsrHudDev(): void {
  if (!isDevMode()) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const w = window as any;
  if (w.__tpAsrHudInstalled) return;
  w.__tpAsrHudInstalled = true;

  const mountHud = () => {
    if (!document.body || document.getElementById('__tpAsrHud')) return;

    const el = document.createElement('div');
    el.id = '__tpAsrHud';
    el.style.cssText = [
      'position:fixed; right:8px; bottom:8px; z-index:999999;',
      'background:rgba(0,0,0,0.75); color:#9ef; padding:10px 12px;',
      'font:12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;',
      'border:1px solid rgba(255,255,255,0.15); border-radius:10px;',
      'max-width:420px; white-space:pre; pointer-events:none;',
    ].join(' ');
    document.body.appendChild(el);
    const formatBool = (value: unknown) => (value ? 'true' : 'false');
    const formatAge = (ts: number | null | undefined) => {
      if (!Number.isFinite(Number(ts)) || Number(ts) <= 0) return '-';
      const age = Math.max(0, Date.now() - Number(ts));
      return `${Math.round(age)}ms`;
    };
    const render = (snap: HudSnapshotPayload) => {
      el.textContent =
`ASR HUD
href: ${location.pathname}${location.search}${location.hash}
scrollMode: ${snap.scrollMode || 'unknown'}
sessionPhase: ${snap.sessionPhase || 'idle'}
speechRunning: ${formatBool(snap.speechRunning)}
speechRunningActual: ${formatBool(snap.speechRunningActual)}
asrDesired: ${formatBool(snap.asrDesired)}
asrArmed: ${formatBool(snap.asrArmed)}

driver: ${snap.driver ? 'YES' : 'NO'}
driverId: ${snap.driverId || 'none'}
lastLineIndex: ${snap.lastLineIndex ?? '-'}
lastOnResult: ${formatAge(snap.lastOnResultTs)}
lastIngest: ${formatAge(snap.lastIngestTs)}
lastCommit: ${formatAge(snap.lastCommitTs)}
`;
    };

    const onSnapshot = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (!detail || typeof detail !== 'object') return;
      render(detail as HudSnapshotPayload);
    };

    try { window.addEventListener('tp:hud:snapshot', onSnapshot, { capture: false }); } catch {}
    render(buildHudSnapshot('dev-hud:init'));
    window.setInterval(() => {
      render(buildHudSnapshot('dev-hud:poll'));
    }, 250);
  };

  if (document.body) {
    mountHud();
    return;
  }

  try {
    window.addEventListener('DOMContentLoaded', mountHud, { once: true });
  } catch {}
}

const SPEAKER_SLOTS: SpeakerSlot[] = ['s1', 's2', 'g1', 'g2'];
const SPEAKER_NAME_SELECTORS: Record<SpeakerSlot, string> = {
  s1: '#name-s1',
  s2: '#name-s2',
  g1: '#name-g1',
  g2: '#name-g2',
};

const DEFAULT_SPEAKER_LABELS: Record<SpeakerSlot, string> = {
  s1: 'Speaker 1',
  s2: 'Speaker 2',
  g1: 'Guest 1',
  g2: 'Guest 2',
};

function getSpeakerName(slot: SpeakerSlot): string {
  try {
    const selector = SPEAKER_NAME_SELECTORS[slot];
    const input = document.querySelector<HTMLInputElement>(selector);
    const value = input?.value?.trim();
    if (value) return value;
  } catch {}
  return DEFAULT_SPEAKER_LABELS[slot] || slot.toUpperCase();
}

function ensureProfileForSlot(slot: SpeakerSlot): ReturnType<typeof createProfile> {
  const bindings = getSpeakerBindings();
  const existingId = bindings[slot] || null;
  const profile = getProfile(existingId);
  if (profile) return profile;
  const created = createProfile(getSpeakerName(slot));
  applyProfileToSlot(slot, created.id);
  return created;
}

const LOWER_GUARDS = [
  'low_sim',
  'low_sim_wait',
  'no_match',
  'no_match_pipeline',
  'min_evidence',
];
const RAISE_GUARDS = [
  'tie_forward',
  'forward_outrun',
  'forward_progress',
  'forward_bias',
];

function clampCandidate(value: number): number {
  return Math.max(0.25, Math.min(0.85, clamp01(value)));
}

let summaryListenerAttached = false;

function computeCandidateDelta(guardCounts?: Record<string, number>): number {
  if (!guardCounts) return 0;
  const lowerHits = LOWER_GUARDS.reduce((sum, key) => sum + (guardCounts[key] || 0), 0);
  const raiseHits = RAISE_GUARDS.reduce((sum, key) => sum + (guardCounts[key] || 0), 0);
  if (lowerHits >= 3) return -0.01;
  if (raiseHits >= 3) return 0.01;
  return 0;
}

function handleAsrSummary(summary: Record<string, any> | undefined): void {
  if (!summary) return;
  const mode = (summary.mode || '').toLowerCase();
  if (!['asr', 'hybrid'].includes(mode)) return;
  const commitCount = typeof summary.commitCount === 'number' ? summary.commitCount : 0;
  if (commitCount < 4) return;
  const guardCounts = summary.guardCounts as Record<string, number> | undefined;
  const delta = computeCandidateDelta(guardCounts);
  if (!delta) return;
  const slot = getActiveSpeakerSlot();
  const profile = ensureProfileForSlot(slot);
  const existing = profile.asrTweaks?.candidateMinSim ?? DEFAULT_ASR_THRESHOLDS.candidateMinSim;
  const next = clampCandidate(existing + delta);
  if (Math.abs(next - existing) < 1e-6) return;
  setProfileAsrTweaks(profile.id, {
    ...(profile.asrTweaks || {}),
    candidateMinSim: next,
  });
  if (isDevMode()) {
    console.debug('[ASR] summary auto-tune', { slot, delta, next, guardCounts });
  }
}

function attachSummaryListener(): void {
  if (summaryListenerAttached || typeof window === 'undefined') return;
  summaryListenerAttached = true;
  try {
    window.addEventListener('tp:asr:summary', (event) => {
      handleAsrSummary((event as CustomEvent)?.detail);
    });
  } catch {}
}

function autoSaveSpeakerPatchesAfterStop(mode: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const normalizedMode = (mode || '').toLowerCase();
  if (!['asr', 'hybrid'].includes(normalizedMode)) return;
  const patches = getSessionLearnedPatches();
  const bindingsBefore = getSpeakerBindings();
  const createdSlots: SpeakerSlot[] = [];
  for (const slot of SPEAKER_SLOTS) {
    if (!bindingsBefore[slot]) {
      ensureProfileForSlot(slot);
      createdSlots.push(slot);
    } else {
      ensureProfileForSlot(slot);
    }
  }

  if (isDevMode()) {
    console.debug('[ASR] autoSaveSpeakerPatchesAfterStop', {
      mode: normalizedMode,
      patches: Object.fromEntries(
        SPEAKER_SLOTS.map((slot) => [slot, Object.keys(patches[slot] || {})]),
      ),
      createdSlots,
    });
  }

  for (const slot of SPEAKER_SLOTS) {
    const patch = patches[slot];
    if (!patch || !Object.keys(patch).length) continue;
    const profile = ensureProfileForSlot(slot);
    setProfileAsrTweaks(profile.id, {
      ...(profile.asrTweaks || {}),
      ...patch,
    });
    if (isDevMode()) {
      console.debug('[ASR] saved patch', slot, Object.keys(patch));
    }
  }
}

function isSettingsHydrating(): boolean {
  try { return !!(window as any).__tpSettingsHydrating; } catch { return false; }
}

function parsePx(value: string | null | undefined): number {
  const parsed = Number.parseFloat(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMarkerOffset(viewer: HTMLElement | null, root: HTMLElement | null) {
  const markerPct = typeof (window as any).__TP_MARKER_PCT === 'number'
    ? (window as any).__TP_MARKER_PCT
    : 0.4;
  const host = viewer || root;
  const hostHeight = host?.clientHeight || 0;
  const markerOffset = Math.max(0, Math.round(hostHeight * markerPct));
  return { markerPct, host, hostHeight, markerOffset };
}

function checkAsrLayoutReady() {
  const viewer = getPrimaryScroller();
  const root = getScriptRoot() || viewer;
  const container = root || viewer;
  if (!container) return { ready: false, reason: 'no-container' as const };
  const lineEl = container.querySelector<HTMLElement>('.line');
  if (!lineEl) return { ready: false, reason: 'no-lines' as const };
  const lineHeight = lineEl.offsetHeight || lineEl.clientHeight || 0;
  if (lineHeight <= 0) return { ready: false, reason: 'line-height' as const, lineHeight };
  const { markerPct, host, hostHeight, markerOffset } = getMarkerOffset(viewer, root);
  if (!host || hostHeight <= 0) {
    return { ready: false, reason: 'host-height' as const, hostHeight, markerPct };
  }
  const rootPadding = root ? parsePx(getComputedStyle(root).paddingTop) : 0;
  const viewerScrollPadding = viewer ? parsePx(getComputedStyle(viewer).scrollPaddingTop) : 0;
  const paddingReady =
    markerOffset <= 0 ||
    Math.abs(rootPadding - markerOffset) <= 1 ||
    Math.abs(viewerScrollPadding - markerOffset) <= 1;
  if (!paddingReady) {
    return {
      ready: false,
      reason: 'marker-padding' as const,
      markerOffset,
      rootPadding,
      viewerScrollPadding,
      markerPct,
      hostHeight,
    };
  }
  return {
    ready: true,
    markerOffset,
    lineHeight,
    markerPct,
    hostHeight,
  };
}

const ASR_LAYOUT_READY_MAX_MS = 1200;
let pendingLayoutReady: Promise<boolean> | null = null;

async function waitForAsrLayoutReady(reason?: string): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  if (pendingLayoutReady) return pendingLayoutReady;
  pendingLayoutReady = (async () => {
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16);
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let lastCheck = checkAsrLayoutReady();
    while (!lastCheck.ready) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - start >= ASR_LAYOUT_READY_MAX_MS) break;
      await new Promise<void>((resolve) => raf(() => resolve()));
      lastCheck = checkAsrLayoutReady();
    }
    if (!lastCheck.ready) {
      try {
        console.warn('[ASR] layout not ready', {
          reason,
          cause: lastCheck.reason,
          ...lastCheck,
        });
      } catch {}
    }
    return lastCheck.ready;
  })();
  try {
    return await pendingLayoutReady;
  } finally {
    pendingLayoutReady = null;
  }
}

function computeMarkerLineIndex(): number {
  try {
    const viewer = getPrimaryScroller();
    const root = getScriptRoot() || viewer;
    const container = viewer || root;
    const lineEls = Array.from(
      (container || document).querySelectorAll<HTMLElement>('.line'),
    );
    if (!lineEls.length) return 0;
    const scroller =
      getRuntimeScroller() ||
      resolveActiveScroller(viewer, root || getScrollerEl('main') || getScrollerEl('display'));
    const scrollTop = scroller?.scrollTop ?? 0;
    const firstLineHeight = lineEls[0].offsetHeight || lineEls[0].clientHeight || 0;
    const topEpsilon = Math.max(24, firstLineHeight * 0.5);
    if (scrollTop <= topEpsilon) return 0;
    const markerPct = typeof (window as any).__TP_MARKER_PCT === 'number'
      ? (window as any).__TP_MARKER_PCT
      : 0.4;
    const host = scroller || container;
    const rect = host ? host.getBoundingClientRect() : document.documentElement.getBoundingClientRect();
    const markerY = rect.top + (host ? host.clientHeight : window.innerHeight) * markerPct;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < lineEls.length; i++) {
      const el = lineEls[i];
      const r = el.getBoundingClientRect();
      const y = r.top + r.height * 0.5;
      const d = Math.abs(y - markerY);
      if (d < bestDist) {
        bestDist = d;
        const dataIdx = el.dataset.i || el.dataset.index || el.getAttribute('data-line-idx');
        bestIdx = dataIdx ? Math.max(0, Number(dataIdx) || 0) : i;
      }
    }
    return Math.max(0, Math.floor(bestIdx));
  } catch {
    return 0;
  }
}

function getLineSnapshot(index: number) {
  try {
    const viewer = getPrimaryScroller() || getScriptRoot();
    const idx = Math.max(0, Math.floor(index));
    const line =
      viewer?.querySelector<HTMLElement>(`.line[data-i="${idx}"]`) ||
      viewer?.querySelector<HTMLElement>(`.line[data-index="${idx}"]`) ||
      viewer?.querySelector<HTMLElement>(`.line[data-line-idx="${idx}"]`);
    if (!line) return null;
    const text = String(line.textContent || '').replace(/\s+/g, ' ').trim();
    const snippet = text.length > 60 ? `${text.slice(0, 60)}...` : text;
    return {
      snippet,
      lineHeight: line.offsetHeight || line.clientHeight || 0,
      scrollTop: (viewer as HTMLElement | null)?.scrollTop ?? 0,
    };
  } catch {
    return null;
  }
}

function getLineTextAtIndex(index: number, container?: ParentNode | null): string {
  const idx = Math.max(0, Math.floor(Number(index) || 0));
  try {
    const host = container || getScriptRoot() || getPrimaryScroller() || document;
    const line =
      host.querySelector<HTMLElement>(`.line[data-line="${idx}"]`) ||
      host.querySelector<HTMLElement>(`.line[data-line-idx="${idx}"]`) ||
      host.querySelector<HTMLElement>(`.line[data-i="${idx}"]`) ||
      host.querySelector<HTMLElement>(`.line[data-index="${idx}"]`);
    return String(line?.textContent || '').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

function nextSpeakableLineFrom(
  startIndex: number,
  opts?: { maxLookahead?: number; container?: ParentNode | null },
): number | null {
  if (!Number.isFinite(startIndex)) return null;
  const begin = Math.max(0, Math.floor(startIndex));
  const maxLookaheadRaw = Number(opts?.maxLookahead);
  const maxLookahead = Number.isFinite(maxLookaheadRaw) && maxLookaheadRaw >= 0
    ? Math.floor(maxLookaheadRaw)
    : Number.POSITIVE_INFINITY;
  try {
    const host = opts?.container || getScriptRoot() || getPrimaryScroller() || document;
    const lines = Array.from(host.querySelectorAll<HTMLElement>('.line'));
    if (!lines.length) return null;
    const entries = lines
      .map((lineEl, pos) => ({
        idx: parseLineIndexFromElement(lineEl, pos),
        text: String(lineEl.textContent || '').replace(/\s+/g, ' ').trim(),
      }))
      .filter((entry) => Number.isFinite(entry.idx))
      .sort((a, b) => a.idx - b.idx);
    for (const entry of entries) {
      if (entry.idx < begin) continue;
      if (Number.isFinite(maxLookahead) && entry.idx > begin + maxLookahead) break;
      if (isSpeakableLineText(entry.text)) {
        return entry.idx;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

type AsrBlockCursorCandidate = {
  blockIdx: number;
  lineStart: number;
  lineEnd: number;
  speakableStartLine: number;
  blockTopPx: number;
  cueOnlyByLine: Map<number, boolean>;
};

function parseLineIndexFromElement(lineEl: HTMLElement, fallback: number): number {
  const raw =
    lineEl.dataset.line ||
    lineEl.dataset.lineIdx ||
    lineEl.dataset.i ||
    lineEl.dataset.index ||
    lineEl.getAttribute('data-line-idx');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : Math.max(0, fallback);
}

function elementTopRelativeToScroller(el: HTMLElement, scroller: HTMLElement | null): number {
  try {
    if (!scroller) return el.offsetTop || 0;
    if (isWindowScroller(scroller)) {
      const rect = el.getBoundingClientRect();
      const scrollTop = window.scrollY || window.pageYOffset || scroller.scrollTop || 0;
      return rect.top + scrollTop;
    }
    const rect = el.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    return rect.top - scrollerRect.top + (scroller.scrollTop || 0);
  } catch {
    return el.offsetTop || 0;
  }
}

function getAsrBlockCursorCandidates(scroller: HTMLElement | null): AsrBlockCursorCandidate[] {
  const blocks = getAsrBlockElements();
  if (!Array.isArray(blocks) || !blocks.length) return [];
  const candidates: AsrBlockCursorCandidate[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const blockEl = blocks[i];
    if (!blockEl) continue;
    const blockIdxRaw = Number(blockEl.dataset.tpBlock ?? i);
    const blockIdx = Number.isFinite(blockIdxRaw) ? Math.max(0, Math.floor(blockIdxRaw)) : i;
    const lineEls = Array.from(blockEl.querySelectorAll<HTMLElement>('.line'));
    if (!lineEls.length) continue;
    const entries = lineEls
      .map((lineEl, linePos) => {
        const idx = parseLineIndexFromElement(lineEl, linePos);
        const text = String(lineEl.textContent || '').replace(/\s+/g, ' ').trim();
        return {
          idx,
          cueOnly: !isSpeakableLineText(text),
        };
      })
      .filter((entry) => Number.isFinite(entry.idx))
      .sort((a, b) => a.idx - b.idx);
    if (!entries.length) continue;
    const lineStart = entries[0].idx;
    const lineEnd = entries[entries.length - 1].idx;
    const speakable = entries.find((entry) => !entry.cueOnly);
    const speakableStartLine = speakable ? speakable.idx : lineStart;
    const cueOnlyByLine = new Map<number, boolean>();
    entries.forEach((entry) => {
      cueOnlyByLine.set(entry.idx, entry.cueOnly);
    });
    candidates.push({
      blockIdx,
      lineStart,
      lineEnd,
      speakableStartLine,
      blockTopPx: elementTopRelativeToScroller(blockEl, scroller),
      cueOnlyByLine,
    });
  }
  return candidates.sort((a, b) => a.blockIdx - b.blockIdx || a.lineStart - b.lineStart);
}

function resolveAsrBlockCursor(
  startIdx: number,
  scroller: HTMLElement | null,
  topEpsilon: number,
): (AsrBlockCursorCandidate & { lineIdx: number; sourceLine: number; cueAdjusted: boolean; clamped: boolean }) | null {
  const sourceLine = Math.max(0, Math.floor(Number(startIdx) || 0));
  const candidates = getAsrBlockCursorCandidates(scroller);
  if (!candidates.length) return null;
  let chosen =
    candidates.find((candidate) => sourceLine >= candidate.lineStart && sourceLine <= candidate.lineEnd) ||
    null;
  if (!chosen) {
    chosen = candidates.reduce<AsrBlockCursorCandidate | null>((best, candidate) => {
      if (!best) return candidate;
      const bestDist =
        sourceLine < best.lineStart
          ? best.lineStart - sourceLine
          : (sourceLine > best.lineEnd ? sourceLine - best.lineEnd : 0);
      const candidateDist =
        sourceLine < candidate.lineStart
          ? candidate.lineStart - sourceLine
          : (sourceLine > candidate.lineEnd ? sourceLine - candidate.lineEnd : 0);
      return candidateDist < bestDist ? candidate : best;
    }, null);
  }
  if (!chosen) return null;
  let clamped = chosen.blockTopPx <= topEpsilon;
  if (clamped) {
    const first = candidates
      .slice()
      .sort((a, b) => a.blockTopPx - b.blockTopPx || a.blockIdx - b.blockIdx)[0];
    if (first) {
      chosen = first;
      clamped = chosen.blockTopPx <= topEpsilon;
    }
  }
  let lineIdx = sourceLine;
  if (lineIdx < chosen.lineStart || lineIdx > chosen.lineEnd) {
    lineIdx = chosen.speakableStartLine;
  }
  const cueAdjusted =
    chosen.cueOnlyByLine.get(lineIdx) === true || lineIdx !== sourceLine;
  if (chosen.cueOnlyByLine.get(lineIdx) === true) {
    lineIdx = chosen.speakableStartLine;
  }
  lineIdx = Math.max(chosen.lineStart, Math.min(chosen.lineEnd, lineIdx));
  return {
    ...chosen,
    lineIdx,
    sourceLine,
    cueAdjusted,
    clamped,
  };
}

function resolveBlockIdxForLine(lineIdx: number, scroller: HTMLElement | null): number | null {
  const target = Math.max(0, Math.floor(Number(lineIdx) || 0));
  const candidates = getAsrBlockCursorCandidates(scroller);
  const hit = candidates.find((candidate) => target >= candidate.lineStart && target <= candidate.lineEnd);
  return hit ? hit.blockIdx : null;
}

function getAsrSyncCursorFloor(): number | null {
  const mode = String(getScrollMode() || '').toLowerCase();
  const phase = String(getSession().phase || '').toLowerCase();
  if (mode !== 'asr' || phase !== 'live' || !running) return null;
  const driverIdxRaw = Number(asrScrollDriver?.getLastLineIndex?.() ?? NaN);
  if (!Number.isFinite(driverIdxRaw)) return null;
  return Math.max(0, Math.floor(driverIdxRaw));
}

function shouldApplyAsrIndexSync(
  idx: number,
  reason: string,
  interpretedAs: 'line' | 'block',
): boolean {
  const next = Math.max(0, Math.floor(Number(idx) || 0));
  const floor = getAsrSyncCursorFloor();
  if (floor == null || next >= floor) return true;
  if (
    isDevMode()
    && shouldLogLevel(2)
    && shouldLogTag(`ASR:index-sync-regression:${interpretedAs}:${reason}`, 2, ASR_SYNC_LOG_THROTTLE_MS)
  ) {
    try {
      console.warn('[ASR] index sync ignored (regression)', {
        idx: next,
        floor,
        interpretedAs,
        reason,
      });
    } catch {}
  }
  return false;
}

function syncAsrBlockCursor(
  startIdx: number,
  reason: string,
  scroller: HTMLElement | null,
  scrollTop: number,
  topEpsilon: number,
): boolean {
  if (reason !== 'blocks:scroll-mode') return false;
  const cursor = resolveAsrBlockCursor(startIdx, scroller, topEpsilon);
  if (!cursor) return false;
  const idx = cursor.lineIdx;
  if (!shouldApplyAsrIndexSync(idx, reason, 'block')) {
    return true;
  }
  const blockTopPx = Number.isFinite(cursor.blockTopPx) ? Math.round(cursor.blockTopPx) : cursor.blockTopPx;
  const schemaVersion = Number(getAsrBlockIndex()?.schemaVersion || 1);
  try { (window as any).currentIndex = idx; } catch {}
  try { asrScrollDriver?.setLastLineIndex?.(idx); } catch {}
  logAsrSync('block sync', {
    idx,
    interpretedAs: 'block',
    blockIdx: cursor.blockIdx,
    lineIdx: idx,
    lineStart: cursor.lineStart,
    lineEnd: cursor.lineEnd,
    speakableStartLine: cursor.speakableStartLine,
    schemaVersion,
    blockTopPx,
    reason,
    clamped: cursor.clamped,
    cueAdjusted: cursor.cueAdjusted,
    sourceLine: cursor.sourceLine,
    scrollTop: Math.round(scrollTop),
    topEpsilon: Math.round(topEpsilon),
  });
  logAsrSync('index sync', {
    idx,
    interpretedAs: 'block',
    blockIdx: cursor.blockIdx,
    lineIdx: idx,
    schemaVersion,
    reason,
    clamped: cursor.clamped,
    cueAdjusted: cursor.cueAdjusted,
    sourceLine: cursor.sourceLine,
    scrollTop: Math.round(scrollTop),
    topEpsilon: Math.round(topEpsilon),
    blockTopPx,
  });
  return true;
}

function syncAsrIndices(startIdx: number, reason: string): void {
  const viewer = getPrimaryScroller();
  const root = getScriptRoot() || viewer;
  const scroller =
    getRuntimeScroller() ||
    resolveActiveScroller(viewer, root || getScrollerEl('main') || getScrollerEl('display'));
  const scrollTop = scroller?.scrollTop ?? 0;
  const lineEl = (root || viewer || document).querySelector<HTMLElement>('.line');
  const lineHeight = lineEl?.offsetHeight || lineEl?.clientHeight || 0;
  const topEpsilon = Math.max(24, lineHeight * 0.5);
  if (syncAsrBlockCursor(startIdx, reason, scroller, scrollTop, topEpsilon)) return;
  const clamped = scrollTop <= topEpsilon;
  const sourceIdx = clamped ? 0 : Math.max(0, Math.floor(Number(startIdx) || 0));
  let idx = sourceIdx;
  const sourceLineText = getLineTextAtIndex(sourceIdx, root || viewer || document);
  let cueAdjusted = false;
  if (!isSpeakableLineText(sourceLineText)) {
    const nextSpoken = nextSpeakableLineFrom(sourceIdx, {
      container: root || viewer || document,
    });
    if (Number.isFinite(nextSpoken as number) && (nextSpoken as number) >= sourceIdx) {
      idx = Math.max(0, Math.floor(nextSpoken as number));
      cueAdjusted = true;
    }
  }
  const blockIdx = resolveBlockIdxForLine(idx, scroller);
  const schemaVersion = Number(getAsrBlockIndex()?.schemaVersion || 1);
  if (!shouldApplyAsrIndexSync(idx, reason, 'line')) return;
  try { (window as any).currentIndex = idx; } catch {}
  try { asrScrollDriver?.setLastLineIndex?.(idx); } catch {}
  logAsrSync('index sync', {
    idx,
    interpretedAs: 'line',
    blockIdx,
    lineIdx: idx,
    schemaVersion,
    reason,
    clamped,
    cueAdjusted,
    sourceLine: sourceIdx,
    scrollTop: Math.round(scrollTop),
    topEpsilon: Math.round(topEpsilon),
  });
}

const TRANSCRIPT_EVENT_OPTIONS: AddEventListenerOptions = { capture: true };
let asrScrollDriver: AsrScrollDriver | null = null;
let transcriptListener: ((event: Event) => void) | null = null;
let sessionStopHooked = false;
let asrBrainLogged = false;
let asrDriverLifecycleHooked = false;
let asrSessionIntentActive = false;
let asrRunCounter = 0;
let activeAsrRunKey = '';
let lastAsrBlockSyncAt = 0;
let lastAsrBlockSyncLogAt = 0;
let lastAsrSyncLogAtByType: Record<'block sync' | 'index sync', number> = {
  'block sync': 0,
  'index sync': 0,
};
let lastAsrSyncFingerprintByType: Record<'block sync' | 'index sync', string> = {
  'block sync': '',
  'index sync': '',
};

const ASR_LIVE_BLOCK_SYNC_THROTTLE_MS = 200;
const ASR_BLOCK_SYNC_LOG_THROTTLE_MS = 1000;
const ASR_SYNC_LOG_THROTTLE_MS = 750;
const ASR_BLOCK_SYNC_UNCHANGED_LOG_THROTTLE_MS = 1000;
let lastAsrBlockSyncCompleteFingerprint = '';
let lastAsrBlockSyncUnchangedAt = 0;

function logAsrBlockSyncSkip(mode: string, phase: string, reason: 'live-skip' | 'throttled', now: number): void {
  if (!isDevMode()) return;
  if (!shouldLogLevel(2)) return;
  if (!shouldLogTag(`ASR:block-sync-skip:${reason}:${mode}:${phase}`, 2, ASR_BLOCK_SYNC_LOG_THROTTLE_MS)) return;
  if (now - lastAsrBlockSyncLogAt < ASR_BLOCK_SYNC_LOG_THROTTLE_MS) return;
  lastAsrBlockSyncLogAt = now;
  const lastSyncAgeMs = lastAsrBlockSyncAt > 0 ? Math.max(0, now - lastAsrBlockSyncAt) : -1;
  try {
    console.debug('[ASR] block sync skipped', {
      mode,
      phase,
      reason,
      lastSyncAgeMs,
    });
  } catch {}
}

function isAsrLikeMode(mode: string | null | undefined): boolean {
  const normalized = String(mode || '').toLowerCase();
  return normalized === 'asr' || normalized === 'hybrid';
}

function canAttachAsrBackend(): boolean {
  try {
    if (isSpeechBackendAllowed()) return true;
  } catch {}
  try {
    if (window.__tpSpeechOrchestrator?.start) return true;
  } catch {}
  try {
    const ns = getTpSpeechNamespace();
    if (typeof ns?.startRecognizer === 'function') return true;
  } catch {}
  try {
    if (window.SpeechRecognition || window.webkitSpeechRecognition) return true;
  } catch {}
  return false;
}

function getAsrBlockSnapshot(): {
  ready: boolean;
  count: number;
  schemaVersion?: number;
  source?: string;
  scriptSig?: string;
} {
  let count = 0;
  let schemaVersion: number | undefined;
  let source: string | undefined;
  let scriptSig: string | undefined;
  try {
    const els = getAsrBlockElements();
    count = Array.isArray(els) ? els.length : 0;
  } catch {}
  try {
    const meta = getAsrBlockIndex() as any;
    if (Number.isFinite(Number(meta?.schemaVersion))) {
      schemaVersion = Number(meta.schemaVersion);
    }
    if (typeof meta?.source === 'string') {
      source = meta.source;
    }
    if (Array.isArray(meta?.units) && meta.units.length) {
      const units = meta.units as Array<{
        unitStart?: number;
        unitEnd?: number;
        sentenceCount?: number;
        charCount?: number;
      }>;
      const first = units[0] || {};
      const last = units[units.length - 1] || {};
      const sums = units.reduce(
        (acc, unit) => {
          const chars = Number(unit?.charCount);
          const sentences = Number(unit?.sentenceCount);
          if (Number.isFinite(chars)) acc.chars += Math.max(0, Math.floor(chars));
          if (Number.isFinite(sentences)) acc.sentences += Math.max(0, Math.floor(sentences));
          return acc;
        },
        { chars: 0, sentences: 0 },
      );
      scriptSig = [
        units.length,
        Number(first?.unitStart ?? -1),
        Number(first?.unitEnd ?? -1),
        Number(last?.unitStart ?? -1),
        Number(last?.unitEnd ?? -1),
        sums.sentences,
        sums.chars,
      ].join(':');
    }
  } catch {}
  try {
    const globalCount = Number((window as any).__tpAsrBlockCount);
    if (Number.isFinite(globalCount) && globalCount > count) {
      count = Math.floor(globalCount);
    }
  } catch {}
  const ready = count > 0 || (() => {
    try { return Boolean((window as any).__tpAsrBlocksReady); } catch { return false; }
  })();
  return { ready, count, schemaVersion, source, scriptSig };
}

function shouldCreateAsrDriver(mode: string, reason: string): boolean {
  const blocks = getAsrBlockSnapshot();
  const blocksReady = blocks.ready && blocks.count > 0;
  const backendReady = canAttachAsrBackend();
  const allowed = isAsrLikeMode(mode) && blocksReady && backendReady;
  if (!allowed && isDevMode()) {
    try {
      console.debug('[ASR] driver create blocked', {
        reason,
        mode,
        blocksReady,
        blockCount: blocks.count,
        backendReady,
      });
    } catch {}
  }
  return allowed;
}

function beginAsrRunKey(mode: string, reason?: string): string {
  if (activeAsrRunKey) return activeAsrRunKey;
  asrRunCounter += 1;
  activeAsrRunKey = `asr-${Date.now().toString(36)}-${asrRunCounter}-${String(mode || 'unknown').toLowerCase()}`;
  if (typeof window !== 'undefined') {
    try { window.__tpAsrRunKey = activeAsrRunKey; } catch {}
  }
  if (isDevMode() && shouldLogLevel(1)) {
    try { console.info('[ASR] run begin', { runKey: activeAsrRunKey, mode, reason }); } catch {}
  }
  return activeAsrRunKey;
}

function clearAsrRunKey(reason: string): void {
  if (!activeAsrRunKey) return;
  const endedRunKey = activeAsrRunKey;
  if (isDevMode() && shouldLogLevel(1)) {
    try { console.info('[ASR] run clear', { runKey: endedRunKey, reason }); } catch {}
  }
  activeAsrRunKey = '';
  if (typeof window !== 'undefined') {
    try { window.__tpAsrLastEndedRunKey = endedRunKey; } catch {}
    try { window.__tpAsrLastEndedRunAt = Date.now(); } catch {}
    try { window.__tpAsrRunKey = null; } catch {}
  }
}

function buildAsrSyncLogFingerprint(payload: Record<string, unknown>): string {
  const bool = (value: unknown) => (value ? '1' : '0');
  return [
    payload.reason ?? '',
    payload.interpretedAs ?? '',
    payload.blockIdx ?? 'na',
    payload.lineIdx ?? payload.idx ?? 'na',
    payload.sourceLine ?? 'na',
    payload.schemaVersion ?? 'na',
    bool(payload.clamped),
    bool(payload.cueAdjusted),
  ].join('|');
}

function logAsrSync(kind: 'block sync' | 'index sync', payload: Record<string, unknown>): void {
  if (!isDevMode()) return;
  if (!shouldLogLevel(2)) return;
  const now = Date.now();
  const fingerprint = buildAsrSyncLogFingerprint(payload);
  const prevFingerprint = lastAsrSyncFingerprintByType[kind];
  const prevAt = lastAsrSyncLogAtByType[kind];
  if (fingerprint === prevFingerprint && now - prevAt < ASR_SYNC_LOG_THROTTLE_MS) {
    return;
  }
  lastAsrSyncFingerprintByType[kind] = fingerprint;
  lastAsrSyncLogAtByType[kind] = now;
  try {
    console.debug(`[ASR] ${kind}`, payload);
  } catch {}
}

function buildAsrBlockSyncCompleteFingerprint(payload: {
  mode: string;
  markerIdx: number;
  blockCount: number;
  schemaVersion?: number;
  source?: string;
  scriptSig?: string;
}): string {
  return [
    payload.mode || '',
    Number.isFinite(payload.markerIdx) ? Math.floor(payload.markerIdx) : -1,
    Number.isFinite(payload.blockCount) ? Math.floor(payload.blockCount) : -1,
    Number.isFinite(Number(payload.schemaVersion)) ? Number(payload.schemaVersion) : -1,
    payload.source || '',
    payload.scriptSig || '',
  ].join('|');
}

function logAsrBlockSyncComplete(payload: {
  reason: string;
  mode: string;
  markerIdx: number;
  blockCount: number;
  schemaVersion?: number;
  source?: string;
  scriptSig?: string;
}): void {
  if (!isDevMode()) return;
  if (!shouldLogLevel(2)) return;
  const fingerprint = buildAsrBlockSyncCompleteFingerprint(payload);
  if (fingerprint === lastAsrBlockSyncCompleteFingerprint) {
    const now = Date.now();
    if (now - lastAsrBlockSyncUnchangedAt >= ASR_BLOCK_SYNC_UNCHANGED_LOG_THROTTLE_MS) {
      lastAsrBlockSyncUnchangedAt = now;
      try {
        console.debug('[ASR] block sync unchanged', {
          reason: payload.reason,
          mode: payload.mode,
          markerIdx: payload.markerIdx,
          blockCount: payload.blockCount,
          schemaVersion: payload.schemaVersion,
        });
      } catch {}
    }
    return;
  }
  lastAsrBlockSyncCompleteFingerprint = fingerprint;
  try {
    console.info('[ASR] block sync complete', payload);
  } catch {}
}

function ensureAsrScrollDriver(
  reason: string,
  opts?: { mode?: string; allowCreate?: boolean; runKey?: string },
): AsrScrollDriver | null {
  if (typeof window === 'undefined') return null;
  if (asrScrollDriver) return asrScrollDriver;
  if (opts?.allowCreate !== true) return null;
  const mode = String(opts?.mode || getScrollMode() || '').toLowerCase();
  if (!shouldCreateAsrDriver(mode, reason)) return null;
  const runKey = String(opts?.runKey || activeAsrRunKey || '').trim();
  asrScrollDriver = createAsrScrollDriver({ runKey: runKey || undefined });
  try { (window as any).__tpAsrScrollDriver = asrScrollDriver; } catch {}
  if (isDevMode() && shouldLogLevel(1)) {
    try { console.info('[ASR] driver created', { reason, mode, phase: getSession().phase, runKey: runKey || null }); } catch {}
  }
  emitHudSnapshot('driver-created', { force: true });
  return asrScrollDriver;
}

function syncAsrDriverFromBlocks(reason: string, opts?: { mode?: string; allowCreate?: boolean; runKey?: string }): void {
  const mode = String(opts?.mode || getScrollMode() || '').toLowerCase();
  const phase = String(getSession().phase || '').toLowerCase();
  const livePhase = phase === 'live';
  const asrLive = running && mode === 'asr' && livePhase;
  const now = Date.now();
  const driver =
    asrScrollDriver ||
    ensureAsrScrollDriver(`sync:${reason}`, {
      mode,
      allowCreate: opts?.allowCreate === true,
      runKey: opts?.runKey,
    });
  if (!driver) return;
  if (livePhase && mode !== 'asr') {
    logAsrBlockSyncSkip(mode, phase, 'live-skip', now);
    return;
  }
  if (asrLive && now - lastAsrBlockSyncAt < ASR_LIVE_BLOCK_SYNC_THROTTLE_MS) {
    logAsrBlockSyncSkip(mode, phase, 'throttled', now);
    return;
  }
  const blocks = getAsrBlockSnapshot();
  if (!blocks.ready || blocks.count <= 0) {
    if (
      isDevMode()
      && shouldLogLevel(2)
      && shouldLogTag(`ASR:block-sync-not-ready:${mode}:${phase}`, 2, ASR_BLOCK_SYNC_LOG_THROTTLE_MS)
    ) {
      try { console.debug('[ASR] block sync skipped (not ready)', { reason, mode, blocks }); } catch {}
    }
    return;
  }
  try {
    (window as any).__tpAsrBlocksReady = true;
    (window as any).__tpAsrBlockCount = blocks.count;
  } catch {}
  const markerIdx = computeMarkerLineIndex();
  if (asrLive) {
    lastAsrBlockSyncAt = now;
    if (isDevMode()) {
      logAsrBlockSyncComplete({
        reason,
        mode,
        markerIdx,
        blockCount: blocks.count,
        schemaVersion: blocks.schemaVersion,
        source: blocks.source,
        scriptSig: blocks.scriptSig,
      });
      if (shouldLogLevel(2) && shouldLogTag('ASR:live-block-sync:suppressed', 2, ASR_BLOCK_SYNC_LOG_THROTTLE_MS)) {
        try {
          console.debug('[ASR] live block sync suppressed', {
            reason,
            mode,
            phase,
            markerIdx,
            blockCount: blocks.count,
            schemaVersion: blocks.schemaVersion,
          });
        } catch {}
      }
    }
    emitHudSnapshot(`block-sync:${reason}`);
    return;
  }
  syncAsrIndices(markerIdx, `blocks:${reason}`);
  if (asrLive) {
    lastAsrBlockSyncAt = now;
  }
  if (isDevMode()) {
    logAsrBlockSyncComplete({
      reason,
      mode,
      markerIdx,
      blockCount: blocks.count,
      schemaVersion: blocks.schemaVersion,
      source: blocks.source,
      scriptSig: blocks.scriptSig,
    });
  }
  emitHudSnapshot(`block-sync:${reason}`);
}

function pushAsrTranscript(text: string, isFinal: boolean, detail?: any): void {
  const t = String(text || '').trim();
  if (!t) return;
  const ingestAt = Date.now();
  lastAsrIngestTs = Math.max(lastAsrIngestTs, ingestAt);
  const payload = {
    text: t,
    isFinal: !!isFinal,
    source: detail?.source,
  };
  if (isDevMode() && shouldLogTag('ASR:ingest', 2, 250)) {
    console.log('[ASR] ingest', {
      isFinal: payload.isFinal,
      text: payload.text?.slice(0, 60),
      source: payload.source,
    });
  }
  const mode = String(detail?.mode || getScrollMode() || '').toLowerCase();
  attachAsrScrollDriver({ reason: 'transcript', mode, allowCreate: true });
  bootTrace('ASR:ingest', {
    raw: t,
    normalized: normalizeComparableText(t),
  });
  try { asrScrollDriver?.ingest(t, !!isFinal, detail); } catch {}
  syncAsrDriverStats(asrScrollDriver);
}

function attachAsrScrollDriver(opts?: { reason?: string; mode?: string; allowCreate?: boolean; runKey?: string }): void {
  if (typeof window === 'undefined') return;
  const mode = String(opts?.mode || getScrollMode() || '').toLowerCase();
  bootTrace('speech-loader:attach-asr-driver:start', {
    reason: opts?.reason || 'attach',
    mode,
    allowCreate: opts?.allowCreate === true,
    runKey: opts?.runKey || null,
  });
  ensureAsrScrollDriver(opts?.reason || 'attach', {
    mode,
    allowCreate: opts?.allowCreate === true,
    runKey: opts?.runKey,
  });
  if (transcriptListener) {
    bootTrace('speech-loader:attach-asr-driver:done', {
      reason: opts?.reason || 'attach',
      mode,
      listener: 'existing',
    });
    return;
  }
  transcriptListener = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    if ((detail as any).__tpDirectIngest === true) return;
    const detectedMode = typeof detail.mode === 'string' ? detail.mode.toLowerCase() : '';
    const rawMode = (detectedMode || getScrollMode() || '').toLowerCase();
    const effectiveMode = rawMode === 'manual' ? 'step' : rawMode;
    if (effectiveMode !== 'hybrid' && effectiveMode !== 'asr') {
      return;
    }
    const text = typeof detail.text === 'string' ? detail.text : '';
    if (!text) return;
    const isFinal = Boolean(detail.isFinal ?? detail.final);
    const payload = enrichTranscriptPayloadForAsr({
      ...(detail as Partial<TranscriptPayload>),
      text,
      final: Boolean(detail.final ?? isFinal),
      isFinal,
      timestamp: typeof detail.timestamp === 'number' ? detail.timestamp : performance.now(),
      source: typeof detail.source === 'string' ? detail.source : 'speech-loader',
      mode: typeof detail.mode === 'string' ? detail.mode : effectiveMode,
    } as TranscriptPayload);
    pushAsrTranscript(text, isFinal, payload as any);
  };
  window.addEventListener('tp:speech:transcript', transcriptListener, TRANSCRIPT_EVENT_OPTIONS);
  bootTrace('speech-loader:attach-asr-driver:done', {
    reason: opts?.reason || 'attach',
    mode,
    listener: 'new',
  });
}

function ensureAsrDriverLifecycleHooks(): void {
  if (asrDriverLifecycleHooked || typeof window === 'undefined') return;
  asrDriverLifecycleHooked = true;
  const onSessionIntent = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    asrSessionIntentActive = Boolean(detail.active);
    const mode = String(detail.mode || getScrollMode() || '').toLowerCase();
    if (asrSessionIntentActive && isAsrLikeMode(mode)) {
      attachAsrScrollDriver({ reason: 'session-intent', mode, allowCreate: true });
      syncAsrDriverFromBlocks('session-intent', { mode, allowCreate: true });
      return;
    }
    if (!asrSessionIntentActive && !running) {
      detachAsrScrollDriver();
    }
    emitHudSnapshot('session-intent');
  };
  const onScrollMode = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    const mode = String(detail.mode || detail.nextMode || getScrollMode() || '').toLowerCase();
    if (isAsrLikeMode(mode)) {
      attachAsrScrollDriver({ reason: 'scroll-mode', mode, allowCreate: true });
      syncAsrDriverFromBlocks('scroll-mode', { mode, allowCreate: true });
      return;
    }
    if (!running) {
      detachAsrScrollDriver();
    }
    emitHudSnapshot('scroll-mode');
  };
  const onSessionStart = () => {
    const session = getSession();
    const mode = getScrollMode();
    asrSessionIntentActive = true;
    if (session.asrDesired || isAsrLikeMode(mode)) {
      attachAsrScrollDriver({ reason: 'session-start', mode, allowCreate: true });
      syncAsrDriverFromBlocks('session-start', { mode, allowCreate: true });
    }
    emitHudSnapshot('session-start', { force: true });
  };
  const onBlocksReady = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    const mode = String(getScrollMode() || '').toLowerCase();
    if (detail && typeof detail.blockCount === 'number') {
      try { (window as any).__tpAsrBlockCount = Math.max(0, Math.floor(detail.blockCount)); } catch {}
      try { (window as any).__tpAsrBlocksReady = true; } catch {}
    }
    syncAsrDriverFromBlocks('blocks-ready', { mode, allowCreate: true });
  };
  const onScriptRendered = () => {
    const mode = String(getScrollMode() || '').toLowerCase();
    const session = getSession();
    const wantsAsrDriver = isAsrLikeMode(mode) || session.asrDesired || !!asrScrollDriver;
    if (!wantsAsrDriver) return;
    try {
      window.requestAnimationFrame?.(() => {
        syncAsrDriverFromBlocks('script-rendered', { mode, allowCreate: true });
      });
    } catch {
      syncAsrDriverFromBlocks('script-rendered', { mode, allowCreate: true });
    }
  };
  const onSessionStop = () => {
    asrSessionIntentActive = false;
    resetAsrInterimStabilizer();
    clearAsrRunKey('lifecycle-session-stop');
    emitHudSnapshot('session-stop', { force: true });
  };
  const onSessionPhase = (event: Event) => {
    const phase = String((event as CustomEvent)?.detail?.phase || '').toLowerCase();
    if (phase === 'idle' || phase === 'wrap') {
      asrSessionIntentActive = false;
      resetAsrInterimStabilizer();
      clearAsrRunKey(`phase-${phase}`);
    }
    emitHudSnapshot(`session-phase:${phase || 'unknown'}`);
  };
  const onSpeechHardReset = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    const reason = String(detail.reason || detail.source || 'script-reset');
    hardResetSpeechEngine(reason);
  };
  const onScriptReset = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    const source = String(detail.source || 'script-reset');
    hardResetSpeechEngine(source);
  };
  window.addEventListener('tp:session:intent', onSessionIntent, TRANSCRIPT_EVENT_OPTIONS);
  document.addEventListener('tp:session:intent', onSessionIntent as EventListener, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:scroll:mode', onScrollMode, TRANSCRIPT_EVENT_OPTIONS);
  document.addEventListener('tp:scroll:mode', onScrollMode as EventListener, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:session:start', onSessionStart, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:session:stop', onSessionStop, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:session:phase', onSessionPhase, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:speech:hard-reset', onSpeechHardReset, TRANSCRIPT_EVENT_OPTIONS);
  document.addEventListener('tp:speech:hard-reset', onSpeechHardReset as EventListener, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:script:reset', onScriptReset, TRANSCRIPT_EVENT_OPTIONS);
  document.addEventListener('tp:script:reset', onScriptReset as EventListener, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:asr:blocks-ready', onBlocksReady, TRANSCRIPT_EVENT_OPTIONS);
  document.addEventListener('tp:asr:blocks-ready', onBlocksReady as EventListener, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:script-rendered', onScriptRendered, TRANSCRIPT_EVENT_OPTIONS);
  document.addEventListener('tp:script-rendered', onScriptRendered as EventListener, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:render:done', onScriptRendered, TRANSCRIPT_EVENT_OPTIONS);
  document.addEventListener('tp:render:done', onScriptRendered as EventListener, TRANSCRIPT_EVENT_OPTIONS);
  const initialMode = String(getScrollMode() || '').toLowerCase();
  const session = getSession();
  if (isAsrLikeMode(initialMode) || session.asrDesired) {
    attachAsrScrollDriver({ reason: 'bootstrap', mode: initialMode, allowCreate: true });
    syncAsrDriverFromBlocks('bootstrap', { mode: initialMode, allowCreate: true });
  }
  emitHudSnapshot('lifecycle-hooks-bootstrap', { force: true });
}

function detachAsrScrollDriver(): void {
  if (typeof window !== 'undefined' && transcriptListener) {
    window.removeEventListener('tp:speech:transcript', transcriptListener, TRANSCRIPT_EVENT_OPTIONS);
  }
  transcriptListener = null;
  if (asrScrollDriver) {
    asrScrollDriver.dispose();
    asrScrollDriver = null;
    try { (window as any).__tpAsrScrollDriver = null; } catch {}
  }
  emitHudSnapshot('driver-detach', { force: true });
}

function ensureSessionStopHooked(): void {
  if (sessionStopHooked) return;
  sessionStopHooked = true;
  if (typeof window === 'undefined') return;
  window.addEventListener('tp:session:stop', (event) => {
    asrSessionIntentActive = false;
    resetAsrInterimStabilizer();
    clearAsrRunKey('session-stop-hook');
    detachAsrScrollDriver();
    const detail = (event as CustomEvent)?.detail || {};
    const mode = typeof detail.mode === 'string' && detail.mode
      ? detail.mode
      : lastScrollMode || getScrollMode();
    autoSaveSpeakerPatchesAfterStop(mode);
    if (isDevMode()) {
      maybePromptSaveSpeakerProfiles(mode);
    }
    clearSessionLearnedPatches();
  }, TRANSCRIPT_EVENT_OPTIONS);
}

try {
  ensureSessionStopHooked();
} catch {
  // ignore
}

try {
  attachSummaryListener();
} catch {}

type WebSpeechLifecycleOptions = {
  onResult?: (event: any) => void;
  onError?: (event: Event) => void;
};

function attachWebSpeechLifecycle(sr: SpeechRecognition, opts: WebSpeechLifecycleOptions = {}): void {
  if (!sr) return;
  sr.onstart = (event: Event) => {
    setSpeechRunningActual(true, 'onstart');
    markWebSpeechLifecycle('onstart', event);
  };
  sr.onaudiostart = (event: Event) => {
    setSpeechRunningActual(true, 'onaudiostart');
    markWebSpeechLifecycle('onaudiostart', event);
  };
  sr.onspeechstart = (event: Event) => {
    markWebSpeechLifecycle('onspeechstart', event);
  };
  sr.onresult = (event: any) => {
    const resultCount = Number(event?.results?.length || 0);
    markWebSpeechLifecycle('onresult', event as Event, {
      resultCount,
      resultIndex: Number(event?.resultIndex || 0),
    });
    try { opts.onResult?.(event); } catch {}
  };
  sr.onspeechend = (event: Event) => {
    markWebSpeechLifecycle('onspeechend', event);
  };
  sr.onaudioend = (event: Event) => {
    setSpeechRunningActual(false, 'onaudioend');
    markWebSpeechLifecycle('onaudioend', event);
    if (shouldAutoRestartSpeech()) {
      scheduleRecognizerLifecycleRestart('onaudioend', { abortFirst: false });
    } else {
      emitAsrState('idle', 'recognition-audioend');
    }
  };
  sr.onend = (event: Event) => {
    setSpeechRunningActual(false, 'onend');
    markWebSpeechLifecycle('onend', event, {
      pendingManualRestartCount,
    });
    if (pendingManualRestartCount > 0) {
      pendingManualRestartCount = Math.max(pendingManualRestartCount - 1, 0);
      return;
    }
    if (shouldAutoRestartSpeech()) {
      scheduleRecognizerLifecycleRestart('onend', { abortFirst: false });
    } else {
      emitAsrState('idle', 'recognition-end');
    }
  };
  sr.onerror = (event: Event) => {
    const code = String((event as any)?.error || '').toLowerCase() || 'error';
    setSpeechRunningActual(false, 'onerror');
    markWebSpeechLifecycle('onerror', event, { code });
    try { opts.onError?.(event); } catch {}
    if (isRestartableWebSpeechError(event) && shouldAutoRestartSpeech()) {
      scheduleRecognizerLifecycleRestart('onerror', { abortFirst: false });
      return;
    }
    emitAsrState('idle', `recognition-error:${code}`);
  };
}

async function startBackendForSession(mode: string, reason?: string): Promise<boolean> {
  const speechNs = getTpSpeechNamespace();
  const speechStoreState = getTpSpeechStoreSnapshot();
  if (isSettingsHydrating()) {
    try { console.debug('[ASR] startBackend blocked during settings hydration', { mode, reason }); } catch {}
    return false;
  }
  if (isDevMode()) {
    if (shouldLogLevel(2)) {
      const w = typeof window !== 'undefined' ? (window as any) : null;
      const info = {
        mode,
        reason,
        hasOrchestrator: !!w?.__tpSpeechOrchestrator?.start,
        hasRecognizerStart: typeof speechNs?.startRecognizer === 'function',
        hasWebSpeech: !!(w?.SpeechRecognition || w?.webkitSpeechRecognition),
        sessionPhase: (speechStoreState as any)?.sessionPhase,
        scrollMode: (speechStoreState as any)?.scrollMode,
        speechRunning: (speechStoreState as any)?.speechRunning,
      };
      try { console.log('[ASR] lifecycle startBackend: invoking backend', info); } catch {}
    }
  }

  try {
    if (window.__tpSpeechOrchestrator?.start) {
      const started = await window.__tpSpeechOrchestrator.start();
      rec = (started || null) as RecognizerLike | null;
      if (rec && typeof rec.on === 'function') {
        try { rec.on('final', (t: any) => routeRecognizerTranscript(t, true)); } catch {}
        try { rec.on('partial', (t: any) => routeRecognizerTranscript(t, false)); } catch {}
      }
      try { window.__tpEmitSpeech = (t: unknown, final?: boolean) => routeRecognizerTranscript(t, !!final); } catch {}
      if (rec && typeof rec.start === 'function') {
        setActiveRecognizer(rec);
      }
      setSpeechRunningActual(true, 'orchestrator-start');
      return true;
    }
  } catch {}

  try {
    const startRecognizer = speechNs?.startRecognizer;
    if (typeof startRecognizer === 'function') {
      startRecognizer(() => {}, { lang: 'en-US' });
      rec = {
        stop: () => { try { speechNs?.stopRecognizer?.(); } catch {} },
        abort: () => { try { speechNs?.stopRecognizer?.(); } catch {} },
      };
      setSpeechRunningActual(true, 'namespace-start');
      return true;
    }
  } catch {}

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new Error('NoSpeechBackend');
  const sr = new SR();
  sr.interimResults = true;
  sr.continuous = true;
  let _lastInterimAt = 0;
  attachWebSpeechLifecycle(sr, {
    onResult: (e: any) => {
      try {
        let interim = '', finals = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finals += res[0].transcript;
          else interim += res[0].transcript;
        }
        if (finals) routeTranscript(finals, true);
        const now = performance.now();
        if (interim && (now - _lastInterimAt) > 120) {
          _lastInterimAt = now;
          routeTranscript(interim, false);
        }
      } catch {}
    },
    onError: (e: Event) => { try { console.warn('[speech] error', e); } catch {} },
  });
  setActiveRecognizer(sr);
  try { sr.start(); } catch {}
  rec = { stop: () => { try { sr.stop(); } catch {} } };
  try { window.__tpEmitSpeech = (t: unknown, final?: boolean) => routeRecognizerTranscript(t, !!final); } catch {}
  return true;
}

export async function startSpeechBackendForSession(info?: { reason?: string; mode?: string }): Promise<boolean> {
  const mode = (info?.mode || getScrollMode()).toLowerCase();
  bootTrace('speech-loader:live-path:enter', {
    reason: info?.reason || null,
    mode,
  });
  const wantsSpeech = mode === 'asr' || mode === 'hybrid';
  if (!wantsSpeech) {
    bootTrace('speech-loader:live-path:skip', { reason: 'mode-not-speech', mode });
    return false;
  }
  ensureAsrDriverLifecycleHooks();
  if (isSettingsHydrating()) {
    if (shouldLogLevel(2)) {
      try { console.debug('[ASR] startSpeech blocked during settings hydration', { mode, reason: info?.reason }); } catch {}
    }
    bootTrace('speech-loader:live-path:skip', { reason: 'settings-hydrating', mode });
    return false;
  }
  if (running) {
    bootTrace('speech-loader:live-path:skip', { reason: 'already-running', mode });
    return true;
  }

  try {
    const layoutReady = await waitForAsrLayoutReady(info?.reason);
    if (!layoutReady) {
      bootTrace('speech-loader:live-path:skip', { reason: 'layout-not-ready', mode });
      return false;
    }
    if (running) {
      bootTrace('speech-loader:live-path:skip', { reason: 'running-after-layout', mode });
      return true;
    }
    const runKey = beginAsrRunKey(mode, info?.reason);

    attachAsrScrollDriver({ reason: 'session-start', mode, allowCreate: true, runKey });
    syncAsrDriverFromBlocks(info?.reason || 'session-start', { mode, allowCreate: true, runKey });
    const startIdx = computeMarkerLineIndex();
    syncAsrIndices(startIdx, 'session-start');
    if (!asrBrainLogged) {
      asrBrainLogged = true;
      try {
        const session = getSession();
        const scroller =
          getRuntimeScroller() ||
          resolveActiveScroller(
            getPrimaryScroller(),
            getScriptRoot() || getScrollerEl('main') || getScrollerEl('display'),
          );
        console.warn('ASR_BRAIN_READY', {
          asrDesired: session.asrDesired,
          asrArmed: session.asrArmed,
          brain: !!asrScrollDriver,
          mode,
          scrollerId: describeElement(scroller),
        });
      } catch {}
    }
    try {
      const currentIdx = Number((window as any).currentIndex ?? startIdx);
      const viewer = getPrimaryScroller();
      const root = getScriptRoot() || viewer;
      const scroller =
        getRuntimeScroller() ||
        resolveActiveScroller(viewer, root || getScrollerEl('main') || getScrollerEl('display'));
      const scrollerTop = scroller?.scrollTop ?? 0;
      const firstLine = (root || viewer || document).querySelector<HTMLElement>('.line');
      const firstLineHeight = firstLine?.offsetHeight || firstLine?.clientHeight || 0;
      const topEpsilon = Math.max(24, firstLineHeight * 0.5);
      const markerSnap = getLineSnapshot(startIdx);
      const currentSnap = getLineSnapshot(currentIdx);
      try {
        console.warn('ASR_START_STATE', {
          anchorIndex: startIdx,
          cursorLine: currentIdx,
          scrollTop: Math.round(scrollerTop),
          scroller: describeElement(scroller),
          topEps: Math.round(topEpsilon),
        });
      } catch {}
      const anchorLine = [
        'ASR_ANCHOR',
        `current=${currentIdx}`,
        `marker=${startIdx}`,
        `scroller=${describeElement(scroller)}`,
        `scrollTop=${Math.round(scrollerTop)}`,
        `topEps=${Math.round(topEpsilon)}`,
        markerSnap?.snippet ? `markerText="${markerSnap.snippet}"` : '',
        currentSnap?.snippet ? `currentText="${currentSnap.snippet}"` : '',
        `snapScrollTop=${Math.round(currentSnap?.scrollTop ?? 0)}`,
        `lineH=${currentSnap?.lineHeight ?? 0}`,
      ].filter(Boolean).join(' ');
      console.warn(anchorLine);
    } catch {}
    suppressRecognizerAutoRestart = false;
    lastRecognizerOnResultTs = 0;
    lastAsrIngestTs = 0;
    lastAsrCommitTs = 0;
    lastAsrCommitCount = 0;
    lastRecognizerLifecycleEvent = '';
    lastRecognizerLifecycleAt = 0;
    setSpeechRunningActual(false, 'session-start');
    clearLifecycleRestartTimer();
    startAsrHeartbeat();
    running = true;
    rememberMode(mode);
    try { document.body.classList.add('listening'); } catch {}
    try { window.HUD?.bus?.emit?.('speech:toggle', true); } catch {}
    try { window.speechOn = true; } catch {}
    setListeningUi(true);
    try { window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running: true } })); } catch {}
    emitHudSnapshot('speech-running:true', { force: true });

    if (shouldLogLevel(2)) {
      try {
        console.debug('[ASR] willStartRecognizer', {
          phase: 'session-live',
          mode,
          hasSR: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
        });
      } catch {}
    }

    try {
      const ok = await startBackendForSession(mode, info?.reason);
      if (shouldLogLevel(2)) {
        try { console.debug('[ASR] didCallStartRecognizer', { ok }); } catch {}
      }
      try { await window.__tpMic?.requestMic?.(); } catch {}
      bootTrace('speech-loader:live-path:done', { mode, ok, runKey });
      return ok;
    } catch {
      running = false;
      setActiveRecognizer(null);
      setSpeechRunningActual(false, 'start-failed');
      setListeningUi(false);
      setReadyUi();
      clearAsrRunKey('start-failed');
      emitHudSnapshot('speech-start-failed', { force: true });
      bootTrace('speech-loader:live-path:error', { mode, reason: info?.reason || null, runKey });
      return false;
    }
  } finally {
    // no-op
  }
}

export function stopSpeechBackendForSession(reason?: string): void {
  suppressRecognizerAutoRestart = true;
  clearLifecycleRestartTimer();
  asrSessionIntentActive = false;
  resetAsrInterimStabilizer();
  clearAsrRunKey(`stop:${String(reason || 'unspecified')}`);
  if (!running && !rec) {
    setSpeechRunningActual(false, 'stop-idle');
    detachAsrScrollDriver();
    emitAsrHeartbeat(`stop:${String(reason || 'unspecified')}`, { force: true });
    return;
  }
  running = false;
  detachAsrScrollDriver();
  asrBrainLogged = false;
  try { stopAsrRuntime(); } catch {}
  try { window.__tpMic?.releaseMic?.(); } catch {}
  try { rec?.abort?.(); } catch {}
  try { rec?.stop?.(); } catch {}
  try { stopAndAbortRecognizer((window as any).__tpRecognizer); } catch {}
  try { stopAndAbortRecognizer((window as any).recog); } catch {}
  try { getTpSpeechNamespace()?.stopRecognizer?.(); } catch {}
  setActiveRecognizer(null);
  rec = null;
  setSpeechRunningActual(false, 'stop');
  try { document.body.classList.remove('listening'); } catch {}
  try { window.HUD?.bus?.emit?.('speech:toggle', false); } catch {}
  try { window.speechOn = false; } catch {}
  setListeningUi(false);
  setReadyUi();
  try { window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running: false, reason } })); } catch {}
  emitHudSnapshot('speech-running:false', { force: true });
  emitAsrHeartbeat(`stop:${String(reason || 'unspecified')}`, { force: true });
}

export function installSpeech(): void {
  ensureAsrDriverLifecycleHooks();
  startAsrHeartbeat();
  emitHudSnapshot('installSpeech:init', { force: true });
  installAsrHudDev();
  
  // Session-first: recBtn only starts preroll/session
  (async () => {
    try {
      const btn = document.getElementById('recBtn') as HTMLButtonElement | null;
      if (!btn || (btn as any).__sessionWired) return;
      (btn as any).__sessionWired = true;
      setReadyUi();
      const syncBtnUi = (phase?: string) => {
        try {
          const p = (phase || '').toLowerCase();
          const isRunning = p === 'preroll' || p === 'live';
          btn.textContent = isRunning ? 'Stop' : 'Start speech sync';
          btn.title = isRunning ? 'Stop speech sync' : 'Start speech sync';
        } catch {}
      };
      try {
        window.addEventListener('tp:session:phase', (ev: Event) => {
          const phase = (ev as CustomEvent)?.detail?.phase || '';
          syncBtnUi(String(phase));
        });
      } catch {}
      btn.addEventListener(
        'click',
        () => {
          const session = getSession();
          if (session.phase === 'preroll' || session.phase === 'live') {
            const mode = getScrollMode();
            const needsSpeech = mode === 'asr' || mode === 'hybrid';
            if (needsSpeech && !running) {
              try {
                console.warn('[session/stop] ignoring stop click because speech backend never ran', {
                  mode,
                  phase: session.phase,
                });
              } catch {}
              return;
            }
            try { console.debug('[session/stop] click in phase=', session.phase); } catch {}
            const stopIntent = { source: 'recBtn', phase: session.phase, reason: 'user' };
            dispatchSessionIntent(false, stopIntent);
            try { setSessionPhase('wrap'); } catch {}
            try {
              window.dispatchEvent(
                new CustomEvent('tp:session:stop', {
                  detail: { ...stopIntent, intentSource: 'session-intent' },
                }),
              );
            } catch {}
            return;
          }
          try { console.debug('[session/start] phase', session.phase, '→ preroll'); } catch {}
          const mode = getScrollMode();
          armAsrForSessionStart(mode, 'recBtn');
          const startIntent = { source: 'recBtn', reason: 'user', mode };
          try { setSessionPhase('preroll'); } catch {}
          try {
            window.dispatchEvent(
              new CustomEvent('tp:session:start', {
                detail: { ...startIntent, intentSource: 'session-intent' },
              }),
            );
          } catch {}
          dispatchSessionIntent(true, startIntent);
          syncBtnUi('preroll');
        },
        { capture: true },
      );
    } catch {}
  })();
}
async function _maybeStartRecorders(): Promise<void> {
  // recording/session-managed; placeholder to preserve API
  return;
}
