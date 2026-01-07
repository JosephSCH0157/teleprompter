// Lightweight auto-record stub (browser MediaRecorder-based).
// Mirrors the legacy JS behavior but typed for the TS runtime.

(() => {
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let active = false;
  let currentStream: MediaStream | null = null;

  const pad = (n: number) => String(n).padStart(2, '0');
  function formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());
    return `${year}-${month}-${day}_${hour}-${minute}-${second}`;
  }

  function sanitizeTitle(title: string): string {
    const trimmed = String(title || 'Script').trim() || 'Script';
    const cleaned = trimmed
      .replace(/[:/\\?<>|*"']/g, '-')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_');
    const sliced = cleaned.slice(0, 64).replace(/^_+|_+$/g, '');
    return sliced || 'Script';
  }

  function getActiveScriptTitle(): string {
    try {
      const titleInput = document.getElementById('scriptTitle') as HTMLInputElement | null;
      if (titleInput && titleInput.value) return titleInput.value;
    } catch {}
    try {
      const stored = localStorage.getItem('tp_last_script_title') || localStorage.getItem('tp_last_script_name');
      if (stored) return stored;
    } catch {}
    return 'Script';
  }

  const nowName = (): string => {
    try {
      const date = new Date();
      const title = sanitizeTitle(getActiveScriptTitle());
      const ts = formatTimestamp(date);
      return `${title}_${ts}.webm`;
    } catch {
      return `Script_${formatTimestamp(new Date())}.webm`;
    }
  };

  const pickMime = (): string => {
    try {
      const cand = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      for (const t of cand) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
      }
    } catch {}
    return 'video/webm';
  };

  const getVideoStream = async (): Promise<MediaStream> => {
    try {
      const v = document.getElementById('camVideo') as HTMLVideoElement | null;
      const s = (v?.srcObject as MediaStream) || null;
      if (s && typeof s.getVideoTracks === 'function' && s.getVideoTracks().length) return new MediaStream([...s.getVideoTracks()]);
    } catch {}
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
        audio: false,
      });
    } catch {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
  };

  const getAudioStream = async (): Promise<MediaStream> => {
    try {
      const mic = (window as any).__tpMic;
      const s = mic?.__lastStream as MediaStream | undefined;
      if (s && typeof s.getAudioTracks === 'function' && s.getAudioTracks().length) return new MediaStream([...s.getAudioTracks()]);
    } catch {}
    try {
      const mic = (window as any).__tpMic;
      if (mic && typeof mic.requestMic === 'function') {
        const s = await mic.requestMic();
        const tracks = (s as any)?.getAudioTracks?.();
        if (tracks && tracks.length) return new MediaStream([...tracks]);
      }
    } catch {}
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return new MediaStream([...s.getAudioTracks()]);
  };

  const mustSkipForMode = (): boolean => {
    try {
      const store = (window as any).__tpStore;
      const mode = store && typeof store.get === 'function' ? String(store.get('scrollMode') || '') : '';
      return /rehearsal/i.test(mode);
    } catch {
      return false;
    }
  };

  async function start(): Promise<void> {
    if (active) return;
    try {
      if (mustSkipForMode()) {
        try { console.log('[core-recorder] start skipped: rehearsal mode'); } catch {}
        return;
      }

      try {
        console.log('[core-recorder] start', {
          mode: (window as any).__tpStore?.get?.('scrollMode') || null,
        });
      } catch {}

      const v = await getVideoStream();
      const a = await getAudioStream();
      const mix = new MediaStream();
      try {
        a.getAudioTracks().forEach((t) => mix.addTrack(t));
      } catch {}
      try {
        v.getVideoTracks().forEach((t) => mix.addTrack(t));
      } catch {}
      currentStream = mix;
      const mime = pickMime();
      mediaRecorder = new MediaRecorder(mix, { mimeType: mime, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 });
      chunks = [];
      mediaRecorder.ondataavailable = (e: BlobEvent) => {
        try {
          if (e && e.data && e.data.size) chunks.push(e.data);
          else console.log('[core-recorder] dataavailable empty chunk');
        } catch {}
      };
      mediaRecorder.onstop = async () => {
        try {
          console.log('[core-recorder] mediaRecorder.onstop fired', { chunks: chunks.length });
          console.log('[core-recorder] mediaRecorder.onstop fired');
          const blob = new Blob(chunks, { type: (mediaRecorder && mediaRecorder.mimeType) || 'video/webm' });
          chunks = [];
          try {
            console.log('[core-recorder] about to save blob', { size: blob.size, type: blob.type });
          } catch {}
          await saveBlob(blob, nowName());
        } catch (e) {
          try {
            console.warn('[auto-rec] save failed', e);
          } catch {}
        }
      };
      mediaRecorder.start();
      active = true;
      try {
        window.dispatchEvent(new CustomEvent('rec:state', { detail: { state: 'recording', adapter: 'local-auto' } }));
      } catch {}
    } catch (e) {
      try {
        console.warn('[auto-rec] start failed', e);
      } catch {}
    }
  }

  async function stop(): Promise<void> {
    try { console.log('[core-recorder] stop called'); } catch {}
    if (!active) return;
    try {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    } catch {}
    try {
      if (currentStream) currentStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
    } catch {}
    currentStream = null;
    mediaRecorder = null;
    active = false;
    try {
      window.dispatchEvent(new CustomEvent('rec:state', { detail: { state: 'idle', adapter: 'local-auto' } }));
    } catch {}
  }

  async function saveBlob(blob: Blob, name: string): Promise<boolean> {
    try {
      console.log('[recording-dir] saveRecordingBlob start', { size: blob.size, name });
      await import('../fs/recording-dir');
      const dir = (window as any).__tpRecDir?.get?.() || null;
      if (dir && typeof dir.getFileHandle === 'function') {
        try {
          try {
            console.log('[core-recorder] writing to directory', { name: (dir as any).name || '(handle)' });
          } catch {}
          const fh = await dir.getFileHandle(name, { create: true });
          const w = await fh.createWritable();
          await w.write(blob);
          await w.close();
          try {
            console.log('[core-recorder] saved file', name);
          } catch {}
          return true;
        } catch (err) {
          try { console.warn('[core-recorder] failed to write via FileSystemAccess', err); } catch {}
        }
      } else {
        try {
          console.warn(
            '[core-recorder] no recording directory handle available; pick a folder in Settings → Recording/Media',
          );
        } catch {}
        return false;
      }
    } catch {}
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name || 'Recording.webm';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 2000);
    } catch {}
    return false;
  }

  try {
    document.addEventListener(
      'tp:session:start',
      () => {
        try {
          start();
        } catch {}
      },
      { capture: true },
    );
    document.addEventListener(
      'tp:session:stop',
      () => {
        try {
          stop();
        } catch {}
      },
      { capture: true },
    );
    document.addEventListener(
      'tp:speech-state',
      (e) => {
        try {
          const detail = (e as CustomEvent)?.detail;
          if (detail && detail.running === false) stop();
          if (detail && detail.running === true) start();
        } catch {}
      },
      { capture: true },
    );
  } catch {}

  try {
    const auto = ((window as any).__tpAutoRecord = (window as any).__tpAutoRecord || {});
    if (!auto.start) auto.start = start;
    if (!auto.stop) auto.stop = stop;
    auto.isActive = () => !!active;
  } catch {}

  try {
    (window as any).startAutoRecord = start;
    (window as any).stopAutoRecord = stop;
  } catch {}

  // Bridge this implementation to a stable core recorder surface so the registry always
  // targets the MediaRecorder-backed recorder (even if another legacy recorder is present).
  try {
    const coreSurface = {
      start,
      stop,
      isAvailable: () => true,
      wantsAuto: () => true,
      getAdapter: () => coreSurface,
    };
    (window as any).__tpLocalRecorder = coreSurface;
    (window as any).__tpRecording = coreSurface; // override to ensure we hit the real recorder
    try { console.log('[core-recorder] bridged to __tpRecording'); } catch {}
  } catch {}
})();

export {};
