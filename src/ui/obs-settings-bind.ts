import {
  getRecorderSettings,
  setObsConfig,
  setRecorderEnabled,
  subscribeRecorderSettings,
} from '../state/recorder-settings';

const ENABLE_ID = 'settingsEnableObs';
const SIDEBAR_ENABLE_ID = 'enableObs';
const HOST_ID = 'settingsObsHost';
const PASS_ID = 'settingsObsPassword';
const PORT_ID = 'settingsObsPort'; // legacy hidden input support

function mirrorLegacyObsEnabled(on: boolean): void {
  // Preserve appStore flag for consumers still reading it
  try { (window as any).__tpStore?.set?.('obsEnabled', on); } catch {}
}

function buildUrl(hostWithPort: string, explicitPort?: string): string {
  const rawHost = (hostWithPort || '').trim();
  const rawPort = (explicitPort || '').trim();

  // If the user pasted a full ws:// or wss:// URL, trust it.
  if (rawHost.startsWith('ws://') || rawHost.startsWith('wss://')) {
    return rawHost;
  }

  // Normalize host[:port]; default host/port when missing.
  let host = rawHost || '127.0.0.1';
  let port = rawPort || '';

  // Extract port from host if present (host:port), prefer explicitPort when provided.
  const m = host.match(/^(\\[[^\\]]+\\]|[^:]+)(?::(\\d+))?$/);
  if (m) {
    host = m[1];
    if (!port && m[2]) port = m[2];
  }

  if (!port) port = '4455';

  return `ws://${host}:${port}`;
}

export function bindObsSettingsUI(doc: Document = document): void {
  let syncing = false;
  let wired = false;

  const wire = () => {
    const enableEl = doc.getElementById(ENABLE_ID) as HTMLInputElement | null;
    const sidebarEnableEl = doc.getElementById(SIDEBAR_ENABLE_ID) as HTMLInputElement | null;
    const toggleEls = Array.from(
      new Set(
        Array.from(doc.querySelectorAll<HTMLInputElement>('[data-tp-obs-toggle]')).concat(
          enableEl ? [enableEl] : [],
          sidebarEnableEl ? [sidebarEnableEl] : [],
        ),
      ),
    ).filter((el) => el instanceof HTMLInputElement) as HTMLInputElement[];
    const hostEl = doc.getElementById(HOST_ID) as HTMLInputElement | null;
    const portEl = doc.getElementById(PORT_ID) as HTMLInputElement | null;
    const passEl = doc.getElementById(PASS_ID) as HTMLInputElement | null;

    if (toggleEls.length === 0 && !hostEl && !portEl && !passEl) {
      return false;
    }

    if (wired) return true;
    wired = true;
    try { console.info('[OBS-UI] wiring settings/sidebar controls'); } catch {}

    // Store -> UI
    subscribeRecorderSettings((state) => {
      syncing = true;
      try {
        toggleEls.forEach((el) => {
          if (el && el.checked !== !!state.enabled.obs) el.checked = !!state.enabled.obs;
        });

        const url = state.configs.obs.url || '';
        try {
          const parsed = new URL(url);
          if (hostEl && hostEl !== doc.activeElement) {
            const hostPort = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname || '';
            hostEl.value = hostPort;
          }
          if (portEl && portEl !== doc.activeElement) portEl.value = parsed.port || '4455';
        } catch {
          if (hostEl && hostEl !== doc.activeElement) hostEl.value = '';
          if (portEl && portEl !== doc.activeElement) portEl.value = '4455';
        }

        if (passEl && passEl !== doc.activeElement) {
          passEl.value = state.configs.obs.password || '';
        }
      } finally {
        syncing = false;
      }
    });

    const writeEnabled = (on: boolean) => {
      if (syncing) return;
      setRecorderEnabled('obs', !!on);
      mirrorLegacyObsEnabled(!!on);
    };

    toggleEls.forEach((el) => {
      el.addEventListener('change', () => writeEnabled(!!el.checked));
    });

    const pushUrl = () => {
      if (syncing) return;
      const next = buildUrl(hostEl?.value ?? '', portEl?.value ?? '');
      const cur = getRecorderSettings().configs.obs.url;
      if (next === cur) return;
      try { console.info('[OBS-UI] setObsConfig url', next); } catch {}
      setObsConfig({ url: next });
    };

    hostEl?.addEventListener('blur', pushUrl);
    hostEl?.addEventListener('change', pushUrl);
    portEl?.addEventListener('blur', pushUrl);
    portEl?.addEventListener('change', pushUrl);

    passEl?.addEventListener('change', () => {
      if (syncing) return;
      try { console.info('[OBS-UI] setObsConfig password'); } catch {}
      setObsConfig({ password: passEl.value });
    });

    return true;
  };

  // Try immediately; if elements not yet in DOM, observe until they appear
  if (!wire()) {
    try {
      const mo = new MutationObserver(() => {
        if (wire()) {
          mo.disconnect();
        }
      });
      mo.observe(doc.documentElement, { childList: true, subtree: true });
    } catch {}
  }
}
