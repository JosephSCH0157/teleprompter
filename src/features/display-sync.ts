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
  source: 'main';
  rawText: string;
  rev: number;
  textHash: string;
};

export function publishDisplayScript(rawText: string, opts?: { force?: boolean }): void {
  if (typeof window !== 'undefined' && (window as any).__TP_FORCE_DISPLAY) return; // display is receive-only
  const text = String(rawText || '');
  const trimmed = text.trim();
  if (!trimmed) return;

  const key = makeKey(text);
  if (!opts?.force && key === lastPayloadKey) return;
  lastPayloadKey = key;
  latestRaw = text;
  rev += 1;

  const payload: DisplayScriptPayload = {
    type: 'tp:script',
    kind: 'tp:script',
    source: 'main',
    rawText: text,
    rev,
    textHash: key,
  };

  const ch = getDisplayChannel();
  if (ch) {
    try { ch.postMessage(payload as any); } catch (err) { try { console.warn('[display-sync] failed to post tp_display', err); } catch {} }
  }
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
