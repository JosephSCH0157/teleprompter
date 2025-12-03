import { wantsAutoRecord } from '../recording/wantsAutoRecord';
import type { AppStore } from '../state/app-store';

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
};

declare global {
  interface Window {
    __tpBus?: { emit?: AnyFn };
    HUD?: { bus?: { emit?: AnyFn }; log?: AnyFn };
    __tpHud?: { log?: AnyFn };
    __tpStore?: AppStore;
    __tpScrollMode?: { getMode?: () => string };
    __tpMic?: { isOpen?: () => boolean; requestMic?: () => Promise<MediaStream> } & Record<string, unknown>;
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
    __tpEmitSpeech?: (t: string, final?: boolean) => void;
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

async function enumerateDevices(): Promise<MediaDeviceInfo[]> {
  try {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
    return await navigator.mediaDevices.enumerateDevices();
  } catch {
    return [];
  }
}

function hasKind(devs: MediaDeviceInfo[], kind: MediaDeviceKind): boolean {
  return devs.some((d) => d.kind === kind);
}

function showToast(msg: string) {
  try { (window as any).toasts?.show?.(msg); } catch {}
}

// One entry point for speech. Uses Web Speech by default.
// If /speech/orchestrator.js exists (built from TS), we load it instead.
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
    if (lastResultTs && idleFor > WATCHDOG_THRESHOLD_MS) {
      try { console.warn('[speech] watchdog: no results for', idleFor, 'ms – restarting recognition'); } catch {}
      const restarted = requestRecognizerRestart('idle-watchdog');
      if (!restarted) {
        emitAsrState('idle', 'recognition-watchdog-failed');
        running = false;
        setActiveRecognizer(null);
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

// Small router to bridge transcripts to both legacy and modern paths
function routeTranscript(text: string, isFinal: boolean): void {
  try {
    if (!text) return;
    markResultTimestamp();
    const payload: TranscriptPayload = {
      text,
      final: !!isFinal,
      isFinal: !!isFinal,
      timestamp: performance.now(),
      source: 'speech-loader',
      mode: lastScrollMode || getScrollMode(),
    };
    
    // Always emit to HUD bus (unconditional for debugging/monitoring)
    try { window.HUD?.bus?.emit?.(isFinal ? 'speech:final' : 'speech:partial', payload); } catch {}
    
    // In rehearsal, never steer — only HUD logging
    if (inRehearsal()) return;
    
    // Legacy monolith path
    if (typeof window.advanceByTranscript === 'function') {
      try { window.advanceByTranscript(text, !!isFinal); } catch {}
    }
    
    // Dispatch window event only when gated (ASR/Hybrid mode + mic active)
    if (shouldEmitTranscript()) {
      try { console.log('[speech-loader] emit tp:speech:transcript', payload); } catch {}
      emitTranscriptEvent(payload);
    }
  } catch {}
}

// (dynamic import of '/speech/orchestrator.js' is performed inline where needed)

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

// Provide safe no-op wrappers for auto-record start/stop so callers can invoke them
// without risking a ReferenceError if the feature is not present.
async function doAutoRecordStart(): Promise<void> {
  try {
    if (!wantsAutoRecord()) return;
    // Respect OBS "Off": if primary adapter is OBS and it's disarmed, skip starting
    try {
      const a = (window.__tpRecording && typeof window.__tpRecording.getAdapter === 'function')
        ? String(window.__tpRecording.getAdapter() || '')
        : '';
      if (a === 'obs') {
        const armed = !!(window.__tpObs && typeof window.__tpObs.armed === 'function' ? window.__tpObs.armed() : false);
        if (!armed) {
          try { window.__tpHud?.log?.('[auto-record]', 'skip (OBS disabled)'); } catch {}
          return; // do not attempt to start OBS when disabled
        }
      }
    } catch {}
    if (window.__tpAutoRecord && typeof window.__tpAutoRecord.start === 'function') {
      await window.__tpAutoRecord.start();
    }
  } catch {}
}

async function doAutoRecordStop(): Promise<void> {
  try {
    if (!wantsAutoRecord()) return;
    if (window.__tpAutoRecord && typeof window.__tpAutoRecord.stop === 'function') {
      await window.__tpAutoRecord.stop();
    }
  } catch {}
}

function beginCountdownThen(sec: number, cb: () => Promise<void> | void): Promise<void> {
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
          try { window.dispatchEvent(new CustomEvent('tp:preroll:done', { detail: { seconds: s, source: 'speech' } })); } catch {}
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
        try { window.dispatchEvent(new CustomEvent('tp:preroll:done', { detail: { seconds: s, source: 'speech' } })); } catch {}
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

export function installSpeech(): void {
  // Enable/disable the button based on browser support or orchestrator presence.
  // Honor a dev force-enable escape hatch via localStorage.tp_speech_force === '1'.
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

      // Optional probe: only if explicitly opted-in; default avoids 404 noise in dev
      const probeOptIn = (() => { try { return localStorage.getItem('tp_probe_speech') === '1' || new URLSearchParams(location.search).get('probe') === '1'; } catch { return false; } })();
      let hasOrchestrator = hasGlobalOrch;
      if (!hasOrchestrator && !ciGuard && probeOptIn) {
        try {
          const res = await fetch('/speech/orchestrator.js', { method: 'HEAD', cache: 'no-store' });
          hasOrchestrator = !!(res && res.ok);
        } catch {}
      }

      const supported = SRAvail || hasOrchestrator;
      const canUse = supported || force;

      if (canUse) setReadyUi(); else setUnsupportedUi();
      // Stash a flag for start path to decide whether to attempt dynamic import (no probe by default)
      try { window.__tpSpeechCanDynImport = !!hasOrchestrator && !ciGuard; } catch {}

      async function startBackend() {
        // Prefer orchestrator if available
        try {
          if (window.__tpSpeechOrchestrator?.start) {
            const started = await window.__tpSpeechOrchestrator.start();
            rec = (started || null) as RecognizerLike | null;
            if (rec && typeof rec.on === 'function') {
              try { rec.on('final', (t: any) => routeTranscript(String(t || ''), true)); } catch {}
              try { rec.on('partial', (t: any) => routeTranscript(String(t || ''), false)); } catch {}
            }
            try { window.__tpEmitSpeech = (t: string, final?: boolean) => routeTranscript(String(t || ''), !!final); } catch {}
            return;
          }
        } catch {}
        // Dynamic import if supported
        try {
          if (window.__tpSpeechCanDynImport) {
            const orchUrl = '/speech/orchestrator.js';
            const mod = await import(orchUrl);
            if (mod?.startOrchestrator) {
              const started = await mod.startOrchestrator();
              rec = (started || null) as RecognizerLike | null;
              try {
                if (rec && typeof rec.on === 'function') {
                  try { rec.on('final', (t: any) => routeTranscript(String(t || ''), true)); } catch {}
                  try { rec.on('partial', (t: any) => routeTranscript(String(t || ''), false)); } catch {}
                }
              } catch {}
              try { window.__tpEmitSpeech = (t: string, final?: boolean) => routeTranscript(String(t || ''), !!final); } catch {}
              return;
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
        try { window.__tpEmitSpeech = (t: string, final?: boolean) => routeTranscript(String(t || ''), !!final); } catch {}
      }

      async function startSpeech() {
        if (btn) btn.disabled = true;
        try {
          const mode = getScrollMode();
          const wantsSpeech = mode === 'hybrid' || mode === 'asr';
          const S = window.__tpStore;
          const sec = (S && S.get) ? Number(S.get('prerollSeconds') || 0) : 0;

          if (!wantsSpeech) {
            // Non-ASR modes: just run pre-roll and start auto-scroll
            await beginCountdownThen(sec, async () => {
              try { window.dispatchEvent(new CustomEvent('tp:autoIntent', { detail: { on: true } })); } catch {}
              try {
                window.dispatchEvent(new CustomEvent('tp:speechSync:ready', {
                  detail: { source: 'auto-only', preroll: sec }
                }));
              } catch {}
            });
            return;
          }

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
          await beginCountdownThen(sec, async () => {
            // NOW start auto-scroll after countdown completes
            try { window.dispatchEvent(new CustomEvent('tp:autoIntent', { detail: { on: true } })); } catch {}
            await startBackend();
            // Signal that pre-roll + speech sync are ready
            try {
              window.dispatchEvent(new CustomEvent('tp:speechSync:ready', {
                detail: { source: 'speech', preroll: sec }
              }));
            } catch {}
            // If auto-record isn't enabled, no-op; if enabled and already armed, ensure it's running
            try { await maybeStartRecorders(); }
            catch (err) {
              try { console.warn('[auto-record] start failed', err); } catch {}
            }
            // Ensure mic stream is granted so Hybrid gates (dB/VAD) can open
            try { await window.__tpMic?.requestMic?.(); } catch {}
          });
        } catch (e) {
          running = false;
          setActiveRecognizer(null);
          setListeningUi(false);
          setReadyUi();
          const msg = e instanceof Error ? e.message : String(e);
          try { (window.HUD?.log || console.warn)?.('speech', { startError: msg }); } catch {}
        } finally {
          if (btn) btn.disabled = false;
        }
      }

      async function stopSpeech() {
        if (btn) btn.disabled = true;
        try {
          try { rec?.stop?.(); } catch {}
          setActiveRecognizer(null);
          running = false;
          try { document.body.classList.remove('listening'); } catch {}
          try { window.HUD?.bus?.emit?.('speech:toggle', false); } catch {}
          try { window.speechOn = false; } catch {}
          setListeningUi(false);
          setReadyUi();
          // If auto-record is on, stop it
          try { await doAutoRecordStop(); } catch {}
          // Ensure display window knows to stop auto modes
          try {
            const sendToDisplay = window.__tpSendToDisplay || (()=>{});
            sendToDisplay({ type: 'auto', op: 'stop' });
          } catch {}
          try { window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running: false } })); } catch {}
          // Optionally flip user intent OFF when speech stops
          try { window.dispatchEvent(new CustomEvent('tp:autoIntent', { detail: { on: false } })); } catch {}
          try { (window.HUD?.log || console.debug)?.('speech', { state: 'stop' }); } catch {}
        } finally {
          if (btn) btn.disabled = false;
        }
      }

      btn.addEventListener('click', async () => {
        if (!running) await startSpeech(); else await stopSpeech();
      }, { capture: true });
    } catch {}
  })();
}
async function maybeStartRecorders(): Promise<void> {
  try {
    const wantsAudio = !!wantsAutoRecord();
    const wantsVideo = (() => {
      try { return window.__tpStore?.get?.('videoRecord') === true; } catch { return false; }
    })();

    if (!wantsAudio && !wantsVideo) return;

    const devs = await enumerateDevices();
    const hasMic = hasKind(devs, 'audioinput');
    const hasCam = hasKind(devs, 'videoinput');

    if (wantsAudio && !hasMic) {
      showToast('No microphone detected – recording will be audio-less.');
    }
    if (wantsVideo) {
      if (!hasCam) {
        showToast('No camera detected – recording will not include video.');
      }
    }

    // Start only what we have enabled and available
    if ((wantsAudio && hasMic) || (wantsVideo && hasCam)) {
      try { await doAutoRecordStart(); } catch {}
    }
  } catch {
    // swallow; recorder start is best-effort
  }
}
