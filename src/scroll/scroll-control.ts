import { requestWrite } from '../boot/scheduler';

export type Adapters = Partial<{
  getViewerTop: () => number;
  requestScroll: (top: number) => void;
  getViewportHeight: () => number;
  getViewerElement: () => HTMLElement | null;
  emit: (event: string, data?: any) => void;
  now: () => number;
  raf: (cb: FrameRequestCallback) => number;
}>;

export type TelemetryFn = (tag: string, data?: any) => void;

export default function createScrollController(adapters: Adapters = {}, telemetry?: TelemetryFn) {
  let bigErrStart: number | null = null;
  let lastTargetTop = 0;

  const HYS_ENTER = 0;
  const HYS_EXIT = 12;
  const END_EASE_MS = 600;
  const END_MARK_PAD = 8;

  let endState = { armed: false, locked: false, t0: 0, v0: 0 };

  function easeOutCubic(t: number) {
    return 1 - Math.pow(1 - t, 3);
  }

  function lastVisibleLine(lineEls: Array<HTMLElement | null> = []) {
    for (let i = lineEls.length - 1; i >= 0; i--) {
      const el = lineEls[i];
      if (!el) continue;
      if (el.offsetParent && el.offsetHeight > 0 && el.getClientRects().length) return el;
    }
    return null;
  }

  function computeMarkerY(viewer: HTMLElement | null, markerPct?: number) {
    if (!viewer) return 0;
    const r = viewer.getBoundingClientRect();
    return r.top + viewer.clientHeight * (markerPct ?? 0.4);
  }

  const root = (document.scrollingElement as HTMLElement) || document.documentElement;
  const A = {
    getViewerTop: adapters.getViewerTop || (() => (root && (root.scrollTop || 0)) || 0),
    requestScroll:
      adapters.requestScroll ||
      ((top: number) => {
        requestWrite(() => {
          try {
            root.scrollTop = top;
          } catch {}
        });
      }),
    getViewportHeight: adapters.getViewportHeight || (() => root.clientHeight || window.innerHeight || 0),
    getViewerElement: adapters.getViewerElement || (() => document.getElementById('viewer')),
    emit: adapters.emit || ((event: string, data?: any) => window.dispatchEvent(new CustomEvent(event, { detail: data }))),
    now: adapters.now || (() => (window.performance ? performance.now() : Date.now())),
    raf: adapters.raf || ((cb: FrameRequestCallback) => requestAnimationFrame(cb)),
  } as const;

  let mode: 'follow' | 'calm' = 'follow';
  let targetTop = 0;
  let lastT = A.now();
  let v = 0;
  let pendingRaf = 0;

  const Kp = 0.25;
  const Kd = 0.15;
  const Kff = 0.6;
  const MAX_STEP = 2000;
  const WAKE_EPS = 8;

  function controlScroll({ yActive, yMarker, scrollTop, maxScrollTop, now, markerOffset = 0, sim = 1, stallFired = false }: any) {
    const err = yActive - yMarker;
    const absErr = Math.abs(err);
    const micro = 12;
    const macro = 120;
    const maxStep = 320;
    const nowTs = now || (A.now ? A.now() : Date.now());

    if (absErr > macro) {
      if (bigErrStart == null) bigErrStart = nowTs;
      if (bigErrStart != null && nowTs - bigErrStart > 300) {
        bigErrStart = null;
        let snapTop = yActive - markerOffset;
        snapTop = Math.max(0, Math.min(snapTop, maxScrollTop));
        return { targetTop: snapTop, mode: 'snap' };
      }
    } else {
      bigErrStart = null;
    }

    let allowFastLane = absErr > macro || (stallFired && sim >= 0.85);

    if (scrollTop >= maxScrollTop - 2 && absErr > 0) {
      return { targetTop: maxScrollTop, mode: 'bottom' };
    }

    if (absErr <= micro) return null;

    const step = allowFastLane ? Math.min(absErr, maxStep) : Math.ceil(absErr * 0.35);
    let targetTop = scrollTop + Math.sign(err) * step;
    targetTop = Math.max(0, Math.min(targetTop, maxScrollTop));

    if (Math.abs(targetTop - lastTargetTop) > 0) {
      const postErr = yActive - (targetTop + markerOffset);
      if (Math.abs(postErr) < micro) {
        targetTop = yActive - markerOffset;
      }
      lastTargetTop = targetTop;
    }

    return { targetTop, mode: allowFastLane ? 'snap' : 'ease' } as any;
  }

  const log = telemetry || (() => {});

  function step() {
    pendingRaf = 0;
    const t = A.now();
    const dt = Math.max(0.001, (t - lastT) / 1000);
    lastT = t;

    const viewerTop = A.getViewerTop();
    const maxScrollTop = Math.max(0, (root.scrollHeight || 0) - (A.getViewportHeight() || 0));
    const ctrl = controlScroll({ yActive: targetTop, yMarker: viewerTop, scrollTop: viewerTop, maxScrollTop, now: t });
    if (ctrl) {
      if (ctrl.mode === 'snap') {
        A.requestScroll(ctrl.targetTop);
        log('scroll', { tag: 'scroll', top: ctrl.targetTop, mode: 'snap' });
      } else {
        const error = targetTop - viewerTop;
        const topDelta = error;

        const viewerEl = A.getViewerElement();
        const maxTop = viewerEl ? Math.max(0, viewerEl.scrollHeight - viewerEl.clientHeight) : 0;
        const atBottom = viewerTop >= maxTop - 0.5;

        const markerPct = typeof (window as any).__TP_MARKER_PCT === 'number' ? (window as any).__TP_MARKER_PCT : 0.4;
        const markerY = computeMarkerY(viewerEl, markerPct);

        const lastEl = lastVisibleLine((createScrollController as any)._lineEls || []);
        const lastTop = lastEl ? lastEl.getBoundingClientRect().top : Infinity;

        if (!endState.locked) {
          if (!endState.armed && lastTop <= markerY + HYS_ENTER) {
            endState.armed = true;
            endState.t0 = A.now();
            endState.v0 = v;
            A.emit('end:armed', { lastTop, markerY });
            const target = Math.min(maxTop, Math.max(0, viewerTop + END_MARK_PAD));
            if (target !== viewerTop) {
              A.requestScroll(target);
              return;
            }
          } else if (endState.armed && lastTop > markerY + HYS_EXIT) {
            endState = { armed: false, locked: false, t0: 0, v0: 0 };
            A.emit('end:retracted', { lastTop, markerY });
          }
        }

        let currentV = v;
        if (endState.armed && !endState.locked) {
          const tt = Math.min(1, (A.now() - endState.t0) / END_EASE_MS);
          currentV = endState.v0 * (1 - easeOutCubic(tt));
          if (atBottom || currentV < 0.5) {
            A.requestScroll(maxTop);
            v = 0;
            endState.locked = true;
            A.emit('end:reached', { top: maxTop, t: tt });
            return;
          }
        }

        if (endState.locked) {
          if (!atBottom) A.requestScroll(maxTop);
          v = 0;
          return;
        }

        const accel = Kp * error - Kd * currentV + Kff * (topDelta / Math.max(1, A.getViewportHeight()));
        v += accel * dt * 1000;
        let stepPx = v * dt;
        if (!Number.isFinite(stepPx)) stepPx = 0;
        stepPx = Math.max(-MAX_STEP, Math.min(MAX_STEP, stepPx));
        const nextTop = viewerTop + stepPx;
        A.requestScroll(nextTop);
        log('scroll', { tag: 'scroll', top: nextTop, mode: 'ease' });
        if (Math.abs(targetTop - nextTop) > WAKE_EPS) {
          pendingRaf = A.raf(step);
        }
      }
    }
  }

  function ensureLoop() {
    if (!pendingRaf && Math.abs(targetTop - A.getViewerTop()) > WAKE_EPS) {
      lastT = A.now();
      pendingRaf = A.raf(step);
    }
  }

  return {
    forceAlignToMarker(idx: number, markerY: number) {
      const el = (this as any).getLineElement(idx);
      if (!el) return;
      try {
        (el as HTMLElement).style.transition = 'background 0.2s';
        (el as HTMLElement).style.background = '#ff0';
        setTimeout(() => {
          try {
            (el as HTMLElement).style.background = '';
          } catch {}
        }, 200);
      } catch {}
      const rect = (el as HTMLElement).getBoundingClientRect();
      const viewerTop = A.getViewerTop();
      const delta = rect.top - markerY;
      const newScrollTop = Math.max(0, viewerTop + delta);
      console.debug('[forceAlignToMarker]', { idx, markerY, rectTop: rect.top, viewerTop, delta, newScrollTop });
      log('scroll', { tag: 'force-align', idx, markerY, rectTop: rect.top, viewerTop, delta, newScrollTop, ts: Date.now() });
      A.requestScroll(newScrollTop);
    },
    setLineElements(lineEls: Array<HTMLElement | null>) {
      (this as any)._lineEls = Array.isArray(lineEls) ? lineEls : [];
    },
    getLineElement(idx: number) {
      if (!(this as any)._lineEls || idx == null) return null;
      return (this as any)._lineEls[idx] ?? null;
    },
    getNearestLineElement(idx: number, radius = 20) {
      const list = (this as any)._lineEls || [];
      if (list[idx]) return list[idx];
      for (let d = 1; d <= radius; d++) {
        if (idx - d >= 0 && list[idx - d]) return list[idx - d];
        if (idx + d < list.length && list[idx + d]) return list[idx + d];
      }
      return null;
    },
    _lineEls: [] as Array<HTMLElement | null>,
    controlScrollStep: controlScroll,
    requestScroll({ top }: { top: number }) {
      if (typeof top === 'number' && Number.isFinite(top)) {
        targetTop = top;
        ensureLoop();
      }
    },
    nudge(delta: number) {
      if (!Number.isFinite(delta)) return;
      targetTop = (A.getViewerTop() || 0) + delta;
      ensureLoop();
    },
    updateMatch(update: any) {
      try {
        if (typeof update?.nextTop === 'number' && Number.isFinite(update.nextTop)) {
          targetTop = update.nextTop;
        } else if (typeof update?.behindPx === 'number' && Number.isFinite(update.behindPx)) {
          targetTop = (A.getViewerTop() || 0) + update.behindPx;
        }
        ensureLoop();
      } catch {}
    },
    setMode(m: 'follow' | 'calm') {
      mode = m === 'calm' ? 'calm' : 'follow';
      v *= mode === 'calm' ? 0.6 : 1.0;
    },
    isActive() {
      return pendingRaf !== 0 || Math.abs(targetTop - A.getViewerTop()) > 1;
    },
    resetEndgame() {
      endState = { armed: false, locked: false, t0: 0, v0: 0 };
    },
  } as any;
}
