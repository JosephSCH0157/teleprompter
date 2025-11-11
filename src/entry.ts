// Unified TypeScript entry (scaffold). This will eventually replace index.js + index.ts dual boot.
// For now it imports shared helpers and performs a minimal subset of the existing boot.

import { installAutoToggleSync } from './boot/autoToggleSync.js';
import './boot/compat-ids';
import { installModeRowsSync } from './boot/uiModeSync.js';
import * as Auto from './features/autoscroll.js';
// Signal JS path to skip its internal router and ASR boot logic
try {
  (window as any).__TP_TS_ROUTER_BOOT = true;
  (window as any).__TP_TS_ASR_BOOT = true;
} catch {}

async function boot(){
  try {
    // Delegate to existing JS boot for legacy pieces (router boot skipped via flag)
    await import('./index.js');
    // Perform router + gate orchestrator boot here (mirrors logic from index.js)
    try {
      async function tryImport(spec: string, flag?: string){
        try {
          const m = await import(spec);
          if (m) { try { flag && ((window as any)[flag] = true); } catch {} return m; }
        } catch (err){ try { console.warn('[router] import failed', spec, (err as any)?.message); } catch {} }
        return null;
      }
      const candidates = [
        { spec: '/dist/scroll-router.js', flag: '__tpScrollRouterTsActive' },
        { spec: '/dist/features/scroll-router.js', flag: '__tpScrollRouterLegacyDist' },
        { spec: './features/scroll-router.js', flag: '__tpScrollRouterJsActive' }
      ];
      let mod: any = null;
      for (const c of candidates){ mod = await tryImport(c.spec, c.flag); if (mod) break; }
      if (!mod){
        try {
          console.warn('[router] all candidates failed; injecting legacy script');
          const s = document.createElement('script');
          s.src = './teleprompter_pro.js'; s.defer = true;
          s.onload = () => { try { console.info('[router] legacy script loaded'); } catch {} };
          document.head.appendChild(s);
        } catch {}
      } else {
        try {
          if (typeof mod.initScrollRouter === 'function') {
            mod.initScrollRouter();
            try { (window as any).__tpScrollRouterTsActive = true; } catch {}
            try { (window as any).__tpRegisterInit && (window as any).__tpRegisterInit('feature:router'); } catch {}
          } else if (typeof mod.installScrollRouter === 'function') {
            mod.installScrollRouter({ auto: Auto });
            try { (window as any).__tpRegisterInit && (window as any).__tpRegisterInit('feature:router'); } catch {}
          } else {
            console.warn('[router] no recognized init API');
          }
        } catch (e){ console.warn('[entry.ts] router init failed', e); }
        try {
          const go = await (async () => {
            try {
              const goSpec = '/dist/gate-orchestrator.js' as string;
              return await import(goSpec as any);
            } catch (err){ try { console.warn('[gate] import failed', (err as any)?.message); } catch {} return null; }
          })();
          if (go && typeof go.initGateOrchestrator === 'function') {
            go.initGateOrchestrator();
            try { (window as any).__tpGateOrchestratorActive = true; } catch {}
            try { (window as any).__tpRegisterInit && (window as any).__tpRegisterInit('feature:gate-orchestrator'); } catch {}
            try { console.info('[gate] orchestrator initialized'); } catch {}
          }
        } catch (e){ console.warn('[entry.ts] gate orchestrator init failed', e); }
      }
    } catch (e){ console.warn('[entry.ts] router boot sequence failed', e); }

    // Install ASR feature from TS entry (mirrors JS probe/import with guard)
    try {
      const asrSpecs: string[] = [
        './index-hooks/asr.js',
        '/dist/index-hooks/asr.js',
        '/dist/asr.js',
      ];
      let asrInitDone = false;
      for (const spec of asrSpecs) {
        const dynSpec = spec as any; // avoid static analyzer complaints
        try {
          const mod: any = await import(dynSpec);
          if (mod) {
            const init = (mod.initAsrFeature || mod.default);
            if (typeof init === 'function') {
              try { init(); } catch {}
              try { (window as any).__tpAsrFeatureActive = true; } catch {}
              try { (window as any).__tpRegisterInit && (window as any).__tpRegisterInit('feature:asr'); } catch {}
              try { console.info('[ASR] initialized from', spec); } catch {}
              asrInitDone = true;
              break;
            }
          }
        } catch (e) {
          try { console.warn('[ASR] import failed', spec, (e as any)?.message || e); } catch {}
        }
      }
      if (!asrInitDone) {
        try { console.info('[ASR] no module found, skipping init'); } catch {}
      }
    } catch (e) {
      try { console.warn('[entry.ts] ASR init failed', e); } catch {}
    }

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

