import { getAsrState } from './store';

export function startVadAdapter(stream: MediaStream, onGate: (speaking: boolean, rmsDbfs: number) => void) {
  const AudioCtx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new AudioCtx();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const { activeProfileId, profiles } = getAsrState();
  const prof = activeProfileId ? profiles[activeProfileId] : undefined;
  if (!prof) return () => {};

  let gate = false, onCounter = 0, offCounter = 0;
  const ms = 20;
  const loop = async () => {
    try {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0; for (let i=0;i<buf.length;i++) sum += buf[i]*buf[i];
      const rms = Math.sqrt(sum/buf.length);
      const rmsDb = 20*Math.log10(Math.max(rms, 1e-12));
      const speaking = gate
        ? (rmsDb > prof.vad.toffDb ? (offCounter=0, true) : ((offCounter+=ms) < prof.vad.releaseMs))
        : (rmsDb > prof.vad.tonDb  ? ((onCounter+=ms) >= prof.vad.attackMs) : (onCounter=0, false));
      gate = speaking as boolean;
      try { onGate(gate, rmsDb); } catch {}
  await new Promise(r => setTimeout(r, ms));
  // Continue loop while context is not closed: check state where supported
  const stateOk = (ctx as any).state ? ((ctx as any).state !== 'closed') : true;
  if (stateOk) requestAnimationFrame(loop);
    } catch {}
  };
  loop();
  return () => { try { ctx.close(); } catch {} };
}
