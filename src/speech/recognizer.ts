// Lightweight wrapper around the Web Speech API for the teleprompter
// Exposes a simple Recognizer class that emits transcripts to a callback.
export type RecognizerOptions = {
  lang?: string;
  interimIntervalMs?: number; // how often to forward interim results (debounce)
  maxAlternatives?: number;
};

type ResultCallback = (transcript: string, isFinal: boolean) => void;

export class Recognizer {
  private recog: any | null = null;
  private cb: ResultCallback | null = null;
  private opts: RecognizerOptions;
  private _lastInterimAt = 0;

  constructor(opts: RecognizerOptions = {}) {
    this.opts = Object.assign({ lang: 'en-US', interimIntervalMs: 150, maxAlternatives: 2 }, opts);
  }

  available(): boolean {
    return Boolean((globalThis as any).SpeechRecognition || (globalThis as any).webkitSpeechRecognition);
  }

  start(cb: ResultCallback) {
    this.cb = cb;
    const SR = (globalThis as any).SpeechRecognition || (globalThis as any).webkitSpeechRecognition;
    if (!SR) throw new Error('SpeechRecognition not available');
    try {
      this.recog = new SR();
      this.recog.continuous = true;
      this.recog.interimResults = true;
      this.recog.lang = this.opts.lang;
      try {
        this.recog.maxAlternatives = Math.max(2, this.recog.maxAlternatives || 0, this.opts.maxAlternatives || 2);
      } catch {}

      this.recog.onstart = () => {};
      this.recog.onend = () => {};

      this.recog.onresult = (e: any) => {
        let interim = '';
        let finals = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finals += (r[0]?.transcript || '') + ' ';
          else interim += (r[0]?.transcript || '') + ' ';
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
        // start may throw depending on permissions/state
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
        try { this.recog.stop(); } catch {}
      }
    } finally {
      this.recog = null;
      this.cb = null;
    }
  }
}

// Export a convenience factory used by a loader or runtime shim
export function createRecognizer(opts?: RecognizerOptions) {
  return new Recognizer(opts);
}
