const DB_EPS = 1e-12;
const toDb = (x) => 20 * Math.log10(Math.max(x, DB_EPS));
export async function runCalibration(opts) {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            deviceId: { exact: opts.deviceId },
            channelCount: 1,
            sampleRate: opts.flags.sampleRateHz ?? 48000,
            echoCancellation: opts.flags.echoCancellation,
            noiseSuppression: opts.flags.noiseSuppression,
            autoGainControl: opts.flags.autoGainControl,
        }
    });
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx({ sampleRate: opts.flags.sampleRateHz ?? undefined });
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    const buf = new Float32Array(analyser.fftSize);
    src.connect(analyser);
    const measure = async (ms) => {
        const t0 = performance.now();
        const rms = [];
        let peak = -1;
        while (performance.now() - t0 < ms) {
            analyser.getFloatTimeDomainData(buf);
            let sum = 0, p = 0;
            for (let i = 0; i < buf.length; i++) {
                const v = buf[i];
                sum += v * v;
                p = Math.max(p, Math.abs(v));
            }
            rms.push(Math.sqrt(sum / buf.length));
            peak = Math.max(peak, p);
            await new Promise(r => setTimeout(r, 20));
        }
        // median RMS for robustness
        rms.sort((a, b) => a - b);
        const median = rms[Math.floor(rms.length / 2)] || 0;
        return { rmsDbfs: toDb(median), peakDbfs: toDb(peak) };
    };
    // A) Silence 5s
    const silence = await measure(5000);
    // B) Speech 15s
    const speech = await measure(15000);
    const cal = {
        noiseRmsDbfs: silence.rmsDbfs,
        noisePeakDbfs: silence.peakDbfs,
        speechRmsDbfs: speech.rmsDbfs,
        speechPeakDbfs: speech.peakDbfs,
        snrDb: speech.rmsDbfs - silence.rmsDbfs
    };
    // C) Derive thresholds
    const ton = Math.max(cal.noiseRmsDbfs + 10, Math.min(-20, cal.speechRmsDbfs - 4)); // within your guidelines
    const toff = ton - 6;
    const vad = { tonDb: ton, toffDb: toff, attackMs: 80, releaseMs: 300 };
    const profile = {
        id: `${opts.deviceId}::${opts.label}`,
        label: opts.label,
        capture: {
            deviceId: opts.deviceId,
            sampleRateHz: ctx.sampleRate,
            channelCount: 1,
            echoCancellation: opts.flags.echoCancellation,
            noiseSuppression: opts.flags.noiseSuppression,
            autoGainControl: opts.flags.autoGainControl
        },
        cal,
        vad,
        filters: {},
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    // D) Live preview gate: shows stable VAD using derived thresholds
    let stop = false, gate = false, onCounter = 0, offCounter = 0;
    const msPerFrame = 20;
    const preview = async (_stop) => {
        if (_stop) {
            stop = true;
            return;
        }
        stop = false;
        while (!stop) {
            analyser.getFloatTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++)
                sum += buf[i] * buf[i];
            const rmsDb = toDb(Math.sqrt(sum / buf.length));
            const speaking = gate
                ? (rmsDb > profile.vad.toffDb ? (offCounter = 0, true) : ((offCounter += msPerFrame) < profile.vad.releaseMs))
                : (rmsDb > profile.vad.tonDb ? ((onCounter += msPerFrame) >= profile.vad.attackMs) : (onCounter = 0, false));
            gate = speaking;
            try {
                window.dispatchEvent(new CustomEvent('tp:asrPreview', {
                    detail: { rmsDbfs: rmsDb, gate, ton: profile.vad.tonDb, toff: profile.vad.toffDb }
                }));
            }
            catch { }
            await new Promise(r => setTimeout(r, msPerFrame));
        }
    };
    return { profile, preview };
}
