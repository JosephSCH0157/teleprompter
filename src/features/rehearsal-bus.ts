// src/features/rehearsal-bus.ts
export type RehearsalEvent = { type: 'rehearsal'; on: boolean; ts: number };

let chan: BroadcastChannel | null = null;
function ch(): BroadcastChannel | null {
  if (chan) return chan;
  try { chan = new BroadcastChannel('tp_rehearsal'); } catch { chan = null; }
  return chan;
}

export function broadcastRehearsal(on: boolean) {
  const msg: RehearsalEvent = { type: 'rehearsal', on, ts: Date.now() };

  // 1) DOM CustomEvent (same-window listeners)
  try {
    const ev = new CustomEvent(`tp:rehearsal:${on ? 'start' : 'stop'}`, { detail: msg });
    window.dispatchEvent(ev);
  } catch {}

  // 2) BroadcastChannel (tabs/windows)
  try { ch()?.postMessage(msg); } catch {}

  // 3) postMessage to opener/children (display window, if any)
  try { (window as any).opener?.postMessage(msg, '*'); } catch {}
  try {
    const framesArr: any[] = Array.from((window as any).frames ?? []);
    for (const w of framesArr) {
      try { w?.postMessage?.(msg, '*'); } catch {}
    }
  } catch {}
}

export function attachRehearsalListeners(handler: (_on: boolean) => void) {
  // DOM
  const onStart = () => handler(true);
  const onStop  = () => handler(false);
  window.addEventListener('tp:rehearsal:start', onStart);
  window.addEventListener('tp:rehearsal:stop',  onStop);

  // BroadcastChannel
  const bc = ch();
  const onBc = (e: MessageEvent<RehearsalEvent>) => {
    if (e?.data?.type === 'rehearsal') handler(!!e.data.on);
  };
  bc?.addEventListener?.('message', onBc);

  // postMessage (window-to-window)
  const onPm = (e: MessageEvent) => {
    const d: any = e?.data;
    if (d && d.type === 'rehearsal') handler(!!d.on);
  };
  window.addEventListener('message', onPm);

  // Return an unsubscribe
  return () => {
    window.removeEventListener('tp:rehearsal:start', onStart);
    window.removeEventListener('tp:rehearsal:stop',  onStop);
    bc?.removeEventListener?.('message', onBc);
    window.removeEventListener('message', onPm);
  };
}
