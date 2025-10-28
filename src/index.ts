// Compatibility helpers (ID aliases and tolerant $id()) must be installed very early
import './boot/compat-ids';

import { bootstrap } from './boot/boot';

// Run bootstrap (best-effort, non-blocking). The legacy monolith still calls
// window._initCore/_initCoreRunner paths; this ensures the modular runtime
// sets up the same early hooks when the module entry is used.
bootstrap().catch(() => {});

// Install vendor shims (mammoth) so legacy code can use window.ensureMammoth
import './vendor/mammoth';

// The compiled bundle (./dist/index.js) will import other modules and
// eventually assign window.__tpRealCore or resolve the _initCore waiter.

// Optional: wire Auto-scroll + install scroll router in TS path as well
import * as Auto from './features/autoscroll.js';
import { installScrollRouter } from './features/scroll-router';
import { installDisplaySync } from './features/display-sync';

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
	});
} catch {}
