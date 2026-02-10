import { appStore } from '../state/app-store';
import { getSession, type SessionPhase } from '../state/session';
import {
  normalizeScrollMode,
  shouldAutoStartForMode,
} from './scroll/scroll-mode-utils';
import {
  startSpeechBackendForSession,
  stopSpeechBackendForSession,
} from './speech-loader';
import {
  describeElement,
  getFallbackScroller,
  getPrimaryScroller,
  getScriptRoot,
  resolveActiveScroller,
} from '../scroll/scroller';

try {
  (window as any).__TP_SCROLL_SESSION_FINGERPRINT = 'scroll-session-v4-2026-02-10-a';
  console.log('SCROLL_SESSION_FINGERPRINT', (window as any).__TP_SCROLL_SESSION_FINGERPRINT);
} catch {}

let asrOffLogged = false;
const lastPhaseInit = (() => {
  try {
    const session = getSession();
    return (session?.phase as SessionPhase) ?? 'idle';
  } catch {
    return 'idle';
  }
})();
let lastSessionPhase: SessionPhase = lastPhaseInit;

type StopAutoScrollContext = {
  reason: string;
  phase: SessionPhase;
  mode: string;
  userEnabled: boolean;
  shouldRun: boolean;
};

function dispatchAutoIntent(enabled: boolean): void {
  try {
    console.trace('[probe] dispatch tp:auto:intent', { enabled });
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('tp:auto:intent', {
      detail: { enabled, reason: 'scriptEnd' },
    }));
  } catch {
    // ignore
  }
}

function startAutoScroll(mode: string): void {
  if (!shouldAutoStartForMode(mode)) {
    try {
      console.debug('[scroll-session] auto-scroll start ignored (mode not auto-capable)', { mode });
    } catch {}
    return;
  }
  try {
    console.debug('[scroll-session] dispatching tp:auto:intent (start)');
  } catch {}
  dispatchAutoIntent(true);
}

function stopAutoScroll(ctx: StopAutoScrollContext): void {
  try {
    console.info('[scroll-session] STOP requested', ctx);
  } catch {}
  dispatchAutoIntent(false);
}

function shouldStopAutoForPhase(phase: SessionPhase): boolean {
  return phase !== 'preroll';
}

function maybeStartOnLive(phase: SessionPhase): void {
  const prevPhase = lastSessionPhase;
  lastSessionPhase = phase;
  const session = getSession();
  const rawMode = appStore.get('scrollMode') as string | undefined;
  const canonicalMode = normalizeScrollMode(rawMode);
  const canonicalModeStr = String(canonicalMode);
  const shouldRun = session.scrollAutoOnLive && shouldAutoStartForMode(canonicalMode);
  if (phase !== 'live') {
    if (prevPhase === 'live' && shouldStopAutoForPhase(phase)) {
      stopAutoScroll({
        reason: 'phase-change',
        phase,
        mode: canonicalMode,
        userEnabled: session.scrollAutoOnLive,
        shouldRun,
      });
      stopSpeechBackendForSession('phase-change');
      asrOffLogged = false;
    }
    return;
  }

  try {
    console.debug('[ASR] live entered', {
      mode: canonicalMode,
      scrollAutoOnLive: session.scrollAutoOnLive,
      brain: appStore.get('scrollBrain'),
      asrDesired: session.asrDesired,
      asrArmed: session.asrArmed,
    });
  } catch {}

  const brain = String(appStore.get('scrollBrain') || '').toLowerCase();
  const shouldStartSpeech =
    canonicalModeStr === 'hybrid' ||
    (session.asrArmed && (canonicalMode === 'asr' || brain === 'asr'));
  if (shouldStartSpeech) {
    try { console.debug('[ASR] about to call startSpeech/startBackend', { mode: canonicalMode, reason: 'live-enter' }); } catch {}
    void startSpeechBackendForSession({ reason: 'live-enter', mode: canonicalMode });
  } else if (!asrOffLogged) {
    asrOffLogged = true;
    const reason = !session.asrDesired
      ? 'not-desired'
      : !session.asrArmed
        ? 'not-armed'
        : (canonicalMode !== 'asr' && canonicalMode !== 'hybrid' && brain !== 'asr')
          ? 'mode-blocked'
          : 'unknown';
    const scroller = resolveActiveScroller(
      getPrimaryScroller(),
      getScriptRoot() || getFallbackScroller(),
    );
    try {
      console.warn('ASR_OFF_REASON', {
        reason,
        asrDesired: session.asrDesired,
        asrArmed: session.asrArmed,
        mode: canonicalMode,
        brain,
        scrollerId: describeElement(scroller),
      });
    } catch {}
  }

  if (!session.scrollAutoOnLive) {
    try { console.debug('[scroll-session] auto-scroll not starting on live (scrollAutoOnLive=false)'); } catch {}
    return;
  }
  if (!shouldRun) {
    try { console.debug('[scroll-session] auto-scroll not allowed for mode', canonicalMode); } catch {}
    return;
  }
  try { console.debug('[scroll-session] live phase with auto-on-live; starting auto-scroll', { mode: canonicalMode }); } catch {}
  startAutoScroll(canonicalModeStr);
}

export function initScrollSessionRouter(): void {
  try {
    appStore.subscribe('session.phase', (p) =>
      maybeStartOnLive(p as SessionPhase),
    );
  } catch {
    // ignore
  }

  try {
    window.addEventListener('tp:preroll:done', (ev) => {
    const session = getSession();
    const detail = (ev as CustomEvent)?.detail || {};

      try {
        console.debug('[scroll-session] preroll done', {
          phase: session.phase,
          scrollAutoOnLive: session.scrollAutoOnLive,
          mode: appStore.get('scrollMode'),
          detail,
        });
      } catch {
        // ignore
      }

      if (session.phase !== 'live') return;
      if (!session.scrollAutoOnLive) {
        try { console.debug('[scroll-session] auto-scroll disabled for this mode'); } catch {}
        return;
      }
      const rawMode = appStore.get('scrollMode') as string | undefined;
      const canonicalMode = normalizeScrollMode(rawMode);
      if (!shouldAutoStartForMode(canonicalMode)) {
        try { console.debug('[scroll-session] auto-scroll disabled for this mode (manual block)', { mode: canonicalMode }); } catch {}
        return;
      }
      startAutoScroll(String(canonicalMode));
    });
  } catch {
    // ignore
  }
}
