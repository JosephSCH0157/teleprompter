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

try {
  (window as any).__TP_SCROLL_SESSION_FINGERPRINT = 'scroll-session-v3-2025-12-19-a';
  console.log('SCROLL_SESSION_FINGERPRINT', (window as any).__TP_SCROLL_SESSION_FINGERPRINT);
} catch {}

function startAutoScroll(): void {
  try {
    const auto: any = (window as any).__tpAuto;
    if (auto && typeof auto.startFromPreroll === 'function') {
      try { console.debug('[scroll-session] requesting auto start (startFromPreroll)'); } catch {}
      auto.startFromPreroll({ source: 'session' });
      return;
    }
    if (typeof (window as any).startAutoScroll === 'function') {
      try { console.debug('[scroll-session] requesting auto start (startAutoScroll)'); } catch {}
      (window as any).startAutoScroll();
      return;
    }
    if (auto && typeof auto.setEnabled === 'function') {
      try { console.debug('[scroll-session] requesting auto start (setEnabled)'); } catch {}
      auto.setEnabled(true);
    }
  } catch {
    // ignore
  }
}

function stopAutoScroll(): void {
  try {
    const auto: any = (window as any).__tpAuto;
    if (typeof (window as any).stopAutoScroll === 'function') {
      (window as any).stopAutoScroll();
      return;
    }
    if (auto && typeof auto.setEnabled === 'function') {
      auto.setEnabled(false);
    }
  } catch {
    // ignore
  }
}

function maybeStartOnLive(phase: SessionPhase): void {
  if (phase !== 'live') {
    try { console.debug('[scroll-session] stopping auto-scroll for phase', phase); } catch {}
    stopAutoScroll();
    stopSpeechBackendForSession('phase-change');
    return;
  }

  const session = getSession();
  const rawMode = appStore.get('scrollMode') as string | undefined;
  const canonicalMode = normalizeScrollMode(rawMode);
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
    session.asrArmed &&
    (canonicalMode === 'asr' || canonicalMode === 'hybrid' || brain === 'asr');
  if (shouldStartSpeech) {
    try { console.debug('[ASR] about to call startSpeech/startBackend', { mode: canonicalMode, reason: 'live-enter' }); } catch {}
    void startSpeechBackendForSession({ reason: 'live-enter', mode: canonicalMode });
  }

  if (!session.scrollAutoOnLive) {
    try { console.debug('[scroll-session] auto-scroll disabled for live phase'); } catch {}
    return;
  }
  if (!shouldAutoStartForMode(rawMode)) {
    try { console.debug('[scroll-session] auto-scroll not allowed for mode', canonicalMode); } catch {}
    return;
  }
  try { console.debug('[scroll-session] live phase with auto-on-live; starting auto-scroll', { mode: canonicalMode }); } catch {}
  startAutoScroll();
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
      if (!shouldAutoStartForMode(rawMode)) {
        try { console.debug('[scroll-session] auto-scroll disabled for this mode (manual block)', { mode: canonicalMode }); } catch {}
        return;
      }
      startAutoScroll();
    });
  } catch {
    // ignore
  }
}
