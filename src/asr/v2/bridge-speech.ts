import { createOrchestrator } from './orchestrator';
import type { Orchestrator } from './types';

declare global {
  interface Window {
    __tpOrchestrator?: Orchestrator | null;
    __tpAsrV2?: Orchestrator | null;
  }
}

let orchestrator: Orchestrator | null = null;

// Single source of truth: create and expose one orchestrator instance.
export function ensureOrchestrator(): Orchestrator | null {
  if (orchestrator) return orchestrator;
  try {
    orchestrator = createOrchestrator();
    try { (window as any).__tpOrchestrator = orchestrator; } catch {}
    try { (window as any).__tpAsrV2 = orchestrator; } catch {}
  } catch (err) {
    try { console.warn('[ASR v2] orchestrator init failed', err); } catch {}
    orchestrator = null;
  }
  return orchestrator;
}

export function initSpeechBridge(): Orchestrator | null {
  return ensureOrchestrator();
}

export const _internals = { ensureOrchestrator };
