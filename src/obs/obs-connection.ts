import {
  getRecorderSettings,
  subscribeRecorderSettings,
  setObsStatus,
  type RecorderStatus,
} from '../state/recorder-settings';

type ObsBridge = {
  configure?: (cfg: Record<string, unknown>) => void;
  setArmed?: (on: boolean) => void;
  enableAutoReconnect?: (on: boolean) => void;
  disconnect?: () => void | Promise<void>;
  on?: (event: string, cb: (...args: any[]) => void) => (() => void) | void;
  maybeConnect?: () => void | Promise<void>;
  connect?: () => void | Promise<void>;
};

function getBridge(): ObsBridge | null {
  try {
    const w = window as any;
    return (w.__obsBridge as ObsBridge) || (w.__tpObs as ObsBridge) || null;
  } catch {
    return null;
  }
}

let wiredEvents = false;
const eventOffs: Array<() => void> = [];

function wireBridgeEvents(): void {
  if (wiredEvents) return;
  const bridge = getBridge();
  if (!bridge?.on) return;

  const offConnect = bridge.on('connect', () => setObsStatus('connected', null));
  const offDisconnect = bridge.on('disconnect', () => setObsStatus('disconnected', null));
  const offError = bridge.on('error', (err: unknown) => {
    const msg = (err as any)?.message || String(err || 'error');
    setObsStatus('error', msg);
  });

  [offConnect, offDisconnect, offError].forEach((off) => {
    if (typeof off === 'function') eventOffs.push(off);
  });
  wiredEvents = true;
}

function closeBridge(reason?: string): void {
  const bridge = getBridge();
  try { bridge?.enableAutoReconnect?.(false); } catch {}
  try { bridge?.setArmed?.(false); } catch {}
  try { bridge?.disconnect?.(); } catch {}
  setObsStatus('disconnected', reason || null);
}

function applyConfig(enabled: boolean, url: string, password: string): void {
  const bridge = getBridge();
  wireBridgeEvents();

  if (!enabled) {
    closeBridge();
    return;
  }

  try { bridge?.configure?.({ url, password }); } catch {}
  try { bridge?.setArmed?.(true); } catch {}
  try { bridge?.enableAutoReconnect?.(true); } catch {}

  setObsStatus('connecting', null);

  try { bridge?.maybeConnect?.(); } catch {}
  try { bridge?.connect?.(); } catch {}
}

let lastEnabled = getRecorderSettings().enabled.obs;
let lastUrl = getRecorderSettings().configs.obs.url;
let lastPass = getRecorderSettings().configs.obs.password || '';

export function initObsConnection(): void {
  applyConfig(lastEnabled, lastUrl, lastPass);

  subscribeRecorderSettings((s) => {
    const enabled = s.enabled.obs;
    const url = s.configs.obs.url;
    const pass = s.configs.obs.password || '';

    const enabledChanged = enabled !== lastEnabled;
    const urlChanged = url !== lastUrl;
    const passChanged = pass !== lastPass;

    lastEnabled = enabled;
    lastUrl = url;
    lastPass = pass;

    if (!enabled && (enabledChanged || urlChanged || passChanged)) {
      closeBridge();
      return;
    }

    if (enabledChanged || urlChanged || passChanged) {
      applyConfig(enabled, url, pass);
    }
  });
}
