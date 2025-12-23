export type HudBridgeMsg =
  | { type: 'hud:hello'; from: 'main' | 'popout' }
  | { type: 'hud:requestSync' }
  | { type: 'hud:state'; state: HudState }
  | { type: 'hud:append'; lines: string[] }
  | { type: 'hud:snapshot'; text: string }
  | { type: 'hud:clear' }
  | { type: 'hud:setFrozen'; frozen: boolean }
  | { type: 'hud:copy'; text: string };

export type HudState = {
  open: boolean;
  frozen: boolean;
  popout: boolean;
  x: number;
  y: number;
};

type Listener = (msg: HudBridgeMsg) => void;

export function createHudBridge(channelName = 'tp_hud_bridge') {
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;
  const listeners = new Set<Listener>();

  const emit = (raw: any) => {
    if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string') return;
    listeners.forEach((fn) => fn(raw as HudBridgeMsg));
  };

  if (bc) {
    bc.onmessage = (ev) => emit(ev.data);
  }

  const onWinMessage = (ev: MessageEvent) => {
    emit(ev.data);
  };
  window.addEventListener('message', onWinMessage);

  const send = (msg: HudBridgeMsg) => {
    if (bc) {
      bc.postMessage(msg);
    } else {
      try { window.opener?.postMessage(msg, '*'); } catch {}
      try { (window as any).__tpHudPopoutWin?.postMessage(msg, '*'); } catch {}
    }
  };

  const on = (fn: Listener) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  const close = () => {
    try { bc?.close(); } catch {}
    window.removeEventListener('message', onWinMessage);
    listeners.clear();
  };

  return { send, on, close };
}
