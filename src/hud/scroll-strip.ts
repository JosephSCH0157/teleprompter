type ScrollMode = 'timed' | 'wpm' | 'hybrid' | 'asr' | 'step' | 'rehearsal';

interface ScrollStatusDetail {
  mode: ScrollMode;
  strategy: string;
  running: boolean;
  activeIdx?: number;
  lineCount?: number;
}

interface ScrollCommitDetail {
  mode?: ScrollMode;
  delta: number;
  targetTop: number;
  currentTop: number;
  maxScrollTop: number;
}

export interface ScrollStripHudOptions {
  root: HTMLElement;
}

export function initScrollStripHud(opts: ScrollStripHudOptions) {
  const { root } = opts;
  const STRIP_POS_KEY = 'tp_hud_strip_pos_v1';
  const STRIP_OPEN_KEY = 'tp_hud_open';
  const DRAG_THRESHOLD_PX = 5;

  const container = document.createElement('div');
  container.className = 'tp-hud-strip';
  container.dataset.tpHudStrip = 'scroll';

  container.innerHTML = `
    <div class="tp-hud-strip-inner">
      <span class="tp-hud-pill" data-hud-scroll-mode>Mode: -</span>
      <span class="tp-hud-pill" data-hud-scroll-state>Scroll: Waiting</span>
      <span class="tp-hud-pill" data-hud-scroll-speed>Speed: -</span>
      <span class="tp-hud-pill" data-hud-scroll-pos>Line: -</span>
    </div>
  `;

  root.appendChild(container);

  const inner = container.querySelector<HTMLElement>('.tp-hud-strip-inner');
  const modeEl = container.querySelector<HTMLElement>('[data-hud-scroll-mode]');
  const stateEl = container.querySelector<HTMLElement>('[data-hud-scroll-state]');
  const speedEl = container.querySelector<HTMLElement>('[data-hud-scroll-speed]');
  const posEl = container.querySelector<HTMLElement>('[data-hud-scroll-pos]');

  let lastMode: ScrollMode | null = null;
  let offsetX = 0;
  let offsetY = 0;

  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

  const applyOffset = () => {
    if (!inner) return;
    inner.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  };

  const loadOffset = () => {
    try {
      const raw = localStorage.getItem(STRIP_POS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { x?: number; y?: number };
      if (typeof parsed.x === 'number') offsetX = parsed.x;
      if (typeof parsed.y === 'number') offsetY = parsed.y;
      applyOffset();
    } catch {
      // ignore
    }
  };

  const saveOffset = () => {
    try {
      localStorage.setItem(STRIP_POS_KEY, JSON.stringify({ x: offsetX, y: offsetY }));
    } catch {
      // ignore
    }
  };

  const setOpenState = (open: boolean) => {
    try {
      document.documentElement.classList.toggle('tp-hud-open', open);
    } catch {
      // ignore
    }
    try {
      localStorage.setItem(STRIP_OPEN_KEY, open ? '1' : '0');
    } catch {
      // ignore
    }
    try {
      const popup = (window as any).__tpHudPopup;
      if (popup && typeof popup.setOpen === 'function') popup.setOpen(open);
      if (!popup && open) (window as any).__tpHud?.show?.();
    } catch {
      // ignore
    }
  };

  const toggleOpenState = () => {
    const open = document.documentElement.classList.contains('tp-hud-open');
    setOpenState(!open);
  };

  const restoreOpenState = () => {
    try {
      const open = localStorage.getItem(STRIP_OPEN_KEY) === '1';
      if (open) setOpenState(true);
    } catch {
      // ignore
    }
  };

  loadOffset();
  restoreOpenState();

  if (inner) {
    inner.style.touchAction = 'none';
    inner.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      inner.setPointerCapture(ev.pointerId);
      const startX = ev.clientX;
      const startY = ev.clientY;
      const baseX = offsetX;
      const baseY = offsetY;
      let moved = false;

      const rect = inner.getBoundingClientRect();
      const margin = 8;
      const vw = window.innerWidth || document.documentElement.clientWidth || 0;
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      const minX = baseX + (margin - rect.left);
      const maxX = baseX + (vw - margin - rect.right);
      const minY = baseY + (margin - rect.top);
      const maxY = baseY + (vh - margin - rect.bottom);

      const onMove = (moveEv: PointerEvent) => {
        const dx = moveEv.clientX - startX;
        const dy = moveEv.clientY - startY;
        if (!moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
          moved = true;
        }
        if (!moved) return;
        offsetX = clamp(baseX + dx, minX, maxX);
        offsetY = clamp(baseY + dy, minY, maxY);
        applyOffset();
      };

      const onUp = () => {
        inner.removeEventListener('pointermove', onMove);
        inner.removeEventListener('pointerup', onUp);
        inner.removeEventListener('pointercancel', onUp);
        try { inner.releasePointerCapture(ev.pointerId); } catch {}
        if (!moved) {
          toggleOpenState();
        } else {
          saveOffset();
        }
      };

      inner.addEventListener('pointermove', onMove);
      inner.addEventListener('pointerup', onUp);
      inner.addEventListener('pointercancel', onUp);
    });
  }

  function updateFromStatus(detail: ScrollStatusDetail) {
    if (modeEl) {
      const label = (() => {
        switch (detail.mode) {
          case 'wpm': return 'WPM';
          case 'hybrid': return 'Hybrid (PLL)';
          case 'asr': return 'ASR lock';
          case 'timed': return 'Timed';
          case 'step': return 'Step';
          case 'rehearsal': return 'Rehearsal';
          default: return detail.mode;
        }
      })();
      modeEl.textContent = `Mode: ${label}`;
    }

    if (stateEl) {
      const state = detail.running ? 'Running' : 'Waiting';
      stateEl.textContent = `Scroll: ${state}`;
    }

    if (posEl && detail.activeIdx != null && detail.lineCount != null && detail.lineCount > 0) {
      const idx = detail.activeIdx + 1; // zero -> one-based
      const pct = Math.round((idx / detail.lineCount) * 100);
      posEl.textContent = `Line: ${idx} / ${detail.lineCount} (${pct}%)`;
    }
  }

  function updateFromCommit(detail: ScrollCommitDetail) {
    if (speedEl) {
      const delta = Number.isFinite(detail.delta) ? detail.delta : 0;
      const label = lastMode === 'step' ? 'Advance' : 'Speed';
      speedEl.textContent = `${label}: Δ${delta.toFixed(1)} px`;
    }
  }

  function handleStatus(ev: Event) {
    const detail = (ev as CustomEvent<ScrollStatusDetail>).detail;
    if (!detail) return;
    lastMode = detail.mode;
    updateFromStatus(detail);
  }

  function handleCommit(ev: Event) {
    const detail = (ev as CustomEvent<ScrollCommitDetail>).detail;
    if (!detail) return;
    updateFromCommit(detail);
  }

  window.addEventListener('tp:scroll:status', handleStatus);
  window.addEventListener('tp:scroll:commit', handleCommit);

  function destroy() {
    window.removeEventListener('tp:scroll:status', handleStatus);
    window.removeEventListener('tp:scroll:commit', handleCommit);
    container.remove();
  }

  return { destroy };
}
