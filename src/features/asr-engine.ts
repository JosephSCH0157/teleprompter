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

type LegacyAsrModeCompat = Pick<AsrMode, 'setEnabled'> & {
  __tpLegacyShim?: true;
};

let legacyAsrModeBlockedWarned = false;

function allowLegacyAsrModeRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if ((window as any).__tpAllowLegacyAsrMode === true) return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('legacyAsrMode') === '1') return true;
  } catch {}
  return false;
}

function resolveLegacyAsrModeCompat(): LegacyAsrModeCompat | null {
  const anyWin = window as any;
  const mode = (anyWin.__tpAsrMode as LegacyAsrModeCompat | undefined) || null;
  if (!mode || typeof mode.setEnabled !== 'function') return null;
  if (mode.__tpLegacyShim === true) return mode;
  if (allowLegacyAsrModeRuntime()) return mode;
  if (!legacyAsrModeBlockedWarned) {
    legacyAsrModeBlockedWarned = true;
    try {
      console.warn('[ASR-ENGINE] blocked non-shim __tpAsrMode to prevent dual runtime. Use ?legacyAsrMode=1 to allow.');
    } catch {}
  }
  return null;
}

export const asrEngine = {
  setEnabled(enabled: boolean) {
    const anyWin = window as any;
    const asrMode = resolveLegacyAsrModeCompat();

    if (!enabled) {
      if (anyWin.__tpDevMode) console.info('[ASR-ENGINE] Disabling ASR scroll');
      try { asrMode?.setEnabled?.(false); } catch {}
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

    // Legacy compatibility only. Runtime ASR ownership lives in speech-loader.
    try { asrMode?.setEnabled?.(true); } catch {}
  },
};
