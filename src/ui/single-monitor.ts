import { appStore, type AppStore } from '../state/app-store';

const ROOT_CLASS = 'tp-single-monitor';
const SIDEBAR_OPEN_CLASS = 'tp-single-monitor-sidebar-open';
const SETTINGS_TOGGLE_ID = 'singleMonitorReadToggle';
const TOPBAR_TOGGLE_ID = 'singleMonitorBtn';
const SIDEBAR_TOGGLE_ID = 'sidebarDrawerBtn';

const DEFAULT_MARKER_PCT = 0.4;
const SINGLE_MONITOR_MARKER_PCT = 0.62;

let baseMarkerPct = DEFAULT_MARKER_PCT;
let currentMarkerPct = DEFAULT_MARKER_PCT;
let currentEnabled = false;

function resolveStore(store?: AppStore | null): AppStore | null {
  if (store) return store;
  try {
    return (window as any).__tpStore || appStore || null;
  } catch {
    return appStore || null;
  }
}

function applyMarkerPadding(markerPct: number): void {
  try {
    const viewer = document.getElementById('viewer') as HTMLElement | null;
    const script = document.getElementById('script') as HTMLElement | null;
    const host = viewer || script;
    if (!host) return;
    const h = host.clientHeight || window.innerHeight || 0;
    if (!Number.isFinite(h) || h <= 0) return;
    const offset = Math.max(0, Math.round(h * markerPct));
    if (script) {
      script.style.paddingTop = `${offset}px`;
      script.style.scrollPaddingTop = '';
    }
    if (viewer) {
      viewer.style.paddingTop = '0px';
      viewer.style.scrollPaddingTop = `${offset}px`;
    }
  } catch {
    // ignore
  }
}

function applyMarkerPct(markerPct: number): void {
  if (!Number.isFinite(markerPct)) return;
  currentMarkerPct = markerPct;
  try { (window as any).__TP_MARKER_PCT = markerPct; } catch {}
  try {
    document.documentElement.style.setProperty('--tp-marker-pct', String(markerPct));
  } catch {}
  applyMarkerPadding(markerPct);
}

function updateToggleUi(enabled: boolean): void {
  const toggle = document.getElementById(SETTINGS_TOGGLE_ID) as HTMLInputElement | null;
  if (toggle && toggle.checked !== enabled) {
    try { toggle.checked = enabled; } catch {}
  }
  const btn = document.getElementById(TOPBAR_TOGGLE_ID) as HTMLButtonElement | null;
  if (btn) {
    btn.classList.toggle('is-active', enabled);
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.title = enabled
      ? 'Single Monitor Read is on (maximize script view)'
      : 'Single Monitor Read (maximize script view)';
  }
  const drawerBtn = document.getElementById(SIDEBAR_TOGGLE_ID) as HTMLButtonElement | null;
  if (drawerBtn) {
    drawerBtn.setAttribute('aria-hidden', enabled ? 'false' : 'true');
  }
}

function applySingleMonitor(enabled: boolean): void {
  const root = document.documentElement;
  currentEnabled = enabled;
  root.classList.toggle(ROOT_CLASS, enabled);
  if (!enabled) {
    root.classList.remove(SIDEBAR_OPEN_CLASS);
  }
  const nextPct = enabled ? SINGLE_MONITOR_MARKER_PCT : baseMarkerPct;
  applyMarkerPct(nextPct);
  try {
    window.requestAnimationFrame(() => applyMarkerPadding(nextPct));
  } catch {}
  updateToggleUi(enabled);
}

function toggleSidebarDrawer(force?: boolean): void {
  const root = document.documentElement;
  if (!root.classList.contains(ROOT_CLASS)) return;
  const next = typeof force === 'boolean'
    ? force
    : !root.classList.contains(SIDEBAR_OPEN_CLASS);
  root.classList.toggle(SIDEBAR_OPEN_CLASS, next);
  const drawerBtn = document.getElementById(SIDEBAR_TOGGLE_ID) as HTMLButtonElement | null;
  if (drawerBtn) {
    drawerBtn.setAttribute('aria-expanded', next ? 'true' : 'false');
  }
}

function wireControls(store: AppStore | null): void {
  const toggle = document.getElementById(SETTINGS_TOGGLE_ID) as HTMLInputElement | null;
  if (toggle && toggle.dataset.tpSingleMonitorWired !== '1') {
    toggle.dataset.tpSingleMonitorWired = '1';
    toggle.addEventListener('change', () => {
      try { store?.set?.('singleMonitorReadEnabled', !!toggle.checked); } catch {}
    });
  }

  const btn = document.getElementById(TOPBAR_TOGGLE_ID) as HTMLButtonElement | null;
  if (btn && btn.dataset.tpSingleMonitorWired !== '1') {
    btn.dataset.tpSingleMonitorWired = '1';
    btn.addEventListener('click', () => {
      const next = !currentEnabled;
      try { store?.set?.('singleMonitorReadEnabled', next); } catch {}
      if (!store) applySingleMonitor(next);
    });
  }

  const drawerBtn = document.getElementById(SIDEBAR_TOGGLE_ID) as HTMLButtonElement | null;
  if (drawerBtn && drawerBtn.dataset.tpSingleMonitorWired !== '1') {
    drawerBtn.dataset.tpSingleMonitorWired = '1';
    drawerBtn.addEventListener('click', () => toggleSidebarDrawer());
  }

  updateToggleUi(currentEnabled);
}

export function initSingleMonitorRead(store?: AppStore | null): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveStore(store);
  try {
    const existing = (window as any).__TP_MARKER_PCT;
    if (Number.isFinite(existing)) {
      baseMarkerPct = existing;
    }
  } catch {}
  if (!Number.isFinite(baseMarkerPct) || baseMarkerPct <= 0) {
    baseMarkerPct = DEFAULT_MARKER_PCT;
  }

  const initial = !!resolved?.get?.('singleMonitorReadEnabled');
  applySingleMonitor(initial);
  wireControls(resolved);

  try {
    resolved?.subscribe?.('singleMonitorReadEnabled', (value: unknown) => {
      const next = !!value;
      if (next !== currentEnabled) applySingleMonitor(next);
    });
  } catch {}

  try {
    document.addEventListener('tp:settings:rendered', () => wireControls(resolved), { passive: true });
  } catch {}

  try {
    window.addEventListener('resize', () => {
      applyMarkerPadding(currentMarkerPct);
    }, { passive: true });
  } catch {}
}
