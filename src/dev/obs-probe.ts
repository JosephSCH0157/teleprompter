// Minimal OBS v5 test connector with proper v5 auth
function b64(buf: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function enc(str: string) { return new TextEncoder().encode(str); }
function base64ToBytes(b64Str: string) {
  try {
    const bin = atob(b64Str);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  } catch { return new Uint8Array(); }
}

async function sha256Bytes(bytes: Uint8Array | ArrayBuffer) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return crypto.subtle.digest('SHA-256', view.buffer as unknown as ArrayBuffer);
}

async function computeAuth(password: string, saltB64: string, challenge: string) {
  // secret = base64( SHA256( passBytes + saltBytes ) )
  const passBytes = enc(password);
  const saltBytes = base64ToBytes(saltB64);
  const passPlusSalt = new Uint8Array(passBytes.length + saltBytes.length);
  passPlusSalt.set(passBytes, 0);
  passPlusSalt.set(saltBytes, passBytes.length);
  const secretBuf = await sha256Bytes(passPlusSalt);
  const secretB64 = b64(secretBuf);
  // auth = base64( SHA256( secretB64 + challenge ) )
  const authBuf = await sha256Bytes(enc(secretB64 + challenge));
  return b64(authBuf);
}

/** Minimal OBS v5 handshake; resolves on GetVersion success, throws on failure. */
export async function obsTestConnect(wsUrl: string, password = ""): Promise<{version?: string}> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null, closed = false;
    const fail = (e: any) => { if (!closed) { closed = true; try { ws?.close(); } catch {} reject(e); } };
    try { ws = new WebSocket(wsUrl); } catch (e) { return fail(e); }

    ws.onopen = () => {/* wait for Hello */};
    ws.onerror = () => fail(new Error('WebSocket error'));
    ws.onclose = () => fail(new Error('Connection closed'));

    ws.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        // 0 Hello, 1 Identify, 2 Identified, 6 Request, 7 RequestResponse
        if (msg.op === 0) {
          const d = msg.d || {};
          const ident: any = { op: 1, d: { rpcVersion: 1 } };
          if (d.authentication && password) {
            ident.d.authentication = await computeAuth(password, d.authentication.salt, d.authentication.challenge);
          }
          ws!.send(JSON.stringify(ident));
          // Also ask for version to prove RPC works
          const reqId = Math.random().toString(36).slice(2);
          ws!.send(JSON.stringify({ op: 6, d: { requestType: 'GetVersion', requestId: reqId } }));
        } else if (msg.op === 7) {
          if (msg.d?.requestStatus?.result) {
            const version = msg.d?.responseData?.obsVersion;
            closed = true; try { ws!.close(); } catch {}
            resolve({ version });
          } else {
            fail(new Error('OBS RPC failed: ' + (msg.d?.requestStatus?.comment || 'unknown')));
          }
        }
      } catch (e) { fail(e); }
    };
  });
}

// Expose for quick console tests
try { (window as any).__obsTestConnect = obsTestConnect; } catch {}
