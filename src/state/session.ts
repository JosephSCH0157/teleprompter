import { appStore } from './app-store';

export type SessionPhase = 'idle' | 'preroll' | 'live' | 'wrap';

export type RecordReason =
  | 'auto'
  | 'manual'
  | 'disabled'
  | 'no-mic'
  | 'error'
  | null;

export interface SessionState {
  phase: SessionPhase;
  scrollAutoOnLive: boolean;
  recordOnLive: boolean;
  recordReason: RecordReason;
  asrReady: boolean;
}

export function initSession(): void {
  appStore.set('session.phase', 'idle');
  appStore.set('session.scrollAutoOnLive', false);
  appStore.set('session.recordOnLive', false);
  appStore.set('session.recordReason', null);
  appStore.set('session.asrReady', false);
}

export function setSessionPhase(phase: SessionPhase): void {
  appStore.set('session.phase', phase);
  try {
    window.dispatchEvent(
      new CustomEvent('tp:session:phase', { detail: { phase } }),
    );
  } catch {
    // ignore dispatch failures (non-browser env)
  }
}

export function getSession(): SessionState {
  return {
    phase: (appStore.get('session.phase') as SessionPhase) || 'idle',
    scrollAutoOnLive: !!appStore.get('session.scrollAutoOnLive'),
    recordOnLive: !!appStore.get('session.recordOnLive'),
    recordReason: (appStore.get('session.recordReason') as RecordReason) || null,
    asrReady: !!appStore.get('session.asrReady'),
  };
}
