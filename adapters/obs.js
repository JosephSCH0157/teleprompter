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

  var enc = function (s) {
    return new TextEncoder().encode(s);
  };
  var b64 = function (buf) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  };

  function base64ToUint8Array(s) {
    try {
      var bin = atob(s);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    } catch (ex) {
      void ex;
      return new Uint8Array();
    }
  }

  function concatUint8(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  function configure(newCfg) {
    cfg = Object.assign({}, cfg, newCfg || {});
  }
  function isAvailable() {
    return Promise.resolve(typeof WebSocket !== 'undefined');
  }

  async function computeAuthCandidates(pass, authInfo) {
    if (!authInfo || !authInfo.challenge || !authInfo.salt)
      return { secretB64: null, candidates: [] };
    var password = String(pass || '');
    var saltBytes = base64ToUint8Array(authInfo.salt);
    var passBytes = enc(password);

    var secretBuf1 = await crypto.subtle.digest('SHA-256', concatUint8(saltBytes, passBytes));
    var secretBuf2 = await crypto.subtle.digest('SHA-256', concatUint8(passBytes, saltBytes));
    var secretB641 = b64(secretBuf1);
    var secretB642 = b64(secretBuf2);

    var challengeStr = authInfo.challenge;
    var challengeBytes = base64ToUint8Array(challengeStr);
    var challengeUtf8 = enc(challengeStr);

    var candidates = [];

    async function hashFromText(s) {
      var h = await crypto.subtle.digest('SHA-256', enc(s));
      return b64(h);
    }
    async function hashFromUint8(u8) {
      var h = await crypto.subtle.digest('SHA-256', u8);
      return b64(h);
    }

    candidates.push({ label: 'A', auth: await hashFromText(password + secretB641 + challengeStr) });
    candidates.push({ label: 'B', auth: await hashFromText(secretB641 + challengeStr) });
    candidates.push({
      label: 'C',
      auth: await hashFromUint8(concatUint8(new Uint8Array(secretBuf1), challengeBytes)),
    });
    candidates.push({
      label: 'D',
      auth: await hashFromUint8(concatUint8(new Uint8Array(secretBuf1), challengeUtf8)),
    });
    candidates.push({ label: 'E', auth: await hashFromText(password + secretB642 + challengeStr) });
    candidates.push({ label: 'F', auth: await hashFromText(secretB642 + challengeStr) });
    candidates.push({
      label: 'G',
      auth: await hashFromUint8(concatUint8(new Uint8Array(secretBuf2), challengeBytes)),
    });

    return { secretB64: secretB641, candidates: candidates };
  }

  function _connect(opts) {
    opts = opts || {};
    var testOnly = !!opts.testOnly;
    var forceVariant = typeof opts.forceVariant !== 'undefined' ? opts.forceVariant : undefined;
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

                var computed = await computeAuthCandidates(pass, authInfo);
                _candidateList = Array.isArray(computed && computed.candidates)
                  ? computed.candidates
                  : [];
                // Dev-only: record the full computed candidate list so we can map labels to auth strings
                try {
                  if (window && window.__TP_DEV) {
                    window.__obsHandshakeLog = window.__obsHandshakeLog || [];
                    window.__obsHandshakeLog.push({
                      t: Date.now(),
                      event: 'candidates-computed',
                      secretB64: computed && computed.secretB64,
                      candidates: (_candidateList || []).map(function (c) {
                        return { label: c.label, auth: c.auth };
                      }),
                    });
                  }
                } catch (ex) {
                  void ex;
                }
                // Prefer the OBS-standard candidate (label 'B') when available
                if (typeof forceVariant === 'number') {
                  _candidateIndex = forceVariant;
                } else {
                  var preferB = -1;
                  try {
                    for (var ii = 0; ii < (_candidateList || []).length; ii++) {
                      if ((_candidateList[ii] && _candidateList[ii].label) === 'B') {
                        preferB = ii;
                        break;
                      }
                    }
                  } catch (ex) {
                    void ex;
                  }
                  _candidateIndex = preferB >= 0 ? preferB : 0;
                }
                if (_candidateIndex < 0) _candidateIndex = 0;

                var primary = null;
                if (_candidateList && _candidateList[_candidateIndex])
                  primary = _candidateList[_candidateIndex].auth;
                if (!primary && _candidateList && _candidateList.length)
                  primary = _candidateList[0].auth;
                identify.d.authentication = primary;
                _lastAuthSent = primary;
                _lastCandidateIndexUsed = _candidateIndex;

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
                    variant:
                      _candidateList &&
                      _candidateList[_candidateIndex] &&
                      _candidateList[_candidateIndex].label
                        ? 'candidate-' + _candidateList[_candidateIndex].label
                        : 'unknown',
                  };
                  if (window && window.__TP_DEV) ent.identifyPayload = identify;
                  window.__obsHandshakeLog.push(ent);
                } catch (ex) {
                  void ex;
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
                try {
                  if (_candidateList && typeof _lastCandidateIndexUsed === 'number') {
                    var cand = _candidateList[_lastCandidateIndexUsed];
                    if (cand && cand.label) entry.candidate = cand.label;
                  }
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
            if (
              e &&
              e.code === 4009 &&
              _candidateList &&
              Array.isArray(_candidateList) &&
              !_retryingCandidates
            ) {
              try {
                var nextIndex = (typeof _candidateIndex === 'number' ? _candidateIndex : 0) + 1;
                if (nextIndex < _candidateList.length) {
                  _retryingCandidates = true;
                  if (window && window.__TP_DEV)
                    console.debug(
                      '[OBS-HS] auth failed, retrying with next candidate index',
                      nextIndex
                    );
                  setTimeout(function () {
                    _connect({ testOnly: testOnly, forceVariant: nextIndex })
                      .then(resolve)
                      .catch(reject)
                      .finally(function () {
                        _retryingCandidates = false;
                      });
                  }, 250);
                  return;
                }
              } catch (ex) {
                void ex;
              }
            }
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
  // Dev helper: test a single candidate index
  async function testCandidate(idx) {
    return _connect({ testOnly: true, forceVariant: idx });
  }
  function getLastError() {
    return _lastErr ? _lastErr.message || String(_lastErr) : null;
  }

  // Dev-only: expose a quick helper to test a specific candidate from the console
  try {
    if (typeof window !== 'undefined' && window.__TP_DEV) {
      try {
        window.__obsTestCandidate = function (i) {
          try {
            return testCandidate(i);
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
    testCandidate: testCandidate,
    getLastError: getLastError,
  };
}
