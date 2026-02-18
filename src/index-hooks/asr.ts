// =============================================================
// File: src/index-hooks/asr.ts
// =============================================================
import { AsrMode } from '../features/asr-mode';
import { installAsrHotkeys } from '../hotkeys/asr-hotkeys';
import { ensureAsrSettingsWired } from '../ui/settings-asr';
import { AsrTopbar } from '../ui/topbar-asr';
export { AsrMode } from '../features/asr-mode';

type LegacyAsrModeShim = Pick<AsrMode, 'setEnabled' | 'start' | 'stop'> & {
  __tpLegacyShim?: true;
};

let asrFeatureInitialized = false;
let asrTopbarMounted = false;
let legacyShimWarned = false;
let legacyOverrideWarned = false;

function allowLegacyAsrModeRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if ((window as any).__tpAllowLegacyAsrMode === true) return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('legacyAsrMode') === '1') return true;
  } catch {}
  return false;
}

function isSpeechLoaderShim(value: unknown): value is LegacyAsrModeShim {
  return !!value && typeof (value as any).setEnabled === 'function' && (value as any).__tpLegacyShim === true;
}

function ensureLegacyAsrModeShim(): LegacyAsrModeShim {
  const existing = (window as any).__tpAsrMode as any;
  if (isSpeechLoaderShim(existing)) {
    return existing;
  }
  const allowLegacy = allowLegacyAsrModeRuntime();
  if (allowLegacy && existing && typeof existing.setEnabled === 'function') {
    return existing as LegacyAsrModeShim;
  }
  if (existing && typeof existing.stop === 'function') {
    try { void existing.stop(); } catch {}
  }
  const shim: LegacyAsrModeShim = {
    __tpLegacyShim: true,
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
  if (existing && !allowLegacy && typeof existing.setEnabled === 'function' && !legacyOverrideWarned) {
    legacyOverrideWarned = true;
    try {
      console.warn('[ASR] overriding non-shim __tpAsrMode (speech-loader owns runtime). Use ?legacyAsrMode=1 to allow legacy mode runtime.');
    } catch {}
  }
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
