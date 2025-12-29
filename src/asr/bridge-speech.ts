// Bridge from speech events to the TS AsrMode controller (Web Speech).
// Mirrors legacy asr-bridge-speech.js behavior: on speech:start -> start ASR, on speech:stop -> stop ASR.

import { AsrMode } from '../features/asr-mode';

declare global {
  interface Window {
    __asrBridge?: { start: () => void; stop: () => void };
    __tpAuto?: {
      set?: (on: boolean) => void;
      setEnabled?: (on: boolean) => void;
      setMode?: (mode: string) => void;
      setStepPx?: (px: number) => void;
      rebase?: (top?: number) => void;
    };
  }
}

let mode: AsrMode | null = null;
let initPromise: Promise<AsrMode | null> | null = null;
let wired = false;

function disableAuto() {
  try {
    window.__tpAuto?.set?.(false);
    window.dispatchEvent(new CustomEvent('autoscroll:disable', { detail: 'asr' }));
  } catch {}
}

function enableAuto() {
  try {
    window.__tpAuto?.set?.(true);
    window.dispatchEvent(new CustomEvent('autoscroll:enable', { detail: 'asr' }));
  } catch {}
}

async function ensureMode(): Promise<AsrMode | null> {
  if (mode) return mode;
  if (!initPromise) {
    initPromise = Promise.resolve().then(() => {
      try {
        mode = new AsrMode({
          rootSelector: '#scriptRoot, #script, body',
          lineSelector: '.line, p',
          markerOffsetPx: 140,
          windowSize: 6,
        });
        return mode;
      } catch (err) {
        try { console.info('[ASR bridge] failed to init', err); } catch {}
        return null;
      }
    });
  }
  return initPromise;
}

async function startASR() {
  const m = await ensureMode();
  if (!m) return;
  disableAuto();
  try {
    await m.start();
    try { console.log('[ASR bridge] started'); } catch {}
  } catch (e) {
    try { console.warn('[ASR bridge] start failed', e); } catch {}
    enableAuto();
  }
}

async function stopASR() {
  try {
    await mode?.stop?.();
    try { console.log('[ASR bridge] stopped'); } catch {}
  } catch (e) {
    try { console.warn('[ASR bridge] stop failed', e); } catch {}
  } finally {
    enableAuto();
  }
}

function wireEvents() {
  if (wired) return;
  wired = true;
  window.addEventListener('speech', (e: Event) => {
    try {
      const st = (e as CustomEvent)?.detail?.state;
      if (st === 'start') startASR();
      if (st === 'stop') stopASR();
    } catch {}
  });
  window.addEventListener('speech:start', startASR);
  window.addEventListener('speech:stop', stopASR);
}

export function initSpeechBridge() {
  wireEvents();
  window.__asrBridge = { start: startASR, stop: stopASR };
  return window.__asrBridge;
}

export const _internals = { ensureMode };
