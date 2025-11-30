// src/media/camera-bridge.ts
//
// Sidebar camera is SSOT:
// - Start/stop comes from #startCam / #stopCam in the sidebar.
// - Device comes from a single "camera device" <select> (Settings or sidebar).
//   If both exist, we mirror them.
//
// This module owns the getUserMedia stream in the TS path and exposes
// a minimal window.__tpCamera API for any legacy/test callers.

type Maybe<T> = T | null;

interface CameraApi {
  start(deviceId?: string): Promise<void>;
  stop(): void;
  isRunning(): boolean;
  setSize(percent: number): void;
  setOpacity(opacity: number): void;
  setMirror(mirror: boolean): void;
  togglePiP(): Promise<void>;
}

declare global {
  interface Window {
    __tpCamera?: CameraApi;
  }
}

function qs<T extends HTMLElement = HTMLElement>(id: string): Maybe<T> {
  return document.getElementById(id) as Maybe<T>;
}

export function bindCameraUI(): void {
  // Sidebar controls (SSOT for start/stop)
  const startBtn = qs<HTMLButtonElement>('startCam');
  const stopBtn = qs<HTMLButtonElement>('stopCam');
  const sidebarDeviceSel = qs<HTMLSelectElement>('camDevice');
  const sizeInput = qs<HTMLInputElement>('camSize');
  const opacityInput = qs<HTMLInputElement>('camOpacity');
  const mirrorCheckbox = qs<HTMLInputElement>('camMirror');
  const pipBtn = qs<HTMLButtonElement>('camPiP');

  const camWrap = qs<HTMLDivElement>('camWrap');
  const camVideo = qs<HTMLVideoElement>('camVideo');
  const camRtcChip = qs<HTMLElement>('camRtcChip');

  // Settings camera device select (adjust selector if needed)
  const settingsDeviceSel =
    (document.querySelector('[data-role="cam-device"]') as Maybe<HTMLSelectElement>) ||
    qs<HTMLSelectElement>('settingsCamDevice') ||
    null;

  // Only bail if the core sidebar controls are missing.
  if (!startBtn || !stopBtn || !camWrap || !camVideo) {
    try { console.warn('[CAMERA] core DOM elements missing; camera bridge not bound'); } catch {}
    return; // no engine without these
  }

  let stream: MediaStream | null = null;
  let running = false;

  function updateChip(text: string): void {
    if (camRtcChip) camRtcChip.textContent = text;
  }

  function setButtonsForState(isRunning: boolean): void {
    startBtn.disabled = isRunning;
    stopBtn.disabled = !isRunning;
  }

  function getActiveDeviceId(): string | undefined {
    const sel = settingsDeviceSel || sidebarDeviceSel;
    if (!sel) return undefined;
    const value = sel.value;
    return value || undefined;
  }

  async function populateDevices(): Promise<void> {
    const sel = settingsDeviceSel || sidebarDeviceSel;
    if (!sel || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      const preserved = Array.from(sel.options).filter((o) => !o.value);
      sel.innerHTML = '';
      preserved.forEach((o) => sel.add(o));
      for (const d of videoInputs) {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Camera ${sel.options.length + 1}`;
        sel.add(opt);
      }
      if (settingsDeviceSel && sidebarDeviceSel && sel === settingsDeviceSel) {
        sidebarDeviceSel.innerHTML = sel.innerHTML;
        sidebarDeviceSel.value = sel.value;
      }
    } catch (err) {
      try { console.warn('[CAMERA] enumerateDevices failed', err); } catch {}
    }
  }

  async function start(deviceId?: string): Promise<void> {
    if (running && !deviceId) return;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }

    updateChip('CamRTC: starting…');
    setButtonsForState(true);

    const constraints: MediaStreamConstraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
      audio: false,
    };

    try {
      const media = await navigator.mediaDevices.getUserMedia(constraints);
      stream = media;

      camVideo.srcObject = media;
      camVideo.muted = true;
      camVideo.playsInline = true;
      camWrap.style.display = 'block';

      applySize();
      applyOpacity();
      applyMirror();

      try {
        await camVideo.play();
      } catch (playErr) {
        try { console.warn('[CAMERA] autoplay blocked; waiting for user gesture', playErr); } catch {}
        updateChip('Tap camera to start playback');
        const onTap = async () => {
          try {
            await camVideo.play();
            updateChip('CamRTC: live');
            camVideo.removeEventListener('click', onTap);
          } catch {}
        };
        camVideo.addEventListener('click', onTap, { once: true });
      }

      running = true;
      updateChip('CamRTC: live');
    } catch (err) {
      try { console.error('[CAMERA] getUserMedia failed', err); } catch {}
      updateChip('CamRTC: error');
      setButtonsForState(false);
      camWrap.style.display = 'none';
      running = false;
      stream = null;
    }
  }

  function stop(): void {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    camVideo.srcObject = null;
    camWrap.style.display = 'none';
    running = false;
    setButtonsForState(false);
    updateChip('CamRTC: idle');
  }

  function applySize(): void {
    if (!camWrap || !sizeInput) return;
    const value = Number(sizeInput.value || sizeInput.getAttribute('value') || 100);
    const clamped = Math.max(10, Math.min(100, value));
    camWrap.style.width = `${clamped}%`;
    camWrap.style.height = 'auto';
  }

  function applyOpacity(): void {
    if (!camWrap || !opacityInput) return;
    const raw = Number(opacityInput.value || opacityInput.getAttribute('value') || 100);
    const clamped = Math.max(10, Math.min(100, raw));
    camWrap.style.opacity = String(clamped / 100);
  }

  function applyMirror(): void {
    if (!camWrap || !camVideo || !mirrorCheckbox) return;
    const mirrored = mirrorCheckbox.checked;
    if (mirrored) camWrap.classList.add('mirrored');
    else camWrap.classList.remove('mirrored');
  }

  async function togglePiP(): Promise<void> {
    if (!document.pictureInPictureEnabled || !camVideo) return;
    try {
      if (document.pictureInPictureElement === camVideo) {
        await document.exitPictureInPicture();
      } else {
        if (!running) {
          await start(getActiveDeviceId());
        }
        await camVideo.requestPictureInPicture();
      }
    } catch (err) {
      try { console.warn('[CAMERA] PiP failed', err); } catch {}
    }
  }

  // Expose global API for legacy/test callers
  const api: CameraApi = {
    start: (deviceId?: string) => start(deviceId),
    stop,
    isRunning: () => running,
    setSize: (percent: number) => {
      if (sizeInput) sizeInput.value = String(percent);
      applySize();
    },
    setOpacity: (opacity: number) => {
      if (opacityInput) opacityInput.value = String(opacity);
      applyOpacity();
    },
    setMirror: (mirror: boolean) => {
      if (mirrorCheckbox) mirrorCheckbox.checked = mirror;
      applyMirror();
    },
    togglePiP,
  };

  (window as any).__tpCamera = api;

  // Wire sidebar start/stop
  startBtn.addEventListener('click', () => {
    const deviceId = getActiveDeviceId();
    void start(deviceId);
  });
  stopBtn.addEventListener('click', () => {
    stop();
  });

  // Wire sidebar sliders and toggles
  if (sizeInput) sizeInput.addEventListener('input', () => applySize());
  if (opacityInput) opacityInput.addEventListener('input', () => applyOpacity());
  if (mirrorCheckbox) mirrorCheckbox.addEventListener('change', () => applyMirror());
  if (pipBtn) pipBtn.addEventListener('click', () => { void togglePiP(); });

  // Keep sidebar & settings device selects in sync if both exist
  function syncDevices(source: HTMLSelectElement, target: Maybe<HTMLSelectElement>): void {
    if (!target) return;
    target.innerHTML = source.innerHTML;
    target.value = source.value;
  }
  if (settingsDeviceSel && sidebarDeviceSel) {
    settingsDeviceSel.addEventListener('change', () => syncDevices(settingsDeviceSel, sidebarDeviceSel));
    sidebarDeviceSel.addEventListener('change', () => syncDevices(sidebarDeviceSel, settingsDeviceSel));
  }

  // Restart on new device if already running
  const activeDeviceSel = settingsDeviceSel || sidebarDeviceSel;
  if (activeDeviceSel) {
    activeDeviceSel.addEventListener('change', () => {
      if (running) {
        const deviceId = getActiveDeviceId();
        void start(deviceId);
      }
    });
  }

  // Initial UI state and device list
  camWrap.style.display = 'none';
  setButtonsForState(false);
  updateChip('CamRTC: idle');
  void populateDevices();
}
