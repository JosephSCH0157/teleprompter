// =============================================================
// File: src/index-hooks/asr.ts
// =============================================================
import { AsrMode } from '../features/asr-mode';
import { installAsrHotkeys } from '../hotkeys/asr-hotkeys';
import { ensureAsrSettingsWired } from '../ui/settings-asr';
import { AsrTopbar } from '../ui/topbar-asr';
import { appStore } from '../state/app-store';
export { AsrMode } from '../features/asr-mode';

export function initAsrFeature() {
  // Wire UI settings
  ensureAsrSettingsWired(document.getElementById('settingsBody') || document);
  installAsrHotkeys();

  // Create coordinator and topbar UI
  let asrMode: AsrMode | null = null;
  let speechActive = false;
  let asrActive = false;
  let autoHeld = false;

  const getScrollMode = (): string => {
    try {
      const s = (window as any).__tpStore || appStore;
      const v = s?.get?.('scrollMode');
      if (typeof v === 'string') return v.toLowerCase();
    } catch {}
    return '';
  };
  const wantASR = (): boolean => getScrollMode() === 'asr';
  const holdAuto = () => {
    if (autoHeld) return;
    autoHeld = true;
    try {
      (window as any).__tpAuto?.set?.(false);
      window.dispatchEvent(new CustomEvent('autoscroll:disable', { detail: 'asr' }));
    } catch {}
  };
  const releaseAuto = () => {
    if (!autoHeld) return;
    autoHeld = false;
    try {
      (window as any).__tpAuto?.set?.(true);
      window.dispatchEvent(new CustomEvent('autoscroll:enable', { detail: 'asr' }));
    } catch {}
  };
  const ensureMode = async (): Promise<AsrMode> => {
    if (!asrMode) {
      asrMode = new AsrMode({ rootSelector: '#scriptRoot, #script, body', lineSelector: '.line, p', markerOffsetPx: 140, windowSize: 6 });
      // Expose globally for UI mode router
      (window as any).__tpAsrMode = asrMode;
      try { new AsrTopbar(asrMode).mount('#topbarRight, .topbar, header, body'); } catch {}
    }
    return asrMode;
  };
  const isSettingsHydrating = (): boolean => {
    try { return !!(window as any).__tpSettingsHydrating; } catch { return false; }
  };
  const start = async () => {
    if (asrActive) return;
    if (isSettingsHydrating()) {
      try { console.debug('[ASR] start blocked during settings hydration'); } catch {}
      return;
    }
    const m = await ensureMode();
    try { holdAuto(); await m.start(); asrActive = true; }
    catch (err) { asrActive = false; releaseAuto(); try { console.warn('[ASR] start failed, staying on non-ASR sync', err); } catch {} }
  };
  const stop = async () => {
    if (!asrActive) return;
    try { await asrMode?.stop?.(); }
    finally { asrActive = false; releaseAuto(); }
  };

  // Speech Sync lifecycle → drive ASR (support both boolean and string states)
  window.addEventListener('tp:speech-state', (ev: any) => {
    try {
      const d = ev?.detail || {};
      const on = (d.running === true) || (typeof d.state === 'string' && (d.state === 'active' || d.state === 'running'));
      speechActive = !!on;
      if (speechActive && wantASR()) void start(); else void stop();
    } catch {}
  });
  // Mode changes via store/router
  try {
    const store = (window as any).__tpStore || appStore;
    store?.subscribe?.('scrollMode', (_mode: string) => {
      if (!speechActive) return;
      wantASR() ? void start() : void stop();
    });
  } catch {}

  // Hotkey override (optional)
  window.addEventListener('asr:toggle', (e: any) => { const armed = !!e?.detail?.armed; armed ? void start() : void stop(); });
  window.addEventListener('asr:stop', () => { void stop(); });

  // Initial reconcile for late loads
  try {
    const body = document.body as HTMLElement | null;
    speechActive = !!(body && (body.classList.contains('speech-listening') || body.classList.contains('listening'))) || (window as any).speechOn === true;
    if (speechActive && wantASR()) void start();
  } catch {}
}
