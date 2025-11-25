// Top-level page routing: Scripts / Settings / Help / HUD

import type { AppStore } from '../state/app-store';

type PageName = 'scripts' | 'settings' | 'help' | 'hud';

// Minimal shape of the central store we care about
export interface PageStore {
  get?(key: string): unknown;
  set(key: string, value: unknown): void;
  subscribe(key: string, fn: (value: any) => void): () => void;
}

const DEFAULT_PAGE: PageName = 'scripts';

function coercePage(v: unknown): PageName {
  if (v === 'settings' || v === 'help' || v === 'hud' || v === 'scripts') return v;
  return DEFAULT_PAGE;
}

export function initPageTabs(store?: PageStore) {
  const S = (store || (window as any).__tpStore) as (PageStore | AppStore | undefined);
  if (!S) {
    try { console.warn('[page-tabs] __tpStore not ready; skipping init'); } catch {}
    return;
  }

  const tabButtons = Array.from(
    document.querySelectorAll<HTMLElement>('[data-page-tab]'),
  );
  const panels = Array.from(
    document.querySelectorAll<HTMLElement>('[data-page-panel]'),
  );

  if (!tabButtons.length || !panels.length) {
    try { console.warn('[page-tabs] no page tabs/panels found'); } catch {}
    return;
  }

  function apply(page: PageName) {
    for (const btn of tabButtons) {
      const name = coercePage(btn.dataset.pageTab);
      const active = name === page;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    for (const panel of panels) {
      const name = coercePage(panel.dataset.pagePanel);
      const visible = name === page;
      panel.classList.toggle('is-active', visible);
      panel.hidden = !visible;
    }
  }

  for (const btn of tabButtons) {
    const name = coercePage(btn.dataset.pageTab);
    btn.addEventListener('click', () => {
      try {
        S.set('page', name);
      } catch (e) {
        try { console.warn('[page-tabs] failed to set page', e); } catch {}
      }
    });
  }

  const stored = (S.get && S.get('page')) as PageName | undefined;
  const initial = coercePage(stored);
  if (!stored) {
    try { S.set('page', initial); } catch {}
  }
  apply(initial);

  try {
    S.subscribe('page', (value) => {
      apply(coercePage(value));
    });
  } catch {}
}
