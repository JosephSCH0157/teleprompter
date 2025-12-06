import { appStore } from '../state/app-store';
import {
  setSessionPhase,
  type SessionPhase,
  type RecordReason,
} from '../state/session';

function computeScrollAutoOnLive(): boolean {
  try {
    const mode = String(appStore.get('scrollMode') || '').toLowerCase();
    if (mode === 'step' || mode === 'rehearsal') return false;
    return true;
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

function computeRecordArmOnLive(): { recordOnLive: boolean; reason: RecordReason } {
  try {
    const autoRecord = !!appStore.get('autoRecord');
    const mode = String(appStore.get('scrollMode') || '').toLowerCase();

    if (!autoRecord) return { recordOnLive: false, reason: 'manual' };
    if (mode === 'step' || mode === 'rehearsal') {
      return { recordOnLive: false, reason: 'disabled' };
    }
    if (!hasMicDevice()) {
      return { recordOnLive: false, reason: 'no-mic' };
    }
    return { recordOnLive: true, reason: 'auto' };
  } catch {
    return { recordOnLive: false, reason: 'error' };
  }
}

function computeAsrReady(): boolean {
  try {
    const mode = String(appStore.get('scrollMode') || '').toLowerCase();
    return mode === 'asr' || mode === 'hybrid';
  } catch {
    return false;
  }
}

function snapshotPreroll(): void {
  const mode = String(appStore.get('scrollMode') || 'manual');
  const scrollAutoOnLive = computeScrollAutoOnLive();
  const { recordOnLive, reason } = computeRecordArmOnLive();
  const asrReady = computeAsrReady();
  const autoRecord = !!appStore.get('autoRecord');
  const hasMic = hasMicDevice();

  appStore.set('session.scrollAutoOnLive', scrollAutoOnLive);
  appStore.set('session.recordOnLive', recordOnLive);
  appStore.set('session.recordReason', reason);
  appStore.set('session.asrReady', asrReady);

  try {
    console.debug(
      '[session/preroll]',
      { mode, autoRecord, hasMic },
      { scrollAutoOnLive, recordOnLive, recordReason: reason, asrReady },
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

  setSessionPhase('live');
  try {
    window.dispatchEvent(
      new CustomEvent('tp:preroll:done', {
        detail: { seconds, source: 'session' },
      }),
    );
  } catch {
    // ignore
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
