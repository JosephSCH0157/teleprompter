// src/features/scroll/mode-chip.ts
// Tiny HUD chip in the topbar showing the current scroll mode.
// Passive: no clicks, just reflects router/store state.

type ScrollMode = 'manual' | 'auto' | 'hybrid' | 'step' | 'rehearsal' | string;

declare global {
  interface Window {
    __tpScrollMode?: {
      getMode?: () => ScrollMode;
    };
  }
}

function formatMode(mode: ScrollMode): string {
  const m = String(mode || '').toLowerCase();
  switch (m) {
    case 'auto':
      return 'Auto';
    case 'hybrid':
      return 'Hybrid';
    case 'step':
      return 'Step';
    case 'rehearsal':
      return 'Rehearsal';
    case 'manual':
    default:
      return 'Manual';
  }
}

function getInitialMode(): ScrollMode {
  try {
    const fromRouter = window.__tpScrollMode?.getMode?.();
    if (fromRouter) return fromRouter;
  } catch {
    // ignore
  }
  try {
    const attr = document.documentElement.getAttribute('data-scroll-mode');
    if (attr) return attr;
  } catch {
    // ignore
  }
  return 'manual';
}

function installModeChip(): void {
  if (typeof document === 'undefined') return;

  // Only install once
  if (document.getElementById('scrollModeChip')) return;

  const bar =
    (document.getElementById('topbar') as HTMLElement | null) ||
    (document.querySelector('.topbar') as HTMLElement | null);

  if (!bar) return; // no chrome; nothing to do

  const wrap = document.createElement('div');
  wrap.id = 'scrollModeChip';
  wrap.setAttribute('data-role', 'scroll-mode-chip');
  wrap.style.display = 'inline-flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '0.25rem';
  wrap.style.marginLeft = '0.75rem';

  const label = document.createElement('span');
  label.textContent = 'Mode:';
  label.style.opacity = '0.8';
  label.style.fontSize = '0.8rem';

  const pill = document.createElement('span');
  pill.setAttribute('data-scroll-mode-label', '1');
  // Reuse existing chip styles if present
  pill.className = 'btn-chip';
  pill.style.cursor = 'default';

  const setText = (mode: ScrollMode) => {
    pill.textContent = formatMode(mode);
    pill.setAttribute('data-mode', String(mode || 'manual'));
  };

  setText(getInitialMode());

  wrap.appendChild(label);
  wrap.appendChild(pill);

  // Append near the right side, but before any huge flex spacer if possible
  try {
    bar.appendChild(wrap);
  } catch {
    // graceful
  }

  // Listen for router-driven changes
  try {
    window.addEventListener(
      'tp:scrollModeChange',
      (ev: Event) => {
        const detail = (ev as CustomEvent<{ mode?: ScrollMode }>).detail;
        if (!detail || !detail.mode) return;
        setText(detail.mode);
      },
      { capture: false },
    );
  } catch {
    // ignore
  }
}

// Auto-install when DOM is ready
if (typeof document !== 'undefined') {
  try {
    if (
      document.readyState === 'complete' ||
      document.readyState === 'interactive'
    ) {
      installModeChip();
    } else {
      document.addEventListener(
        'DOMContentLoaded',
        () => installModeChip(),
        { once: true },
      );
    }
  } catch {
    // ignore
  }
}

export { installModeChip };

