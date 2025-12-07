// =============================================================
// File: src/ui/settings-asr.ts
// =============================================================
import { speechStore, type SpeechState } from '../state/speech-store';

// Wire the existing ASR settings card rendered by the TS builder (Media panel).
export function mountAsrSettings(root: ParentNode = document): void {
  const card =
    root.querySelector<HTMLElement>('#asrSettingsCard') ||
    root.querySelector<HTMLElement>('.settings-card.asr');

  if (!card) {
    try { console.warn('[ASR] settings card not found (skipping wiring)'); } catch {}
    return;
  }

  const q = <T extends HTMLElement>(selector: string) => card.querySelector<T>(selector);
  const eng = q<HTMLSelectElement>('#asrEngine');
  const lang = q<HTMLInputElement>('#asrLang');
  const interim = q<HTMLInputElement>('#asrInterim');
  const fillers = q<HTMLInputElement>('#asrFillers');
  const thresh = q<HTMLInputElement>('#asrThresh');
  const endms = q<HTMLInputElement>('#asrEndMs');

  const applyState = (s: SpeechState) => {
    if (eng && typeof s.engine === 'string') {
      try { eng.value = s.engine; } catch {}
    }
    if (lang && typeof s.lang === 'string') {
      lang.value = s.lang;
    }
    if (interim) interim.checked = !!s.interim;
    if (fillers) fillers.checked = !!s.fillerFilter;
    if (thresh && typeof s.threshold === 'number') {
      thresh.value = String(s.threshold);
    }
    if (endms && typeof s.endpointingMs === 'number') {
      endms.value = String(s.endpointingMs);
    }
  };

  applyState(speechStore.get());

  eng?.addEventListener('change', () => speechStore.set({ engine: eng.value as any }));
  lang?.addEventListener('change', () => speechStore.set({ lang: lang.value }));
  interim?.addEventListener('change', () => speechStore.set({ interim: interim.checked }));
  fillers?.addEventListener('change', () => speechStore.set({ fillerFilter: fillers.checked }));
  thresh?.addEventListener('change', () => speechStore.set({ threshold: clamp(+thresh.value, 0, 1) }));
  endms?.addEventListener('change', () => speechStore.set({ endpointingMs: Math.max(200, Math.round(+endms.value)) }));
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
