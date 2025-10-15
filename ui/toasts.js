// ui/toasts.js (ES module)
// Lightweight toast system, no dependencies. Exposes `toast(msg, opts)` and auto-inits a container.
const CONTAINER_ID = 'tp_toast_container';
const MAX_VISIBLE = 3;
const AUTO_FADE_MS = 4000;

function ensureContainer() {
  let c = document.getElementById(CONTAINER_ID);
  if (c) return c;
  c = document.createElement('div');
  c.id = CONTAINER_ID;
  c.className = 'tp-toast-container';
  document.body.appendChild(c);
  return c;
}
function prune(container) {
  const children = Array.from(container.children || []);
  while (children.length > MAX_VISIBLE) {
    const first = children.shift();
    if (first && first.remove) first.remove();
  }
}

export function toast(msg, opts) {
  try {
    const container = ensureContainer();
    prune(container);
    const t = document.createElement('div');
    t.className = 'tp-toast show ' + (opts && opts.type ? String(opts.type) : '');
    t.textContent = String(msg || '');
    t.addEventListener('click', () => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 120);
    });
    container.appendChild(t);
    prune(container);
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 120);
    }, AUTO_FADE_MS);
  } catch (e) {
    try {
      console.debug('[toast] failed to render', e, msg, opts || '');
    } catch (e2) {
      console.debug('toast fallback log failed', e2);
    }
  }
}

// auto-init container for scripts that want to ensure it's available early
export function initToastContainer() {
  ensureContainer();
}

// Note: we intentionally do NOT attach this API to `window` here.
// Consumers should import { toast } from './ui/toasts.js'.
