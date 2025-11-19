// Mic adapter: request/release mic, emit tp:db with input level
let stream, ctx, analyser, data, raf;

function stop() {
  try { cancelAnimationFrame(raf); } catch {}
  raf = 0;
  analyser = null; data = null;
  try { if (ctx) { ctx.close && ctx.close(); } } catch {}
  ctx = null;
  try { if (stream) { stream.getTracks && stream.getTracks().forEach((t)=>t.stop && t.stop()); } } catch {}
  stream = null;
  updateChip('unknown');
}

function updateChip(state) {
  try {
    const chip = document.querySelector('.chip:has(#dbMeterTop)') || document.getElementById('micChip');
    if (!chip) return;
    chip.textContent = `Mic: ${state}`;
  } catch {}
}

function hasLiveTracks() {
  try {
    if (!stream || typeof stream.getTracks !== 'function') return false;
    const tracks = stream.getTracks();
    if (!Array.isArray(tracks)) return false;
    return tracks.some((t) => t && t.readyState === 'live');
  } catch {
    return false;
  }
}

export function isOpen() {
  try {
    if (!stream) return false;
    if (hasLiveTracks()) return true;
    return stream.active !== false;
  } catch {
    return !!stream;
  }
}

export async function requestMic() {
  try {
    const S = (typeof window !== 'undefined' && window.__tpStore) ? window.__tpStore : null;
    const preferId = (S && typeof S.get === 'function') ? (S.get('micDevice') || '') : '';
    const constraints = { audio: preferId ? { deviceId: { exact: preferId } } : true, video: false };
    stream = await (navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? navigator.mediaDevices.getUserMedia(constraints) : Promise.reject(new Error('no-media-devices')));
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    data = new Float32Array(analyser.fftSize);
    src.connect(analyser);
    updateChip('ready');

    // Trigger device re-enumeration so labels become visible post-permission
    try { window.dispatchEvent(new CustomEvent('tp:devices-refresh')); } catch {}

    const tick = () => {
      try {
        analyser.getFloatTimeDomainData(data);
        // RMS → dBFS
        let sum = 0; for (let i=0;i<data.length;i++) sum += data[i]*data[i];
        const rms = Math.sqrt(sum / data.length) || 1e-8;
        const db  = 20 * Math.log10(rms); // ~ -60..0
        window.dispatchEvent(new CustomEvent('tp:db', { detail: { db } }));
      } catch {}
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) {
    updateChip('denied'); stop();
    try { console.warn('[mic] denied or failed:', e); } catch {}
  }
}

export function releaseMic() { stop(); }
