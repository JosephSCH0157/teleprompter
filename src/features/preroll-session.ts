import { appStore } from '../state/app-store';
import {
  setSessionPhase,
  type SessionPhase,
  type RecordReason,
} from '../state/session';
import { computeAsrReadiness } from '../asr/readiness';
import { wantsAutoRecord } from '../recording/wantsAutoRecord';
import { listRecorders } from '../recording/recorderRegistry';
import { getRecordingEngine, getRecordingMode } from '../recording/recording-settings';
import {
  normalizeScrollMode,
  shouldAutoStartForMode,
} from './scroll/scroll-mode-utils';

function computeScrollAutoOnLive(): boolean {
  try {
    const mode = appStore.get('scrollMode') as string | undefined;
    return shouldAutoStartForMode(mode);
  } catch {
    return true;
  }
}

function hasMicDevice(): boolean {
  try {
    const micId = appStore.get('micDevice');
    if (micId && typeof micId === 'string') return true;
  } catch {
    // ignore
  }
  try {
    return !!(window as any).__tpMic?.__lastStream || !!(window as any).__tpMic?.isOpen?.();
  } catch {
    return true;
  }
}

function hasCameraActive(): boolean {
  try {
    const cam = (window as any).__tpCamera;
    if (cam && typeof cam.isActive === 'function') return !!cam.isActive();
    if (cam && cam.__lastStream) return true;
  } catch {
    // ignore
  }
  return false;
}

function computeRecordArmOnLive(recordingEnabledOverride?: boolean): { recordOnLive: boolean; reason: RecordReason } {
  try {
    const recordingEnabled = typeof recordingEnabledOverride === 'boolean' ? recordingEnabledOverride : wantsAutoRecord();
    const mode = normalizeScrollMode(appStore.get('scrollMode') as string | undefined);
    const inRehearsal = mode === 'rehearsal';

    if (inRehearsal) {
      return { recordOnLive: false, reason: 'rehearsal-mode' };
    }

    if (!recordingEnabled) {
      return { recordOnLive: false, reason: 'disabled-by-settings' };
    }

    const recordingMode = getRecordingMode();
    const engine = getRecordingEngine();
    const needsCamera = recordingMode === 'av' && engine === 'core';
    if (needsCamera && !hasCameraActive()) {
      try {
        window.dispatchEvent(
          new CustomEvent('tp:session:warning', {
            detail: {
              type: 'camera',
              message: 'Camera not ready; recording disabled for this run.',
            },
          }),
        );
      } catch {
        // ignore
      }
      return { recordOnLive: false, reason: 'no-camera' };
    }

    if (!hasMicDevice()) {
      return { recordOnLive: false, reason: 'no-mic' };
    }

    if (listRecorders().length === 0) {
      return { recordOnLive: false, reason: 'recorder-not-ready' };
    }

    return { recordOnLive: true, reason: 'auto' };
  } catch {
    return { recordOnLive: false, reason: 'error' };
  }
}

function computeAsrDesired(): boolean {
  try {
    const mode = String(appStore.get('scrollMode') || '').toLowerCase();
    return mode === 'asr' || mode === 'hybrid';
  } catch {
    return false;
  }
}

function computeAsrArmed(desired: boolean): boolean {
  if (!desired) return false;
  try {
    const readiness = computeAsrReadiness();
    return !!readiness.ready;
  } catch {
    return false;
  }
}

function snapshotPreroll(): void {
  const mode = normalizeScrollMode(appStore.get('scrollMode') as string | undefined);
  const scrollAutoOnLive = computeScrollAutoOnLive();
  const autoRecordEnabled = wantsAutoRecord();
  const { recordOnLive, reason } = computeRecordArmOnLive(autoRecordEnabled);
  const asrDesired = computeAsrDesired();
  const asrArmed = computeAsrArmed(asrDesired);
  const autoRecord = !!appStore.get('autoRecord');
  const hasMic = hasMicDevice();

  appStore.set('session.scrollAutoOnLive', scrollAutoOnLive);
  appStore.set('session.recordOnLive', recordOnLive);
  appStore.set('session.recordReason', reason);
  try {
    console.debug('[session/preroll] recording arm', { autoRecordEnabled, recordOnLive, reason });
  } catch {
    // ignore
  }
  appStore.set('session.asrDesired', asrDesired);
  appStore.set('session.asrArmed', asrArmed);
  appStore.set('session.asrReady', asrArmed);

  try {
    console.debug(
      '[session/preroll]',
      { mode, autoRecord, hasMic },
      { scrollAutoOnLive, recordOnLive, recordReason: reason, asrDesired, asrArmed },
    );
  } catch {
    // ignore
  }
}

function showCountdown(n: number): void {
  try {
    const overlay = document.getElementById('countOverlay');
    const num = document.getElementById('countNum');
    if (overlay) overlay.style.display = 'flex';
    if (num) num.textContent = String(n);
    if (typeof (window as any).sendToDisplay === 'function') {
      (window as any).sendToDisplay({ type: 'preroll', show: true, n });
    }
  } catch {
    // best-effort only
  }
}

function hideCountdown(): void {
  try {
    const overlay = document.getElementById('countOverlay');
    if (overlay) overlay.style.display = 'none';
    if (typeof (window as any).sendToDisplay === 'function') {
      (window as any).sendToDisplay({ type: 'preroll', show: false });
    }
  } catch {
    // ignore
  }
}

async function runCountdown(seconds: number): Promise<void> {
  const s = Math.max(0, Math.round(seconds));
  if (s <= 0) return;
  for (let i = s; i > 0; i--) {
    showCountdown(i);
    try {
      (window as any).HUD?.bus?.emit?.('speech:countdown', { remaining: i });
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  hideCountdown();
}

let prerollRunning = false;

export function completePrerollSession(detail: { seconds: number; source: string }): void {
  setSessionPhase('live');
  try {
    window.dispatchEvent(
      new CustomEvent('tp:preroll:done', {
        detail,
      }),
    );
  } catch {
    // ignore
  }
}

async function onPhaseChange(phase: SessionPhase): Promise<void> {
  if (phase !== 'preroll') return;
  if (prerollRunning) return;
  prerollRunning = true;

  snapshotPreroll();

  const seconds = (() => {
    try {
      return Number(appStore.get('prerollSeconds') || 0);
    } catch {
      return 0;
    }
  })();

  try {
    await runCountdown(seconds);
  } catch {
    // ignore countdown failures
  }

  try {
    completePrerollSession({ seconds, source: 'session' });
  } finally {
    prerollRunning = false;
  }
}

export function initPrerollSession(): void {
  try {
    appStore.subscribe('session.phase', (p) =>
      onPhaseChange(p as SessionPhase),
    );
  } catch {
    // ignore
  }
  try {
    window.addEventListener('tp:session:start', () => {
      onPhaseChange('preroll');
    });
  } catch {
    // ignore
  }
}
