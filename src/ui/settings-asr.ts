// =============================================================
// File: src/ui/settings-asr.ts
// =============================================================
import { speechStore, type SpeechState } from '../state/speech-store';
import { appStore, type AppStore } from '../state/app-store';

let asrSettingsWired = false;
let asrSettingsObserverStarted = false;
let asrSettingsWarned = false;

function resolveStore(store?: AppStore | null): AppStore | null {
  if (store) return store;
  try { return (window as any).__tpStore || appStore || null; } catch { return appStore; }
}

// Wire the existing ASR settings card rendered by the TS builder (Media panel).
export function mountAsrSettings(root: ParentNode = document, store?: AppStore | null): void {
  const card =
    root.querySelector<HTMLElement>('#asrSettingsCard') ||
    root.querySelector<HTMLElement>('.settings-card.asr');

  if (!card) {
    try { console.warn('[ASR] settings card not found (skipping wiring)'); } catch {}
    return;
  }

  if (asrSettingsWired) return;
  asrSettingsWired = true;

  const q = <T extends HTMLElement>(selector: string) => card.querySelector<T>(selector);
  const eng = q<HTMLSelectElement>('#asrEngine');
  const lang = q<HTMLInputElement>('#asrLang');
  const interim = q<HTMLInputElement>('#asrInterim');
  const fillers = q<HTMLInputElement>('#asrFillers');
  const thresh = q<HTMLInputElement>('#asrThresh');
  const endms = q<HTMLInputElement>('#asrEndMs');

  const storeRef = resolveStore(store);
  const storeGet = <T>(key: string, fallback: T): T => {
    try {
      const got = storeRef?.get?.(key as any);
      return (got as T) ?? fallback;
    } catch {
      return fallback;
    }
  };

  const persist = (patch: Partial<SpeechState>) => {
    try { speechStore.set(patch); } catch {}
    try {
      if (!storeRef?.set) return;
      if (patch.engine !== undefined) storeRef.set('asr.engine' as any, patch.engine as any);
      if (patch.lang !== undefined) storeRef.set('asr.language' as any, patch.lang as any);
      if (patch.interim !== undefined) storeRef.set('asr.useInterimResults' as any, !!patch.interim as any);
      if (patch.fillerFilter !== undefined) storeRef.set('asr.filterFillers' as any, !!patch.fillerFilter as any);
      if (patch.threshold !== undefined) storeRef.set('asr.threshold' as any, patch.threshold as any);
      if (patch.endpointingMs !== undefined) storeRef.set('asr.endpointMs' as any, patch.endpointingMs as any);
    } catch {}
  };

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

  // Seed from store (if present) otherwise speech store defaults
  const snapshot = speechStore.get();
  const seeded: SpeechState = {
    engine: storeGet('asr.engine', snapshot.engine),
    lang: storeGet('asr.language', snapshot.lang),
    interim: storeGet('asr.useInterimResults', snapshot.interim),
    fillerFilter: storeGet('asr.filterFillers', snapshot.fillerFilter),
    threshold: storeGet('asr.threshold', snapshot.threshold),
    endpointingMs: storeGet('asr.endpointMs', snapshot.endpointingMs),
  };
  persist(seeded);
  applyState(seeded);

  eng?.addEventListener('change', () => persist({ engine: eng.value as any }));
  lang?.addEventListener('change', () => persist({ lang: lang.value }));
  interim?.addEventListener('change', () => persist({ interim: interim.checked }));
  fillers?.addEventListener('change', () => persist({ fillerFilter: fillers.checked }));
  thresh?.addEventListener('change', () => persist({ threshold: clamp(+thresh.value, 0, 1) }));
  endms?.addEventListener('change', () => persist({ endpointingMs: Math.max(200, Math.round(+endms.value)) }));
}

export function ensureAsrSettingsWired(root: ParentNode = document, store?: AppStore | null): void {
  const tryMount = () => {
    const card =
      (root as Document | ParentNode)?.querySelector?.<HTMLElement>('#asrSettingsCard') ||
      (root as Document | ParentNode)?.querySelector?.<HTMLElement>('.settings-card.asr');

    if (!card) {
      if (!asrSettingsWarned) {
        asrSettingsWarned = true;
        try { console.warn('[ASR] settings card not found (will retry)'); } catch {}
      }
      return false;
    }

    mountAsrSettings(root, store);
    return true;
  };

  if (tryMount()) return;

  document.addEventListener(
    'tp:settings:rendered',
    () => { tryMount(); },
    { once: true },
  );

  if (!asrSettingsObserverStarted) {
    asrSettingsObserverStarted = true;
    const host = (root as Document | ParentNode)?.querySelector?.('#settingsBody') as HTMLElement | null
      || (document.getElementById('settingsBody') as HTMLElement | null)
      || document.body;
    try {
      const obs = new MutationObserver(() => {
        if (tryMount()) {
          try { obs.disconnect(); } catch {}
        }
      });
      obs.observe(host || document.body, { subtree: true, childList: true });
    } catch {}
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
