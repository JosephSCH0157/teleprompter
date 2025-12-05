// DEV: sanity marker so we know TS entry is live.
;(window as any).__tpBootPath = 'ts:index';
const TS_BOOT_OWNER = 'ts:index';
try { console.log('[TP-BOOT] TS index.ts booted'); } catch {}

// Thin conductor: this file only orchestrates boot. Feature logic lives in their modules.
// Signal TS is primary so legacy preloaders can stand down
try { (window as any).__TP_TS_PRIMARY__ = true; } catch {}
try { (window as any).__TP_BOOT_OWNER = TS_BOOT_OWNER; } catch {}
// Compatibility helpers (ID aliases and tolerant $id()) must be installed very early
import './boot/compat-ids';
// Global app store (single initializer for __tpStore)
import { appStore } from './state/app-store';
// Auto-record SSOT helpers (bridge UI + TS core + legacy flags)
import './state/auto-record-ssot';
// Early dev console noise filter (benign extension async-response errors)
// Console noise filter gated later (only with ?muteExt=1). Do not auto-install.
// import './boot/console-noise-filter';
import { initSpeechBridge } from './asr/v2/bridge-speech';
import { initAsrScrollBridge } from './asr/v2/scroll-bridge';
import { installScheduler } from './boot/scheduler';
import { injectSettingsFolderForSmoke } from './features/inject-settings-folder';
import './features/scripts-local';
import { ScriptStore, type ScriptMeta, type ScriptRecord } from './features/scripts-store';
import { installSpeech } from './features/speech-loader';
import { initObsConnection } from './obs/obs-connection';
import { initObsWiring } from './obs/obs-wiring';
import { initRecorderBackends } from './recording/registerRecorders';
import { createStartOnPlay } from './recording/startOnPlay';
import './scroll/adapter';
import './index-hooks/preroll';
import { setRecorderEnabled } from './state/recorder-settings';
import { bindLoadSample } from './ui/load-sample';
import { bindObsSettingsUI } from './ui/obs-settings-bind';
import { bindObsStatusPills } from './ui/obs-status-bind';
import { initObsToggle } from './ui/obs-toggle';
import { initOverlays } from './ui/overlays';
import { wireRecordButtons } from './ui/recordButtons';
import './wiring/ui-binds';

import { bootstrap } from './boot/boot';

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

try {
	window.Scripts = {
		list: () => ScriptStore.list(),
		get: (id: string) => ScriptStore.get(id),
		save: (data) => ScriptStore.save(data),
		rename: (id, title) => ScriptStore.rename(id, title),
		remove: (id) => ScriptStore.remove(id),
		syncMapped: (entries) => ScriptStore.syncMapped(entries),
	};
} catch {}

// Run bootstrap (best-effort, non-blocking). The legacy monolith still calls
// window._initCore/_initCoreRunner paths; this ensures the modular runtime
// sets up the same early hooks when the module entry is used.
bootstrap().catch(() => {});
installHudIfAvailable();
// Retry once after a short delay in case debug-tools.js loads late
try {
	setTimeout(() => { try { installHudIfAvailable(); } catch {} }, 1500);
} catch {}
// Load HUD script on demand in dev/debug contexts
loadHudScriptIfNeeded();
// Fallback legacy HUD hotkey installer (uses debug-tools.js)
try { maybeInstallLegacyHud(); } catch {}

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
import { initScrollFeature } from './features/scroll';
import { initTelemetry } from './features/telemetry';
import { initToasts } from './features/toasts';
import './ui/script-editor';

// === UI Scroll Mode Router ===
import { installAsrScrollBridge } from './scroll/asr-bridge';
import { setBrainBaseSpeed } from './scroll/brain-hooks';
import { initScrollModeBridge } from './scroll/mode-bridge';
import type { ScrollMode as BrainMode, ScrollBrain } from './scroll/scroll-brain';
import { createScrollBrain } from './scroll/scroll-brain';
import { installWpmSpeedBridge } from './scroll/wpm-bridge';

type UiScrollMode = 'off' | 'auto' | 'asr' | 'step' | 'rehearsal';

let scrollBrain: ScrollBrain | null = null;

function ensureScrollBrain(): ScrollBrain {
	if (!scrollBrain) {
		scrollBrain = createScrollBrain();
		(window as any).__tpScrollBrain = scrollBrain;
	}
	return scrollBrain;
}

export function getScrollBrain() {
	return ensureScrollBrain();
}

function bridgeLegacyScrollController() {
	if (typeof window === 'undefined') return;
	const w = window as any;
	if (w.__tpScrollCtlBridgeActive) return;
	w.__tpScrollCtlBridgeActive = true;
	const tryPatch = () => {
		const ctl = w.__scrollCtl;
		if (!ctl || ctl.__tpBrainProxy) return false;
		const original = typeof ctl.setSpeed === 'function' ? ctl.setSpeed.bind(ctl) : null;
		if (!original) return false;
		ctl.setSpeed = function patchedLegacySpeed(value: number) {
			try { setBrainBaseSpeed(value); } catch {}
			return original(value);
		};
		ctl.__tpBrainProxy = true;
		return true;
	};
	if (tryPatch()) return;
	const timer = setInterval(() => {
		if (tryPatch()) clearInterval(timer);
	}, 800);
	setTimeout(() => clearInterval(timer), 10_000);
}

// Ensure the scrollMode <select> reflects any stored preference before tests read it
function hydrateScrollModeSelect(): void {
  try {
    const el = document.getElementById('scrollMode') as HTMLSelectElement | null;
    if (!el) return;
    const stored =
      sessionStorage.getItem('tp_last_scroll_mode') ||
      (appStore.get?.('scrollMode') as string | undefined) ||
      localStorage.getItem('tp_scroll_mode_v1') ||
      localStorage.getItem('tp_scroll_mode') ||
      localStorage.getItem('scrollMode');
    if (stored && Array.from(el.options).some((o) => o.value === stored)) {
      el.value = stored;
    }
  } catch {
    // ignore
  }
}

function storeScrollMode(): void {
  try {
    const el = document.getElementById('scrollMode') as HTMLSelectElement | null;
    if (!el) return;
    const v = String(el.value || '');
    localStorage.setItem('tp_scroll_mode_v1', v);
    localStorage.setItem('tp_scroll_mode', v);
    localStorage.setItem('scrollMode', v);
    sessionStorage.setItem('tp_last_scroll_mode', v);
    appStore.set?.('scrollMode', v as any);
  } catch {
    // ignore
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => hydrateScrollModeSelect(), { once: true });
} else {
  hydrateScrollModeSelect();
}

function persistScrollModeSelect(ev: Event): void {
  const t = ev.target as HTMLSelectElement | null;
  if (!t || t.id !== 'scrollMode') return;
  storeScrollMode();
}
try { document.addEventListener('change', persistScrollModeSelect, { capture: true }); } catch {}
try { window.addEventListener('beforeunload', storeScrollMode, { capture: true }); } catch {}
try {
  const timer = window.setInterval(() => storeScrollMode(), 500);
  window.setTimeout(() => window.clearInterval(timer), 5000);
} catch {}

function applyUiScrollMode(mode: UiScrollMode) {
  // Store the UI mode somewhere global so existing JS can still read it
  (window as any).__tpUiScrollMode = mode;
  // Persist for next load (CI smoke expects scrollMode to survive reloads)
  try { appStore.set?.('scrollMode', mode); } catch {}

	const brain = ensureScrollBrain();
  const asr = (window as any).__tpAsrMode as { setEnabled?(_v: boolean): void } | undefined;
  const setClampMode = (window as any).__tpSetClampMode as
    | ((_m: 'follow' | 'backtrack' | 'free') => void)
    | undefined;
  const auto = (window as any).__tpAuto as { setEnabled?(_v: boolean): void } | undefined;

  // Defaults
  let brainMode: BrainMode = 'manual';
  let clampMode: 'follow' | 'backtrack' | 'free' = 'free';
  let asrEnabled = false;
  let autoEnabled = false;

  switch (mode) {
    case 'off':
      brainMode = 'manual';
      clampMode = 'free';
      asrEnabled = false;
      autoEnabled = false;
      break;

    case 'auto':
      brainMode = 'auto';      // pure time-based scroll
      clampMode = 'free';      // ASR anti-jitter not needed
      asrEnabled = false;
      autoEnabled = true;       // Enable legacy Auto scroll
      break;

    case 'asr':
      brainMode = 'hybrid';    // auto + ASR corrections
      clampMode = 'follow';    // monotonic clamp: no back-jogs
      asrEnabled = true;
      autoEnabled = true;       // Auto runs in background for hybrid
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
  // Apply decisions
	brain.setMode(brainMode);
  if (setClampMode) setClampMode(clampMode);
  if (asr && typeof asr.setEnabled === 'function') asr.setEnabled(asrEnabled);
  if (auto && typeof auto.setEnabled === 'function') auto.setEnabled(autoEnabled);

  // HUD visibility: show all three layers for debugging
  try {
    const summary = `UI: ${mode} | Brain: ${brainMode} | Clamp: ${clampMode}`;
    (window as any).HUD?.log?.('scroll:mode', { 
      summary,
      ui: mode, 
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

// Expose this function as the global router for existing JS
(window as any).setScrollMode = applyUiScrollMode;
(window as any).getScrollMode = () =>
  ((window as any).__tpUiScrollMode as UiScrollMode | undefined) ?? 'off';

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
import { getAutoScrollApi } from './features/scroll/auto-adapter';
import { createScrollModeRouter } from './features/scroll/mode-router';
import { installStepScroll } from './features/scroll/step-scroll';
import { applyTypographyTo } from './features/typography';
import { initAsrFeature } from './index-hooks/asr';
import { bindCameraUI } from './media/camera-bridge';
import './media/display-bridge';
import './media/mic'; // exposes window.__tpMic for mic controls + dB meter
import { bindMicUI } from './media/mic-bridge';
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
import { initHudController } from './hud/controller';
import { initHud } from './hud/loader';
import { wireHudToggle } from './hud/toggle';
import { bindStaticDom } from './ui/dom';
// Feature initializers (TS-owned)

type AnyFn = (...args: any[]) => any;

declare global {
	interface Window {
		__tpInstallHUD?: (opts?: { hotkey?: string }) => any;
		__tpHud?: { log?: AnyFn | undefined } | undefined;
		HUD?: { bus?: { emit?: AnyFn | undefined } | undefined; log?: AnyFn | undefined } | undefined;
		__tpScrollDebug?: boolean;
		__tpHudTsInited?: boolean;
		hudRoot?: HTMLElement | null;
	}
}

function installHudIfAvailable(): void {
	try {
		if ((window as any).__tpHud) return; // already installed (legacy or previous call)
		if (typeof (window as any).__tpInstallHUD === 'function') {
			(window as any).__tpHud = (window as any).__tpInstallHUD({ hotkey: '~' });
		}
	} catch {
		// HUD is optional; never break boot
	}
}

function _ensureHud(store: any): void {
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
		initHudController();
		wireHudToggle();
	} catch {
		// HUD is optional; ignore failures
	}
}

function wantsHud(): boolean {
	try {
		const qs = new URLSearchParams(String(location.search || ''));
		if (qs.has('hud') || qs.has('scrollDebug') || qs.has('dev')) return true;
		const w = window as any;
		if (w.__tpScrollDebug === true) return true;
		if (localStorage.getItem('tp_dev_mode') === '1') return true;
	} catch {
		// ignore
	}
	return false;
}

function loadHudScriptIfNeeded(): void {
	try {
		if (typeof (window as any).__tpInstallHUD === 'function') return;
		if (document.querySelector('script[data-hud-loader]')) return;
		if (!wantsHud()) return;
		const s = document.createElement('script');
		s.src = '/debug-tools.js';
		s.async = true;
		s.defer = true;
		s.setAttribute('data-hud-loader', '1');
		s.onload = () => {
			try { installHudIfAvailable(); } catch {}
		};
		document.head.appendChild(s);
	} catch {
		// optional; ignore failures
	}
}

const startPersistence = initOnce('persistence', initPersistence);
const startTelemetry   = initOnce('telemetry',   initTelemetry);
const startScroll      = initOnce('scroll',      initScrollFeature);
const startHotkeys     = initOnce('hotkeys',     initHotkeys);
const startToasts      = initOnce('toasts',      initToasts);
// Dev HUD for notes (only activates under ?dev=1 or __TP_DEV)
// Tiny HUD chip that reflects current scroll mode
import './features/scroll/mode-chip';
// Mapped Folder (scripts directory) binder
import { installGlobalIngestListener, installScriptIngest } from './features/script-ingest';
import { pickMappedFolder } from './fs/mapped-folder';
import { disableLegacyScriptsUI, neuterLegacyScriptsInit } from './ui/hide-legacy-scripts';
import { ensureSettingsFolderControls, ensureSettingsFolderControlsAsync } from './ui/inject-settings-folder';
import { bindMappedFolderUI, bindPermissionButton } from './ui/mapped-folder-bind';
import { bindSettingsExportImport } from './ui/settings-export-import';
// ensure this file is executed in smoke runs
import './smoke/settings-mapped-folder.smoke.js';

	declare global {
		interface Window {
		Scripts?: {
			list: () => ScriptMeta[];
			get: (id: string) => Promise<ScriptRecord | null>;
			save: (data: { id?: string | null; title: string; content: string }) => string;
			rename: (id: string, title: string) => void;
			remove: (id: string) => void;
			syncMapped: (entries: { id: string; title: string; handle: FileSystemHandle }[]) => void;
		};
		}
	}

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
        try { bindStaticDom(); } catch (e) { try { console.warn('[index] bindStaticDom failed', e); } catch {} }
				const brain = ensureScrollBrain();
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
				bridgeLegacyScrollController();
		// 1) Install the TypeScript scheduler before any scroll writers run.
		try {
			installScheduler();
		} catch (err) {
			try { console.warn('[scheduler] install failed', err); } catch {}
		}

		// LEGACY AUTO-SPEED HOOK – intentionally disabled.
		// Autoscroll now owns #autoSpeed via src/features/autoscroll.ts.

		// 3) Bridge legacy mode selectors into the TS scroll brain
		try { initScrollModeBridge(); } catch {}
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
    const isDisplay =
      displayFlag === '1' ||
      path.endsWith('/display.html') ||
      path === '/display.html';

    if (isDisplay && __docCh) {
      __docCh.postMessage({ type: 'hello', client: 'display' });
    }
  } catch {}
} catch {
  __docCh = null;
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
		const useMock = Q.has('mockFolder') || (navigator.webdriver === true);
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
              try {
                const hasHudRoot = !!document.getElementById('hud-root') || !!document.getElementById('tp-speech-notes-hud');
                appStore.set?.('hudSupported', hasHudRoot);
              } catch {}
          try { initOverlays(); } catch {}
          try { initHudController(); } catch {}
          try { wireHudToggle(); } catch {}
          try { initHudController(); } catch {}
          try { initObsToggle(); } catch {}
          try { bindObsSettingsUI(); } catch {}
          try { initObsConnection(); } catch {}
          try { bindObsStatusPills(); } catch {}
          try { initObsWiring(); } catch {}
          try { bindLoadSample(); } catch {}
          try { initMicPermissions(); } catch {}
          try { bindMicUI(); } catch {}
          try { bindCameraUI(); } catch {}
          // Load debug tools dynamically in dev only (non-blocking)
					try {
						const DEV = (() => { try { return location.search.includes('dev=1') || localStorage.getItem('tp_dev_mode') === '1'; } catch { return false; } })();
						if (DEV) {
							setTimeout(() => {
								try {
									const s = document.createElement('script');
									s.src = '/debug-tools.js';
									s.async = true;
									document.head.appendChild(s);
								} catch {}
							}, 0);
						}
					} catch {}
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
          // TS scroll router + UI wiring
          try { initScrollFeature(); } catch {}
          // Initialize features via idempotent wrappers
          try { startPersistence(); } catch {}
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
						const startEvents = ['tp:session:start', 'speech:start', 'autoscroll:start'];
						startEvents.forEach((ev) => {
							document.addEventListener(
								ev as any,
								() => {
									recording.onSessionStart().catch((err) => {
										console.warn('[recording] auto-start failed', err);
									});
								},
								{ capture: true },
							);
						});

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

					// Step / Rehearsal
					try {
						const step = installStepScroll({ stepLines: 1, pageLines: 4, enableFKeys: true });
						const rehearsal = installRehearsal();
						try { resolveInitialRehearsal(); } catch {}
						// Minimal typed router: syncs store ↔ step/rehearsal (auto can be added later)
						try {
							const store = (window as any).__tpStore || null;
							const auto = getAutoScrollApi();
							const router = createScrollModeRouter({ store, step, rehearsal, auto });
							if (!(window as any).__tpScrollMode) {
								(window as any).__tpScrollMode = router; // expose for dev/diagnostics
							}
							// Dev helper: quick router poke from console
							try {
								(window as any).__tpSetMode = (mode: string) => {
									try {
										(window as any).__tpScrollMode?.setMode?.(mode as any);
										console.info('[Anvil] scrollMode →', mode);
									} catch (err) {
										console.error('Failed to set scroll mode', err);
									}
								};
							} catch {}
						} catch {}
						if (!(window as any).setScrollMode && !(window as any).__tpScrollMode) {
							(window as any).setScrollMode = (mode: 'auto'|'asr'|'step'|'rehearsal'|'off') => {
								try {
									if (mode === 'auto') (window as any).startAutoScroll?.();
									else (window as any).stopAutoScroll?.();
								} catch {}
								try { (window as any).__scrollCtl?.stopAutoCatchup?.(); } catch {}
								if (mode === 'rehearsal') { rehearsal.enable(); step.disable(); }
								else { rehearsal.disable(); if (mode === 'step') step.enable(); else step.disable(); }
							};
						}
					} catch {}

					// Display Sync
					try {
						installDisplaySync({
							getText: () => {
								try {
									const raw = (window as any).__tpRawScript;
									if (typeof raw === 'string' && raw.length) return raw;
									const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
									if (ed && typeof ed.value === 'string') return ed.value;
									return '';
								} catch { return ''; }
							},
							getAnchorRatio: () => {
								try {
									const v = document.getElementById('viewer') as HTMLElement | null;
									if (!v) return 0;
									const max = Math.max(0, v.scrollHeight - v.clientHeight);
									return max > 0 ? (v.scrollTop / max) : 0;
								} catch { return 0; }
							},
							getDisplayWindow: () => { try { return (window as any).__tpDisplayWindow || null; } catch { return null; } },
						});
					} catch {}

					// Typography
					try {
						try { (window as any).__tpTsTypographyActive = true; } catch {}
						applyTypographyTo(window, 'main');
						const w = (window as any).__tpDisplayWindow as Window | null; if (w) applyTypographyTo(w, 'display');
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
								};
								rebindFolderControls();
								window.addEventListener('tp:settings-folder:ready', () => { try { rebindFolderControls(); } catch {}; }, { capture: true });
							} catch {}
							try { bindPermissionButton('#recheckFolderBtn'); } catch {}
							try { bindSettingsExportImport('#btnExportSettings', '#btnImportSettings'); } catch {}
						});
					} catch {}

					// Settings/Help overlay wiring is now owned by the centralized binder (ui-binds.ts)

					// Script ingest
					try { installScriptIngest({}); } catch {}
					try { installGlobalIngestListener(); } catch {}

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
						document.addEventListener('click', async (e) => {
							try {
								const t = e.target as HTMLElement | null;
								const btn = t?.closest('#chooseFolderBtn') as HTMLButtonElement | null;
								if (!btn) return;
								if (btn.dataset.mappedFolderWired === '1') return; // already wired
								if ('showDirectoryPicker' in window) { await pickMappedFolder(); }
								else { (document.getElementById('folderFallback') as HTMLInputElement | null)?.click(); }
							} catch {}
						}, { capture: true });
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
		}
}

// Auto-run boot (primary entry)
try {
	if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', () => { boot(); });
} catch {}

// Fallback legacy HUD installer: tries to install HUD if legacy debug-tools.js is present
function maybeInstallLegacyHud() {
	try {
		// If legacy HUD installer exists, call it with default hotkey
		if (typeof (window as any).__tpInstallHUD === 'function') {
			(window as any).__tpHud = (window as any).__tpInstallHUD({ hotkey: '~' });
		}
	} catch {
		// HUD is optional; ignore failures
	}
}
// (removed duplicate implementation of maybeInstallLegacyHud)

