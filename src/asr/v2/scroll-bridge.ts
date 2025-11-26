import type { AppStore } from '../../state/app-store';
import { ensureOrchestrator } from './bridge-speech';
import type { PaceMode } from './types';

function mapScrollMode(mode?: string): PaceMode {
  const m = (mode || '').toLowerCase();
  if (m === 'asr' || m === 'assist') return 'assist';
  if (m === 'align') return 'align';
  if (m === 'vad') return 'vad';
  return 'off';
}

function applyAutoToggle(mode?: string) {
  const auto = (window as any).__tpAuto;
  try {
    const m = (mode || '').toLowerCase();
    const enable = m !== 'step' && m !== 'off';
    auto?.setEnabled?.(enable);
  } catch {
    // ignore
  }
}

export function initAsrScrollBridge(store: AppStore): void {
  const apply = (mode?: string) => {
    const orch = ensureOrchestrator();
    if (orch) {
      try { orch.setMode(mapScrollMode(mode)); } catch {}
    }
    applyAutoToggle(mode);
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
