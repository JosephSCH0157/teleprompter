// OBS WebSocket v5 adapter (minimal request flow for Start/Stop Record)

export async function init() {
  console.log('[src/adapters/obs] init');
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
        try { h(payload); } catch (err) { try { console.warn('[obs] emitter handler error', err); } catch{} }
      });
    },
  };
}

// Helpers for auth: auth = base64(sha256(base64(sha256(pass + salt)) + challenge))
async function sha256Base64(input) {
  const enc = new TextEncoder().encode(String(input));
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function computeAuth(pass, salt, challenge) {
  try {
    const secret = await sha256Base64(String(pass || '') + String(salt || ''));
    const auth = await sha256Base64(String(secret) + String(challenge || ''));
    return auth;
  } catch {
    return '';
  }
}

export function connect(urlOrOpts, pass) {
  const emitter = createEmitter();
  const isStringUrl = typeof urlOrOpts === 'string';
  const options = isStringUrl ? { url: urlOrOpts, password: pass } : (urlOrOpts || {});
  const {
    url, // optional legacy direct URL
    host = '127.0.0.1',
    port = 4455,
    secure = false,
    reconnect = true,
    maxDelay = 15000,
  } = options;
  const pwd = Object.prototype.hasOwnProperty.call(options, 'password') ? options.password : pass;

  if (typeof WebSocket === 'undefined' || (!url && !host)) {
    setTimeout(() => { emitter.emit('connecting'); emitter.emit('error', new Error('WebSocket not available or url missing')); emitter.emit('closed'); }, 0);
    return Object.assign(emitter, { close: () => {}, request: async () => ({ ok:false, error:'no-ws' }) });
  }

  let ws = null;
  let closedByUser = false;
  let identified = false;
  let hello = null;
  const pending = new Map(); // id -> {resolve,reject}
  let rid = 1;
  let retry = 0;

  const mkUrl = () => {
    if (url) return url;
    const proto = secure ? 'wss' : 'ws';
    return `${proto}://${host}:${port}`;
  };

  const send = (obj) => {
    try { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); } catch {}
  };

  const identify = async () => {
    try {
      const d = { rpcVersion: 1 };
      const authInfo = hello && hello.authentication;
      if (authInfo && authInfo.challenge && authInfo.salt) {
        const auth = await computeAuth(pwd||'', authInfo.salt, authInfo.challenge);
        d.authentication = auth;
      }
      send({ op: 1, d });
    } catch {}
  };

  const onMessage = async (ev) => {
    let msg = null; try { msg = JSON.parse(ev.data); } catch { return; }
    const op = msg && msg.op;
    const d = msg && msg.d;
    if (op === 0) { // Hello
      hello = d || {};
      await identify();
      return;
    }
    if (op === 2) { // Identified
      identified = true;
      emitter.emit('identified');
      try { window.dispatchEvent(new CustomEvent('tp:obs', { detail: { status: 'identified' } })); } catch {}
      return;
    }
    if (op === 5) { // Event
      try {
        const { eventType, eventData } = d || {};
        if (eventType === 'RecordStateChanged') {
          const recording = !!(eventData && eventData.outputActive);
          try { window.dispatchEvent(new CustomEvent('tp:obs', { detail: { status: 'identified', recording } })); } catch {}
        }
        if (eventType === 'ExitStarted') {
          try { window.dispatchEvent(new CustomEvent('tp:obs', { detail: { status: 'closed', recording: false } })); } catch {}
        }
        if (eventType === 'CurrentProgramSceneChanged') {
          const scene = eventData && eventData.sceneName;
          try { window.dispatchEvent(new CustomEvent('tp:obs', { detail: { status: 'identified', scene } })); } catch {}
        }
      } catch {}
      return;
    }
    if (op === 7) { // RequestResponse
      try {
        const id = d && d.requestId;
        const status = d && d.requestStatus;
        const entry = id && pending.get(id);
        if (entry) {
          pending.delete(id);
          if (status && status.result) entry.resolve({ ok: true, code: status.code, data: d?.responseData });
          else entry.resolve({ ok: false, code: status && status.code, error: (status && status.comment) || 'request-failed' });
        }
      } catch {}
      return;
    }
  };

  const request = (requestType, requestData) => new Promise((resolve) => {
    try {
      const id = String(Date.now()) + '-' + (rid++);
      pending.set(id, { resolve });
      send({ op: 6, d: { requestType, requestId: id, requestData: requestData || {} } });
    } catch { resolve({ ok:false, error:'send-failed' }); }
  });

  const schedule = () => {
    if (!reconnect || closedByUser) return;
    const delay = Math.min(1000 * Math.pow(2, retry++), maxDelay);
    setTimeout(() => { try { openSocket(); } catch {} }, delay);
  };

  const openSocket = () => {
    try {
      emitter.emit('connecting');
      try { window.dispatchEvent(new CustomEvent('tp:obs', { detail: { status: 'connecting' } })); } catch {}
      ws = new WebSocket(mkUrl());
      ws.onopen = () => { emitter.emit('open'); retry = 0; try { window.dispatchEvent(new CustomEvent('tp:obs', { detail: { status: 'open', recording: false } })); } catch {} };
      ws.onmessage = onMessage;
      ws.onerror = () => { emitter.emit('error', new Error('WebSocket error')); try { window.dispatchEvent(new CustomEvent('tp:obs', { detail: { status: 'error' } })); } catch {} };
      ws.onclose = () => { emitter.emit('closed'); try { window.dispatchEvent(new CustomEvent('tp:obs', { detail: { status: 'closed', recording: false } })); } catch {} schedule(); };
    } catch (err) { emitter.emit('error', err); }
  };
  setTimeout(() => { if (!closedByUser) openSocket(); }, 0);

  const api = Object.assign(emitter, {
    close() { closedByUser = true; try { if (ws) ws.close(1000,'client'); } catch {} emitter.emit('closed'); try { window.dispatchEvent(new CustomEvent('tp:obs', { detail: { status: 'closed', recording: false } })); } catch {} },
    request,
    isIdentified() { return !!identified; },
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
    async startRecording(conn){
      try {
        if (!conn || !conn.request) return { ok:false };
        // Optional: set scene before recording if configured
        try {
          const scene = (window.__tpStore && typeof window.__tpStore.get === 'function') ? String(window.__tpStore.get('obsScene') || '') : '';
          if (scene) { await conn.request('SetCurrentProgramScene', { sceneName: scene }); }
        } catch {}
        const res = await conn.request('StartRecord', {});
        if (res && res.ok) { try { window.dispatchEvent(new CustomEvent('tp:obs', { detail: { status: 'identified', recording: true } })); } catch {} }
        return res;
      } catch { return { ok:false }; }
    },
    async stopRecording(conn){
      try {
        if (!conn || !conn.request) return { ok:false };
        const res = await conn.request('StopRecord', {});
        if (res && res.ok) { try { window.dispatchEvent(new CustomEvent('tp:obs', { detail: { status: 'identified', recording: false } })); } catch {} }
        return res;
      } catch { return { ok:false }; }
    },
  };
}
