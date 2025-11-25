import { getAppStore } from '../state/appStore';

function readHudEnabled(store: any): boolean {
  try {
    if (store && typeof store.getSnapshot === 'function') {
      const snap = store.getSnapshot() as any;
      if (snap && typeof snap.hudEnabledByUser === 'boolean') return snap.hudEnabledByUser;
    }
    if (store && typeof store.get === 'function') {
      const val = store.get('hudEnabledByUser');
      if (typeof val === 'boolean') return val;
    }
  } catch {}
  try { return !!store?.state?.hudEnabledByUser; } catch {}
  return false;
}

function toggleHudEnabled() {
  const store = getAppStore();
  if (!store || typeof store.set !== 'function') return;
  try {
    const next = !readHudEnabled(store);
    store.set('hudEnabledByUser', next);
  } catch {}
}

function wireButtons() {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('[data-tp-toggle-hud]'));
  buttons.forEach((btn) => {
    if (btn.dataset.hudToggleWired === '1') return;
    btn.dataset.hudToggleWired = '1';
    btn.addEventListener('click', (e) => {
      try { e.preventDefault(); } catch {}
      toggleHudEnabled();
    });
  });
}

function wireHotkeys() {
  try {
    document.addEventListener('keydown', (e) => {
      const key = e.key || '';
      const lower = key.toLowerCase();
      const isToggleKey =
        key === 'Escape' ||
        key === '`' ||
        key === '~' ||
        (e.ctrlKey && lower === 'p');
      if (!isToggleKey) return;
      try { e.preventDefault(); } catch {}
      toggleHudEnabled();
    });
  } catch {}
}

export function wireHudToggle(): void {
  wireButtons();
  wireHotkeys();
}
