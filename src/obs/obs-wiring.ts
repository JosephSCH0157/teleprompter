import {
  RecorderSettingsState,
  RecorderStatus,
  subscribeRecorderSettings,
  setObsStatus,
} from '../state/recorder-settings';
import * as rec from '../../recorders.js';

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
let lastPass = '';

function status(next: RecorderStatus, err: string | null = null): void {
  setObsStatus(next, err);
}

async function applyObsState(state: RecorderSettingsState): Promise<void> {
  const enabled = state.enabled.obs;
  const url = state.configs.obs.url;
  const pass = state.configs.obs.password || '';

  if (!enabled) {
    if (lastEnabled) {
      try { await (rec as any).setEnabled?.(false); } catch {}
      status('disconnected');
      toast('OBS disabled in settings.', 'info');
    }
    lastEnabled = false;
    lastUrl = url;
    lastPass = pass;
    return;
  }

  lastEnabled = true;
  const urlChanged = url !== lastUrl || pass !== lastPass;
  lastUrl = url;
  lastPass = pass;

  status('connecting');
  toast(`Connecting to OBS at ${url}…`, 'info');

  try {
    try { await (rec as any).reconfigure?.({ url, password: pass }); } catch {}
    try { await (rec as any).setEnabled?.(true); } catch {}
    if (typeof (rec as any).test === 'function' && urlChanged) {
      try { await (rec as any).test(); } catch {}
    }
    status('connected');
    toast('OBS: connected and ready.', 'ok');
  } catch (err: any) {
    const msg = err?.message || String(err || 'Unknown error');
    status('error', msg);
    toast(`OBS connection failed: ${msg}`, 'error');
  }
}

export function initObsWiring(): void {
  subscribeRecorderSettings((state) => {
    if (
      state.enabled.obs !== lastEnabled ||
      state.configs.obs.url !== lastUrl ||
      state.configs.obs.password !== lastPass
    ) {
      void applyObsState(state);
    }
  });
}
