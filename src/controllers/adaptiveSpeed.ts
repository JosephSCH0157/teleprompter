// src/controllers/adaptiveSpeed.ts
// Adaptive speed governor for Hybrid/Auto scroll.
// Pure logic: no DOM, no window, safe for unit tests.

export type AdaptSample = {
  /** Pixel error between where we *are* and where we *want* to be.
   *  Positive => script is lagging behind speech (we need to speed up).
   *  Negative => we're ahead (we should slow down).
   */
  errPx: number;
  /** Optional confidence (0–1). 0 = ignore sample, 1 = full weight. */
  conf?: number;
  /** Optional timestamp (ms); unused for now but useful for debugging. */
  t?: number;
};

export type AdaptSamples = AdaptSample[];

export interface SpeedGovernorOptions {
  /** Minimum allowed scroll speed in px/sec. */
  minPxPerSec?: number;
  /** Maximum allowed scroll speed in px/sec. */
  maxPxPerSec?: number;
  /** Initial base scroll speed in px/sec (from WPM/slider). */
  basePxPerSec?: number;
  /** Gain applied to ASR error samples. */
  asrGain?: number;
  /** Smoothing factor (0–1). Higher = smoother, slower reaction. */
  smoothing?: number;
}

/**
 * SpeedGovernor
 *
 * Holds a base speed (from WPM, slider, etc.) and an adapted “current” speed
 * that nudges up/down based on ASR error samples.
 *
 * - `setBaseSpeedPx` → replace the baseline speed.
 * - `nudge`          → manual +/- nudge in px/sec.
 * - `getSpeedPxPerSec` → current effective speed.
 * - `applyAdaptation` (via adaptSample) → adjust current speed from ASR.
 */
export class SpeedGovernor {
  private min: number;
  private max: number;
  private base: number;
  private current: number;
  private asrGain: number;
  private smoothing: number;

  constructor(opts: SpeedGovernorOptions = {}) {
    this.min = opts.minPxPerSec ?? 10;      // very slow floor
    this.max = opts.maxPxPerSec ?? 3000;    // hard ceiling
    const base = opts.basePxPerSec ?? 240;  // reasonable default
    this.base = this.clamp(base);
    this.current = this.base;

    this.asrGain = opts.asrGain ?? 1.0;
    // 0.0 = jumpy, 1.0 = very smooth; 0.4–0.6 feels good
    this.smoothing = opts.smoothing ?? 0.5;
  }

  /** Clamp a speed into [min, max]. */
  private clamp(v: number): number {
    if (!isFinite(v)) return this.base;
    if (v < this.min) return this.min;
    if (v > this.max) return this.max;
    return v;
  }

  /** Replace the base auto-scroll speed (from WPM or main slider). */
  setBaseSpeedPx(pxPerSec: number): void {
    this.base = this.clamp(pxPerSec || 0);
    // When the user explicitly sets a new base, bias towards it strongly.
    this.current = this.base;
  }

  /** Hard-set the current effective px/sec speed (rarely needed). */
  setCurrentSpeedPx(pxPerSec: number): void {
    this.current = this.clamp(pxPerSec || 0);
  }

  /** Manual +/- nudge in px/sec. */
  nudge(deltaPxPerSec: number): number {
    const next = this.clamp(this.current + (deltaPxPerSec || 0));
    this.current = next;
    this.base = this.current;
    return this.current;
  }

  /** Current effective speed in px/sec after adaptation. */
  getSpeedPxPerSec(): number {
    return this.current;
  }

  /**
   * Core adaptation step.
   *
   * errPx: +ve means script is *behind* speech → speed up
   *        -ve means script is *ahead* of speech → slow down
   *
   * We compute a target speed around the base and then blend
   * towards it using exponential smoothing.
   */
  applyAdaptation(sample: AdaptSample): number {
    if (!sample) return this.current;

    const rawErr = Number(sample.errPx || 0);
    if (!isFinite(rawErr) || rawErr === 0) return this.current;

    const conf = Number(sample.conf ?? 1);
    if (!isFinite(conf) || conf <= 0) return this.current;

    const normConf = Math.max(0, Math.min(1, conf));

    // Convert pixel error into a speed delta.
    // Cap the magnitude so one wild sample can't blow up the speed.
    const MAX_ERR = 800; // px
    const MAG = Math.min(Math.abs(rawErr), MAX_ERR);
    const sign = rawErr > 0 ? 1 : -1;

    // Tunable gain: bigger = more aggressive
    const K_ERR = 0.8; // speed change sensitivity per unit error
    const targetDelta =
      sign * MAG * (K_ERR / MAX_ERR) * this.asrGain * normConf;

    const targetSpeed = this.clamp(this.base + targetDelta);

    // Exponential smoothing between current and target
    const alpha = Math.max(0, Math.min(1, this.smoothing));
    const blended =
      this.current + (targetSpeed - this.current) * alpha;

    this.current = this.clamp(blended);
    return this.current;
  }
}

/**
 * Convenience helper used by the scroll brain:
 * mutate the governor from a single sample and return the new speed.
 *
 * We export it as a function because the call site may prefer functional style
 * (`adaptSample(governor, sample)`) vs calling a method directly.
 */
export function adaptSample(
  gov: SpeedGovernor,
  sample: AdaptSample | null | undefined
): { speedPxPerSec: number } {
  if (!(gov instanceof SpeedGovernor) || !sample) {
    return { speedPxPerSec: gov instanceof SpeedGovernor ? gov.getSpeedPxPerSec() : 0 };
  }
  const speed = gov.applyAdaptation(sample);
  return { speedPxPerSec: speed };
}
