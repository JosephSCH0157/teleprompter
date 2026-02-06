import { getRecordingMode, type RecordingMode } from '../recording/recording-settings';

export function applyRecordingModeUi(mode?: RecordingMode): void {
  try {
    const resolved = mode || getRecordingMode();
    const root = document.documentElement;
    root.classList.toggle('tp-audio-only', resolved === 'audio');
    root.dataset.recordingMode = resolved;
  } catch {}
}

export function initRecordingModeUi(): void {
  applyRecordingModeUi();
}
