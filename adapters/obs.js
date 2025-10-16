// OBS adapter for browser with dev-only candidate auth attempts and identify payload logging

/** @returns {import('../recorders.js').RecorderAdapter} */
export function createOBSAdapter() {
  var ws = null;
  var identified = false;
  var _lastErr = null;
  var cfg = { url: 'ws://127.0.0.1:4455', password: '' };

  // Dev tracing state
  var _candidateList = null;
  var _candidateIndex = 0;
  var _lastAuthSent = null;
  var _lastCandidateIndexUsed = null;
  var _retryingCandidates = false;

  var _enc = function (s) {
    return new TextEncoder().encode(s);
  };
  var _b64 = function (buf) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  };
  // Keep last auth sent for debug logging
  // canonical OBS v5 auth — exact recipe (no trims, no decoding, UTF-8 byte hashes)
  const _te = new TextEncoder();
  async function _sha(s) {
    return crypto.subtle.digest('SHA-256', _te.encode(s));
  }
  async function computeObsAuth(password, authInfo) {
    // authInfo is expected to contain { salt, challenge }
    const salt = authInfo && authInfo.salt ? String(authInfo.salt) : '';
    const challenge = authInfo && authInfo.challenge ? String(authInfo.challenge) : '';
    // 1) secretB64 = base64( SHA256( password + salt ) )
    const secretBuf = await _sha(String(password ?? '') + salt);
    const secretB64 = _b64(secretBuf);
    // 2) authentication = base64( SHA256( secretB64 + challenge ) )
    const authBuf = await _sha(secretB64 + challenge);
    return _b64(authBuf);
  }

  function configure(newCfg) {
    cfg = Object.assign({}, cfg, newCfg || {});
  }
  function isAvailable() {
    return Promise.resolve(typeof WebSocket !== 'undefined');
  }

  // computeAuthCandidates removed; using canonical computeObsAuth

  function _connect(opts) {
    opts = opts || {};
    var testOnly = !!opts.testOnly;
    return new Promise(function (resolve, reject) {
      try {
        try {
          if (ws) ws.close(1000, 'reconnect');
        } catch (ex) {
          void ex;
        }
        identified = false;
        _lastErr = null;
        var url = cfg.url || 'ws://127.0.0.1:4455';
        ws = new WebSocket(url);

        ws.onopen = function () {
          try {
            if (window && window.__TP_DEV) console.debug('[OBS-HS] socket open', url);
          } catch (ex) {
            void ex;
          }
          try {
            window.__obsHandshakeLog = window.__obsHandshakeLog || [];
            window.__obsHandshakeLog.push({ t: Date.now(), event: 'open', url: url });
          } catch (ex) {
            void ex;
          }
        };

        ws.onmessage = async function (ev) {
          try {
            var msg = JSON.parse(ev.data);
            try {
              if (window && window.__TP_DEV) console.debug('[OBS-HS] recv op=' + msg.op, msg.d);
            } catch (ex) {
              void ex;
            }
            try {
              window.__obsHandshakeLog = window.__obsHandshakeLog || [];
              window.__obsHandshakeLog.push({ t: Date.now(), op: msg.op, data: msg.d });
            } catch (ex) {
              void ex;
            }

            if (msg.op === 0) {
              var authInfo = msg.d && msg.d.authentication;
              var identify = { op: 1, d: { rpcVersion: 1 } };
              if (authInfo) {
                var pass = (cfg.password || '').toString().trim();
                if (!pass) {
                  try {
                    var domPass = '';
                    var setEl =
                      typeof document !== 'undefined' && document.getElementById('settingsObsPass');
                    var mainEl =
                      typeof document !== 'undefined' && document.getElementById('obsPassword');
                    if (setEl && setEl.value && setEl.value.trim()) domPass = setEl.value.trim();
                    else if (mainEl && mainEl.value && mainEl.value.trim())
                      domPass = mainEl.value.trim();
                    if (domPass) pass = domPass;
                    if (domPass && window && window.__TP_DEV)
                      console.debug('[OBS adapter] using DOM password fallback (settings/main)');
                  } catch (ex) {
                    void ex;
                  }
                }
                if (!pass) {
                  try {
                    ws.close(4009, 'password-empty');
                  } catch (ex) {
                    void ex;
                  }
                  _lastErr = new Error('OBS authentication required but no password is set.');
                  return reject(_lastErr);
                }

                // Compute canonical OBS v5 authentication value and attach to identify payload
                try {
                  const authVal = await computeObsAuth(pass, authInfo);
                  identify.d.authentication = authVal;
                  _lastAuthSent = authVal;
                  if (window && window.__TP_DEV)
                    console.debug('[OBS-HS] sending IDENTIFY (authentication present)');
                  try {
                    if (window && window.__TP_DEV)
                      console.debug('[OBS-HS] IDENTIFY payload:', identify);
                  } catch (ex) {
                    void ex;
                  }
                  try {
                    window.__obsHandshakeLog = window.__obsHandshakeLog || [];
                    var ent = {
                      t: Date.now(),
                      event: 'identify-sent',
                      auth: !!identify.d.authentication,
                    };
                    if (window && window.__TP_DEV) ent.identifyPayload = identify;
                    window.__obsHandshakeLog.push(ent);
                  } catch (ex) {
                    void ex;
                  }
                } catch (exAuth) {
                  // failed to compute auth — set last error and close
                  _lastErr = exAuth;
                  try {
                    ws.close(4009, 'auth-compute-failed');
                  } catch (ex) {
                    void ex;
                  }
                  return reject(exAuth);
                }
              }
              try {
                ws.send(JSON.stringify(identify));
              } catch (ex) {
                void ex;
              }
            } else if (msg.op === 2) {
              identified = true;
              try {
                if (window && window.__TP_DEV) console.debug('[OBS-HS] IDENTIFIED', msg.d);
              } catch (ex) {
                void ex;
              }
              try {
                window.__obsHandshakeLog = window.__obsHandshakeLog || [];
                window.__obsHandshakeLog.push({ t: Date.now(), event: 'identified', data: msg.d });
              } catch (ex) {
                void ex;
              }
              if (testOnly) {
                try {
                  ws.close(1000, 'test-ok');
                } catch (ex) {
                  void ex;
                }
              }
              return resolve(true);
            }
          } catch (e) {
            _lastErr = e;
            try {
              ws.close(4000, 'msg-parse-error');
            } catch (ex) {
              void ex;
            }
            return reject(e);
          }
        };

        ws.onerror = function (ev) {
          try {
            if (window && window.__TP_DEV) console.debug('[OBS-HS] socket error', ev);
            try {
              window.__obsHandshakeLog = window.__obsHandshakeLog || [];
              window.__obsHandshakeLog.push({ t: Date.now(), event: 'error', data: ev });
            } catch (ex) {
              void ex;
            }
          } catch (ex) {
            void ex;
          }
        };

        ws.onclose = function (e) {
          try {
            if (window && window.__TP_DEV)
              console.debug('[OBS-HS] socket close', e && e.code, e && e.reason);
            try {
              window.__obsHandshakeLog = window.__obsHandshakeLog || [];
              var entry = {
                t: Date.now(),
                event: 'close',
                code: (e && e.code) || 0,
                reason: (e && e.reason) || '',
              };
              if (e && e.code === 4009 && window && window.__TP_DEV) {
                try {
                  entry.debugAuth = _lastAuthSent || null;
                } catch (ex) {
                  void ex;
                }
              }
              window.__obsHandshakeLog.push(entry);
            } catch (ex) {
              void ex;
            }
          } catch (ex) {
            void ex;
          }

          if (!identified) {
            var err = new Error(
              ('close ' + ((e && e.code) || 0) + ' ' + ((e && e.reason) || '')).trim()
            );
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
      if (ws) ws.close(1000, 'stop');
    } catch (ex) {
      void ex;
    }
    ws = null;
  }
  async function test() {
    return _connect({ testOnly: true });
  }
  // Dev helper: probe multiple ws URLs (host+port) and return which one authenticates.
  // Accepts an array of url strings (e.g. ['ws://host:4455','ws://host:64376']).
  async function probePorts(urls) {
    if (!Array.isArray(urls)) throw new Error('urls must be an array');
    const orig = cfg.url;
    const results = [];
    for (let u of urls) {
      try {
        cfg.url = u;
        try {
          const ok = await _connect({ testOnly: true });
          results.push({ url: u, ok: !!ok });
          if (ok) {
            // restore and return early with success
            cfg.url = orig;
            return { success: true, url: u, results };
          }
        } catch (err) {
          results.push({
            url: u,
            ok: false,
            error: String(err && err.message ? err.message : err),
          });
        }
      } catch (outer) {
        results.push({
          url: u,
          ok: false,
          error: String(outer && outer.message ? outer.message : outer),
        });
      }
    }
    cfg.url = orig;
    return { success: false, results };
  }
  function getLastError() {
    return _lastErr ? _lastErr.message || String(_lastErr) : null;
  }

  // Dev-only: expose a quick helper to test a specific candidate from the console
  try {
    if (typeof window !== 'undefined' && window.__TP_DEV) {
      try {
        window.__obsProbePorts = function (urls) {
          try {
            return probePorts(urls);
          } catch (ex) {
            return Promise.reject(ex);
          }
        };
      } catch (ex) {
        void ex;
      }
    }
  } catch (ex) {
    void ex;
  }

  return {
    id: 'obs',
    label: 'OBS (WebSocket)',
    configure: configure,
    isAvailable: isAvailable,
    start: start,
    stop: stop,
    test: test,
    // testCandidate removed; use __obsProbePorts or adapter.test()
    getLastError: getLastError,
  };
}
