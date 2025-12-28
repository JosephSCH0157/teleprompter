import { showToast } from '../ui/toasts';
import { safeDOM } from '../utils/safe-dom';
import { initAsrSettingsUI } from '../ui/settings/asr-wizard';
import { appStore } from '../state/app-store';
import { emitMicState } from './mic';

function requestMicFromBrowser(): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('This browser does not support direct microphone access.');
    return Promise.resolve(null);
  }
  return navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      showToast('Mic access granted.');
      try { (window as any).__tpMicPermState = 'granted'; } catch {}
      return stream;
    })
    .catch((err) => {
      try { console.warn('[Mic] getUserMedia failed', err); } catch {}
      showToast('Mic access denied. Check your browser permissions.');
      try { (window as any).__tpMicPermState = 'denied'; } catch {}
      return null;
    });
}

function isMicCapturing(): boolean {
  try {
    const mic = (window as any).__tpMic;
    if (typeof mic?.isOpen === 'function') return !!mic.isOpen();
    const stream = mic?.__lastStream as MediaStream | undefined;
    if (stream && typeof stream.getAudioTracks === 'function') {
      const tracks = stream.getAudioTracks();
      return tracks.some((t) => t && t.readyState === 'live' && t.enabled);
    }
  } catch {}
  return false;
}

async function handleRequestMic(source: 'sidebar' | 'settings'): Promise<void> {
  const stream = await requestMicFromBrowser();
  if (!stream) {
    emitMicState();
    return;
  }

  try {
    await initAsrSettingsUI();
  } catch {
    // ignore; Settings UI might not be mounted/visible yet
  }

  try {
    appStore.set('micGranted', true);
  } catch {
    // ignore
  }
  try {
    (window as any).__tpMicGranted = true;
  } catch {
    // ignore
  }

  if (source === 'sidebar') {
    const pill = safeDOM.q<HTMLElement>('[data-tp-mic-pill]');
    if (pill) pill.dataset.micGranted = '1';
  }
  emitMicState();
}

export function initMicPermissions(): void {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-tp-request-mic]'),
  );
  const applyState = () => {
    const capturing = isMicCapturing();
    buttons.forEach((btn) => {
      const isSidebar = (btn.getAttribute('data-tp-request-mic') || '').toLowerCase() === 'sidebar';
      if (capturing) {
        btn.classList.add('mic-active');
        btn.textContent = isSidebar ? 'Release mic' : 'Release mic';
      } else {
        btn.classList.remove('mic-active');
        btn.textContent = isSidebar ? 'Request mic' : 'Request mic';
      }
    });
  };
  try {
    applyState();
    appStore.subscribe?.('micGranted', () => applyState());
  } catch {
    // ignore
  }
  buttons.forEach((btn) => {
    const source =
      (btn.getAttribute('data-tp-request-mic') as 'sidebar' | 'settings') ||
      'settings';
    btn.addEventListener('click', () => {
      try {
        if (isMicCapturing()) {
          try { (window as any).__tpMic?.releaseMic?.(); } catch {}
          try { (window as any).__tpMicGranted = false; } catch {}
          emitMicState();
          applyState();
          return;
        }
      } catch {
        // ignore and fall through to request
      }
      void handleRequestMic(source);
    });
  });

  try {
    (window as any).tpRequestMic = handleRequestMic;
  } catch {
    // ignore
  }
}
