// Recorder registry and settings backed by central store when available.

export type RecorderAdapter = {
  id: string;
  label: string;
  isAvailable: () => Promise<boolean> | boolean;
  start: () => Promise<void> | void;
  stop: () => Promise<void> | void;
  test?: () => Promise<void> | void;
  configure?: (_cfg: any) => void;
};

export type RecorderSettings = {
  mode: 'single' | 'multi';
  selected: string[];
  configs: Record<string, any>;
  timeouts: { start: number; stop: number };
  failPolicy: 'continue' | 'abort-on-first-fail';
};

const registry = new Map<string, RecorderAdapter>();

const DEFAULTS: RecorderSettings = {
  mode: 'multi',
  selected: ['obs', 'descript'],
  configs: {
    obs: { url: 'ws://192.168.1.196:4455', password: '' },
    companion: { url: 'http://127.0.0.1:8000', buttonId: '1.1' },
    bridge: { startUrl: 'http://127.0.0.1:5723/record/start', stopUrl: '' },
    descript: { startHotkey: 'Ctrl+R', via: 'bridge' },
    capcut: { startHotkey: 'Ctrl+R', via: 'companion' },
    winmedia: { startHotkey: 'Ctrl+R', via: 'bridge' },
  },
  timeouts: { start: 3000, stop: 3000 },
  failPolicy: 'continue',
};

const LS_KEY = 'tp_rec_settings_v1';

let settings: RecorderSettings = loadSettings();

function loadSettings(): RecorderSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return { ...DEFAULTS, ...parsed } as RecorderSettings;
    } else {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(DEFAULTS));
      } catch {}
    }
  } catch {}
  return { ...DEFAULTS };
}

function persistSettings() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  } catch {}
}

// If central store available, back settings with it under key 'recSettings'
function getStore() {
  try {
    return (window as any).__tpStore;
  } catch {
    return null;
  }
}

function syncFromStore() {
  try {
    const s = getStore();
    if (!s) return;
    const v = s.get('recSettings');
    if (v && typeof v === 'object') {
      settings = { ...settings, ...v };
    }
  } catch {}
}

function writeToStore() {
  try {
    const s = getStore();
    if (s && typeof s.set === 'function') {
      s.set('recSettings', settings);
    } else persistSettings();
  } catch {
    persistSettings();
  }
}

// initial sync from store if present
syncFromStore();

export function setSettings(next: Partial<RecorderSettings>) {
  if (!next || typeof next !== 'object') return;
  const prev = settings;
  settings = {
    ...prev,
    ...( 'mode' in next ? { mode: next.mode as any } : {} ),
    ...( 'selected' in next ? { selected: Array.isArray(next.selected) ? next.selected.slice() : prev.selected } : {} ),
    ...( 'configs' in next ? { configs: { ...prev.configs, ...(next.configs || {}) } } : {} ),
    ...( 'timeouts' in next ? { timeouts: { ...prev.timeouts, ...(next.timeouts || {}) } } : {} ),
    ...( 'failPolicy' in next ? { failPolicy: next.failPolicy as any } : {} ),
  } as RecorderSettings;
  writeToStore();
  applyConfigs();
}

export function getSettings() {
  return JSON.parse(JSON.stringify(settings));
}

export function setSelected(ids: string[]) { setSettings({ selected: Array.isArray(ids) ? ids : [] }); }
export function setMode(mode: RecorderSettings['mode']) { setSettings({ mode }); }
export function setTimeouts(t: RecorderSettings['timeouts']) { setSettings({ timeouts: t }); }
export function setFailPolicy(p: RecorderSettings['failPolicy']) { setSettings({ failPolicy: p }); }

export function applyConfigs() {
  for (const [id, a] of registry.entries()) {
    try {
      const cfg = (settings as any).configs?.[id];
      if (cfg && typeof a.configure === 'function') a.configure(cfg);
    } catch {}
  }
}

function callWithTimeout<T>(promiseOrFn: Promise<T> | (() => Promise<T> | T), ms?: number) {
  const p = typeof promiseOrFn === 'function' ? (promiseOrFn() as Promise<T>) : (promiseOrFn as Promise<T>);
  return Promise.race([
    Promise.resolve().then(() => p),
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), Math.max(0, ms || 0))),
  ]);
}

let _busy = false;
async function guarded<T>(fn: () => Promise<T>) {
  if (_busy) return { skipped: true } as any;
  _busy = true;
  try {
    return await fn();
  } finally {
    _busy = false;
  }
}

function selectedIds() {
  const ids = Array.isArray(settings.selected) ? settings.selected.slice() : [];
  if (settings.mode === 'single' && ids.length > 1) ids.length = 1;
  return ids.filter((id) => registry.has(id));
}

export async function startSelected() {
  return guarded(async () => {
    applyConfigs();
    const ids = selectedIds();
    const started: string[] = [];
    const actions = ids.map((id) => ({ id, a: registry.get(id) }));
    const doStart = async ({ id, a }: any) => {
      if (!a) return { id, ok: false, error: 'missing' };
      try {
        const avail = await callWithTimeout(() => a.isAvailable(), settings.timeouts.start as number);
        if (!avail) return { id, ok: false, error: 'unavailable' };
      } catch (e) {
        return { id, ok: false, error: String((e as any)?.message || e) };
      }
      try {
        await callWithTimeout(() => a.start(), settings.timeouts.start as number);
        started.push(id);
        return { id, ok: true };
      } catch (e) {
        return { id, ok: false, error: String((e as any)?.message || e) };
      }
    };

    const results: any[] = [];
    if (settings.failPolicy === 'abort-on-first-fail') {
      for (const act of actions) {
        const r = await doStart(act);
        results.push(r);
        if (!r.ok) break;
      }
    } else {
      const rs = await Promise.all(actions.map(doStart));
      results.push(...rs);
    }
    return { results, started } as any;
  });
}

export async function stopSelected() {
  return guarded(async () => {
    const ids = selectedIds();
    const actions = ids.map((id) => ({ id, a: registry.get(id) })).filter((x) => !!x.a);
    const rs = await Promise.all(
      actions.map(async ({ id, a }) => {
        if (!a) return { id, ok: false, error: 'missing' };
        try {
          const avail = await callWithTimeout(() => a.isAvailable(), settings.timeouts.stop as number);
          if (!avail) return { id, ok: false, error: 'unavailable' };
        } catch (e) {
          return { id, ok: false, error: String((e as any)?.message || e) };
        }
        try {
          await callWithTimeout(() => a.stop(), settings.timeouts.stop as number);
          return { id, ok: true };
        } catch (e) {
          return { id, ok: false, error: String((e as any)?.message || e) };
        }
      })
    );
    return { results: rs } as any;
  });
}

export function register(adapter: RecorderAdapter) { registry.set(adapter.id, adapter); }
export function get(id: string) { return registry.get(id); }
export function all() { return [...registry.values()]; }

let _builtInsInit = false;
export async function initBuiltIns() {
  if (_builtInsInit) return;
  _builtInsInit = true;
  try {
    // If running under CI/profiled tests, skip probing/connecting external adapters
    try { if (typeof window !== 'undefined' && (window as any).__TP_SKIP_BOOT_FOR_TESTS) return; } catch {}
    const adapters: RecorderAdapter[] = [];
    try {
      const m = await import((window as any).__TP_ADDV || ((p: string) => p)('./adapters/bridge.js'));
      const a = m?.createBridgeAdapter?.();
      if (a) adapters.push(a);
    } catch {}
    try {
      const m = await import((window as any).__TP_ADDV || ((p: string) => p)('./adapters/obs'));
      const a = m?.createOBSAdapter?.();
      if (a) adapters.push(a);
    } catch {}
    try {
      if (typeof window !== 'undefined' && (window as any).__obsBridge) {
        const bridge = (window as any).__obsBridge;
        const wrapper: RecorderAdapter = {
          id: 'obs',
          label: 'OBS (WebSocket) - bridge',
          configure(cfg) { try { bridge.configure(cfg); } catch {} },
          async isAvailable() { try { return bridge.isConnected ? bridge.isConnected() : !!bridge.isConnected; } catch { return !!bridge.isConnected; } },
          async start() { return bridge.start(); },
          async stop() { return bridge.stop(); },
          async test() { return bridge.getRecordStatus(); },
        };
        adapters.push(wrapper);
      }
    } catch {}
    for (const a of adapters) {
      try { register(a); } catch {}
    }
    applyConfigs();
  } catch {}
}

try { initBuiltIns(); } catch {}

export async function start() { return startSelected(); }
export async function stop() { return stopSelected(); }

// Minimal inline bridge and recorder surface are intentionally left to the existing runtime
// implementation (compat layer in recorders.js). Consumers may use this TS registry for
// typed wiring and settings via the central store.
