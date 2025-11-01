import { getUiPrefs, setUiPrefs } from '../../settings/uiPrefs';

export function bindHybridGateSetting(root?: HTMLElement | null) {
  try {
    const el = (root || document)?.querySelector?.('#hybridGate') as HTMLSelectElement | null;
    if (!el) return;
    try { el.value = getUiPrefs().hybridGate; } catch {}
    el.addEventListener('change', () => {
      try { setUiPrefs({ hybridGate: el.value as any }); } catch {}
    });
  } catch {}
}
