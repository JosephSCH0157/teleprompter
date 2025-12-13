import { showToast } from '../ui/toasts';
import { safeDOM } from '../utils/safe-dom';
import { initAsrSettingsUI } from '../ui/settings/asr-wizard';
import { appStore } from '../state/app-store';

function requestMicFromBrowser(): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('This browser does not support direct microphone access.');
    return Promise.resolve(null);
  }
  return navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      showToast('Mic access granted.');
      return stream;
    })
    .catch((err) => {
      try { console.warn('[Mic] getUserMedia failed', err); } catch {}
      showToast('Mic access denied. Check your browser permissions.');
      return null;
    });
}

async function handleRequestMic(source: 'sidebar' | 'settings'): Promise<void> {
  const stream = await requestMicFromBrowser();
  if (!stream) return;

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
}

export function initMicPermissions(): void {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-tp-request-mic]'),
  );
  const applyState = (granted: boolean) => {
    buttons.forEach((btn) => {
      const isSidebar = (btn.getAttribute('data-tp-request-mic') || '').toLowerCase() === 'sidebar';
      if (granted) {
        btn.classList.add('mic-active');
        btn.textContent = isSidebar ? 'Mic active' : 'Mic active';
      } else {
        btn.classList.remove('mic-active');
        btn.textContent = isSidebar ? 'Request mic' : 'Request mic';
      }
    });
  };
  try {
    applyState(!!appStore.get?.('micGranted'));
    appStore.subscribe?.('micGranted', (v: unknown) => applyState(!!v));
  } catch {
    // ignore
  }
  buttons.forEach((btn) => {
    const source =
      (btn.getAttribute('data-tp-request-mic') as 'sidebar' | 'settings') ||
      'settings';
    btn.addEventListener('click', () => {
      try {
        // If already granted/active, let other mic controls handle release/toggle without re-requesting.
        if (!!appStore.get?.('micGranted')) return;
      } catch {
        // ignore
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
