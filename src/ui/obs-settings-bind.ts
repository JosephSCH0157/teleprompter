import {
  getRecorderSettings,
  setObsConfig,
  setRecorderEnabled,
  subscribeRecorderSettings,
} from '../state/recorder-settings';

const ENABLE_ID = 'settingsEnableObs';
const SIDEBAR_ENABLE_ID = 'enableObs';
const HOST_ID = 'settingsObsUrl';
const PORT_ID = 'settingsObsPort';
const PASS_ID = 'settingsObsPass';

function buildUrl(host: string, port: string): string {
  const h = (host || '').trim() || '127.0.0.1';
  const p = (port || '').trim() || '4455';
  return `ws://${h}:${p}`;
}

export function bindObsSettingsUI(doc: Document = document): void {
  let syncing = false;
  let wired = false;
  let unsub: (() => void) | null = null;

  const wire = () => {
    const enableEl = doc.getElementById(ENABLE_ID) as HTMLInputElement | null;
    const sidebarEnableEl = doc.getElementById(SIDEBAR_ENABLE_ID) as HTMLInputElement | null;
    const hostEl = doc.getElementById(HOST_ID) as HTMLInputElement | null;
    const portEl = doc.getElementById(PORT_ID) as HTMLInputElement | null;
    const passEl = doc.getElementById(PASS_ID) as HTMLInputElement | null;

    if (!enableEl && !sidebarEnableEl && !hostEl && !portEl && !passEl) {
      return false;
    }

    if (wired) return true;
    wired = true;
    try { console.info('[OBS-UI] wiring settings/sidebar controls'); } catch {}

    // Store -> UI
    unsub = subscribeRecorderSettings((state) => {
      syncing = true;
      try {
        if (enableEl && enableEl.checked !== !!state.enabled.obs) enableEl.checked = !!state.enabled.obs;
        if (sidebarEnableEl && sidebarEnableEl.checked !== !!state.enabled.obs) {
          sidebarEnableEl.checked = !!state.enabled.obs;
        }

        const url = state.configs.obs.url || '';
        try {
          const parsed = new URL(url);
          if (hostEl && hostEl !== doc.activeElement) hostEl.value = parsed.hostname || '';
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
    };

    enableEl?.addEventListener('change', () => writeEnabled(!!enableEl.checked));
    sidebarEnableEl?.addEventListener('change', () => writeEnabled(!!sidebarEnableEl.checked));

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
