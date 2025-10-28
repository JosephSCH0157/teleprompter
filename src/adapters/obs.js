// OBS adapter stub for src/adapters

export async function init() {
  console.log('[src/adapters/obs] init');
  // No-op for now; real adapters can perform feature detection here.
}

function createEmitter() {
  const handlers = Object.create(null);
  return {
    on(event, fn) {
      if (!handlers[event]) handlers[event] = new Set();
      handlers[event].add(fn);
      return () => handlers[event] && handlers[event].delete(fn);
    },
    off(event, fn) {
      handlers[event] && handlers[event].delete(fn);
    },
    emit(event, payload) {
      (handlers[event] || []).forEach((h) => {
        try { h(payload); } catch (err) { console.warn('[obs] emitter handler error', err); }
      });
    },
  };
}

export function connect(url, pass) {
  const emitter = createEmitter();
  if (typeof WebSocket === 'undefined' || !url) {
    setTimeout(() => { emitter.emit('connecting'); emitter.emit('error', new Error('WebSocket not available or url missing')); emitter.emit('closed'); }, 0);
    return Object.assign(emitter, { close: () => {}, sendText: () => {}, sendJson: () => {} });
  }
  let ws = null, closed = false;
  const openSocket = () => {
    try {
      emitter.emit('connecting');
      ws = new WebSocket(url);
      ws.onopen = () => { emitter.emit('open'); if (pass && ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify({ type: 'auth', password: pass })); } catch {} } };
      ws.onmessage = () => {};
      ws.onerror = () => { emitter.emit('error', new Error('WebSocket error')); };
      ws.onclose = () => { emitter.emit('closed'); };
    } catch (err) { emitter.emit('error', err); }
  };
  setTimeout(() => { if (!closed) openSocket(); }, 0);
  const api = Object.assign(emitter, {
    close() { closed = true; try { if (ws) ws.close(1000,'client'); } catch {} emitter.emit('closed'); },
    sendText(txt){ try { if (ws && ws.readyState === WebSocket.OPEN) ws.send(String(txt)); } catch {} },
    sendJson(obj){ try { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); } catch {} },
  });
  return api;
}

export function createOBSAdapter() {
  return {
    id: 'obs',
    label: 'OBS (ws)',
    async isAvailable() { return typeof WebSocket !== 'undefined'; },
    async start() { return Promise.resolve(); },
    async stop() { return Promise.resolve(); },
    connect,
    // Best-effort helpers: these do not implement full OBS WebSocket v5 protocol,
    // but provide a place to hook in a real implementation.
    startRecording(conn){
      try {
        if (!conn || typeof conn.sendJson !== 'function') return;
        // Placeholder request shape
        conn.sendJson({ requestType: 'StartRecord' });
      } catch {}
    },
    stopRecording(conn){
      try {
        if (!conn || typeof conn.sendJson !== 'function') return;
        conn.sendJson({ requestType: 'StopRecord' });
      } catch {}
    },
  };
}
