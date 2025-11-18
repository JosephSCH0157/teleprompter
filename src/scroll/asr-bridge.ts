import type { AdaptSample } from '../../controllers/adaptiveSpeed';
import type { ScrollBrain } from './scroll-brain';

type BrainGetter = () => ScrollBrain | undefined;

let asrBridgeInstalled = false;

export function installAsrScrollBridge(getBrain: BrainGetter) {
  if (typeof window === 'undefined') return;
  if (asrBridgeInstalled) return;
  asrBridgeInstalled = true;

  window.addEventListener('tp:asr:sync', (ev: Event) => {
    const brain = getBrain();
    if (!brain) return;

    const detail = (ev as CustomEvent).detail || {};
    const errPx = Number(detail.errPx);
    if (!Number.isFinite(errPx)) return;
    const confRaw = Number(detail.conf);
    const conf = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 1;

    const sample: AdaptSample = {
      errPx,
      conf,
      now: performance.now(),
    };

    brain.onSpeechSample(sample);
  });
}
