import type { AdaptSample } from '../../controllers/adaptiveSpeed';

export interface AsrScrollBridgeApi {
  onSpeechSample(sample: AdaptSample): void;
}

let asrBridgeInstalled = false;

export function installAsrScrollBridge(api: AsrScrollBridgeApi) {
  if (typeof window === 'undefined') return;
  if (!api || typeof api.onSpeechSample !== 'function') return;
  if (asrBridgeInstalled) return;
  asrBridgeInstalled = true;

  const { onSpeechSample } = api;

  const handler = (ev: Event) => {
    const detail = (ev as CustomEvent).detail || {};
    const errPx = Number(detail.errPx);
    if (!Number.isFinite(errPx) || errPx === 0) return;
    const confRaw = Number(detail.conf);
    const conf = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 1;

    const sample: AdaptSample = {
      errPx,
      conf,
      now: performance.now(),
    };

    try {
      onSpeechSample(sample);
    } catch {
      // Ignore downstream errors; bridge should not break event flow
    }
  };

  window.addEventListener('tp:asr:sync', handler as EventListener);
}
