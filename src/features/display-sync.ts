export type DisplaySnapshot = {
  kind: 'tp:script';
  source: 'main' | 'display';
  version: number;
  textHash: string;
  text?: string;            // full payload only on changes (we'll send HTML markup for display)
  anchorRatio?: number;     // 0..1
};

export type DisplaySyncOpts = {
  getText: () => string;           // current script markup (HTML) or raw text
  getAnchorRatio?: () => number;   // where the marker sits (0..1)
  onApplyRemote?: (_text: string, _snap?: DisplaySnapshot) => void; // display window apply
  getDisplayWindow?: () => Window | null;  // opener/child tracker
  channelName?: string;            // default 'tp_display'
};

export function installDisplaySync(opts: DisplaySyncOpts) {
  const chanName = opts.channelName ?? 'tp_display';
  let chan: BroadcastChannel | null = null;
  try { chan = new BroadcastChannel(chanName); } catch { chan = null; }

  let ver = 0;
  let lastHash = '';
  let scheduled = false;

  const safeHash = (s: string) => {
    // tiny FNV-1a (uint32)
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      // h *= 16777619; via shifts to stay in 32-bit
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return (h >>> 0).toString(16);
  };

  const post = (snap: DisplaySnapshot) => {
    // BroadcastChannel (fast) + postMessage (display window fallback)
    try { chan?.postMessage(snap as any); } catch {}
    try { const w = opts.getDisplayWindow?.(); w?.postMessage?.(snap, '*'); } catch {}
  };

  const schedulePush = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      try {
        const text = opts.getText?.() ?? '';
        const hash = safeHash(text);
        const anchor = opts.getAnchorRatio?.();
        if (hash === lastHash) {
          // still let the display know anchor moved (no heavy payload)
          post({ kind: 'tp:script', source: 'main', version: ver, textHash: hash, anchorRatio: anchor });
          return;
        }
        lastHash = hash;
        ver++;
        post({ kind: 'tp:script', source: 'main', version: ver, textHash: hash, text, anchorRatio: anchor });
      } catch {}
    });
  };

  // MAIN window: listen for editor/script change events
  const onLocalChange = () => schedulePush();
  window.addEventListener('tp:scriptChanged', onLocalChange as any);
  window.addEventListener('tp:anchorChanged', onLocalChange as any);

  // DISPLAY window: accept updates (if used in display context too)
  const onMsg = (evt: MessageEvent<DisplaySnapshot>) => {
    try {
      const msg = evt.data as any as DisplaySnapshot;
      if (!msg || msg.kind !== 'tp:script' || msg.source === 'display') return;
      if (msg.text && typeof opts.onApplyRemote === 'function') {
        opts.onApplyRemote(msg.text, msg);
      }
      // optional: use msg.anchorRatio to adjust scroll externally
    } catch {}
  };
  const onChan = (e: MessageEvent) => {
    try { onMsg({ data: e.data } as any); } catch {}
  };

  try { window.addEventListener('message', onMsg as any); } catch {}
  try { chan?.addEventListener('message', onChan as any); } catch {}

  // initial push
  try { schedulePush(); } catch {}

  return () => {
    try { window.removeEventListener('tp:scriptChanged', onLocalChange as any); } catch {}
    try { window.removeEventListener('tp:anchorChanged', onLocalChange as any); } catch {}
    try { window.removeEventListener('message', onMsg as any); } catch {}
    try { chan?.removeEventListener('message', onChan as any); } catch {}
    try { chan?.close(); } catch {}
  };
}

export default installDisplaySync;
