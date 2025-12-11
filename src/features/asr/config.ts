// src/features/asr/config.ts

export type AsrEngineId = 'web-speech' | 'offline' | 'whisper';

export interface AsrConfig {
  engine: AsrEngineId;
  language: string;
  useInterimResults: boolean;
  filterFillers: boolean;
  confidenceThreshold: number; // 0.0–1.0
  endpointMicros: number; // microseconds of silence
}

interface StoreLike {
  get(key: string): unknown;
}

export function getAsrConfig(store: StoreLike | null): AsrConfig {
  if (!store) {
    return {
      engine: 'web-speech',
      language: 'en-US',
      useInterimResults: true,
      filterFillers: true,
      confidenceThreshold: 0.55,
      endpointMicros: 900_000,
    };
  }

  const engine = (store.get('asr.engine') as string) || 'web-speech';
  const language = (store.get('asr.language') as string) || 'en-US';
  const useInterimResults = !!store.get('asr.useInterimResults');
  const filterFillers = !!store.get('asr.filterFillers');

  const thresholdRaw = store.get('asr.threshold');
  const threshold = typeof thresholdRaw === 'number' ? thresholdRaw : 0.55;

  const endpointRaw = store.get('asr.endpointMicros');
  const endpointMicros = typeof endpointRaw === 'number' ? endpointRaw : 900_000;

  const engineNorm: AsrEngineId =
    engine === 'offline' ? 'offline' : engine === 'whisper' ? 'whisper' : 'web-speech';

  return {
    engine: engineNorm,
    language,
    useInterimResults,
    filterFillers,
    confidenceThreshold: Math.min(1, Math.max(0, threshold)),
    endpointMicros: endpointMicros > 0 ? endpointMicros : 900_000,
  };
}
