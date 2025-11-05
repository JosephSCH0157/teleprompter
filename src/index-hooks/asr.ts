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
  const topbar = new AsrTopbar(mode);
  try { topbar.mount('.topbar, #topbarRight, header, body'); } catch {}

  const start = () => { mode.start?.(); };
  const stop = () => { mode.stop?.(); };

  window.addEventListener('asr:toggle', (e: any) => {
    const armed = !!e?.detail?.armed;
    armed ? start() : stop();
  });
  window.addEventListener('asr:stop', stop);

  // No auto-start; user can use the topbar button or Alt+L hotkey.
}
