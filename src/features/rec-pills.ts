import { getAutoRecordEnabled } from '../state/auto-record-ssot';
import type { AppStore } from '../state/app-store';
import { isSessionRecording } from '../recording/recorderRegistry';
import { pushDisplayRecordState } from './display-sync';

export type RecState = 'off' | 'armed' | 'recording';

export function deriveRecState(opts: {
  recordingEnabled: boolean;
  isPrerollActive: boolean;
  isRecordingActive: boolean;
}): RecState {
  if (!opts.recordingEnabled) return 'off';
  if (opts.isRecordingActive) return 'recording';
  return 'armed';
}

type Variant = 'main' | 'display';

let mainState: RecState = 'off';
let displayState: RecState = 'off';
let mainWired = false;
let displayWired = false;
let bc: BroadcastChannel | null = null;
const DISPLAY_STYLE_ID = 'rec-pill-display-style';
const REC_PILL_BASE_CSS = `
.rec-pill{display:none;align-items:center;justify-content:center;height:calc(22px * var(--tp-ui-scale));padding:0 calc(12px * var(--tp-ui-scale));border-radius:calc(999px * var(--tp-ui-scale));font-size:var(--tp-ui-font-sm);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;line-height:1;opacity:0;transform:scale(.98);transition:opacity 500ms ease,transform 500ms ease,color 320ms ease,background-color 320ms ease;pointer-events:none;user-select:none}
.rec-pill.is-visible{opacity:1;transform:scale(1)}
.rec-pill.rec-pill--armed{background:#ffd54f;color:#1a1f27}
.rec-pill.rec-pill--recording{background:#ef5350;color:#fff;animation:recPulse 2.5s ease-in-out infinite}
.rec-pill--main{height:calc(24px * var(--tp-ui-scale));padding:0 calc(12px * var(--tp-ui-scale));font-size:var(--tp-ui-font-sm)}
.rec-pill--display{position:fixed;top:calc(10px * var(--tp-ui-scale));right:calc(14px * var(--tp-ui-scale));height:calc(18px * var(--tp-ui-scale));padding:0 calc(10px * var(--tp-ui-scale));font-size:var(--tp-ui-font-xs);z-index:1200;opacity:0.75}
.rec-pill--display.is-visible{opacity:0.75}
.rec-pill--display.rec-pill--recording.is-visible{opacity:0.85}
.rec-pill--display.rec-pill--recording{opacity:0.85}
.rec-pill-host{display:inline-flex;align-items:center;margin-left:calc(10px * var(--tp-ui-scale));margin-right:calc(8px * var(--tp-ui-scale))}
.rec-pill-live{min-width:1px;min-height:1px}
@keyframes recPulse{0%{transform:scale(1);opacity:1}50%{transform:scale(1.03);opacity:.95}100%{transform:scale(1);opacity:1}}
`;

function isDisplayContext(): boolean {
  try {
    if (document.documentElement.classList.contains('tp-display')) return true;
  } catch {}
  try {
    const search = new URLSearchParams(location.search || '');
    if (search.get('display') === '1') return true;
  } catch {}
  try {
    const path = (location.pathname || '').toLowerCase();
    if (path.endsWith('/display.html') || path === '/display.html') return true;
  } catch {}
  return false;
}

function injectDisplayStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(DISPLAY_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DISPLAY_STYLE_ID;
  style.textContent = REC_PILL_BASE_CSS;
  try {
    document.head.appendChild(style);
  } catch {}
}

function whenDomReady(fn: () => void): void {
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

function ensureLiveRegion(): HTMLElement | null {
  let live = document.getElementById('recPillLive') as HTMLElement | null;
  if (!live) {
    live = document.createElement('span');
    live.id = 'recPillLive';
    live.className = 'sr-only rec-pill-live';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
  }
  return live;
}

function ensureMainHost(): { pill: HTMLSpanElement; live: HTMLElement } | null {
  if (typeof document === 'undefined') return null;
  const host =
    (document.getElementById('recPillHost') as HTMLElement | null) ||
    (() => {
      const el = document.createElement('span');
      el.id = 'recPillHost';
      el.className = 'rec-pill-host';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      return el;
    })();

  let pill = document.getElementById('recPill') as HTMLSpanElement | null;
  if (!pill) {
    pill = document.createElement('span');
    pill.id = 'recPill';
    pill.className = 'rec-pill rec-pill--main';
    pill.textContent = 'REC';
    pill.setAttribute('aria-hidden', 'true');
  }

  const live = ensureLiveRegion();
  if (!live) return null;

  if (!pill.parentElement) host.appendChild(pill);
  if (!live.parentElement) host.appendChild(live);

  if (!host.parentElement) {
    const right = document.getElementById('topbarRight');
    if (right) {
      right.insertBefore(host, right.firstChild || null);
    } else {
      const bar = document.querySelector('.topbar');
      (bar || document.body).appendChild(host);
    }
  }

  return { pill, live };
}

function ensureDisplayPill(): HTMLSpanElement | null {
  if (typeof document === 'undefined') return null;
  const existing = document.getElementById('displayRecPill') as HTMLSpanElement | null;
  if (existing) return existing;

  const pill = document.createElement('span');
  pill.id = 'displayRecPill';
  pill.className = 'rec-pill rec-pill--display';
  pill.textContent = 'REC';
  pill.setAttribute('aria-hidden', 'true');
  pill.style.display = 'none';

  const inject = () => {
    try {
      document.body.appendChild(pill);
    } catch {}
  };

  whenDomReady(inject);
  return pill;
}

function renderPill(pill: HTMLElement, next: RecState, prev: RecState, variant: Variant): void {
  const showing = next !== 'off';
  const justAppeared = prev === 'off' && showing;
  const isRecording = next === 'recording';
  pill.classList.toggle('is-armed', next === 'armed');
  pill.classList.toggle('is-recording', isRecording);
  pill.classList.toggle('rec-pill--recording', isRecording);
  pill.classList.toggle('rec-pill--armed', next === 'armed');

  if (variant === 'display') {
    pill.classList.add('rec-pill--display');
  } else {
    pill.classList.add('rec-pill--main');
  }

  if (!showing) {
    pill.classList.remove('is-visible');
    pill.setAttribute('aria-hidden', 'true');
    pill.style.display = 'none';
    return;
  }

  pill.textContent = isRecording ? 'REC' : 'REC ARMED';
  pill.style.display = 'inline-flex';
  pill.setAttribute('aria-hidden', 'false');
  if (justAppeared) {
    pill.classList.remove('is-visible');
    requestAnimationFrame(() => pill.classList.add('is-visible'));
  } else {
    pill.classList.add('is-visible');
  }
}

function announceState(live: HTMLElement | null, prev: RecState, next: RecState): void {
  if (!live || prev === next) return;
  let msg = '';
  if (next === 'recording') {
    msg = 'Recording started';
  } else if (prev === 'recording') {
    msg = 'Recording stopped';
  } else if (next === 'armed') {
    msg = 'Recording armed';
  }
  if (msg) live.textContent = msg;
}

function broadcastState(state: RecState): void {
  if (isDisplayContext()) return;
  try {
    bc = bc || new BroadcastChannel('tp_rec_state');
    bc.postMessage({ type: 'rec-state', state });
  } catch {}
  try {
    const send = (window as any).sendToDisplay;
    if (typeof send === 'function') send({ type: 'rec-state', state });
  } catch {}
  try { pushDisplayRecordState(state === 'off' ? 'idle' : state === 'armed' ? 'armed' : 'recording'); } catch {}
}

function setMainState(next: RecState): void {
  if (mainState === next) return;
  const ctx = ensureMainHost();
  if (!ctx) return;
  renderPill(ctx.pill, next, mainState, 'main');
  announceState(ctx.live, mainState, next);
  mainState = next;
  broadcastState(next);
}

function setDisplayState(next: RecState): void {
  const pill = ensureDisplayPill();
  if (!pill || displayState === next) {
    displayState = next;
    return;
  }
  renderPill(pill, next, displayState, 'display');
  displayState = next;
}

export function initRecPillsDisplay(): void {
  if (displayWired) return;
  if (!isDisplayContext()) return;
  displayWired = true;

  injectDisplayStyles();

  const attachListeners = () => {
    try {
      bc = bc || new BroadcastChannel('tp_rec_state');
      bc.addEventListener('message', (ev) => {
        const data = (ev && (ev as MessageEvent).data) || {};
        if (data && data.type === 'rec-state' && data.state) {
          setDisplayState(data.state as RecState);
        }
      });
    } catch {}

    try {
      window.addEventListener('message', (ev) => {
        const data = (ev && (ev as MessageEvent).data) || {};
        if (data && data.type === 'rec-state' && data.state) {
          setDisplayState(data.state as RecState);
        }
      });
    } catch {}
  };

  attachListeners();
}

export function initRecPillsMain(store?: AppStore | null): void {
  if (mainWired) return;
  if (isDisplayContext()) return;
  mainWired = true;

  let recordingEnabled = false;
  let isPrerollActive = false;
  let isRecordingActive = isSessionRecording();

  const recompute = () => {
    const next = deriveRecState({ recordingEnabled, isPrerollActive, isRecordingActive });
    setMainState(next);
  };

  try {
    recordingEnabled = !!getAutoRecordEnabled();
  } catch {}

  try {
    const initialPhase = store?.get?.('session.phase') as string | undefined;
    isPrerollActive = String(initialPhase || '').toLowerCase() === 'preroll';
  } catch {}

  try {
    store?.subscribe?.('autoRecord' as any, (val: unknown) => {
      recordingEnabled = typeof val === 'boolean' ? val : !!getAutoRecordEnabled();
      recompute();
    });
  } catch {}

  try {
    store?.subscribe?.('session.phase' as any, (phase: unknown) => {
      const p = String(phase || '').toLowerCase();
      isPrerollActive = p === 'preroll';
      if (p === 'idle' || p === 'wrap') {
        isRecordingActive = isSessionRecording();
      }
      recompute();
    });
  } catch {}

  try {
    window.addEventListener('tp:session:phase', (ev: Event) => {
      const phase = (ev as CustomEvent)?.detail?.phase || '';
      const p = String(phase || '').toLowerCase();
      isPrerollActive = p === 'preroll';
      if (p === 'idle' || p === 'wrap') {
        isRecordingActive = isSessionRecording();
      }
      recompute();
    });
  } catch {}

  try {
    window.addEventListener('tp:preroll:done', () => {
      isPrerollActive = false;
      recompute();
    });
  } catch {}

  try {
    window.addEventListener('tp:recording:state', (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      if (typeof detail.recording === 'boolean') {
        isRecordingActive = detail.recording;
        recompute();
      }
    });
  } catch {}

  try {
    window.addEventListener('tp:display:opened', () => broadcastState(mainState));
  } catch {}

  recompute();
}
