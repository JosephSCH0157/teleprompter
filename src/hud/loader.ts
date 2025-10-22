export function loadHudIfDev() {
  try {
    const params = new URLSearchParams(location.search);
    const dev = (window as any).__TP_DEV || params.get('dev') === '1';
    if (!dev) return;
    // simple HUD attach for dev: log boot trace periodically
    const el = document.createElement('div');
    el.id = 'tp-dev-hud';
    el.style.position = 'fixed'; el.style.right = '8px'; el.style.bottom = '8px'; el.style.background = 'rgba(0,0,0,0.6)'; el.style.color = 'white'; el.style.padding = '6px'; el.style.zIndex = '9999';
    el.textContent = 'HUD (dev)';
    document.body.appendChild(el);
  } catch {}
}

// Auto-run if dev
try { loadHudIfDev(); } catch {}

export {};
