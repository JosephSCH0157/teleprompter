import { appStore } from '../state/app-store';

type ObsEventHandler = (payload?: unknown) => void;

interface ObsEmitter {
  on(event: string, fn: ObsEventHandler): () => void;
  off(event: string, fn: ObsEventHandler): void;
  emit(event: string, payload?: unknown): void;
}

interface ObsRequestResult {
  ok: boolean;
  code?: number;
  data?: unknown;
  error?: string;
}

export async function init(): Promise<void> {
  console.log('[src/adapters/obs] init');

  // Bridge obsEnabled flag in the store to the recorder surface (obs recorder)
  const store = appStore;
  let recModulePromise: Promise<any> | null = null;

  const getRecorderModule = () => {
    if (!recModulePromise) {
      recModulePromise = import('../../recorders');
    }
    return recModulePromise;
  };

  const applyObsEnabled = async (enabled: boolean) => {
    try {
      const recModule: any = await getRecorderModule();
      const obsRecorder =
        typeof recModule.get === 'function'
          ? recModule.get('obs')
          : recModule.recorder?.get?.('obs') ||
            recModule.default?.get?.('obs') ||
            null;

      if (!obsRecorder) {
        try { console.warn('[OBS-ADAPTER] No obs recorder registered'); } catch {}
        return;
      }

      if (enabled) {
        try { await obsRecorder.init?.(); } catch {}
        try { await obsRecorder.connect?.(); } catch {}
      } else {
        try { await obsRecorder.disconnect?.(); } catch {}
      }
    } catch (err) {
      try { console.warn('[OBS-ADAPTER] obsEnabled toggle error', err); } catch {}
    }
  };

  // Apply current state once and subscribe for future changes
  try { await applyObsEnabled(!!store.get('obsEnabled')); } catch {}
  try { store.subscribe('obsEnabled', (v: boolean) => { void applyObsEnabled(!!v); }); } catch {}
}

// Optional configure hook to stay compatible with existing imports
export function configure(_opts?: unknown): void {
  // no-op
}

function createEmitter(): ObsEmitter {
  const handlers: Record<string, Set<ObsEventHandler>> = Object.create(null);

  return {
    on(event: string, fn: ObsEventHandler) {
      if (!handlers[event]) handlers[event] = new Set();
      handlers[event].add(fn);
      return () => {
        handlers[event] && handlers[event].delete(fn);
      };
    },
    off(event: string, fn: ObsEventHandler) {
      handlers[event] && handlers[event].delete(fn);
    },
    emit(event: string, payload?: unknown) {
      (handlers[event] || []).forEach((h) => {
        try {
          h(payload);
        } catch (err) {
          try {
            console.warn('[obs] emitter handler error', err);
          } catch {
            // ignore
          }
        }
      });
    },
  };
}

function _b64ToBytes(b64: string): Uint8Array {
  try {
    const bin = atob(String(b64 || ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array();
  }
}

function _bufToB64(buf: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  } catch {
    return '';
  }
}

async function computeAuth(pass: string, salt: string, challenge: string): Promise<string> {
  try {
    const enc = new TextEncoder();
    const passBytes = enc.encode(String(pass || ''));
    const saltBytes = _b64ToBytes(salt || '');
    // concat(passBytes, saltBytes)
    const combo = new Uint8Array(passBytes.length + saltBytes.length);
    combo.set(passBytes, 0);
    combo.set(saltBytes, passBytes.length);
    const secretBuf = await crypto.subtle.digest('SHA-256', combo);
    const secretB64 = _bufToB64(secretBuf);
    const authInput = enc.encode(String(secretB64) + String(challenge || ''));
    const authBuf = await crypto.subtle.digest('SHA-256', authInput);
    return _bufToB64(authBuf);
  } catch {
    return '';
  }
}

interface ObsConnectOptions {
  url?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  reconnect?: boolean;
  maxDelay?: number;
  password?: string;
  // catch-all for any extra config fields
  [key: string]: any;
}

export interface ObsConnection extends ObsEmitter {
  close(): void;
  request(requestType: string, requestData?: unknown): Promise<ObsRequestResult>;
  isIdentified(): boolean;
}

export function connect(urlOrOpts: string | ObsConnectOptions, pass?: string): ObsConnection {
  const emitter = createEmitter();
  const isStringUrl = typeof urlOrOpts === 'string';
  const options: ObsConnectOptions = isStringUrl ? { url: urlOrOpts as string, password: pass } : (urlOrOpts || {});
  const {
    url,
    host = '127.0.0.1',
    port = 4455,
    secure = false,
    reconnect = true,
    maxDelay = 15000,
  } = options;
  const pwd = Object.prototype.hasOwnProperty.call(options, 'password')
    ? options.password
    : pass;

  if (typeof WebSocket === 'undefined' || (!url && !host)) {
    setTimeout(() => {
      emitter.emit('connecting');
      emitter.emit('error', new Error('WebSocket not available or url missing'));
      emitter.emit('closed');
    }, 0);
    return Object.assign(emitter, {
      close: () => {},
      request: async (): Promise<ObsRequestResult> => ({ ok: false, error: 'no-ws' }),
      isIdentified: () => false,
    });
  }

  let ws: WebSocket | null = null;
  let closedByUser = false;
  let identified = false;
  let hello: any = null;
  const pending = new Map<string, { resolve: (res: ObsRequestResult) => void }>();
  let rid = 1;
  let retry = 0;

  const mkUrl = () => {
    if (url) return url;
    const proto = secure ? 'wss' : 'ws';
    return `${proto}://${host}:${port}`;
  };

  const send = (obj: unknown) => {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
      }
    } catch {
      // ignore
    }
  };

  const identify = async () => {
    try {
      const d: Record<string, unknown> = { rpcVersion: 1 };
      const authInfo = hello && hello.authentication;
      if (authInfo && authInfo.challenge && authInfo.salt) {
        const auth = await computeAuth(pwd || '', authInfo.salt, authInfo.challenge);
        (d as any).authentication = auth;
      }
      send({ op: 1, d });
    } catch {
      // ignore
    }
  };

  const request = (requestType: string, requestData?: unknown): Promise<ObsRequestResult> =>
    new Promise((resolve) => {
      try {
        const id = `${Date.now()}-${rid++}`;
        pending.set(id, { resolve });
        send({ op: 6, d: { requestType, requestId: id, requestData: requestData || {} } });
      } catch {
        resolve({ ok: false, error: 'send-failed' });
      }
    });

  const onMessage = async (ev: MessageEvent<string>): Promise<void> => {
    let msg: any = null;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    const op = msg && msg.op;
    const d = msg && msg.d;

    if (op === 0) {
      // Hello
      hello = d || {};
      await identify();
      return;
    }

    if (op === 2) {
      // Identified
      identified = true;
      emitter.emit('identified');
      try {
        window.dispatchEvent(
          new CustomEvent('tp:obs', { detail: { status: 'identified', authOK: true } }),
        );
      } catch {
        // ignore
      }

      // Proactively fetch current scene to complete initial state snapshot
      try {
        const res = await request('GetCurrentProgramScene', {});
        if (res && res.ok && (res as any).data && (res as any).data.currentProgramSceneName) {
          try {
            window.dispatchEvent(
              new CustomEvent('tp:obs', {
                detail: {
                  status: 'identified',
                  authOK: true,
                  scene: (res as any).data.currentProgramSceneName,
                },
              }),
            );
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
      return;
    }

    if (op === 5) {
      // Event
      try {
        const { eventType, eventData } = d || {};
        if (eventType === 'RecordStateChanged') {
          const recording = !!(eventData && eventData.outputActive);
          try {
            window.dispatchEvent(
              new CustomEvent('tp:obs', {
                detail: { status: 'identified', recording },
              }),
            );
          } catch {
            // ignore
          }
        }
        if (eventType === 'StreamStateChanged') {
          const streaming = !!(eventData && eventData.outputActive);
          try {
            window.dispatchEvent(
              new CustomEvent('tp:obs', {
                detail: { status: 'identified', streaming },
              }),
            );
          } catch {
            // ignore
          }
        }
        if (eventType === 'ExitStarted') {
          try {
            window.dispatchEvent(
              new CustomEvent('tp:obs', {
                detail: { status: 'closed', recording: false },
              }),
            );
          } catch {
            // ignore
          }
        }
        if (eventType === 'CurrentProgramSceneChanged') {
          const scene = eventData && eventData.sceneName;
          try {
            window.dispatchEvent(
              new CustomEvent('tp:obs', {
                detail: { status: 'identified', scene },
              }),
            );
          } catch {
            // ignore
          }
        }
      } catch {
        // swallow
      }
    }

    if (op === 7) {
      // RequestResponse
      try {
        const id = d && d.requestId;
        const status = d && d.requestStatus;
        const entry = id && pending.get(id);
        if (entry) {
          pending.delete(id);
          if (status && status.result) {
            entry.resolve({
              ok: true,
              code: status.code,
              data: d?.responseData,
            });
          } else {
            entry.resolve({
              ok: false,
              code: status && status.code,
              error: (status && status.comment) || 'request-failed',
            });
          }
        }
      } catch {
        // ignore
      }
    }
  };

  const schedule = () => {
    if (!reconnect || closedByUser) return;
    const delay = Math.min(1000 * Math.pow(2, retry++), maxDelay);
    setTimeout(() => {
      try {
        openSocket();
      } catch {
        // ignore
      }
    }, delay);
  };

  const openSocket = () => {
    try {
      emitter.emit('connecting');
      try {
        window.dispatchEvent(new CustomEvent('tp:obs', { detail: { status: 'connecting' } }));
      } catch {
        // ignore
      }
      ws = new WebSocket(mkUrl());
      ws.onopen = () => {
        emitter.emit('open');
        retry = 0;
        try {
          window.dispatchEvent(
            new CustomEvent('tp:obs', {
              detail: { status: 'open', recording: false },
            }),
          );
        } catch {
          // ignore
        }
      };
      ws.onmessage = onMessage;
      ws.onerror = () => {
        emitter.emit('error', new Error('WebSocket error'));
        try {
          window.dispatchEvent(
            new CustomEvent('tp:obs', {
              detail: { status: 'error' },
            }),
          );
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        emitter.emit('closed');
        try {
          window.dispatchEvent(
            new CustomEvent('tp:obs', {
              detail: { status: 'closed', recording: false },
            }),
          );
        } catch {
          // ignore
        }
        schedule();
      };
    } catch (err) {
      emitter.emit('error', err as Error);
    }
  };

  setTimeout(() => {
    if (!closedByUser) openSocket();
  }, 0);

  const api: ObsConnection = Object.assign(emitter, {
    close() {
      closedByUser = true;
      try {
        if (ws) ws.close(1000, 'client');
      } catch {
        // ignore
      }
      emitter.emit('closed');
      try {
        window.dispatchEvent(
          new CustomEvent('tp:obs', {
            detail: { status: 'closed', recording: false },
          }),
        );
      } catch {
        // ignore
      }
    },
    request,
    isIdentified() {
      return !!identified;
    },
  });

  return api;
}

export function createOBSAdapter() {
  const adapter: {
    id: string;
    label: string;
    __testConn?: any;
    isAvailable(): Promise<boolean>;
    start(): Promise<void>;
    stop(): Promise<void>;
    connect: typeof connect;
    test(opts?: any): Promise<boolean>;
    startStreaming(conn: any): Promise<ObsRequestResult | { ok: false }>;
    stopStreaming(conn: any): Promise<ObsRequestResult | { ok: false }>;
    startRecording(conn: any): Promise<ObsRequestResult | { ok: false }>;
    stopRecording(conn: any): Promise<ObsRequestResult | { ok: false }>;
  } = {
    id: 'obs',
    label: 'OBS (ws)',
    async isAvailable() {
      return typeof WebSocket !== 'undefined';
    },
    async start() {
      return Promise.resolve();
    },
    async stop() {
      return Promise.resolve();
    },
    connect,
    async test(opts?: unknown): Promise<boolean> {
      try {
        let conn: any = (adapter as any).__testConn;
        const cfg: any =
          (typeof window !== 'undefined' && (window as any).__OBS_CFG__) || {};
        const host = (opts as any)?.host || cfg.host || '127.0.0.1';
        const port = (opts as any)?.port || cfg.port || 4455;
        const password =
          (opts as any)?.password ||
          (opts as any)?.pass ||
          cfg.password ||
          cfg.pass ||
          '';

        if (!conn || !conn.isIdentified || !conn.isIdentified()) {
          try {
            conn && conn.close && conn.close();
          } catch {
            // ignore
          }
          conn = connect({ host, port, password, secure: false, reconnect: false });
          (adapter as any).__testConn = conn;

          await new Promise<boolean>((resolve) => {
            let done = false;
            const to = setTimeout(() => {
              if (!done) {
                done = true;
                resolve(false);
              }
            }, 1200);
            try {
              conn.on &&
                conn.on('identified', () => {
                  if (!done) {
                    done = true;
                    clearTimeout(to);
                    resolve(true);
                  }
                });
            } catch {
              resolve(false);
            }
          });
        }

        try {
          conn.request && (await conn.request('GetVersion', {}));
        } catch {
          // ignore
        }
        return true;
      } catch {
        return false;
      }
    },
    async startStreaming(conn: any) {
      try {
        if (!conn || !conn.request) return { ok: false };
        const res = await conn.request('StartStream', {});
        if (res && res.ok) {
          try {
            window.dispatchEvent(
              new CustomEvent('tp:obs', {
                detail: { status: 'identified', streaming: true },
              }),
            );
          } catch {
            // ignore
          }
        }
        return res;
      } catch {
        return { ok: false };
      }
    },
    async stopStreaming(conn: any) {
      try {
        if (!conn || !conn.request) return { ok: false };
        const res = await conn.request('StopStream', {});
        if (res && res.ok) {
          try {
            window.dispatchEvent(
              new CustomEvent('tp:obs', {
                detail: { status: 'identified', streaming: false },
              }),
            );
          } catch {
            // ignore
          }
        }
        return res;
      } catch {
        return { ok: false };
      }
    },
    async startRecording(conn: any) {
      try {
        if (!conn || !conn.request) return { ok: false };
        try {
          const S: any =
            (typeof window !== 'undefined' && (window as any).__tpStore)
              ? (window as any).__tpStore
              : null;
          const scene =
            S && typeof S.get === 'function'
              ? String(S.get('obsScene') || '')
              : '';
          if (scene) {
            await conn.request('SetCurrentProgramScene', { sceneName: scene });
          }
        } catch {
          // ignore
        }
        const res = await conn.request('StartRecord', {});
        if (res && res.ok) {
          try {
            window.dispatchEvent(
              new CustomEvent('tp:obs', {
                detail: { status: 'identified', recording: true },
              }),
            );
          } catch {
            // ignore
          }
        }
        return res;
      } catch {
        return { ok: false };
      }
    },
    async stopRecording(conn: any) {
      try {
        if (!conn || !conn.request) return { ok: false };
        const res = await conn.request('StopRecord', {});
        if (res && res.ok) {
          try {
            window.dispatchEvent(
              new CustomEvent('tp:obs', {
                detail: { status: 'identified', recording: false },
              }),
            );
          } catch {
            // ignore
          }
        }
        return res;
      } catch {
        return { ok: false };
      }
    },
  };

  try {
    const w = window as any;
    if (!w.__obsAdapter) w.__obsAdapter = adapter;
    w.__recorder =
      w.__recorder ||
      (typeof w.requireRecorderSomehow === 'function'
        ? w.requireRecorderSomehow()
        : w.__recorder);
  } catch {
    // ignore
  }

  return adapter;
}
