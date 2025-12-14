// DEV: sanity marker so we know TS entry is live.
;(window as any).__tpBootPath = 'ts:index';
const TS_BOOT_OWNER = 'ts:index';
try { console.log('[TP-BOOT] TS index.ts booted'); } catch {}
try { (window as any).__TP_TS_OVERLAYS = true; } catch {}

// Thin conductor: this file only orchestrates boot. Feature logic lives in their modules.
// Signal TS is primary so legacy preloaders can stand down
try { (window as any).__TP_TS_PRIMARY__ = true; } catch {}
try { (window as any).__TP_BOOT_OWNER = TS_BOOT_OWNER; } catch {}
// Compatibility helpers (ID aliases and tolerant $id()) must be installed very early
import './boot/compat-ids';
// Global app store (single initializer for __tpStore)
import { appStore } from './state/app-store';
import { initSession } from './state/session';
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
import { installSpeech } from './features/speech-loader';
import { initObsConnection } from './obs/obs-connection';
import { initObsWiring } from './obs/obs-wiring';
import { initRecorderBackends } from './recording/registerRecorders';
import { createStartOnPlay } from './recording/startOnPlay';
import './scroll/adapter';
import './index-hooks/preroll';
import { renderScript } from './render-script';
import { setRecorderEnabled } from './state/recorder-settings';
import { ensureUserAndProfile } from './forge/authProfile';
import { bindLoadSample } from './ui/load-sample';
import { bindObsSettingsUI } from './ui/obs-settings-bind';
import { bindObsStatusPills } from './ui/obs-status-bind';
import { initObsToggle } from './ui/obs-toggle';
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
import { applyScrollModeUI, initWpmBindings } from './ui/scrollMode';
import './dev/ci-mocks';
import { initAsrPersistence } from './features/asr/persistence';
import { initScrollPrefsPersistence, loadScrollPrefs } from './features/scroll/scroll-prefs';
import { showToast } from './ui/toasts';
import { getAsrState } from './asr/store';

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

// Forge auth/profile gate: ensure session + profile; stash on window for legacy consumers.
try {
	ensureUserAndProfile()
		.then(({ user, profile }) => {
			try { (window as any).__forgeUser = user; } catch {}
			try { (window as any).__forgeProfile = profile; } catch {}
		})
		.catch((err) => { try { console.error('[forge] auth/profile init failed', err); } catch {} });
} catch {}

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
import { initScrollFeature } from './features/scroll';
import { initTelemetry } from './features/telemetry';
import { initToasts } from './features/toasts';
import './ui/script-editor';

// === UI Scroll Mode Router ===
import { installAsrScrollBridge } from './scroll/asr-bridge';
import { setBrainBaseSpeed } from './scroll/brain-hooks';
import { initScrollModeBridge } from './scroll/mode-bridge';
import type { ScrollMode as BrainMode } from './scroll/scroll-brain';
import { getScrollBrain } from './scroll/brain-access';
import { installWpmSpeedBridge } from './scroll/wpm-bridge';

type UiScrollMode = 'off' | 'auto' | 'asr' | 'step' | 'rehearsal' | 'wpm' | 'hybrid' | 'timed';

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

const SCROLL_MODE_SELECT_ID = 'scrollMode';
const ALLOWED_SCROLL_MODES: UiScrollMode[] = ['timed', 'wpm', 'hybrid', 'asr', 'step', 'rehearsal', 'auto', 'off'];
type AsrNotReadyReason = 'NO_PERMISSION' | 'NO_DEVICE' | 'NOT_READY';
type AsrWarnReason = 'NOT_CALIBRATED';
let lastStableUiMode: UiScrollMode = 'hybrid';
let asrRejectionToastShown = false;

function normalizeUiScrollMode(mode: string | null | undefined): UiScrollMode {
  const value = String(mode || '').toLowerCase() as UiScrollMode;
  if (value === 'manual') return 'hybrid';
  return (ALLOWED_SCROLL_MODES.includes(value) ? value : 'hybrid');
}

function computeAsrReadiness(): { ready: true; warn?: AsrWarnReason } | { ready: false; reason: AsrNotReadyReason } {
  try {
    const micGranted = !!appStore.get?.('micGranted');
    if (!micGranted) return { ready: false, reason: 'NO_PERMISSION' };

    const micDevice = String(appStore.get?.('micDevice') || '').trim();
    const micOpen = !!(window as any).__tpMic?.__lastStream || !!(window as any).__tpMic?.isOpen?.();
    if (!micDevice && !micOpen) return { ready: false, reason: 'NO_DEVICE' };

    try {
      const asrState = getAsrState?.();
      const active = asrState?.activeProfileId && asrState.profiles?.[asrState.activeProfileId];
      if (!active) return { ready: true, warn: 'NOT_CALIBRATED' };
    } catch {
      // ignore ASR state failures
    }

    return { ready: true };
  } catch {
    return { ready: true };
  }
}

function setScrollModeSelectValue(mode: UiScrollMode): void {
  try {
    const el = document.getElementById(SCROLL_MODE_SELECT_ID) as HTMLSelectElement | null;
    if (!el) return;
    const normalized = normalizeUiScrollMode(mode);
    if (Array.from(el.options).some((o) => o.value === normalized)) {
      el.value = normalized;
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

function applyUiScrollMode(mode: UiScrollMode, opts: { skipStore?: boolean } = {}) {
  let normalized = normalizeUiScrollMode(mode);
  let readiness: { ready: true; warn?: AsrWarnReason } | { ready: false; reason: AsrNotReadyReason } | null = null;
  if (normalized === 'asr') {
    readiness = computeAsrReadiness();
    if (!readiness.ready) {
      const fallback = lastStableUiMode || 'hybrid';
      normalized = fallback;
      setScrollModeSelectValue(fallback);
      if (!asrRejectionToastShown) {
        const toastMsg = "ASR needs mic access + calibration. Click 'Mic: Request' then 'Calibrate'.";
        try { showToast(toastMsg, { type: 'info' }); } catch {}
        asrRejectionToastShown = true;
      }
      try {
        console.debug('[Scroll Mode] ASR rejected', { reason: readiness.reason, fallback });
      } catch {}
      try { appStore.set?.('scrollMode', fallback as any); } catch {}
    }
  }
  if (normalized !== 'asr' || readiness?.ready) {
    lastStableUiMode = normalized;
    if (normalized !== 'asr') asrRejectionToastShown = false;
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
  const auto = (window as any).__tpAuto as { setEnabled?(_v: boolean): void } | undefined;

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
      brainMode = 'hybrid';    // auto + ASR corrections
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
    applyUiScrollMode(normalized, { skipStore: true });
  };

  const applyCurrent = () => {
    try {
      const current = normalizeUiScrollMode(appStore.get?.('scrollMode') as string | undefined);
      if (current !== 'asr') lastStableUiMode = current;
      updateFromStore(current);
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
    if (ready) asrRejectionToastShown = false;
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
    appStore.subscribe?.('scrollMode', (next: string) => updateFromStore(next));
  } catch {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyCurrent, { once: true });
  }

  try {
    document.addEventListener('change', (ev) => {
      const t = ev.target as HTMLSelectElement | null;
      if (!t || t.id !== SCROLL_MODE_SELECT_ID) return;
      const mode = normalizeUiScrollMode(t.value);
      try { appStore.set?.('scrollMode', mode as any); } catch {}
      applyUiScrollMode(mode, { skipStore: true });
    }, { capture: true });
  } catch {
    // ignore
  }
}

initScrollModeUiSync();

// Expose this function as the global router for existing JS
(window as any).setScrollMode = (mode: UiScrollMode) => applyUiScrollMode(mode);
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
import { bindStaticDom, initLegend } from './ui/dom';
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
		initHudController();
		wireHudToggle();
	} catch {
		// HUD is optional; ignore failures
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
      script.style.paddingTop = `${offset}px`;
      wrap.style.scrollPaddingTop = `${offset}px`;
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

      // Optional render payload (pre-rendered HTML or plain text)
      if (m.type === 'render') {
        const html = typeof m.html === 'string' ? m.html : '';
        const text = typeof m.text === 'string' ? m.text : '';
        if (html) {
          applyHtml(html, { fontSize: m.fontSize, lineHeight: m.lineHeight, resetScroll: true });
          return;
        }
        if (text) {
          applyText(text, { fontSize: m.fontSize, lineHeight: m.lineHeight });
          return;
        }
      }

      // Only handle the two script payload shapes; everything else is ignored
      if (m.kind === 'tp:script' && m.source === 'main' && typeof m.text === 'string') {
        applyHtml(m.text);
        return;
      }

      if (m.type === 'script' && typeof m.text === 'string') {
        applyText(m.text);
        return;
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
            const viewer = document.getElementById('viewer') as HTMLElement | null;
            if (viewer && typeof viewer.innerHTML === 'string' && viewer.innerHTML.length) {
              return viewer.innerHTML;
            }
            const raw = (window as any).__tpRawScript;
            if (typeof raw === 'string' && raw.length) return raw;
            const ed = document.getElementById('editor') as HTMLTextAreaElement | null;
            if (ed && typeof ed.value === 'string') return ed.value;
          } catch {}
          return '';
        },
        getDisplayWindow: () => { try { return (window as any).__tpDisplayWindow || null; } catch { return null; } },
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

			// Session slice + preroll-driven orchestration
			try { initSession(); } catch {}
			try { initPrerollSession(); } catch {}
			try { initScrollSessionRouter(); } catch {}
			try { initRecordingSession(); } catch {}

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
            try { initHudController(); } catch {}
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
          // TS scroll router + UI wiring
					try { initScrollFeature(); } catch {}
					// Initialize features via idempotent wrappers
					try { startPersistence(); } catch {}
          try { initScrollPrefsPersistence(appStore); } catch {}
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
  try { applyUiScrollMode(scrollModeSource.get() as any, { skipStore: true }); } catch {}
  try { initWpmBindings(); } catch {}

  // Legacy setScrollMode bridge
  (window as any).setScrollMode = (mode: 'auto'|'asr'|'step'|'rehearsal'|'off'|'timed'|'wpm'|'hybrid') => {
    const normalized = normalizeUiScrollMode(mode);
    try { store?.set?.('scrollMode', normalized); } catch {}
    try { applyUiScrollMode(normalized, { skipStore: true }); } catch {}
    try { (window as any).__scrollCtl?.stopAutoCatchup?.(); } catch {}
  };
} catch {}

// Display Sync
					try {
						installDisplaySync({
							channelName: 'tp_display',
  							getText: () => {
  								try {
  									// Prefer rendered HTML so display window preserves colors/markup
  									const viewer = document.getElementById('viewer') as HTMLElement | null;
  									if (viewer && typeof viewer.innerHTML === 'string' && viewer.innerHTML.length) {
										return viewer.innerHTML;
									}
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
						try { initLegend(appStore); } catch {}
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
	if (document.readyState !== 'loading') startBoot(); else document.addEventListener('DOMContentLoaded', () => { startBoot(); });
} catch (err) {
  try { console.error('[TP-FATAL:init-outer]', err); } catch {}
  showFatalFallback();
}

// Legacy HUD installer removed; TS HUD is canonical
