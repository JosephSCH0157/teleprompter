import type { AppStore } from '../state/app-store';

function resolveStore(store?: AppStore): AppStore | null {
  if (store) return store;
  try { return (window as any).__tpStore || null; } catch { return null; }
}

function onReady(fn: () => void) {
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

export function initObsToggle(store?: AppStore): void {
  const S = resolveStore(store);
  onReady(() => {
    if (typeof document === 'undefined') return;
    const getToggles = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-tp-obs-toggle]'));
    const wired = new WeakSet<HTMLElement>();

    const statusEl =
      document.querySelector<HTMLElement>('#obsStatusText') ||
      document.querySelector<HTMLElement>('#obsStatus');

    const readEnabled = (): boolean => {
      try {
        const snap = typeof S?.getSnapshot === 'function' ? S?.getSnapshot() : S?.state;
        if (snap && typeof snap.obsEnabled === 'boolean') return snap.obsEnabled;
        const val = S?.get?.('obsEnabled');
        if (typeof val === 'boolean') return val;
      } catch {}
      return false;
    };

    const apply = (on: boolean) => {
      getToggles().forEach((el) => {
        const active = !!on;
        el.classList.toggle('is-active', active);
        el.dataset.state = active ? 'on' : 'off';
        el.setAttribute('aria-pressed', active ? 'true' : 'false');
        if (el instanceof HTMLInputElement) {
          el.checked = active;
          el.setAttribute('aria-checked', active ? 'true' : 'false');
        }
      });
      if (statusEl) {
        statusEl.dataset.state = on ? 'on' : 'off';
      }
    };

    const toggle = () => {
      const next = !readEnabled();
      try { S?.set?.('obsEnabled', next); } catch {}
      apply(next);
    };

    const wireEvents = () => {
      getToggles().forEach((el) => {
        if (wired.has(el)) return;
        wired.add(el);
        const handler = () => toggle();
        if (el instanceof HTMLInputElement) {
          el.addEventListener('change', handler);
        } else {
          el.addEventListener('click', handler);
        }
      });
    };

    wireEvents();

    try {
      const mo = new MutationObserver(() => {
        wireEvents();
        apply(readEnabled());
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch {}

    try { S?.subscribe?.('obsEnabled', apply as any); } catch {}
    apply(readEnabled());
  });
}
