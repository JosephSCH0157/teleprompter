import { isSessionRecording, startSessionRecording, stopSessionRecording } from '../recording/recorderRegistry';
import type { AppStore } from '../state/appStore';

export interface WireRecordButtonsOptions {
  startSelector?: string;
  stopSelector?: string;
}

function readObsEnabled(store: AppStore | null | undefined): boolean {
  try {
    if (store) {
      if (typeof store.getSnapshot === 'function') {
        const snap = store.getSnapshot();
        if (snap && typeof snap.obsEnabled === 'boolean') return !!snap.obsEnabled;
      }
      if (store.state && typeof store.state.obsEnabled === 'boolean') {
        return !!store.state.obsEnabled;
      }
      if (typeof store.get === 'function') {
        const val = store.get('obsEnabled');
        if (typeof val === 'boolean') return val;
      }
    }
  } catch {}
  return false;
}

export function wireRecordButtons(store?: AppStore | null, opts: WireRecordButtonsOptions = {}): void {
  if (typeof document === 'undefined') return;

  const startSel = opts.startSelector || '#startRecBtn';
  const stopSel = opts.stopSelector || '#stopRecBtn';
  const startBtn = document.querySelector<HTMLButtonElement>(startSel);
  const stopBtn = document.querySelector<HTMLButtonElement>(stopSel);

  if (!startBtn && !stopBtn) return;

  const getObsEnabled = () => readObsEnabled(store);

  if (startBtn && !startBtn.dataset.recWired) {
    startBtn.dataset.recWired = '1';
    startBtn.addEventListener('click', async () => {
      if (startBtn.disabled) return;
      startBtn.disabled = true;
      try {
        await startSessionRecording({ obsEnabled: getObsEnabled() });
      } catch (err) {
        console.warn('[recording] manual start failed', err);
      } finally {
        startBtn.disabled = false;
      }
    });
  }

  if (stopBtn && !stopBtn.dataset.recWired) {
    stopBtn.dataset.recWired = '1';
    stopBtn.addEventListener('click', async () => {
      if (stopBtn.disabled) return;
      stopBtn.disabled = true;
      try {
        if (isSessionRecording()) {
          await stopSessionRecording();
        }
      } catch (err) {
        console.warn('[recording] manual stop failed', err);
      } finally {
        stopBtn.disabled = false;
      }
    });
  }
}
