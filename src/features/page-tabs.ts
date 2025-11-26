// Top-level page routing: Scripts / Settings / Help / HUD

import type { AppStore, PageName } from '../state/app-store';

type PageStore = AppStore;

export function initPageTabs(store?: PageStore) {
  const S = store || ((window as any).__tpStore as AppStore | undefined);
  if (!S) {
    try { console.warn('[page-tabs] __tpStore not ready; skipping init'); } catch {}
    return;
  }

  const buttons = Array.from(
    document.querySelectorAll<HTMLElement>('[data-tp-page]'),
  );
  const panels = Array.from(
    document.querySelectorAll<HTMLElement>('[data-tp-panel]'),
  );

  if (!buttons.length || !panels.length) {
    try { console.warn('[page-tabs] no page tabs/panels found'); } catch {}
    return;
  }

  const coerce = (v: unknown): PageName => (v === 'settings' || v === 'help' || v === 'hud' || v === 'scripts') ? v : 'scripts';

  const apply = (page: PageName) => {
    const p = coerce(page);
    buttons.forEach((btn) => {
      const name = coerce(btn.dataset.tpPage);
      const active = name === p;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => {
      const name = coerce(panel.dataset.tpPanel);
      const visible = name === p;
      panel.classList.toggle('is-active', visible);
      panel.hidden = !visible;
      panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });
  };

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tpPage;
      if (!target) return;
      try { S.set('page', target); } catch {}
    });
  });
  // If user focuses inside the Scripts panel (e.g., dropdown), ensure page state flips to scripts
  try {
    const scriptsPanel = panels.find((p) => coerce(p.dataset.tpPanel) === 'scripts');
    scriptsPanel?.addEventListener('focusin', () => {
      try { S.set('page', 'scripts' as PageName); } catch {}
    });
  } catch {
    // ignore
  }

  const stored = (() => { try { return S.get?.('page') as PageName | undefined; } catch { return undefined; } })();
  const initial = coerce(stored);
  if (!stored) {
    try { S.set('page', initial); } catch {}
  }
  apply(initial);

  try { S.subscribe('page', (v: PageName) => apply(coerce(v))); } catch {}
}
