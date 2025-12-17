// =============================================================
// File: src/ui/settings-asr.ts
// =============================================================
import { speechStore, type SpeechState } from '../state/speech-store';
import { appStore, type AppStore } from '../state/app-store';

let asrSettingsObserverStarted = false;
let asrSettingsWarned = false;
let asrSettingsRenderEventFired = false;

function resolveStore(store?: AppStore | null): AppStore | null {
  if (store) return store;
  try { return (window as any).__tpStore || appStore || null; } catch { return appStore; }
}

type SettingsSaveStatus = {
  state: 'idle' | 'saving' | 'saved' | 'failed';
  at: number;
  error?: string;
};

function findAsrCard(root: ParentNode = document): HTMLElement | null {
  return (
    (root as Document | ParentNode)?.querySelector?.<HTMLElement>('#asrSettingsCard') ||
    (root as Document | ParentNode)?.querySelector?.<HTMLElement>('.settings-card.asr') ||
    null
  );
}

function readAsrPatchFromCard(card: HTMLElement): Partial<SpeechState> {
  const patch: Partial<SpeechState> = {};
  const q = <T extends HTMLElement>(selector: string) => card.querySelector<T>(selector);
  const eng = q<HTMLSelectElement>('#asrEngine');
  const lang = q<HTMLInputElement>('#asrLang');
  const interim = q<HTMLInputElement>('#asrInterim');
  const fillers = q<HTMLInputElement>('#asrFillers');
  const thresh = q<HTMLInputElement>('#asrThresh');
  const endms = q<HTMLInputElement>('#asrEndMs');

  if (eng) patch.engine = eng.value || '';
  if (lang) patch.lang = lang.value || '';
  if (interim) patch.interim = !!interim.checked;
  if (fillers) patch.fillerFilter = !!fillers.checked;
  if (thresh) {
    const val = parseFloat(thresh.value);
    if (!Number.isNaN(val)) {
      patch.threshold = clamp(val, 0, 1);
    }
  }
  if (endms) {
    const val = Math.round(+endms.value);
    if (!Number.isNaN(val)) {
      patch.endpointingMs = Math.max(200, val);
    }
  }
  return patch;
}

function persistAsrPatch(patch: Partial<SpeechState>, store?: AppStore | null): void {
  try { speechStore.set(patch); } catch {}
  try {
    const resolved = resolveStore(store);
    if (!resolved) return;
    if (patch.engine !== undefined) resolved.set('asr.engine', patch.engine as any);
    if (patch.lang !== undefined) resolved.set('asr.language', patch.lang as any);
    if (patch.interim !== undefined) resolved.set('asr.useInterimResults', !!patch.interim as any);
    if (patch.fillerFilter !== undefined) resolved.set('asr.filterFillers', !!patch.fillerFilter as any);
    if (patch.threshold !== undefined) resolved.set('asr.threshold', patch.threshold as any);
    if (patch.endpointingMs !== undefined) resolved.set('asr.endpointMs', patch.endpointingMs as any);
  } catch {}
}

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp || Number.isNaN(timestamp)) return 'just now';
  const delta = Date.now() - timestamp;
  if (delta < 1000) return 'just now';
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  return `${Math.round(delta / 86_400_000)}d ago`;
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

  if (card.dataset.tpAsrWired === '1') return;
  card.dataset.tpAsrWired = '1';

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
    persistAsrPatch(patch, storeRef);
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
  wireAsrStatusIndicators(card, store);
}

function wireAsrStatusIndicators(card: HTMLElement, store?: AppStore | null): void {
  const saveEl = card.querySelector<HTMLElement>('#asrSaveStatus');
  const appliedEl = card.querySelector<HTMLElement>('#asrAppliedStatus');
  if (!saveEl && !appliedEl) return;
  const resolved = resolveStore(store);

  const renderSaveStatus = () => {
    if (!saveEl) return;
    const status = resolved?.get?.('settingsSaveStatus') as SettingsSaveStatus | undefined;
    if (!status || status.state === 'idle') {
      saveEl.textContent = '';
      saveEl.hidden = true;
      return;
    }
    let text = '';
    if (status.state === 'saving') {
      text = 'Saving to account...';
    } else if (status.state === 'saved') {
      const when = formatRelativeTime(status.at);
      text = `Saved to account [OK]${when ? ` (${when})` : ''}`;
    } else if (status.state === 'failed') {
      const errSuffix = status.error ? `: ${status.error}` : '';
      text = `Save failed${errSuffix}`;
    }
    saveEl.textContent = text;
    saveEl.hidden = !text;
  };

  const renderAppliedStatus = () => {
    if (!appliedEl) return;
    const appliedAt = (resolved?.get?.('asrLastAppliedAt') as number) || 0;
    const summary = resolved?.get?.('asrLastAppliedSummary') as Record<string, unknown> | undefined;
    const ok = !!resolved?.get?.('asrLastApplyOk');
    if (!appliedAt) {
      appliedEl.textContent = 'ASR has not applied any settings yet.';
      appliedEl.hidden = false;
      return;
    }
    const parts: string[] = [];
    if (summary) {
      const engine = summary.engine || (summary as any).eng;
      if (engine) parts.push(String(engine));
      if (summary.lang) parts.push(String(summary.lang));
      if (summary.profileName) parts.push(String(summary.profileName));
      if (summary.reason) parts.push(String(summary.reason));
    }
    const base = parts.length ? parts.join(' | ') : 'default';
    const symbol = ok ? '[applied]' : '[warn]';
    const relative = formatRelativeTime(appliedAt);
    appliedEl.textContent = `Applied to ASR: ${symbol} ${base}${relative ? ` (${relative})` : ''}`;
    appliedEl.hidden = false;
  };

  renderSaveStatus();
  renderAppliedStatus();

  if (resolved?.subscribe) {
    resolved.subscribe('settingsSaveStatus', renderSaveStatus);
    resolved.subscribe('asrLastAppliedAt', renderAppliedStatus);
    resolved.subscribe('asrLastAppliedSummary', renderAppliedStatus);
    resolved.subscribe('asrLastApplyOk', renderAppliedStatus);
  }
}

export function flushAsrSettingsToStore(store?: AppStore | null): void {
  try {
    const card = findAsrCard();
    if (!card) return;
    const patch = readAsrPatchFromCard(card);
    persistAsrPatch(patch, store);
  } catch {}
}

export function ensureAsrSettingsWired(root: ParentNode = document, store?: AppStore | null): void {
  const tryMount = (warnIfMissing = false) => {
    const card =
      (root as Document | ParentNode)?.querySelector?.<HTMLElement>('#asrSettingsCard') ||
      (root as Document | ParentNode)?.querySelector?.<HTMLElement>('.settings-card.asr');

    if (!card) {
      if (warnIfMissing && !asrSettingsWarned) {
        asrSettingsWarned = true;
        try { console.warn('[ASR] settings card not found (will retry)'); } catch {}
      }
      return false;
    }

    mountAsrSettings(root, store);
    return true;
  };

  if (tryMount(false)) return;

  document.addEventListener(
    'tp:settings:rendered',
    () => {
      asrSettingsRenderEventFired = true;
      tryMount(true);
    },
    { once: true },
  );

  if (!asrSettingsObserverStarted) {
    asrSettingsObserverStarted = true;
    const host = (root as Document | ParentNode)?.querySelector?.('#settingsBody') as HTMLElement | null
      || (document.getElementById('settingsBody') as HTMLElement | null)
      || document.body;
    try {
      const obs = new MutationObserver(() => {
        const wired = tryMount(asrSettingsRenderEventFired);
        if (wired) {
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
