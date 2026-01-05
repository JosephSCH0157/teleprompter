import { Motor } from './motor';

export type HybridWpmMotorDeps = {
  getWriter: () => { scrollTo: (top: number, opts: { behavior: ScrollBehavior }) => void };
  getScrollTop: () => number;
  getMaxScrollTop?: () => number;
  now?: () => number;
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (id: number) => void;
  log?: (evt: string, data?: unknown) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createHybridWpmMotor(deps: HybridWpmMotorDeps): Motor {
  let running = false;
  let velocityPxPerSec = 0;
  let rafId: number | null = null;
  let lastNow: number | null = null;

  const now = deps.now ?? (() => performance.now());
  const raf = deps.raf ?? ((cb: FrameRequestCallback) => window.requestAnimationFrame(cb));
  const caf = deps.caf ?? ((id: number) => window.cancelAnimationFrame(id));
  const log = deps.log ?? (() => {});

  const tick = () => {
    if (!running) return;
    const current = now();
    const prev = lastNow ?? current;
    const deltaMs = current - prev;
    const dt = clamp(deltaMs / 1000, 0, 0.2);
    lastNow = current;

    if (velocityPxPerSec !== 0) {
      const dy = velocityPxPerSec * dt;
      const top = deps.getScrollTop() + dy;
      const maxTop = deps.getMaxScrollTop ? deps.getMaxScrollTop() : Number.POSITIVE_INFINITY;
      const nextTop = clamp(top, 0, maxTop);
      try {
        deps.getWriter().scrollTo(nextTop, { behavior: 'auto' });
      } catch (err) {
        log('tick:scroll', err);
      }
    }

    rafId = raf(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      lastNow = now();
      rafId = raf(tick);
      log('start', { velocityPxPerSec });
    },
    stop() {
      if (!running) return;
      running = false;
      if (rafId != null) {
        caf(rafId);
        rafId = null;
      }
      lastNow = null;
      log('stop', {});
    },
    setVelocityPxPerSec(pxPerSec: number) {
      velocityPxPerSec = pxPerSec;
      log('velocity', { velocityPxPerSec });
    },
    isRunning() {
      return running;
    },
  };
}
