// src/core/settings-state.ts
import { DEFAULT_SETTINGS, SETTINGS_VERSION, type Settings, type SettingsEnvelope, clampSettings } from './settings-types';

const KEY = 'tp_settings';
const BCAST = 'tp-settings';
let _inited = false;
let _settings: Settings = { ...DEFAULT_SETTINGS };
const _listeners = new Set<(s: Settings, why: 'init'|'set'|'patch'|'migrate') => void>();

function readCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}
function writeCookie(name: string, val: string, days = 365): void {
  try {
    const exp = new Date(Date.now() + days * 864e5).toUTCString();
    const secure = location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${name}=${encodeURIComponent(val)}; expires=${exp}; path=/; samesite=lax${secure}`;
  } catch {}
}

function persist(s: Settings) {
  try {
    const env: SettingsEnvelope = { v: SETTINGS_VERSION, data: s };
    localStorage.setItem(KEY, JSON.stringify(env));
    writeCookie(KEY, JSON.stringify(env)); // tiny redundancy for first-paint restore
  } catch {}
}

function emit(why: 'init'|'set'|'patch'|'migrate') {
  const detail = { settings: _settings, why, ssot: true, ts: Date.now() } as const;
  try { window.dispatchEvent(new CustomEvent('tp:settings', { detail })); } catch {}
  for (const cb of _listeners) { try { cb(_settings, why); } catch {} }
}

function parseEnvelope(json: string | null): SettingsEnvelope | null {
  if (!json) return null;
  try { return JSON.parse(json) as SettingsEnvelope; } catch { return null; }
}

function migrateLegacy(): Partial<Settings> {
  // Collect scattered legacy keys → unified structure. Extend as you discover more.
  const out: Partial<Settings> = {};
  try {
    const ls = localStorage;
    if (ls.getItem('tp_theme')) out.theme = (ls.getItem('tp_theme') as any);
    if (ls.getItem('tp_font_size')) out.fontSize = Number(ls.getItem('tp_font_size'));
    if (ls.getItem('tp_line_height')) out.lineHeight = Number(ls.getItem('tp_line_height'));
    if (ls.getItem('tp_mirror')) out.mirror = ls.getItem('tp_mirror') === '1';
    if (ls.getItem('tp_colorize')) out.colorize = ls.getItem('tp_colorize') !== '0';
    if (ls.getItem('tp_hide_notes')) out.hideNotes = ls.getItem('tp_hide_notes') === '1';
    if (ls.getItem('tp_hud')) out.hud = ls.getItem('tp_hud') !== '0';
    if (ls.getItem('tp_wpm')) out.wpm = Number(ls.getItem('tp_wpm'));
    if (ls.getItem('tp_step_size')) out.stepSize = (ls.getItem('tp_step_size') as any);
    if (ls.getItem('tp_auto_start')) out.autoStart = ls.getItem('tp_auto_start') === '1';
    if (ls.getItem('tp_asr_lang')) out.asrLang = ls.getItem('tp_asr_lang') as string;
  } catch {}
  return clampSettings(out);
}

function readPersisted(): Settings {
  // Priority: LS → cookie → legacy migration → defaults
  const env = parseEnvelope(localStorage.getItem(KEY)) || parseEnvelope(readCookie(KEY));
  if (env && env.v === SETTINGS_VERSION && env.data) return { ...DEFAULT_SETTINGS, ...env.data };
  const legacy = migrateLegacy();
  return { ...DEFAULT_SETTINGS, ...legacy };
}

export function getSettings(): Settings { return _settings; }
export function onSettings(cb: (s: Settings, why: 'init'|'set'|'patch'|'migrate') => void): () => void {
  _listeners.add(cb); return () => { try { _listeners.delete(cb); } catch {} };
}

export function setSettings(next: Settings): void {
  const s = { ...DEFAULT_SETTINGS, ...clampSettings(next) } as Settings;
  if (JSON.stringify(s) === JSON.stringify(_settings)) return;
  _settings = s; persist(_settings); emit('set'); broadcast();
}
export function patchSettings(partial: Partial<Settings>): void {
  const clamped = clampSettings(partial);
  const s = { ..._settings, ...clamped } as Settings;
  if (JSON.stringify(s) === JSON.stringify(_settings)) return;
  _settings = s; persist(_settings); emit('patch'); broadcast();
}

export function initSettings(): void {
  if (_inited) return; _inited = true;
  _settings = readPersisted();
  persist(_settings); // ensure envelope/version
  emit('init');
  // Cross-window sync
  setupBroadcast();
}

// ——— Cross‑window sync
let _bc: BroadcastChannel | null = null;
function setupBroadcast() {
  try {
    _bc = new BroadcastChannel(BCAST);
    _bc.onmessage = (e) => {
      try {
        const m = e?.data;
        if (!m) return;
        if (m.type === 'tp-settings' && m.data) {
          const incoming = m.data as Settings;
          if (JSON.stringify(incoming) !== JSON.stringify(_settings)) {
            _settings = incoming; persist(_settings); emit('set');
          }
        }
      } catch {}
    };
  } catch {}
  try { window.addEventListener('storage', (e) => { if (e.key !== KEY || !e.newValue) return; const env = parseEnvelope(e.newValue); if (env && env.data && JSON.stringify(env.data) !== JSON.stringify(_settings)) { _settings = { ...DEFAULT_SETTINGS, ...env.data }; emit('set'); } }); } catch {}
}
function broadcast() { try { _bc && _bc.postMessage({ type: 'tp-settings', data: _settings }); } catch {} }

// Legacy shim for JS
try { (window as any).__tpSettings = { get: getSettings, set: setSettings, patch: patchSettings, on: onSettings }; } catch {}
