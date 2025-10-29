import type { AdapterStatus, InputAdapter, WebSpeechFeature } from '../types';
import { emitAsrError, emitTokensEvent } from '../types';

export function createWebSpeechAdapter(): InputAdapter {
  let ready = false;
  let error: string | undefined;
  const subs = new Set<(f: WebSpeechFeature) => void>();
  let rec: any = null;
  let started = false;
  let restartCount = 0;
  let firstRestartAt = 0;

  function status(): AdapterStatus { return { kind: 'webspeech', ready, error }; }

  async function start(): Promise<void> {
    try {
      if (started) return;
      const RS: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (!RS) { error = 'webspeech_unavailable'; ready = false; return; }
      rec = new RS();
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (event: any) => {
        try {
          const results = event?.results || [];
          for (let i = event.resultIndex || 0; i < results.length; i++) {
            const r = results[i];
            const final = !!r.isFinal;
            const transcript = r[0]?.transcript || '';
            const tokens = transcript ? transcript.split(/\s+/).filter(Boolean).map((t: string) => ({ text: t })) : [];
            const feat: WebSpeechFeature = { kind: 'tokens', tokens, final };
            subs.forEach(fn => { try { fn(feat); } catch {} });
            emitTokensEvent({ tokens, final });
          }
        } catch (e) {}
      };
      rec.onerror = (e: any) => { const msg = String(e?.error || e?.message || 'error'); emitAsrError({ code: 'webspeech', message: msg }); error = msg; };
      rec.onend = () => {
        try {
          const now = performance.now();
          if (!firstRestartAt || (now - firstRestartAt) > 60000) { firstRestartAt = now; restartCount = 1; }
          else restartCount++;
          if (restartCount >= 2) { emitAsrError({ code: 'webspeech_restarts', message: 'Web Speech restarted' }); }
        } catch {}
        // optional: try to restart
        try { rec.start?.(); } catch {}
      };
      rec.start();
      ready = true; started = true;
    } catch (e: any) { error = String(e?.message || e); ready = false; }
  }

  async function stop(): Promise<void> { try { rec?.stop?.(); } catch {} started = false; ready = false; }
  function onFeature(fn: (f: WebSpeechFeature) => void) { subs.add(fn); return () => subs.delete(fn); }
  return { start, stop, onFeature: onFeature as any, status };
}
