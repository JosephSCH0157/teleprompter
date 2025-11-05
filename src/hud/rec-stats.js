// dev-only HUD line for recorder stats (mirrors asr:stats HUD style)
(() => {
  try {
    const isDev = (() => {
      try {
        if (window.__TP_DEV) return true;
        if (/([?#]).*dev=1/.test(location.href)) return true;
        return localStorage.getItem('tp_dev_mode') === '1';
      } catch { return false; }
    })();
    if (!isDev || typeof window === 'undefined' || !window.addEventListener) return;

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

    function install(){
      const root = ensureHudRoot();
      if (!root) return;
      let line = document.getElementById('recStatsHud');
      if (!line) {
        line = document.createElement('div');
        line.id = 'recStatsHud';
        line.style.cssText = 'font:12px/1.3 system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#9fb4c9;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 8px;margin:4px 0;max-width:360px;';
        const strong = document.createElement('strong');
        strong.textContent = 'REC';
        strong.style.marginRight = '6px';
        line.appendChild(strong);
        const span = document.createElement('span');
        span.id = 'recStatsText';
        span.textContent = '—';
        line.appendChild(span);
        root.appendChild(line);
        try {
          root.classList.remove('hidden');
          root.removeAttribute('aria-hidden');
          root.removeAttribute('inert');
        } catch {}
      }
      const textEl = document.getElementById('recStatsText');
      const fmt = (v) => {
        try { return (typeof v === 'number' && isFinite(v)) ? String(Math.round(v)) : '–'; } catch { return '–'; }
      };
      window.addEventListener('rec:stats', (e) => {
        try {
          const d = (e && e.detail) || {};
          const msg = `starts ${d.starts|0} • retry ${d.retries|0} • fallback ${d.fallbacks|0} • dc ${d.disconnects|0} • p95 start ${fmt(d.startP95Ms)}ms • p95 stop ${fmt(d.stopP95Ms)}ms`;
          if (textEl) textEl.textContent = msg;
        } catch {}
      });
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') install();
    else document.addEventListener('DOMContentLoaded', install);
  } catch {}
})();

export {};
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

export { };

