var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/speech/recognizer.ts
var Recognizer = class {
  constructor(opts = {}) {
    __publicField(this, "recog", null);
    __publicField(this, "cb", null);
    __publicField(this, "opts");
    __publicField(this, "_lastInterimAt", 0);
    __publicField(this, "shouldRun", false);
    __publicField(this, "restartTimer", null);
    this.opts = Object.assign({ lang: "en-US", interimIntervalMs: 150, maxAlternatives: 2 }, opts);
  }
  logSpeechError(ev) {
    try {
      console.log("[speech] error", ev);
    } catch {
    }
  }
  clearRestartTimer() {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }
  scheduleRestart(delayMs, opts = {}) {
    if (!this.shouldRun) return;
    if (!this.recog || typeof this.recog.start !== "function") return;
    const recognition = this.recog;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.shouldRun) return;
      if (opts.stopFirst) {
        try {
          recognition.stop?.();
        } catch {
        }
      }
      try {
        recognition.start?.();
      } catch (err) {
        try {
          console.warn("[speech] restart failed", err);
        } catch {
        }
      }
    }, delayMs);
  }
  available() {
    return Boolean(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);
  }
  start(cb) {
    this.cb = cb;
    const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!SR) throw new Error("SpeechRecognition not available");
    try {
      this.recog = new SR();
      try {
        if (typeof window !== "undefined") {
          window.recog = this.recog;
        }
      } catch {
      }
      this.shouldRun = true;
      this.clearRestartTimer();
      this.recog.continuous = true;
      this.recog.interimResults = true;
      this.recog.lang = this.opts.lang;
      try {
        this.recog.maxAlternatives = Math.max(2, this.recog.maxAlternatives || 0, this.opts.maxAlternatives || 2);
      } catch {
      }
      this.recog.onstart = () => {
      };
      this.recog.onerror = (ev) => {
        this.logSpeechError(ev);
        if (!ev || ev.error !== "network") return;
        if (!this.shouldRun) return;
        this.clearRestartTimer();
        this.scheduleRestart(800, { stopFirst: true });
      };
      this.recog.onend = () => {
        if (!this.shouldRun) return;
        if (this.restartTimer !== null) return;
        this.scheduleRestart(500);
      };
      this.recog.onresult = (e) => {
        let interim = "";
        let finals = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finals += (r[0]?.transcript || "") + " ";
          else interim += (r[0]?.transcript || "") + " ";
        }
        if (finals && this.cb) this.cb(finals.trim(), true);
        const now = performance.now();
        if (interim && now - this._lastInterimAt > (this.opts.interimIntervalMs || 150)) {
          this._lastInterimAt = now;
          if (this.cb) this.cb(interim.trim(), false);
        }
      };
      try {
        this.recog.start();
      } catch (e) {
        this.logSpeechError(e);
      }
    } catch (err) {
      this.shouldRun = false;
      this.clearRestartTimer();
      this.recog = null;
      throw err;
    }
  }
  stop() {
    try {
      this.shouldRun = false;
      this.clearRestartTimer();
      if (this.recog) {
        try {
          this.recog.stop();
        } catch {
        }
      }
    } finally {
      this.recog = null;
      this.cb = null;
    }
  }
};
function createRecognizer(opts) {
  return new Recognizer(opts);
}
export {
  Recognizer,
  createRecognizer
};
//# sourceMappingURL=recognizer.js.map
