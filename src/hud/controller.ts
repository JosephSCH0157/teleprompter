import { getAppStore } from '../state/appStore';
import { shouldShowHud } from './shouldShowHud';

export function initHudController(): void {
  const store = getAppStore();
  if (!store || typeof store.getSnapshot !== 'function' || typeof store.subscribeAll !== 'function') return;

  const hudRoot = document.querySelector<HTMLElement>('[data-tp-hud]');
  if (!hudRoot) return;

  const apply = () => {
    try {
      const snap = store.getSnapshot();
      const visible = shouldShowHud(snap);
      try {
        console.log('[HUD-CTRL] apply', {
          hudEnabledByUser: (snap as any)?.hudEnabledByUser,
          hudSupported: (snap as any)?.hudSupported,
          page: (snap as any)?.page,
          visible,
        });
      } catch {}
      hudRoot.classList.toggle('hidden', !visible);
      hudRoot.setAttribute('aria-hidden', visible ? 'false' : 'true');
    } catch {}
  };

  try {
    store.subscribeAll({
      hudSupported: apply,
      hudEnabledByUser: apply,
      page: apply,
    });
  } catch {}

  apply();
}
