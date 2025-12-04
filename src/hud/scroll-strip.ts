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

  const modeEl = container.querySelector<HTMLElement>('[data-hud-scroll-mode]');
  const stateEl = container.querySelector<HTMLElement>('[data-hud-scroll-state]');
  const speedEl = container.querySelector<HTMLElement>('[data-hud-scroll-speed]');
  const posEl = container.querySelector<HTMLElement>('[data-hud-scroll-pos]');

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
      speedEl.textContent = `Speed: Δ${detail.delta.toFixed(1)} px`;
    }
  }

  function handleStatus(ev: Event) {
    const detail = (ev as CustomEvent<ScrollStatusDetail>).detail;
    if (!detail) return;
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
