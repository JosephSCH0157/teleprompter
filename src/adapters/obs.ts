// src/adapters/obs.ts - TS facade adapter

function g(): any { return (window as any); }

export async function connect(cfg?: any) {
  const w = g();
  if (w.__tpObsImpl?.connect) return w.__tpObsImpl.connect(cfg);
  if (w.obs?.connect) return w.obs.connect(cfg);
  if (w.__tpObs?.connect) return w.__tpObs.connect(cfg);
  throw new Error('OBS adapter not available');
}

export function configure(opts?: any) {
  const w = g();
  if (w.__tpObsImpl?.configure) return w.__tpObsImpl.configure(opts);
  if (w.obs?.configure) return w.obs.configure(opts);
  if (w.__tpObs?.configure) return w.__tpObs.configure(opts);
}

export async function test() {
  const w = g();
  if (w.__tpObsImpl?.test) return w.__tpObsImpl.test();
  if (w.obs?.test) return w.obs.test();
  if (w.__tpObs?.test) return w.__tpObs.test();
  return false;
}

export default { connect, configure, test };

// Install a tiny smoke-friendly test hook on window.obs
export function initObsAdapter() {
  try {
    const w = g();
    const gobs = (w.obs = w.obs || {});
    if (!gobs.test) {
      gobs.test = async () => {
        try { w.__tpSmoke = w.__tpSmoke || {}; w.__tpSmoke.obsTestRan = true; } catch {}
        try { console.info('[obs] test() invoked for smoke'); } catch {}
        // Best-effort: call through to the adapter if available
        try { await test(); } catch {}
      };
    }
  } catch {}
}
