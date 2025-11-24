// Minimal page tabs wiring: toggles Run/Scripts/HUD panels.

type StoreLike = {
  set?: (key: string, value: unknown) => void;
  subscribe?: (key: string, fn: (value: unknown) => void) => void;
  get?: (key: string) => unknown;
};

const DEFAULT_PAGES = [
  { id: 'run', label: 'Run' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'hud', label: 'HUD' },
] as const;

export function ensurePageTabs(root: Document | HTMLElement = document): void {
  try {
    const topbar = root.querySelector('.topbar');
    if (!topbar) return;

    let nav = topbar.querySelector<HTMLElement>('#pageTabs');
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = 'pageTabs';
      nav.className = 'page-tabs';
      topbar.appendChild(nav);
    }

    if (nav.childElementCount === 0) {
      DEFAULT_PAGES.forEach((p, idx) => {
        const btn = document.createElement('button');
        btn.className = 'page-tab' + (idx === 0 ? ' is-active' : '');
        btn.dataset.pageTab = p.id;
        btn.textContent = p.label;
        btn.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
        nav!.appendChild(btn);
      });
    }
  } catch {}
}

export function wirePageTabs(root: Document | HTMLElement = document, store?: StoreLike): void {
  try {
    const S: StoreLike | null = store || (typeof window !== 'undefined' ? (window as any).__tpStore : null);
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-page-tab]'));
    const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-page-panel]'));

    if (!buttons.length || !panels.length) return;

    const applyActive = (page: string) => {
      buttons.forEach((btn) => {
        const id = btn.dataset.pageTab || '';
        const active = id === page;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        btn.tabIndex = active ? 0 : -1;
      });
      panels.forEach((panel) => {
        const id = panel.dataset.pagePanel || '';
        panel.hidden = id !== page;
      });
    };

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.pageTab;
        if (!id) return;
        if (S?.set) S.set('page', id);
        else applyActive(id);
      });
    });

    if (S?.subscribe) {
      S.subscribe('page', (id: unknown) => {
        if (typeof id === 'string' && id) applyActive(id);
      });
      const initial = (S.get?.('page') as string | undefined) || 'run';
      applyActive(initial);
    } else {
      applyActive('run');
    }
  } catch {}
}
