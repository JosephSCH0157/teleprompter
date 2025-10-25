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
