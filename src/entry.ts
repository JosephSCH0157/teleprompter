// Unified TypeScript entry (scaffold). This will eventually replace index.js + index.ts dual boot.
// For now it imports shared helpers and performs a minimal subset of the existing boot.

import { installAutoToggleSync } from './boot/autoToggleSync.js';
import './boot/compat-ids';
import { installModeRowsSync } from './boot/uiModeSync.js';
import * as Auto from './features/autoscroll.js';

async function boot(){
  try {
    // Delegate to existing JS boot to preserve full behavior during migration
    await import('./index.js');
    // Layer shared helpers (idempotent)
    try { installModeRowsSync(); } catch {}
    try { installAutoToggleSync(Auto); } catch {}
    try { console.info('[entry.ts] delegated boot complete'); } catch {}
  } catch (e) {
    try { console.error('[entry.ts] boot failed', e); } catch {}
  }
}

boot();
export { boot };

