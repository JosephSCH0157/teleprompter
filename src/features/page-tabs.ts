// Top-level page routing: Scripts / Settings / Help / HUD

import type { AppStore, PageName } from '../state/app-store';

type PageStore = AppStore;

let pageTabsWired = false;
const FALLBACK_PAGE: PageName = 'scripts';

function getAllowedPages(): Set<PageName> {
  const pages = new Set<PageName>();
  document.querySelectorAll<HTMLElement>('.page-tab[data-tp-page]').forEach((btn) => {
    const p = btn.getAttribute('data-tp-page') as PageName | null;
    if (p) pages.add(p);
  });
  pages.add(FALLBACK_PAGE);
  return pages;
}

function getRoutablePanels(allowed: Set<PageName>): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-tp-panel]')).filter((el) => {
    const p = el.getAttribute('data-tp-panel') as PageName | null;
    return !!p && allowed.has(p);
  });
}

function closeOverlays(): void {
  try { (window as any).__tpStore?.set?.('overlay', 'none'); } catch {}
  try { document.body.removeAttribute('data-smoke-open'); } catch {}
  ['settingsOverlay', 'shortcutsOverlay'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    try { el.classList.add('hidden'); } catch {}
    try { el.setAttribute('aria-hidden', 'true'); } catch {}
    try { el.style.display = 'none'; } catch {}
  });
}

export function applyPagePanel(page: PageName): void {
  const allowed = getAllowedPages();
  const routedPanels = getRoutablePanels(allowed);
  const panelByName = new Map<PageName, HTMLElement>();
  routedPanels.forEach((panel) => {
    const name = panel.getAttribute('data-tp-panel') as PageName | null;
    if (name) panelByName.set(name, panel);
  });
  const targetPage = allowed.has(page) ? page : FALLBACK_PAGE;
  const target = panelByName.get(targetPage) || panelByName.get(FALLBACK_PAGE);

  const buttons = Array.from(
    document.querySelectorAll<HTMLElement>('[data-tp-page]'),
  );

  buttons.forEach((btn) => {
    const name = btn.getAttribute('data-tp-page') as PageName | null;
    const active = name === targetPage;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.tabIndex = active ? 0 : -1;
  });
  routedPanels.forEach((panel) => {
    const visible = panel === target;
    panel.classList.toggle('is-active', visible);
    panel.hidden = !visible;
    panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
  });

  closeOverlays();
}

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

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tpPage;
      if (!target) return;
      applyPagePanel(target as PageName);
    });
  });
  // If user focuses inside the Scripts panel (e.g., dropdown), ensure page state flips to scripts
  try {
    const allowed = getAllowedPages();
    const routedPanels = getRoutablePanels(allowed);
    const scriptsPanel = routedPanels.find((p) => p.getAttribute('data-tp-panel') === FALLBACK_PAGE);
    scriptsPanel?.addEventListener('focusin', () => {
      try { S.set('page', FALLBACK_PAGE as PageName); } catch {}
    });
  } catch {
    // ignore
  }

  const stored = (() => { try { return S.get?.('page') as PageName | undefined; } catch { return undefined; } })();
  if (stored && stored !== FALLBACK_PAGE && !getAllowedPages().has(stored)) {
    try { console.warn('[page-tabs] illegal page restored, forcing scripts:', stored); } catch {}
  }
  const initial = (() => {
    const allowed = getAllowedPages();
    const candidate = stored as PageName;
    return allowed.has(candidate) ? candidate : FALLBACK_PAGE;
  })();
  applyPagePanel(initial);

  try { S.subscribe('page', (v: PageName) => applyPagePanel(v)); } catch {}
}

export function ensurePageTabs(store: PageStore): void {
  if (pageTabsWired) return;
  if (typeof document === 'undefined') return;

  const tryInit = () => {
    if (pageTabsWired) return true;
    try {
      // Keep the global attached in case something cleared it
      try { (window as any).__tpStore = (window as any).__tpStore || store; } catch {}
      const hasPanels = !!document.querySelector('[data-tp-panel]');
      const hasTabs = !!document.querySelector('[data-tp-page]');
      if (!hasPanels || !hasTabs) return false;
      initPageTabs(store);
      pageTabsWired = true;
      return true;
    } catch {
      return false;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (tryInit()) return;
      const mo = new MutationObserver(() => {
        if (tryInit()) mo.disconnect();
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => { try { mo.disconnect(); } catch {} }, 6000);
    }, { once: true });
  } else {
    if (tryInit()) return;
    const mo = new MutationObserver(() => {
      if (tryInit()) mo.disconnect();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { try { mo.disconnect(); } catch {} }, 6000);
  }
}
