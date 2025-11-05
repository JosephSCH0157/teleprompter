// Dev-only HUD line for recorder stats (mirrors asr:stats compact line)
(() => {
  try {
    const isDev = (() => {
      try { return window.__TP_DEV || /([?#]).*dev=1/.test(location.href) || localStorage.getItem('tp_dev_mode') === '1'; } catch { return false; }
    })();
    if (!isDev || !window || !window.addEventListener) return;

    function ensureHudRoot(){
      try {
        let r = document.getElementById('hud-root');
        if (!r) {
          r = document.createElement('div');
          r.id = 'hud-root';
          r.className = 'hud-root hidden';
          r.setAttribute('aria-hidden','true');
          r.setAttribute('inert','');
          document.body.appendChild(r);
        }
        return r;
      } catch { return null; }
    }

    const root = ensureHudRoot(); if (!root) return;
    let line = document.getElementById('recStatsHud');
    if (!line) {
      line = document.createElement('div');
      line.id = 'recStatsHud';
      line.style.cssText = 'font:12px/1.3 system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#bcd;opacity:.9;margin:4px 0;pointer-events:none;';
      root.appendChild(line);
      // Try to reveal HUD in dev
      try { root.classList.remove('hidden'); root.removeAttribute('aria-hidden'); root.removeAttribute('inert'); } catch {}
    }

    const fmt = (x) => {
      try { return (x == null || !isFinite(x)) ? '–' : String(Math.round(Number(x))); } catch { return '–'; }
    };

    window.addEventListener('rec:stats', (e) => {
      try {
        const d = (e && e.detail) || {};
        const starts = d.starts || 0;
        const retries = d.retries || 0;
        const fallbacks = d.fallbacks || 0;
        const disc = d.disconnects || 0;
        const p95s = fmt(d.startP95Ms);
        const p95e = fmt(d.stopP95Ms);
        line.textContent = `REC starts ${starts} • retry ${retries} • fallback ${fallbacks} • dc ${disc} • p95 start ${p95s}ms • p95 stop ${p95e}ms`;
      } catch {}
    }, { passive: true });
  } catch {}
})();

export {};
