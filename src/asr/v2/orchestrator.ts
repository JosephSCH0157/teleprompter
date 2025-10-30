import { createFeatureSynth } from './featureSynth';
import { createAutoMotor } from './motor';
import { createPaceEngine } from './paceEngine';
import type { InputAdapter, Orchestrator, OrchestratorStatus, PaceMode } from './types';

export function createOrchestrator(): Orchestrator {
  const synth = createFeatureSynth();
  const engine = createPaceEngine();
  const motor = createAutoMotor();
  let mode: PaceMode = 'assist';
  let started = false;
  let adapter: InputAdapter | null = null;
  let unsub: (() => void) | null = null;
  let asrErrUnsub: (() => void) | null = null;
  const errors: string[] = [];

  const ModeAliases: Record<string, PaceMode> = { wpm: 'assist', asr: 'assist', vad: 'vad', align: 'align', assist: 'assist' };
  function setMode(m: PaceMode | string) {
    const norm = (ModeAliases as any)[m] || m;
    mode = norm as PaceMode;
    engine.setMode(mode);
  }
  function setGovernor(c: any) { engine.setCaps(c); }
  function setSensitivity(mult: number) { engine.setSensitivity(mult); }
  function setAlignStrategy(_s: any) { /* stub until 1.6.3 */ }

  function getStatus(): OrchestratorStatus {
    const tempo = synth.getTempo();
    return { mode, wpm: tempo.wpm, speaking: synth.getSpeaking(), targetPxs: engine.getTargetPxs(), errors: [...errors] };
  }

  async function start(a: InputAdapter): Promise<void> {
    if (started) return;
    adapter = a;
  let restarts = 0;
    unsub = a.onFeature((f) => {
      try {
        synth.push(f as any);
        const tempo = synth.getTempo();
        const speaking = synth.getSpeaking();
        engine.consume(tempo, speaking);
        const pxs = engine.getTargetPxs();
        // Keep motor engaged; router also gates enablement for Hybrid etc.
        try { motor.setVelocity(pxs); } catch {}
      } catch {}
    });
    await a.start();
    started = true;
    try { motor.setEnabled(true); } catch {}

    // Basic restart backoff on ASR errors (once), then fall back to VAD mode
    try {
      const onErr = () => {
        if (restarts++ === 0) {
          setTimeout(async () => { try { await adapter?.start(); if ((window as any).toast) (window as any).toast('ASR restarted'); } catch {} }, 300);
        } else {
          setMode('vad');
          try { if ((window as any).toast) (window as any).toast('ASR unstable → VAD fallback'); } catch {}
        }
      };
      const h = onErr as EventListener;
      window.addEventListener('tp:asr:error' as any, h);
      asrErrUnsub = () => { try { window.removeEventListener('tp:asr:error' as any, h); } catch {} };
    } catch {}
  }

  async function stop(): Promise<void> {
    try { unsub?.(); unsub = null; } catch {}
    try { await adapter?.stop(); } catch {}
    try { asrErrUnsub?.(); asrErrUnsub = null; } catch {}
    adapter = null;
    started = false;
  }

  return { start, stop, setMode, setGovernor, setSensitivity, setAlignStrategy, getStatus };
}
