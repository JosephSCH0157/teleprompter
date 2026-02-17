type ScrollMode = 'timed' | 'wpm' | 'hybrid' | 'asr' | 'step' | 'rehearsal';

interface ScrollStatusDetail {
  mode: ScrollMode;
  strategy: string;
  running: boolean;
  activeIdx?: number;
  lineCount?: number;
}

interface ScrollModeDetail {
  mode?: ScrollMode | string;
  phase?: string;
  autoRunning?: boolean;
  hybridRunning?: boolean;
  userEnabled?: boolean;
  sessionIntentOn?: boolean;
}

interface ScrollCommitDetail {
  mode?: ScrollMode;
  delta: number;
  targetTop: number;
  currentTop: number;
  maxScrollTop: number;
}

type AsrStallClass = 'speech_stall' | 'matcher_stall' | 'unknown';

interface AsrStallDetail {
  ts: number;
  stallClass: AsrStallClass;
  sinceOnResultMs: number | null;
  sinceCommitMs: number | null;
  speechRunningActual: boolean;
  recognizerAttached: boolean;
  commitCount: number;
}

interface AsrHeartbeatDetail {
  ts: number;
  sinceOnResultMs: number | null;
  sinceCommitMs: number | null;
  speechRunningActual: boolean;
  recognizerAttached: boolean;
  commitCount: number;
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
      <span class="tp-hud-pill" data-hud-asr-stall style="display:none"></span>
      <button class="tp-hud-pill" data-hud-asr-resync style="display:none;border:1px solid rgba(255,255,255,0.22);cursor:pointer">Resync</button>
    </div>
  `;

  root.appendChild(container);

  const inner = container.querySelector<HTMLElement>('.tp-hud-strip-inner');
  const modeEl = container.querySelector<HTMLElement>('[data-hud-scroll-mode]');
  const stateEl = container.querySelector<HTMLElement>('[data-hud-scroll-state]');
  const speedEl = container.querySelector<HTMLElement>('[data-hud-scroll-speed]');
  const posEl = container.querySelector<HTMLElement>('[data-hud-scroll-pos]');
  const stallEl = container.querySelector<HTMLElement>('[data-hud-asr-stall]');
  const resyncBtn = container.querySelector<HTMLButtonElement>('[data-hud-asr-resync]');

  let lastMode: ScrollMode | null = null;
  let offsetX = 0;
  let offsetY = 0;
  let guardStallText = '';
  let lastStall: AsrStallDetail | null = null;
  let lastHeartbeat: AsrHeartbeatDetail | null = null;
  let stallOkVisibleUntil = 0;
  let stallOkHideTimer: number | null = null;
  const STALL_OK_LINGER_MS = 1200;

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
    renderStall();
  }

  function updateFromCommit(detail: ScrollCommitDetail) {
    if (speedEl) {
      const delta = Number.isFinite(detail.delta) ? detail.delta : 0;
      const label = lastMode === 'step' ? 'Advance' : 'Speed';
      speedEl.textContent = `${label}: Δ${delta.toFixed(1)} px`;
    }
  }

  function cancelStallOkHideTimer() {
    if (stallOkHideTimer != null) {
      window.clearTimeout(stallOkHideTimer);
      stallOkHideTimer = null;
    }
  }

  function hideStallUi() {
    if (stallEl) {
      stallEl.style.display = 'none';
      stallEl.title = '';
    }
    if (resyncBtn) resyncBtn.style.display = 'none';
  }

  function getAsrArmed(): boolean {
    try {
      const store: any = (window as any).__tpStore;
      return store?.get?.('session.asrArmed') === true;
    } catch {
      return false;
    }
  }

  function getScrollMode(): string {
    try {
      const store: any = (window as any).__tpStore;
      const mode = store?.get?.('scrollMode') ?? store?.get?.('mode');
      if (mode) return String(mode).toLowerCase();
      const router: any = (window as any).__tpScrollMode;
      if (router && typeof router.getMode === 'function') {
        const m = router.getMode();
        if (m) return String(m).toLowerCase();
      }
      if (typeof router === 'string') return router.toLowerCase();
    } catch {
      // ignore
    }
    return '';
  }

  function isAsrContext(): boolean {
    if (lastMode === 'asr') return true;
    if (getScrollMode() === 'asr') return true;
    return getAsrArmed();
  }

  function fmtAgeMs(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    return `${Math.max(0, Math.round(value))}ms`;
  }

  function buildStallTitle(stallDetail: AsrStallDetail | null, heartbeatDetail: AsrHeartbeatDetail | null): string {
    const detail = heartbeatDetail ?? stallDetail;
    if (!detail) return '';
    const commitCount = Number.isFinite(detail.commitCount) ? Math.max(0, Math.floor(detail.commitCount)) : 0;
    return [
      `sinceOnResultMs=${fmtAgeMs(detail.sinceOnResultMs)}`,
      `sinceCommitMs=${fmtAgeMs(detail.sinceCommitMs)}`,
      `speechRunningActual=${detail.speechRunningActual ? 'true' : 'false'}`,
      `recognizerAttached=${detail.recognizerAttached ? 'true' : 'false'}`,
      `commitCount=${commitCount}`,
    ].join(' | ');
  }

  function renderStall() {
    if (!isAsrContext()) {
      hideStallUi();
      return;
    }

    const stallClass = lastStall?.stallClass ?? 'unknown';
    const now = Date.now();
    const keepOkVisible = stallOkVisibleUntil > now;
    const verdictText =
      stallClass === 'speech_stall'
        ? '🛑 Speech stall'
        : stallClass === 'matcher_stall'
          ? '🟠 Matcher stall'
          : keepOkVisible
            ? '✅ OK'
            : '';
    const text = verdictText || guardStallText;
    if (!text) {
      hideStallUi();
      return;
    }

    if (stallEl) {
      stallEl.textContent = text;
      stallEl.title = buildStallTitle(lastStall, lastHeartbeat);
      stallEl.style.display = '';
    }

    const isHardStall = stallClass === 'speech_stall' || stallClass === 'matcher_stall';
    if (resyncBtn) resyncBtn.style.display = isHardStall || !!guardStallText ? '' : 'none';
  }

  function applyStall(detail: AsrStallDetail) {
    const prevClass = lastStall?.stallClass ?? 'unknown';
    lastStall = detail;

    if (detail.stallClass === 'unknown') {
      if (prevClass === 'speech_stall' || prevClass === 'matcher_stall') {
        stallOkVisibleUntil = Date.now() + STALL_OK_LINGER_MS;
        cancelStallOkHideTimer();
        stallOkHideTimer = window.setTimeout(() => {
          stallOkVisibleUntil = 0;
          renderStall();
        }, STALL_OK_LINGER_MS);
      } else {
        stallOkVisibleUntil = 0;
        cancelStallOkHideTimer();
      }
    } else {
      stallOkVisibleUntil = 0;
      cancelStallOkHideTimer();
    }

    renderStall();
  }

  function readWindowStall(): AsrStallDetail | null {
    try {
      const detail = (window as any).__tpAsrStallLast;
      if (!detail || typeof detail !== 'object') return null;
      const stallClass = String((detail as any).stallClass || '').toLowerCase();
      if (stallClass !== 'speech_stall' && stallClass !== 'matcher_stall' && stallClass !== 'unknown') return null;
      return detail as AsrStallDetail;
    } catch {
      return null;
    }
  }

  function readWindowHeartbeat(): AsrHeartbeatDetail | null {
    try {
      const detail = (window as any).__tpAsrHeartbeatLast;
      if (!detail || typeof detail !== 'object') return null;
      if (typeof (detail as any).ts !== 'number' || !Number.isFinite((detail as any).ts)) return null;
      return detail as AsrHeartbeatDetail;
    } catch {
      return null;
    }
  }

  function showStall(text: string) {
    guardStallText = text;
    renderStall();
  }

  function clearStall() {
    guardStallText = '';
    renderStall();
  }

  function triggerResync(source: string) {
    try { (window as any).__tpAsrRequestRescue?.(); } catch {}
    try { window.dispatchEvent(new CustomEvent('tp:asr:rescue', { detail: { source } })); } catch {}
    clearStall();
  }

  function handleGuard(ev: Event) {
    const detail = (ev as CustomEvent<any>)?.detail ?? {};
    if (!detail || typeof detail !== 'object') return;
    const text = typeof detail.text === 'string' ? detail.text : '';
    const key = typeof detail.key === 'string' ? detail.key : '';
    if (key === 'stall' || text.toLowerCase().includes('asr stalled')) {
      const reasonSummary = typeof detail.reasonSummary === 'string' ? detail.reasonSummary : '';
      const msg = reasonSummary ? `ASR stalled • ${reasonSummary}` : (text || 'ASR stalled');
      showStall(msg);
    }
  }

  function handleAdvance() {
    clearStall();
  }

  const isEditableTarget = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if ((el as HTMLElement).isContentEditable) return true;
    return false;
  };
  function handleStatus(ev: Event) {
    const detail = (ev as CustomEvent<ScrollStatusDetail>).detail;
    if (!detail) return;
    lastMode = detail.mode;
    updateFromStatus(detail);
  }

  function normalizeMode(raw: unknown): ScrollMode {
    const mode = String(raw || '').toLowerCase();
    switch (mode) {
      case 'timed':
      case 'wpm':
      case 'hybrid':
      case 'asr':
      case 'step':
      case 'rehearsal':
        return mode;
      default:
        return 'hybrid';
    }
  }

  function deriveRunningFromMode(detail: ScrollModeDetail): boolean {
    const mode = normalizeMode(detail.mode);
    if (mode === 'asr') {
      // ASR lane movement is commit-driven and considered active while in live phase.
      return String(detail.phase || '').toLowerCase() === 'live';
    }
    if (mode === 'hybrid') {
      return !!detail.hybridRunning;
    }
    return !!detail.autoRunning && !!detail.userEnabled && !!detail.sessionIntentOn;
  }

  function handleModeSnapshot(ev: Event) {
    const detail = (ev as CustomEvent<ScrollModeDetail>).detail;
    if (!detail) return;
    const mode = normalizeMode(detail.mode);
    const status: ScrollStatusDetail = {
      mode,
      strategy: mode,
      running: deriveRunningFromMode(detail),
    };
    lastMode = mode;
    updateFromStatus(status);
  }

  function handleCommit(ev: Event) {
    const detail = (ev as CustomEvent<ScrollCommitDetail>).detail;
    if (!detail) return;
    updateFromCommit(detail);
  }

  function handleAsrStall(ev: Event) {
    const detail = (ev as CustomEvent<AsrStallDetail>)?.detail;
    if (!detail || typeof detail !== 'object') return;
    const stallClass = String((detail as any).stallClass || '').toLowerCase();
    if (stallClass !== 'speech_stall' && stallClass !== 'matcher_stall' && stallClass !== 'unknown') return;
    applyStall(detail);
  }

  function handleAsrHeartbeat() {
    const snapshot = readWindowHeartbeat();
    if (snapshot) lastHeartbeat = snapshot;
    renderStall();
  }

  window.addEventListener('tp:scroll:status', handleStatus);
  window.addEventListener('tp:scroll:mode', handleModeSnapshot as EventListener);
  window.addEventListener('tp:scroll:commit', handleCommit);
  window.addEventListener('tp:asr:guard', handleGuard as EventListener);
  window.addEventListener('tp:asr:stall', handleAsrStall as EventListener);
  window.addEventListener('tp:asr:heartbeat', handleAsrHeartbeat as EventListener);
  window.addEventListener('asr:advance', handleAdvance as EventListener);

  const initialStall = readWindowStall();
  if (initialStall) applyStall(initialStall);
  const initialHeartbeat = readWindowHeartbeat();
  if (initialHeartbeat) {
    lastHeartbeat = initialHeartbeat;
    renderStall();
  }

  if (resyncBtn) {
    resyncBtn.addEventListener('click', () => triggerResync('hud'));
  }

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.defaultPrevented) return;
    if (ev.key !== 'r' && ev.key !== 'R') return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (isEditableTarget(ev.target)) return;
    if (getScrollMode() !== 'asr') return;
    triggerResync('hotkey');
  };
  window.addEventListener('keydown', onKeyDown);

  function destroy() {
    cancelStallOkHideTimer();
    window.removeEventListener('tp:scroll:status', handleStatus);
    window.removeEventListener('tp:scroll:mode', handleModeSnapshot as EventListener);
    window.removeEventListener('tp:scroll:commit', handleCommit);
    window.removeEventListener('tp:asr:guard', handleGuard as EventListener);
    window.removeEventListener('tp:asr:stall', handleAsrStall as EventListener);
    window.removeEventListener('tp:asr:heartbeat', handleAsrHeartbeat as EventListener);
    window.removeEventListener('asr:advance', handleAdvance as EventListener);
    window.removeEventListener('keydown', onKeyDown);
    container.remove();
  }

  return { destroy };
}
