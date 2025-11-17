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
    // Older TS libs don't always include closest() on EventTarget in a type-safe way
  }
}

const DEFAULT_PRESENT_SEL = '#presentBtn, [data-action="present-toggle"]';
const SETTINGS_OPEN_SEL = '#settingsBtn, [data-action="settings-open"]';
const SETTINGS_CLOSE_SEL = '#settingsClose, [data-action="settings-close"]';
const HELP_OPEN_SEL =
  '#shortcutsBtn, [data-action="help-open"], #helpBtn';
const HELP_CLOSE_SEL = '#shortcutsClose, [data-action="help-close"]';

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

      // Persist across reloads
      try {
        window.localStorage.setItem('tp_present', isOn ? '1' : '0');
      } catch {
        /* ignore */
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

  // Restore prior state from localStorage
  try {
    const prev = window.localStorage.getItem('tp_present') === '1';
    applyPresent(prev);
  } catch {
    /* ignore */
  }

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
            if (!target || typeof (target as any).closest !== 'function') {
              return;
            }
            const t = (target as any).closest(
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
