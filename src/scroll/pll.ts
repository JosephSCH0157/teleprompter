// PLL: Phase-Locked Loop bias controller extracted from legacy monolith.
// Provides a small, well-typed API compatible with the previous global `PLL` object.
// Exported as a singleton and installable onto `window.PLL` via `installPLL()`.

type TuneParams = Partial<{
  Kp: number;
  Kd: number;
  maxBias: number;
  confMin: number;
  decayMs: number;
  lostMs: number;
}>;

const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

export const PLL = (() => {
  let biasPct = 0;
  let errF = 0;
  let lastErrF = 0;
  let lastT = now();
  let lastGood = now();
  let lastAnchorTs = 0;
  let state: 'LOCKED' | 'LOCK_SEEK' | 'COAST' | 'LOST' = 'LOST';

  const S = {
    Kp: 0.022,
    Kd: 0.0025,
    maxBias: 0.12,
    confMin: 0.6,
    decayMs: 550,
    lostMs: 1800,
  } as {
    Kp: number;
    Kd: number;
    maxBias: number;
    confMin: number;
    decayMs: number;
    lostMs: number;
  };

  const telemetry = {
    timeLocked: 0,
    timeCoast: 0,
    timeLost: 0,
    avgLeadLag: 0,
    samples: 0,
    nearClampCount: 0,
    anchorCount: 0,
    lastSample: now(),
  } as any;

  function scriptProgress() {
    try {
      // callers may set window.paraIndex/currentIndex; keep this function resilient
      const p: any = (window as any).paraIndex;
      const ci: any = (window as any).currentIndex;
      if (!Array.isArray(p) || !p.length) return 0;
      return Math.min(1, (Number(ci) || 0) / p.length);
    } catch {
      return 0;
    }
  }

  function update(opts: { yMatch?: number; yTarget?: number; conf?: number; dt?: number } = {}) {
    const tNow = now();
    const dts = (opts.dt ?? (tNow - lastT)) / 1000;
    lastT = tNow;
    const err = (opts.yMatch ?? 0) - (opts.yTarget ?? 0);
    errF = 0.8 * errF + 0.2 * err;

    const p = scriptProgress();
    const endTaper = p > 0.8 ? 0.6 : 1.0;

    const conf = typeof opts.conf === 'number' ? opts.conf : 0;

    if (conf >= S.confMin) {
      lastGood = tNow;
      const dErr = (errF - lastErrF) / Math.max(dts, 0.016);
      let bias = S.Kp * errF + S.Kd * dErr;
      const clamp = (state === 'LOCK_SEEK' ? S.maxBias : S.maxBias * 0.8) * endTaper;
      biasPct = Math.max(-clamp, Math.min(clamp, biasPct + bias));
      state = Math.abs(errF) < 12 ? 'LOCKED' : 'LOCK_SEEK';
    } else {
      if (conf < S.confMin) {
        biasPct = Math.max(0, biasPct * Math.exp(-dts / (S.decayMs / 1000)));
      } else {
        biasPct = biasPct * Math.exp(-dts / (S.decayMs / 1000));
      }
      state = tNow - lastGood > S.lostMs ? 'LOST' : 'COAST';
    }
    lastErrF = errF;

    // Telemetry
    const dtSample = tNow - telemetry.lastSample;
    if (state === 'LOCKED') telemetry.timeLocked += dtSample;
    else if (state === 'COAST') telemetry.timeCoast += dtSample;
    else if (state === 'LOST') telemetry.timeLost += dtSample;
    telemetry.avgLeadLag = (telemetry.avgLeadLag * telemetry.samples + Math.abs(errF)) / (telemetry.samples + 1);
    telemetry.samples++;
    if (Math.abs(biasPct) > S.maxBias * 0.8) telemetry.nearClampCount++;
    telemetry.lastSample = tNow;
  }

  function allowAnchor() {
    const tNow = now();
    if (tNow - lastAnchorTs < 1200) return false;
    lastAnchorTs = tNow;
    telemetry.anchorCount++;
    return true;
  }

  function onPause() {
    tune({ decayMs: 400 });
    setTimeout(() => tune({ decayMs: 550 }), 2000);
  }

  function tune(p: TuneParams) {
    Object.assign(S, p);
  }

  return {
    update,
    allowAnchor,
    onPause,
    get biasPct() {
      return biasPct;
    },
    get state() {
      return state;
    },
    get errF() {
      return errF;
    },
    get telemetry() {
      return { ...telemetry };
    },
    tune,
  } as const;
})();

export function installPLL() {
  try {
    if (typeof window !== 'undefined') {
      // idempotent
      if ((window as any).PLL !== PLL) (window as any).PLL = PLL;
    }
  } catch {}
}

export default PLL;
