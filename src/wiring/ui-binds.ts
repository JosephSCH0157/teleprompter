// @ts-nocheck
export {};

// src/wiring/ui-binds.ts
// Canonical UI binder for core chrome:
// - Present mode toggle
// - Settings overlay open/close
// - Shortcuts/help overlay open/close
// - Smoke markers for tests

export interface BindCoreUIOptions {
  /**
   * Selector for the Present Mode toggle button.
   * Defaults to '#presentBtn, [data-action="present-toggle"]'.
   */
  presentBtnSelector?: string;
}

declare global {
  interface Window {
    __tpUiBinderInstalled?: boolean;
    __tpSetPresent?: (on: boolean) => void;
  }

  interface Document {
    // (Kept for lib compat; real members come from lib.dom.d.ts)
  }
}

const DEFAULT_PRESENT_SEL = '#presentBtn, [data-action="present-toggle"]';
const SETTINGS_OPEN_SEL = '#settingsBtn, [data-action="settings-open"]';
const SETTINGS_CLOSE_SEL = '#settingsClose, [data-action="settings-close"]';
const HELP_OPEN_SEL =
  '#shortcutsBtn, [data-action="help-open"], #helpBtn';
const HELP_CLOSE_SEL =
  '#shortcutsClose, [data-action="help-close"]';

let binderInstalled = false;

export function bindCoreUI(opts: BindCoreUIOptions = {}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Idempotent: only wire once
  if (binderInstalled || window.__tpUiBinderInstalled) return;
  binderInstalled = true;
  try {
    window.__tpUiBinderInstalled = true;
  } catch {
    // ignore
  }

  const presentSel = opts.presentBtnSelector || DEFAULT_PRESENT_SEL;
  const root = document.documentElement;

  function applyPresent(on: boolean): void {
    try {
      const isOn = !!on;
      root.classList.toggle('tp-present', isOn);

      // Smoke marker for tests
      if (isOn) {
        root.setAttribute('data-smoke-present', '1');
      } else {
        root.removeAttribute('data-smoke-present');
      }

      // Button label
      const btn = document.querySelector<HTMLElement>(presentSel);
      if (btn) {
        btn.textContent = isOn ? 'Exit Present' : 'Present Mode';
      }
    } catch {
      /* ignore */
    }
  }

  // Expose setter globally for tests/dev tools
  try {
    window.__tpSetPresent = applyPresent;
  } catch {
    /* ignore */
  }

  // Always start in non-present mode (do not persist across reloads)
  try { applyPresent(false); } catch { /* ignore */ }

  // Present button wiring
  try {
    const btn = document.querySelector<HTMLElement>(presentSel);
    if (btn && !btn.dataset.uiBound) {
      btn.dataset.uiBound = '1';
      btn.addEventListener('click', () => {
        const isOn = root.classList.contains('tp-present');
        applyPresent(!isOn);
      });
    }
  } catch {
    /* ignore */
  }

  // --- Overlay helpers (settings/help) ---

  function markOpen(name: 'settings' | 'help'): void {
    try { (window as any).__tpStore?.set?.('page', name); } catch {}
    try {
      document.body.setAttribute('data-smoke-open', name);
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(
        new CustomEvent(`tp:${name}:open`, { bubbles: false }),
      );
    } catch {
      /* ignore */
    }
  }

  function markClose(name: 'settings' | 'help'): void {
    try {
      if (document.body.getAttribute('data-smoke-open') === name) {
        document.body.removeAttribute('data-smoke-open');
      }
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(
        new CustomEvent(`tp:${name}:close`, { bubbles: false }),
      );
    } catch {
      /* ignore */
    }
  }

  function getOverlayEl(name: 'settings' | 'help'): HTMLElement | null {
    if (name === 'settings') {
      return document.getElementById('settingsOverlay') as HTMLElement | null;
    }
    return document.getElementById('shortcutsOverlay') as HTMLElement | null;
  }

  function wireOverlay(
    openSel: string,
    closeSel: string,
    name: 'settings' | 'help',
  ): void {
    try {
      // Delegate clicks in capture phase so we run even if other handlers throw
      document.addEventListener(
        'click',
        (ev: Event) => {
          try {
            const target = ev.target as HTMLElement | null;
            if (!target || typeof target.closest !== 'function') {
              return;
            }

            const t = target.closest(
              `${openSel}, ${closeSel}`,
            ) as HTMLElement | null;
            if (!t) return;

            const isOpen = t.matches(openSel);
            const overlay = getOverlayEl(name);

            if (isOpen) {
              if (overlay) overlay.classList.remove('hidden');
              markOpen(name);
            } else {
              if (overlay) overlay.classList.add('hidden');
              markClose(name);
            }
          } catch {
            /* ignore */
          }
        },
        { capture: true },
      );

      // Escape closes the overlay
      document.addEventListener(
        'keydown',
        (e: KeyboardEvent) => {
          try {
            if (e.key === 'Escape') {
              markClose(name);
              const overlay = getOverlayEl(name);
              if (overlay) overlay.classList.add('hidden');
            }
          } catch {
            /* ignore */
          }
        },
        { capture: true },
      );
    } catch {
      /* ignore */
    }
  }

  wireOverlay(SETTINGS_OPEN_SEL, SETTINGS_CLOSE_SEL, 'settings');
  wireOverlay(HELP_OPEN_SEL, HELP_CLOSE_SEL, 'help');
}

// Auto-bind when DOM is ready (TS path)
if (typeof document !== 'undefined') {
  try {
    if (
      document.readyState === 'complete' ||
      document.readyState === 'interactive'
    ) {
      bindCoreUI();
    } else {
      document.addEventListener(
        'DOMContentLoaded',
        () => bindCoreUI(),
        { once: true },
      );
    }
  } catch {
    /* ignore */
  }
}

// ---- Test/dev helpers (exported) ----

function __getOverlayEl(name: 'settings' | 'help'): HTMLElement | null {
  try {
    if (name === 'settings') {
      return (
        document.getElementById('settingsOverlay') ||
        (document.querySelector('[data-overlay="settings"]') as HTMLElement | null)
      );
    }
    return (
      document.getElementById('shortcutsOverlay') ||
      (document.querySelector('[data-overlay="help"]') as HTMLElement | null)
    );
  } catch { return null; }
}

export function toggleOverlay(name: 'settings' | 'help', want: boolean): void {
  try {
    let el = __getOverlayEl(name);
    if (!el) {
      try {
        el = document.createElement('div');
        el.id = name === 'settings' ? 'settingsOverlay' : 'shortcutsOverlay';
        el.setAttribute('data-overlay', name);
        document.body.appendChild(el);
      } catch {}
    }
    if (want) {
      if (el) {
        try { el.classList.remove('hidden'); } catch {}
        try { el.removeAttribute('hidden'); } catch {}
      }
      try { document.body.style.overflow = 'hidden'; } catch {}
      try { document.body.setAttribute('data-smoke-open', name); } catch {}
      try { window.dispatchEvent(new CustomEvent(`tp:${name}:open`)); } catch {}
    } else {
      if (el) {
        try { el.classList.add('hidden'); } catch {}
        try { el.setAttribute('hidden', ''); } catch {}
      }
      try { document.body.style.overflow = ''; } catch {}
      try {
        if (document.body.getAttribute('data-smoke-open') === name) {
          document.body.removeAttribute('data-smoke-open');
        }
      } catch {}
      try { window.dispatchEvent(new CustomEvent(`tp:${name}:close`)); } catch {}
    }
  } catch { /* ignore */ }
}

export function ensureSettingsTabsWiring(): void {
  try {
    const overlay = __getOverlayEl('settings');
    if (!overlay) return;
    const tablist = (overlay.querySelector('#settingsTabs') || overlay.querySelector('[role="tablist"]')) as HTMLElement | null;
    if (!tablist) return;

    const tabs = Array.from(overlay.querySelectorAll<HTMLElement>('.settings-tab'));
    if (!tabs.length) return;

    // Initialize tabs and panels
    const names: string[] = [];
    tabs.forEach((t, i) => {
      const name = (t.dataset.tab || `tab${i}`).toString();
      names.push(name);
      if (!t.id) t.id = `tab-${name}`;
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', 'false');
      t.setAttribute('tabindex', '-1');
      t.setAttribute('aria-controls', `panel-${name}`);

      const panel = overlay.querySelector<HTMLElement>(`.settings-card[data-tab="${name}"]`);
      if (panel) {
        panel.setAttribute('role', 'tabpanel');
        panel.id = panel.id || `panel-${name}`;
        panel.setAttribute('data-tabpanel', name);
        panel.setAttribute('hidden', '');
        panel.setAttribute('aria-labelledby', t.id);
      }
    });

    const setActive = (name: string, focus = false) => {
      try { (overlay as any).dataset.activeTab = name; } catch {}
      tabs.forEach((t) => {
        const is = (t.dataset.tab || '') === name;
        t.classList.toggle('active', is);
        t.setAttribute('aria-selected', is ? 'true' : 'false');
        t.setAttribute('tabindex', is ? '0' : '-1');
        if (is && focus) { try { t.focus(); } catch {} }
      });
      names.forEach((n) => {
        const panel = overlay.querySelector<HTMLElement>(`#panel-${n}`) || overlay.querySelector<HTMLElement>(`.settings-card[data-tab="${n}"]`);
        if (!panel) return;
        if (n === name) { panel.removeAttribute('hidden'); }
        else { panel.setAttribute('hidden', ''); }
      });
    };

    // Default active: first tab or pre-set dataset
    const initial = (overlay as any).dataset?.activeTab || names[0];
    setActive(initial);

    // Keyboard navigation on tablist
    const onKey = (e: KeyboardEvent) => {
      const key = e.key;
      const cur = ((overlay as any).dataset?.activeTab || names[0]) as string;
      let idx = Math.max(0, names.indexOf(cur));
      if (key === 'ArrowRight') idx = (idx + 1) % names.length;
      else if (key === 'ArrowLeft') idx = (idx - 1 + names.length) % names.length;
      else if (key === 'Home') idx = 0;
      else if (key === 'End') idx = names.length - 1;
      else return;
      e.preventDefault?.();
      const next = names[idx];
      setActive(next, true);
    };

    // Ensure role on container
    tablist.setAttribute('role', 'tablist');
    tablist.addEventListener('keydown', onKey, { capture: false });
  } catch { /* ignore */ }
}
