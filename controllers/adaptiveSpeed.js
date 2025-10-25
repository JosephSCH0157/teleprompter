// controllers/adaptiveSpeed.js — ES module port of adaptiveSpeed TypeScript
export class SpeedGovernor {
  constructor(initialPxPerSec, hud) {
    this.basePxPerSec = initialPxPerSec;
    this.vPxPerSec = 0;
    this.manualHoldUntil = 0;
    this.softStartUntil = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) + 1200;
    this.iTerm = 0;
    this.lastT = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
    this.hud = hud;
    // tunables
    this.deadPx = 14;
    this.Kp = 0.0022;
    this.Ki = 0.0007;
    this.maxAdjPerSec = 0.18;
    this.softStartMs = 1200;
    this.manualDebounceMs = 1500;
    this._lastSample = null;
  }

  setBase(pxPerSec) {
    this.basePxPerSec = Math.max(5, pxPerSec);
  }

  onManualAdjust(pxPerSec) {
    this.setBase(pxPerSec);
    this.iTerm = 0;
    this.manualHoldUntil = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) + this.manualDebounceMs;
    try { this.hud && this.hud('sync:manual', { base: this.basePxPerSec }); } catch {}
  }

  onSpeechSample(s) {
    this._lastSample = s;
  }

  tick() {
    const now = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
    const dt = Math.max(0.001, ((now - (this.lastT || now)) / 1000));
    this.lastT = now;

    // soft start
    if (now < this.softStartUntil) {
      const alpha = (now - (this.softStartUntil - this.softStartMs)) / this.softStartMs;
      const eased = 1 - Math.pow(1 - Math.min(1, Math.max(0, alpha)), 3);
      this.vPxPerSec = eased * this.basePxPerSec;
      try { this.hud && this.hud('sync:ramp', { eased, v: this.vPxPerSec.toFixed(1) }); } catch {}
      return this.vPxPerSec;
    }

    let target = this.basePxPerSec;
    let adaptOn = false;

    const canAdapt = (now >= (this.manualHoldUntil || 0)) && this._lastSample && ((now - this._lastSample.now) < 350);
    if (canAdapt) {
      const errPx = this._lastSample.errPx;
      const conf = this._lastSample.conf;
      const mag = Math.abs(errPx);
      if (mag > this.deadPx && conf >= 0.4) {
        const sign = errPx > 0 ? +1 : -1;
        this.iTerm += sign * this.Ki * dt;
        const pTerm = sign * this.Kp;
        const rawAdjPerSec = (pTerm + this.iTerm);
        const adjPerSec = Math.max(-this.maxAdjPerSec, Math.min(this.maxAdjPerSec, rawAdjPerSec));
        target = this.basePxPerSec * (1 + adjPerSec);
        adaptOn = true;
        if (Math.abs(rawAdjPerSec) !== Math.abs(adjPerSec)) this.iTerm *= 0.9;
        try {
          this.hud && this.hud('sync:adapt', {
            errPx: Math.round(errPx),
            p: +pTerm.toFixed(4),
            i: +this.iTerm.toFixed(4),
            adj: (adjPerSec * 100).toFixed(1) + '%',
            target: +target.toFixed(1),
          });
        } catch {}
      } else {
        this.iTerm *= 0.96;
      }
    }

    const maxSlew = this.basePxPerSec * this.maxAdjPerSec * dt;
    const dv = Math.max(-maxSlew, Math.min(maxSlew, target - this.vPxPerSec));
    this.vPxPerSec += dv;

    try { this.hud && this.hud('sync:tick', { v: +this.vPxPerSec.toFixed(1), base: +this.basePxPerSec.toFixed(1), adaptOn }); } catch {}

    return this.vPxPerSec;
  }
}
