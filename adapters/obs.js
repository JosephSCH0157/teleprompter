// Compact raw-WebSocket OBS v5 adapter implementation
// Single-file, zero-dependency adapter that performs IDENTIFY handshake

/** @returns {import('../recorders.js').RecorderAdapter} */
export function createOBSAdapter() {
  let ws = null;
  let identified = false;
  let _lastErr = null;
  let cfg = { url: 'ws://127.0.0.1:4455', password: '' };

  function configure(newCfg = {}) {
    cfg = { ...cfg, ...newCfg };
  }

  const enc = (s) => new TextEncoder().encode(s);
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

  function base64ToUint8Array(b64) {
    try {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    } catch {
      return new Uint8Array();
    }
  }

  function concatUint8(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  async function computeAuth(pass, authInfo) {
    // Follow OBS WebSocket v5 spec:
    // secret = SHA256(saltBytes + UTF8(password)) where salt is base64-decoded
    // auth = base64(SHA256( UTF8(password + base64(secret)) + challenge ))
    if (!authInfo || !authInfo.challenge || !authInfo.salt) return undefined;
    const password = String(pass ?? '');
    // salt is provided as base64; decode to bytes
    const saltBytes = base64ToUint8Array(authInfo.salt);
    const passBytes = enc(password);
    const secretInput = concatUint8(saltBytes, passBytes);
    const secretBuf = await crypto.subtle.digest('SHA-256', secretInput);
    const secretB64 = b64(secretBuf);

    // compute authentication per alternate OBS v5 spec variant:
    // auth = base64( SHA256( UTF8(secretB64 + challenge) ) ) — omit password here
    const authInputStr = secretB64 + authInfo.challenge;
    const authBuf = await crypto.subtle.digest('SHA-256', enc(authInputStr));
    return b64(authBuf);
  }

  function isAvailable() {
    return Promise.resolve(typeof WebSocket !== 'undefined');
  }

  function _connect({ testOnly = false } = {}) {
    return new Promise((resolve, reject) => {
      try {
        try {
          ws?.close(1000, 'reconnect');
        } catch {}
        identified = false;
        _lastErr = null;
        const url = cfg.url || 'ws://192.168.1.198:4455';
        ws = new WebSocket(url);

        ws.onopen = () => {
          try {
            if (window && window.__TP_DEV) console.debug('[OBS-HS] socket open', url);
            try {
              window.__obsHandshakeLog = window.__obsHandshakeLog || [];
              window.__obsHandshakeLog.push({ t: Date.now(), event: 'open', url });
            } catch {}
          } catch {}
        };

        ws.onmessage = async (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            try {
              if (window && window.__TP_DEV) console.debug('[OBS-HS] recv op=' + msg.op, msg.d);
              try {
                window.__obsHandshakeLog = window.__obsHandshakeLog || [];
                window.__obsHandshakeLog.push({ t: Date.now(), op: msg.op, data: msg.d });
              } catch {}
            } catch {}
            if (msg.op === 0) {
              const authInfo = msg.d?.authentication;
              let identify = { op: 1, d: { rpcVersion: 1 } };
              if (authInfo) {
                // Prefer configured password, otherwise fall back to DOM #obsPassword if present
                let pass = (cfg.password ?? '').trim();
                if (!pass) {
                  try {
                    const domPass =
                      typeof document !== 'undefined' && document.getElementById('obsPassword')
                        ? document.getElementById('obsPassword').value || ''
                        : '';
                    if (domPass && domPass.trim()) {
                      pass = domPass.trim();
                      try {
                        if (window && window.__TP_DEV)
                          console.debug('[OBS adapter] using DOM password fallback');
                      } catch {}
                    }
                  } catch {}
                }
                if (!pass) {
                  try {
                    ws.close(4009, 'password-empty');
                  } catch {}
                  _lastErr = new Error('OBS authentication required but no password is set.');
                  return reject(_lastErr);
                }
                const authentication = await computeAuth(pass, authInfo);
                identify.d.authentication = authentication;
                try {
                  if (window && window.__TP_DEV)
                    console.debug('[OBS-HS] sending IDENTIFY (authentication present)');
                  try {
                    window.__obsHandshakeLog = window.__obsHandshakeLog || [];
                    window.__obsHandshakeLog.push({
                      t: Date.now(),
                      event: 'identify-sent',
                      auth: !!identify.d.authentication,
                    });
                  } catch {}
                } catch {}
              }
              ws.send(JSON.stringify(identify));
            } else if (msg.op === 2) {
              identified = true;
              try {
                if (window && window.__TP_DEV) console.debug('[OBS-HS] IDENTIFIED', msg.d);
                try {
                  window.__obsHandshakeLog = window.__obsHandshakeLog || [];
                  window.__obsHandshakeLog.push({
                    t: Date.now(),
                    event: 'identified',
                    data: msg.d,
                  });
                } catch {}
              } catch {}
              if (testOnly) {
                try {
                  ws.close(1000, 'test-ok');
                } catch {}
              }
              return resolve(true);
            } else if (msg.op === 7) {
              // events (e.g., RecordStateChanged) could be handled here
            }
          } catch (e) {
            _lastErr = e;
            try {
              ws.close(4000, 'msg-parse-error');
            } catch {}
            return reject(e);
          }
        };

        ws.onerror = (ev) => {
          try {
            if (window && window.__TP_DEV) console.debug('[OBS-HS] socket error', ev);
            try {
              window.__obsHandshakeLog = window.__obsHandshakeLog || [];
              window.__obsHandshakeLog.push({ t: Date.now(), event: 'error', data: ev });
            } catch {}
          } catch {}
        };

        ws.onclose = (e) => {
          try {
            if (window && window.__TP_DEV)
              console.debug('[OBS-HS] socket close', e?.code, e?.reason);
            try {
              window.__obsHandshakeLog = window.__obsHandshakeLog || [];
              window.__obsHandshakeLog.push({
                t: Date.now(),
                event: 'close',
                code: e?.code,
                reason: e?.reason,
              });
            } catch {}
          } catch {}
          if (!identified) {
            const err = new Error(`close ${e?.code || 0} ${e?.reason || ''}`.trim());
            _lastErr = err;
            return reject(err);
          }
        };
      } catch (outer) {
        _lastErr = outer;
        return reject(outer);
      }
    });
  }

  async function start() {
    await _connect({ testOnly: false });
  }

  async function stop() {
    identified = false;
    try {
      ws?.close(1000, 'stop');
    } catch {}
    ws = null;
  }

  async function test() {
    return _connect({ testOnly: true });
  }

  function getLastError() {
    return _lastErr ? _lastErr.message || String(_lastErr) : null;
  }

  return {
    id: 'obs',
    label: 'OBS (WebSocket)',
    configure,
    isAvailable,
    start,
    stop,
    test,
    getLastError,
  };
}
