import {
  RecorderStatus,
  getRecorderSettings,
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

function mapObsTextToStatus(txt: string | undefined, ok: boolean): RecorderStatus {
  const t = (txt || '').toLowerCase().trim();
  if (!t) return ok ? 'connected' : 'disconnected';

  if (t.includes('connecting')) return 'connecting';
  if (t.includes('connected') || t.includes('initialized')) return 'connected';

  if (t.startsWith('closed')) {
    if (t.includes('1000')) return 'disconnected';
    return 'error';
  }

  if (t.includes('error') || t.includes('auth')) return 'error';

  return ok ? 'connected' : 'disconnected';
}

let lastEnabled = getRecorderSettings().enabled.obs;
let lastUrl = getRecorderSettings().configs.obs.url;
let lastPass = getRecorderSettings().configs.obs.password || '';

async function applyObsStateFromSettings(): Promise<void> {
  const { enabled, configs } = getRecorderSettings();
  const url = configs.obs.url;
  const pass = configs.obs.password || '';

  if (!enabled.obs) {
    if (lastEnabled) {
      try { await (rec as any).setEnabled?.(false); } catch {}
      setObsStatus('disconnected', null);
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

  setObsStatus('connecting', null);
  toast(`Connecting to OBS at ${url}…`, 'info');

  try {
    try { await (rec as any).reconfigure?.({ url, password: pass }); } catch {}
    try { await (rec as any).setEnabled?.(true); } catch {}
    if (typeof (rec as any).test === 'function' && urlChanged) {
      try { await (rec as any).test(); } catch {}
    }
    setObsStatus('connected', null);
    toast('OBS: connected and ready.', 'ok');
  } catch (err: any) {
    const msg = err?.message || String(err || 'Unknown error');
    setObsStatus('error', msg);
    toast(`OBS connection failed: ${msg}`, 'error');
  }
}

export function initObsWiring(): void {
  // Bridge status → SSOT
  try {
    (rec as any).init?.({
      getUrl: () => getRecorderSettings().configs.obs.url,
      getPass: () => getRecorderSettings().configs.obs.password,
      isEnabled: () => getRecorderSettings().enabled.obs,
      onStatus: (txt: string, ok: boolean) => {
        const status = mapObsTextToStatus(txt, ok);
        setObsStatus(status, status === 'error' ? txt : null);
        if (status === 'connected') {
          toast('OBS connected.', 'ok');
        } else if (status === 'connecting') {
          toast('Connecting to OBS…', 'info');
        } else if (status === 'error') {
          toast(txt || 'OBS connection error.', 'error');
        } else if (status === 'disconnected') {
          toast('OBS disconnected.', 'warn');
        }
      },
      onRecordState: () => {},
    });
  } catch {}

  // SSOT changes → bridge
  subscribeRecorderSettings(() => {
    void applyObsStateFromSettings();
  });
}
