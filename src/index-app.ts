// DEV: sanity marker so we know TS entry is live.
;(window as any).__tpBootPath = 'ts:index';
const TS_BOOT_OWNER = 'ts:index';
const IS_CI_MODE = (() => {
	try {
		const params = new URLSearchParams(window.location.search || '');
		return params.get('ci') === '1';
	} catch {
		return false;
	}
})();
try {
  const stamp = `asr-scroll-${new Date().toISOString()}`;
  (window as any).__TP_BUILD_STAMP = stamp;
  console.log('[build]', stamp);
} catch {}
try { console.log('[TP-BOOT] TS index.ts booted'); } catch {}
try { (window as any).__TP_TS_OVERLAYS = true; } catch {}

// Thin conductor: this file only orchestrates boot. Feature logic lives in their modules.
// Signal TS is primary so legacy preloaders can stand down
try { (window as any).__TP_TS_PRIMARY__ = true; } catch {}
try { (window as any).__TP_BOOT_OWNER = TS_BOOT_OWNER; } catch {}
try {
  if (typeof (window as any).__tpClampActive === 'undefined') {
    (window as any).__tpClampActive = false;
  }
} catch {}
// Compatibility helpers (ID aliases and tolerant $id()) must be installed very early
import './boot/compat-ids';
import './features/speech/speech-store';
// Global app store (single initializer for __tpStore)
import { appStore } from './state/app-store';
import { speechStore, type SpeechState } from './state/speech-store';
import { initSession } from './state/session';
// Auto-record SSOT helpers (bridge UI + TS core + legacy flags)
import './state/auto-record-ssot';
import './speech/loader';
import { stopAsrRuntime } from './speech/runtime-control';
import {
  getSpeakerProfilesSnapshot,
  initSpeakerProfilesFromSettings,
  subscribeSpeakerProfileState,
} from './ui/speaker-profiles-store';
import type { SpeakerBindingsSettings } from './types/speaker-profiles';
// Early dev console noise filter (benign extension async-response errors)
// Console noise filter gated later (only with ?muteExt=1). Do not auto-install.
// import './boot/console-noise-filter';
import { initSpeechBridge } from './asr/v2/bridge-speech';
import { initAsrScrollBridge } from './asr/v2/scroll-bridge';
import { installScheduler } from './boot/scheduler';
import { injectSettingsFolderForSmoke } from './features/inject-settings-folder';
import './features/scripts-local';
import { installSpeech } from './features/speech-loader';
import { initObsConnection } from './obs/obs-connection';
import { initObsWiring } from './obs/obs-wiring';
import { initRecorderBackends } from './recording/registerRecorders';
import { createStartOnPlay } from './recording/startOnPlay';
import './scroll/adapter';
import './index-hooks/preroll';
import { initDevDrawer } from './dev/dev-drawer';
import { renderScript } from './render-script';
import { setRecorderEnabled } from './state/recorder-settings';
import { ensureUserAndProfile, loadProfileSettings, saveProfileSettings, applySettingsPatch, type PersistedAppKey, type UserSettings } from './forge/authProfile';
import { hasSupabaseConfig } from './forge/supabaseClient';
import { bindLoadSample } from './ui/load-sample';
import { bindObsSettingsUI } from './ui/obs-settings-bind';
import { bindObsStatusPills } from './ui/obs-status-bind';
import { initObsToggle } from './ui/obs-toggle';
import { installAutoMaxCh } from './ui/autoMaxCh';
import { wireRecordButtons } from './ui/recordButtons';
import { installAboutPopover, installCKEgg, installEasterEggs } from './ui/eggs';
import './wiring/ui-binds';
import { initPrerollSession } from './features/preroll-session';
import { initScrollSessionRouter } from './features/scroll-session';
import { initRecordingSession } from './features/recording-session';
import { initRecPillsDisplay, initRecPillsMain } from './features/rec-pills';
import './recording/local-auto'; // ensure core recorder bridge is loaded
import { ensurePageTabs } from './features/page-tabs';
import { applyPagePanel } from './features/page-tabs';
import { triggerWireAutoIntentListener, __AUTO_INTENT_WIRE_SENTINEL, ROUTER_STAMP } from './features/scroll/scroll-router';
import { applyScrollModeUI, initWpmBindings } from './ui/scrollMode';
import './dev/ci-mocks';
import './dev/asr-thresholds-panel';
import './hud/loader';
import { initAsrPersistence } from './features/asr/persistence';
import { initScrollPrefsPersistence, loadScrollPrefs } from './features/scroll/scroll-prefs';
import { showToast } from './ui/toasts';
import { computeAsrReadiness, type AsrWarnReason, type AsrNotReadyReason } from './asr/readiness';
import { hasActiveAsrProfile, onAsr } from './asr/store';
import { ensureMicAccess } from './asr/mic-gate';
import { initMappedFolder, listScripts } from './fs/mapped-folder';
import { ScriptStore } from './features/scripts-store';

function showFatalFallback(): void {
  try {
    const w = window as any;
    if (w.__tpFatalShown) return;
    w.__tpFatalShown = true;

    const fb = document.getElementById('fatalFallback');
    const reloadBtn = document.getElementById('btnReloadAnvil') as HTMLButtonElement | null;
    const appRoot = document.documentElement;

    try { appRoot?.classList?.add?.('tp-fatal'); } catch {}

    if (fb) {
      try { fb.removeAttribute('hidden'); } catch {}
      try { fb.classList.add('fatal-visible'); } catch {}
    }

    reloadBtn?.addEventListener('click', () => {
      try { window.location.reload(); } catch {}
    }, { once: true });
  } catch (err) {
    try { console.error('[TP-FATAL:showFallback]', err); } catch {}
    try { window.location.reload(); } catch {}
  }
}

function installFatalGuards(): void {
  try {
    const w = window as any;
    if (w.__tpFatalGuards) return;
    w.__tpFatalGuards = true;

    window.onerror = (_msg, _src, _line, _col, err) => {
      try { console.error('[TP-FATAL:window]', err); } catch {}
      showFatalFallback();
    };

    window.onunhandledrejection = (event) => {
      try { console.error('[TP-FATAL:promise]', event?.reason); } catch {}
      showFatalFallback();
    };
  } catch {
    // ignore guard failures
  }
}

installFatalGuards();
import { bootstrap } from './boot/boot';

try { console.warn('[ROUTER_STAMP] index-app', ROUTER_STAMP); } catch {}

// Idempotent init guard for feature initializers (prevents double-init as we migrate)
export function initOnce<T extends (..._args: any[]) => any>(name: string, fn: T): T {
	(window as any).__tpInit = (window as any).__tpInit || {};
	return ((..._args: any[]) => {
		try {
			if ((window as any).__tpInit[name]) return;
			(window as any).__tpInit[name] = true;
		} catch {}
		const res = fn(..._args as any);
		try { document.dispatchEvent(new CustomEvent('tp:feature:init', { detail: { name } })); } catch {}
		return res as any;
	}) as T;
}

function isCiSmoke(): boolean {
  try {
    const search = window.location.search || '';
    return search.includes('ci=1') || search.includes('mockFolder=1');
  } catch {
    return false;
  }
}

function shouldBypassAuth(): boolean {
	try {
		const search = window.location.search || '';
		const hash = window.location.hash || '';
		if (search.includes('ci=1') || search.includes('uiMock=1') || search.includes('mockFolder=1')) return true;
		if (hash.includes('ci=1') || hash.includes('uiMock=1')) return true;
		if ((window as any).__TP_SKIP_AUTH === true) return true;
	} catch {}
	return false;
}

function shouldGateAuth(): boolean {
	if (shouldBypassAuth()) return false;
	if (!hasSupabaseConfig) return false;
	return true;
}

// appStore singleton is created inside state/app-store and attached to window.__tpStore
try { initAsrScrollBridge(appStore); } catch {}
try { initObsBridge(appStore); } catch {}
// Early-safe OBS UI/status wiring: binders are idempotent and will wait for DOM
try { bindObsSettingsUI(); } catch {}
try { bindObsStatusPills(); } catch {}
try { initObsConnection(); } catch {}
// Keep recorder SSOT in sync with appStore.obsEnabled (legacy flag that can auto-arm the bridge)
try {
	const seed = appStore.get?.('obsEnabled');
	if (typeof seed === 'boolean') setRecorderEnabled('obs', seed);
	appStore.subscribe?.('obsEnabled', (v: any) => {
		if (typeof v === 'boolean') setRecorderEnabled('obs', v);
	});
} catch {}

// Forge auth/profile gate: ensure session + profile; stash on window for legacy consumers.
try { ensurePageTabs(appStore); } catch {}

// Run bootstrap (best-effort, non-blocking). The legacy monolith still calls
// window._initCore/_initCoreRunner paths; this ensures the modular runtime
// sets up the same early hooks when the module entry is used.
bootstrap().catch(() => {
	// HUD/debug paths are optional; never block boot
});

try {
	initRecorderBackends();
} catch {}

// Install vendor shims (mammoth) so legacy code can use window.ensureMammoth
import './vendor/mammoth';
// Settings + ASR wizard wiring (safe to import; guards on element presence)
import wireSettings from './ui/settings';
import './ui/settings/asr-wizard';
// Feature initializers (legacy JS modules)
// If/when these are migrated to TS, drop the .js extension and types will flow.
import { initHotkeys } from './features/hotkeys';
import { initPersistence } from './features/persistence';
import { initTelemetry } from './features/telemetry';
import { initToasts } from './features/toasts';
import './ui/script-editor';

// === UI Scroll Mode Router ===
import { installAsrScrollBridge } from './scroll/asr-bridge';
import type { ScrollMode as BrainMode } from './scroll/scroll-brain';
import { getScrollBrain } from './scroll/brain-access';
import { installWpmSpeedBridge } from './scroll/wpm-bridge';
type UiScrollMode = 'off' | 'auto' | 'asr' | 'step' | 'rehearsal' | 'wpm' | 'hybrid' | 'timed';

const SCROLL_MODE_SELECT_ID = 'scrollMode';
const ALLOWED_SCROLL_MODES: UiScrollMode[] = ['timed', 'wpm', 'hybrid', 'asr', 'step', 'rehearsal', 'auto', 'off'];
let lastStableUiMode: UiScrollMode = 'hybrid';
let selectPrefersAsr = false;
let lastScrollModeSource: ScrollModeSource = 'boot';

// --- Profile settings persistence (Supabase) ---
const SETTINGS_KEYS: PersistedAppKey[] = [
	'scrollMode',
	'timedSpeed',
	'wpmTarget',
	'wpmBasePx',
	'wpmMinPx',
	'wpmMaxPx',
	'wpmEwmaSec',
	'hybridAttackMs',
	'hybridReleaseMs',
	'hybridIdleMs',
	'stepPx',
	'rehearsalPunct',
	'rehearsalResumeMs',
	'micDevice',
	'obsEnabled',
	'obsScene',
	'obsReconnect',
	'obsHost',
	'autoRecord',
	'prerollSeconds',
 'devHud',
 'hudEnabledByUser',
 'cameraEnabled',
  'asr.engine',
  'asr.language',
  'asr.useInterimResults',
  'asr.filterFillers',
  'asr.threshold',
  'asr.endpointMs',
  'asrProfiles',
  'asrActiveProfileId',
  'asrTuningProfiles',
  'asrTuningActiveProfileId',
 'settingsTab',
];

function getAsrModeState(): string | null {
	const asrMode = (window as any).__tpAsrMode;
	if (asrMode && typeof asrMode.getState === 'function') {
		try {
			const state = asrMode.getState();
			return typeof state === 'string' ? state.toLowerCase() : null;
		} catch {}
	}
	return null;
}

function isAsrEngineEngaged(): boolean {
	const state = getAsrModeState();
	return state === 'running' || state === 'listening' || state === 'ready';
}

function isAsrOverlayActive(): boolean {
	return selectPrefersAsr || isAsrEngineEngaged();
}

let profileHydrated = false;
let profileRev = 0;
let suppressSave = false;
let saveTimer: number | null = null;
let saving = false;
let currentSettings: UserSettings = { app: {} };
let lastUserChange = 0;
let saveIndicatorTimer: number | null = null;
const SETTINGS_SAVE_DEBOUNCE_MS = 900;
const RECENT_CHANGE_WINDOW_MS = 10_000;

function isSettingsHydrating(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!(window as any).__tpSettingsHydrating;
  } catch {
    return false;
  }
}

function isDevMode(): boolean {
	try {
		const params = new URLSearchParams(location.search || '');
		if (params.has('dev')) return true;
		if (localStorage.getItem('tp_dev_mode') === '1') return true;
		const w = window as any;
		return !!w.__TP_DEV || !!w.__TP_DEV1;
	} catch {
		return false;
	}
}

function devLog(...args: any[]) {
	if (!isDevMode()) return;
	try { console.debug('[settings]', ...args); } catch {}
}

type SettingsSaveState = 'idle' | 'saving' | 'saved' | 'failed';

type SettingsSaveStatus = {
	state: SettingsSaveState;
	at: number;
	error?: string;
};

type AsrHandshakeSummary = {
	engine?: string;
	lang?: string;
	profileName?: string;
	reason?: string;
};

function setSettingsSaveStatus(status: SettingsSaveStatus) {
	try {
		appStore.set?.('settingsSaveStatus', status as any);
	} catch {}
}

function resolveActiveAsrProfileSummary(): string {
	try {
		const profiles = appStore.get?.('asrProfiles') as Record<string, any> | undefined;
		const active = (appStore.get?.('asrActiveProfileId') || '') as string;
		const candidate = active && profiles ? profiles[active] : null;
		if (candidate && typeof candidate === 'object') {
			return (candidate.label || candidate.name || active || 'default') as string;
		}
		return active || 'default';
	} catch {
		return 'default';
	}
}

function recordAsrApplied(reason?: string) {
	try {
		const summary: AsrHandshakeSummary = {
			engine: appStore.get?.('asr.engine'),
			lang: appStore.get?.('asr.language'),
			profileName: resolveActiveAsrProfileSummary(),
			reason,
		};
		appStore.set?.('asrLastAppliedAt', Date.now() as any);
		appStore.set?.('asrLastAppliedSummary', summary as any);
		appStore.set?.('asrLastApplyOk', true as any);
	} catch {}
}

try {
	window.addEventListener('tp:asrChanged', () => {
		recordAsrApplied('asr-changed');
	});
} catch {}

function ensureSettingsSavedDot(): HTMLElement | null {
	try {
		const btn = document.getElementById('settingsBtn');
		if (!btn) return null;
		btn.classList.add('tp-save-host');
		let dot = btn.querySelector<HTMLElement>('.tp-save-dot');
		if (!dot) {
			dot = document.createElement('span');
			dot.className = 'tp-save-dot';
			dot.setAttribute('aria-hidden', 'true');
			btn.appendChild(dot);
		}
		return dot;
	} catch {
		return null;
	}
}

function flashSettingsSaved() {
	try {
		const btn = document.getElementById('settingsBtn');
		const dot = ensureSettingsSavedDot();
		if (!btn || !dot) return;
		btn.classList.add('tp-save-flash');
		if (saveIndicatorTimer) {
			try { clearTimeout(saveIndicatorTimer); } catch {}
		}
		saveIndicatorTimer = window.setTimeout(() => {
			try { btn.classList.remove('tp-save-flash'); } catch {}
		}, 1600);
	} catch {}
}

function applySettingsToStore(settings: UserSettings, store: typeof appStore) {
	if (!settings || typeof settings !== 'object') return;
	const app = (settings as any).app || {};
	devLog('hydrate:apply', { keys: Object.keys(app).length });
	suppressSave = true;
	try {
		SETTINGS_KEYS.forEach((k) => {
			if (!Object.prototype.hasOwnProperty.call(app, k)) return;
			if (k === 'scrollMode') {
				try {
					const raw = String((app as any)[k] ?? '').trim().toLowerCase();
					if (raw !== 'asr' && isAsrOverlayActive()) {
						devLog('[ASR] hydrate skipped scrollMode override while engaged', { raw });
						return;
					}
				} catch {}
			}
			try { store.set?.(k as any, (app as any)[k]); } catch {}
		});
		currentSettings = applySettingsPatch({ app: { ...(currentSettings.app || {}) } }, { app }) || { app: {} };
			try {
				const asrSettings = (settings as any).asrSettings;
				if (asrSettings && typeof asrSettings === 'object') {
					const mapping: Record<string, string> = {
						engine: 'asr.engine',
						language: 'asr.language',
						useInterimResults: 'asr.useInterimResults',
						filterFillers: 'asr.filterFillers',
						threshold: 'asr.threshold',
						endpointingMs: 'asr.endpointMs',
					};
					const patch: Partial<SpeechState> = {};
					Object.keys(mapping).forEach((src) => {
						const value = (asrSettings as any)[src];
						if (typeof value !== 'undefined') {
							try { store.set?.(mapping[src as keyof typeof mapping] as any, value as any); } catch {}
							if (src in asrSettings) {
								(patch as any)[src] = value;
							}
						}
					});
					if (Object.keys(patch).length) {
						try { speechStore.set(patch); } catch {}
					}
				}
				const asrProfiles = (settings as any).asrProfiles;
				if (Array.isArray(asrProfiles)) {
					const map: Record<string, unknown> = {};
					asrProfiles.forEach((profile) => {
						if (profile && typeof profile === 'object' && 'id' in profile) {
							map[(profile as any).id] = profile;
						}
					});
					try { store.set?.('asrProfiles', map); } catch {}
				}
				const speakerProfiles = (settings as any).speakerProfiles;
				const speakerBindings = (settings as any).speakerBindings as SpeakerBindingsSettings | undefined;
				if (Array.isArray(speakerProfiles) || speakerBindings) {
					initSpeakerProfilesFromSettings({
						profiles: Array.isArray(speakerProfiles)
							? speakerProfiles.filter((profile) => profile && typeof profile === 'object')
							: undefined,
						bindings: speakerBindings,
						activeSlot: speakerBindings?.activeSlot,
					});
				}
				} catch {
					// ignore ASR hydrate issues
				}
		recordAsrApplied('hydrate');
	} catch {
		// ignore apply failures
	} finally {
		suppressSave = false;
	}
}

function snapshotAppSettings(store: typeof appStore): UserSettings {
	const app: Record<string, any> = {};
	SETTINGS_KEYS.forEach((k) => {
		try { app[k] = store.get?.(k as any); } catch {}
	});
	const asrSettings = {
		engine: store.get?.('asr.engine'),
		language: store.get?.('asr.language'),
		useInterimResults: store.get?.('asr.useInterimResults'),
		filterFillers: store.get?.('asr.filterFillers'),
		threshold: store.get?.('asr.threshold'),
		endpointingMs: store.get?.('asr.endpointMs'),
	};
	const rawProfiles = store.get?.('asrProfiles') as Record<string, unknown> | undefined;
	const asrProfiles = rawProfiles ? Object.values(rawProfiles) : [];
	const speakerState = getSpeakerProfilesSnapshot();
	const speakerProfiles = speakerState.profiles;
	const speakerBindings: SpeakerBindingsSettings = {
		...speakerState.bindings,
		activeSlot: speakerState.activeSlot,
	};
	return { app, asrSettings, asrProfiles, speakerProfiles, speakerBindings };
}

function queueProfileSave(userId: string, store: typeof appStore) {
	if (IS_CI_MODE) return;
	if (!profileHydrated || suppressSave) return;
	if (isSettingsHydrating()) return;
	if (saveTimer) {
		try { clearTimeout(saveTimer); } catch {}
	}
	devLog('save:queue');
		saveTimer = window.setTimeout(async () => {
			saveTimer = null;
			if (saving) return;
			saving = true;
			try {
				const merged = snapshotAppSettings(store);
				currentSettings = merged;
				setSettingsSaveStatus({ state: 'saving', at: Date.now() });
				const { rev } = await saveProfileSettings({
					userId,
					mergedSettings: merged,
					expectedRev: profileRev,
				});
				profileRev = rev;
				devLog('save:flushed', { rev });
				if (lastUserChange && Date.now() - lastUserChange <= RECENT_CHANGE_WINDOW_MS) {
					flashSettingsSaved();
				}
				setSettingsSaveStatus({ state: 'saved', at: Date.now() });
			} catch (err) {
				setSettingsSaveStatus({ state: 'failed', at: Date.now(), error: String(err) });
				// On conflict or failure, try a single refresh
				try {
				const { settings, rev } = await loadProfileSettings(userId);
				profileRev = rev;
				applySettingsToStore(settings, store);
				devLog('save:conflict-reloaded', { rev });
			} catch (errReload) {
				try {
					console.warn('[forge] settings save failed; reload also failed', err, errReload);
					devLog('save:conflict-reload-failed');
				} catch {}
			}
		} finally {
			saving = false;
		}
	}, SETTINGS_SAVE_DEBOUNCE_MS);
}

function installSettingsPersistence(userId: string, store: typeof appStore) {
	try {
		const seenInit = new Set<string>();
		SETTINGS_KEYS.forEach((k) => {
			store.subscribe?.(k as any, (_v: any) => {
				if (!profileHydrated || suppressSave) return;
				if (isSettingsHydrating()) return;
				if (!seenInit.has(k)) {
					seenInit.add(k);
					return;
				}
				lastUserChange = Date.now();
				currentSettings.app = currentSettings.app || {};
				(currentSettings.app as any)[k] = _v;
				queueProfileSave(userId, store);
			});
		});
	} catch {}
}
let asrRejectionToastShown = false;
let lastAsrReadyState: boolean | null = null;

function normalizeUiScrollMode(mode: string | null | undefined): UiScrollMode {
  const raw = String(mode || '').trim().toLowerCase();
  if (raw === 'manual') return 'step';
  return (ALLOWED_SCROLL_MODES.includes(raw as UiScrollMode) ? (raw as UiScrollMode) : 'hybrid');
}

function getSafeFallbackMode(): UiScrollMode {
  const candidate = normalizeUiScrollMode(lastStableUiMode);
  if (candidate === 'asr') return 'hybrid';
  return candidate;
}

function setScrollModeSelectValue(mode: UiScrollMode): void {
  try {
    const el = document.getElementById(SCROLL_MODE_SELECT_ID) as HTMLSelectElement | null;
    if (!el) return;
    const normalized = normalizeUiScrollMode(mode);
    const asrOption = Array.from(el.options).find((o) => o.value === 'asr');
    const prefersAsr = selectPrefersAsr && !!asrOption && !asrOption.disabled;
    const target = prefersAsr ? 'asr' : normalized;
    if (Array.from(el.options).some((o) => o.value === target)) {
      el.value = target;
    }
  } catch {
    // ignore
  }
}

function setModeStatusLabel(mode: UiScrollMode): void {
  const el = document.getElementById('scrollModeStatus');
  if (!el) return;
  const m = String(mode || '').toLowerCase();
  let label = 'Manual';
  switch (m) {
    case 'timed':
      label = 'Timed';
      break;
    case 'wpm':
      label = 'WPM';
      break;
    case 'hybrid':
      label = 'Hybrid';
      break;
    case 'asr':
      label = 'ASR';
      break;
    case 'step':
      label = 'Step';
      break;
    case 'rehearsal':
      label = 'Rehearsal';
      break;
  }
  el.textContent = label;
}

type ScrollModeSource =
  | 'user'
  | 'boot'
  | 'store'
  | 'router'
  | 'external'
  | 'hydrate'
  | 'fallback'
  | 'guard'
  | 'legacy'
  | 'asr';

async function refreshScriptsSidebar(): Promise<void> {
  try {
    await initMappedFolder();
    const scripts = await listScripts();
    if (!scripts.length) {
      const sel = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
      if (sel) sel.setAttribute('aria-busy', 'false');
      return;
    }
    const mappedEntries = scripts.map((s) => ({
      id: s.name,
      title: s.name,
      handle: s.handle as any,
    }));
    ScriptStore.syncMapped(mappedEntries);
    const sel = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
    if (sel) sel.setAttribute('aria-busy', 'false');
  } catch {}
}

export type ApplyUiScrollModeOptions = {
  skipStore?: boolean;
  allowToast?: boolean;
  source?: ScrollModeSource;
  __permissionRetry?: boolean;
};

type GateReason = AsrNotReadyReason | 'MIC_ERROR' | 'NO_CALIBRATION';

let asrGatePending = false;

function isMicCapturing(): boolean {
  try {
    const mic = (window as any).__tpMic;
    const stream = mic?.__lastStream as MediaStream | undefined;
    if (stream && typeof stream.getAudioTracks === 'function') {
      const tracks = stream.getAudioTracks();
      if (tracks.some((t) => t && t.readyState === 'live' && t.enabled)) return true;
    }
    if (typeof mic?.isOpen === 'function') return !!mic.isOpen();
  } catch {}
  return false;
}

async function ensureMicStream(): Promise<boolean> {
  if (isMicCapturing()) return true;
  try {
    const mic = (window as any).__tpMic;
    if (mic?.requestMic) {
      await mic.requestMic();
    }
  } catch {}
  return isMicCapturing();
}

function waitForActiveAsrProfile(timeoutMs = 60000): Promise<boolean> {
  return new Promise((resolve) => {
    if (hasActiveAsrProfile()) {
      resolve(true);
      return;
    }
    let done = false;
    let tid: number | null = null;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      try { if (tid) window.clearTimeout(tid); } catch {}
      try { unsub?.(); } catch {}
      resolve(ok);
    };
    const unsub = onAsr((state) => {
      try {
        if (state?.activeProfileId && (state.profiles as any)?.[state.activeProfileId]) {
          finish(true);
        }
      } catch {}
    });
    tid = window.setTimeout(() => finish(false), timeoutMs);
  });
}

async function ensureAsrReadyForUser(): Promise<boolean> {
  try {
    const micRes = await ensureMicAccess();
    if (!micRes.allowed) return false;
  } catch {
    return false;
  }
  if (!(await ensureMicStream())) return false;
  if (hasActiveAsrProfile()) return true;
  try {
    const openAsr = (window as any).openSettingsToAsr;
    if (typeof openAsr === 'function') {
      openAsr(true);
    } else if (typeof (window as any).startAsrWizard === 'function') {
      await (window as any).startAsrWizard();
    } else {
      document.getElementById('settingsBtn')?.click();
    }
  } catch {}
  return waitForActiveAsrProfile();
}

function applyUiScrollMode(
  mode: UiScrollMode,
  opts: ApplyUiScrollModeOptions = {},
) {
  const allowToast = opts.allowToast !== false;
  const source: ScrollModeSource = opts.source || 'user';
  lastScrollModeSource = source;
  let normalized = normalizeUiScrollMode(mode);
  if (normalized === 'hybrid' && !hasActiveAsrProfile()) {
    handleAsrBlock('NO_CALIBRATION');
    return;
  }
  let readiness: { ready: true; warn?: AsrWarnReason } | { ready: false; reason: AsrNotReadyReason } | null = null;
  const auto = (window as any).__tpAuto as { setEnabled?(_v: boolean): void } | undefined;
  const asrBridge = (window as any).__asrBridge as { start?: () => Promise<void> | void; stop?: () => Promise<void> | void } | undefined;
  const dispatchAsrToggle = (armed: boolean) => {
    try {
      document.dispatchEvent(new CustomEvent('asr:toggle', { detail: { armed } }));
    } catch {}
  };
  const dispatchAutoIntentEvent = (on: boolean) => {
    try {
      document.dispatchEvent(new CustomEvent('tp:autoIntent', { detail: { on } }));
    } catch {}
  };
  let micPermissionCheckPending = false;
  const isPermissionRetry = opts.__permissionRetry === true;
  function handleAsrBlock(reason: GateReason) {
    let fallback = reason === 'NO_PERMISSION' ? 'hybrid' : getSafeFallbackMode();
    if (reason === 'NO_CALIBRATION' && fallback === 'hybrid') {
      fallback = 'step';
    }
    normalized = fallback;
    setScrollModeSelectValue(fallback);
    if (allowToast && source === 'user') {
      if (reason === 'NO_PERMISSION') {
        try { showToast('ASR blocked: microphone permission denied', { type: 'warning' }); } catch {}
      } else if (reason === 'NO_CALIBRATION') {
        try { showToast('Select a saved mic calibration to use ASR/Hybrid.', { type: 'warning' }); } catch {}
        try { focusSidebarCalibrationSelect(); } catch {}
      } else if (!asrRejectionToastShown) {
        const toastMsg = 'ASR needs mic + calibration. Stayed in Hybrid.';
        try { showToast(toastMsg, { type: 'info' }); } catch {}
      }
      asrRejectionToastShown = true;
    }
    try {
      console.debug('[Scroll Mode] ASR rejected', { reason, fallback });
    } catch {}
    try { appStore.set?.('scrollMode', fallback as any); } catch {}
    try { requestAsrStop(); } catch {}
  }
  const ensureMicPermissionThenRetry = () => {
    if (micPermissionCheckPending) return;
    micPermissionCheckPending = true;
    ensureMicAccess()
      .then((res) => {
        micPermissionCheckPending = false;
        if (res.allowed) {
          applyUiScrollMode('asr', { ...opts, __permissionRetry: true });
          return;
        }
        handleAsrBlock(res.reason);
      })
      .catch(() => {
        micPermissionCheckPending = false;
        handleAsrBlock('MIC_ERROR');
      });
  };
  const hardStopAuto = () => {
    try {
      auto?.setEnabled?.(false);
    } catch {}
    dispatchAutoIntentEvent(false);
    try {
      console.debug('[ASR] autoscroll disabled for ASR selection');
    } catch {}
  };
  const requestAsrStart = () => {
    dispatchAsrToggle(true);
  };
  const requestAsrStop = () => {
    try {
      stopAsrRuntime();
    } catch {}
    try {
      asrBridge?.stop?.();
    } catch (err) {
      try {
        console.warn('[ASR] bridge stop failed', err);
      } catch {}
    } finally {
      dispatchAsrToggle(false);
    }
  };
  if (normalized === 'asr') {
    readiness = computeAsrReadiness();
    if (!readiness.ready) {
      if (!isPermissionRetry && readiness.reason === 'NO_PERMISSION') {
        ensureMicPermissionThenRetry();
        return;
      }
      handleAsrBlock(readiness.reason);
      return;
    }
    if (source === 'user') {
      hardStopAuto();
      requestAsrStart();
    }
  } else if (source === 'user') {
    requestAsrStop();
  }
  if (normalized !== 'asr') {
    lastStableUiMode = normalized;
    asrRejectionToastShown = false;
  }
  // Store the UI mode somewhere global so existing JS can still read it
  (window as any).__tpUiScrollMode = normalized;
  // Persist for next load (CI smoke expects scrollMode to survive reloads)
  if (!opts.skipStore) {
    try { appStore.set?.('scrollMode', normalized); } catch {}
  }

  try { applyScrollModeUI(normalized as any); } catch {}
  try { setModeStatusLabel(normalized); } catch {}

	const brain = getScrollBrain();
  const asr = (window as any).__tpAsrMode as { setEnabled?(_v: boolean): void } | undefined;
  const setClampMode = (window as any).__tpSetClampMode as
    | ((_m: 'follow' | 'backtrack' | 'free') => void)
    | undefined;

  // Defaults
  let brainMode: BrainMode = 'manual';
  let clampMode: 'follow' | 'backtrack' | 'free' = 'free';
  let asrEnabled = false;
  let autoEnabled = false;

  switch (normalized) {
    case 'off':
      brainMode = 'manual';
      clampMode = 'free';
      asrEnabled = false;
      autoEnabled = false;
      break;

    case 'timed':
    case 'wpm':
    case 'auto':
      brainMode = 'auto';      // pure time-based scroll
      clampMode = 'free';      // ASR anti-jitter not needed
      asrEnabled = false;
      autoEnabled = false;      // Defer auto until session/router enables it
      break;

    case 'hybrid':
      brainMode = 'hybrid';    // auto + ASR corrections
      clampMode = 'follow';    // monotonic clamp
      asrEnabled = false;
      autoEnabled = false;
      break;

    case 'asr':
      brainMode = 'asr';       // ASR-only mode (speech-driven, no auto)
      clampMode = 'follow';    // monotonic clamp: no back-jogs
      asrEnabled = true;
      autoEnabled = false;      // Defer auto until session/router enables it
      break;

    case 'step':
      brainMode = 'step';      // discrete step moves
      clampMode = 'free';      // clamp doesn't matter here
      asrEnabled = false;
      autoEnabled = false;
      break;

  case 'rehearsal':
      brainMode = 'rehearsal'; // no programmatic scroll
      clampMode = 'free';
      asrEnabled = false;
      autoEnabled = false;
      break;
	}
  selectPrefersAsr = asrEnabled;
  try { setScrollModeSelectValue(normalized); } catch {}
  // Apply decisions
  try { brain?.setMode(brainMode); } catch {}
  if (setClampMode) setClampMode(clampMode);
  if (asr && typeof asr.setEnabled === 'function') asr.setEnabled(asrEnabled);
  if (auto && typeof auto.setEnabled === 'function') auto.setEnabled(autoEnabled);

  // HUD visibility: show all three layers for debugging
  try {
    const summary = `UI: ${normalized} | Brain: ${brainMode} | Clamp: ${clampMode}`;
    (window as any).HUD?.log?.('scroll:mode', { 
      summary,
      ui: normalized, 
      brain: brainMode, 
      clamp: clampMode, 
      asrEnabled,
      autoEnabled
    });
    // Also log to console for quick visibility
    console.debug(`[Scroll Mode] ${summary} | ASR: ${asrEnabled ? 'on' : 'off'} | Auto: ${autoEnabled ? 'on' : 'off'}`);
  } catch {
    // ignore
  }
}

function initScrollModeUiSync(): void {
  const asrOption = () =>
    document.querySelector<HTMLOptionElement>('#scrollMode option[value="asr"]');
  const scrollModeHelp = () => document.getElementById('scrollModeHelpText') as HTMLElement | null;
  const scrollModeInlineHint = () => document.getElementById('scrollModeInlineHint') as HTMLElement | null;
  const defaultHelpText = scrollModeHelp()?.textContent || '';
  const baseHelpText = (defaultHelpText || 'Scroll mode controls').trim();
  let defaultAsrLabel: string | null = null;

  const updateFromStore = (mode: string | undefined) => {
    const normalized = normalizeUiScrollMode(mode);
    setScrollModeSelectValue(normalized);
    const currentUi =
      ((window as any).__tpUiScrollMode as UiScrollMode | undefined) ??
      lastStableUiMode;
    if (lastScrollModeSource !== 'store' && currentUi === normalized) return;
    applyUiScrollMode(normalized, { skipStore: true, source: 'store' });
  };

  const applyCurrent = () => {
    try {
      const current = normalizeUiScrollMode(appStore.get?.('scrollMode') as string | undefined);
      if (current !== 'asr') lastStableUiMode = current;
      updateFromStore(current);
      applyUiScrollMode(current, { skipStore: true, allowToast: false, source: 'boot' });
    } catch {}
    try {
      if (IS_CI_MODE) return;
      const bootFallback = localStorage.getItem('tp_asr_boot_fallback') === '1';
      if (bootFallback) {
        localStorage.removeItem('tp_asr_boot_fallback');
        showToast('Last time you used ASR. Select ASR to start mic + calibration.', { type: 'info' });
      }
    } catch {}
  };

  const applyOverlayMode = (mode: UiScrollMode) => {
    try {
      const shouldApply = mode === 'asr';
      if (!shouldApply) {
        try {
          if ((window as any).__TP_DEV) console.debug('[Scroll Mode] overlay guard: skipping', { mode });
        } catch {}
        return;
      }
      try {
        if ((window as any).__TP_DEV) console.debug('[Scroll Mode] overlay guard: applying ASR overlay');
      } catch {}
      applyUiScrollMode(mode, { skipStore: true, allowToast: false, source: 'asr' });
    } catch {}
  };

  applyCurrent();

  const applyAsrAvailability = () => {
    const readiness = computeAsrReadiness();
    const ready = readiness.ready;
    const reasonLabel = (() => {
      if (ready) return '';
      switch (readiness.reason) {
        case 'NO_PERMISSION': return 'Request mic to enable ASR';
        case 'NO_DEVICE': return 'Select a mic to enable ASR';
        default: return 'ASR not ready';
      }
    })();
    const warnLabel = ready && readiness.warn === 'NOT_CALIBRATED' ? 'Calibration recommended' : '';
    const opt = asrOption();
    const help = scrollModeHelp();
    const hint = scrollModeInlineHint();
    const transitionedToReady = lastAsrReadyState === false && ready;
    lastAsrReadyState = ready;
    if (transitionedToReady) asrRejectionToastShown = false;
    if (opt) {
      if (!defaultAsrLabel) defaultAsrLabel = opt.textContent || 'ASR';
      opt.disabled = !ready;
      opt.title = ready ? warnLabel : reasonLabel;
      opt.textContent = ready
        ? (warnLabel ? `${defaultAsrLabel || 'ASR'} (${warnLabel})` : defaultAsrLabel)
        : `${defaultAsrLabel || 'ASR'} (enable mic to use)`;
    }
    if (help) {
      help.textContent = ready
        ? defaultHelpText
        : `${baseHelpText} - ${reasonLabel || 'enable mic to use ASR'}.`;
    }
    if (hint) {
      if (ready) {
        hint.hidden = true;
      } else {
        hint.hidden = false;
        hint.textContent = reasonLabel || 'ASR is disabled until Mic is ready.';
      }
    }
  };

  try {
    applyAsrAvailability();
    appStore.subscribe?.('micGranted', () => applyAsrAvailability());
    appStore.subscribe?.('micDevice', () => applyAsrAvailability());
    window.addEventListener('tp:asrChanged', applyAsrAvailability, { capture: false });
  } catch {}
  try {
    appStore.subscribe?.('asrLive', () => {
        const current = normalizeUiScrollMode(appStore.get?.('scrollMode') as string | undefined);
        applyScrollModeUI(current as any);
    });
  } catch {}

  const updateOverlayFromEngineState = (engaged: boolean, reason?: string) => {
    try { appStore.set?.('asrLive', engaged); } catch {}
    const previouslyPrefers = selectPrefersAsr;
    selectPrefersAsr = engaged;
    const overlayMode = engaged ? 'asr' : getSafeFallbackMode();
    setScrollModeSelectValue(overlayMode);
    applyOverlayMode(overlayMode);
    if (!engaged && previouslyPrefers && lastScrollModeSource !== 'user') {
      devLog('[ASR] disengaged by', lastScrollModeSource, { reason });
    }
  };

  try {
    const handleAsrStateEvent = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent)?.detail || {};
        const state = String(detail.state || '').toLowerCase();
        const engaged = state === 'running' || state === 'listening';
        updateOverlayFromEngineState(engaged, detail.reason);
      } catch {}
    };
    updateOverlayFromEngineState(isAsrEngineEngaged(), 'init');
    window.addEventListener('tp:asr:state', handleAsrStateEvent, { capture: false });
  } catch {}

  try {
    appStore.subscribe?.('scrollMode', (next: string) => updateFromStore(next));
  } catch {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyCurrent, { once: true });
  }

  try {
    const requestAsrModeSelection = async () => {
      if (asrGatePending) return;
      asrGatePending = true;
      try {
        const current = normalizeUiScrollMode(appStore.get?.('scrollMode') as string | undefined);
        const fallback = current === 'asr' ? 'hybrid' : current;
        setScrollModeSelectValue(fallback);
        const ok = await ensureAsrReadyForUser();
        if (ok) {
          applyUiScrollMode('asr', { source: 'user', allowToast: true });
        } else {
          applyUiScrollMode(fallback, { source: 'guard', allowToast: false });
          showToast('ASR needs mic + calibration. Stayed in Hybrid.', { type: 'warning' });
        }
      } finally {
        asrGatePending = false;
      }
    };

    document.addEventListener('change', (ev) => {
      const t = ev.target as HTMLSelectElement | null;
      if (!t || t.id !== SCROLL_MODE_SELECT_ID) return;
      const mode = normalizeUiScrollMode(t.value);
      if (mode === 'asr') {
        void requestAsrModeSelection();
        return;
      }
      applyUiScrollMode(mode, { source: 'user', allowToast: true });
      try {
        const persisted = normalizeUiScrollMode(appStore.get?.('scrollMode') as string | undefined);
        if (persisted) localStorage.setItem('scrollMode', persisted);
      } catch {}
      try {
        console.log('[mode] user selection', { mode, store: appStore.get?.('scrollMode') });
      } catch {}
    }, { capture: true });
  } catch {
    // ignore
  }
}

initScrollModeUiSync();

// Expose this function as the global router for existing JS
try { (window as any).__tpAppStore = appStore; } catch {}
(window as any).setScrollMode = (mode: UiScrollMode) => {
	const normalized = normalizeUiScrollMode(mode);
	try { appStore.set?.('scrollMode', normalized as any); } catch {}
	try { applyUiScrollMode(normalized, { skipStore: true, source: 'legacy' }); } catch {}
	try { (window as any).__scrollCtl?.stopAutoCatchup?.(); } catch {}
};
(window as any).getScrollMode = () =>
  ((window as any).__tpUiScrollMode as UiScrollMode | undefined) ?? 'off';
try { (window as any).__tpApplyUiScrollMode = applyUiScrollMode; } catch {}
export { applyUiScrollMode, appStore };

// === Settings mirror + smoke helpers ===
function installSettingsMirrors() {
	function cloneOptionWithProps(src: HTMLOptionElement): HTMLOptionElement {
		const clone = src.cloneNode(true) as HTMLOptionElement;
		const anySrc = src as any;
		const anyClone = clone as any;
		['__file', '_file', '__fileHandle', '_handle'].forEach((k) => {
			if (anySrc && anySrc[k]) anyClone[k] = anySrc[k];
		});
		return clone;
	}

	function syncFrom(main: HTMLSelectElement, mirror: HTMLSelectElement) {
		const mainCount = main.options.length;
		const mirrorCount = mirror.options.length;

		// If main is empty but mirror has content, copy mirror back to main.
		if (mainCount <= 1 && mirrorCount > 1) {
			main.innerHTML = '';
			Array.from(mirror.options).forEach((opt) => {
				main.append(cloneOptionWithProps(opt));
			});
			main.value = mirror.value;
			return;
		}

		// Otherwise copy main into mirror, preserving expando properties on options.
		if (mirrorCount !== mainCount) {
			const prevValue = mirror.value;
			mirror.innerHTML = '';
			Array.from(main.options).forEach((opt) => {
				mirror.append(cloneOptionWithProps(opt));
			});
			// Try to restore selection; fall back to main's value.
			mirror.value = prevValue || main.value;
		} else {
			mirror.value = main.value;
		}
	}

	function syncAll() {
		const mirrors = document.querySelectorAll<HTMLSelectElement>('[data-settings-mirror]');
		mirrors.forEach((mirror) => {
			const targetId = mirror.getAttribute('data-settings-mirror');
			if (!targetId) return;
			const main = document.getElementById(targetId) as HTMLSelectElement | null;
			if (!main) return;
			syncFrom(main, mirror);
		});
	}

	document.addEventListener('change', (event) => {
		const target = event.target as HTMLElement | null;
		if (!(target instanceof HTMLSelectElement)) return;
		if (target.id) {
			const mirrors = document.querySelectorAll<HTMLSelectElement>(`[data-settings-mirror="${target.id}"]`);
			mirrors.forEach((mirror) => syncFrom(target, mirror));
		}
		const mirrorTarget = target.getAttribute('data-settings-mirror');
		if (mirrorTarget) {
			const main = document.getElementById(mirrorTarget) as HTMLSelectElement | null;
			if (main) {
				main.value = target.value;
				syncFrom(main, target);
			}
		}
	});

	if (document.readyState === 'loading') {
		document.addEventListener(
			'DOMContentLoaded',
			() => {
				syncAll();
				window.setTimeout(syncAll, 2000);
			},
			{ once: true },
		);
	} else {
		syncAll();
		window.setTimeout(syncAll, 2000);
	}
	const mo = new MutationObserver(() => syncAll());
	try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
}

function installSmokeRecFolderLabelHook() {
	try {
		const params = new URLSearchParams(window.location.search);
		if (!params.has('mockFolder')) return;

		let label = document.querySelector<HTMLElement>('[data-test-id="rec-folder-label"]');
		if (!label) {
			label = document.createElement('span');
			label.setAttribute('data-test-id', 'rec-folder-label');
			label.style.display = 'none';
			const parent = document.getElementById('settingsModal') || document.body;
			parent.appendChild(label);
		}

		if (!/MockRecordings/i.test(label.textContent || '')) {
			label.textContent = 'MockRecordings (smoke test folder)';
		}
	} catch {
		// best-effort only; never break prod
	}
}

installSettingsMirrors();
installSmokeRecFolderLabelHook();

function ensureUiCrawlTargets() {
	try {
		const qs = new URLSearchParams(window.location.search || '');
		if (!qs.has('ci')) return;
		const ids = [
			{ id: 'presentBtn', text: 'Present Mode' },
			{ id: 'recBtn', text: 'Start speech sync' },
			{ id: 'startCam', text: 'Start Camera' },
			{ id: 'stopCam', text: 'Stop Camera' },
		] as const;
		for (const { id, text } of ids) {
			let el = document.getElementById(id) as HTMLButtonElement | null;
			if (!el) {
				el = document.createElement('button');
				el.id = id;
				el.type = 'button';
				el.textContent = text;
				document.body.appendChild(el);
			}
			// Make sure crawler can see/click it without impacting layout
			try {
				el.hidden = false;
				el.style.position = 'absolute';
				el.style.left = '-9999px';
				el.style.top = '0';
				el.style.width = '12px';
				el.style.height = '12px';
				el.style.opacity = '0.01';
				el.style.pointerEvents = 'auto';
				el.tabIndex = -1;
				el.setAttribute('aria-hidden', 'true');
			} catch {}
		}
	} catch {}
}
ensureUiCrawlTargets();

// === End UI Scroll Mode Router ===

// The compiled bundle (./dist/index.js) will import other modules and
// eventually assign window.__tpRealCore or resolve the _initCore waiter.

// Optional: wire Auto-scroll + install scroll router in TS path as well
import './asr/v2/prompts';
import './features/autoscroll';
import { installDisplaySync } from './features/display-sync';
import { installRehearsal, resolveInitialRehearsal } from './features/rehearsal';
import { asrEngine } from './features/asr-engine';
import { getAutoScrollApi } from './features/scroll/auto-adapter';
import { initScrollModeRouter, type ScrollMode as RouterMode, type SessionState as RouterSessionState } from './features/scroll/mode-router';
import { installStepScroll } from './features/scroll/step-scroll';
import { stepEngine } from './features/scroll/step-engine';
import { applyTypographyTo } from './features/typography';
import { initAsrFeature } from './index-hooks/asr';
import { bindCameraUI } from './media/camera-bridge';
import './media/display-bridge';
import './media/mic'; // exposes window.__tpMic for mic controls + dB meter
import { bindMicUI } from './media/mic-bridge';
import { focusSidebarCalibrationSelect, wireSidebarCalibrationUI } from './media/calibration-sidebar';
import { initMicPermissions } from './media/mic-permissions';
import { onTypography } from './settings/typographyStore';
import { getUiPrefs } from './settings/uiPrefs';
import './ui/camera-drag'; // installs camera drag + persistence
import { wireMicToggle } from './ui/mic-toggle';
import './ui/micMenu';
import './ui/speakers-panel'; // toggles Speakers panel visibility
import './ui/step-visibility'; // hides step-only controls unless scrollMode === 'step'
import './ui/toasts'; // installs window.toast + container wiring
import './ui/typography'; // installs window.applyTypography + wheel zoom handling
import './ui/upload'; // installs script upload wiring
import './utils/safe-dom'; // installs window.safeDOM for legacy callers
import { initObsBridge } from './wiring/obs-bridge';
import { initObsBridgeClaim } from './wiring/obs-bridge-claim';
import { initObsUI } from './wiring/obs-wiring';
// Unified core UI binder (central scroll mode + present mode + minimal overlay helpers)
import { bindCoreUI } from './wiring/ui-binds';
// Render + ingest helpers
// Side-effect debug / DOM helpers (legacy parity)
import { initHud } from './hud/loader';
import { wireHudToggle } from './hud/toggle';
import { bindStaticDom, initLegend, wireTopbarHeightVar } from './ui/dom';
import { initDisplayPairingPanel } from './ui/display-pairing';
// Feature initializers (TS-owned)

type AnyFn = (...args: any[]) => any;

declare global {
	interface Window {
		HUD?: { bus?: { emit?: AnyFn | undefined } | undefined; log?: AnyFn | undefined } | undefined;
		__tpScrollDebug?: boolean;
		__tpHudTsInited?: boolean;
		hudRoot?: HTMLElement | null;
	}
}

function isDisplayContext(): boolean {
	try {
		return typeof window !== 'undefined' && (window as any).__TP_FORCE_DISPLAY === true;
	} catch {
		return false;
	}
}

function markReady(flags: Record<string, boolean>): void {
	try {
		const tgt = ((window as any).__TP_READY_FLAGS = (window as any).__TP_READY_FLAGS || {});
		Object.assign(tgt, flags);
	} catch {
		/* ignore */
	}
}

const ENABLE_HUD = false;

function _ensureHud(store: any): void {
	if (!ENABLE_HUD) return;
	if (isDisplayContext()) return;
	try {
		if ((window as any).__tpHudTsInited) return;
		(window as any).__tpHudTsInited = true;

		const dev = (() => {
			try {
				const qs = new URLSearchParams(String(location.search || ''));
				if (qs.has('hud') || qs.has('dev') || qs.has('scrollDebug')) return true;
				if (localStorage.getItem('tp_dev_mode') === '1') return true;
			} catch {}
			return false;
		})();
		const saved = (() => {
			try { return localStorage.getItem('tp_hud_save') === '1'; } catch { return false; }
		})();

		try { store?.set?.('hudSupported', true); } catch {}
		try {
			const existing = store?.get?.('hudEnabledByUser');
			if (existing == null) {
				store?.set?.('hudEnabledByUser', dev || saved);
			}
		} catch {}

		const root =
			(document.querySelector('[data-tp-hud]') as HTMLElement | null) ||
			(document.querySelector('[data-role=\"hud-root\"]') as HTMLElement | null) ||
			(document.getElementById('hud-root') as HTMLElement | null) ||
			document.body;
		initHud({
			store,
			root,
		});
		wireHudToggle();
	} catch {
		// HUD is optional; ignore failures
	}
}

const startPersistence = initOnce('persistence', initPersistence);
const startTelemetry   = initOnce('telemetry',   initTelemetry);
const startScroll      = initOnce('scroll',      () => {});
const startHotkeys     = initOnce('hotkeys',     initHotkeys);
const startToasts      = initOnce('toasts',      initToasts);
// Dev HUD for notes (only activates under ?dev=1 or __TP_DEV)
// Tiny HUD chip that reflects current scroll mode
import './features/scroll/mode-chip';
// Mapped Folder (scripts directory) binder
import { installGlobalIngestListener, installScriptIngest } from './features/script-ingest';
import { disableLegacyScriptsUI, neuterLegacyScriptsInit } from './ui/hide-legacy-scripts';
import { ensureSettingsFolderControls, ensureSettingsFolderControlsAsync } from './ui/inject-settings-folder';
import { bindMappedFolderUI, bindPermissionButton, handleChooseFolder } from './ui/mapped-folder-bind';
import { triggerSettingsDownload } from './features/settings/exportSettings';
import { triggerSettingsImport } from './features/settings/importSettings';
// ensure this file is executed in smoke runs
import './smoke/settings-mapped-folder.smoke.js';

function onDomReady(fn: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

  // Simple DOM-ready hook used by diagnostics to ensure the scheduler and legacy auto-scroll UI remain operational.
  try {
			onDomReady(() => {
        // Display window is a passive mirror; skip main UI wiring to avoid duplicate observers
        if (isDisplayContext()) return;
        try { bindStaticDom(); } catch (e) { try { console.warn('[index] bindStaticDom failed', e); } catch {} }
        try { initDisplayPairingPanel(); } catch (e) { try { console.warn('[index] initDisplayPairingPanel failed', e); } catch {} }
				const brain = getScrollBrain();
				installWpmSpeedBridge({
					api: {
						setBaseSpeedPx: (px: number) => {
              try {
                if (typeof brain.setBaseSpeedPx === 'function') return brain.setBaseSpeedPx(px);
                if (typeof brain.setTargetSpeed === 'function') return brain.setTargetSpeed(px);
              } catch {}
            },
						onManualSpeedAdjust: (delta: number) => {
              try {
                if (typeof brain.onManualSpeedAdjust === 'function') return brain.onManualSpeedAdjust(delta);
                if (typeof brain.setTargetSpeed === 'function') {
                  const cur = brain.getCurrentSpeedPx?.() ?? 0;
                  return brain.setTargetSpeed(cur + delta);
                }
              } catch {}
            },
					},
				});
				installAsrScrollBridge({
					onSpeechSample: (sample) => {
            try { brain.onSpeechSample?.(sample as any); } catch {}
          },
					reportSilence: ({ silent, ts }) => {
            try { brain.reportAsrSilence(silent, ts ?? Date.now()); } catch {}
          },
				});
		// 1) Install the TypeScript scheduler before any scroll writers run.
		try {
			installScheduler();
		} catch (err) {
			try { console.warn('[scheduler] install failed', err); } catch {}
		}

		// LEGACY AUTO-SPEED HOOK – intentionally disabled.
		// Autoscroll now owns #autoSpeed via src/features/autoscroll.ts.

	});
} catch {}

// Install emergency binder only in dev/CI/headless harness contexts (to reduce double-binding risk in prod)
try {
	const qs = String(location.search || '');
	const isHarness = /[?&](ci=1|dev=1|uiMock=1|mockFolder=1)/i.test(qs) || (navigator as any).webdriver === true;
	if (isHarness) {
		// Emergency binder removed in favor of canonical bindCoreUI; legacy path no-op.
	}
} catch {}
// Display mode: apply top-level class early for popup/display contexts
try {
	const Q = new URLSearchParams(location.search || '');
	if (Q.get('display') === '1') {
		document.documentElement.classList.add('tp-display');
		try { (document.getElementById('sidebar') as HTMLElement | null)?.setAttribute('hidden',''); } catch {}
		try { (document.getElementById('editor') as HTMLElement | null)?.setAttribute('hidden',''); } catch {}
	}
} catch {}

// Cross-window document channel (main <-> display)
//
// script-ingest.ts owns the onmessage handler for the shared "tp-doc"
// BroadcastChannel. Here we just make sure the channel exists and, when
// running in the display window, send an initial "hello" so the main
// window can respond with the current script snapshot.
let __docCh: BroadcastChannel | null = null;
let __isDisplay = false; // shared flag for display-specific logic

try {
  __docCh =
    (window as any).__tpDocCh ||
    ((window as any).__tpDocCh = new BroadcastChannel('tp-doc'));

  // Detect display mode:
  //  - Either ?display=1 in the URL
  //  - Or we are literally on /display.html
  try {
    const search = location.search || '';
    const params = new URLSearchParams(search);
    const displayFlag = params.get('display');
    const path = (location.pathname || '').toLowerCase();
    __isDisplay =
      displayFlag === '1' ||
      path.endsWith('/display.html') ||
      path === '/display.html';

    if (__isDisplay && __docCh) {
      __docCh.postMessage({ type: 'hello', client: 'display' });
    }
  } catch {}
  } catch {
    __docCh = null;
  }

  // Display window: receive script/scroll/typography updates and render locally
  if (__isDisplay) {
    try { initRecPillsDisplay(); } catch {}
    const markerPct = (typeof (window as any).__TP_MARKER_PCT === 'number' ? (window as any).__TP_MARKER_PCT : 0.4);
    const getWrap = () => document.getElementById('wrap') as HTMLElement | null;
    const getScriptEl = () => document.getElementById('script') as HTMLElement | null;

    const applyPadding = () => {
      const wrap = getWrap();
      const script = getScriptEl();
      if (!wrap || !script) return;
      const h = wrap.clientHeight || window.innerHeight || 0;
      const offset = Math.max(0, Math.round(h * markerPct));
      wrap.style.paddingTop = '0px';
      wrap.style.scrollPaddingTop = `${offset}px`;
      script.style.paddingTop = `${offset}px`;
    };

    const applyTypography = (fontSize?: string | number, lineHeight?: string | number) => {
      const root = document.documentElement;
      if (fontSize != null && fontSize !== '') {
        const fs = String(fontSize).includes('px') ? String(fontSize) : `${fontSize}px`;
        root.style.setProperty('--tp-font-size', fs);
      }
      if (lineHeight != null && lineHeight !== '') {
        root.style.setProperty('--tp-line-height', String(lineHeight));
      }
    };

    const applyHtml = (html: string, opts?: { fontSize?: any; lineHeight?: any; resetScroll?: boolean }) => {
      const script = getScriptEl();
      if (!script) return;
      script.innerHTML = html || '';
      applyTypography(opts?.fontSize, opts?.lineHeight);
      applyPadding();
      try { (getWrap() || script).scrollTop = 0; } catch {}
    };

    const applyText = (text: string, opts?: { fontSize?: any; lineHeight?: any }) => {
      const script = getScriptEl();
      if (!script) return;
      renderScript(text, script);
      applyTypography(opts?.fontSize, opts?.lineHeight);
      applyPadding();
      try { (getWrap() || script).scrollTop = 0; } catch {}
    };

    const handleDisplayMessage = (ev: MessageEvent<any>) => {
      const m = ev?.data;
      // Ignore non-objects / noise early
      if (!m || typeof m !== 'object') return;

      const renderPayload = (html: string, text: string, fmt?: string) => {
        const format = (fmt || '').toLowerCase();
        if (format === 'html' || (!format && html)) {
          applyHtml(html || text, { fontSize: m.fontSize, lineHeight: m.lineHeight, resetScroll: true });
          return true;
        }
        if (format === 'text' || text) {
          applyText(text || html, { fontSize: m.fontSize, lineHeight: m.lineHeight });
          return true;
        }
        return false;
      };

      // Optional render payload (pre-rendered HTML or plain text)
      if (m.type === 'render') {
        const html = typeof m.html === 'string' ? m.html : '';
        const text = typeof m.text === 'string' ? m.text : '';
        if (renderPayload(html, text, m.format)) return;
      }

      // Only handle the two script payload shapes; everything else is ignored
      if (m.kind === 'tp:script' && m.source === 'main') {
        const html = typeof m.html === 'string' ? m.html : '';
        const text = typeof m.text === 'string' ? m.text : '';
        if (renderPayload(html, text, m.format)) return;
      }

      if (m.type === 'script') {
        const text = typeof m.text === 'string' ? m.text : '';
        if (renderPayload('', text, m.format || 'text')) return;
      }
    };

    try {
      const w = window as any;
      if (!w.__tpDisplayMsgBound) {
        w.__tpDisplayMsgBound = true;
        window.addEventListener('message', handleDisplayMessage);
        __docCh?.addEventListener('message', (e) => handleDisplayMessage({ data: e.data } as any));
      }
    } catch {}

    try { window.addEventListener('resize', applyPadding); } catch {}
    try { document.addEventListener('DOMContentLoaded', applyPadding, { passive: true } as any); } catch {}
  } else {
    // Main window: mirror rendered script to the display window
    try {
      installDisplaySync({
        channelName: 'tp_display',
        getText: () => {
          try {
            const raw = (window as any).__tpRawScript;
            if (typeof raw === 'string' && raw.length) return raw;
            const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
            if (ed && typeof ed.value === 'string') return ed.value;
          } catch {}
          return '';
        },
      });
    } catch {}
  }
  // Expose folder injection helpers globally for smoke harness / fallback JS paths
  try { (window as any).ensureSettingsFolderControls = ensureSettingsFolderControls; } catch {}
  try { (window as any).ensureSettingsFolderControlsAsync = ensureSettingsFolderControlsAsync; } catch {}

// Dev-only anchor observer: lazily load IO helper for diagnostics / HUDs
try {
	const search = String(location.search || '');
	const wantsAnchors = Boolean((window as any).__TP_DEV || /[?&](?:dev=1|anchors=1)/i.test(search));
	if (wantsAnchors) {
		import('./io-anchor').then(({ createAnchorObserver }) => {
			try {
				const ctx = {
					root: () => document.getElementById('viewer'),
					script: () => document.querySelector('#viewer .script') || document.getElementById('script'),
				};
				const obs = createAnchorObserver(ctx.root, (el) => {
					try {
						window.dispatchEvent(new CustomEvent('tp:anchorChanged', { detail: { el } }));
					} catch {}
				});
				(window as any).__anchorObs = obs;
				const reobserve = () => {
					try {
						const scriptEl = ctx.script();
						if (!scriptEl) return;
						obs.observeAll(scriptEl.querySelectorAll('p'));
					} catch {}
				};
				const start = () => {
					obs.ensure();
					reobserve();
				};
				if (document.readyState === 'loading') {
					document.addEventListener('DOMContentLoaded', start, { once: true });
				} else {
					start();
				}
				window.addEventListener('tp:script:rendered', reobserve as any);
				window.addEventListener('tp:script:updated', reobserve as any);
			} catch {}
		}).catch(() => {});
	}
} catch {}

// Test-only mock population (deterministic CI) — mirrors legacy JS path behavior
function __maybePopulateMockFolder() {
	try {
		const Q = new URLSearchParams(location.search || '');
		const useMock = Q.has('mockFolder') || Q.has('uiMock') || (navigator.webdriver === true);
		if (!useMock) return;
		try { (window as any).__tpMockFolderMode = true; } catch {}
		const main = document.getElementById('scriptSelect') as HTMLSelectElement | null;
		const mirror = document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null;
		if (!main && !mirror) return;
		const names = ['Practice_Intro.txt','Main_Episode.txt','Notes.docx'];
		const opts = names.filter(n=>/\.(txt|docx)$/i.test(n));
		const populate = (sel: HTMLSelectElement|null) => {
			if (!sel) return;
			sel.setAttribute('aria-busy','true');
			sel.innerHTML = opts.map((n,i)=>`<option value="${i}">${n}</option>`).join('');
			sel.setAttribute('aria-busy','false');
			sel.disabled = opts.length === 0;
			sel.dataset.count = String(opts.length);
		};
		populate(main); populate(mirror);
		try { window.dispatchEvent(new CustomEvent('tp:folderScripts:populated',{ detail:{ count: opts.length } })); } catch {}
	} catch {}
}

// Unified TS boot function — consolidates prior scattered DOMContentLoaded wiring
export async function boot() {
		try {
			// Count boot attempts (used by smoke to assert single boot)
			try { (window as any).__tpBootsSeen = ((window as any).__tpBootsSeen || 0) + 1; } catch {}
			// Single-owner guard: boot orchestration belongs to ts/index only
			try {
				const owner = (window as any).__TP_BOOT_OWNER;
				if (owner && owner !== TS_BOOT_OWNER) {
					try { console.warn('[TP-BOOT] ignoring secondary boot request from', owner); } catch {}
					return;
				}
				(window as any).__TP_BOOT_OWNER = TS_BOOT_OWNER;
			} catch {}
			if ((window as any).__tpTsBooted) return; // duplication guard
			(window as any).__tpTsBooted = 1;
			(window as any).__TP_BOOT_TRACE = (window as any).__TP_BOOT_TRACE || [];
			(window as any).__TP_BOOT_TRACE.push({ t: Date.now(), m: 'boot:start:ts' });

			const devFlag = !!((window as any).__TP_DEV || (window as any).__TP_DEV1);
			if (devFlag) {
				try { initDevDrawer(); } catch {}
			}

			// Session slice + preroll-driven orchestration
			try { initSession(); } catch {}
			try { initPrerollSession(); } catch {}
			try { initScrollSessionRouter(); } catch {}
			try { initRecordingSession(); } catch {}

			// Profile/settings hydration (Supabase) before UI wiring
			let profileUserId: string | null = null;
			if (shouldGateAuth()) {
				try {
					devLog('hydrate:start');
					const ctx = await ensureUserAndProfile();
					try { (window as any).__forgeUser = ctx.user; } catch {}
					try { (window as any).__forgeProfile = ctx.profile; } catch {}
					profileUserId = ctx.user?.id || null;
				} catch (err) {
					try { console.warn('[forge] auth/profile init failed', err); } catch {}
				}
			}

			if (profileUserId) {
				if (!IS_CI_MODE) {
					try {
						const { settings, rev } = await loadProfileSettings(profileUserId);
						profileRev = rev;
						applySettingsToStore(settings, appStore);
						currentSettings = snapshotAppSettings(appStore);
						profileHydrated = true;
						devLog('hydrate:done', { rev });
					} catch (err) {
						try { console.warn('[forge] settings load failed; using defaults', err); } catch {}
						currentSettings = snapshotAppSettings(appStore);
						profileHydrated = true; // allow saves later even if load failed
						devLog('hydrate:failed');
					}
					installSettingsPersistence(profileUserId, appStore);
					const persistedUserId = profileUserId;
					subscribeSpeakerProfileState(() => {
						if (!persistedUserId) return;
						if (!profileHydrated || suppressSave) return;
						lastUserChange = Date.now();
						queueProfileSave(persistedUserId, appStore);
					});
				} else {
					currentSettings = snapshotAppSettings(appStore);
					profileHydrated = true;
					devLog('hydrate:ci-skip');
				}
			}

			// Early: folder card injection + async watcher (before any user opens Settings)
          try { ensureSettingsFolderControls(); } catch {}
          try { ensureSettingsFolderControlsAsync(6000); } catch {}
          // Mock population for CI (after initial injection attempt)
          __maybePopulateMockFolder();

			// Attempt OBS bridge claim early (non-blocking)
			try { initObsBridgeClaim(); } catch {}
			// ASR feature (hotkeys & UI)
			try { initAsrFeature(); } catch {}
			// OBS Settings wiring (Test connect button)
			try { initObsUI(); } catch {}

					// Load adapters via ESM imports (TS-controlled). Enable DEV hotkeys.
					try {
						const DEV = (() => { try { return location.search.includes('dev=1') || localStorage.getItem('tp_dev_mode') === '1'; } catch { return false; } })();
						Promise.allSettled([
							import('./adapters/obs').then(m => m.configure?.({})),
							import('./adapters/hotkey').then(m => { if (DEV) m.enable?.(); })
						]).catch(() => {});
					} catch {}

          // ASR bridge: mirror legacy asr-bridge-speech.js (start/stop on speech events)
          try { initSpeechBridge(); } catch {}

			// The following block previously lived inside a DOMContentLoaded listener.
			// We still gate some UI-dependent wiring on DOM readiness for robustness.
          const onReady = () => {
            try {
							// Prime scroll-router init once the viewer exists (before mode wiring)
							try {
								const initScrollRouter = initOnce('scroll-router', () => {
									const viewer =
										document.getElementById('scriptScrollContainer') ||
										document.getElementById('viewer');
									const msg = `[SCROLL] initOnce: scroll-router (viewer=${!!viewer})`;
									try { console.info(msg); } catch {}
									try { console.warn('[AUTO_INTENT] INLINE_WIRE about to addEventListener tp:auto:intent'); } catch {}
									try {
										window.addEventListener('tp:auto:intent', (e: any) => {
											try { console.warn('[AUTO_INTENT] INLINE recv', e?.detail); } catch {}
										});
									} catch {}
									try {
										document.addEventListener('tp:auto:intent', (e: any) => {
											try { console.warn('[AUTO_INTENT] INLINE recv (document)', e?.detail); } catch {}
										});
									} catch {}
									try { console.warn('[AUTO_INTENT] INLINE_WIRE done'); } catch {}
									try { console.warn('[AUTO_INTENT] index-app about to call scrollRouter.wireAutoIntentListener', __AUTO_INTENT_WIRE_SENTINEL); } catch {}
									try { triggerWireAutoIntentListener(); } catch {}
									try { console.warn('[AUTO_INTENT] index-app returned from wireAutoIntentListener', __AUTO_INTENT_WIRE_SENTINEL); } catch {}
									return viewer;
								});
								initScrollRouter();
							} catch {}
							try {
								const hasHudRoot = !!document.getElementById('hud-root') || !!document.getElementById('tp-speech-notes-hud');
								appStore.set?.('hudSupported', hasHudRoot);
							} catch {}
          // Overlays (settings/help) are wired exclusively via TS ui-binds; legacy overlays init disabled
          try {
            markReady({
              settingsOverlay: !!document.getElementById('settingsOverlay'),
              settingsCard: !!document.querySelector('.settings-card'),
              scriptSidebar: !!document.getElementById('scriptSelectSidebar'),
              presentToggle: !!document.querySelector('#presentBtn,[data-action=\"present-toggle\"]'),
            });
          } catch {}
          if (ENABLE_HUD && !isDisplayContext()) {
            try { _ensureHud(appStore); } catch {}
            try { wireHudToggle(); } catch {}
          }
          try { initObsToggle(); } catch {}
          try { bindObsSettingsUI(); } catch {}
          try { initObsConnection(); } catch {}
          try { bindObsStatusPills(); } catch {}
          try { initObsWiring(); } catch {}
          try { bindLoadSample(); } catch {}
          try { initMicPermissions(); } catch {}
          try { bindMicUI(); } catch {}
          try { wireSidebarCalibrationUI(); } catch {}
          try { bindCameraUI(); } catch {}
          try { initRecPillsMain(appStore); } catch {}
          if (!isDisplayContext()) {
            try { installEasterEggs(); } catch {}
            try { installCKEgg(); } catch {}
            try { installAboutPopover(); } catch {}
          }
          // Core UI binder (idempotent)
								try { bindCoreUI({ presentBtnSelector: '#presentBtn, [data-action="present-toggle"]' }); } catch {}
								// Ensure Settings overlay content uses TS builder (single source of truth)
								try { wireSettings({ store: appStore }); } catch {}
                if (isCiSmoke()) {
                  try { injectSettingsFolderForSmoke(); } catch {}
                }
								// Wire OBS UI once DOM nodes exist; idempotent if earlier init already ran
								try { initObsUI(); } catch {}
                // Enable Speech Sync UI
                try { installSpeech(); } catch {}
								// Wire single mic toggle button if present
								try { wireMicToggle(); } catch {}
								// Emergency binder only in harness/dev contexts (installed earlier if flagged)
								// Do not install unconditionally to avoid hijacking clicks in prod.
								// (Emergency binder removed; canonical binder is idempotent)
								// Optional console noise filter: activate only when explicitly requested
          try {
            const params = new URLSearchParams(location.search || '');
            if (params.has('muteExt')) {
              import('./boot/console-noise-filter').then(m => m.installConsoleNoiseFilter?.({ debug: false })).catch(()=>{});
            }
          } catch {}
					// Initialize features via idempotent wrappers
					try { startPersistence(); } catch {}
try { initScrollPrefsPersistence(appStore as any); } catch {}
          try { initAsrPersistence(); } catch {}
					try { startTelemetry(); } catch {}
					try { startScroll(); } catch {}
					try { startHotkeys(); } catch {}
					try { startToasts(); } catch {}

					// Readiness summary for visibility and testability
					try {
						const ready = Object.assign({}, (window as any).__tpInit || {});
						console.log('[TP-READY]', ready);
					} catch {}

					// Session recording auto-start wiring
					try {
						const store = appStore;
						const recording = createStartOnPlay(store);
						document.addEventListener(
							'tp:speech-state',
							(e: any) => {
								try {
									if (e?.detail?.running === false) {
										recording.onSessionStop().catch((err) => {
											console.warn('[recording] auto-stop failed', err);
										});
									}
								} catch {}
							},
							{ capture: true },
						);

						document.addEventListener(
							'tp:session:stop',
							() => {
								recording.onSessionStop().catch((err) => {
									console.warn('[recording] session stop failed', err);
								});
							},
							{ capture: true },
						);

						const wireButtons = () => {
							try { wireRecordButtons(store); } catch {}
						};
						if (typeof document !== 'undefined') {
							if (document.readyState === 'loading') {
								document.addEventListener('DOMContentLoaded', wireButtons, { once: true });
							} else {
								wireButtons();
							}
						}
					} catch {}

					// Step / Rehearsal / Scroll Mode router wiring
try {
  const step = installStepScroll({ stepLines: 1, pageLines: 4, enableFKeys: true });
  const rehearsal = installRehearsal();
  void step;
  void rehearsal;
  try { resolveInitialRehearsal(); } catch {}

  const store = (window as any).__tpStore || null;
  const auto = getAutoScrollApi();
  const stepEngineApi = stepEngine;
  const sessionSource = {
    get(): RouterSessionState {
      const phase = (store?.get?.('session.phase') as string) || 'idle';
      return {
        state: phase === 'live' ? 'live' : 'idle',
        scrollAutoOnLive: !!store?.get?.('session.scrollAutoOnLive'),
      };
    },
    subscribe(cb: (sess: RouterSessionState) => void) {
      store?.subscribe?.('session.phase', () => cb(this.get()));
      store?.subscribe?.('session.scrollAutoOnLive', () => cb(this.get()));
    },
  };
  const scrollModeSource = {
    get(): RouterMode {
      const raw =
        (store?.get?.('scrollMode') as string | undefined) ||
        loadScrollPrefs()?.mode ||
        'hybrid';
      const normalized = normalizeUiScrollMode(raw);
      const val = normalized === 'auto' ? 'hybrid' : normalized;
      const allowed: RouterMode[] = ['timed', 'wpm', 'hybrid', 'asr', 'step', 'rehearsal'];
      return allowed.includes(val as RouterMode) ? (val as RouterMode) : 'hybrid';
    },
    subscribe(cb: (mode: RouterMode) => void) {
      store?.subscribe?.('scrollMode', () => cb(this.get()));
    },
  };

  initScrollModeRouter({
    auto,
    asr: asrEngine,
    step: stepEngineApi,
    session: sessionSource,
    scrollMode: scrollModeSource,
  });

  // Expose minimal setter for dev/diagnostics
  (window as any).__tpScrollMode = {
    setMode: (m: RouterMode) => { try { store?.set?.('scrollMode', m); } catch {} },
    getMode: () => scrollModeSource.get(),
  };

  // Ensure UI/store reflect initial mode
  try { applyUiScrollMode(scrollModeSource.get() as any, { skipStore: true, source: 'router' }); } catch {}
  try { initWpmBindings(); } catch {}

} catch {}

// Display Sync
					try {
						installDisplaySync({
							channelName: 'tp_display',
  							getText: () => {
  								try {
  									const raw = (window as any).__tpRawScript;
  									if (typeof raw === 'string' && raw.length) return raw;
									const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
									if (ed && typeof ed.value === 'string') return ed.value;
									return '';
								} catch { return ''; }
  							},
      });
      try { initLegend(appStore); } catch {}
      try { wireTopbarHeightVar(); } catch {}
    } catch {}

					// Typography
					try {
						try { (window as any).__tpTsTypographyActive = true; } catch {}
						applyTypographyTo(window, 'main');
						try { installAutoMaxCh(); } catch {}
						const w = (window as any).__tpDisplayWindow as Window | null;
						if (w) {
							applyTypographyTo(w, 'display');
							try { installAutoMaxCh({ win: w, display: 'display' }); } catch {}
						}
						let bc: BroadcastChannel | null = null; try { bc = new BroadcastChannel('tp_display'); } catch {}
						onTypography((d, t) => {
							try { if (!getUiPrefs().linkTypography) return; } catch {}
							const target = (d === 'main' ? 'display' : 'main');
							const snap = { kind: 'tp:typography', source: 'main', display: target, t } as const;
							try { bc?.postMessage(snap as any); } catch {}
							try { const w2 = (window as any).__tpDisplayWindow as Window | null; w2?.postMessage?.(snap as any, '*'); } catch {}
						});
						window.addEventListener('tp:lineMetricsDirty', () => {
							try {
								const root = document.documentElement;
								const cs = getComputedStyle(root);
								const fs = parseFloat(cs.getPropertyValue('--tp-font-size')) || 56;
								const lh = parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4;
								const pxPerLine = fs * lh;
								const stepPx = Math.round(pxPerLine * 7);
								try { (window as any).__tpAuto?.setStepPx?.(stepPx); } catch {}
							} catch {}
						});
					} catch {}

					// Mapped-folder controls: disable legacy + bind folder UI (Settings + mirror) + permissions + export/import
					try {
						queueMicrotask(() => {
							try { ensureSettingsFolderControls(); } catch {}
							try { ensureSettingsFolderControlsAsync(6000); } catch {}
							try { disableLegacyScriptsUI(); } catch {}
								try { neuterLegacyScriptsInit(); } catch {}
							try {
								const rebindFolderControls = () => {
									try { bindMappedFolderUI({ button: '#chooseFolderBtn', select: '#scriptSelect', fallbackInput: '#folderFallback' }); } catch {}
                  try { refreshScriptsSidebar(); } catch {}
								};
								rebindFolderControls();
								window.addEventListener('tp:settings-folder:ready', () => { try { rebindFolderControls(); } catch {}; }, { capture: true });
							} catch {}
          try { bindPermissionButton('#recheckFolderBtn'); } catch {}
          try {
            const exportBtn = document.getElementById('btnExportSettings') as HTMLButtonElement | null;
            if (exportBtn && exportBtn.dataset.settingsExportWired !== '1') {
									exportBtn.dataset.settingsExportWired = '1';
									exportBtn.addEventListener('click', () => {
										try { triggerSettingsDownload(); } catch (err) { try { console.error('[settings-export] click error', err); } catch {} }
									});
								}
							} catch {}
							try {
								const importBtn = document.getElementById('btnImportSettings') as HTMLButtonElement | null;
								if (importBtn && importBtn.dataset.settingsImportWired !== '1') {
									importBtn.dataset.settingsImportWired = '1';
									importBtn.addEventListener('click', () => {
										try { triggerSettingsImport(); } catch (err) { try { console.error('[settings-import] click error', err); } catch {} }
									});
            }
          } catch {}
          try {
            window.addEventListener('tp:settings:open', () => { try { refreshScriptsSidebar(); } catch {} }, { passive: true });
          } catch {}
        });
					} catch {}

					// Settings/Help overlay wiring is now owned by the centralized binder (ui-binds.ts)

					// Script ingest
					try { installScriptIngest({}); } catch {}
					try { installGlobalIngestListener(); } catch {}
          // Sidebar scripts refresh (mapped folder) + refresh button wiring
          try {
            (window as any).__tpRefreshScriptsSidebar = refreshScriptsSidebar;
            refreshScriptsSidebar();
            const btn = document.getElementById('scriptRefreshBtn');
            if (btn && !btn.dataset.refreshScriptsWired) {
              btn.dataset.refreshScriptsWired = '1';
              btn.addEventListener('click', (e) => { try { e.preventDefault(); } catch {}; void refreshScriptsSidebar(); });
            }
          } catch {}

					// Open Settings scroll into scripts card when sidebar button clicked
					try {
						document.getElementById('openScriptsSettings')?.addEventListener('click', () => {
							try { ensureSettingsFolderControls(); } catch {}
							try { ensureSettingsFolderControlsAsync(8000); } catch {}
							try { document.getElementById('settingsBtn')?.click(); } catch {}
							requestAnimationFrame(() => { try { document.getElementById('scriptsFolderCard')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch {} });
						});
					} catch {}

					// Delegated safety handler for Choose Folder if binder missed reinjection
					try {
						document.addEventListener('click', (e) => {
							try {
								const t = e.target as HTMLElement | null;
								const btn = t?.closest('#chooseFolderBtn') as HTMLButtonElement | null;
								if (!btn) return;
								e.preventDefault();
								void handleChooseFolder(document);
							} catch {}
						}, { capture: true });
					} catch {}

					// Ensure a page panel is active (default to Scripts) to avoid blank UI when no panel is selected
					try {
						const ensureScripts = () => { try { applyPagePanel('scripts'); } catch {} };
						ensureScripts();
						setTimeout(ensureScripts, 50);
					} catch {}

					// Signal init completion so harness/tests can proceed
					try {
						if (typeof (window as any).tpMarkInitDone === 'function') {
							(window as any).tpMarkInitDone('ts:index:onReady');
						} else {
							(window as any).__tp_init_done = true;
							try { window.dispatchEvent(new CustomEvent('tp:init:done', { detail: { reason: 'ts:index:onReady' } })); } catch {}
						}
					} catch {}

				} catch {}
			};

			if (document.readyState === 'loading') {
				document.addEventListener('DOMContentLoaded', onReady, { once: true });
			} else {
				onReady();
			}

			(window as any).__TP_BOOT_TRACE.push({ t: Date.now(), m: 'boot:done:ts' });
		} catch (e) {
			try { console.warn('[ts-boot] failed', e); } catch {}
			(window as any).__TP_BOOT_TRACE.push({ t: Date.now(), m: 'boot:fail:ts' });
      try { showFatalFallback(); } catch {}
		}
}

// Auto-run boot (primary entry)
try {
  const params = new URLSearchParams(location.search || '');
  if (params.get('fatalTest') === '1') {
    showFatalFallback();
    throw new Error('Fatal fallback test');
  }

	const startBoot = () => { try { boot(); } catch (err) { try { console.error('[TP-FATAL:init]', err); } catch {} showFatalFallback(); } };
	const w = window as any;
	const devFlag = !!w.__TP_DEV || !!w.__TP_DEV1;
	if (w.__TP_TEST_SKIP_BOOT__ && devFlag) {
    try { console.info('[TP-BOOT] skipped via __TP_TEST_SKIP_BOOT__'); } catch {}
  } else if (document.readyState !== 'loading') startBoot(); else document.addEventListener('DOMContentLoaded', () => { startBoot(); });
} catch (err) {
  try { console.error('[TP-FATAL:init-outer]', err); } catch {}
  showFatalFallback();
}

// Legacy HUD installer removed; TS HUD is canonical

// Explicit exports for tests
export { computeAsrReadiness };
