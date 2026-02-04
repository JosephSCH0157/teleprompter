import {
  getDevDrawerOpen,
  setDevDrawerOpen,
  getDevZen,
  setDevZen,
} from './dev-state';

const ROOT_ID = 'tp-dev-root';
const DRAWER_ID = 'tp-dev-drawer';
const DRAWER_PILL = 'tp-dev-pill';

type Dock = 'right' | 'bottom';

let initialized = false;
let drawerOpen = false;
let zenMode = false;
let rootEl: HTMLElement | null = null;
let drawerEl: HTMLElement | null = null;
let pillEl: HTMLButtonElement | null = null;
let zenButtonEl: HTMLButtonElement | null = null;
let contentHost: HTMLElement | null = null;
let currentDock: Dock | null = null;
let lastDockUpdate = 0;
let listenersAttached = false;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isDevActive(): boolean {
  if (!isBrowser()) return false;
  try {
    const w = window as any;
    if (w.__TP_DEV || w.__TP_DEV1) return true;
    const params = new URLSearchParams(w.location?.search || '');
    if (params.get('dev') === '1') return true;
    if (w.localStorage?.getItem('tp_dev_mode') === '1') return true;
  } catch {
    // ignore
  }
  return false;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return !!(el as any).isContentEditable;
}

function describeElement(el: Element | null | undefined): string {
  if (!el) return 'unknown';
  const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : '';
  const clsRaw = (el as HTMLElement).className;
  const cls = typeof clsRaw === 'string' && clsRaw.trim()
    ? `.${clsRaw.trim().split(/\s+/).slice(0, 3).join('.')}`
    : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

function getKickScroller(): HTMLElement | null {
  if (!isBrowser()) return null;
  return (
    (document.getElementById('scriptScrollContainer') as HTMLElement | null) ||
    (document.getElementById('viewer') as HTMLElement | null) ||
    (document.scrollingElement as HTMLElement | null) ||
    (document.documentElement as HTMLElement | null) ||
    (document.body as HTMLElement | null)
  );
}

function installKickScroll(): void {
  if (!isDevActive()) return;
  const w = window as any;
  if (w.__tpKickScroll) return;
  w.__tpKickScroll = () => {
    const scroller = getKickScroller();
    if (!scroller) {
      try { console.warn('[DEV] __tpKickScroll missing scroller'); } catch {}
      return;
    }
    const from = scroller.scrollTop || 0;
    const target = from + 120;
    try {
      scroller.scrollTop = target;
    } catch {
      try { (scroller as any).scrollTo?.({ top: target, behavior: 'auto' }); } catch {}
    }
    const to = scroller.scrollTop || 0;
    try {
      console.info('[DEV] __tpKickScroll', {
        scroller: describeElement(scroller),
        from,
        to,
      });
    } catch {}
  };
}

function computeDock(): Dock {
  if (!isBrowser()) return 'right';
  const width = window.innerWidth || 0;
  const height = window.innerHeight || 0;
  if (width >= 1100) return 'right';
  if (height > 0 && width / height > 1.2) return 'right';
  return 'bottom';
}

function applyDock(dock: Dock): void {
  if (!drawerEl) return;
  currentDock = dock;
  drawerEl.dataset.dock = dock;
  drawerEl.setAttribute('data-dock', dock);
}

function updateDock(): void {
  if (!drawerEl) return;
  const dock = computeDock();
  if (dock === currentDock) return;
  applyDock(dock);
}

function scheduleDockUpdate(): void {
  if (!drawerEl) return;
  const now = performance.now();
  if (now - lastDockUpdate < 100) return;
  lastDockUpdate = now;
  const dock = computeDock();
  if (dock === currentDock) return;
  applyDock(dock);
}

function setDrawerOpen(value: boolean): void {
  drawerOpen = value;
  setDevDrawerOpen(drawerOpen);
  if (drawerEl) drawerEl.setAttribute('data-open', drawerOpen ? 'true' : 'false');
  if (pillEl) pillEl.setAttribute('aria-expanded', drawerOpen ? 'true' : 'false');
}

function toggleDrawer(): void {
  setDrawerOpen(!drawerOpen);
}

function updateZenState(value: boolean): void {
  zenMode = value;
  setDevZen(zenMode);
  if (zenButtonEl) {
    zenButtonEl.textContent = zenMode ? 'Zen: On' : 'Zen: Off';
  }
  if (isBrowser()) {
    const body = document.body;
    if (body) body.classList.toggle('tp-dev-zen', zenMode);
  }
}

function handleResize(): void {
  void scheduleDockUpdate();
}

function attachListeners(): void {
  if (listenersAttached) return;
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);
  window.addEventListener('keydown', handleKeydown);
  listenersAttached = true;
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.code === 'KeyK' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    try { (window as any).__tpKickScroll?.(); } catch {}
    return;
  }
  if (!event.ctrlKey || !event.shiftKey) return;
  if (event.altKey || event.metaKey) return;
  if (event.code === 'KeyD') {
    event.preventDefault();
    toggleDrawer();
    return;
  }
  if (event.code === 'KeyZ') {
    event.preventDefault();
    updateZenState(!zenMode);
  }
}

function ensureRoot(): HTMLElement | null {
  if (!isBrowser()) return null;
  rootEl = document.getElementById(ROOT_ID);
  if (!rootEl) {
    rootEl = document.createElement('div');
    rootEl.id = ROOT_ID;
    rootEl.className = 'tp-dev-overlay';
    document.body.appendChild(rootEl);
  } else {
    rootEl.classList.add('tp-dev-overlay');
  }
  return rootEl;
}

function buildDrawerStructure(): void {
  if (!rootEl) return;
  const pill = document.createElement('button');
  pill.id = DRAWER_PILL;
  pill.type = 'button';
  pill.className = 'tp-dev-pill';
  pill.textContent = 'DEV';
  pill.setAttribute('aria-label', 'Toggle DEV drawer');
  pill.setAttribute('aria-expanded', 'false');
  pill.addEventListener('click', () => toggleDrawer());
  pillEl = pill;
  rootEl.appendChild(pill);

  const drawer = document.createElement('section');
  drawer.id = DRAWER_ID;
  drawer.className = 'tp-dev-drawer';
  drawer.setAttribute('role', 'complementary');
  drawer.setAttribute('data-open', 'false');
  drawer.setAttribute('data-dock', 'right');
  drawerEl = drawer;
  rootEl.appendChild(drawer);

  const header = document.createElement('header');
  header.className = 'tp-dev-drawer__header';
  drawer.appendChild(header);

  const title = document.createElement('div');
  title.className = 'tp-dev-drawer__title';
  title.textContent = 'DEV';
  header.appendChild(title);

  const zenButton = document.createElement('button');
  zenButton.type = 'button';
  zenButton.className = 'tp-dev-drawer__zen';
  zenButton.textContent = 'Zen: Off';
  zenButton.addEventListener('click', () => updateZenState(!zenMode));
  zenButtonEl = zenButton;
  header.appendChild(zenButton);

  const inner = document.createElement('div');
  inner.className = 'tp-dev-drawer__content';
  drawer.appendChild(inner);
  contentHost = inner;

  const kickWrap = document.createElement('div');
  kickWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:12px;';
  const kickBtn = document.createElement('button');
  kickBtn.type = 'button';
  kickBtn.textContent = 'Kick Scroll (+120px)';
  kickBtn.style.cssText = 'border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:inherit;padding:6px 10px;cursor:pointer;font-size:12px;font-weight:600;';
  kickBtn.addEventListener('click', () => {
    try { (window as any).__tpKickScroll?.(); } catch {}
  });
  const kickHint = document.createElement('div');
  kickHint.textContent = 'Shortcut: K';
  kickHint.style.cssText = 'opacity:0.7;font-size:11px;';
  kickWrap.appendChild(kickBtn);
  kickWrap.appendChild(kickHint);
  inner.appendChild(kickWrap);
}

export function initDevDrawer(): void {
  if (initialized) return;
  if (!isBrowser()) return;
  if (!isDevActive()) return;
  if (!document.body) return;
  if (document.getElementById(ROOT_ID)) return;
  rootEl = ensureRoot();
  if (!rootEl) return;
  buildDrawerStructure();
  installKickScroll();
  drawerOpen = getDevDrawerOpen();
  setDrawerOpen(drawerOpen);
  zenMode = getDevZen();
  updateZenState(zenMode);
  updateDock();
  attachListeners();
  initialized = true;
}

export function getDevDrawerContentHost(): HTMLElement | null {
  return contentHost;
}
