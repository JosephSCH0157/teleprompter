// src/features/rehearsal/rehearsal-bus.ts
// Broadcast + cross-window synchronization for Rehearsal Mode.

let chan: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (chan) return chan;
  try {
    chan = new BroadcastChannel('tp_rehearsal');
  } catch {
    chan = null;
  }
  return chan;
}

export interface RehearsalMessage {
  type: 'rehearsal';
  on: boolean;
  ts: number;
}

/**
 * Broadcast a rehearsal on/off event across:
 * 1) DOM CustomEvent
 * 2) BroadcastChannel
 * 3) window.postMessage (opener + child frames)
 */
export function broadcastRehearsal(on: boolean): void {
  const msg: RehearsalMessage = {
    type: 'rehearsal',
    on,
    ts: Date.now(),
  };

  // 1) DOM CustomEvent (same-window listeners)
  try {
    const ev = new CustomEvent(`tp:rehearsal:${on ? 'start' : 'stop'}`, {
      detail: msg,
    });
    window.dispatchEvent(ev);
  } catch {
    // ignore
  }

  // 2) BroadcastChannel (tabs/windows)
  try {
    getChannel()?.postMessage(msg);
  } catch {
    // ignore
  }

  // 3) postMessage to opener/children (display window, if any)
  try {
    (window as any).opener?.postMessage(msg, '*');
  } catch {
    // ignore
  }

  try {
    const framesArr = Array.from((window as any).frames ?? []);
    for (const w of framesArr as any[]) {
      try {
        (w as any)?.postMessage?.(msg, '*');
      } catch {
        // ignore individual frame errors
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Attach listeners that keep a local handler in sync with:
 * - DOM CustomEvents
 * - BroadcastChannel
 * - window.postMessage
 *
 * Returns an unsubscribe function.
 */
export function attachRehearsalListeners(
  handler: (on: boolean) => void,
): () => void {
  // DOM CustomEvents
  const onStart = () => handler(true);
  const onStop = () => handler(false);

  window.addEventListener('tp:rehearsal:start', onStart);
  window.addEventListener('tp:rehearsal:stop', onStop);

  // BroadcastChannel
  const bc = getChannel();
  const onBc = (e: MessageEvent) => {
    const data = (e?.data ?? {}) as Partial<RehearsalMessage>;
    if (data.type === 'rehearsal') {
      handler(!!data.on);
    }
  };
  (bc as any)?.addEventListener?.('message', onBc as any);

  // window.postMessage
  const onPm = (e: MessageEvent) => {
    const d = e?.data as Partial<RehearsalMessage> | undefined;
    if (d && d.type === 'rehearsal') {
      handler(!!d.on);
    }
  };
  window.addEventListener('message', onPm);

  // Unsubscribe
  return () => {
    try {
      window.removeEventListener('tp:rehearsal:start', onStart);
      window.removeEventListener('tp:rehearsal:stop', onStop);
    } catch {
      /* ignore */
    }
    try {
      (bc as any)?.removeEventListener?.('message', onBc as any);
    } catch {
      /* ignore */
    }
    try {
      window.removeEventListener('message', onPm);
    } catch {
      /* ignore */
    }
  };
}
