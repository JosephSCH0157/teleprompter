// Signal TS is primary so legacy preloaders can stand down
try { (window as any).__TP_TS_PRIMARY__ = true; } catch {}
// Compatibility helpers (ID aliases and tolerant $id()) must be installed very early
import './boot/compat-ids';
// Early dev console noise filter (benign extension async-response errors)
import './boot/console-noise-filter';

import { bootstrap } from './boot/boot';

// Idempotent init guard for feature initializers (prevents double-init as we migrate)
function initOnce<T extends (..._args: any[]) => any>(name: string, fn: T): T {
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

// Run bootstrap (best-effort, non-blocking). The legacy monolith still calls
// window._initCore/_initCoreRunner paths; this ensures the modular runtime
// sets up the same early hooks when the module entry is used.
bootstrap().catch(() => {});

// Install vendor shims (mammoth) so legacy code can use window.ensureMammoth
import './vendor/mammoth';
// Settings → ASR wizard wiring (safe to import; guards on element presence)
import './ui/settings/asrWizard';
// Feature initializers (legacy JS modules)
// If/when these are migrated to TS, drop the .js extension and types will flow.
import { initHotkeys } from './features/hotkeys.js';
import { initPersistence } from './features/persistence.js';
import { initScroll } from './features/scroll.js';
import { initTelemetry } from './features/telemetry.js';

// === UI Scroll Mode Router ===
import type { ScrollMode as BrainMode, ScrollBrain } from './scroll/scroll-brain';
import { createScrollBrain } from './scroll/scroll-brain';

type UiScrollMode = 'off' | 'auto' | 'asr' | 'step' | 'rehearsal';

// Create and expose the scroll brain globally
const scrollBrain = createScrollBrain();
(window as any).__tpScrollBrain = scrollBrain;

function applyUiScrollMode(mode: UiScrollMode) {
  // Store the UI mode somewhere global so existing JS can still read it
  (window as any).__tpUiScrollMode = mode;

  const brain = (window as any).__tpScrollBrain as ScrollBrain | undefined;
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
  if (brain) brain.setMode(brainMode);
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

// === End UI Scroll Mode Router ===

// The compiled bundle (./dist/index.js) will import other modules and
// eventually assign window.__tpRealCore or resolve the _initCore waiter.

// Optional: wire Auto-scroll + install scroll router in TS path as well
import './asr/v2/prompts';
import * as Auto from './features/autoscroll.js';
import { installDisplaySync } from './features/display-sync';
import { installRehearsal, resolveInitialRehearsal } from './features/rehearsal';
import { installScrollRouter } from './features/scroll-router';
import { installStepScroll } from './features/step-scroll';
import { applyTypographyTo } from './features/typography';
import { initAsrFeature } from './index-hooks/asr';
import { onTypography } from './settings/typographyStore';
import { getUiPrefs } from './settings/uiPrefs';
import './ui/micMenu';
import { initObsBridgeClaim } from './wiring/obs-bridge-claim';
import { initObsUI } from './wiring/obs-wiring';
// Feature initializers (legacy JS modules)
// If/when these are migrated to TS, drop the .js extension and types will flow.
// Create idempotent starters
const startPersistence = initOnce('persistence', initPersistence);
const startTelemetry   = initOnce('telemetry',   initTelemetry);
const startScroll      = initOnce('scroll',      initScroll);
const startHotkeys     = initOnce('hotkeys',     initHotkeys);
// Dev HUD for notes (only activates under ?dev=1 or __TP_DEV)
import './hud/loader';
// Mapped Folder (scripts directory) binder
import { installScriptIngest } from './features/script-ingest';
import { pickMappedFolder } from './fs/mapped-folder';
import { disableLegacyScriptsUI, neuterLegacyScriptsInit } from './ui/hide-legacy-scripts';
import { ensureSettingsFolderControls, ensureSettingsFolderControlsAsync } from './ui/inject-settings-folder';
import { bindMappedFolderUI, bindPermissionButton } from './ui/mapped-folder-bind';
import { bindSettingsExportImport } from './ui/settings-export-import';
// ensure this file is executed in smoke runs
import './smoke/settings-mapped-folder.smoke.js';
// Defer loading speech notes HUD until legacy/debug HUD announces readiness so the legacy bus exists first.
function injectSpeechNotesHud(){
	try {
		if (document.getElementById('tp-speech-notes-hud')) return; // already present
		const s = document.createElement('script');
		s.src = './hud/speech-notes-hud.js';
		s.async = true; // non-blocking
		document.head.appendChild(s);
	} catch {}
}
window.addEventListener('hud:ready', () => { injectSpeechNotesHud(); }, { once: true });
if ((window as any).__tpHudWireActive) { injectSpeechNotesHud(); }
// Expose folder injection helpers globally for smoke harness / fallback JS paths
try { (window as any).ensureSettingsFolderControls = ensureSettingsFolderControls; } catch {}
try { (window as any).ensureSettingsFolderControlsAsync = ensureSettingsFolderControlsAsync; } catch {}

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

			// The following block previously lived inside a DOMContentLoaded listener.
			// We still gate some UI-dependent wiring on DOM readiness for robustness.
			const onReady = () => {
				try {
					// Ensure autoscroll engine init
					try { (Auto as any).initAutoScroll?.(); } catch {}

					// Initialize features via idempotent wrappers
					try { startPersistence(); } catch {}
					try { startTelemetry(); } catch {}
					try { startScroll(); } catch {}
					try { startHotkeys(); } catch {}

					// Readiness summary for visibility and testability
					try {
						const ready = Object.assign({}, (window as any).__tpInit || {});
						console.log('[TP-READY]', ready);
					} catch {}

					// Resilient click delegation (auto +/-)
					try {
						const onClick = (e: Event) => {
							const t = e && (e.target as any);
							try { if (t?.closest?.('#autoInc'))    return (Auto as any).inc?.(); } catch {}
							try { if (t?.closest?.('#autoDec'))    return (Auto as any).dec?.(); } catch {}
						};
						document.addEventListener('click', onClick, { capture: true });
					} catch {}

					// Auto-record one-shot
					try {
						(function autoRecordOnStart(){
							const FLAG = 'tp_auto_record_on_start_v1';
							let fired = false;
							const wants = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };
							const maybe = async () => {
								if (fired || !wants()) return;
								try {
									if ((window as any).__tpRecording?.getAdapter?.() === 'obs') {
										if (!(window as any).__tpObs?.armed?.()) return;
									}
									fired = true;
									await ((window as any).__tpRecording?.start?.() || Promise.resolve());
								} catch (e) {
									fired = false; try { console.warn('auto-record failed', e); } catch {}
								}
							};
							['tp:session:start','speech:start','autoscroll:start'].forEach(ev => {
								document.addEventListener(ev as any, () => { try { (maybe as any)(); } catch {} }, { capture: true });
							});
						})();
					} catch {}

					// Scroll Router
					try {
						installScrollRouter({ auto: {
							toggle: (Auto as any).toggle,
							inc:    (Auto as any).inc,
							dec:    (Auto as any).dec,
							setEnabled: (Auto as any).setEnabled,
							setSpeed: (Auto as any).setSpeed,
							getState: (Auto as any).getState,
						}});
					} catch {}

					// Step / Rehearsal
					try {
						const step = installStepScroll({ stepLines: 1, pageLines: 4, enableFKeys: true });
						const rehearsal = installRehearsal();
						try { resolveInitialRehearsal(); } catch {}
						if (!(window as any).setScrollMode) {
							(window as any).setScrollMode = (mode: 'auto'|'asr'|'step'|'rehearsal'|'off') => {
								try { (Auto as any).setEnabled?.(mode === 'auto'); } catch {}
								try { (window as any).__scrollCtl?.stopAutoCatchup?.(); } catch {}
								if (mode === 'rehearsal') { rehearsal.enable(); step.disable(); }
								else { rehearsal.disable(); if (mode === 'step') step.enable(); else step.disable(); }
							};
						}
					} catch {}

					// Display Sync
					try {
						installDisplaySync({
							getText: () => { try { return (document.getElementById('script')?.innerHTML) || ''; } catch { return ''; } },
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
								bindMappedFolderUI({ button: '#chooseFolderBtn', select: '#scriptSelect', fallbackInput: '#folderFallback' });
								bindMappedFolderUI({ button: '#chooseFolderBtn', select: '#scriptSelectSidebar', fallbackInput: '#folderFallback' });
							} catch {}
							try { bindPermissionButton('#recheckFolderBtn'); } catch {}
							try { bindSettingsExportImport('#btnExportSettings', '#btnImportSettings'); } catch {}
						});
					} catch {}

					// Settings overlay wiring with open/close events for smoke determinism
					try {
						const overlay = document.getElementById('settingsOverlay');
						const btn = document.getElementById('settingsBtn') as HTMLButtonElement | null;
						const closeBtn = document.getElementById('settingsClose') as HTMLButtonElement | null;
						const openSettings = () => {
							try { overlay?.classList.remove('hidden'); } catch {}
							try { btn?.setAttribute('aria-expanded','true'); } catch {}
							try { document.body.dispatchEvent(new CustomEvent('tp:settings:open')); } catch {}
						};
						const closeSettings = () => {
							try { overlay?.classList.add('hidden'); } catch {}
							try { btn?.setAttribute('aria-expanded','false'); } catch {}
							try { document.body.dispatchEvent(new CustomEvent('tp:settings:close')); } catch {}
						};
						btn?.addEventListener('click', (e) => { try { e.preventDefault(); } catch {}; openSettings(); }, { capture: true });
						closeBtn?.addEventListener('click', (e) => { try { e.preventDefault(); } catch {}; closeSettings(); }, { capture: true });
						document.addEventListener('keydown', (e) => {
							try {
								if (e.key === 'Escape') {
									const hidden = overlay?.classList.contains('hidden');
									if (hidden === false) closeSettings();
								}
							} catch {}
						}, { capture: true });
					} catch {}

					// Script ingest
					try { installScriptIngest({}); } catch {}

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
