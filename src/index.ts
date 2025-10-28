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

// Optional: wire Auto-scroll in TS path as well (dev uses JS path; prod bundle may use TS entry)
import { initAutoScroll } from './features/autoscroll.js';

try {
	document.addEventListener('DOMContentLoaded', () => {
		const viewer = document.getElementById('viewer') as HTMLElement | null;
		const autoToggle = document.getElementById('autoToggle') as HTMLElement | null;
		const autoSpeed = document.getElementById('autoSpeed') as HTMLInputElement | null;
		const auto = initAutoScroll(() => viewer);
		auto.bindUI(autoToggle, autoSpeed);
	});
} catch {}
