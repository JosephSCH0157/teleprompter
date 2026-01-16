type RelayState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type RelayStatus = {
  state: RelayState;
  connectedDisplays: number;
  lastError?: string;
};

const status: RelayStatus = {
  state: 'disconnected',
  connectedDisplays: 0,
  lastError: undefined,
};

const listeners = new Set<(status: RelayStatus) => void>();
let socket: WebSocket | null = null;
let reconnectDelay = 1000;
let reconnectTimer: number | null = null;
let sendQueue: string[] = [];

const isDisplayContext = () => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('display') === '1') return true;
    const path = (window.location.pathname || '').toLowerCase();
    if (path.endsWith('/display.html') || path === '/display.html') return true;
    if ((window as any).__TP_FORCE_DISPLAY) return true;
  } catch {
    // ignore
  }
  return false;
};

const isSupported = typeof window !== 'undefined' && typeof WebSocket !== 'undefined' && !isDisplayContext();

const notifyListeners = () => {
  const snapshot = { ...status };
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      // ignore listener errors
    }
  });
};

const updateStatus = (patch: Partial<RelayStatus>) => {
  Object.assign(status, patch);
  notifyListeners();
};

const getWsUrl = () => {
  if (typeof window === 'undefined') return null;
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws/display`;
  } catch {
    return null;
  }
};

const flushQueue = () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (!sendQueue.length) return;
  for (const msg of sendQueue) {
    try {
      socket.send(msg);
    } catch {
      // ignore per-message failures
    }
  }
  sendQueue = [];
};

const scheduleReconnect = () => {
  if (reconnectTimer || !isSupported) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(15000, reconnectDelay * 1.5);
};

const handleMessage = (event: MessageEvent<string>) => {
  try {
    const data = JSON.parse(event.data);
    if (data?.type === 'tp-display-status') {
      const connected = typeof data.connected === 'number' ? data.connected : status.connectedDisplays;
      updateStatus({ connectedDisplays: connected });
    }
  } catch {
    // ignore invalid JSON
  }
};

const resetSocket = () => {
  if (socket) {
    try {
      socket.close();
    } catch {}
  }
  socket = null;
};

const connect = () => {
  if (!isSupported) return;
  if (socket && socket.readyState === WebSocket.OPEN) return;
  updateStatus({ state: 'connecting', lastError: undefined });
  const url = getWsUrl();
  if (!url) {
    updateStatus({ state: 'error', lastError: 'Unable to build ws url' });
    return;
  }
  resetSocket();
  const ws = new WebSocket(url);
  socket = ws;

  ws.addEventListener('open', () => {
    reconnectDelay = 1000;
    updateStatus({ state: 'connected', lastError: undefined });
    ws.send(JSON.stringify({ type: 'hello', role: 'main' }));
    flushQueue();
  });

  ws.addEventListener('message', handleMessage);

  const cleanup = () => {
    updateStatus({ state: 'disconnected', connectedDisplays: 0, lastError: undefined });
    socket = null;
    scheduleReconnect();
  };

  ws.addEventListener('close', cleanup);
  ws.addEventListener('error', (event) => {
    updateStatus({ state: 'error', lastError: String((event as any)?.reason || 'WebSocket error') });
  });
};

if (isSupported) {
  connect();
  try {
    window.addEventListener('beforeunload', () => {
      socket?.close();
    });
  } catch {}
}

export function publishToNetworkDisplays(payload: unknown): void {
  if (!isSupported || typeof payload === 'undefined') return;
  try {
    const str = JSON.stringify(payload);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(str);
      return;
    }
    sendQueue.push(str);
    if (sendQueue.length > 256) {
      sendQueue.shift();
    }
  } catch {
    // swallow serialization errors
  }
}

export function onNetworkDisplayStatus(fn: (status: RelayStatus) => void): () => void {
  listeners.add(fn);
  fn({ ...status });
  return () => {
    listeners.delete(fn);
  };
}

export function getNetworkDisplayStatus(): RelayStatus {
  return { ...status };
}
