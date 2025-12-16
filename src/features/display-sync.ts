// Single source of truth: BroadcastChannel transport for raw script text only
let displayCh: BroadcastChannel | null = null;
let lastPayloadKey = '';
let rev = 0;
let latestRaw = '';

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

function makeKey(raw: string): string {
  const text = String(raw || '');
  return `${text.length}:${text.slice(0, 64)}`;
}

export type DisplayScriptPayload = {
  type: 'tp:script';
  kind: 'tp:script';
  source: string;
  rawText: string;
  rev: number;
  textHash: string;
};

export function publishDisplayScript(rawText: string, opts?: { force?: boolean; source?: string }): void {
  if (typeof window !== 'undefined' && (window as any).__TP_FORCE_DISPLAY) return; // display is receive-only
  const w = typeof window !== 'undefined' ? (window as any) : {};
  if (w.__TP_PUBLISHING_DISPLAY) return; // reentrancy guard to break feedback loops
  w.__TP_PUBLISHING_DISPLAY = true;

  try {
    const text = String(rawText || '');
    const trimmed = text.trim();
    if (!trimmed) return;

    const key = makeKey(text);
    if (!opts?.force && key === lastPayloadKey) return;
    lastPayloadKey = key;
    latestRaw = text;
    rev += 1;
    try {
      console.log('[publishDisplayScript]', { rev, len: text.length });
    } catch {}

    const payload: DisplayScriptPayload = {
      type: 'tp:script',
      kind: 'tp:script',
      source: opts?.source ?? 'main',
      rawText: text,
      rev,
      textHash: key,
    };

    const ch = getDisplayChannel();
    if (ch) {
      try { ch.postMessage(payload as any); } catch (err) { try { console.warn('[display-sync] failed to post tp_display', err); } catch {} }
    }
  } finally {
    w.__TP_PUBLISHING_DISPLAY = false;
  }
}

export function getLatestRawScript(): string {
  return latestRaw;
}

export type RecordState = 'idle' | 'armed' | 'recording';

export function pushDisplayRecordState(state: RecordState): void {
  const payload = { kind: 'tp:record', state };
  const ch = getDisplayChannel();
  if (ch) {
    try { ch.postMessage(payload as any); } catch {}
  }
}

export type DisplaySyncOpts = {
  getText: () => string;
  onApplyRemote?: (_text: string) => void;
  channelName?: string;
};

// One transport: BroadcastChannel ('tp_display') for raw text + handshake
export function installDisplaySync(opts: DisplaySyncOpts): () => void {
  const chanName = opts.channelName || 'tp_display';
  let chan: BroadcastChannel | null = null;
  const isDisplay = typeof window !== 'undefined' && (window as any).__TP_FORCE_DISPLAY === true;
  let lastSeenRev = 0;

  // Dev-only duplication tripwire: count installs to catch double wiring
  try {
    const w = window as any;
    w.__TP_INSTALL_DISPLAY_SYNC = (w.__TP_INSTALL_DISPLAY_SYNC || 0) + 1;
    if (w.__TP_INSTALL_DISPLAY_SYNC > 1 && (w.__TP_DEV || w.__TP_DEV1)) {
      console.warn('[display-sync] installDisplaySync called multiple times', w.__TP_INSTALL_DISPLAY_SYNC);
      try { console.trace('[display-sync] install stack'); } catch {}
    }
  } catch {}

  try {
    chan = new BroadcastChannel(chanName);
  } catch (err) {
    try { console.warn('[display-sync] failed to open channel', err); } catch {}
    chan = null;
  }

  const push = (force?: boolean) => {
    if (isDisplay) return;
    try { publishDisplayScript(opts.getText?.() || latestRaw || '', { force }); } catch {}
  };

  const onMsg = (ev: MessageEvent) => {
    try {
      const msg = ev?.data || {};
      if (msg?.type === 'display:hello' && !isDisplay) {
        push(true);
        return;
      }
      if (!isDisplay) return;
      if (!msg || msg.type !== 'tp:script' || typeof msg.rawText !== 'string') return;
      const incomingRev = typeof msg.rev === 'number' ? msg.rev : 0;
      if (incomingRev && incomingRev <= lastSeenRev) return;
      lastSeenRev = incomingRev || lastSeenRev;
      if (typeof opts.onApplyRemote === 'function') {
        opts.onApplyRemote(msg.rawText);
      }
    } catch {}
  };

  try { chan?.addEventListener('message', onMsg as any); } catch {}

  if (isDisplay) {
    try { chan?.postMessage({ type: 'display:hello', ts: Date.now() }); } catch {}
  } else {
    try { window.addEventListener('tp:scriptChanged', push as any); } catch {}
    try { push(); } catch {}
  }

  return () => {
    try { window.removeEventListener('tp:scriptChanged', push as any); } catch {}
    try { chan?.removeEventListener('message', onMsg as any); } catch {}
    try { chan?.close(); } catch {}
  };
}
