import { appStore } from '../state/app-store';
import {
  type SessionPhase,
} from '../state/session';
import {
  isSessionRecording,
  startSessionRecording,
  stopSessionRecording,
} from '../recording/recorderRegistry';

function maybeStartOnLive(phase: SessionPhase): void {
  if (phase !== 'live') return;

  const shouldRecord = !!appStore.get('session.recordOnLive');
  const reason = appStore.get('session.recordReason');
  if (!shouldRecord) {
    try {
      console.log('[session] recording not armed; reason=', reason);
    } catch {
      // ignore
    }
    return;
  }

  try {
    const obsEnabled = !!appStore.get('obsEnabled');
    try {
      console.debug('[recording-session] live phase', {
        recordOnLive: shouldRecord,
        reason,
        obsEnabled,
      });
    } catch {}
    startSessionRecording({ obsEnabled }).catch((err) => {
      console.warn('[session] startSessionRecording failed', err);
    });
  } catch (err) {
    try {
      console.warn('[session] recorder start failed', err);
    } catch {
      // ignore
    }
  }
}

function maybeStopOnEnd(phase: SessionPhase): void {
  if (phase !== 'wrap' && phase !== 'idle') return;
  if (!isSessionRecording()) return;
  try {
    console.debug('[recording-session] stopping recorders; phase=', phase);
  } catch {
    // ignore
  }
  try {
    stopSessionRecording().catch(() => {});
  } catch {
    // ignore
  }
}

export function initRecordingSession(): void {
  try {
    appStore.subscribe('session.phase', (p) => {
      const phase = p as SessionPhase;
      maybeStartOnLive(phase);
      maybeStopOnEnd(phase);
    });
  } catch {
    // ignore
  }
}
