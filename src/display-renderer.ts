import { renderScript } from './render-script';

try {
  if (typeof window.renderScript !== 'function') {
    (window as any).renderScript = renderScript;
  }
} catch {}
