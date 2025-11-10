// =============================================================
// File: src/hotkeys/asr-hotkeys.ts
// =============================================================
import { speechStore } from '../state/speech-store';
export function installAsrHotkeys() {
    let armed = false;
    const onKey = (e) => {
        // Alt+L toggles ASR listening; Esc stops
        if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'l' || e.key === 'L')) {
            armed = !armed;
            // If arming ASR and speech sync isn't running, start it (triggers pre-roll/recorders)
            if (armed) {
                try {
                    const body = document.body;
                    const speechOn = !!(body && (body.classList.contains('speech-listening') || body.classList.contains('listening'))) || window.speechOn === true;
                    if (!speechOn)
                        document.getElementById('recBtn')?.click();
                }
                catch { }
            }
            window.dispatchEvent(new CustomEvent('asr:toggle', { detail: { armed } }));
            e.preventDefault();
            e.stopPropagation();
        }
        else if (e.key === 'Escape') {
            armed = false;
            window.dispatchEvent(new CustomEvent('asr:stop'));
        }
    };
    window.addEventListener('keydown', onKey, { passive: false });
    // Sync with external state flips
    speechStore.subscribe(_s => {
        // If a future orchestrator exposes armed/listening flags, mirror here
    });
    return () => window.removeEventListener('keydown', onKey);
}
