import { appStore } from '../state/app-store';
import { getAsrState } from './store';

export type AsrNotReadyReason = 'NO_PERMISSION' | 'NO_DEVICE' | 'NOT_READY';
export type AsrWarnReason = 'NOT_CALIBRATED';

export function computeAsrReadiness(): { ready: true; warn?: AsrWarnReason } | { ready: false; reason: AsrNotReadyReason } {
  try {
    const micGranted = !!appStore.get?.('micGranted');
    if (!micGranted) return { ready: false, reason: 'NO_PERMISSION' };

    const micDevice = String(appStore.get?.('micDevice') || '').trim();
    const micOpen = !!(window as any).__tpMic?.__lastStream || !!(window as any).__tpMic?.isOpen?.();
    if (!micDevice && !micOpen) return { ready: false, reason: 'NO_DEVICE' };

    try {
      const asrState = getAsrState?.();
      const active = asrState?.activeProfileId && asrState.profiles?.[asrState.activeProfileId];
      if (!active) return { ready: true, warn: 'NOT_CALIBRATED' };
    } catch {
      // ignore ASR state failures
    }

    return { ready: true };
  } catch {
    return { ready: true };
  }
}
