let stream: MediaStream | null = null;
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let data: Float32Array | null = null;
let raf: number | 0 = 0;

function updateChip(state: string): void {
  try {
    const chip =
      (document.querySelector('.chip:has(#dbMeterTop)') as HTMLElement | null) ||
      (document.getElementById('micChip') as HTMLElement | null);
    if (!chip) return;
    chip.textContent = `Mic: ${state}`;
  } catch {
    // ignore UI update errors
  }
}

function stop(): void {
  try {
    cancelAnimationFrame(raf);
  } catch {
    // ignore
  }
  raf = 0;
  analyser = null;
  data = null;

  try {
    if (ctx) {
      // close can return a promise; ignore result
      ctx.close && ctx.close();
    }
  } catch {
    // ignore
  }
  ctx = null;

  try {
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((t) => {
        try {
          t.stop && t.stop();
        } catch {
          // ignore
        }
      });
    }
  } catch {
    // ignore
  }
  stream = null;
  updateChip('unknown');
}

function hasLiveTracks(): boolean {
  try {
    if (!stream || typeof stream.getTracks !== 'function') return false;
    const tracks = stream.getTracks();
    if (!Array.isArray(tracks)) return false;
    return tracks.some((t) => t && t.readyState === 'live');
  } catch {
    return false;
  }
}

export function isOpen(): boolean {
  try {
    if (!stream) return false;
    if (hasLiveTracks()) return true;
    // some browsers expose .active
    return (stream as any).active !== false;
  } catch {
    return !!stream;
  }
}

export async function requestMic(): Promise<void> {
  try {
    const S = (typeof window !== 'undefined' && (window as any).__tpStore) ? (window as any).__tpStore : null;
    const preferId = S && typeof S.get === 'function' ? (String(S.get('micDevice') || '') || '') : '';

    const constraints: MediaStreamConstraints = {
      audio: preferId ? { deviceId: { exact: preferId } } : true,
      video: false,
    };

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('no-media-devices');
    }

    stream = await navigator.mediaDevices.getUserMedia(constraints);

  const AC =
    (window as any).AudioContext ||
    (window as any).webkitAudioContext;

    if (!AC) throw new Error('no-audio-context');

    const audioCtx = new AC();
    ctx = audioCtx;
    const src = audioCtx.createMediaStreamSource(stream!);
    const a = audioCtx.createAnalyser();
    analyser = a;
    a.fftSize = 1024;
    data = new Float32Array(a.fftSize);
    src.connect(a);
    updateChip('ready');

    // Trigger device re-enumeration so labels become visible post-permission
    try {
      window.dispatchEvent(new CustomEvent('tp:devices-refresh'));
    } catch {
      // ignore
    }

    const tick = () => {
      try {
        if (!analyser || !data) return;
        analyser.getFloatTimeDomainData(data as unknown as Float32Array<ArrayBuffer>);
        // RMS → dBFS
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length) || 1e-8;
        const db = 20 * Math.log10(rms); // ~ -60..0
        window.dispatchEvent(new CustomEvent('tp:db', { detail: { db } }));
      } catch {
        // ignore per-frame errors
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) {
    updateChip('denied');
    stop();
    try {
      console.warn('[mic] denied or failed:', e);
    } catch {
      // ignore
    }
  }
}

export function releaseMic(): void {
  stop();
}
