import type { InputAdapter, AdapterStatus, VadFeature } from '../types';

export function createVadEventAdapter(): InputAdapter {
  let ready = false;
  let error: string | undefined;
  const subs = new Set<(f: VadFeature) => void>();
  let unsub: (() => void) | null = null;

  function status(): AdapterStatus { return { kind: 'vad', ready, error }; }

  async function start(): Promise<void> {
    try {
      if (unsub) return;
      const onEv = (e: any) => {
        try {
          const d = e?.detail || {};
          const f: VadFeature = { kind: 'gate', speaking: !!d.speaking, rmsDbfs: Number(d.rmsDbfs) || -60 };
          subs.forEach(fn => { try { fn(f); } catch {} });
        } catch {}
      };
      const h = onEv as EventListener;
      window.addEventListener('tp:vad' as any, h as any);
      unsub = () => { try { window.removeEventListener('tp:vad' as any, h as any); } catch {} };
      ready = true;
    } catch (e: any) {
      error = String(e?.message || e);
      ready = false;
    }
  }

  async function stop(): Promise<void> {
    try { unsub?.(); unsub = null; } catch {}
    ready = false;
  }

  function onFeature(fn: (f: VadFeature) => void) { subs.add(fn); return () => subs.delete(fn); }

  return { start, stop, onFeature: onFeature as any, status };
}
