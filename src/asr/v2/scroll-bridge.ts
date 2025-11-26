import type { AppStore } from '../../state/app-store';
import { ensureOrchestrator } from './bridge-speech';
import type { PaceMode } from './types';

function mapScrollMode(mode?: string): { pace: PaceMode; enableAuto: boolean } {
  const m = (mode || '').toLowerCase();

  // Default: manual/off
  let pace: PaceMode = 'off';
  let enableAuto = false;

  if (m === 'asr' || m === 'assist') {
    pace = 'assist';
    enableAuto = true;
  } else if (m === 'align') {
    pace = 'align';
    enableAuto = true;
  } else if (m === 'vad') {
    pace = 'vad';
    enableAuto = true;
  } else if (m === 'auto' || m === 'timed' || m === 'hybrid') {
    // Timed/auto scroll: let classic auto engine run, but ASR pace stays off
    pace = 'off';
    enableAuto = true;
  } else if (m.startsWith('step') || m === 'rehearsal' || m === 'manual' || m === 'off') {
    pace = 'off';
    enableAuto = false;
  }

  return { pace, enableAuto };
}

export function initAsrScrollBridge(store: AppStore): void {
  const apply = (mode?: string) => {
    const { pace, enableAuto } = mapScrollMode(mode);
    const orch = ensureOrchestrator();
    if (orch) {
      try { orch.setMode(pace); } catch {}
    }
    try {
      const auto = (window as any).__tpAuto;
      auto?.setEnabled?.(enableAuto);
    } catch {
      // ignore
    }
  };

  try { apply(store.get('scrollMode') as string | undefined); } catch {}
  try {
    store.subscribe('scrollMode', (mode) => {
      apply(mode as any);
    });
  } catch {
    // ignore
  }
}
