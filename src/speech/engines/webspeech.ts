// =============================================================
// File: src/speech/engines/webspeech.ts
// =============================================================
import type { AsrEngine, AsrEngineOptions, AsrEvent } from '../asr-engine';
import { Emitter } from '../asr-engine';

/**
 * Web Speech API engine (Chromium/Edge). Falls back gracefully if unsupported.
 */
export class WebSpeechEngine implements AsrEngine {
  public name = 'webspeech';
  private emitter = new Emitter<AsrEvent>();
  private recognition: any | null = null;
  private lastPartialAt = 0;
  private shouldRun = false;
  private restartTimer: number | null = null;
  private restarting = false;

  on(cb: (_e: AsrEvent) => void): void { this.emitter.on(cb); }

  async start(opts: AsrEngineOptions): Promise<void> {
    const AnyWindow = window as any;
    const Ctor = AnyWindow.webkitSpeechRecognition || AnyWindow.SpeechRecognition;
    if (!Ctor) {
      this.emitter.emit({ type: 'error', code: 'unsupported', message: 'Web Speech not available' });
      return;
    }

    const rec = new Ctor();
    this.recognition = rec;
    this.shouldRun = true;
    this.restarting = false;
    if (this.restartTimer != null) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    rec.continuous = true;
    rec.interimResults = !!opts.interim;
    rec.lang = opts.lang || 'en-US';

    rec.onstart = () => {
      this.emitter.emit({ type: 'ready' });
      this.emitter.emit({ type: 'listening' });
    };

    rec.onresult = (ev: any) => {
      // Build partial/final strings from the delta
      let partial = '';
      let finalText = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const text = res[0]?.transcript ?? '';
        if (res.isFinal) finalText += text + ' ';
        else partial += text + ' ';
      }

      const now = performance.now();
      if (partial && opts.interim && now - this.lastPartialAt > 120) {
        this.emitter.emit({ type: 'partial', text: partial.trim(), confidence: 0.5 });
        this.lastPartialAt = now;
      }
      if (finalText) {
        this.emitter.emit({ type: 'final', text: finalText.trim(), confidence: 1 });
      }
    };

    rec.onerror = (e: any) => {
      const code = (e?.error || 'error') as string;
      const message = (e?.message || String(e?.error) || 'ASR error');
      this.emitter.emit({ type: 'error', code, message });
      if (
        code === 'not-allowed' ||
        code === 'service-not-allowed' ||
        code === 'audio-capture'
      ) {
        this.shouldRun = false;
      }
    };

    rec.onend = () => {
      if (!this.shouldRun) {
        this.emitter.emit({ type: 'stopped' });
        return;
      }
      if (this.restarting) return;
      this.restarting = true;
      if (this.restartTimer != null) {
        window.clearTimeout(this.restartTimer);
      }
      this.restartTimer = window.setTimeout(() => {
        this.restartTimer = null;
        if (!this.shouldRun || !this.recognition) {
          this.restarting = false;
          return;
        }
        try {
          this.recognition.start();
        } catch (err: any) {
          this.emitter.emit({
            type: 'error',
            code: 'restart-failed',
            message: err?.message || String(err),
          });
        } finally {
          this.restarting = false;
        }
      }, 120);
    };

    try {
      rec.start();
    } catch (err: any) {
      this.emitter.emit({ type: 'error', code: 'start-failed', message: err?.message || String(err) });
    }
  }

  async stop(): Promise<void> {
    this.shouldRun = false;
    this.restarting = false;
    if (this.restartTimer != null) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    try { this.recognition?.stop(); } catch { /* no-op */ }
    this.recognition = null;
  }
}
