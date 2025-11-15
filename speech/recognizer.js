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
    this.opts = Object.assign({ lang: "en-US", interimIntervalMs: 150, maxAlternatives: 2 }, opts);
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
      this.recog.continuous = true;
      this.recog.interimResults = true;
      this.recog.lang = this.opts.lang;
      try {
        this.recog.maxAlternatives = Math.max(2, this.recog.maxAlternatives || 0, this.opts.maxAlternatives || 2);
      } catch {
      }
      this.recog.onstart = () => {
      };
      this.recog.onend = () => {
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
        throw e;
      }
    } catch (err) {
      this.recog = null;
      throw err;
    }
  }
  stop() {
    try {
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
