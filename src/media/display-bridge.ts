export type DisplayPayload = { type?: string } & Record<string, unknown>;

export interface DisplayBridgeApi {
  openDisplay(): void;
  closeDisplay(): void;
  sendToDisplay(payload: DisplayPayload): void;
  handleMessage(e: MessageEvent): void;
  currentWindow?: Window | null;
}

export interface DisplayDebugEntry {
  ts: number;
  t?: number;
  tag: string;
  data?: unknown;
}

declare global {
  interface Window {
    __tpDisplayWindow?: Window | null;
    __tpDisplay?: Partial<DisplayBridgeApi>;
    __tpDisplayDebug?: DisplayDebugEntry[];
    __tpScrollSeq?: number;
    openDisplay?: () => void;
    closeDisplay?: () => void;
    tpArmWatchdog?: (on: boolean) => void;
    $id?: <T extends HTMLElement = HTMLElement>(..._ids: string[]) => T | null;
  }
}

export {};

(function () {
  // Display bridge: open/close display window and handle handshake; exposes window.__tpDisplay
  let displayWin: Window | null = null;
  let displayReady = false;
  let displayHelloTimer: number | undefined;
  let displayHelloDeadline = 0;
  // ensure setStatus is defined to avoid ReferenceError; prefer window.setStatus if available
  const setStatus: (msg: string) => void =
    typeof window !== 'undefined' && typeof (window as any).setStatus === 'function'
      ? (window as any).setStatus.bind(window)
      : () => {};

  function openDisplay(): void {
    try {
      try {
        window.__tpDisplayDebug = window.__tpDisplayDebug || [];
        const now = Date.now();
        window.__tpDisplayDebug.push({ ts: now, t: now, tag: 'openDisplay()', data: undefined });
        console.info('[display-bridge] openDisplay()');
      } catch {}
      displayWin = window.open('display.html', 'TeleprompterDisplay', 'width=1000,height=700');
      try {
        window.__tpDisplayDebug = window.__tpDisplayDebug || [];
        const now2 = Date.now();
        window.__tpDisplayDebug.push({ ts: now2, t: now2, tag: 'window.open returned', data: { ok: !!displayWin } });
      } catch {}
      try { window.__tpDisplayWindow = displayWin || null; } catch {}
      if (!displayWin) {
        setStatus && setStatus('Pop-up blocked. Allow pop-ups and try again.');
        const chipBlocked = document.getElementById('displayChip');
        if (chipBlocked) chipBlocked.textContent = 'Display: blocked';
        return;
      }
      // Typography handled by TS runtime; no legacy script injection needed.
      displayReady = false;
      const chip = (window.$id && window.$id('displayChip')) || document.getElementById('displayChip');
      if (chip) chip.textContent = 'Display: open';
      try { window.tpArmWatchdog && window.tpArmWatchdog(true); } catch {}
      const closeDisplayBtn = (window.$id && window.$id('closeDisplayBtn')) || document.getElementById('closeDisplayBtn'); if (closeDisplayBtn) (closeDisplayBtn as HTMLButtonElement).disabled = false;
      if (displayHelloTimer !== undefined) { window.clearInterval(displayHelloTimer); displayHelloTimer = undefined; }
      displayHelloDeadline = performance.now() + 3000;
      displayHelloTimer = window.setInterval(() => {
        if (!displayWin || displayWin.closed || displayReady) {
          if (displayHelloTimer !== undefined) window.clearInterval(displayHelloTimer);
          displayHelloTimer = undefined;
          return;
        }
        if (performance.now() > displayHelloDeadline) {
          if (displayHelloTimer !== undefined) window.clearInterval(displayHelloTimer);
          displayHelloTimer = undefined;
          return;
        }
        try { sendToDisplay({ type: 'hello' }); } catch {}
      }, 300);
    } catch (e) {
      const msg = (e as any)?.message ?? e;
      setStatus && setStatus('Unable to open display window: ' + msg);
    }
  }

  function closeDisplay(): void {
    try { if (displayWin && !displayWin.closed) displayWin.close(); } catch {}
    displayWin = null; displayReady = false; try { window.__tpDisplayWindow = null; } catch {}
    const closeDisplayBtn2 = (window.$id && window.$id('closeDisplayBtn')) || document.getElementById('closeDisplayBtn');
    if (closeDisplayBtn2) (closeDisplayBtn2 as HTMLButtonElement).disabled = true;
    const chip2 = (window.$id && window.$id('displayChip')) || document.getElementById('displayChip');
    if (chip2) chip2.textContent = 'Display: closed';
    try { window.tpArmWatchdog && window.tpArmWatchdog(false); } catch {}
    try { window.dispatchEvent(new CustomEvent('tp:display:closed')); } catch {}
  }

  function sendToDisplay(payload: DisplayPayload): void {
    try {
      if (!displayWin || displayWin.closed) return;
      if (payload && payload.type === 'scroll') {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const seq = (window.__tpScrollSeq ||= 0) + 1; window.__tpScrollSeq = seq;
        payload = { ...payload, seq, ts: now };
      }
      displayWin.postMessage(payload, '*');
    } catch {}
  }

  // message handler must be attached by the main runtime; provide helper to process incoming messages
  function handleMessage(e: MessageEvent): void {
    try {
      if (!displayWin || e.source !== displayWin) return;
      if (e.data === 'DISPLAY_READY' || e.data?.type === 'display-ready') {
    displayReady = true; if (displayHelloTimer !== undefined) { window.clearInterval(displayHelloTimer); displayHelloTimer = undefined; }
    const chip3 = (window.$id && window.$id('displayChip')) || document.getElementById('displayChip'); if (chip3) chip3.textContent = 'Display: ready';
    try { const btn = (window.$id && window.$id('closeDisplayBtn')) || document.getElementById('closeDisplayBtn'); if (btn) (btn as HTMLButtonElement).disabled = false; } catch {}
        // send initial render
        try {
          const fontSize = (document.getElementById('fontSize') as HTMLInputElement | null)?.value;
          const lineHeight = (document.getElementById('lineHeight') as HTMLInputElement | null)?.value;
          sendToDisplay({ type: 'render', html: document.getElementById('script')?.innerHTML, fontSize, lineHeight });
        } catch {}
        try { window.dispatchEvent(new CustomEvent('tp:display:opened')); } catch {}
      }
    } catch {}
  }

  try { window.__tpDisplay = window.__tpDisplay || {}; window.__tpDisplay.openDisplay = openDisplay; window.__tpDisplay.closeDisplay = closeDisplay; window.__tpDisplay.sendToDisplay = sendToDisplay; window.__tpDisplay.handleMessage = handleMessage; } catch {}
})();
