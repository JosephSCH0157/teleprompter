// =============================================================
// File: src/index-hooks/asr.ts
// =============================================================
import { AsrMode } from '../features/asr-mode';
import { installAsrHotkeys } from '../hotkeys/asr-hotkeys';
import { mountAsrSettings } from '../ui/settings-asr';
import { AsrTopbar } from '../ui/topbar-asr';
export { AsrMode } from '../features/asr-mode';
export function initAsrFeature() {
    // Wire UI settings
    mountAsrSettings('#settingsSpeech, #settings, body');
    installAsrHotkeys();
    // Create coordinator and topbar UI
    let asrMode = null;
    let speechActive = false;
    let asrActive = false;
    let autoHeld = false;
    const wantASR = () => {
        try {
            return (document.getElementById('scrollMode')?.value || '').toLowerCase() === 'asr';
        }
        catch {
            return false;
        }
    };
    const holdAuto = () => {
        if (autoHeld)
            return;
        autoHeld = true;
        try {
            window.__tpAuto?.set?.(false);
            window.dispatchEvent(new CustomEvent('autoscroll:disable', { detail: 'asr' }));
        }
        catch { }
    };
    const releaseAuto = () => {
        if (!autoHeld)
            return;
        autoHeld = false;
        try {
            window.__tpAuto?.set?.(true);
            window.dispatchEvent(new CustomEvent('autoscroll:enable', { detail: 'asr' }));
        }
        catch { }
    };
    const ensureMode = async () => {
        if (!asrMode) {
            asrMode = new AsrMode({ rootSelector: '#scriptRoot, #script, body', lineSelector: '.line, p', markerOffsetPx: 140, windowSize: 6 });
            // Expose globally for UI mode router
            window.__tpAsrMode = asrMode;
            try {
                new AsrTopbar(asrMode).mount('#topbarRight, .topbar, header, body');
            }
            catch { }
        }
        return asrMode;
    };
    const start = async () => {
        if (asrActive)
            return;
        const m = await ensureMode();
        try {
            holdAuto();
            await m.start();
            asrActive = true;
        }
        catch (err) {
            asrActive = false;
            releaseAuto();
            try {
                console.warn('[ASR] start failed, staying on non-ASR sync', err);
            }
            catch { }
        }
    };
    const stop = async () => {
        if (!asrActive)
            return;
        try {
            await asrMode?.stop?.();
        }
        finally {
            asrActive = false;
            releaseAuto();
        }
    };
    // Speech Sync lifecycle → drive ASR (support both boolean and string states)
    window.addEventListener('tp:speech-state', (ev) => {
        try {
            const d = ev?.detail || {};
            const on = (d.running === true) || (typeof d.state === 'string' && (d.state === 'active' || d.state === 'running'));
            speechActive = !!on;
            if (speechActive && wantASR())
                void start();
            else
                void stop();
        }
        catch { }
    });
    // Mode selector changes while running
    document.addEventListener('change', (ev) => {
        try {
            if (ev?.target?.id !== 'scrollMode')
                return;
            if (!speechActive)
                return;
            wantASR() ? void start() : void stop();
        }
        catch { }
    });
    // Hotkey override (optional)
    window.addEventListener('asr:toggle', (e) => { const armed = !!e?.detail?.armed; armed ? void start() : void stop(); });
    window.addEventListener('asr:stop', () => { void stop(); });
    // Initial reconcile for late loads
    try {
        const body = document.body;
        speechActive = !!(body && (body.classList.contains('speech-listening') || body.classList.contains('listening'))) || window.speechOn === true;
        if (speechActive && wantASR())
            void start();
    }
    catch { }
}
