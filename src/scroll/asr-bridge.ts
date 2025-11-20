import type { AdaptSample } from '../../controllers/adaptiveSpeed';

export interface AsrSilenceDetail {
  silent: boolean;
  ts?: number;
}

export interface AsrScrollBridgeApi {
  onSpeechSample(sample: AdaptSample): void;
  reportSilence?(detail: AsrSilenceDetail): void;
}

let asrBridgeInstalled = false;

export function installAsrScrollBridge(api: AsrScrollBridgeApi) {
  if (typeof window === 'undefined') return;
  if (!api || typeof api.onSpeechSample !== 'function') return;
  if (asrBridgeInstalled) return;
  asrBridgeInstalled = true;

  const { onSpeechSample, reportSilence } = api;

  const sampleHandler = (ev: Event) => {
    const detail = (ev as CustomEvent).detail || {};
    const errPx = Number(detail.errPx);
    if (!Number.isFinite(errPx) || errPx === 0) return;
    const confRaw = Number(detail.conf);
    const conf = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 1;
    const ts = typeof detail.ts === 'number' ? detail.ts : performance.now();

    const sample: AdaptSample = {
      errPx,
      conf,
      now: ts,
    };

    try {
      onSpeechSample(sample);
    } catch {
      // Ignore downstream errors; bridge should not break event flow
    }
  };

  window.addEventListener('tp:asr:sync', sampleHandler as EventListener);

  if (typeof reportSilence === 'function') {
    const silenceHandler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail || {};
      try {
        reportSilence({
          silent: !!detail.silent,
          ts: typeof detail.ts === 'number' ? detail.ts : performance.now(),
        });
      } catch {
        // downstream errors are ignored to keep bridge resilient
      }
    };
    window.addEventListener('tp:asr:silence', silenceHandler as EventListener);
  }
}
