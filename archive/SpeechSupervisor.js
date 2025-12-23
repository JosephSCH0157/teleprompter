// --- SpeechSupervisor.js ---
export class SpeechSupervisor {
  constructor({ onResult, onStatus, lang = 'en-US', interim = false, onFatal } = {}) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) throw new Error('Web Speech API not available');

    this.SR = SR;
    this.lang = lang;
    this.interim = interim;
    this.onResult = onResult || (()=>{});
    this.onStatus = onStatus || ((s)=>console.debug('[speech]', s));
    this._sr = null;

    this.shouldListen = false;        // single source of truth
    this._starting = false;
    this._hb = null;                  // heartbeat interval
    this._lastResultTs = 0;
    this._backoffMs = 200;            // will cap at 3000
    this._chunkTimer = null;          // proactive recycle timer
    this._networkErrorCount = 0;
    this._lastNetworkError = 0;
    this._fatalBackoffMs = 30000; // 30s pause after repeated failures
    this.onFatal = onFatal || ((err) => {
      console.error('[speech] fatal error', err);
      this.onStatus({ type: 'fatal', error: err });
    });
  }

  _makeRecognizer() {
    const r = new this.SR();
    r.lang = this.lang;
    r.continuous = true;              // keep streaming
    r.interimResults = this.interim;

    r.onresult = (e) => {
      this._lastResultTs = performance.now();
      try { this.onResult(e); } catch {}
    };

    r.onerror = (e) => {
      const errType = e.error || String(e);
      this.onStatus({ type: 'error', error: errType });
      // Typical culprits: 'network', 'no-speech', 'audio-capture'
      // Robust network error handling
      if (errType === 'network') {
        const now = Date.now();
        if (now - this._lastNetworkError > 60000) {
          this._networkErrorCount = 0;
        }
        this._networkErrorCount++;
        this._lastNetworkError = now;
        if (this._networkErrorCount >= 3) {
          // Too many consecutive network errors, pause longer and notify
          this.onStatus({ type: 'network-fatal', count: this._networkErrorCount });
          this.shouldListen = false;
          setTimeout(() => {
            this._networkErrorCount = 0;
            this.shouldListen = true;
            this.start();
          }, this._fatalBackoffMs);
          this.onFatal('Too many consecutive network errors. Pausing for 30s.');
        }
      }
      // Let onend handle restart to avoid double starts.
    };

    r.onend = () => {
      // Browser stopped listening (after error or spontaneously)
      this.onStatus({ type: 'end' });
      this._sr = null;
      if (this.shouldListen) {
        // Backoff and restart
        const delay = Math.min(this._backoffMs, 3000);
        this.onStatus({ type: 'restart', delay });
        setTimeout(() => this.start(), delay);
        this._backoffMs = Math.min(this._backoffMs * 2, 3000);
      }
    };

    return r;
  }

  async start() {
    if (this._starting || this._sr) {
      this.shouldListen = true;
      return;
    }
    this._starting = true;
    this.shouldListen = true;

    // (Re)build recognizer
    this._sr = this._makeRecognizer();
    this._backoffMs = 200;
    this._lastResultTs = performance.now();

    // Kick off
    try {
      this._sr.start();
      this.onStatus({ type: 'start' });
    } catch (e) {
      this.onStatus({ type: 'start-error', error: String(e) });
      this._sr = null;
      this._starting = false;
      // Try again shortly if still desired
      if (this.shouldListen) {
        const delay = Math.min(this._backoffMs, 3000);
        setTimeout(() => this.start(), delay);
        this._backoffMs = Math.min(this._backoffMs * 2, 3000);
      }
      return;
    } finally {
      this._starting = false;
    }

    // Heartbeat: if no results for too long (e.g., 15s), refresh
    if (!this._hb) {
      this._hb = setInterval(() => {
        if (!this.shouldListen) return;
        const idleMs = performance.now() - this._lastResultTs;
        if (idleMs > 15000) {
          this.onStatus({ type: 'idle-refresh', idleMs });
          this._recycle();
        }
      }, 5000);
    }

    // Proactive chunk recycle: ~55s to dodge vendor timeouts
    this._armChunkTimer();
  }

  _armChunkTimer() {
    this._clearChunkTimer();
    this._chunkTimer = setTimeout(() => {
      if (!this.shouldListen) return;
      this.onStatus({ type: 'chunk-recycle' });
      this._recycle();
    }, 55000);
  }

  _clearChunkTimer() {
    if (this._chunkTimer) {
      clearTimeout(this._chunkTimer);
      this._chunkTimer = null;
    }
  }

  _recycle() {
    // Stop+restart quickly to refresh the session
    try { this._sr && this._sr.stop(); } catch {}
    // onend will call start() if shouldListen is true
  }

  async stop({ manual = false } = {}) {
    this.shouldListen = false; // crucial: prevents auto-restarts
    this._clearChunkTimer();
    if (this._hb) { clearInterval(this._hb); this._hb = null; }

    if (this._sr) {
      this.onStatus({ type: 'stop', manual });
      try { this._sr.stop(); } catch {}
      this._sr = null;
    } else {
      this.onStatus({ type: 'stop', manual, note: 'no recognizer' });
    }
  }
}
