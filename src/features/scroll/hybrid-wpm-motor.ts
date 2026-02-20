import type { Motor, MotorStartResult } from './motor';

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
  let lastTickLog = 0;
  let writer: HTMLElement | null = null;
  let warnedNoWriter = false;
  let warnedNoOverflow = false;
  let loggedFirstMove = false;
  let lastMoveAtMs = 0;
  let lastDtClampLogAtMs = 0;
  let posFloat: number | null = null;
  const TICK_LOG_INTERVAL_MS = 1000;
  const DT_CLAMP_LOG_INTERVAL_MS = 250;

  const now = deps.now ?? (() => performance.now());
  const raf = deps.raf ?? ((cb: FrameRequestCallback) => window.requestAnimationFrame(cb));
  const caf = deps.caf ?? ((id: number) => window.cancelAnimationFrame(id));
  const log = deps.log ?? (() => {});

  const recordMove = (prevTop: number, nextTop: number) => {
    const delta = Math.abs(nextTop - prevTop);
    if (delta > 0.25 && !loggedFirstMove) {
      loggedFirstMove = true;
      try {
        console.warn("[HYBRID] first move", { prevTop, nextTop, max: writer ? Math.max(0, writer.scrollHeight - writer.clientHeight) : -1 });
      } catch {}
    }
    if (delta > 0) {
      lastMoveAtMs = now();
    }
  };

  const resetAccumulatorFromDom = () => {
    posFloat = writer ? writer.scrollTop || 0 : null;
  };

  const tick = () => {
    if (!running) return;
    const current = now();
    const prev = lastNow ?? current;
    const deltaMs = current - prev;
    const dt = clamp(deltaMs / 1000, 0, 0.2);
    if (deltaMs > 200) {
      if (current - lastDtClampLogAtMs >= DT_CLAMP_LOG_INTERVAL_MS) {
        lastDtClampLogAtMs = current;
        log('dt-clamp', {
          dtRaw: deltaMs / 1000,
          dtClamped: dt,
        });
      }
    }
    lastNow = current;

    if (velocityPxPerSec !== 0) {
      if (!writer) {
        if (!warnedNoWriter) {
          warnedNoWriter = true;
          try { console.error("[HYBRID] no writer"); } catch {}
        }
        stop();
        return;
      }
      const max = Math.max(0, writer.scrollHeight - writer.clientHeight);
      if (max <= 0) {
        if (!warnedNoOverflow) {
          warnedNoOverflow = true;
          try {
            console.warn("[HYBRID] nothing to scroll", { sh: writer.scrollHeight, h: writer.clientHeight });
          } catch {}
        }
        rafId = raf(tick);
        return;
      }
      const prevTop = writer.scrollTop || 0;
      if (posFloat == null) {
        posFloat = prevTop;
      }
      posFloat += velocityPxPerSec * dt;
      posFloat = clamp(posFloat, 0, max);
      const nextTop = posFloat;
      try {
        writer.scrollTop = nextTop;
      } catch (err) {
        log('tick:scroll', err);
      }
      recordMove(prevTop, nextTop);
      const tickNow = now();
      if (tickNow - lastTickLog >= TICK_LOG_INTERVAL_MS) {
        lastTickLog = tickNow;
        log('tick', {
          dt,
          velocityPxPerSec,
          prevTop,
          nextTop,
          maxTop: max,
          hasWriter: !!writer,
        });
      }
    }

    rafId = raf(tick);
  };

  return {
    start(): MotorStartResult {
      if (running || rafId != null) {
        return { started: false, reason: "already-running" };
      }
      running = true;
      loggedFirstMove = false;
      lastMoveAtMs = 0;
      resetAccumulatorFromDom();
      lastNow = now();
      rafId = raf(tick);
      log('start', { velocityPxPerSec });
      return { started: true };
    },
    stop() {
      if (!running) return;
      running = false;
      if (rafId != null) {
        caf(rafId);
        rafId = null;
      }
      lastNow = null;
      loggedFirstMove = false;
      lastMoveAtMs = 0;
      posFloat = null;
      log('stop', {});
    },
    setVelocityPxPerSec(pxPerSec: number) {
      velocityPxPerSec = pxPerSec;
      log('velocity', { velocityPxPerSec });
    },
    isRunning() {
      return running;
    },
    setWriter(el: HTMLElement | null) {
      writer = el;
      resetAccumulatorFromDom();
      if (writer) {
        warnedNoWriter = false;
        warnedNoOverflow = false;
      }
    },
    movedRecently(nowArg?: number) {
      const check = typeof nowArg === 'number' ? nowArg : now();
      return lastMoveAtMs > 0 && check - lastMoveAtMs < 250;
    },
  };
}
