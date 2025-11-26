// ASR JIT prompts: weak SNR and WebSpeech instability
import { getAsrState } from '../store';

function openAsrSettings() {
  try {
    (window as any).__tpSettings?.open?.();
    const body = document.getElementById('settingsBody');
    const overlay = document.getElementById('settingsOverlay');
    // 'body' is unused here; overlay is used for visibility toggle
    // Removing unused 'body' to satisfy lint
    void body;
    if (overlay) overlay.classList.remove('hidden');
    // Show Media tab
    const tabsRoot = document.getElementById('settingsTabs') || document;
    (tabsRoot?.querySelectorAll('[data-tab-content]') || []).forEach((c) => ((c as HTMLElement).style.display = 'none'));
    const media = document.querySelector('[data-tab-content="media"]') as HTMLElement | null;
    if (media) media.style.display = '';
    setTimeout(() => {
      const sec = document.getElementById('asrSettings');
      if (sec) { try { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { sec.scrollIntoView(); } }
    }, 40);
  } catch {}
}

// Weak input SNR (< ~15 dB for ~5s)
(function weakSnrWatcher(){
  try {
    const THRESH = 15;
    const NEED_MS = 5000;
    let belowStart: number | null = null;
    let shown = false;
    window.addEventListener('tp:vad' as any, (e: any) => {
      try {
        const rmsDbfs = Number(e?.detail?.rmsDbfs) || -60;
        const s = getAsrState();
        const prof = s.activeProfileId ? s.profiles[s.activeProfileId] : undefined;
        const noise = prof?.cal?.noiseRmsDbfs ?? -60;
        const snr = rmsDbfs - noise;
        const now = performance.now();
        if (snr < THRESH) {
          if (belowStart == null) belowStart = now;
          else if (!shown && now - belowStart >= NEED_MS) {
            shown = true;
            (window as any).toast?.('Input is noisy — calibrate?', { type: 'warn', actionLabel: 'Open', action: openAsrSettings });
          }
        } else {
          belowStart = null;
        }
      } catch {}
    });
  } catch {}
})();

// WebSpeech instability: listen for tp:asr:error with code 'webspeech' or 'webspeech_restarts'
(function webspeechInstabilityWatcher(){
  try {
    let firstTs: number | null = null;
    let count = 0;
    const WINDOW_MS = 60_000;
    window.addEventListener('tp:asr:error' as any, (e: any) => {
      try {
        const code = String(e?.detail?.code || '');
        if (!code.startsWith('webspeech')) return;
        const now = performance.now();
        if (firstTs == null || now - firstTs > WINDOW_MS) { firstTs = now; count = 1; return; }
        count++;
        if (count >= 2) {
          (window as any).toast?.('Recognition unstable — calibrate or use VAD mode', { type: 'warn', actionLabel: 'Open', action: openAsrSettings });
          // reset window after prompt
          firstTs = null; count = 0;
        }
      } catch {}
    });
  } catch {}
})();
