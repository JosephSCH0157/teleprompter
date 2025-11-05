// =============================================================
// File: src/hotkeys/asr-hotkeys.ts
// =============================================================
import { speechStore } from '../state/speech-store';

export function installAsrHotkeys() {
  let armed = false;
  const onKey = (e: KeyboardEvent) => {
    // Alt+L toggles ASR listening; Esc stops
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'l' || e.key === 'L')) {
      armed = !armed;
      window.dispatchEvent(new CustomEvent('asr:toggle', { detail: { armed } }));
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Escape') {
      armed = false;
      window.dispatchEvent(new CustomEvent('asr:stop'));
    }
  };
  window.addEventListener('keydown', onKey, { passive: false });

  // Sync with external state flips
  speechStore.subscribe(s => {
    // If a future orchestrator exposes armed/listening flags, mirror here
  });

  return () => window.removeEventListener('keydown', onKey);
}
