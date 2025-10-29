// Compatibility helpers (ID aliases and tolerant $id()) must be installed very early
import './boot/compat-ids';

import { bootstrap } from './boot/boot';

// Run bootstrap (best-effort, non-blocking). The legacy monolith still calls
// window._initCore/_initCoreRunner paths; this ensures the modular runtime
// sets up the same early hooks when the module entry is used.
bootstrap().catch(() => {});

// Install vendor shims (mammoth) so legacy code can use window.ensureMammoth
import './vendor/mammoth';
// Settings → ASR wizard wiring (safe to import; guards on element presence)
import './ui/settings/asrWizard';

// The compiled bundle (./dist/index.js) will import other modules and
// eventually assign window.__tpRealCore or resolve the _initCore waiter.

// Optional: wire Auto-scroll + install scroll router in TS path as well
import { startVadAdapter } from './asr/vadAdapter';
import * as Auto from './features/autoscroll.js';
import { installDisplaySync } from './features/display-sync';
import { installScrollRouter } from './features/scroll-router';
import { applyTypographyTo } from './features/typography';
import { getTypography, onTypography, setTypography } from './settings/typographyStore';
import { getUiPrefs } from './settings/uiPrefs';
import './ui/micMenu';
import './asr/v2/prompts';

try {
	document.addEventListener('DOMContentLoaded', () => {
		// Ensure autoscroll engine is initialized
		try { (Auto as any).initAutoScroll?.(); } catch {}

		// Wire Auto buttons via resilient delegation (nodes may be re-rendered)
		try {
			const onClick = (e: Event) => {
				const t = e && (e.target as any);
				try { if (t?.closest?.('#autoToggle')) return (Auto as any).toggle?.(); } catch {}
				try { if (t?.closest?.('#autoInc'))    return (Auto as any).inc?.(); } catch {}
				try { if (t?.closest?.('#autoDec'))    return (Auto as any).dec?.(); } catch {}
			};
			document.addEventListener('click', onClick, { capture: true });
			document.addEventListener('mousedown', (e) => {
				const t = e && (e.target as any);
				try { if (t?.closest?.('#autoToggle')) return (Auto as any).toggle?.(); } catch {}
			}, { capture: true });
		} catch {}

		// Install the new Scroll Router (Step/Hybrid; WPM/ASR/Rehearsal stubs)
		try {
			installScrollRouter({ auto: {
				toggle: (Auto as any).toggle,
				inc:    (Auto as any).inc,
				dec:    (Auto as any).dec,
				setEnabled: (Auto as any).setEnabled,
			}});
		} catch {}

		// Install coalesced Display Sync (hash + optional HTML text) for external display
		try {
			installDisplaySync({
				getText: () => {
					try { return (document.getElementById('script')?.innerHTML) || ''; } catch { return ''; }
				},
				getAnchorRatio: () => {
					try {
						const v = document.getElementById('viewer') as HTMLElement | null;
						if (!v) return 0;
						const max = Math.max(0, v.scrollHeight - v.clientHeight);
						return max > 0 ? (v.scrollTop / max) : 0;
					} catch { return 0; }
				},
				getDisplayWindow: () => {
					try { return (window as any).__tpDisplayWindow || null; } catch { return null; }
				},
				// onApplyRemote is used on display side only; main does not need it here
			});
		} catch {}

		// Apply typography to main window and, if present, to display window
		try {
			applyTypographyTo(window, 'main');
			const w = (window as any).__tpDisplayWindow as Window | null;
			if (w) applyTypographyTo(w, 'display');
		} catch {}

		// Broadcast typography changes to external display (only when linked)
		try {
			let bc: BroadcastChannel | null = null;
			try { bc = new BroadcastChannel('tp_display'); } catch {}
			onTypography((d, t) => {
				// Only broadcast if explicitly linked
				try { if (!getUiPrefs().linkTypography) return; } catch {}
				// Push to the other screen (target opposite of the source display)
				const target = (d === 'main' ? 'display' : 'main');
				const snap = { kind: 'tp:typography', source: 'main', display: target, t } as const;
				try { bc?.postMessage(snap as any); } catch {}
				try { const w = (window as any).__tpDisplayWindow as Window | null; w?.postMessage?.(snap as any, '*'); } catch {}
			});
		} catch {}

		// Auto-recompute scroll step after typography changes
		try {
			window.addEventListener('tp:lineMetricsDirty', () => {
				try {
					const root = document.documentElement;
					const cs = getComputedStyle(root);
					const fs = parseFloat(cs.getPropertyValue('--tp-font-size')) || 56;
					const lh = parseFloat(cs.getPropertyValue('--tp-line-height')) || 1.4;
					const pxPerLine = fs * lh;
					const stepPx = Math.round(pxPerLine * 7); // ~7 lines per step
					try { (window as any).__tpAuto?.setStepPx?.(stepPx); } catch {}
				} catch {}
			});
		} catch {}

		// Ctrl/Cmd + Mouse Wheel to adjust font size (main by default, Ctrl+Alt for display)
		try {
			const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
			window.addEventListener('wheel', (e: WheelEvent) => {
				try {
					if (!(e.ctrlKey || e.metaKey)) return; // only when user intends zoom-like behavior
					e.preventDefault();
					const targetDisplay = e.altKey ? 'display' : 'main';
					const cur = getTypography(targetDisplay as any).fontSizePx;
					const step = 2;
					const next = clamp(cur + (e.deltaY < 0 ? step : -step), 18, 120);
					setTypography(targetDisplay as any, { fontSizePx: next });
				} catch {}
			}, { passive: false });
		} catch {}

		// Shift + Wheel over the viewer to adjust font size (no Ctrl/Cmd required)
		try {
			const clamp2 = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
			const viewer = document.getElementById('viewer');
			if (viewer) {
				viewer.addEventListener('wheel', (e: WheelEvent) => {
					try {
						if (!e.shiftKey || e.ctrlKey || e.metaKey) return; // only Shift, not Ctrl/Cmd
						e.preventDefault();
						const cur = getTypography('main').fontSizePx;
						const step = 2;
						const next = clamp2(cur + (e.deltaY < 0 ? step : -step), 18, 120);
						setTypography('main', { fontSizePx: next });
					} catch {}
				}, { passive: false });
			}
		} catch {}

		// Dev-only sanity ping: ensure our line selector matches something at boot
		try {
			const isDevHost = () => {
				try { return /^(localhost|127\.0\.0\.1)$/i.test(location.hostname); } catch { return false; }
			};
			if (isDevHost()) {
				const LINE_SEL = '#viewer .script :is(p,.line,.tp-line)';
				try { if (!document.querySelector(LINE_SEL)) console.warn('[TP] No line nodes matched — check renderer/markup'); } catch {}
			}
		} catch {}

		// Start/stop VAD adapter when mic stream is provided
		try {
			let stopVad: (() => void) | null = null;
			window.addEventListener('tp:mic:stream', (e: any) => {
				try { stopVad?.(); } catch {}
				try {
					const s: MediaStream | undefined = e?.detail?.stream;
					if (s) stopVad = startVadAdapter(s, (_speaking: boolean, _rms: number) => {});
				} catch {}
			});
			window.addEventListener('beforeunload', () => { try { stopVad?.(); } catch {} });
		} catch {}
	});
} catch {}
