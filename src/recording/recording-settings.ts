export type RecordingMode = 'av' | 'audio';
export type RecordingEngine = 'core' | 'obs';

const SETTINGS_KEY = 'tp_rec_settings_v1';

type RawRecorderSettings = {
  mode?: string;
  selected?: unknown;
  recordingMode?: string;
};

function readRawSettings(): RawRecorderSettings | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage?.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as RawRecorderSettings;
  } catch {
    return null;
  }
}

function normalizeSelected(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v)).filter(Boolean);
}

export function getRecordingMode(): RecordingMode {
  const raw = readRawSettings();
  const mode = String(raw?.recordingMode || '').toLowerCase();
  const resolved: RecordingMode = mode === 'audio' ? 'audio' : 'av';
  if (resolved === 'audio' && getRecordingEngine() === 'obs') return 'av';
  return resolved;
}

export function getRecordingEngine(): RecordingEngine {
  const raw = readRawSettings();
  const selected = normalizeSelected(raw?.selected);
  const mode = String(raw?.mode || '').toLowerCase();

  if (mode === 'single') {
    if (selected.includes('obs')) return 'obs';
    if (selected.includes('core')) return 'core';
  }

  if (selected.includes('obs') && !selected.includes('core')) return 'obs';
  return 'core';
}

export function isAudioOnlyRecording(): boolean {
  return getRecordingMode() === 'audio';
}

export function isObsEngineSelected(): boolean {
  return getRecordingEngine() === 'obs';
}
