import {
  getRecorderSettings,
  subscribeRecorderSettings,
  setObsStatus,
  type RecorderStatus,
} from '../state/recorder-settings';

let socket: WebSocket | null = null;
let lastUrl = '';
let lastPassword = '';
let lastEnabled = false;
let isConnecting = false;

function updateStatus(status: RecorderStatus, err?: string) {
  setObsStatus(status, err ?? null);
}

function closeSocket(reason?: string) {
  if (socket) {
    try {
      socket.close();
    } catch {
      // ignore
    }
    socket = null;
  }
  isConnecting = false;
  updateStatus('disconnected', reason);
}

function connect() {
  const state = getRecorderSettings();

  if (!state.enabled.obs) {
    closeSocket();
    return;
  }

  if (socket || isConnecting) return;

  isConnecting = true;
  updateStatus('connecting');

  try {
    const ws = new WebSocket(state.configs.obs.url);
    socket = ws;

    ws.addEventListener('open', () => {
      isConnecting = false;
      updateStatus('connected');
      // If OBS authentication is needed, identify here using state.configs.obs.password.
      void state.configs.obs.password;
    });

    ws.addEventListener('error', () => {
      isConnecting = false;
      socket = null;
      updateStatus('error', 'WebSocket error');
    });

    ws.addEventListener('close', () => {
      socket = null;
      isConnecting = false;
      if (getRecorderSettings().enabled.obs) {
        updateStatus('error', 'Connection closed');
      } else {
        updateStatus('disconnected');
      }
    });
  } catch (e: any) {
    isConnecting = false;
    socket = null;
    updateStatus('error', e?.message || 'Failed to open WebSocket');
  }
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
      closeSocket('disabled');
      return;
    }

    if (enabledChanged || urlChanged || pwdChanged) {
      closeSocket();
      connect();
    }
  });

  if (initial.enabled.obs) {
    connect();
  } else {
    updateStatus('disconnected');
  }
}
