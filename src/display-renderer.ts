import { renderScript } from './render-script';

try {
  if (typeof window.renderScript !== 'function') {
    (window as any).renderScript = renderScript;
  }
} catch {}
try {
  (window as any).__TP_RENDER_SCRIPT_READY = true;
} catch {}
try {
  document.dispatchEvent(new CustomEvent('tp:renderScriptReady', { detail: { ready: true } }));
} catch {}
