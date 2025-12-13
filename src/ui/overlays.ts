import { getAppStore } from '../state/appStore';

export type OverlayId = 'none' | 'settings' | 'help' | 'shortcuts';

export function initOverlays(): void {
  const store = getAppStore();
  if (!store || typeof store.set !== 'function' || typeof store.subscribe !== 'function') return;

  const overlays: Record<OverlayId, HTMLElement | null> = {
    none: null,
    settings: document.getElementById('settingsOverlay'),
    help: document.getElementById('shortcutsOverlay'),
    shortcuts: document.getElementById('shortcutsOverlay'),
  };

  const apply = (id: OverlayId) => {
    (Object.keys(overlays) as OverlayId[]).forEach((key) => {
      const el = overlays[key];
      if (!el) return;
      const active = key === id;
      el.classList.toggle('hidden', !active);
      el.hidden = !active;
    });
  };

  try {
    store.subscribe('overlay', (val: unknown) => {
      const id = (val === 'settings' || val === 'help' || val === 'shortcuts') ? (val as OverlayId) : 'none';
      apply(id);
    });
  } catch {}

  try {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        try { store.set('overlay', 'none'); } catch {}
      }
    });
  } catch {}

  // Button wiring handled centrally in ui-binds.ts (exclusive handlers)

  const initial = (() => {
    try {
      const v = store.get?.('overlay') as string | undefined;
      if (v === 'settings' || v === 'help' || v === 'shortcuts') return v as OverlayId;
    } catch {}
    return 'none' as OverlayId;
  })();
  apply(initial);
}
