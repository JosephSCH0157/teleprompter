import {
  getRecorderSettings,
  setObsConfig,
  setRecorderEnabled,
  subscribeRecorderSettings,
} from '../state/recorder-settings';

const ENABLE_ID = 'settingsEnableObs';
const HOST_ID = 'settingsObsUrl';
const PORT_ID = 'settingsObsPort';
const PASS_ID = 'settingsObsPass';

function buildUrl(host: string, port: string): string {
  const h = (host || '').trim() || '127.0.0.1';
  const p = (port || '').trim() || '4455';
  return `ws://${h}:${p}`;
}

export function bindObsSettingsUI(doc: Document = document): void {
  const enableEl = doc.getElementById(ENABLE_ID) as HTMLInputElement | null;
  const hostEl = doc.getElementById(HOST_ID) as HTMLInputElement | null;
  const portEl = doc.getElementById(PORT_ID) as HTMLInputElement | null;
  const passEl = doc.getElementById(PASS_ID) as HTMLInputElement | null;

  let syncing = false;

  // Store -> UI
  subscribeRecorderSettings((state) => {
    syncing = true;
    try {
      if (enableEl) enableEl.checked = !!state.enabled.obs;

      const url = state.configs.obs.url || '';
      try {
        const parsed = new URL(url);
        if (hostEl) hostEl.value = parsed.hostname || '';
        if (portEl) portEl.value = parsed.port || '4455';
      } catch {
        if (hostEl) hostEl.value = '';
        if (portEl) portEl.value = '4455';
      }

      if (passEl) {
        passEl.value = state.configs.obs.password || '';
      }
    } finally {
      syncing = false;
    }
  });

  // UI -> Store
  enableEl?.addEventListener('change', () => {
    if (syncing) return;
    setRecorderEnabled('obs', !!enableEl.checked);
  });

  const pushUrl = () => {
    if (syncing) return;
    const next = buildUrl(hostEl?.value ?? '', portEl?.value ?? '');
    const cur = getRecorderSettings().configs.obs.url;
    if (next === cur) return;
    setObsConfig({ url: next });
  };

  hostEl?.addEventListener('blur', pushUrl);
  hostEl?.addEventListener('change', pushUrl);
  portEl?.addEventListener('blur', pushUrl);
  portEl?.addEventListener('change', pushUrl);

  passEl?.addEventListener('change', () => {
    if (syncing) return;
    setObsConfig({ password: passEl.value });
  });
}
