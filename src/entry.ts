// Unified TypeScript entry (scaffold). This will eventually replace index.js + index.ts dual boot.
// For now it imports shared helpers and performs a minimal subset of the existing boot.

import { installAutoToggleSync } from './boot/autoToggleSync.js';
import { bootstrap } from './boot/boot';
import './boot/compat-ids';
import { installModeRowsSync } from './boot/uiModeSync.js';
import * as Auto from './features/autoscroll.js';

// Dup-boot guard
if ((window as any).__tpBooted) {
  try { console.warn('[entry.ts] duplicate boot blocked; first=', (window as any).__tpBooted); } catch {}
} else {
  (window as any).__tpBooted = 'entry.ts';
}

async function boot(){
  try {
    // Early bootstrap (parity with existing index paths)
    try { bootstrap().catch(()=>{}); } catch {}
    // Initialize autoscroll engine early
    try { (Auto as any).initAutoScroll?.(); } catch {}
    // Install shared UI helpers
    try { installModeRowsSync(); } catch {}
    try { installAutoToggleSync(Auto); } catch {}
    // Placeholder: router + gate orchestrator can be migrated later.
    try { console.info('[entry.ts] scaffold boot complete'); } catch {}
  } catch (e) {
    try { console.error('[entry.ts] boot failed', e); } catch {}
  }
}

boot();
export { boot };

