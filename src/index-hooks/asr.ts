// =============================================================
// File: src/index-hooks/asr.ts
// =============================================================
import { AsrMode } from '../features/asr-mode';
import { installAsrHotkeys } from '../hotkeys/asr-hotkeys';
import { mountAsrSettings } from '../ui/settings-asr';
import { AsrTopbar } from '../ui/topbar-asr';

export function initAsrFeature() {
  // Wire UI settings
  mountAsrSettings('#settingsSpeech, #settings, body');
  installAsrHotkeys();

  // Create coordinator and topbar UI
  const mode = new AsrMode();
  // Optional status-only topbar (no Start/Stop button)
  try { new AsrTopbar(mode).mount('#topbarRight, .topbar, header, body'); } catch {}

  const start = () => { try { if (mode.getState?.() !== 'running' && mode.getState?.() !== 'listening') mode.start?.(); } catch { mode.start?.(); } };
  const stop = () => { mode.stop?.(); };

  // Wire ASR lifecycle to Speech Sync and mode changes
  const getMode = (): string => {
    try { return (document.getElementById('scrollMode') as HTMLSelectElement | null)?.value || ''; } catch { return ''; }
  };
  const speechOn = (): boolean => {
    try { return document.body.classList.contains('speech-listening') || (window as any).speechOn === true; } catch { return false; }
  };
  const reconcile = () => { try { (speechOn() && getMode() === 'asr') ? start() : stop(); } catch {} };

  window.addEventListener('tp:speech-state', reconcile);
  document.addEventListener('change', (e: any) => { try { if (e?.target?.id === 'scrollMode') reconcile(); } catch {} });

  // Keep hotkey support for advanced users (optional override)
  window.addEventListener('asr:toggle', (e: any) => {
    const armed = !!e?.detail?.armed;
    armed ? start() : stop();
  });
  window.addEventListener('asr:stop', stop);

  // Initial pass (covers case when ASR module loads after speech already started)
  reconcile();
}
