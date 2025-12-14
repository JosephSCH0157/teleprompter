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
    let activeProfile: any = null;
    try {
      const asrState = getAsrState?.();
      activeProfile = asrState?.activeProfileId && asrState.profiles?.[asrState.activeProfileId];
    } catch {
      // ignore ASR state failures
    }
    const hasDevice = !!micDevice || !!activeProfile?.deviceId || micOpen;
    if (!hasDevice) return { ready: false, reason: 'NO_DEVICE' };

    if (!activeProfile) return { ready: true, warn: 'NOT_CALIBRATED' };

    return { ready: true };
  } catch {
    return { ready: true };
  }
}
