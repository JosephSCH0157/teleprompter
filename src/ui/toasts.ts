// src/ui/toasts.ts
//
// Typed toast helper for Anvil.
// - Shows small transient messages in the bottom corner.
// - Exposes a global window.toast(msg, opts) for legacy callers.
// - Keeps the old CSS hook: .tp-toast-container / .tp-toast / .tp-toast-action

const CONTAINER_ID = 'tp_toast_container';
const MAX_VISIBLE = 3;
const DEFAULT_FADE_MS = 4000;

export type ToastKind = 'info' | 'success' | 'warning' | 'error' | string;

export interface ToastOptions {
  type?: ToastKind;
  /** Optional click handler for an action button */
  action?: () => void;
  /** Label for the action button (default: "Open") */
  actionLabel?: string;
  /** Override auto-dismiss timeout (ms), default 4000 */
  timeoutMs?: number;
}

function ensureContainer(): HTMLElement {
  let c = document.getElementById(CONTAINER_ID) as HTMLElement | null;
  if (c) return c;

  c = document.createElement('div');
  c.id = CONTAINER_ID;
  c.className = 'tp-toast-container';
  // Attach as soon as possible; fall back to <html> if body isn't ready.
  (document.body || document.documentElement).appendChild(c);
  return c;
}

function prune(container: HTMLElement): void {
  const children = Array.from(container.children) as HTMLElement[];
  while (children.length > MAX_VISIBLE) {
    const first = children.shift();
    if (first && typeof first.remove === 'function') {
      first.remove();
    }
  }
}

/**
 * Core toast API — use this from TS code.
 */
export function showToast(message: string, opts: ToastOptions = {}): void {
  try {
    const container = ensureContainer();
    prune(container);

    const t = document.createElement('div');
    const typeClass = opts.type ? String(opts.type) : '';
    t.className = `tp-toast show ${typeClass}`;

    // Message text
    const txt = document.createElement('span');
    txt.textContent = String(message ?? '');
    t.appendChild(txt);

    // Optional action button
    if (typeof opts.action === 'function') {
      const btn = document.createElement('button');
      btn.textContent = String(opts.actionLabel || 'Open');
      btn.className = 'tp-toast-action';
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        try {
          opts.action && opts.action();
        } catch {
          // ignore handler failures
        }
        t.classList.remove('show');
        window.setTimeout(() => t.remove(), 120);
      });
      t.appendChild(btn);
    }

    // Click anywhere on the toast to dismiss early
    t.addEventListener('click', () => {
      t.classList.remove('show');
      window.setTimeout(() => t.remove(), 120);
    });

    container.appendChild(t);
    prune(container);

    const timeout = Number.isFinite(opts.timeoutMs as number)
      ? (opts.timeoutMs as number)
      : DEFAULT_FADE_MS;

    window.setTimeout(() => {
      t.classList.remove('show');
      window.setTimeout(() => t.remove(), 120);
    }, timeout);
  } catch (err) {
    // Last-ditch logging; never throw from a toast.
    try {
      console.debug('[toast] failed to render', message, opts, err);
    } catch {
      // ignore
    }
  }
}

// --- Global bridge for legacy code ----------------------------------------

export type ToastFn = (message: string, opts?: ToastOptions) => void;

declare global {
  interface Window {
    toast?: ToastFn;
  }
}

// Install global window.toast if not already present
if (typeof window !== 'undefined') {
  if (!window.toast) {
    window.toast = showToast;
  }
}
