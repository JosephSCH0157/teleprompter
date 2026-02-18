// =============================================================
// File: src/index-hooks/asr.ts
// =============================================================
import { AsrMode } from '../features/asr-mode';
import { installAsrHotkeys } from '../hotkeys/asr-hotkeys';
import { ensureAsrSettingsWired } from '../ui/settings-asr';
import { AsrTopbar } from '../ui/topbar-asr';
export { AsrMode } from '../features/asr-mode';

type LegacyAsrModeShim = Pick<AsrMode, 'setEnabled' | 'start' | 'stop'>;

let asrFeatureInitialized = false;
let asrTopbarMounted = false;
let legacyShimWarned = false;

function ensureLegacyAsrModeShim(): LegacyAsrModeShim {
  const existing = (window as any).__tpAsrMode as LegacyAsrModeShim | undefined;
  if (existing && typeof existing.setEnabled === 'function') {
    return existing;
  }
  const shim: LegacyAsrModeShim = {
    async setEnabled(_enabled: boolean) {
      if (!(window as any).__tpDevMode || legacyShimWarned) return;
      legacyShimWarned = true;
      try {
        console.info('[ASR] legacy __tpAsrMode shim active; speech-loader owns ASR runtime');
      } catch {}
    },
    async start() {
      // Compatibility no-op: speech-loader/session pipeline owns runtime start.
    },
    async stop() {
      // Compatibility no-op: speech-loader/session pipeline owns runtime stop.
    },
  };
  (window as any).__tpAsrMode = shim;
  return shim;
}

function mountAsrTopbarOnce(modeShim: LegacyAsrModeShim): void {
  if (asrTopbarMounted) return;
  asrTopbarMounted = true;
  try { new AsrTopbar(modeShim as AsrMode).mount('#topbarRight, .topbar, header, body'); } catch {}
}

export function initAsrFeature() {
  if (asrFeatureInitialized) return;
  asrFeatureInitialized = true;
  ensureAsrSettingsWired(document.getElementById('settingsBody') || document);
  installAsrHotkeys();
  const modeShim = ensureLegacyAsrModeShim();
  mountAsrTopbarOnce(modeShim);
}
