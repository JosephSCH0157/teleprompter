// Lightweight wrapper around the Web Speech API for the teleprompter
// Exposes a simple Recognizer class that emits transcripts to a callback.
export type RecognizerOptions = {
  lang?: string;
  interimIntervalMs?: number; // how often to forward interim results (debounce)
  maxAlternatives?: number;
};

type ResultCallback = (_transcript: string, _isFinal: boolean) => void;

export class Recognizer {
  private recog: any | null = null;
  private cb: ResultCallback | null = null;
  private opts: RecognizerOptions;
  private _lastInterimAt = 0;
  private shouldRun = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: RecognizerOptions = {}) {
    this.opts = Object.assign({ lang: 'en-US', interimIntervalMs: 150, maxAlternatives: 2 }, opts);
  }

  private logSpeechError(ev: any) {
    try {
      console.log('[speech] error', ev);
    } catch {}
  }

  private clearRestartTimer() {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private scheduleRestart(delayMs: number, opts: { stopFirst?: boolean } = {}) {
    if (!this.shouldRun) return;
    if (!this.recog || typeof this.recog.start !== 'function') return;
    const recognition = this.recog;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.shouldRun) return;
      if (opts.stopFirst) {
        try { recognition.stop?.(); } catch {}
      }
      try {
        recognition.start?.();
      } catch (err) {
        try { console.warn('[speech] restart failed', err); } catch {}
      }
    }, delayMs);
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
      this.shouldRun = true;
      this.clearRestartTimer();
      this.recog.continuous = true;
      this.recog.interimResults = true;
      this.recog.lang = this.opts.lang;
      try {
        this.recog.maxAlternatives = Math.max(2, this.recog.maxAlternatives || 0, this.opts.maxAlternatives || 2);
      } catch {}

      this.recog.onstart = () => {};
      this.recog.onerror = (ev: any) => {
        this.logSpeechError(ev);
        if (!ev || ev.error !== 'network') return;
        if (!this.shouldRun) return;
        this.clearRestartTimer();
        this.scheduleRestart(800, { stopFirst: true });
      };
      this.recog.onend = () => {
        if (!this.shouldRun) return;
        if (this.restartTimer !== null) return;
        this.scheduleRestart(500);
      };

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
        // Chrome may throw if start is requested too soon; rely on onerror/onend.
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
