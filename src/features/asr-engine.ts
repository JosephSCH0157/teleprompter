// src/features/asr-engine.ts
import { getAsrConfig } from './asr/config';
import { speechStore } from '../state/speech-store';
import type { AsrMode } from './asr-mode';

interface StoreLike {
  get(key: string): unknown;
}

function getStore(): StoreLike | null {
  try {
    const anyWin = window as any;
    return (anyWin.__tpStore as StoreLike) || null;
  } catch {
    return null;
  }
}

function mapEngine(engine: string): string {
  if (engine === 'offline') return 'vosk';
  if (engine === 'whisper') return 'whisper';
  return 'webspeech';
}

export const asrEngine = {
  setEnabled(enabled: boolean) {
    const anyWin = window as any;
    const asrMode = (anyWin.__tpAsrMode as AsrMode | undefined) || null;
    if (!asrMode) {
      if (anyWin.__tpDevMode) console.warn('[ASR-ENGINE] Missing __tpAsrMode; cannot toggle ASR');
      return;
    }

    if (!enabled) {
      if (anyWin.__tpDevMode) console.info('[ASR-ENGINE] Disabling ASR scroll');
      try { asrMode.setEnabled(false); } catch {}
      return;
    }

    const cfg = getAsrConfig(getStore());
    if (anyWin.__tpDevMode) {
      try { console.info('[ASR-ENGINE] Enabling ASR with config', cfg); } catch {}
    }

    // Update speech store with mapped values before starting
    try {
      speechStore.set({
        engine: mapEngine(cfg.engine),
        lang: cfg.language,
        interim: cfg.useInterimResults,
        threshold: cfg.confidenceThreshold,
        endpointingMs: Math.max(0, Math.round(cfg.endpointMicros / 1000)),
        fillerFilter: !!cfg.filterFillers,
      });
    } catch {}

    try { asrMode.setEnabled(true); } catch {}
  },
};
