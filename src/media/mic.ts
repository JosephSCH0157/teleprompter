// Mic + dB meter helpers extracted from monolith. Exposes window.__tpMic
export interface MicAPI {
  requestMic(): Promise<MediaStream>;
  releaseMic(): void;
  populateDevices(): Promise<void> | void;
  startDbMeter(stream: MediaStream): void;
  clearBars?(el?: HTMLElement | null): void;
  isOpen(): boolean;
  __lastStream?: MediaStream | null;
}

declare global {
  interface Window {
    camDeviceSel?: HTMLSelectElement;
    webkitAudioContext?: typeof AudioContext;
  }
}

const DEVICE_KEY = 'tp_mic_device_v1';
let audioStream: MediaStream | null = null;
let analyser: AnalyserNode | null = null;
let audioCtx: AudioContext | null = null;
let dbAnim: number | null = null;

function buildDbBars(target: HTMLElement | null): HTMLElement[] {
  if (!target) return [];
  target.innerHTML = '';
  const ticks = document.createElement('div');
  ticks.className = 'db-ticks';
  target.appendChild(ticks);
  for (let i = 0; i < 12; i++) {
    const b = document.createElement('div');
    b.className = 'bar';
    b.style.display = 'inline-block';
    b.style.width = `${100 / 12}%`;
    b.style.height = '8px';
    b.style.marginRight = '2px';
    b.style.background = 'rgba(255,255,255,0.06)';
    b.style.borderRadius = '2px';
    target.appendChild(b);
  }
  return Array.from(target.querySelectorAll('.bar'));
}

function clearBars(el?: HTMLElement | null): void {
  if (!el) return;
  el.querySelectorAll('.bar.on').forEach((b) => b.classList.remove('on'));
}

function stopDbMeter(): void {
  if (dbAnim) cancelAnimationFrame(dbAnim);
  dbAnim = null;
  try {
    audioStream?.getTracks().forEach((t) => t.stop());
  } catch {
    // ignore
  }
  try {
    if (audioCtx && typeof audioCtx.close === 'function') audioCtx.close().catch(() => {});
  } catch {
    // ignore
  }
  audioStream = null;
  analyser = null;
  audioCtx = null;
}

function startDbMeter(stream: MediaStream): void {
  try {
    const AC = (window.AudioContext || window.webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    const ctx = new AC();
    audioCtx = ctx as AudioContext;
    try {
      if (typeof ctx.resume === 'function' && (ctx as AudioContext).state === 'suspended') (ctx as AudioContext).resume().catch(() => {});
    } catch {
      // ignore
    }
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const hostTop = document.getElementById('dbMeterTop');
    const unifiedFill = hostTop?.querySelector?.('i');
    const topBars = !unifiedFill ? buildDbBars(hostTop) : [];
    let levelSmooth = 0;
    const dBFloor = -60;
    const attack = 0.55;
    const release = 0.15;
    let peakHold = { value: dBFloor, lastUpdate: performance.now(), decay: 0.9 };
    const draw = (): void => {
      if (!analyser || !data) {
        dbAnim = null;
        return;
      }
      analyser.getByteFrequencyData(data);
      const rms = Math.sqrt(data.reduce((a, b) => a + b * b, 0) / data.length) / 255;
      const dbfs = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
      const dB = dbfs === -Infinity ? dBFloor : Math.max(dBFloor, Math.min(0, dbfs));
      let level = (dB - dBFloor) / (0 - dBFloor);
      if (!isFinite(level) || level < 0) level = 0;
      else if (level > 1) level = 1;
      if (level > levelSmooth) levelSmooth = levelSmooth + (level - levelSmooth) * attack;
      else levelSmooth = levelSmooth + (level - levelSmooth) * release;
      if (topBars && topBars.length) {
        const bars = Math.max(0, Math.min(topBars.length, Math.round(levelSmooth * topBars.length)));
        for (let i = 0; i < topBars.length; i++) topBars[i].classList.toggle('on', i < bars);
      }
      try {
        const now = performance.now();
        peakHold.value = Math.max(dB, peakHold.value * peakHold.decay + dB * (1 - peakHold.decay));
        peakHold.lastUpdate = now;
      } catch {
        // ignore
      }
      try {
        window.dispatchEvent(new CustomEvent('tp:db', { detail: { db: dB, peak: peakHold.value } }));
      } catch {
        // ignore
      }
      dbAnim = requestAnimationFrame(draw);
    };
    draw();
  } catch (e) {
    console.warn('startDbMeter failed', e);
  }
}

async function requestMic(): Promise<MediaStream> {
  try {
    const sel = document.getElementById('settingsMicSel') as HTMLSelectElement | null;
    const chosenId = sel?.value || undefined;
    const constraints: MediaStreamConstraints = { audio: { deviceId: chosenId ? { exact: chosenId } : undefined } };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    audioStream = stream;
    mic.__lastStream = stream;
    try {
      const permChip = document.getElementById('permChip');
      if (permChip) permChip.textContent = 'Mic: allowed';
    } catch {
      // ignore
    }
    startDbMeter(stream);
    try {
      if (chosenId) localStorage.setItem(DEVICE_KEY, chosenId);
    } catch {
      // ignore
    }
    return stream;
  } catch (err) {
    console.warn('requestMic failed', err);
    try {
      const permChip = document.getElementById('permChip');
      if (permChip) permChip.textContent = 'Mic: denied';
    } catch {
      // ignore
    }
    throw err;
  }
}

function releaseMic(): void {
  try {
    audioStream?.getTracks().forEach((t) => t.stop());
  } catch {
    // ignore
  }
  audioStream = null;
  mic.__lastStream = null;
  try {
    const permChip = document.getElementById('permChip');
    if (permChip) permChip.textContent = 'Mic: released';
  } catch {
    // ignore
  }
  stopDbMeter();
}

function isOpen(): boolean {
  try {
    if (!audioStream) return false;
    if (typeof audioStream.getTracks === 'function') {
      const tracks = audioStream.getTracks();
      if (Array.isArray(tracks) && tracks.length) {
        return tracks.some((track) => track && track.readyState === 'live');
      }
    }
    return audioStream.active !== false;
  } catch {
    return !!audioStream;
  }
}

async function populateDevices(): Promise<void> {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    const devs = await navigator.mediaDevices.enumerateDevices();
    const mics = devs.filter((d) => d.kind === 'audioinput');
    const cams = devs.filter((d) => d.kind === 'videoinput');

    const fill = (sel: HTMLSelectElement | null | undefined, list: MediaDeviceInfo[]): void => {
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = '';
      for (const d of list) {
        const o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || (d.kind === 'audioinput' ? 'Microphone' : 'Camera');
        sel.appendChild(o);
      }
      try {
        if (prev && Array.from(sel.options).some((o) => o.value === prev)) sel.value = prev;
      } catch {
        // ignore
      }
    };

    fill(document.getElementById('settingsMicSel') as HTMLSelectElement | null, mics);
    fill(document.getElementById('micDeviceSel') as HTMLSelectElement | null, mics);
    fill(document.getElementById('settingsCamSel') as HTMLSelectElement | null, cams);
    try {
      if (window.camDeviceSel) fill(window.camDeviceSel, cams);
    } catch {
      // ignore
    }
  } catch (e) {
    console.warn('populateDevices failed', e);
  }
}

const mic: MicAPI = {
  requestMic,
  releaseMic,
  populateDevices,
  startDbMeter,
  clearBars,
  isOpen,
  __lastStream: null,
};

if (typeof window !== 'undefined') {
  const target = (window as any).__tpMic || {};
  Object.assign(target, mic);
  (window as any).__tpMic = target;
}

try {
  const delayedPopulate = (): void => {
    setTimeout(() => {
      try {
        void populateDevices();
      } catch {
        // ignore
      }
    }, 120);
  };
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', delayedPopulate, { once: true });
  } else {
    delayedPopulate();
  }
} catch {
  // ignore
}

export default mic;
