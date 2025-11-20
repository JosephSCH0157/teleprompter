/* ------------------------------------------------------------------
 * Recorder core (registry + SSOT engine)
 * ------------------------------------------------------------------ */

declare global {
  // Allow legacy globals (e.g., window.__tpHud) without sprinkling casts everywhere.
  interface Window {
    [key: string]: any;
  }
}

export interface RecorderAdapter {
  id: string;
  label: string;
  isAvailable(): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;
  test?(): Promise<unknown>;
  configure?(cfg: Record<string, unknown>): void;
}

export type RecorderMode = 'single' | 'multi';

export interface RecorderSettings {
  mode: RecorderMode;
  selected: string[];
  preferObsHandoff: boolean;
  configs: Record<string, Record<string, unknown>>;
  timeouts: { start: number; stop: number };
  failPolicy: 'continue' | 'abort-on-first-fail';
}

type RecState = 'idle' | 'starting' | 'recording' | 'stopping' | 'error';
type RecorderResult = { id: string; ok: boolean; error?: string; detail?: Record<string, unknown> };
type StartResults = { results: RecorderResult[]; started: string[]; reason?: string };
type StopResults = { results: RecorderResult[] };
interface RecStats {
  starts: number;
  retries: number;
  fallbacks: number;
  disconnects: number;
  startLat: number[];
  stopLat: number[];
}

// Simple recorder adapter registry
// Usage:
//   import { register, get, all } from './recorders.js';
//   register({ id: 'bridge', label: 'Bridge', isAvailable: async () => true, start: async ()=>{}, stop: async ()=>{} });
//   const adapter = get('bridge');
//   const list = all();

/**
 * @typedef {Object} RecorderAdapter
 * @property {string} id                       // e.g. "obs", "companion", "bridge"
 * @property {string} label                    // e.g. "OBS (WebSocket)"
 * @property {() => Promise<boolean>} isAvailable
 * @property {() => Promise<void>} start
 * @property {() => Promise<void>} stop
 * @property {() => Promise<void>} [test]      // optional “Test” button
 * @property {(cfg: any) => void} [configure]  // pass settings in
 */

function __tpReadAutoRecordPref(): boolean {
  try {
    if (typeof window !== 'undefined') {
      const store = (window as any).__tpStore;
      if (store && typeof store.get === 'function') {
        const v = store.get('autoRecord');
        if (typeof v === 'boolean') return v;
      }
    }
  } catch {}
  try {
    const doc = typeof document !== 'undefined' ? document : null;
    if (doc) {
      const el = (doc.getElementById('autoRecordToggle') as HTMLInputElement | null)
        || (doc.getElementById('autoRecord') as HTMLInputElement | null);
      if (el) return !!el.checked;
    }
  } catch {}
  try {
    return localStorage.getItem('tp_auto_record_on_start_v1') === '1';
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------
 * SSOT Recording API — window.__tpRecording
 * One call: start()/stop() routes to OBS / Bridge / Premiere
 * Reads config from either a top-level 'configs' blob or 'tp_rec_settings_v1'.
 * ------------------------------------------------------------------ */
(function(){
      try {
        if (typeof window === 'undefined') return;
        const DEFAULT_ADAPTER = 'recorder';
        const LS = {
          cfg: 'configs',                 // whole app config blob (optional)
          recAdapter: 'tp_rec_adapter',   // 'obs' | 'bridge' | 'premiere'
          autoStart: 'tp_auto_record_on_start_v1',
          modern: 'tp_rec_settings_v1',   // modern settings blob from registry (has .configs)
        };

        function getJSON<T>(k: string, d: T): T {
          try {
            const raw = localStorage.getItem(k);
            return raw ? (JSON.parse(raw) as T) : d;
          } catch {
            return d;
          }
        }
        function getCfg(){
          // Merge top-level configs with modern settings.configs
          const a = getJSON<Record<string, any>>(LS.cfg, {});
          const b = getJSON<Record<string, any>>(LS.modern, {});
          const inner = (b && b.configs) || {};
          // Top-level may also carry a recording sub-blob
          const merged = { ...inner, ...a };
          if (a && a.recording) merged.recording = a.recording;
          return merged;
        }
        function getSelectedAdapterId(){
          const cfg = getCfg();
          try {
            return (cfg.recording && cfg.recording.adapter)
              || localStorage.getItem(LS.recAdapter)
              || DEFAULT_ADAPTER;
          } catch {
            return DEFAULT_ADAPTER;
          }
        }
        function wantsAuto(){
          return __tpReadAutoRecordPref();
        }
        function getAdapter(id?: string | null){
          if (typeof id === 'string' && id.length > 0) {
            try { return get(id); } catch { return undefined; }
          }
          return getSelectedAdapterId();
        }

        async function httpSend(url: string, body?: unknown){
          if (!url) throw new Error('Missing URL');
          const res = await fetch(url, {
            method: body ? 'POST' : 'GET',
            headers: body ? { 'content-type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
            mode: 'no-cors',
          });
          // In no-cors mode, ok may be false even if delivered; consider as best-effort success
          try { return !!res.ok || true; } catch { return true; }
        }

        function bridgeCfg(){
          const cfg = getCfg().bridge || {};
          return {
            mode: cfg.mode || 'hotkey',
            baseUrl: String(cfg.baseUrl || 'http://127.0.0.1:5723').replace(/\/+$/, ''),
            startHotkey: cfg.startHotkey || cfg.preset || 'Ctrl+R',
            stopHotkey: cfg.stopHotkey || '',
            startUrl: cfg.startUrl || '',
            stopUrl: cfg.stopUrl || '',
          };
        }

        function getRecorderSurface(){
          try {
            const w = window as any;
            return w.__tpRecorder || w.__recorder || null;
          } catch {
            return null;
          }
        }

        async function recorderStart(){
          const rec = getRecorderSurface();
          if (!rec || typeof rec.start !== 'function') return true;
          try {
            await rec.start();
            return true;
          } catch (err) {
            try { console.warn('[recorder] start failed', err); } catch {}
            return false;
          }
        }

        async function recorderStop(){
          const rec = getRecorderSurface();
          if (!rec || typeof rec.stop !== 'function') return true;
          try {
            await rec.stop();
            return true;
          } catch (err) {
            try { console.warn('[recorder] stop failed', err); } catch {}
            return false;
          }
        }

        async function bridgeStart(){
          const b = bridgeCfg();
          if (b.mode === 'http') {
            return httpSend(b.startUrl);
          }
          const url = b.baseUrl + '/send?keys=' + encodeURIComponent(b.startHotkey);
          try { return await httpSend(url); }
          catch { return httpSend(b.baseUrl + '/send', { keys: b.startHotkey }); }
        }
        async function bridgeStop(){
          const b = bridgeCfg();
          if (b.mode === 'http') {
            return b.stopUrl ? httpSend(b.stopUrl) : true;
          }
          if (!b.stopHotkey) return true;
          const url = b.baseUrl + '/send?keys=' + encodeURIComponent(b.stopHotkey);
          try { return await httpSend(url); }
          catch { return httpSend(b.baseUrl + '/send', { keys: b.stopHotkey }); }
        }

        async function obsStart(){
          try {
            if (window.__obsBridge && typeof window.__obsBridge.start === 'function') {
              await window.__obsBridge.start();
              return true;
            }
          } catch {}
          try {
            if (window.__tpObs && typeof window.__tpObs.ensureRecording === 'function') {
              return !!(await window.__tpObs.ensureRecording(true));
            }
          } catch {}
          return false;
        }
        async function obsStop(){
          try {
            if (window.__obsBridge && typeof window.__obsBridge.stop === 'function') {
              await window.__obsBridge.stop();
              return true;
            }
          } catch {}
          try {
            if (window.__tpObs && typeof window.__tpObs.ensureRecording === 'function') {
              return !!(await window.__tpObs.ensureRecording(false));
            }
          } catch {}
          return false;
        }

        async function premStart(){
          // Use the same hotkey bridge pattern as Premiere Hotkey adapter UI
          const p = getCfg().premiere || {};
          const base = String(p.baseUrl || 'http://127.0.0.1:5723').replace(/\/+$/, '');
          const hk = String(p.startHotkey || 'Ctrl+R');
          const url = base + '/send?keys=' + encodeURIComponent(hk);
          try { return await httpSend(url); }
          catch { return httpSend(base + '/send', { keys: hk }); }
        }
        async function premStop(){
          const p = getCfg().premiere || {};
          const base = String(p.baseUrl || 'http://127.0.0.1:5723').replace(/\/+$/, '');
          const hk = String(p.stopHotkey || '');
          if (!hk) return true;
          const url = base + '/send?keys=' + encodeURIComponent(hk);
          try { return await httpSend(url); }
          catch { return httpSend(base + '/send', { keys: hk }); }
        }

        async function start(){
          const a = getSelectedAdapterId();
          try { window.__tpHud?.log?.('[rec]', 'start', a); } catch {}
          if (a === 'recorder') return recorderStart();
          if (a === 'obs') return obsStart();
          if (a === 'descript') return premStart();
          if (a === 'premiere') return premStart();
          return bridgeStart();
        }
        async function stop(){
          const a = getSelectedAdapterId();
          try { window.__tpHud?.log?.('[rec]', 'stop', a); } catch {}
          if (a === 'recorder') return recorderStop();
          if (a === 'obs') return obsStop();
          if (a === 'descript') return premStop();
          if (a === 'premiere') return premStop();
          return bridgeStop();
        }

        window.__tpRecording = { start, stop, wantsAuto, getAdapter };
      } catch {}
  })();

const registry = new Map<string, RecorderAdapter>(); // id -> adapter

// Settings and orchestration
const LS_KEY = 'tp_rec_settings_v1';

/**
 * @typedef {Object} RecorderSettings
 * @property {('single'|'multi')} mode
 * @property {string[]} selected
 * @property {Record<string, any>} configs
 * @property {{ start: number, stop: number }} timeouts
 * @property {('continue'|'abort-on-first-fail')} failPolicy
 */

const defaultSettings: RecorderSettings = {
  mode: 'multi',
  selected: ['obs', 'descript'],
  preferObsHandoff: false,
  configs: {
    obs: { url: 'ws://192.168.1.200:4455', password: '' },
    companion: { url: 'http://127.0.0.1:8000', buttonId: '1.1' },
    bridge: { startUrl: 'http://127.0.0.1:5723/record/start', stopUrl: '' },
    descript: { startHotkey: 'Ctrl+R', via: 'bridge' },
    capcut: { startHotkey: 'Ctrl+R', via: 'companion' },
    winmedia: { startHotkey: 'Ctrl+R', via: 'bridge' },
    premiere: { startHotkey: 'Ctrl+R', stopHotkey: '', baseUrl: 'http://127.0.0.1:5723' },
  },
  timeouts: { start: 3000, stop: 3000 },
  failPolicy: 'continue',
};

let settings: RecorderSettings = JSON.parse(JSON.stringify(defaultSettings));

// Load saved settings if available
try {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') settings = { ...settings, ...parsed };
  } else {
    // First run: persist the defaults exactly once so future merges have a stored baseline
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(settings));
    } catch {}
  }
} catch {}

function persistSettings() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
    // Legacy mirrors so old code paths remain consistent
    try { localStorage.setItem('tp_record_mode', String(settings.mode || 'multi')); } catch {}
    try { localStorage.setItem('tp_adapters', JSON.stringify(Array.isArray(settings.selected) ? settings.selected : [])); } catch {}
  } catch {}
}

/**
 * Update settings; shallow-merge known keys.
 */
export function setSettings(next: Partial<RecorderSettings> | null | undefined) {
  if (!next || typeof next !== 'object') return;
  const prev = settings;
  settings = {
    ...prev,
    ...('mode' in next ? { mode: next.mode } : {}),
    ...('selected' in next
      ? { selected: Array.isArray(next.selected) ? next.selected.slice() : prev.selected }
      : {}),
    ...('preferObsHandoff' in next ? { preferObsHandoff: !!next.preferObsHandoff } : {}),
    ...('configs' in next ? { configs: { ...prev.configs, ...(next.configs || {}) } } : {}),
    ...('timeouts' in next ? { timeouts: { ...prev.timeouts, ...(next.timeouts || {}) } } : {}),
    ...('failPolicy' in next ? { failPolicy: next.failPolicy } : {}),
  };
  persistSettings();
  applyConfigs();
}

export function getSettings(): RecorderSettings {
  return JSON.parse(JSON.stringify(settings));
}

export function setSelected(ids: string[] | null | undefined) {
  setSettings({ selected: Array.isArray(ids) ? ids : [] });
}
export function setMode(mode: RecorderMode | undefined) {
  setSettings({ mode });
}
export function setTimeouts(t: RecorderSettings['timeouts']) {
  setSettings({ timeouts: t });
}
export function setFailPolicy(p: RecorderSettings['failPolicy']) {
  setSettings({ failPolicy: p });
}

/** Apply per-adapter configuration objects via adapter.configure(cfg) when present. */
export function applyConfigs() {
  for (const [id, a] of registry.entries()) {
    try {
      const cfg = settings.configs[id];
      if (cfg && typeof a.configure === 'function') a.configure(cfg);
    } catch {}
  }
}

function callWithTimeout<T>(promiseOrFn: (() => Promise<T>) | Promise<T>, ms = 0) {
  const p = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;
  return Promise.race([
    Promise.resolve().then(() => p),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), Math.max(0, ms || 0))),
  ]);
}

let _busy = false;
async function guarded<T>(fn: () => Promise<T>): Promise<T | { skipped: true }> {
  if (_busy) return { skipped: true } as const;
  _busy = true;
  try {
    return await fn();
  } finally {
    _busy = false;
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error && typeof err.message === 'string') return err.message;
  try { return String(err); } catch { return 'error'; }
}

// ------------------------------------------------------------------
// Central recording state machine + bus events (single source of truth)
// States: 'idle' | 'starting' | 'recording' | 'stopping' | 'error'
// ------------------------------------------------------------------
let _recState: RecState = 'idle';
let _recDetail: Record<string, unknown> | null = null;
let _recAdapter: string | null = null; // last chosen primary adapter when in single mode
// Epoch used to invalidate in-flight start attempts when a stop/cancel occurs
let __recEpoch = 0;
// Hotkey flood guard for Bridge taps
let __lastBridgeTap = 0;

// ---- test/teardown plumbing ----
const __recTimers = new Set<ReturnType<typeof setTimeout>>();
/** trackable timeout */
export function setTrackedTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
  const h = setTimeout(() => {
    try { __recTimers.delete(h); } catch {}
    try { fn(); } catch {}
  }, Math.max(0, ms || 0));
  try { __recTimers.add(h); } catch {}
  return h;
}
type ObsListener = (() => Promise<void>) | (() => void) | null;
let _onObsDisconnectCb: ObsListener = null;
let _onObsRecordingStartedCb: ObsListener = null;

// Small time helpers
// NOTE: All recorder timers MUST use setTrackedTimeout (or register/unref) so tests can teardown cleanly.
const __now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const __sleep = (ms: number) => new Promise<void>((resolve) => {
  setTrackedTimeout(() => resolve(), Math.max(0, ms || 0));
});

let __lastRecKey = '';
function _emitRecState(state: RecState, detail: Record<string, unknown> | null = null) {
  try {
    _recState = state;
    _recDetail = detail || null;
    if (typeof window !== 'undefined') {
      try { window.__recState = { state, adapter: _recAdapter, detail: _recDetail, ts: Date.now() }; } catch {}
      const payload = { adapter: _recAdapter, state, detail: _recDetail };
      // distinct-until-changed to reduce HUD/UI spam
      try {
        const key = String(payload.adapter||'') + '|' + String(payload.state||'') + '|' + (payload.detail && payload.detail.fallback ? 'F' : '');
        if (key === __lastRecKey) return;
        __lastRecKey = key;
      } catch {}
      window.dispatchEvent(new CustomEvent('rec:state', { detail: payload }));
      try { window.__tpHud?.log?.('[rec:state]', payload); } catch {}
    }
  } catch {}
}

function _isActiveState(s: RecState){ return s === 'starting' || s === 'recording'; }

export function getRecState(){ return { state: _recState, adapter: _recAdapter, detail: _recDetail }; }

// Global guard: skip starting any recorders in Rehearsal mode
function isNoRecordMode() {
  try {
    return !!(window.__tpNoRecord || (typeof document !== 'undefined' && document.body && document.body.classList && document.body.classList.contains('mode-rehearsal')));
  } catch { return false; }
}

function selectedIds(): string[] {
  const ids = Array.isArray(settings.selected) ? settings.selected.slice() : [];
  if (settings.mode === 'single' && ids.length > 1) ids.length = 1;
  return ids.filter((id) => registry.has(id));
}

// --------------------------------------------------------------
// OBS handoff watchdog: detect late OBS start while Bridge is active
// and optionally hand off mid-run when preferObsHandoff is true.
// --------------------------------------------------------------
let __handoffTimer: ReturnType<typeof setInterval> | null = null;
export function clearHandoffTimer(){ try { if (__handoffTimer) { clearInterval(__handoffTimer); __handoffTimer = null; } } catch {} }
async function tryObsHandoffOnce(reason = 'watchdog'){
  try {
    if (!settings?.preferObsHandoff) return false;
    if (_recState !== 'recording' || _recAdapter !== 'bridge') return false;
    const br = (typeof window !== 'undefined') ? (window.__obsBridge || null) : null;
    if (!br || typeof br.getRecordStatus !== 'function') return false;
    let isRec = false; try { const s = await br.getRecordStatus(); isRec = !!(s && (s.outputActive === true || s.recording === true)); } catch {}
    if (!isRec) return false;
    const bridgeAdapter = registry.get('bridge');
    _emitRecState('stopping', { reason: 'obs-handoff', via: reason });
    try { await bridgeAdapter?.stop?.(); } catch {}
    _recAdapter = 'obs';
    _emitRecState('recording', { handoff: true });
    clearHandoffTimer();
    return true;
  } catch { return false; }
}
function armObsHandoffWatchdog(){
  clearHandoffTimer();
  try {
    if (!settings?.preferObsHandoff) return;
    if (_recState === 'recording' && _recAdapter === 'bridge') {
      const t = setInterval(() => { tryObsHandoffOnce('watchdog'); }, 1000);
      try {
        const maybeTimer: any = t;
        if (maybeTimer && typeof maybeTimer.unref === 'function') maybeTimer.unref();
      } catch {}
      __handoffTimer = t;
    }
  } catch {}
}

// --- test-only helper (safe no-op in prod) ---
try {
  if (typeof window !== 'undefined') {
    window.__recorder = window.__recorder || {};
    if (!window.__recorder.__finalizeForTests) {
      window.__recorder.__finalizeForTests = () => {
        try { clearHandoffTimer(); } catch {}
        try { __recEpoch++; } catch {}
        try { if (__recStatsTimer) { clearInterval(__recStatsTimer); __recStatsTimer = null; } } catch {}
      };
    }
  }
} catch {}

// Exposed teardown for tests: clears timers and OBS listeners
export async function teardownRecorders(){
  try { __recEpoch++; } catch {}
  try { __lastBridgeTap = 0; } catch {}
  // Clear tracked timeouts
  try { for (const h of Array.from(__recTimers)) { clearTimeout(h); __recTimers.delete(h); } } catch {}
  // Clear periodic timers
  try { clearHandoffTimer(); } catch {}
  try { if (__recStatsTimer) { clearInterval(__recStatsTimer); __recStatsTimer = null; } } catch {}
  // Unbind OBS listeners if bridge supports off/removeListener
  try {
    const br = (typeof window !== 'undefined') ? window.__obsBridge : null;
    if (br) {
      if (typeof br.off === 'function') {
        try { if (_onObsDisconnectCb && window.__tpObsDisconnectWired) { br.off('disconnect', _onObsDisconnectCb); window.__tpObsDisconnectWired = false; } } catch {}
        try { if (_onObsRecordingStartedCb && window.__tpObsHandoffWired) { br.off('recordingStarted', _onObsRecordingStartedCb); window.__tpObsHandoffWired = false; } } catch {}
      } else if (typeof br.removeListener === 'function') {
        try { if (_onObsDisconnectCb && window.__tpObsDisconnectWired) { br.removeListener('disconnect', _onObsDisconnectCb); window.__tpObsDisconnectWired = false; } } catch {}
        try { if (_onObsRecordingStartedCb && window.__tpObsHandoffWired) { br.removeListener('recordingStarted', _onObsRecordingStartedCb); window.__tpObsHandoffWired = false; } } catch {}
      }
    }
  } catch {}
}

interface StartObsOptions {
  timeoutMs?: number;
  retryDelayMs?: number;
}

// --- OBS start with confirm + retry + bridge fallback (self-contained) -----
async function startObsWithConfirm({ timeoutMs = 1200, retryDelayMs = 500 }: StartObsOptions = {}) {
  const obs = (typeof window !== 'undefined') ? (window.__obsBridge || null) : null;
  const bridgeAdapter = registry.get('bridge');
  // Capture generation to guard against late completions after stop/cancel
  const epoch = __recEpoch;
  const isStale = () => epoch !== __recEpoch;
  try { window.__tpHud?.log?.('[rec] start obs'); } catch {}
  // Announce obs starting explicitly
  try { _recAdapter = 'obs'; _emitRecState('starting'); } catch {}

  let fallbackSent = false;
  const maybeTapBridge = async () => {
    const t = __now();
    if (t - __lastBridgeTap < 1200) return false;
    __lastBridgeTap = t;
    try { await bridgeAdapter?.start?.(); } catch {}
    return true;
  };
  const confirm = async () => {
    try {
      const s = await obs?.getRecordStatus?.();
      return !!(s && (s.outputActive === true));
    } catch { return false; }
  };
  const tryStart = async () => {
    try { if (obs && typeof obs.start === 'function') await obs.start(); else if (obs && typeof obs.startRecord === 'function') await obs.startRecord(); } catch {}
  };

  await tryStart();

  // poll until timeout
  let ok = false; let deadline = __now() + timeoutMs;
  while (!ok && __now() < deadline) {
    if (isStale()) { try { window.__tpHud?.log?.('[rec] abort confirm (stale)'); } catch {} return { ok:false, adapter:'obs', error:'stale' }; }
    ok = await confirm();
    if (!ok) await __sleep(120);
  }

  if (!ok) {
    try { window.__tpHud?.log?.('[rec] retry'); } catch {}
    await __sleep(Math.max(0, retryDelayMs));
    if (isStale()) { try { window.__tpHud?.log?.('[rec] abort retry (stale)'); } catch {} return { ok:false, adapter:'obs', error:'stale' }; }
    await tryStart();
    try { recStats.retries++; } catch {}
    ok = await confirm();
  }

  if (ok) {
    try { _recAdapter = 'obs'; _emitRecState('recording'); } catch {}
    return { ok: true, adapter: 'obs' };
  }

  // fallback to Bridge (once)
  const isBridgeAvailable = !!bridgeAdapter;
  if (!fallbackSent && isBridgeAvailable) {
    fallbackSent = true;
    if (isStale()) { try { window.__tpHud?.log?.('[rec] abort fallback (stale)'); } catch {} return { ok:false, adapter:'obs', error:'stale' }; }
    // flood guard on fallback taps
    await maybeTapBridge();
    // stop() might have landed while we were tapping; bail if so
    if (isStale()) { try { window.__tpHud?.log?.('[rec] abort fallback (stale-2)'); } catch {} return { ok:false, adapter:'obs', error:'stale' }; }
    try { window.__tpHud?.log?.('[rec] fallback bridge'); } catch {}
    try { _recAdapter = 'bridge'; _emitRecState('recording', { fallback: true }); } catch {}
    try { recStats.fallbacks++; } catch {}
    return { ok: true, adapter: 'bridge', fallback: true };
  }

  try { window.__tpHud?.log?.('[rec] drop (start-timeout)'); } catch {}
  try { _recAdapter = 'obs'; _emitRecState('error', { reason: 'start-timeout' }); } catch {}
  return { ok: false, adapter: 'obs', error: 'start-timeout' };
}

/** Start selected recorders based on settings (respects mode, timeouts, failPolicy). */
export async function startSelected(): Promise<StartResults | { skipped: true }> {
  return guarded<StartResults>(async () => {
    if (isNoRecordMode()) {
      try { window.HUD?.log?.('rehearsal', { skip: 'startSelected (no-record)' }); } catch {}
      return { results: [], started: [] };
    }
    // Explicitly block new starts while stopping teardown runs
    if (_recState === 'stopping') {
      try { window.__tpHud?.log?.('[rec] busy (stopping)'); } catch {}
      return { results: [], started: [], reason: 'idempotent-start-while-stopping' };
    }
    // Idempotent: already starting/recording → treat as success
    if (_isActiveState(_recState)) {
      try { window.__tpHud?.log?.('[rec] already recording'); } catch {}
      _emitRecState(_recState, { reason: 'idempotent-start' });
      return { results: [], started: selectedIds() };
    }
    applyConfigs();
    // Make sure OBS signals are wired even if __obsBridge attached late
    try { ensureObsDisconnectFallback(); } catch {}
    try { ensureObsRecordingStartedHandoff(); } catch {}
    const ids = selectedIds();
    // Track primary adapter (first selected in single mode or the first in list)
    _recAdapter = settings.mode === 'single' ? (ids[0] || null) : (ids[0] || null);
  _emitRecState('starting');
    const t0 = __now();
    try { recStats.starts++; } catch {}
    const started: string[] = [];
    type StartAction = { id: string; a: RecorderAdapter | undefined };
    const actions: StartAction[] = ids.map((id) => ({ id, a: registry.get(id) }));
    const doStart = async ({ id, a }: StartAction): Promise<RecorderResult> => {
      if (!a) return { id, ok: false, error: 'missing' };
      try {
        const avail = await callWithTimeout(() => a.isAvailable(), settings.timeouts.start);
        if (!avail) return { id, ok: false, error: 'unavailable' };
      } catch (e) {
        return { id, ok: false, error: describeError(e) };
      }
      try {
        if (id === 'obs') {
          const res = await startObsWithConfirm({ timeoutMs: Math.min(2000, settings.timeouts.start || 1500), retryDelayMs: 500 });
          if (res && res.ok === false && res.error === 'stale') { return { id, ok: false, error: 'stale' }; }
          if (res && res.ok && res.adapter === 'bridge' && res.fallback) { /* handled downstream */ }
          if (res.ok) { started.push(id); return { id, ok: true, detail: res }; }
          return { id, ok: false, error: res.error || 'failed' };
        } else {
          await callWithTimeout(() => a.start(), settings.timeouts.start);
          started.push(id);
          return { id, ok: true };
        }
      } catch (e) {
        return { id, ok: false, error: describeError(e) };
      }
    };

    const results: RecorderResult[] = [];
    if (settings.failPolicy === 'abort-on-first-fail') {
      // Serial, abort early
      for (const act of actions) {
        const r = await doStart(act);
        results.push(r);
        if (!r.ok) break;
      }
    } else {
      // Parallel, continue on failure
      const rs = await Promise.all(actions.map(doStart));
      results.push(...rs);
    }
    if (started.length) {
      try { window.__tpHud?.log?.('[rec] recording'); } catch {}
      // If OBS fell back to Bridge, reflect that as the active adapter with fallback detail
      const anyFallback = results.find(r => r && r.id === 'obs' && r.detail && r.detail.fallback);
      if (anyFallback) {
        _recAdapter = 'bridge';
        _emitRecState('recording', { fallback: true, via: 'bridge' });
      } else {
        _emitRecState('recording');
      }
      try { recStats.startLat.push(Math.max(0, __now() - t0)); } catch {}
    } else {
      _emitRecState('error', { results });
    }
    return { results, started };
  });
}

/** Stop selected recorders (parallel, timeout per adapter).
 * Important: stop must preempt an in-flight start; do NOT gate with the global busy lock.
 */
export async function stopSelected(): Promise<StopResults> {
  // Bump epoch immediately to cancel any in-flight confirm/retry/fallback paths
  __recEpoch++;
  // Reset Bridge tap flood guard so a fresh start can tap promptly after a stop
  __lastBridgeTap = 0;
  // Stop any handoff watchdog
  clearHandoffTimer();
  // Allow stop to proceed even in no-record mode (safe cleanup)
  if (isNoRecordMode()) {
    try { window.HUD?.log?.('rehearsal', { note: 'stopSelected (allowed during no-record)' }); } catch {}
  }
  // Idempotent: if already idle/stopping, treat as success
  if (_recState === 'idle' || _recState === 'stopping') {
    _emitRecState('idle', { reason: 'idempotent-stop' });
    return { results: [] };
  }
  try { window.__tpHud?.log?.('[rec] stop'); } catch {}
  _emitRecState('stopping');
  const t0 = __now();
  const ids = selectedIds();
  type StopAction = { id: string; a: RecorderAdapter };
  const actions: StopAction[] = ids
    .map((id) => ({ id, a: registry.get(id) }))
    .filter((x): x is StopAction => !!x.a);
  const rs: RecorderResult[] = await Promise.all(
    actions.map(async ({ id, a }) => {
      try {
        const avail = await callWithTimeout(() => a.isAvailable(), settings.timeouts.stop);
        if (!avail) return { id, ok: false, error: 'unavailable' };
      } catch (e) {
        return { id, ok: false, error: describeError(e) };
      }
      try {
        await callWithTimeout(() => a.stop(), settings.timeouts.stop);
        return { id, ok: true };
      } catch (e) {
        return { id, ok: false, error: describeError(e) };
      }
    })
  );
  _emitRecState('idle');
  try { recStats.stopLat.push(Math.max(0, __now() - t0)); } catch {}
  return { results: rs };
}

/**
 * Register or replace a recorder adapter by id.
 * @param {RecorderAdapter} adapter
 */
export function register(adapter: RecorderAdapter) {
  registry.set(adapter.id, adapter);
}

/**
 * Get a recorder adapter by id.
 * @param {string} id
 * @returns {RecorderAdapter | undefined}
 */
export function get(id: string): RecorderAdapter | undefined {
  return registry.get(id);
}

/**
 * List all registered adapters in insertion order.
 * @returns {RecorderAdapter[]}
 */
export function all(): RecorderAdapter[] {
  return [...registry.values()];
}

// --- Built-in adapters (OBS, Bridge) registration ---
let _builtInsInit = false;
export async function initBuiltIns(): Promise<void> {
  if (_builtInsInit) return;
  _builtInsInit = true;
  try {
    // Attempt to load and register built-in adapters. Each is optional.
    const adapters: RecorderAdapter[] = [];
    const resolver: (path: string) => string = (typeof window !== 'undefined' && typeof window.__TP_ADDV === 'function')
      ? window.__TP_ADDV.bind(window)
      : ((p: string) => p);
    try {
      const m = await import(resolver('./adapters/bridge.js'));
      const a = m?.createBridgeAdapter?.();
      if (a) adapters.push(a);
    } catch {}
    try {
      const m = await import(resolver('./adapters/obs.js'));
      const a = m?.createOBSAdapter?.();
      if (a) adapters.push(a);
    } catch {}
    try {
      const m = await import(resolver('./adapters/hotkey.js'));
      const aPrem = m?.createHotkeyAdapter?.('premiere', 'Adobe Premiere Pro');
      if (aPrem) adapters.push(aPrem);
    } catch {}
    try {
      // If obsBridge exists, register a thin adapter that delegates to it. This keeps
      // backwards compatibility for code that expects an adapter with id 'obs'.
      if (typeof window !== 'undefined' && window.__obsBridge) {
        const bridge = window.__obsBridge;
        const wrapper = {
          id: 'obs',
          label: 'OBS (WebSocket) - bridge',
          configure(cfg: Record<string, unknown>) {
            try {
              bridge.configure(cfg);
            } catch {}
          },
          async isAvailable() {
            try {
              return bridge.isConnected
                ? bridge.isConnected()
                : bridge.isConnected && bridge.isConnected();
            } catch {
              return !!bridge.isConnected && bridge.isConnected();
            }
          },
          async start() {
            return bridge.start();
          },
          async stop() {
            return bridge.stop();
          },
          async test() {
            return bridge.getRecordStatus();
          },
        };
        adapters.push(wrapper);
      }
    } catch {}
    for (const a of adapters) {
      try {
        register(a);
      } catch {}
    }
    applyConfigs();
    // Late-bind OBS events if bridge appeared during adapter init
    try { ensureObsDisconnectFallback(); } catch {}
    try { ensureObsRecordingStartedHandoff(); } catch {}
  } catch {}
}

// Fire-and-forget initialization on module load (safe if ignored)
try {
  initBuiltIns();
} catch {}

// Ensure OBS disconnect → fallback guard (bind once, late-safe)
function ensureObsDisconnectFallback(){
  try {
    if (typeof window === 'undefined') return;
    const br = window.__obsBridge;
    if (!br || typeof br.on !== 'function') return;
    if (window.__tpObsDisconnectWired) return; window.__tpObsDisconnectWired = true;
    _onObsDisconnectCb = async () => {
      try {
        const state = _recState;
        const bridgeAdapter = registry.get('bridge');
        const isAuto = __tpReadAutoRecordPref();
        try { recStats.disconnects++; } catch {}
        if (state === 'starting') {
          await startObsWithConfirm({ timeoutMs: 900, retryDelayMs: 300 });
          return;
        }
        if (state === 'recording') {
          _emitRecState('stopping', { reason: 'disconnect' });
          if (isAuto && bridgeAdapter) {
            try { await bridgeAdapter.start?.(); } catch {}
            try { window.dispatchEvent(new CustomEvent('rec:state', { detail: { adapter: 'bridge', state: 'recording', detail: { fallback: true, reason: 'obs-disconnect' } } })); } catch {}
          } else {
            _emitRecState('idle', { reason: 'disconnect' });
          }
        }
      } catch {}
    };
    br.on('disconnect', _onObsDisconnectCb);
  } catch {}
}

// Wire a small listener to auto-arm/clear handoff watchdog on state changes
(function wireRecStateWatchdog(){
  try {
    if (typeof window === 'undefined') return;
    if (window.__tpRecWatchdogWired) return; window.__tpRecWatchdogWired = true;
    window.addEventListener('rec:state', (e) => {
      try {
        const evt = e as CustomEvent<Record<string, unknown>>;
        const d = (evt && evt.detail) || {};
        if (d && d.state === 'recording' && d.adapter === 'bridge' && settings?.preferObsHandoff) {
          armObsHandoffWatchdog();
        }
        if (d && (d.state === 'idle' || d.state === 'stopping')) {
          clearHandoffTimer();
        }
      } catch {}
    });
  } catch {}
})();

// Ensure OBS recordingStarted → optional handoff from Bridge (bind once, late-safe)
function ensureObsRecordingStartedHandoff(){
  try {
    if (typeof window === 'undefined') return;
    const br = window.__obsBridge;
    if (!br || typeof br.on !== 'function') return;
    if (window.__tpObsHandoffWired) return; window.__tpObsHandoffWired = true;
    _onObsRecordingStartedCb = async () => {
      try {
        const prefer = !!(settings && settings.preferObsHandoff);
        if (_recState === 'recording' && _recAdapter === 'bridge') {
          if (!prefer) {
            try { window.__tpHud?.log?.('[rec] obs up (handoff disabled)'); } catch {}
            return;
          }
          const bridgeAdapter = registry.get('bridge');
          _emitRecState('stopping', { reason: 'obs-handoff' });
          try { await bridgeAdapter?.stop?.(); } catch {}
          _recAdapter = 'obs';
          _emitRecState('recording', { handoff: true });
        }
      } catch {}
    };
    br.on('recordingStarted', _onObsRecordingStartedCb);
  } catch {}
}

// Simple aliases for consumers that prefer start/stop terminology
export async function start() {
  return startSelected();
}
export async function stop() {
  return stopSelected();
}

// --------------------------------------------------------------
// Lightweight recorder telemetry (rec:stats)
// --------------------------------------------------------------
const recStats: RecStats = { starts: 0, retries: 0, fallbacks: 0, disconnects: 0, startLat: [], stopLat: [] };
function p95(arr: number[]){
  if (!arr || !arr.length) return 0;
  const a = arr.slice().sort((x,y)=>x-y);
  const i = Math.min(a.length-1, Math.floor(a.length*0.95));
  return a[i] || 0;
}
function emitRecStats(_final=false){
  try {
    const payload = {
      starts: recStats.starts|0,
      retries: recStats.retries|0,
      fallbacks: recStats.fallbacks|0,
      disconnects: recStats.disconnects|0,
      startP95Ms: Math.round(p95(recStats.startLat)),
      stopP95Ms: Math.round(p95(recStats.stopLat)),
    };
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rec:stats', { detail: payload }));
    }
  } catch {}
  // no further work when final; kept for clarity without early return
}
let __recStatsTimer: ReturnType<typeof setInterval> | null = null;
try {
  if (typeof window !== 'undefined') {
    if (__recStatsTimer) clearInterval(__recStatsTimer);
    __recStatsTimer = setInterval(()=>emitRecStats(false), 5000);
    try {
      const maybeTimer: any = __recStatsTimer;
      if (maybeTimer && typeof maybeTimer.unref === 'function') maybeTimer.unref();
    } catch {}
    window.addEventListener('beforeunload', () => emitRecStats(true));
  }
} catch {}

// --- Compatibility recorder surface used by the app ---
// Provides a small surface with idempotent lifecycle and status events.

