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

function computeDock(): Dock {
  if (!isBrowser()) return 'right';
  const width = window.innerWidth || 0;
  const height = window.innerHeight || 0;
  if (width >= 1100) return 'right';
  if (height > 0 && width / height > 1.2) return 'right';
  return 'bottom';
}

function updateDock(): void {
  if (!drawerEl) return;
  const dock = computeDock();
  drawerEl.dataset.dock = dock;
  drawerEl.setAttribute('data-dock', dock);
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
  updateDock();
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
}

export function initDevDrawer(): void {
  if (initialized) return;
  if (!isBrowser()) return;
  if (!isDevActive()) return;
  if (!document.body) return;
  rootEl = ensureRoot();
  if (!rootEl) return;
  buildDrawerStructure();
  drawerOpen = getDevDrawerOpen();
  setDrawerOpen(drawerOpen);
  zenMode = getDevZen();
  updateZenState(zenMode);
  updateDock();
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);
  initialized = true;
}

export function getDevDrawerContentHost(): HTMLElement | null {
  return contentHost;
}
