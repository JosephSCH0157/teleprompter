import { getAppStore } from '../state/appStore';

function flipHudEnabled() {
  const store = getAppStore();
  if (!store || typeof store.getSnapshot !== 'function' || typeof store.set !== 'function') return;
  try {
    const snap = store.getSnapshot() as any;
    const next = !snap.hudEnabledByUser;
    store.set('hudEnabledByUser', next);
  } catch {}
}

export function wireHudToggle(): void {
  const btn = document.querySelector<HTMLElement>('[data-tp-toggle-hud]');
  if (btn && !btn.dataset.hudToggleWired) {
    btn.dataset.hudToggleWired = '1';
    btn.addEventListener('click', () => flipHudEnabled());
  }

  // Hotkey: tilde/backtick toggles HUD preference
  try {
    document.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        flipHudEnabled();
      }
    });
  } catch {}
}
