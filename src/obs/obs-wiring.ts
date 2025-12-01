import {
  RecorderSettingsState,
  subscribeRecorderSettings,
} from '../state/recorder-settings';
import * as rec from '../../recorders.js';

type PillState = 'ok' | 'error' | 'busy';

function setObsStatus(text: string, state: PillState): void {
  const textEl = document.getElementById('obsStatusText');
  if (textEl) textEl.textContent = text;
  const pill = textEl?.closest('.obs-pill') as HTMLElement | null;
  if (pill) {
    pill.classList.remove('ok', 'error', 'busy');
    pill.classList.add(state);
  }
}

function toast(msg: string, type: 'ok' | 'error' | 'warn' | 'info' = 'info'): void {
  try {
    // @ts-ignore optional global toast
    if (typeof (window as any)._toast === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (window as any)._toast(msg, { type });
      return;
    }
  } catch {
    // ignore
  }
  try { console.log(msg); } catch {}
}

let lastEnabled = false;
let lastUrl = '';

async function applyObsState(state: RecorderSettingsState) {
  const enabled = state.enabled.obs;
  const url = state.configs.obs.url;
  const pass = state.configs.obs.password || '';

  if (!enabled) {
    if (lastEnabled) {
      try { await (rec as any).setEnabled?.(false); } catch {}
      setObsStatus('disabled', 'error');
      toast('OBS disabled in settings.', 'info');
    }
    lastEnabled = false;
    lastUrl = url;
    return;
  }

  lastEnabled = true;
  const urlChanged = url !== lastUrl;
  lastUrl = url;

  setObsStatus('connecting…', 'busy');
  toast(`Connecting to OBS at ${url}…`, 'info');

  try {
    // Push config then enable; rec.reconfigure accepts { url, password }
    try { await (rec as any).reconfigure?.({ url, password: pass }); } catch {}
    try { await (rec as any).setEnabled?.(true); } catch {}
    // Optional: quick probe via test() if available
    if (typeof (rec as any).test === 'function' && urlChanged) {
      try { await (rec as any).test(); } catch {}
    }
    setObsStatus('ready', 'ok');
    toast('OBS: connected and ready.', 'ok');
  } catch (err: any) {
    const msg = err?.message || String(err || 'Unknown error');
    setObsStatus('offline', 'error');
    toast(`OBS connection failed: ${msg}`, 'error');
  }
}

export function initObsWiring(): void {
  subscribeRecorderSettings((state) => {
    if (state.enabled.obs !== lastEnabled || state.configs.obs.url !== lastUrl) {
      void applyObsState(state);
    }
  });
}
