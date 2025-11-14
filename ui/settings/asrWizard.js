import { runCalibration } from '../../asr/calibration';
import { getAsrState, setActiveProfile, upsertProfile } from '../../asr/store';
let current = null;
function $(id) { return document.getElementById(id); }
function toast(msg) {
    try {
        window.tpToast?.ok?.(msg);
    }
    catch { }
    try {
        window.tpToast?.show?.(msg);
    }
    catch { }
    try {
        console.log('[ASR]', msg);
    }
    catch { }
}
// Populate microphone select and grant labels helpers
async function populateMicSelect() {
    try {
        const sel = $('asrDevice');
        if (!sel || !navigator.mediaDevices?.enumerateDevices)
            return;
        const devs = await navigator.mediaDevices.enumerateDevices();
        const mics = devs.filter(d => d.kind === 'audioinput');
        sel.innerHTML = '';
        mics.forEach((d, i) => {
            const o = document.createElement('option');
            o.value = d.deviceId || '';
            o.textContent = d.label || `Microphone ${i + 1}`;
            sel.appendChild(o);
        });
        // Preselect active profile's device if present
        try {
            const s = getAsrState();
            const devId = s.activeProfileId ? s.profiles[s.activeProfileId]?.capture.deviceId : undefined;
            if (devId)
                sel.value = devId;
        }
        catch { }
    }
    catch { }
}
async function grantMicLabels() {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        toast('Mic access granted — device names unlocked.');
    }
    catch {
        toast('Mic access denied. You can still calibrate with generic names.');
    }
    await populateMicSelect();
}
function mapDbToPct(db) {
    const clamped = Math.max(-80, Math.min(0, db));
    return ((clamped + 80) / 80) * 100; // -80..0 → 0..100
}
function setMeterMarker(db, ton, toff, gate) {
    const meter = $('asrMeter');
    if (!meter)
        return;
    const pct = mapDbToPct(db);
    meter.style.setProperty('--asr-level', pct.toFixed(1) + '%');
    meter.dataset.gate = gate ? '1' : '0';
    if (typeof ton === 'number')
        meter.style.setProperty('--asr-ton', mapDbToPct(ton).toFixed(1) + '%');
    if (typeof toff === 'number')
        meter.style.setProperty('--asr-toff', mapDbToPct(toff).toFixed(1) + '%');
}
export function updateMeter(rmsDbfs, ton, toff, gate) {
    setMeterMarker(rmsDbfs, ton, toff, gate);
    const noiseEl = $('asrNoise');
    const speechEl = $('asrSpeech');
    const snrEl = $('asrSnr');
    // These get set when we have a profile (derived values)
    try {
        if (snrEl && typeof snrEl.textContent === 'string' && typeof ton === 'number' && typeof toff === 'number') {
            const p = current?.profile;
            if (p) {
                noiseEl.textContent = `${p.cal.noiseRmsDbfs.toFixed(1)} dBFS`;
                speechEl.textContent = `${p.cal.speechRmsDbfs.toFixed(1)} dBFS`;
                snrEl.textContent = `${p.cal.snrDb.toFixed(1)} dB`;
            }
        }
    }
    catch { }
}
export function renderDerived(profile) {
    try {
        const noiseEl = $('asrNoise');
        const speechEl = $('asrSpeech');
        const snrEl = $('asrSnr');
        if (noiseEl)
            noiseEl.textContent = `${profile.cal.noiseRmsDbfs.toFixed(1)} dBFS`;
        if (speechEl)
            speechEl.textContent = `${profile.cal.speechRmsDbfs.toFixed(1)} dBFS`;
        if (snrEl)
            snrEl.textContent = `${profile.cal.snrDb.toFixed(1)} dB`;
        // Bad SNR warning
        if (profile.cal.snrDb < 15)
            toast('Increase mic gain or move closer. (SNR < 15 dB)');
    }
    catch { }
}
export async function startAsrWizard() {
    try {
        const deviceId = $('asrDevice')?.value || '';
        const label = $('asrLabel')?.value || 'Desk • default';
        const flags = {
            echoCancellation: !!$('asrAEC')?.checked,
            noiseSuppression: !!$('asrNS')?.checked,
            autoGainControl: !!$('asrAGC')?.checked,
        };
        current = await runCalibration({ deviceId, label, flags });
        renderDerived(current.profile);
    }
    catch (e) {
        console.warn('[ASR] startAsrWizard failed', e);
    }
}
function wire() {
    try {
        const startBtn = $('asrStartBtn');
        startBtn?.addEventListener('click', () => startAsrWizard());
        $('asrPreviewBtn')?.addEventListener('click', () => current?.preview());
        $('asrPreviewStop')?.addEventListener('click', () => current?.preview(true));
        $('asrSaveBtn')?.addEventListener('click', () => {
            try {
                if (!current)
                    return;
                upsertProfile(current.profile);
                setActiveProfile(current.profile.id);
                toast('ASR profile saved and activated.');
            }
            catch { }
        });
        // NS/AGC timing badge
        const updateFlagsBadge = () => {
            try {
                const badge = $('asrFlagsBadge');
                if (!badge)
                    return;
                const ns = !!$('asrNS')?.checked;
                const ag = !!$('asrAGC')?.checked;
                if (ns || ag) {
                    badge.style.display = 'inline-block';
                    const parts = [ns && 'NS', ag && 'AGC'].filter(Boolean).join(' + ');
                    badge.textContent = `Timing may vary: ${parts}`;
                }
                else {
                    badge.style.display = 'none';
                }
            }
            catch { }
        };
        ['asrNS', 'asrAGC'].forEach(id => {
            try {
                $(id)?.addEventListener('change', updateFlagsBadge);
            }
            catch { }
        });
        updateFlagsBadge();
        // Device list helpers if present
        $('asrRefreshDevs')?.addEventListener('click', () => { populateMicSelect(); });
        $('asrGrantPerm')?.addEventListener('click', () => { grantMicLabels(); });
    }
    catch { }
}
// Live meter update (event from calibration preview)
try {
    window.addEventListener('tp:asrPreview', (e) => {
        try {
            const { rmsDbfs, gate, ton, toff } = e.detail || {};
            updateMeter(rmsDbfs, ton, toff, gate);
        }
        catch { }
    });
}
catch { }
try {
    window.startAsrWizard = startAsrWizard;
}
catch { }
try {
    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', wire, { once: true });
    else
        wire();
}
catch { }
// Exported init for Settings mount flow
export async function initAsrSettingsUI() {
    try {
        await populateMicSelect();
        // Sensible defaults for flags (unchecked by default)
        try {
            $('asrAEC')?.removeAttribute('checked');
        }
        catch { }
        try {
            $('asrNS')?.removeAttribute('checked');
        }
        catch { }
        try {
            $('asrAGC')?.removeAttribute('checked');
        }
        catch { }
    }
    catch { }
}
