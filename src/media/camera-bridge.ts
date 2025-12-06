// src/media/camera-bridge.ts
//
// Sidebar camera is SSOT:
// - Start/stop comes from #startCam / #stopCam in the sidebar.
// - Device comes from a single camera select (sidebar or settings), mirrored if both exist.
// - Exposes window.__tpCamera / window.__camApi for legacy/test callers.

import { appStore } from '../state/app-store';
type Maybe<T> = T | null;

type CameraAPI = {
  start: () => Promise<boolean>;
  stop: () => void;
  setDevice: (id: string | null) => Promise<boolean> | boolean;
  setSize: (pct: number) => void;
  setOpacity: (opacity: number) => void;
  setMirror: (on: boolean) => void;
  isActive: () => boolean;
  startCamera?: () => Promise<boolean>;
  stopCamera?: () => void;
  switchCamera?: (id: string) => Promise<boolean> | boolean;
  applyCamSizing?: () => void;
  applyCamOpacity?: () => void;
  applyCamMirror?: () => void;
  currentDeviceId?: string | null;
};

declare global {
  interface Window {
    __tpCamera?: CameraAPI;
    __camApi?: CameraAPI;
  }
}

let bound = false;

function q<T extends HTMLElement = HTMLElement>(id: string): Maybe<T> {
  return document.getElementById(id) as Maybe<T>;
}

export function bindCameraUI(): void {
  if (bound) return;
  bound = true;

  const startBtn = q<HTMLButtonElement>('startCam');
  const stopBtn = q<HTMLButtonElement>('stopCam');
  const camWrap = q<HTMLDivElement>('camWrap');
  const camVideo = q<HTMLVideoElement>('camVideo');

  const sidebarDevice = q<HTMLSelectElement>('camDevice');
  const settingsDevice =
    (q<HTMLSelectElement>('settingsCamDevice') ||
      q<HTMLSelectElement>('settingsCamSel')) as HTMLSelectElement | null;

  const sizeInput = q<HTMLInputElement>('camSize');
  const opacityInput = q<HTMLInputElement>('camOpacity');
  const mirrorInput = q<HTMLInputElement>('camMirror');
  const pipBtn = q<HTMLButtonElement>('camPiP');
  const camRtcChip = q<HTMLElement>('camRtcChip');

  if (!startBtn || !stopBtn || !camWrap || !camVideo) {
    try { console.warn('[CAM] sidebar camera UI not found; skipping bindCameraUI'); } catch {}
    return;
  }

  // Non-null aliases after guard so TS understands these are present.
  const startEl = startBtn as HTMLButtonElement;
  const stopEl = stopBtn as HTMLButtonElement;
  const wrapEl = camWrap as HTMLDivElement;
  const videoEl = camVideo as HTMLVideoElement;

  const deviceSelects: HTMLSelectElement[] = [];
  if (sidebarDevice) deviceSelects.push(sidebarDevice);
  if (settingsDevice && settingsDevice !== sidebarDevice) deviceSelects.push(settingsDevice);

let currentStream: MediaStream | null = null;
let currentDeviceId: string | null = null;
let isStarting = false;
let applyingFromStore = false;

  function updateChip(text: string): void {
    if (camRtcChip) camRtcChip.textContent = text;
  }

  function setButtons(active: boolean, pending = false): void {
    if (pending) {
      startEl.disabled = true;
      stopEl.disabled = true;
      updateChip('CamRTC: starting…');
      return;
    }
    startEl.disabled = active;
    stopEl.disabled = !active;
    updateChip(active ? 'CamRTC: live' : 'CamRTC: idle');
  }

  function applyCamSizing(): void {
    if (!wrapEl || !sizeInput) return;
    const pct = Math.max(15, Math.min(60, Number(sizeInput.value) || 28));
    wrapEl.style.width = `${pct}%`;
  }

  function applyCamOpacity(): void {
    if (!wrapEl || !opacityInput) return;
    const pct = Math.max(20, Math.min(100, Number(opacityInput.value) || 100));
    wrapEl.style.opacity = String(pct / 100);
  }

  function applyCamMirror(): void {
    if (!mirrorInput) return;
    videoEl.style.transform = mirrorInput.checked ? 'scaleX(-1)' : 'none';
  }

  async function togglePiP(): Promise<void> {
    if (!('pictureInPictureEnabled' in document)) return;
    try {
      const docAny = document as any;
      if (docAny.pictureInPictureElement === videoEl) {
        await docAny.exitPictureInPicture?.();
      } else if (videoEl.readyState >= 2) {
        await (videoEl as any).requestPictureInPicture?.();
      }
    } catch (err) {
      try { console.warn('[CAM] PiP toggle failed', err); } catch {}
    }
  }

  async function refreshDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices || deviceSelects.length === 0) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      const firstSel = deviceSelects[0];

      deviceSelects.forEach((sel) => {
        const prev = sel.value;
        sel.innerHTML = '';
        videoDevices.forEach((dev, idx) => {
          const opt = document.createElement('option');
          opt.value = dev.deviceId || dev.label || `camera-${idx}`;
          opt.textContent = dev.label || `Camera ${idx + 1}`;
          sel.appendChild(opt);
        });

        if (currentDeviceId && videoDevices.some((d) => d.deviceId === currentDeviceId)) {
          sel.value = currentDeviceId;
        } else if (prev && videoDevices.some((d) => d.deviceId === prev)) {
          sel.value = prev;
        } else if (videoDevices[0]) {
          sel.value = videoDevices[0].deviceId || sel.value;
        }
      });

      currentDeviceId = firstSel?.value || null;
      if (window.__tpCamera) window.__tpCamera.currentDeviceId = currentDeviceId;
    } catch (err) {
      try { console.warn('[CAM] enumerateDevices failed', err); } catch {}
    }
  }

  async function doStart(): Promise<boolean> {
    if (isStarting) return false;
    if (currentStream) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      try { console.warn('[CAM] getUserMedia not supported'); } catch {}
      updateChip('CamRTC: unsupported');
      return false;
    }
    isStarting = true;
    setButtons(false, true);
    try {
      const id =
        currentDeviceId ||
        (deviceSelects[0] && deviceSelects[0].value) ||
        undefined;
      const constraints: MediaStreamConstraints = {
        video: id ? { deviceId: { exact: id } } : true,
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      currentStream = stream;
      videoEl.muted = true;
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.controls = false;
      videoEl.removeAttribute('controls');
      videoEl.srcObject = stream;
      try { await videoEl.play(); } catch (err) {
        try { console.warn('[CAM] autoplay blocked; waiting for user gesture', err); } catch {}
        videoEl.addEventListener('click', async () => { try { await videoEl.play(); } catch {} }, { once: true });
      }
      wrapEl.style.display = 'block';
      applyCamSizing();
      applyCamOpacity();
      applyCamMirror();
      setButtons(true, false);
      return true;
    } catch (err) {
      try { console.warn('[CAM] start failed', err); } catch {}
      setButtons(false, false);
      updateChip('CamRTC: error');
      return false;
    } finally {
      isStarting = false;
    }
  }

  function doStop(): void {
    if (currentStream) {
      try { currentStream.getTracks().forEach((t) => t.stop()); } catch {}
      currentStream = null;
    }
    try { videoEl.srcObject = null; } catch {}
    wrapEl.style.display = 'none';
    setButtons(false, false);
  }

  async function setDevice(id: string | null): Promise<boolean> {
    const next = id || '';
    deviceSelects.forEach((sel) => { sel.value = next; });
    currentDeviceId = next || null;
    if (window.__tpCamera) window.__tpCamera.currentDeviceId = currentDeviceId;
    if (currentStream) {
      doStop();
      return await doStart();
    }
    return true;
  }

  function isActive(): boolean {
    return !!currentStream;
  }

  try {
    appStore.subscribe('cameraEnabled', async (on) => {
      if (applyingFromStore) return;
      applyingFromStore = true;
      try {
        if (on) {
          const ok = await doStart();
          try { appStore.set('cameraAvailable', !!ok); } catch {}
          if (!ok) {
            try { appStore.set('cameraEnabled', false); } catch {}
          }
        } else {
          doStop();
          try { appStore.set('cameraAvailable', false); } catch {}
        }
      } finally {
        applyingFromStore = false;
      }
    });
  } catch {}

  // Wire UI events (sidebar = SSOT)
  startEl.addEventListener('click', () => {
    try { appStore.set('cameraEnabled', true); } catch {}
  });
  stopEl.addEventListener('click', () => {
    try { appStore.set('cameraEnabled', false); } catch {}
  });

  deviceSelects.forEach((sel) => {
    sel.addEventListener('change', () => { void setDevice(sel.value || null); });
  });

  if (sizeInput) sizeInput.addEventListener('input', applyCamSizing);
  if (opacityInput) opacityInput.addEventListener('input', applyCamOpacity);
  if (mirrorInput) mirrorInput.addEventListener('change', applyCamMirror);
  if (pipBtn) pipBtn.addEventListener('click', () => { void togglePiP(); });

  wrapEl.style.display = 'none';
  setButtons(false, false);
  void refreshDevices();

  // Expose API globally
  const api: CameraAPI = window.__tpCamera || ({} as CameraAPI);
  api.start = doStart;
  api.stop = doStop;
  api.setDevice = (id: string | null) => setDevice(id);
  api.setSize = (pct: number) => { if (sizeInput) { sizeInput.value = String(pct); applyCamSizing(); } };
  api.setOpacity = (opacity: number) => { if (opacityInput) { opacityInput.value = String(opacity); applyCamOpacity(); } };
  api.setMirror = (on: boolean) => { if (mirrorInput) { mirrorInput.checked = on; applyCamMirror(); } };
  api.isActive = isActive;
  api.currentDeviceId = currentDeviceId;
  api.startCamera = doStart;
  api.stopCamera = doStop;
  api.switchCamera = (id: string) => setDevice(id);
  api.applyCamSizing = applyCamSizing;
  api.applyCamOpacity = applyCamOpacity;
  api.applyCamMirror = applyCamMirror;

  // Optional camera toggle button (top bar chip)
  const camToggleBtn = document.getElementById('cameraToggleBtn') as HTMLButtonElement | null;
  if (camToggleBtn) {
    const camToggleLabel = camToggleBtn.querySelector('.cam-label') as HTMLElement | null;
    const camToggleSpinner = camToggleBtn.querySelector('.spinner') as HTMLElement | null;

    if (camToggleSpinner) {
      camToggleSpinner.style.display = 'none';
      camToggleSpinner.setAttribute('aria-hidden', 'true');
    }

    const setToggleState = (state: 'off' | 'starting' | 'on' | 'error') => {
      if (camToggleLabel) {
        if (state === 'on') camToggleLabel.textContent = 'Camera: On';
        else if (state === 'starting') camToggleLabel.textContent = 'Camera: Starting…';
        else if (state === 'error') camToggleLabel.textContent = 'Camera: Error';
        else camToggleLabel.textContent = 'Camera: Off';
      }
      if (camToggleSpinner) {
        const show = state === 'starting';
        camToggleSpinner.style.display = show ? '' : 'none';
        camToggleSpinner.setAttribute('aria-hidden', show ? 'false' : 'true');
      }
      if (state === 'on') {
        camToggleBtn.setAttribute('aria-pressed', 'true');
        camToggleBtn.disabled = false;
      } else if (state === 'starting') {
        camToggleBtn.setAttribute('aria-pressed', api.isActive() ? 'true' : 'false');
        camToggleBtn.disabled = true;
      } else if (state === 'error') {
        camToggleBtn.setAttribute('aria-pressed', 'false');
        camToggleBtn.disabled = false;
      } else {
        camToggleBtn.setAttribute('aria-pressed', 'false');
        camToggleBtn.disabled = false;
      }
    };

    const originalStart = api.start.bind(api);
    const originalStop = api.stop.bind(api);

    api.start = async () => {
      setToggleState('starting');
      const ok = await originalStart();
      setToggleState(ok ? 'on' : 'off');
      return ok;
    };

    api.stop = () => {
      originalStop();
      setToggleState('off');
    };

    camToggleBtn.addEventListener('click', () => {
      if (api.isActive()) {
        api.stop();
      } else {
        void api.start();
      }
    });

    setToggleState(api.isActive() ? 'on' : 'off');
  }

  window.__tpCamera = api;
  if (!window.__camApi) window.__camApi = api;
}
