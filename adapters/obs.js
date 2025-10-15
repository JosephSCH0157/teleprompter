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
  const sha = (s) => crypto.subtle.digest('SHA-256', enc(s));

  async function computeAuth(pass, authInfo) {
    if (!authInfo || !authInfo.challenge || !authInfo.salt) return undefined;
    const password = String(pass ?? '');
    const secret = await sha(authInfo.salt + password);
    const authBuf = await sha(password + b64(secret) + authInfo.challenge);
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

        ws.onmessage = async (ev) => {
          try {
            const msg = JSON.parse(ev.data);
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
              }
              ws.send(JSON.stringify(identify));
            } else if (msg.op === 2) {
              identified = true;
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

        ws.onerror = () => {
          /* will be surfaced onclose */
        };

        ws.onclose = (e) => {
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
