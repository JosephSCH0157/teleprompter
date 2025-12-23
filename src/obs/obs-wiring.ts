import type { RecorderStatus } from '../state/recorder-settings';
import {
  DEFAULT_OBS_URL,
  getRecorderSettings,
  subscribeRecorderSettings,
  setObsStatus,
} from '../state/recorder-settings';
import * as rec from '../../recorders-bridge-compat';

function toast(msg: string, type: 'ok' | 'error' | 'warn' | 'info' = 'info'): void {
  try {
    // @ts-ignore optional global toast
    if (typeof (window as any)._toast === 'function') {
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

function readObsSettings(src?: unknown): { enabled: boolean; url: string; pass: string } {
  let state: any = src;
  if (!state) {
    try {
      state = getRecorderSettings();
    } catch {
      state = null;
    }
  }

  const hasCfg = !!state?.configs?.obs;
  if (!hasCfg) {
    try { console.warn('[obs-wiring] No OBS settings yet; using defaults'); } catch {}
  }

  const enabled = Boolean(state?.enabled?.obs);
  const url = (hasCfg && state?.configs?.obs?.url) || DEFAULT_OBS_URL;
  const pass = (hasCfg && state?.configs?.obs?.password) || '';

  return { enabled, url, pass };
}

const initial = readObsSettings();
let lastEnabled = initial.enabled;
let lastUrl = initial.url;
let lastPass = initial.pass;

async function applyObsStateFromSettings(): Promise<void> {
  const { enabled, url, pass } = readObsSettings();

  if (!enabled) {
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
  toast(`Connecting to OBS at ${url}`, 'info');

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
  // Bridge status SSOT
  try {
    (rec as any).init?.({
      getUrl: () => readObsSettings().url,
      getPass: () => readObsSettings().pass,
      isEnabled: () => readObsSettings().enabled,
      onStatus: (txt: string, ok: boolean) => {
        const status = mapObsTextToStatus(txt, ok);
        setObsStatus(status, status === 'error' ? txt : null);
        if (status === 'connected') {
          toast('OBS connected.', 'ok');
        } else if (status === 'connecting') {
          toast('Connecting to OBS', 'info');
        } else if (status === 'error') {
          toast(txt || 'OBS connection error.', 'error');
        } else if (status === 'disconnected') {
          toast('OBS disconnected.', 'warn');
        }
      },
      onRecordState: () => {},
    });
  } catch {}

  // SSOT intent changes bridge (ignore status-only updates)
  subscribeRecorderSettings((s) => {
    const { enabled, url, pass } = readObsSettings(s);
    if (enabled === lastEnabled && url === lastUrl && pass === lastPass) {
      return; // only status changed; ignore to avoid loops
    }
    lastEnabled = enabled;
    lastUrl = url;
    lastPass = pass;
    void applyObsStateFromSettings();
  });
}
