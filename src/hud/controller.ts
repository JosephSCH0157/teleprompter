import type { AppStoreState } from '../state/app-store';
import { getAppStore } from '../state/appStore';
import { shouldShowHud } from './shouldShowHud';

export function initHudController(): void {
  const store = getAppStore();
  if (!store || typeof store.getSnapshot !== 'function' || typeof store.subscribeAll !== 'function') return;

  // Use same root selection logic as index.ts (ensureHud) to avoid mismatched mounts.
  const hudRoot =
    (document.getElementById('hud-root') as HTMLElement | null) ||
    (document.querySelector<HTMLElement>('[data-role="hud-root"]')) ||
    (document.querySelector<HTMLElement>('[data-tp-hud]'));
  if (!hudRoot) return;

  const apply = () => {
    try {
      const snap = store.getSnapshot() as AppStoreState;
      const visible = shouldShowHud(snap);
      try {
        console.log('[HUD-CTRL] apply', {
          hudEnabledByUser: snap?.hudEnabledByUser,
          hudSupported: snap?.hudSupported,
          page: snap?.page,
          visible,
        });
      } catch {}
      hudRoot.classList.toggle('hidden', !visible);
      hudRoot.classList.toggle('open', visible);
      hudRoot.setAttribute('aria-hidden', visible ? 'false' : 'true');
    } catch {}
  };

  try {
    const keys: Array<keyof AppStoreState> = ['page', 'hudSupported', 'hudEnabledByUser'];
    keys.forEach((key) => {
      try { store.subscribe(key as any, apply); } catch {}
    });
  } catch {}

  apply();
}
