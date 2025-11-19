import { isSessionRecording, startSessionRecording, stopSessionRecording } from '../recording/recorderRegistry';
import type { AppStore } from '../state/appStore';

export interface WireRecordButtonsOptions {
  startSelector?: string | string[];
  stopSelector?: string | string[];
}

const DEFAULT_START_SELECTORS = ['#startRecBtn', '[data-action="record-start"]'];
const DEFAULT_STOP_SELECTORS = ['#stopRecBtn', '[data-action="record-stop"]'];

function collectButtons(selector: string | string[] | undefined, fallbacks: string[]): HTMLButtonElement[] {
  const selectors = Array.isArray(selector)
    ? selector
    : typeof selector === 'string' && selector.length > 0
      ? [selector]
      : fallbacks;

  const seen = new Set<HTMLButtonElement>();
  selectors.forEach((sel) => {
    if (!sel) return;
    try {
      const nodes = document.querySelectorAll<HTMLButtonElement>(sel);
      nodes.forEach((btn) => {
        if (btn) seen.add(btn);
      });
    } catch {}
  });
  return Array.from(seen.values());
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

  const startButtons = collectButtons(opts.startSelector, DEFAULT_START_SELECTORS);
  const stopButtons = collectButtons(opts.stopSelector, DEFAULT_STOP_SELECTORS);

  if (startButtons.length === 0 && stopButtons.length === 0) return;

  const getObsEnabled = () => readObsEnabled(store);

  startButtons.forEach((startBtn) => {
    if (startBtn.dataset.recWired) return;
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
  });

  stopButtons.forEach((stopBtn) => {
    if (stopBtn.dataset.recWired) return;
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
  });
}
