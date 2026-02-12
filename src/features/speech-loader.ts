import { getSession, setSessionPhase } from '../state/session';
import { completePrerollSession } from './preroll-session';
import type { AppStore } from '../state/app-store';
import { stopAsrRuntime } from '../speech/runtime-control';
import { createAsrScrollDriver, type AsrScrollDriver } from '../features/asr/asr-scroll-driver';
import { getAsrBlockElements, getAsrBlockIndex } from '../scroll/asr-block-store';
import {
  describeElement,
  getFallbackScroller,
  getPrimaryScroller,
  getScriptRoot,
  resolveActiveScroller,
} from '../scroll/scroller';
import { bootTrace } from '../boot/boot-trace';
import { maybePromptSaveSpeakerProfiles } from '../ui/save-speaker-profiles-prompt';
import {
  getSessionLearnedPatches,
  clearSessionLearnedPatches,
} from '../asr/asr-threshold-store';
import {
  applyProfileToSlot,
  createProfile,
  getActiveSpeakerSlot,
  getProfile,
  getSpeakerBindings,
  setProfileAsrTweaks,
} from '../ui/speaker-profiles-store';
import { DEFAULT_ASR_THRESHOLDS, clamp01 } from '../asr/asr-thresholds';
import type { SpeakerSlot } from '../types/speaker-profiles';
import { ensureSpeechGlobals, isSpeechBackendAllowed } from '../speech/backend-guard';

ensureSpeechGlobals();

type AnyFn = (...args: any[]) => any;

type RecognizerLike = {
  start?: AnyFn;
  stop?: AnyFn;
  abort?: AnyFn;
  on?: AnyFn;
  onend?: ((ev: Event) => void) | null;
  onerror?: ((ev: Event) => void) | null;
};

type SpeechRecognition = {
  start: AnyFn;
  stop: AnyFn;
  abort?: AnyFn;
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
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
    SpeechRecognition?: { new (): SpeechRecognition };
    webkitSpeechRecognition?: { new (): SpeechRecognition };
    getAutoRecordEnabled?: () => boolean;
    recAutoRestart?: unknown;
    speechOn?: boolean;
    enumerateDevices?: () => Promise<MediaDeviceInfo[]>;
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
let speechWatchdogTimer: number | null = null;
let activeRecognizer: RecognizerLike | null = null;
let pendingManualRestartCount = 0;

const WATCHDOG_INTERVAL_MS = 5000;
const WATCHDOG_THRESHOLD_MS = 15000;
const ASR_WATCHDOG_THRESHOLD_MS = 4000;

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
  try {
    console.info('[ASR] armed for session start', { source, mode: normalizedMode });
  } catch {}
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
  if (activeRecognizer) {
    markResultTimestamp();
    startSpeechWatchdog();
  } else {
    stopSpeechWatchdog();
  }
}

function requestRecognizerRestart(reasonTag?: string): boolean {
  if (!activeRecognizer || typeof activeRecognizer.start !== 'function') return false;
  pendingManualRestartCount += 1;
  markResultTimestamp();
  try { activeRecognizer.abort?.(); } catch {}
  try {
    activeRecognizer.start();
    try { window.debug?.({ tag: 'speech:watchdog:restart', reason: reasonTag || 'watchdog', hasRecognizer: true }); } catch {}
    try { console.log('[speech] watchdog: restarted recognition'); } catch {}
    return true;
  } catch (err) {
    pendingManualRestartCount = Math.max(pendingManualRestartCount - 1, 0);
    try { console.warn('[speech] watchdog: restart failed', err); } catch {}
    return false;
  }
}

try {
  window.__tpGetActiveRecognizer = () => activeRecognizer;
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
  attachWebSpeechLifecycle(r);
  setActiveRecognizer(r);
  r.onresult = (_e: any) => {
    // TODO: hook into your scroll matcher if desired
    // const last = e.results[e.results.length-1]?.[0]?.transcript;
    // console.log('[speech] text:', last);
  };
  r.onerror = (e: Event) => { try { console.warn('[speech] error', e); } catch {} };
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
  try { window.__tpBus?.emit?.('tp:asr:state', { state, reason }); } catch {}
}

function shouldAutoRestartSpeech(): boolean {
  const mode = lastScrollMode || getScrollMode();
  rememberMode(mode);
  return running && (mode === 'asr' || mode === 'hybrid') && isAutoRestartEnabled();
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

    const readStore = () => {
      const ns = w.__tpSpeech;
      const store = ns?.store;
      const getState = store?.getState || store?.get;
      return typeof getState === 'function' ? getState.call(store) : null;
    };

    window.setInterval(() => {
      const s = readStore() || {};
      const d = w.__tpAsrScrollDriver;
      el.textContent =
`ASR HUD
href: ${location.pathname}${location.search}${location.hash}
scrollMode: ${s.scrollMode ?? s.mode ?? '?'}
sessionPhase: ${s.sessionPhase ?? s.phase ?? '?'}
speechRunning: ${s.speechRunning ?? s.running ?? '?'}
asrDesired: ${s.asrDesired ?? '?'}
asrArmed: ${s.asrArmed ?? '?'}

driver: ${d ? 'YES' : 'NO'}
driverId: ${d?._instanceId ?? '-'}
lastLineIndex: ${typeof d?.getLastLineIndex === 'function' ? d.getLastLineIndex() : '-'}
`;
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
  return Math.max(0.55, Math.min(0.85, clamp01(value)));
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
    const scroller = resolveActiveScroller(viewer, root || getFallbackScroller());
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

function syncAsrIndices(startIdx: number, reason: string): void {
  const viewer = getPrimaryScroller();
  const root = getScriptRoot() || viewer;
  const scroller = resolveActiveScroller(viewer, root || getFallbackScroller());
  const scrollTop = scroller?.scrollTop ?? 0;
  const lineEl = (root || viewer || document).querySelector<HTMLElement>('.line');
  const lineHeight = lineEl?.offsetHeight || lineEl?.clientHeight || 0;
  const topEpsilon = Math.max(24, lineHeight * 0.5);
  const clamped = scrollTop <= topEpsilon;
  const idx = clamped ? 0 : Math.max(0, Math.floor(Number(startIdx) || 0));
  try { (window as any).currentIndex = idx; } catch {}
  try { asrScrollDriver?.setLastLineIndex?.(idx); } catch {}
  try { console.debug('[ASR] index sync', { idx, reason, clamped, scrollTop, topEpsilon }); } catch {}
}

const TRANSCRIPT_EVENT_OPTIONS: AddEventListenerOptions = { capture: true };
let asrScrollDriver: AsrScrollDriver | null = null;
let transcriptListener: ((event: Event) => void) | null = null;
let sessionStopHooked = false;
let asrBrainLogged = false;
let asrDriverLifecycleHooked = false;
let asrSessionIntentActive = false;
let speechStartInFlight = false;
let asrRunCounter = 0;
let activeAsrRunKey = '';
let lastAsrBlockSyncAt = 0;
let lastAsrBlockSyncLogAt = 0;

const ASR_LIVE_BLOCK_SYNC_THROTTLE_MS = 200;
const ASR_BLOCK_SYNC_LOG_THROTTLE_MS = 1000;

function logAsrBlockSyncSkip(mode: string, phase: string, reason: 'live-skip' | 'throttled', now: number): void {
  if (!isDevMode()) return;
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

function isAsrDriverArmed(): boolean {
  try {
    return !!getSession().asrArmed;
  } catch {
    return false;
  }
}

function getAsrBlockSnapshot(): { ready: boolean; count: number; schemaVersion?: number; source?: string } {
  let count = 0;
  let schemaVersion: number | undefined;
  let source: string | undefined;
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
  return { ready, count, schemaVersion, source };
}

function shouldCreateAsrDriver(mode: string, reason: string): boolean {
  const session = getSession();
  const phase = String(session.phase || '').toLowerCase();
  const phaseActive = phase === 'preroll' || phase === 'live';
  const speechActive = running || speechStartInFlight;
  const asrArmed = !!session.asrArmed;
  const allowed = isAsrLikeMode(mode) && asrArmed && (phaseActive || asrSessionIntentActive) && speechActive;
  if (!allowed && isDevMode()) {
    try {
      console.debug('[ASR] driver create blocked', {
        reason,
        mode,
        asrArmed,
        phase,
        phaseActive,
        sessionIntentActive: asrSessionIntentActive,
        running,
        speechStartInFlight,
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
  if (isDevMode()) {
    try { console.info('[ASR] run begin', { runKey: activeAsrRunKey, mode, reason }); } catch {}
  }
  return activeAsrRunKey;
}

function clearAsrRunKey(reason: string): void {
  if (!activeAsrRunKey) return;
  if (isDevMode()) {
    try { console.info('[ASR] run clear', { runKey: activeAsrRunKey, reason }); } catch {}
  }
  activeAsrRunKey = '';
  if (typeof window !== 'undefined') {
    try { window.__tpAsrRunKey = null; } catch {}
  }
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
  try { console.info('[ASR] driver created', { reason, mode, phase: getSession().phase, runKey: runKey || null }); } catch {}
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
    if (isDevMode()) {
      try { console.debug('[ASR] block sync skipped (not ready)', { reason, mode, blocks }); } catch {}
    }
    return;
  }
  try {
    (window as any).__tpAsrBlocksReady = true;
    (window as any).__tpAsrBlockCount = blocks.count;
  } catch {}
  const markerIdx = computeMarkerLineIndex();
  syncAsrIndices(markerIdx, `blocks:${reason}`);
  if (asrLive) {
    lastAsrBlockSyncAt = now;
  }
  if (isDevMode()) {
    try {
      console.info('[ASR] block sync complete', {
        reason,
        mode,
        markerIdx,
        blockCount: blocks.count,
        schemaVersion: blocks.schemaVersion,
        source: blocks.source,
      });
    } catch {}
  }
}

function pushAsrTranscript(text: string, isFinal: boolean, detail?: any): void {
  const t = String(text || '').trim();
  if (!t) return;
  const payload = {
    text: t,
    isFinal: !!isFinal,
    source: detail?.source,
  };
  if (isDevMode()) console.log('[ASR] ingest', {
    isFinal: payload.isFinal,
    text: payload.text?.slice(0, 60),
    source: payload.source,
  });
  const mode = String(detail?.mode || getScrollMode() || '').toLowerCase();
  if (!isAsrDriverArmed()) {
    if (isDevMode()) {
      try { console.info('[ASR] ingest ignored (driver unarmed)', { mode }); } catch {}
    }
    return;
  }
  attachAsrScrollDriver({ reason: 'transcript', mode, allowCreate: true });
  try { asrScrollDriver?.ingest(t, !!isFinal, detail); } catch {}
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
  if (isAsrLikeMode(mode) && !isAsrDriverArmed()) {
    if (isDevMode()) {
      try { console.info('[ASR] driver attach blocked (unarmed)', { mode, reason: opts?.reason || 'attach' }); } catch {}
    }
    bootTrace('speech-loader:attach-asr-driver:blocked', {
      reason: opts?.reason || 'attach',
      mode,
      cause: 'unarmed',
    });
    return;
  }
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
    const phase = getSession().phase;
    const asrArmed = isAsrDriverArmed();
    if (!asrArmed) return;
    if (effectiveMode === 'hybrid') {
      // allow
    } else if (effectiveMode === 'asr' && phase === 'live') {
      // allow
    } else {
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
      attachAsrScrollDriver({ reason: 'session-intent', mode, allowCreate: false });
      syncAsrDriverFromBlocks('session-intent', { mode, allowCreate: false });
      return;
    }
    if (!asrSessionIntentActive && !running) {
      detachAsrScrollDriver();
    }
  };
  const onScrollMode = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    const mode = String(detail.mode || detail.nextMode || getScrollMode() || '').toLowerCase();
    if (isAsrLikeMode(mode)) {
      attachAsrScrollDriver({ reason: 'scroll-mode', mode, allowCreate: false });
      syncAsrDriverFromBlocks('scroll-mode', { mode, allowCreate: false });
      return;
    }
    if (!running) {
      detachAsrScrollDriver();
    }
  };
  const onSessionStart = () => {
    const session = getSession();
    const mode = getScrollMode();
    asrSessionIntentActive = true;
    if (session.asrDesired || isAsrLikeMode(mode)) {
      attachAsrScrollDriver({ reason: 'session-start', mode, allowCreate: false });
      syncAsrDriverFromBlocks('session-start', { mode, allowCreate: false });
    }
  };
  const onBlocksReady = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    const mode = String(getScrollMode() || '').toLowerCase();
    if (detail && typeof detail.blockCount === 'number') {
      try { (window as any).__tpAsrBlockCount = Math.max(0, Math.floor(detail.blockCount)); } catch {}
      try { (window as any).__tpAsrBlocksReady = true; } catch {}
    }
    syncAsrDriverFromBlocks('blocks-ready', { mode, allowCreate: false });
  };
  const onScriptRendered = () => {
    const mode = String(getScrollMode() || '').toLowerCase();
    const session = getSession();
    const wantsAsrDriver = isAsrLikeMode(mode) || session.asrDesired || !!asrScrollDriver;
    if (!wantsAsrDriver) return;
    try {
      window.requestAnimationFrame?.(() => {
        syncAsrDriverFromBlocks('script-rendered', { mode, allowCreate: false });
      });
    } catch {
      syncAsrDriverFromBlocks('script-rendered', { mode, allowCreate: false });
    }
  };
  const onSessionStop = () => {
    asrSessionIntentActive = false;
    speechStartInFlight = false;
    resetAsrInterimStabilizer();
    clearAsrRunKey('lifecycle-session-stop');
  };
  const onSessionPhase = (event: Event) => {
    const phase = String((event as CustomEvent)?.detail?.phase || '').toLowerCase();
    if (phase === 'idle' || phase === 'wrap') {
      asrSessionIntentActive = false;
      resetAsrInterimStabilizer();
      clearAsrRunKey(`phase-${phase}`);
    }
  };
  window.addEventListener('tp:session:intent', onSessionIntent, TRANSCRIPT_EVENT_OPTIONS);
  document.addEventListener('tp:session:intent', onSessionIntent as EventListener, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:scroll:mode', onScrollMode, TRANSCRIPT_EVENT_OPTIONS);
  document.addEventListener('tp:scroll:mode', onScrollMode as EventListener, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:session:start', onSessionStart, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:session:stop', onSessionStop, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:session:phase', onSessionPhase, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:asr:blocks-ready', onBlocksReady, TRANSCRIPT_EVENT_OPTIONS);
  document.addEventListener('tp:asr:blocks-ready', onBlocksReady as EventListener, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:script-rendered', onScriptRendered, TRANSCRIPT_EVENT_OPTIONS);
  document.addEventListener('tp:script-rendered', onScriptRendered as EventListener, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:render:done', onScriptRendered, TRANSCRIPT_EVENT_OPTIONS);
  document.addEventListener('tp:render:done', onScriptRendered as EventListener, TRANSCRIPT_EVENT_OPTIONS);
  const initialMode = String(getScrollMode() || '').toLowerCase();
  const session = getSession();
  if (isAsrLikeMode(initialMode) || session.asrDesired) {
    attachAsrScrollDriver({ reason: 'bootstrap', mode: initialMode, allowCreate: false });
    syncAsrDriverFromBlocks('bootstrap', { mode: initialMode, allowCreate: false });
  }
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
}

function ensureSessionStopHooked(): void {
  if (sessionStopHooked) return;
  sessionStopHooked = true;
  if (typeof window === 'undefined') return;
  window.addEventListener('tp:session:stop', (event) => {
    asrSessionIntentActive = false;
    speechStartInFlight = false;
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

function attachWebSpeechLifecycle(sr: SpeechRecognition): void {
  if (!sr) return;
  sr.onend = (event: Event) => {
    try { console.log('[speech] onend', event); } catch {}
    if (pendingManualRestartCount > 0) {
      pendingManualRestartCount = Math.max(pendingManualRestartCount - 1, 0);
      return;
    }
    if (shouldAutoRestartSpeech()) {
      try {
        console.log('[speech] restarting recognition after onend');
        sr.start();
      } catch (err) {
        try { console.warn('[speech] restart failed after onend', err); } catch {}
        emitAsrState('idle', 'recognition-restart-error');
      }
    } else {
      emitAsrState('idle', 'recognition-end');
    }
  };
  sr.onerror = (event: Event) => {
    try { console.error('[speech] error', event); } catch {}
    if (shouldAutoRestartSpeech()) {
      try { sr.stop(); } catch {}
      try {
        sr.start();
      } catch (err) {
        try { console.warn('[speech] restart failed after error', err); } catch {}
        emitAsrState('idle', 'recognition-error');
      }
    } else {
      emitAsrState('idle', 'recognition-error');
    }
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
      return true;
    }
  } catch {}

  try {
    const startRecognizer = speechNs?.startRecognizer;
    if (typeof startRecognizer === 'function') {
      startRecognizer(() => {}, { lang: 'en-US' });
      rec = { stop: () => { try { speechNs?.stopRecognizer?.(); } catch {} } };
      return true;
    }
  } catch {}

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new Error('NoSpeechBackend');
  const sr = new SR();
  sr.interimResults = true;
  sr.continuous = true;
  attachWebSpeechLifecycle(sr);
  setActiveRecognizer(sr);
  let _lastInterimAt = 0;
  sr.onresult = (e: any) => {
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
  };
  sr.onerror = (e: Event) => { try { console.warn('[speech] error', e); } catch {} };
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
    try { console.debug('[ASR] startSpeech blocked during settings hydration', { mode, reason: info?.reason }); } catch {}
    bootTrace('speech-loader:live-path:skip', { reason: 'settings-hydrating', mode });
    return false;
  }
  if (running) {
    bootTrace('speech-loader:live-path:skip', { reason: 'already-running', mode });
    return true;
  }
  speechStartInFlight = true;

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
        const scroller = resolveActiveScroller(
          getPrimaryScroller(),
          getScriptRoot() || getFallbackScroller(),
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
      const scroller = resolveActiveScroller(viewer, root || getFallbackScroller());
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
    running = true;
    rememberMode(mode);
    try { document.body.classList.add('listening'); } catch {}
    try { window.HUD?.bus?.emit?.('speech:toggle', true); } catch {}
    try { window.speechOn = true; } catch {}
    setListeningUi(true);
    try { window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running: true } })); } catch {}

    try {
      console.debug('[ASR] willStartRecognizer', {
        phase: 'session-live',
        mode,
        hasSR: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
      });
    } catch {}

    try {
      const ok = await startBackendForSession(mode, info?.reason);
      try { console.debug('[ASR] didCallStartRecognizer', { ok }); } catch {}
      try { await window.__tpMic?.requestMic?.(); } catch {}
      bootTrace('speech-loader:live-path:done', { mode, ok, runKey });
      return ok;
    } catch {
      running = false;
      setActiveRecognizer(null);
      setListeningUi(false);
      setReadyUi();
      clearAsrRunKey('start-failed');
      bootTrace('speech-loader:live-path:error', { mode, reason: info?.reason || null, runKey });
      return false;
    }
  } finally {
    speechStartInFlight = false;
  }
}

export function stopSpeechBackendForSession(reason?: string): void {
  speechStartInFlight = false;
  asrSessionIntentActive = false;
  resetAsrInterimStabilizer();
  clearAsrRunKey(`stop:${String(reason || 'unspecified')}`);
  if (!running && !rec) {
    detachAsrScrollDriver();
    return;
  }
  detachAsrScrollDriver();
  asrBrainLogged = false;
  try { stopAsrRuntime(); } catch {}
  try { window.__tpMic?.releaseMic?.(); } catch {}
  try { rec?.stop?.(); } catch {}
  try { getTpSpeechNamespace()?.stopRecognizer?.(); } catch {}
  setActiveRecognizer(null);
  running = false;
  try { document.body.classList.remove('listening'); } catch {}
  try { window.HUD?.bus?.emit?.('speech:toggle', false); } catch {}
  try { window.speechOn = false; } catch {}
  setListeningUi(false);
  setReadyUi();
  try { window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running: false, reason } })); } catch {}
}

export function installSpeech(): void {
  ensureAsrDriverLifecycleHooks();
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
  return;
  // Enable/disable the button based on browser support or orchestrator presence.
  // Honor a dev force-enable escape hatch via localStorage.tp_speech_force === '1'.
async function probeUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return Boolean(res && res.ok);
  } catch {
    return false;
  }
}

async function resolveOrchestratorUrl(): Promise<string> {
  const v = Date.now();
  const primary = `/dist/speech/orchestrator.real.js?v=${v}`;
  try { console.log('[SPEECH] orchestrator resolved ->', primary); } catch {}
  return primary;
}

(async () => {
    try {
      const btn = document.getElementById('recBtn') as HTMLButtonElement | null;
      if (!btn) return;

      const SRAvail = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      const hasGlobalOrch = !!(window.__tpSpeechOrchestrator);
      const force = ((() => { try { return localStorage.getItem('tp_speech_force') === '1'; } catch {} return false; })());
      const ciGuard = (() => {
        try {
          const ls = localStorage.getItem('tp_ci');
          if (ls === '1') return true;
        } catch {}
        try {
          const sp = new URLSearchParams(location.search);
          if (sp.get('ci') === '1') return true;
        } catch {}
        return false;
      })();

      const backendAllowed = isSpeechBackendAllowed();
      let hasOrchestrator = hasGlobalOrch;
        if (!hasOrchestrator && backendAllowed && !ciGuard) {
          try {
            hasOrchestrator = await probeUrl('/dist/speech/orchestrator.real.js');
          } catch {}
        }

      const supported = SRAvail || hasOrchestrator;
      const canUse = supported || force;

      if (canUse) setReadyUi(); else setUnsupportedUi();
      // Stash a flag for start path to decide whether to attempt dynamic import (no probe by default)
      try { window.__tpSpeechCanDynImport = backendAllowed && !!hasOrchestrator && !ciGuard; } catch {}

      async function startBackend(): Promise<boolean> {
        const runtimeSpeechNs = getTpSpeechNamespace();
        const runtimeSpeechState = getTpSpeechStoreSnapshot();
        if (isDevMode()) {
          const w = typeof window !== 'undefined' ? (window as any) : null;
          const info = {
            hasOrchestrator: !!w?.__tpSpeechOrchestrator?.start,
            hasRecognizerStart: typeof runtimeSpeechNs?.startRecognizer === 'function',
            hasWebSpeech: !!(w?.SpeechRecognition || w?.webkitSpeechRecognition),
            sessionPhase: (runtimeSpeechState as any)?.sessionPhase,
            scrollMode: (runtimeSpeechState as any)?.scrollMode,
            speechRunning: (runtimeSpeechState as any)?.speechRunning,
          };
          console.log('[ASR] lifecycle startBackend: invoking backend', info);
        }
        // Prefer orchestrator if available
        try {
          if (window.__tpSpeechOrchestrator?.start) {
            const started = await window.__tpSpeechOrchestrator.start();
            rec = (started || null) as RecognizerLike | null;
            if (rec && typeof rec.on === 'function') {
              try { rec.on('final', (t: any) => routeRecognizerTranscript(t, true)); } catch {}
              try { rec.on('partial', (t: any) => routeRecognizerTranscript(t, false)); } catch {}
            }
            try { window.__tpEmitSpeech = (t: unknown, final?: boolean) => routeRecognizerTranscript(t, !!final); } catch {}
            return true;
          }
        } catch {}
        // Dynamic import if supported
        try {
          if (window.__tpSpeechCanDynImport) {
            const orchUrl = await resolveOrchestratorUrl();
            const mod = await import(/* @vite-ignore */ orchUrl);
            if (mod?.startOrchestrator) {
              const started = await mod.startOrchestrator();
              rec = (started || null) as RecognizerLike | null;
              try {
                if (rec && typeof rec.on === 'function') {
                  try { rec.on('final', (t: any) => routeRecognizerTranscript(t, true)); } catch {}
                  try { rec.on('partial', (t: any) => routeRecognizerTranscript(t, false)); } catch {}
                }
              } catch {}
              try { window.__tpEmitSpeech = (t: unknown, final?: boolean) => routeRecognizerTranscript(t, !!final); } catch {}
              try {
                const shimNs = getTpSpeechNamespace();
                console.log('[SPEECH] shim', { start: !!shimNs?.startRecognizer, match: !!shimNs?.matchBatch });
              } catch {}
              return true;
            }
          }
        } catch {}
        // Web Speech fallback
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) throw new Error('NoSpeechBackend');
        const sr = new SR();
        sr.interimResults = true;
        sr.continuous = true;
        attachWebSpeechLifecycle(sr);
        setActiveRecognizer(sr);
        // Web Speech → route finals and throttled partials
        let _lastInterimAt = 0;
        sr.onresult = (e: any) => {
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
        };
        sr.onerror = (e: Event) => { try { console.warn('[speech] error', e); } catch {} };
        try { sr.start(); } catch {}
        rec = { stop: () => { try { sr.stop(); } catch {} } };
        try { window.__tpEmitSpeech = (t: unknown, final?: boolean) => routeRecognizerTranscript(t, !!final); } catch {}
        return true;
      }

      async function startSpeech() {
          try {
            const mode = getScrollMode();
            const wantsSpeech = mode === 'hybrid' || mode === 'asr';
            const S = window.__tpStore;
            const sec = (S && S.get) ? Number(S.get('prerollSeconds') || 0) : 0;
            detachAsrScrollDriver();

            if (!wantsSpeech) {
              // Non-ASR modes: just run pre-roll and start auto-scroll
              running = true;
              setListeningUi(true);
              try { window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running: true } })); } catch {}
              await beginCountdownThen(sec, async () => {
            try { window.dispatchEvent(new CustomEvent('tp:auto:intent', { detail: { enabled: true, reason: 'speech' } })); } catch {}
                try {
                  window.dispatchEvent(new CustomEvent('tp:speechSync:ready', {
                    detail: { source: 'auto-only', preroll: sec }
                  }));
                } catch {}
              });
              if (btn) btn.disabled = false;
              return;
            }

            attachAsrScrollDriver();

            running = true;
            rememberMode(mode);
          // Flip UI + legacy speech gate immediately
          try { document.body.classList.add('listening'); } catch {}
          try { window.HUD?.bus?.emit?.('speech:toggle', true); } catch {}
          try { window.speechOn = true; } catch {}
          setListeningUi(true);
          try { window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running: true } })); } catch {}
          // NOTE: Do NOT start auto-scroll yet - wait for countdown to finish
          try { (window.HUD?.log || console.debug)?.('speech', { state: 'start' }); } catch {}
          if (isDevMode()) {
            const w = typeof window !== 'undefined' ? (window as any) : null;
            const debugSpeechNs = getTpSpeechNamespace();
            const debugSpeechState = getTpSpeechStoreSnapshot();
            const info = {
              mode,
              hasOrchestrator: !!w?.__tpSpeechOrchestrator?.start,
              hasRecognizerStart: typeof debugSpeechNs?.startRecognizer === 'function',
              hasWebSpeech: !!(w?.SpeechRecognition || w?.webkitSpeechRecognition),
              sessionPhase: (debugSpeechState as any)?.sessionPhase,
              scrollMode: (debugSpeechState as any)?.scrollMode,
              speechRunning: (debugSpeechState as any)?.speechRunning,
            };
            console.log('[ASR] lifecycle start: willStartBackend', info);
          }
          console.debug('[ASR] willStartRecognizer', {
            phase: 'startSpeech',
            mode,
            hasSR: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
          });
          await beginCountdownThen(sec, async () => {
            // NOW start auto-scroll after countdown completes
            if (mode !== 'asr') {
              try { window.dispatchEvent(new CustomEvent('tp:auto:intent', { detail: { enabled: true, reason: 'speech' } })); } catch {}
            }
            const ok = await startBackend();
            console.debug('[ASR] didCallStartRecognizer', { ok });
            console.debug('[ASR] recognizerRef', {
              hasRef: !!rec,
              state: (rec as any)?.state,
            });
            // Signal that pre-roll + speech sync are ready
            try {
              window.dispatchEvent(new CustomEvent('tp:speechSync:ready', {
                detail: { source: 'speech', preroll: sec }
              }));
            } catch {}
            // Ensure mic stream is granted so Hybrid gates (dB/VAD) can open
            try { await window.__tpMic?.requestMic?.(); } catch {}
          });
        } catch (err) {
          running = false;
          setActiveRecognizer(null);
          setListeningUi(false);
          setReadyUi();
          const msg = err instanceof Error ? err.message : String(err);
          try { (window.HUD?.log || console.warn)?.('speech', { startError: msg }); } catch {}
        } finally {
        }
      }

      async function stopSpeech() {
      try {
        detachAsrScrollDriver();
        try { stopAsrRuntime(); } catch {}
        try { window.__tpMic?.releaseMic?.(); } catch {}
        try { rec?.stop?.(); } catch {}
          setActiveRecognizer(null);
          running = false;
          try { document.body.classList.remove('listening'); } catch {}
          try { window.HUD?.bus?.emit?.('speech:toggle', false); } catch {}
          try { window.speechOn = false; } catch {}
          setListeningUi(false);
          setReadyUi();
          try {
            console.log('[ASR] Stop speech sync clicked');
            const auto = (window as any).__tpAuto;
            if (auto && typeof auto.setEnabled === 'function') {
              console.log('[ASR] Disabling auto-scroll from Stop speech sync');
              auto.setEnabled(false);
            } else {
              console.warn('[ASR] __tpAuto not available; cannot disable auto-scroll.');
            }
            const asr = (window as any).__tpASR || (window as any).ASR || rec;
            if (asr && typeof asr.stop === 'function') {
              console.log('[ASR] Calling ASR.stop() from Stop speech sync');
              asr.stop();
            } else if (asr && typeof asr.abort === 'function') {
              console.log('[ASR] Calling ASR.abort() from Stop speech sync');
              asr.abort();
            } else {
              console.warn('[ASR] No ASR controller found to stop.');
            }
          } catch {}
          // Ensure display window knows to stop auto modes
          try {
            const sendToDisplay = window.__tpSendToDisplay || (()=>{});
            sendToDisplay({ type: 'auto', op: 'stop' });
          } catch {}
          try { window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running: false } })); } catch {}
          // Optionally flip user intent OFF when speech stops
          try { (window.HUD?.log || console.debug)?.('speech', { state: 'stop' }); } catch {}
        } finally {
        }
      }

      btn.addEventListener('click', async () => {
        if (!running) await startSpeech(); else await stopSpeech();
      }, { capture: true });
    } catch {}
  })();
}
async function _maybeStartRecorders(): Promise<void> {
  // recording/session-managed; placeholder to preserve API
  return;
}
