import type { InputAdapter, Orchestrator, OrchestratorStatus, PaceMode } from './types';
import { createFeatureSynth } from './featureSynth';
import { createPaceEngine } from './paceEngine';
import { createAutoMotor } from './motor';

export function createOrchestrator(): Orchestrator {
  const synth = createFeatureSynth();
  const engine = createPaceEngine();
  const motor = createAutoMotor();
  let mode: PaceMode = 'assist';
  let started = false;
  let adapter: InputAdapter | null = null;
  let unsub: (() => void) | null = null;
  const errors: string[] = [];

  function setMode(m: PaceMode) { mode = m; engine.setMode(m); }
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
  }

  async function stop(): Promise<void> {
    try { unsub?.(); unsub = null; } catch {}
    try { await adapter?.stop(); } catch {}
    adapter = null;
    started = false;
  }

  return { start, stop, setMode, setGovernor, setSensitivity, setAlignStrategy, getStatus };
}
