let displayCh: BroadcastChannel | null = null;

function getDisplayChannel(): BroadcastChannel | null {
  if (displayCh) return displayCh;
  try {
    displayCh = new BroadcastChannel('tp_display');
  } catch (err) {
    try { console.warn('[display-sync] BroadcastChannel tp_display failed', err); } catch {}
    displayCh = null;
  }
  return displayCh;
}

export function pushDisplaySnapshot(text: string): void {
  if (typeof window !== 'undefined' && (window as any).__TP_FORCE_DISPLAY) {
    return; // do not echo from the display window itself
  }
  const payload = {
    kind: 'tp:script',
    source: 'main',
    text: text || '',
    textHash: String(text?.length || 0) + ':' + (text?.slice?.(0, 32) || ''),
  };

  const ch = getDisplayChannel();
  if (ch) {
    try {
      ch.postMessage(payload as any);
    } catch (err) {
      try { console.warn('[display-sync] failed to post tp_display', err); } catch {}
    }
  }

  // Legacy fallback for display.html postMessage listener
  try { window.postMessage(payload as any, '*'); } catch {}
}

export type RecordState = 'idle' | 'armed' | 'recording';

export function pushDisplayRecordState(state: RecordState): void {
  const payload = { kind: 'tp:record', state };
  const ch = getDisplayChannel();
  if (ch) {
    try { ch.postMessage(payload as any); } catch {}
  }
  try {
    const w = (window as any).__tpDisplayWindow as Window | null;
    if (w && !w.closed) w.postMessage(payload as any, '*');
  } catch {}
}

export type DisplaySyncOpts = {
  getText: () => string;
  getAnchorRatio?: () => number;
  onApplyRemote?: (_text: string) => void;
  getDisplayWindow?: () => Window | null;
  channelName?: string;
};

export function installDisplaySync(opts: DisplaySyncOpts): () => void {
  const chanName = opts.channelName || 'tp_display';
  let chan: BroadcastChannel | null = null;
  const isRequester = typeof opts.onApplyRemote === 'function';
  const isResponder = !isRequester;
  const isDisplay = typeof window !== 'undefined' && (window as any).__TP_FORCE_DISPLAY === true;
  try {
    chan = new BroadcastChannel(chanName);
  } catch (err) {
    try { console.warn('[display-sync] failed to open channel', err); } catch {}
    chan = null;
  }

  const onMsg = (ev: MessageEvent) => {
    try {
      const msg = ev?.data || {};
      // Display window asks for a fresh snapshot
      if ((msg?.kind === 'tp:script:request' || msg?.type === 'tp:script:request' || msg?.request === 'snapshot') && isResponder) {
        try { push(); } catch {}
        return;
      }
      if (!msg || msg.kind !== 'tp:script') return;
      // Display should only hydrate from main-origin snapshots
      if (isDisplay && msg.source && msg.source !== 'main') return;
      if (typeof msg.text === 'string' && typeof opts.onApplyRemote === 'function') {
        opts.onApplyRemote(msg.text);
      }
    } catch {}
  };

  try { chan?.addEventListener('message', onMsg as any); } catch {}

  const push = () => {
    if (isDisplay) return; // display is receive-only to avoid loops
    try {
      const text = opts.getText?.() || '';
      const anchor = opts.getAnchorRatio?.();
      const payload = {
        kind: 'tp:script',
        source: 'main',
        text,
        anchorRatio: anchor,
        textHash: String(text?.length || 0) + ':' + (text?.slice?.(0, 32) || ''),
      };
      try { chan?.postMessage(payload as any); } catch {}
      try { opts.getDisplayWindow?.()?.postMessage?.(payload as any, '*'); } catch {}
    } catch {}
  };

  if (!isDisplay) {
    try { window.addEventListener('tp:scriptChanged', push as any); } catch {}
    try { push(); } catch {}
  }

  // Display side: immediately request the latest snapshot so late-opened display windows hydrate
  try {
    if (isRequester && isDisplay) {
      chan?.postMessage({ kind: 'tp:script:request', from: 'display', ts: Date.now() } as any);
    }
  } catch {}

  return () => {
    try { window.removeEventListener('tp:scriptChanged', push as any); } catch {}
    try { chan?.removeEventListener('message', onMsg as any); } catch {}
    try { chan?.close(); } catch {}
  };
}
