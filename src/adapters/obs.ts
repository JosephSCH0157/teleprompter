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
