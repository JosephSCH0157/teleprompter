// Top-level page tabs wiring: toggles Scripts / Settings / Help / HUD panels and syncs with the store.

type StoreLike = {
  set?: (key: string, value: unknown) => void;
  subscribe?: (key: string, fn: (value: unknown) => void) => void;
  get?: (key: string) => unknown;
};

const DEFAULT_PAGES = [
  { id: 'scripts', label: 'Scripts' },
  { id: 'settings', label: 'Settings' },
  { id: 'help', label: 'Help' },
  { id: 'hud', label: 'HUD' },
] as const;

const FALLBACK_PAGE = 'scripts';

function normalizePage(page: string | null | undefined, known: Set<string>, fallback = FALLBACK_PAGE): string {
  const val = (page || '').trim();
  if (val && known.has(val)) return val;
  if (known.has(fallback)) return fallback;
  const first = Array.from(known)[0] || '';
  return first || fallback;
}

function updateButtonState(btn: HTMLButtonElement, active: boolean) {
  try {
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.tabIndex = active ? 0 : -1;
  } catch {}
}

function updatePanelState(panel: HTMLElement, active: boolean) {
  try {
    panel.hidden = !active;
    panel.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (panel.classList.contains('overlay')) {
      panel.classList.toggle('hidden', !active);
    }
  } catch {}
}

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
        btn.setAttribute('aria-pressed', idx === 0 ? 'true' : 'false');
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
    const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-page]'));

    if (!buttons.length || !panels.length) return;

    const knownPages = new Set(panels.map((panel) => panel.dataset.page || '').filter(Boolean));

    const tagExtraTabs = (selector: string, page: string) => {
      try {
        root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
          if (!el.dataset.pageTab) el.dataset.pageTab = page;
        });
      } catch {}
    };
    tagExtraTabs('[data-action="settings-open"]', 'settings');
    tagExtraTabs('[data-action="help-open"]', 'help');

    const applyUi = (page: string) => {
      buttons.forEach((btn) => updateButtonState(btn, (btn.dataset.pageTab || '') === page));
      panels.forEach((panel) => updatePanelState(panel, (panel.dataset.page || '') === page));
    };

    const fallbackPage = normalizePage(FALLBACK_PAGE, knownPages);
    const storedPage = (() => {
      try {
        const val = S?.get?.('page');
        return typeof val === 'string' ? val : null;
      } catch {
        return null;
      }
    })();
    const hasStoredPage = !!(storedPage && typeof storedPage === 'string');
    const initialPage = normalizePage(hasStoredPage ? storedPage : null, knownPages, fallbackPage);

    let current = initialPage;

    const setActive = (page: string, { pushToStore = true }: { pushToStore?: boolean } = {}) => {
      const target = normalizePage(page, knownPages, fallbackPage);
      if (!target) return;
      current = target;
      applyUi(target);
      if (pushToStore && S?.set) {
        try {
          S.set('page', target);
        } catch {}
      }
    };

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.pageTab || '';
        if (key) setActive(key);
      });
    });

    if (S?.subscribe) {
      try {
        S.subscribe('page', (val: unknown) => {
          if (typeof val !== 'string') return;
          if (val === current) return;
          setActive(val, { pushToStore: false });
        });
      } catch {}
    }

    const resetToDefault = () => setActive(fallbackPage);
    const bindReset = (selector: string) => {
      try {
        root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
          if (el.dataset.pageTabReset === '1') return;
          el.dataset.pageTabReset = '1';
          el.addEventListener('click', resetToDefault, { capture: true });
        });
      } catch {}
    };
    bindReset('#settingsClose,[data-action="settings-close"]');
    bindReset('#shortcutsClose,[data-action="help-close"]');
    const bindOverlayBackgroundReset = (selector: string) => {
      try {
        root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
          if (el.dataset.pageTabResetBg === '1') return;
          el.dataset.pageTabResetBg = '1';
          el.addEventListener(
            'click',
            (ev) => {
              try {
                if (ev.target === el) resetToDefault();
              } catch {}
            },
            { capture: true },
          );
        });
      } catch {}
    };
    bindOverlayBackgroundReset('#settingsOverlay,#shortcutsOverlay');

    document.addEventListener(
      'keydown',
      (ev) => {
        try {
          if (ev.key === 'Escape' && (current === 'settings' || current === 'help')) resetToDefault();
        } catch {}
      },
      { capture: true },
    );

    setActive(initialPage, { pushToStore: !hasStoredPage || initialPage !== storedPage });
  } catch {}
}
