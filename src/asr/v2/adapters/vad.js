// src/asr/v2/adapters/vad.js
// Minimal VAD adapter: consume tp:db events and derive speaking boolean
export function createVadAdapter(thresholdDb = -42) {
  let speaking = false;
  let attackMs = 80, releaseMs = 300;
  let timer = 0;
  const listeners = new Set();
  const emit = (on) => { listeners.forEach(fn => { try { fn(on); } catch {} }); };
  const onDb = (e) => {
    try {
      const db = (e && e.detail && typeof e.detail.db === 'number') ? e.detail.db : -60;
      clearTimeout(timer);
      if (db >= thresholdDb) {
        timer = setTimeout(() => { if (!speaking) { speaking = true; emit(true); } }, attackMs);
      } else {
        timer = setTimeout(() => { if (speaking) { speaking = false; emit(false); } }, releaseMs);
      }
    } catch {}
  };
  const start = () => { try { window.addEventListener('tp:db', onDb); } catch {} };
  const stop  = () => { try { window.removeEventListener('tp:db', onDb); } catch {}; clearTimeout(timer); };
  return {
    onSpeaking(fn) { if (fn) listeners.add(fn); return () => listeners.delete(fn); },
    start, stop
  };
}
