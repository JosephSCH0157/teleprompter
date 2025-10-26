export type AdaptSample = {
  errPx: number;        // + if spoken line is BELOW the marker, - if ABOVE
  conf: number;         // 0..1 confidence (use 1 for deterministic word hits)
  now: number;          // performance.now()
};

export interface GovernorHUD {
  (_tag: string, _data?: Record<string, unknown>): void;
}

export class SpeedGovernor {
  private basePxPerSec: number;
  private vPxPerSec: number;
  private manualHoldUntil = 0;
  private softStartUntil = 0;
  private iTerm = 0;
  private lastT = 0;
  private hud?: GovernorHUD;

  // Tunables
  private readonly deadPx = 14;          // no corrections within ±14px
  private readonly Kp = 0.0022;          // proportional gain (px → %/s)
  private readonly Ki = 0.0007;          // integrator gain
  private readonly maxAdjPerSec = 0.18;  // clamp ±18%/s change
  private readonly softStartMs = 1200;   // ramp time from 0 → base speed
  private readonly manualDebounceMs = 1500; // time after a manual change before re-enabling adapt

  constructor(initialPxPerSec: number, hud?: GovernorHUD) {
    this.basePxPerSec = initialPxPerSec;
    this.vPxPerSec = 0;
    this.softStartUntil = performance.now() + this.softStartMs;
    this.lastT = performance.now();
    this.hud = hud;
  }

  setBase(pxPerSec: number) {
    this.basePxPerSec = Math.max(5, pxPerSec);
  }

  /** User moved the slider or pressed +/- */
  onManualAdjust(pxPerSec: number) {
    this.setBase(pxPerSec);
    this.iTerm = 0; // don't fight the user
    this.manualHoldUntil = performance.now() + this.manualDebounceMs;
    this.hud?.("sync:manual", { base: this.basePxPerSec });
  }

  /** Feed speech alignment error samples as they arrive */
  onSpeechSample(s: AdaptSample) {
    // store latest; controller will consume on tick
    this._lastSample = s;
  }
  private _lastSample?: AdaptSample;

  /** Call every animation tick; returns current px/sec for the scroller */
  tick(): number {
    const now = performance.now();
    const dt = Math.max(0.001, (now - this.lastT) / 1000);
    this.lastT = now;

    // Soft start: ease from 0 → base over softStartMs
    if (now < this.softStartUntil) {
      const alpha = (now - (this.softStartUntil - this.softStartMs)) / this.softStartMs;
      // cubic ease-out
      const eased = 1 - Math.pow(1 - Math.min(1, Math.max(0, alpha)), 3);
      this.vPxPerSec = eased * this.basePxPerSec;
      this.hud?.("sync:ramp", { eased, v: this.vPxPerSec.toFixed(1) });
      return this.vPxPerSec;
    }

    // Default to base speed
    let target = this.basePxPerSec;
    let adaptOn = false;

    // Only adapt if manual debounce expired AND we have a fresh/confident sample
    const canAdapt = now >= this.manualHoldUntil && this._lastSample && (now - this._lastSample.now) < 350;
    if (canAdapt) {
      const { errPx, conf } = this._lastSample!;
      const mag = Math.abs(errPx);
      if (mag > this.deadPx && conf >= 0.4) {
        // PI controller with clamp
        const sign = errPx > 0 ? +1 : -1; // +1: text below marker → speed up
        this.iTerm += sign * this.Ki * dt; // accumulate slowly
        const pTerm = sign * this.Kp;
        const rawAdjPerSec = (pTerm + this.iTerm);
        const adjPerSec = Math.max(-this.maxAdjPerSec, Math.min(this.maxAdjPerSec, rawAdjPerSec));
        target = this.basePxPerSec * (1 + adjPerSec);
        adaptOn = true;

        // small anti-windup: gently decay integrator when inside clamp
        if (Math.abs(rawAdjPerSec) !== Math.abs(adjPerSec)) {
          this.iTerm *= 0.9;
        }

        this.hud?.("sync:adapt", {
          errPx: Math.round(errPx),
          p: +pTerm.toFixed(4),
          i: +this.iTerm.toFixed(4),
          adj: +(adjPerSec * 100).toFixed(1) + "%",
          target: +target.toFixed(1)
        });
      } else {
        // decay integrator when inside deadband or low confidence
        this.iTerm *= 0.96;
      }
    }

    // Slew-limit toward target so it never jerks
    const maxSlew = this.basePxPerSec * this.maxAdjPerSec * dt;
    const dv = Math.max(-maxSlew, Math.min(maxSlew, target - this.vPxPerSec));
    this.vPxPerSec += dv;

    this.hud?.("sync:tick", {
      v: +this.vPxPerSec.toFixed(1),
      base: +this.basePxPerSec.toFixed(1),
      adaptOn
    });

    return this.vPxPerSec;
  }
}
