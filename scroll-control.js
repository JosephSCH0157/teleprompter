/**
 * Scroll Controller (clean version)
 * ---------------------------------
 * A robust state machine + PID-ish controller to keep a scroller aligned
 * to a moving "anchor" (e.g., transcript line). Includes:
 *  - Guard rails against NaN/Infinity
 *  - Defensive bounds on ratios and velocities
 *  - No undeclared variables, no implicit globals
 *  - Clear event hooks for instrumentation (matching the tags in your logs)
 *
 * Usage:
 *   const sc = new ScrollController({
 *     getScrollTop: () => el.scrollTop,
 *     setScrollTop: (y) => { el.scrollTop = y; },
 *     getViewportHeight: () => el.clientHeight,
 *     getDocHeight: () => el.scrollHeight,
 *     onEvent: (e) => console.debug(e.tag, e), // optional
 *   });
 *
 *   sc.tick({ anchorY, anchorRatio, docRatio });
 *
 * Public API:
 *   - tick(metrics)
 *   - setMode(mode)            // 'auto' | 'manual' | 'frozen'
 *   - nudge({pixels})          // small fallback-nudge
 *   - rescue()                 // attempt a catch-up burst
 *   - reset()
 */
// UMD/Node export removed for browser use. Attach to window/global if needed:
window.ScrollController = function () {
  'use strict';

  /** Clamp a number safely between [min, max] */
  function clamp(n, min, max) {
    n = Number.isFinite(n) ? n : 0;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  /** Safe boolean */

  /** Compute a stable ratio [0,1] given numerator/denominator */
  function ratio(numer, denom) {
    if (!Number.isFinite(numer) || !Number.isFinite(denom) || denom <= 0) return 0;
    return clamp(numer / denom, 0, 1);
  }

  /**
   * Basic EWMA (exponentially weighted moving average)
   */
  class Ewma {
    constructor(alpha = 0.2, initial = 0) {
      this.alpha = clamp(alpha, 0, 1);
      this.value = Number.isFinite(initial) ? initial : 0;
      this.initialized = false;
    }
    push(x) {
      x = Number.isFinite(x) ? x : 0;
      if (!this.initialized) {
        this.value = x;
        this.initialized = true;
      } else {
        this.value = this.alpha * x + (1 - this.alpha) * this.value;
      }
      return this.value;
    }
  }

  /**
   * A small PID-ish controller to compute a target scrollTop delta.
   */
  class VelocityController {
    constructor(cfg = {}) {
      this.kp = Number.isFinite(cfg.kp) ? cfg.kp : 0.5;
      this.ki = Number.isFinite(cfg.ki) ? cfg.ki : 0.0;
      this.kd = Number.isFinite(cfg.kd) ? cfg.kd : 0.25;
      this.integral = 0;
      this.prevErr = 0;
      this.prevTs = 0;
      this.maxV = Number.isFinite(cfg.maxV) ? cfg.maxV : 12; // px per tick
      this.minV = Number.isFinite(cfg.minV) ? cfg.minV : 0.2;
    }

    reset() {
      this.integral = 0;
      this.prevErr = 0;
      this.prevTs = 0;
    }

    step(err, nowMs) {
      err = Number.isFinite(err) ? err : 0;
      const now = Number.isFinite(nowMs) ? nowMs : performance.now();
      const dt = this.prevTs ? Math.max(1, now - this.prevTs) : 16; // ms
      this.prevTs = now;

      // Integral windup guard
      this.integral = clamp(this.integral + err * dt * 0.001, -200, 200);

      const deriv = (err - this.prevErr) / dt;
      this.prevErr = err;

      let vRaw = this.kp * err + this.ki * this.integral + this.kd * deriv;
      let v = clamp(Math.abs(vRaw), this.minV, this.maxV);
      v *= Math.sign(vRaw) || 0;

      return {
        err,
        dt,
        deriv,
        vRaw: Number(vRaw.toFixed(3)),
        v: Number(v.toFixed(3)),
      };
    }
  }

  /**
   * ScrollController
   */
  class ScrollController {
    /**
     * @param {Object} io
     * @param {() => number} io.getScrollTop
     * @param {(y:number) => void} io.setScrollTop
     * @param {() => number} io.getViewportHeight
     * @param {() => number} io.getDocHeight
     * @param {(evt:object) => void} [io.onEvent]
     * @param {Object} [cfg]
     */
    constructor(io, cfg = {}) {
      if (!io || typeof io.getScrollTop !== 'function' || typeof io.setScrollTop !== 'function') {
        throw new Error('ScrollController: missing required I/O functions');
      }
      this.io = io;
      this.onEvent = typeof io.onEvent === 'function' ? io.onEvent : () => {};

      this.mode = 'auto'; // 'auto' | 'manual' | 'frozen'
      this.state = 'idle'; // 'idle' | 'tracking' | 'stall' | 'rescue'

      this.vel = new VelocityController(cfg.pid || {});

      this.anchorEwma = new Ewma(0.25, 0);
      this.jitterEwma = new Ewma(0.15, 0);

      // thresholds
      this.nearEndAnchor = Number.isFinite(cfg.nearEndAnchor) ? cfg.nearEndAnchor : 0.65;
      this.nearEndDoc = Number.isFinite(cfg.nearEndDoc) ? cfg.nearEndDoc : 0.95;
      this.stallMs = Number.isFinite(cfg.stallMs) ? cfg.stallMs : 1200;

      this.lastCommitAt = 0;
      this.lastBestIdx = -1;
      this.pendingIdx = -1;
      this.currentIndex = -1;

      this._log('init', { mode: this.mode });
    }

    setMode(mode) {
      if (mode !== 'auto' && mode !== 'manual' && mode !== 'frozen') return;
      this.mode = mode;
      this._log('mode:set', { mode });
    }

    reset() {
      this.state = 'idle';
      this.vel.reset();
      this.lastCommitAt = 0;
      this.lastBestIdx = -1;
      this.pendingIdx = -1;
      this.currentIndex = -1;
      this._log('reset', {});
    }

    /**
     * Main tick — call frequently with latest metrics.
     * @param {Object} m
     * @param {number} m.anchorY   absolute Y of anchor in px (relative to document)
     * @param {number} m.anchorRatio  [0,1] position of anchor within viewport
     * @param {number} m.docRatio     [0,1] how far the user is through the doc
     * @param {number} [m.jitter]     optional jitter metric
     */
    tick(m) {
      if (this.mode !== 'auto') return;

      const now = performance.now ? performance.now() : Date.now();
      const top = this.io.getScrollTop();
      const vh = Math.max(1, this.io.getViewportHeight());
      const dh = Math.max(vh, this.io.getDocHeight());

      const anchorRatio = clamp(Number(m.anchorRatio), 0, 1);
      const docRatio = clamp(Number(m.docRatio), 0, 1);
      const jitter = clamp(Number(m.jitter ?? 0), 0, 30);

      const NEAR_END = anchorRatio > this.nearEndAnchor || docRatio > this.nearEndDoc;

      // record smoothed signals
      const aSm = this.anchorEwma.push(anchorRatio);
      const jSm = this.jitterEwma.push(jitter);

      // stall detection: no commits + low progress for too long
      if (!this.lastCommitAt) this.lastCommitAt = now;
      const noCommitFor = now - this.lastCommitAt;
      const progressRate = Math.max(0.01, (aSm + docRatio) / 2);
      if (noCommitFor > this.stallMs && progressRate < 0.15) {
        if (this.state !== 'stall') {
          this.state = 'stall';
          this._log('stall:detected', {
            noCommitFor: Math.round(noCommitFor),
            pr: Number(progressRate.toFixed(3)),
            anchorRatio: aSm,
            jitterSpike: jSm > 8,
            committedIdx: this.lastBestIdx >= 0 ? this.lastBestIdx : 0,
            currentIndex: this.currentIndex >= 0 ? this.currentIndex : 0,
          });
          this._markRecovery('stall');
        }
      }

      // if near end, prefer gentler speed
      const bias = NEAR_END ? 0.5 : 1;

      // error: keep anchor a bit above center (0.45)
      const targetRatio = 0.45;
      const errPx = (anchorRatio - targetRatio) * vh;

      const { v } = this.vel.step(errPx * bias, now);

      // Apply scroll with bounds
      const newTop = clamp(top + v, 0, dh - vh);
      if (Number.isFinite(newTop) && Math.abs(newTop - top) > 0.1) {
        this.io.setScrollTop(newTop);
        this._log('scroll', { tag: 'scroll', top: newTop });
      }

      // pseudo "commit" when anchor is close to target
      if (Math.abs(anchorRatio - targetRatio) < 0.02) {
        this.lastCommitAt = now;
        this._log('match:catchup:stop', {});
      }
    }

    /** Small manual nudge (fallback) */
    nudge({ pixels = 12 } = {}) {
      const top = this.io.getScrollTop();
      const vh = Math.max(1, this.io.getViewportHeight());
      const dh = Math.max(vh, this.io.getDocHeight());
      const newTop = clamp(top + pixels, 0, dh - vh);
      this.io.setScrollTop(newTop);
      this._log('fallback-nudge', { top: newTop });
    }

    /** Attempt a burst catch-up (rescue) */
    rescue() {
      if (this.state !== 'stall') return;
      this._log('stall:rescue:start', { method: 'catchup-burst' });
      // simple burst: push toward 0.40 viewport ratio
      for (let i = 0; i < 8; i++) {
        const top = this.io.getScrollTop();
        const vh = Math.max(1, this.io.getViewportHeight());
        const dh = Math.max(vh, this.io.getDocHeight());
        // bias upward slightly
        const v = clamp(vh * 0.08, 0.2, 24);
        const newTop = clamp(top - v, 0, dh - vh);
        this.io.setScrollTop(newTop);
      }
      this.state = 'tracking';
      this._log('stall:rescue:done', { method: 'catchup-burst' });
    }

    _markRecovery(reason) {
      const top = this.io.getScrollTop();
      const vh = Math.max(1, this.io.getViewportHeight());
      const dh = Math.max(vh, this.io.getDocHeight());
      const scrollRatio = ratio(top, Math.max(1, dh - vh));
      const anchorRatio = this.anchorEwma.value;
      const t = (performance.now ? performance.now() : Date.now()).toFixed(1);
      this._log('recovery:mark', {
        t: Number(t),
        reason,
        committedIdx: Math.max(0, this.lastBestIdx),
        lastCommitAt: this.lastCommitAt || 0,
        pendingIdx: Math.max(0, this.pendingIdx),
        lastBestIdx: Math.max(0, this.lastBestIdx),
        sim: 1,
        currentIndex: this.currentIndex >= 0 ? this.currentIndex : null,
        scrollTop: top,
        scrollRatio,
        anchorRatio,
        jitter: { buf: [], max: 30, mean: Number(this.jitterEwma.value.toFixed(2)) },
        extra: { noCommitFor: 0, pr: 0, anchorRatio },
      });
    }

    _log(tag, payload) {
      try {
        this.onEvent({ tag, ...(payload || {}) });
      } catch {
        // never throw from user logger
      }
    }
  }

  return ScrollController;
};
