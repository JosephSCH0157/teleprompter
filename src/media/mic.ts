// Mic + dB meter helpers extracted from monolith. Exposes window.__tpMic
import { appStore } from '../state/app-store';
export interface MicAPI {
  requestMic(deviceId?: string): Promise<MediaStream>;
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

type MicPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';
type MicUiState = 'capturing' | 'granted' | 'blocked' | 'idle';

function getPermissionState(): MicPermissionState {
  try {
    const known = (window as any).__tpMicPermState;
    if (known === 'granted' || known === 'denied' || known === 'prompt') return known;
  } catch {}
  try {
    if (appStore.get?.('micGranted')) return 'granted';
  } catch {}
  return 'unknown';
}

function hasLiveAudio(stream: MediaStream | null): boolean {
  try {
    if (!stream || typeof stream.getAudioTracks !== 'function') return false;
    const tracks = stream.getAudioTracks();
    return tracks.some((t) => t && t.readyState === 'live' && t.enabled);
  } catch {
    return false;
  }
}

function getMicUiState(): { state: MicUiState; permission: MicPermissionState; capturing: boolean } {
  const permission = getPermissionState();
  const capturing = hasLiveAudio(audioStream) || (typeof mic?.isOpen === 'function' && mic.isOpen());
  if (capturing) return { state: 'capturing', permission, capturing };
  if (permission === 'granted') return { state: 'granted', permission, capturing };
  if (permission === 'denied') return { state: 'blocked', permission, capturing };
  return { state: 'idle', permission, capturing };
}

function updateMicPill(state: MicUiState): void {
  try {
    const pill = document.getElementById('permChip');
    if (!pill) return;
    const label =
      state === 'capturing'
        ? 'Mic: capturing'
        : state === 'granted'
          ? 'Mic: granted'
          : state === 'blocked'
            ? 'Mic: blocked'
            : 'Mic: idle';
    pill.textContent = label;
    pill.dataset.micState = state;
    pill.classList.toggle('mic-active', state === 'capturing');
  } catch {
    // ignore
  }
}

export function emitMicState(): void {
  try {
    const detail = getMicUiState();
    updateMicPill(detail.state);
    window.dispatchEvent(new CustomEvent('tp:mic:state', { detail }));
  } catch {
    // ignore
  }
}

async function syncPermissionState(): Promise<void> {
  try {
    if (!navigator.permissions?.query) return;
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (status.state === 'granted') {
      try { (window as any).__tpMicPermState = 'granted'; } catch {}
      try { appStore.set('micGranted', true); } catch {}
    } else if (status.state === 'denied') {
      try { (window as any).__tpMicPermState = 'denied'; } catch {}
      try { appStore.set('micGranted', false); } catch {}
    } else {
      try { (window as any).__tpMicPermState = 'prompt'; } catch {}
    }
  } catch {
    // ignore
  }
}

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
    analyser.fftSize = 1024;
    src.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
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
      analyser.getByteTimeDomainData(data);
      const rms =
        Math.sqrt(data.reduce((a, b) => {
          const centered = (b - 128) / 128; // center around 0
          return a + centered * centered;
        }, 0) / data.length) || 0;
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

async function requestMic(preferredId?: string): Promise<MediaStream> {
  try {
    const sel = document.getElementById('settingsMicSel') as HTMLSelectElement | null;
    const chosenId = preferredId || sel?.value || undefined;
    const constraints: MediaStreamConstraints = { audio: { deviceId: chosenId ? { exact: chosenId } : undefined } };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    audioStream = stream;
    mic.__lastStream = stream;
    try {
      (window as any).__tpMicPermState = 'granted';
    } catch {
      // ignore
    }
    try { appStore.set('micGranted', true); } catch {}
    startDbMeter(stream);
    emitMicState();
    try {
      if (chosenId) localStorage.setItem(DEVICE_KEY, chosenId);
    } catch {
      // ignore
    }
    return stream;
  } catch (err) {
    console.warn('requestMic failed', err);
    try {
      const name = String((err as any)?.name || '');
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        (window as any).__tpMicPermState = 'denied';
        try { appStore.set('micGranted', false); } catch {}
      }
    } catch {
      // ignore
    }
    emitMicState();
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
  emitMicState();
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
  emitMicState();
  void syncPermissionState();
  appStore.subscribe?.('micGranted', () => emitMicState());
} catch {}

try {
  const delayedPopulate = (): void => {
    setTimeout(() => {
      try {
        void populateDevices();
        emitMicState();
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
