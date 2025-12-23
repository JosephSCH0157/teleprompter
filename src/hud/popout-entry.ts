import { createHudBridge } from './bridge';
import { initHudPopup } from './popup';

export function initHudPopout() {
  (window as any).__TP_HUD_POPOUT__ = true;
  const popup = initHudPopup({ popout: true });
  (window as any).__tpHudPopup = popup;

  const bridge = createHudBridge();
  bridge.send({ type: 'hud:hello', from: 'popout' });
  bridge.send({ type: 'hud:requestSync' });

  window.addEventListener('beforeunload', () => {
    try { bridge.close(); } catch {}
  });
}
