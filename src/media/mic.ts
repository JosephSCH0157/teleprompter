// Mic + dB meter helpers (TypeScript)
const DEVICE_KEY = 'tp_mic_device_v1';
let audioStream: MediaStream | null = null;
let analyser: AnalyserNode | null = null;
let audioCtx: (AudioContext | null) = null;
let dbAnim: number | null = null;

function buildDbBars(target: HTMLElement | null) {
  if (!target) return [] as HTMLElement[];
  target.innerHTML = '';
  const ticks = document.createElement('div');
  ticks.className = 'db-ticks';
  target.appendChild(ticks);
  for (let i = 0; i < 12; i++) {
    const b = document.createElement('div');
    b.className = 'bar';
    b.style.display = 'inline-block';
    b.style.width = (100 / 12) + '%';
    b.style.height = '8px';
    b.style.marginRight = '2px';
    b.style.background = 'rgba(255,255,255,0.06)';
    b.style.borderRadius = '2px';
    target.appendChild(b);
  }
  return Array.from(target.querySelectorAll('.bar')) as HTMLElement[];
}

function clearBars(el: HTMLElement | null) {
  if (!el) return;
  el.querySelectorAll('.bar.on').forEach((b) => b.classList.remove('on'));
}

function _stopDbMeter() {
  if (dbAnim) cancelAnimationFrame(dbAnim);
  dbAnim = null;
  try { if (audioStream) audioStream.getTracks().forEach(t => t.stop()); } catch {}
  try { if (audioCtx && typeof (audioCtx.close) === 'function') audioCtx.close().catch(() => {}); } catch {}
  audioStream = null; audioCtx = null; analyser = null;
}

function startDbMeter(stream: MediaStream) {
  try {
    const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC() as AudioContext;
    audioCtx = ctx;
    try { if (typeof ctx.resume === 'function' && (ctx as any).state === 'suspended') ctx.resume().catch(() => {}); } catch {}
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    analyser = an;
    analyser.fftSize = 2048;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const topBars = buildDbBars(document.getElementById('dbMeterTop'));
  let levelSmooth = 0; const dBFloor = -60; const attack = 0.55; const release = 0.15; let _peakHold = { value: 0, lastUpdate: performance.now(), decay: 0.9 };
    function draw() {
      if (!analyser || !data) { dbAnim = null; return; }
      analyser.getByteFrequencyData(data);
      const rms = Math.sqrt(data.reduce((a, b) => a + b * b, 0) / data.length) / 255;
      const dbfs = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
      const dB = dbfs === -Infinity ? dBFloor : Math.max(dBFloor, Math.min(0, dbfs));
      let level = (dB - dBFloor) / (0 - dBFloor);
      if (!isFinite(level) || level < 0) level = 0; else if (level > 1) level = 1;
      if (level > levelSmooth) levelSmooth = levelSmooth + (level - levelSmooth) * attack; else levelSmooth = levelSmooth + (level - levelSmooth) * release;
      const bars = Math.max(0, Math.min(topBars.length, Math.round(levelSmooth * topBars.length)));
      for (let i = 0; i < topBars.length; i++) topBars[i].classList.toggle('on', i < bars);
      try { if (!(window as any).__tp_has_script || !(window as any).__tp_wd_armed) return; } catch {}
      dbAnim = requestAnimationFrame(draw);
    }
    draw();
  } catch (e) {
    console.warn('startDbMeter failed', e);
  }
}

async function requestMic(): Promise<MediaStream> {
  try {
    const chosenEl = document.getElementById('settingsMicSel') as HTMLSelectElement | null;
    const chosenId = chosenEl ? (chosenEl.value || undefined) : undefined;
    const constraints: MediaStreamConstraints = { audio: { deviceId: chosenId ? { exact: chosenId } as any : undefined } };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
    audioStream = stream;
  try { window.dispatchEvent(new CustomEvent('tp:mic:stream', { detail: { stream } })); } catch {}
    try { const permChip = document.getElementById('permChip'); if (permChip) permChip.textContent = 'Mic: allowed'; } catch {}
  startDbMeter(stream);
  try { (window as any).__tpMic = (window as any).__tpMic || {}; (window as any).__tpMic.__lastStream = stream; } catch {}
    try { if (chosenId) localStorage.setItem(DEVICE_KEY, chosenId); } catch {}
    return stream;
  } catch (err) {
    console.warn('requestMic failed', err);
    try { const permChip = document.getElementById('permChip'); if (permChip) permChip.textContent = 'Mic: denied'; } catch {}
    throw err;
  }
}

function releaseMic() {
  try { if (audioStream) audioStream.getTracks().forEach(t => t.stop()); } catch {}
  audioStream = null; try { const permChip = document.getElementById('permChip'); if (permChip) permChip.textContent = 'Mic: released'; } catch {}
  try { if ((window as any).__tpMic) (window as any).__tpMic.__lastStream = undefined; } catch {}
  _stopDbMeter();
}

async function populateDevices() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    const devs = await navigator.mediaDevices.enumerateDevices();
    const mics = devs.filter((d) => d.kind === 'audioinput');
    const cams = devs.filter((d) => d.kind === 'videoinput');

    const fill = (sel: HTMLSelectElement | null, list: MediaDeviceInfo[]) => {
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = '';
      for (const d of list) {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || (d.kind === 'audioinput' ? 'Microphone' : 'Camera');
        sel.appendChild(opt);
      }
      try { if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev; } catch {}
    };

    // prefer new settings IDs but also update legacy hidden select
    fill(document.getElementById('settingsMicSel') as HTMLSelectElement | null, mics);
    fill(document.getElementById('micDeviceSel')   as HTMLSelectElement | null, mics); // legacy (hidden)
    fill(document.getElementById('settingsCamSel') as HTMLSelectElement | null, cams);
    // legacy camera select is camDeviceSel on window (some code exposes it)
    try {
      const camLegacy = (window as any).camDeviceSel as HTMLSelectElement | undefined;
      if (camLegacy) fill(camLegacy, cams);
    } catch {}
  } catch (e) {
    console.warn('populateDevices failed', e);
  }
}

// Expose typed API on window
try {
  (window as any).__tpMic = (window as any).__tpMic || {};
  (window as any).__tpMic.requestMic = requestMic;
  (window as any).__tpMic.releaseMic = releaseMic;
  (window as any).__tpMic.populateDevices = populateDevices;
  (window as any).__tpMic.startDbMeter = startDbMeter;
  (window as any).__tpMic.clearBars = clearBars;
} catch {}

// Attempt a safe populate once on boot (when DOM is ready)
try {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => { setTimeout(() => { try { populateDevices(); } catch {} }, 120); });
  } else {
    setTimeout(() => { try { populateDevices(); } catch {} }, 120);
  }
} catch {}

export { clearBars, populateDevices, releaseMic, requestMic, startDbMeter };

