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
let bridgeArmed = false;
let connectInFlight: Promise<void> | null = null;
let connectQueued = false;
let bridgeRetryTimer = 0;
let lastBridgeMissingToastAt = 0;

const BRIDGE_RETRY_MS = 1200;
const BRIDGE_MISSING_TOAST_COOLDOWN_MS = 8000;

function updateStatus(status: RecorderStatus, err?: string) {
  setObsStatus(status, err ?? null);
}

function toastObs(msg: string, type: 'ok' | 'error' | 'warn' | 'info' = 'info'): void {
  if (shouldSilenceObsLogs) return;
  try {
    const w = window as any;
    const toast = w._toast || w.toast;
    if (typeof toast === 'function') {
      toast(msg, { type });
      return;
    }
  } catch {}
  try { console.log(msg); } catch {}
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
  if (bridgeRetryTimer) {
    try { clearTimeout(bridgeRetryTimer); } catch {}
    bridgeRetryTimer = 0;
  }
  connectQueued = false;
  connectInFlight = null;
  const bridge = getBridge();
  if (reason === 'disabled' && !bridgeArmed) return; // already idle; avoid log spam
  logObsCommand('close', { reason });
  try { void Promise.resolve(bridge?.enableAutoReconnect?.(false)).catch(() => {}); } catch {}
  try { void Promise.resolve(bridge?.setArmed?.(false)).catch(() => {}); } catch {}
  try { void Promise.resolve(bridge?.disconnect?.()).catch(() => {}); } catch {}
  bridgeArmed = false;
  updateStatus('disconnected', reason);
}

async function safeInvoke<T>(label: string, fn?: () => T | Promise<T>): Promise<{ ok: boolean; value?: T; error?: unknown }> {
  if (!fn) return { ok: false };
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (err) {
    logObsCommand(`bridge:${label}:error`, { error: String((err as any)?.message || err) });
    return { ok: false, error: err };
  }
}

function notifyBridgeMissing(): void {
  updateStatus('error', 'OBS bridge unavailable');
  const now = Date.now();
  if (now - lastBridgeMissingToastAt >= BRIDGE_MISSING_TOAST_COOLDOWN_MS) {
    lastBridgeMissingToastAt = now;
    toastObs('OBS bridge unavailable. Install/enable the OBS bridge to connect.', 'warn');
  } else {
    try { console.warn('[OBS] bridge unavailable'); } catch {}
  }
}

function scheduleBridgeRetry(reason: string): void {
  if (bridgeRetryTimer) return;
  if (!getRecorderSettings().enabled.obs) return;
  bridgeRetryTimer = window.setTimeout(() => {
    bridgeRetryTimer = 0;
    connectViaBridge();
  }, BRIDGE_RETRY_MS);
  logObsCommand('bridge:retry', { reason, delayMs: BRIDGE_RETRY_MS });
}

function connectViaBridge(): void {
  if (connectInFlight) {
    connectQueued = true;
    return;
  }
  const run = async () => {
    const state = getRecorderSettings();
    if (!state.enabled.obs) {
      closeBridge();
      return;
    }

    const bridge = getBridge();
    wireBridgeEvents();
    if (!bridge) {
      notifyBridgeMissing();
      scheduleBridgeRetry('missing-bridge');
      return;
    }

    await safeInvoke('configure', () =>
      bridge.configure?.({ url: state.configs.obs.url, password: state.configs.obs.password || '' }),
    );
    logObsCommand('configure', { url: state.configs.obs.url });

    await safeInvoke('setArmed', () => bridge.setArmed?.(true));
    bridgeArmed = true;
    logObsCommand('setArmed', { armed: true });

    await safeInvoke('enableAutoReconnect', () => bridge.enableAutoReconnect?.(true));
    logObsCommand('enableAutoReconnect', { on: true });

    updateStatus('connecting');
    await safeInvoke('maybeConnect', () => bridge.maybeConnect?.());
    logObsCommand('connect:maybe');

    const connectRes = await safeInvoke('connect', () => bridge.connect?.());
    logObsCommand('connect:explicit');
    if (connectRes.error || (typeof connectRes.value === 'boolean' && !connectRes.value)) {
      updateStatus('disconnected', 'OBS connection failed');
      toastObs('OBS connection failed. Make sure OBS is running.', 'warn');
      return;
    }
  };

  connectInFlight = run()
    .catch((err) => {
      updateStatus('disconnected', 'OBS connection failed');
      try { console.warn('[OBS] connect failed', err); } catch {}
    })
    .finally(() => {
      connectInFlight = null;
      if (connectQueued) {
        connectQueued = false;
        connectViaBridge();
      }
    });
}

export function initObsConnection(): void {
  const initial = getRecorderSettings();
  lastEnabled = initial.enabled.obs;
  lastUrl = initial.configs.obs.url;
  lastPassword = initial.configs.obs.password;

  subscribeRecorderSettings((s) => {
    const prevEnabled = lastEnabled;
    const prevUrl = lastUrl;
    const prevPwd = lastPassword;
    const urlChanged = s.configs.obs.url !== prevUrl;
    const pwdChanged = s.configs.obs.password !== prevPwd;
    const enabledChanged = s.enabled.obs !== prevEnabled;

    lastEnabled = s.enabled.obs;
    lastUrl = s.configs.obs.url;
    lastPassword = s.configs.obs.password;

    // When disabled and nothing changed, stay idle and quiet.
    if (!s.enabled.obs) {
      if (enabledChanged) {
        closeBridge('disabled');
      }
      return;
    }

    if (!enabledChanged && !urlChanged && !pwdChanged) return;

    closeBridge(enabledChanged ? 'reconnect' : undefined);
    connectViaBridge();
  });

  if (initial.enabled.obs) {
    connectViaBridge();
  } else {
    updateStatus('disconnected');
  }
}
