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

const shouldSilenceObsLogs = (() => {
  try {
    const w = window as any;
    if (w.__TP_SILENCE_OBS_LOGS) return true;
    const search = String(location.search || '').toLowerCase();
    return search.includes('ci=1') || search.includes('uimock=1');
  } catch {
    return false;
  }
})();

function logObsCommand(cmd: string, extra: Record<string, unknown> = {}): void {
  if (shouldSilenceObsLogs) return;
  const payload = { cmd, ...extra };
  try { console.log('[OBS-CMD]', payload); } catch {}
  try { (window as any).HUD?.log?.('obs:command', payload); } catch {}
}

function getBridge(): ObsBridge | null {
  try {
    const w = window as any;
    return (w.__obsBridge as ObsBridge) || null;
  } catch {
    return null;
  }
}

let lastUrl = '';
let lastPassword = '';
let lastEnabled = false;
let wiredEvents = false;

function updateStatus(status: RecorderStatus, err?: string) {
  setObsStatus(status, err ?? null);
}

function wireBridgeEvents(): void {
  if (wiredEvents) return;
  const bridge = getBridge();
  if (!bridge?.on) return;

  bridge.on('connect', () => updateStatus('connected'));
  bridge.on('disconnect', () => updateStatus('disconnected'));
  bridge.on('error', (err: unknown) => {
    const msg = (err as any)?.message || String(err || 'error');
    updateStatus('error', msg);
  });

  wiredEvents = true;
}

function closeBridge(reason?: string): void {
  const bridge = getBridge();
  logObsCommand('close', { reason });
  try { bridge?.enableAutoReconnect?.(false); } catch {}
  try { bridge?.setArmed?.(false); } catch {}
  try { bridge?.disconnect?.(); } catch {}
  updateStatus('disconnected', reason);
}

function connectViaBridge(): void {
  const state = getRecorderSettings();
  if (!state.enabled.obs) {
    closeBridge();
    return;
  }

  const bridge = getBridge();
  wireBridgeEvents();
  if (!bridge) {
    updateStatus('error', 'OBS bridge unavailable');
    return;
  }

  try { bridge?.configure?.({ url: state.configs.obs.url, password: state.configs.obs.password || '' }); logObsCommand('configure', { url: state.configs.obs.url }); } catch {}
  try { bridge?.setArmed?.(true); logObsCommand('setArmed', { armed: true }); } catch {}
  try { bridge?.enableAutoReconnect?.(true); logObsCommand('enableAutoReconnect', { on: true }); } catch {}

  updateStatus('connecting');
  try { bridge?.maybeConnect?.(); logObsCommand('connect:maybe'); } catch {}
  try { bridge?.connect?.(); logObsCommand('connect:explicit'); } catch {}
}

export function initObsConnection(): void {
  const initial = getRecorderSettings();
  lastEnabled = initial.enabled.obs;
  lastUrl = initial.configs.obs.url;
  lastPassword = initial.configs.obs.password;

  subscribeRecorderSettings((s) => {
    const urlChanged = s.configs.obs.url !== lastUrl;
    const pwdChanged = s.configs.obs.password !== lastPassword;
    const enabledChanged = s.enabled.obs !== lastEnabled;

    lastEnabled = s.enabled.obs;
    lastUrl = s.configs.obs.url;
    lastPassword = s.configs.obs.password;

    if (!s.enabled.obs) {
      closeBridge('disabled');
      return;
    }

    if (enabledChanged || urlChanged || pwdChanged) {
      closeBridge();
      connectViaBridge();
    }
  });

  if (initial.enabled.obs) {
    connectViaBridge();
  } else {
    updateStatus('disconnected');
  }
}
