import type { AppStore } from '../../state/app-store';
import { ensureOrchestrator } from './bridge-speech';
import type { PaceMode } from './types';

function mapScrollMode(mode?: string): PaceMode {
  const m = (mode || '').toLowerCase();

  let pace: PaceMode = 'off';

  if (m === 'asr' || m === 'assist') {
    pace = 'assist';
  } else if (m === 'align') {
    pace = 'align';
  } else if (m === 'vad') {
    pace = 'vad';
  } else if (m === 'auto' || m === 'timed' || m === 'hybrid') {
    pace = 'off';
  } else if (m.startsWith('step') || m === 'rehearsal' || m === 'manual' || m === 'off') {
    pace = 'off';
  }

  return pace;
}

export function initAsrScrollBridge(store: AppStore): void {
  const apply = (mode?: string) => {
    const pace = mapScrollMode(mode);
    const orch = ensureOrchestrator();
    if (orch) {
      try { orch.setMode(pace); } catch {}
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
