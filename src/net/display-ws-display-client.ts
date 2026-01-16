const DISPLAY_WS_PATH = '/ws/display';

const hasDisplayPair = () => {
  try {
    const params = new URLSearchParams(window.location.search || '');
    return params.get('pair') || '';
  } catch {
    return '';
  }
};

const pairToken = hasDisplayPair();

const isDisplayContext = () => {
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('display') === '1') return true;
    const path = (window.location.pathname || '').toLowerCase();
    if (path.endsWith('/display.html') || path === '/display.html') return true;
    return !!(window as any).__TP_FORCE_DISPLAY;
  } catch {
    return true;
  }
};

const shouldStart = Boolean(pairToken && isDisplayContext());

if (shouldStart) {
  const wsUrl = (() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${DISPLAY_WS_PATH}`;
  })();

  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let backoff = 1000;

  const scheduleReconnect = () => {
    if (reconnectTimer) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, backoff);
    backoff = Math.min(15000, backoff + 500);
  };

  const sendHandshake = () => {
    if (!socket) return;
    socket.send(JSON.stringify({ type: 'hello', role: 'display', token: pairToken }));
  };

  const deliverPayload = (data: string) => {
    try {
      const payload = JSON.parse(data);
      const handler = (window as any).__tpDisplayHandleRemote as ((payload: any) => void) | undefined;
      if (typeof handler === 'function') {
        handler(payload);
      }
    } catch {
      // ignore non-JSON payloads
    }
  };

  const connect = () => {
    if (socket && socket.readyState === WebSocket.OPEN) return;
    try {
      socket?.close();
    } catch {}
    socket = new WebSocket(wsUrl);

    socket.addEventListener('open', () => {
      backoff = 1000;
      sendHandshake();
    });

    socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        deliverPayload(event.data);
      }
    });

    socket.addEventListener('close', () => {
      socket = null;
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      socket?.close();
    });
  };

  try {
    window.addEventListener('beforeunload', () => {
      try { socket?.close(); } catch {}
    });
  } catch {}

  const waitForHandler = () => {
    const ready = typeof (window as any).__tpDisplayHandleRemote === 'function';
    if (ready) {
      connect();
    } else {
      window.setTimeout(waitForHandler, 50);
    }
  };
  waitForHandler();
}
